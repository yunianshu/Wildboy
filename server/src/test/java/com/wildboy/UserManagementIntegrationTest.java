package com.wildboy;

import static com.wildboy.Models.*;
import static com.wildboy.UserModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"wildboy.admin.username=", "wildboy.admin.password-hash="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UserManagementIntegrationTest {
  static final EmbeddedPostgres pg;
  static final String PASSWORD = "Synthetic-role-admin-123";
  static final String HASH = new BCryptPasswordEncoder(12).encode(PASSWORD);
  static {
    try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); }
  }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres"); r.add("spring.datasource.password", () -> "");
    r.add("wildboy.notifications.scan-ms", () -> 3600000);
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
    r.add("wildboy.identity.encryption-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
  }
  @Autowired JdbcTemplate db;
  @Autowired AuthService auth;
  @Autowired UserService users;
  @Autowired ActivityService activities;
  @Autowired LegalService legal;
  @Autowired ObjectMapper json;
  @Autowired MockMvc mvc;
  @Autowired PlatformTransactionManager manager;
  Login admin;

  @BeforeEach void setup() {
    db.execute("TRUNCATE app_user,product,activity,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("INSERT INTO admin_account_configuration(id) VALUES(1)");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for (var kind : LegalModels.Kind.values()) {
      var draft = legal.save(kind, new LegalModels.DraftInput("Fixture " + kind,
          "Synthetic policy for local user contract tests.", 0L), "fixture");
      legal.publish(kind, draft.draft().revision(), "fixture");
    }
    var passwordUser = auth.user("admin:role-fixture", "Password administrator", "ADMIN");
    db.update("UPDATE admin_account_configuration SET username='role-fixture',password_hash=?,admin_user_id=?,configured_at=CURRENT_TIMESTAMP WHERE id=1", HASH, passwordUser.id());
    admin = auth.admin("role-fixture", PASSWORD);
  }
  String bearer(Login login) { return "Bearer " + login.token(); }
  Login verified() {
    // This invokes the post-provider-success boundary with a synthetic identity; no WeChat call.
    return auth.finishWechat("role-fixture-" + UUID.randomUUID(), 1L, 1L);
  }
  User complete(User user) {
    return users.updateProfile(user, new ProfileInput("张三测试", "13800000000", 1L, 1L));
  }
  ResultActions role(Login actor, User target, String role, long version) throws Exception {
    return mvc.perform(put("/api/v1/admin/users/" + target.id() + "/role")
        .header("Authorization", bearer(actor)).contentType("application/json")
        .content(json.writeValueAsString(Map.of("role", role, "version", version))));
  }
  Activity activity(boolean identity) {
    var start = OffsetDateTime.now().plusDays(2);
    var a = activities.create(new ActivityInput("Local user fixture", Category.WEEKLY, "/assets/hiking.jpg",
        List.of(), "Fixture", "Fixture details", "Local", "Gate", start, start.plusHours(2),
        start.minusHours(1), 5, 0, null, identity), admin.user().id());
    return activities.publish(a.id(), a.version(), admin.user().id());
  }
  RegistrationInput input(boolean identity) {
    return new RegistrationInput(List.of(new ParticipantInput("李四测试",
        identity ? "11010519491231002X" : "", "13900000000")), 1L, 1L);
  }
  void audit(String id, String action, int count) {
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action=?",
        Integer.class, id, action)).isEqualTo(count);
  }

  @Test void profileIsOwnedValidatedAndRequiresCurrentConsentWithoutCollectingAvatar() throws Exception {
    var owner = verified();
    mvc.perform(put("/api/v1/me/profile").contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(put("/api/v1/me/profile").header("Authorization", bearer(owner)).contentType("application/json")
        .content("{\"realName\":\"张三测试\",\"phone\":\"13800000000\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(owner.user().id()))
        .andExpect(jsonPath("$.realName").value("张三测试")).andExpect(jsonPath("$.phone").value("13800000000"))
        .andExpect(jsonPath("$.profileCompleted").value(true)).andExpect(jsonPath("$.version").value(0))
        .andExpect(jsonPath("$.accountSource").value("WECHAT")).andExpect(jsonPath("$.wechatVerified").value(true));
    mvc.perform(put("/api/v1/me/profile").header("Authorization", bearer(owner)).contentType("application/json")
        .content("{\"realName\":\"A\",\"phone\":\"13800000000\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROFILE_NAME"));
    mvc.perform(put("/api/v1/me/profile").header("Authorization", bearer(owner)).contentType("application/json")
        .content("{\"realName\":\"张三\",\"phone\":\"invalid\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isBadRequest());
    mvc.perform(put("/api/v1/me/profile").header("Authorization", bearer(owner)).contentType("application/json")
        .content("{\"realName\":\"张三\",\"phone\":\"13800000000\",\"privacyVersion\":1,\"termsVersion\":1,\"role\":\"ADMIN\",\"wechatVerified\":true}"))
        .andExpect(status().isBadRequest());
    assertThat(auth.byId(owner.user().id()).role()).isEqualTo("USER");
    assertThat(auth.byId(admin.user().id()).profileCompleted()).isFalse();
    audit(owner.user().id(), "USER_PROFILE_UPDATE", 1);
  }

  @Test void profileAndRegistrationSupportWechatAdminButRejectPasswordAdminAndUnexpectedIdentity() throws Exception {
    var owner = verified(); var a = activity(false);
    assertThatThrownBy(() -> activities.register(a.id(), owner.user().id(), input(false)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("USER_PROFILE_REQUIRED"));
    role(admin, owner.user(), "ADMIN", 0).andExpect(status().isOk());
    var refreshed = auth.finishWechat(db.queryForObject("SELECT substring(external_id from 8) FROM app_user WHERE id=?", String.class, owner.user().id()), 1L, 1L);
    var contact = complete(refreshed.user());
    assertThat(contact.role()).isEqualTo("ADMIN"); assertThat(contact.version()).isEqualTo(1);
    assertThat(activities.register(a.id(), contact.id(), input(false)).created()).isTrue();
    assertThatThrownBy(() -> activities.register(activity(false).id(), contact.id(), input(true)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("IDENTITY_NOT_REQUIRED"));
    assertThatThrownBy(() -> users.updateProfile(admin.user(), new ProfileInput("管理员", "13800000000", 1L, 1L)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status).isEqualTo(403));
    var demo = complete(auth.user("dev:USER", "Demo", "USER"));
    assertThat(activities.register(a.id(), demo.id(), input(false)).created()).isTrue();
  }

  @Test void registrationUsesTheLoggedInAccountAndOnlyCollectsIdentityWhenRequired() {
    var owner = verified(); complete(owner.user()); var a = activity(true);
    assertThatThrownBy(() -> activities.register(a.id(), owner.user().id(), input(false)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("INVALID_ID_NUMBER"));
    var registration = activities.register(a.id(), owner.user().id(), input(true)).registration();
    assertThat(db.queryForObject("SELECT user_id FROM registration WHERE id=?", String.class, registration.id())).isEqualTo(owner.user().id());
    assertThat(db.queryForObject("SELECT id_number FROM registration_participant WHERE registration_id=?", String.class, registration.id()))
        .doesNotContain("11010519491231002X");
    assertThat(auth.byId(owner.user().id()).realName()).isEqualTo("张三测试");
  }

  @Test void adminListIncludesAllSourcesAndRolesWithServerSideFiltersAndDefaultMasks() throws Exception {
    var owner = verified(); complete(owner.user());
    role(admin, owner.user(), "ADMIN", 0).andExpect(status().isOk());
    auth.user("dev:viewer", "Demo", "USER"); auth.user("smoke:viewer", "Smoke", "USER");
    auth.user("legacy:viewer", "Legacy", "USER");
    mvc.perform(get("/api/v1/admin/users?role=ADMIN&accountSource=WECHAT&profile=COMPLETE&size=1")
        .header("Authorization", bearer(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(owner.user().id())).andExpect(jsonPath("$.items[0].role").value("ADMIN"))
        .andExpect(jsonPath("$.items[0].realName").value("张***")).andExpect(jsonPath("$.items[0].phone").value("138****0000"))
        .andExpect(jsonPath("$.items[0].version").value(1)).andExpect(jsonPath("$.items[0].canChangeRole").value(true))
        .andExpect(jsonPath("$.items[0].externalId").doesNotExist()).andExpect(jsonPath("$.items[0].openid").doesNotExist());
    mvc.perform(get("/api/v1/admin/users?accountSource=DEMO").header("Authorization", bearer(admin)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
    mvc.perform(get("/api/v1/admin/users?query=张三").header("Authorization", bearer(admin)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    mvc.perform(get("/api/v1/admin/users").header("Authorization", bearer(admin)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(5));
  }

  @Test void adminDetailMasksParticipantNamesPhonesAndIdentitiesAndIncludesPromotedUsers() throws Exception {
    var owner = verified(); complete(owner.user()); var a = activity(true);
    activities.register(a.id(), owner.user().id(), input(true)); role(admin, owner.user(), "ADMIN", 0).andExpect(status().isOk());
    mvc.perform(get("/api/v1/admin/users/" + owner.user().id()).header("Authorization", bearer(admin)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("ADMIN"))
        .andExpect(jsonPath("$.user.realName").value("张***"))
        .andExpect(jsonPath("$.registrations.items[0].participants[0].participantName").value("李***"))
        .andExpect(jsonPath("$.registrations.items[0].participants[0].phone").value("139****0000"))
        .andExpect(jsonPath("$.registrations.items[0].participants[0].idNumber").value(org.hamcrest.Matchers.not("11010519491231002X")));
  }

  @Test void grantAndRevokeRevokeBothKindsOfSessionAndProviderReloginPreservesIdentityAndProfile() throws Exception {
    var target = verified(); complete(target.user()); String openid = db.queryForObject("SELECT substring(external_id from 8) FROM app_user WHERE id=?", String.class, target.user().id());
    role(admin, target.user(), "ADMIN", 0).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
    mvc.perform(get("/api/v1/me").header("Authorization", bearer(target))).andExpect(status().isUnauthorized());
    var promoted = auth.finishWechat(openid, 1L, 1L);
    assertThat(promoted.user().role()).isEqualTo("ADMIN"); assertThat(promoted.user().id()).isEqualTo(target.user().id());
    assertThat(promoted.user().realName()).isEqualTo("张三测试");
    mvc.perform(get("/api/v1/admin/shop/products").header("Authorization", bearer(promoted))).andExpect(status().isOk());
    role(admin, target.user(), "USER", 1).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
    mvc.perform(get("/api/v1/admin/shop/products").header("Authorization", bearer(promoted))).andExpect(status().isUnauthorized());
    var demoted = auth.finishWechat(openid, 1L, 1L);
    assertThat(demoted.user().role()).isEqualTo("USER");
    mvc.perform(get("/api/v1/admin/users").header("Authorization", bearer(demoted))).andExpect(status().isForbidden());
    audit(target.user().id(), "USER_ROLE_ADMIN", 1); audit(target.user().id(), "USER_ROLE_USER", 1);
  }

  @ParameterizedTest @CsvSource({"dev:admin", "smoke:admin", "legacy:admin", "wechat:unverified-admin"})
  void untrustedAdminActorsAreReadOnlyForRoleManagement(String external) throws Exception {
    var actor = auth.login(auth.user(external, "Read only role fixture", "ADMIN")); var target = verified();
    mvc.perform(get("/api/v1/admin/users/" + target.user().id()).header("Authorization", bearer(actor)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.user.canChangeRole").value(false))
        .andExpect(jsonPath("$.user.roleChangeBlockReason").value("ROLE_MANAGEMENT_FORBIDDEN"));
    role(actor, target.user(), "ADMIN", 0).andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROLE_MANAGEMENT_FORBIDDEN"));
    assertThat(auth.byId(target.user().id()).version()).isZero(); assertThat(auth.authenticate(target.token())).isNotNull();
  }

  @ParameterizedTest @CsvSource({"admin:other", "dev:target", "smoke:target", "legacy:target", "wechat:unverified-target"})
  void onlyProviderVerifiedWechatTargetsCanChangeRole(String external) throws Exception {
    var target = auth.user(external, "Ineligible fixture", "USER");
    role(admin, target, "ADMIN", 0).andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLE_TARGET_NOT_ELIGIBLE"));
    assertThat(auth.byId(target.id()).role()).isEqualTo("USER"); audit(target.id(), "USER_ROLE_ADMIN", 0);
  }

  @Test void selfChangeStaleVersionAndInvalidRequestCannotMutateRoles() throws Exception {
    role(admin, admin.user(), "USER", 0).andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ROLE_CHANGE_FORBIDDEN"));
    var target = verified();
    role(admin, target.user(), "ADMIN", 5).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_VERSION"));
    mvc.perform(put("/api/v1/admin/users/" + target.user().id() + "/role").header("Authorization", bearer(admin))
        .contentType("application/json").content("{\"role\":\"OWNER\",\"version\":0}")) .andExpect(status().isBadRequest());
    role(target, target.user(), "ADMIN", 0).andExpect(status().isForbidden());
    assertThat(auth.authenticate(admin.token()).role()).isEqualTo("ADMIN");
    assertThat(auth.byId(target.user().id()).role()).isEqualTo("USER");
  }

  @Test void sameRoleAndVersionIsNoOpWithoutRevokingSessionOrDuplicatingAudit() throws Exception {
    var target = verified(); role(admin, target.user(), "USER", 0).andExpect(status().isOk());
    assertThat(auth.authenticate(target.token())).isNotNull();
    assertThat(auth.byId(target.user().id()).version()).isZero(); audit(target.user().id(), "USER_ROLE_USER", 0);
  }

  @Test void concurrentVersionedGrantsApplyExactlyOnce() throws Exception {
    var target = verified();
    try (var pool = Executors.newFixedThreadPool(2)) {
      var jobs = List.<Callable<Integer>>of(
          () -> role(admin, target.user(), "ADMIN", 0).andReturn().getResponse().getStatus(),
          () -> role(admin, target.user(), "ADMIN", 0).andReturn().getResponse().getStatus());
      var statuses = new ArrayList<Integer>(); for (var result : pool.invokeAll(jobs)) statuses.add(result.get(10, TimeUnit.SECONDS));
      assertThat(statuses).containsExactlyInAnyOrder(200, 409);
    }
    assertThat(auth.byId(target.user().id()).version()).isEqualTo(1); audit(target.user().id(), "USER_ROLE_ADMIN", 1);
  }

  @Test void concurrentCrossDemotionCannotRemoveBothAdministrators() throws Exception {
    var first = verified(); var second = verified();
    role(admin, first.user(), "ADMIN", 0).andExpect(status().isOk()); role(admin, second.user(), "ADMIN", 0).andExpect(status().isOk());
    first = auth.login(auth.byId(first.user().id())); second = auth.login(auth.byId(second.user().id()));
    final var a = first; final var b = second;
    try (var pool = Executors.newFixedThreadPool(2)) {
      var jobs = List.<Callable<Integer>>of(
          () -> role(a, b.user(), "USER", 1).andReturn().getResponse().getStatus(),
          () -> role(b, a.user(), "USER", 1).andReturn().getResponse().getStatus());
      var statuses = new ArrayList<Integer>(); for (var result : pool.invokeAll(jobs)) statuses.add(result.get(10, TimeUnit.SECONDS));
      assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
      assertThat(statuses).allMatch(s -> s == 200 || s == 401 || s == 403);
    }
    assertThat(List.of(auth.byId(a.user().id()).role(), auth.byId(b.user().id()).role())).containsExactlyInAnyOrder("ADMIN", "USER");
  }

  @Test void lastRecoverableAdminCannotBeRemovedWhenPasswordLoginHasBecomeUnavailable() throws Exception {
    var target = verified(); role(admin, target.user(), "ADMIN", 0).andExpect(status().isOk());
    db.update("UPDATE admin_account_configuration SET username=NULL,password_hash=NULL,admin_user_id=NULL,configured_at=NULL WHERE id=1");
    role(admin, target.user(), "USER", 1).andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN_REQUIRED"));
    assertThat(auth.byId(target.user().id()).role()).isEqualTo("ADMIN");
  }

  @Test void roleMutationRollsBackRoleVersionAndSessionRevocationIfAuditFails() throws Exception {
    var target = verified();
    db.execute("CREATE FUNCTION fail_role_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='USER_ROLE_ADMIN' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$");
    db.execute("CREATE TRIGGER role_audit_failure BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION fail_role_audit()");
    try {
      assertThatThrownBy(() -> users.changeRole(admin.user(), bearer(admin), target.user().id(), new RoleInput(Role.ADMIN, 0L)))
          .isInstanceOf(RuntimeException.class);
    } finally { db.execute("DROP TRIGGER role_audit_failure ON audit_event"); db.execute("DROP FUNCTION fail_role_audit()"); }
    assertThat(auth.byId(target.user().id()).role()).isEqualTo("USER"); assertThat(auth.byId(target.user().id()).version()).isZero();
    assertThat(auth.authenticate(target.token())).isNotNull();
  }

  @Test void staleOrExpiredActorSnapshotsCannotAuthorizeAnotherRoleMutation() throws Exception {
    var actor = verified(); var target = verified();
    role(admin, actor.user(), "ADMIN", 0).andExpect(status().isOk());
    var prior = auth.login(auth.byId(actor.user().id()));
    role(admin, actor.user(), "USER", 1).andExpect(status().isOk());
    assertThatThrownBy(() -> users.changeRole(prior.user(), bearer(prior), target.user().id(), new RoleInput(Role.ADMIN,0L)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("ROLE_MANAGEMENT_FORBIDDEN"));
    var expired = auth.login(admin.user());
    db.update("UPDATE auth_session SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE token_hash=?", AuthService.hash(expired.token()));
    assertThatThrownBy(() -> users.changeRole(expired.user(), bearer(expired), target.user().id(), new RoleInput(Role.ADMIN,0L)))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("UNAUTHENTICATED"));
    assertThat(auth.byId(target.user().id()).role()).isEqualTo("USER");
    audit(target.user().id(), "USER_ROLE_ADMIN", 0);
  }

  @Test void staleLoginSnapshotsUseCurrentDatabaseRoleAndAppropriateExpiry() throws Exception {
    var target = verified(); role(admin, target.user(), "ADMIN", 0).andExpect(status().isOk());
    var promoted = auth.login(target.user()); assertThat(promoted.user().role()).isEqualTo("ADMIN");
    var expiry = db.queryForObject("SELECT expires_at FROM auth_session WHERE token_hash=?", OffsetDateTime.class, AuthService.hash(promoted.token()));
    assertThat(Duration.between(OffsetDateTime.now(), expiry).toHours()).isBetween(7L, 8L);
    role(admin, target.user(), "USER", 1).andExpect(status().isOk());
    var demoted = auth.login(promoted.user()); assertThat(demoted.user().role()).isEqualTo("USER");
    var userExpiry = db.queryForObject("SELECT expires_at FROM auth_session WHERE token_hash=?", OffsetDateTime.class, AuthService.hash(demoted.token()));
    assertThat(Duration.between(OffsetDateTime.now(), userExpiry).toHours()).isBetween(167L, 168L);
  }

  @Test void roleChangeWaitsForInFlightLoginAndRevokesTheSessionItIssued() throws Exception {
    var target = verified(); var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var loggingIn = pool.submit(() -> new TransactionTemplate(manager).execute(s -> {
        var issued = auth.login(target.user()); entered.countDown();
        try { assertThat(release.await(10, TimeUnit.SECONDS)).isTrue(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
        return issued;
      }));
      assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
      var changing = pool.submit(() -> role(admin, target.user(), "ADMIN", 0).andReturn().getResponse().getStatus());
      assertThatThrownBy(() -> changing.get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      release.countDown(); var issued = loggingIn.get(10, TimeUnit.SECONDS);
      assertThat(changing.get(10, TimeUnit.SECONDS)).isEqualTo(200);
      assertThat(auth.authenticate(issued.token())).isNull(); assertThat(auth.byId(target.user().id()).role()).isEqualTo("ADMIN");
    } finally { release.countDown(); }
  }
}
