package com.wildboy;

import static com.wildboy.AdminAccountModels.*;
import static org.awaitility.Awaitility.await;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
class AdminAccountIntegrationTest {
  static final String BOOTSTRAP_USERNAME = "setup-admin";
  static final String BOOTSTRAP_PASSWORD = "Test-bootstrap-1234";
  static final String NEW_PASSWORD = "Test-managed-5678";
  static final String PATH = "/api/v1/admin/settings/admin-account";
  static final EmbeddedPostgres pg;
  static final AtomicInteger ips = new AtomicInteger();
  static {
    try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); }
  }

  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.admin.username", () -> BOOTSTRAP_USERNAME);
    r.add("wildboy.admin.password-hash", () -> new BCryptPasswordEncoder(12).encode(BOOTSTRAP_PASSWORD));
  }

  @Autowired AdminAccountService accounts;
  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired PlatformTransactionManager transactionManager;
  Models.Login admin;
  String ip;

  @BeforeEach void setup() {
    db.update("UPDATE admin_account_configuration SET username=NULL,password_hash=NULL,admin_user_id=NULL,version=0,configured_at=NULL");
    db.update("DELETE FROM audit_event");
    db.update("DELETE FROM auth_session");
    db.update("DELETE FROM app_user");
    admin = auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD);
    ip = "10.40.0." + ips.incrementAndGet();
  }

  String bearer(Models.Login login) { return "Bearer " + login.token(); }
  UpdateInput input(String username, String password, String current, long version) {
    return new UpdateInput(username, password, current, version);
  }
  UpdateInput firstInput() { return input("managed-admin", NEW_PASSWORD, BOOTSTRAP_PASSWORD, 0); }
  MockHttpServletRequestBuilder save(Models.Login login, UpdateInput input) throws Exception {
    // Input passwords are write-only, so deliberately construct the request rather than serializing the DTO.
    var body = Map.of("username", input.username(), "newPassword", input.newPassword(),
        "currentPassword", input.currentPassword(), "version", input.version());
    return put(PATH).header("Authorization", bearer(login)).contentType("application/json")
        .content(json.writeValueAsBytes(body)).with(r -> { r.setRemoteAddr(ip); return r; });
  }
  void expectCode(Runnable operation, int status, String code) {
    assertThatThrownBy(operation::run).isInstanceOfSatisfying(ApiException.class, e -> {
      assertThat(e.status).isEqualTo(status);
      assertThat(e.code).isEqualTo(code);
    });
  }

  @Test void capabilitiesExposeOnlyTheConfiguredBoolean() throws Exception {
    mvc.perform(get("/api/v1/auth/capabilities")).andExpect(status().isOk())
        .andExpect(content().json("{\"adminLoginEnabled\":false}", true))
        .andExpect(header().string("Cache-Control", "no-store"));
    mvc.perform(get(PATH).header("Authorization", bearer(admin))).andExpect(status().isOk())
        .andExpect(jsonPath("$.configured").value(false)).andExpect(jsonPath("$.username").value(BOOTSTRAP_USERNAME))
        .andExpect(jsonPath("$.version").value(0)).andExpect(jsonPath("$.canConfigure").value(true));
    mvc.perform(save(admin, firstInput())).andExpect(status().isOk())
        .andExpect(jsonPath("$.configured").value(true)).andExpect(jsonPath("$.version").value(1))
        .andExpect(jsonPath("$.canConfigure").value(true)).andExpect(jsonPath("$.passwordHash").doesNotExist());
    mvc.perform(get("/api/v1/auth/capabilities")).andExpect(status().isOk())
        .andExpect(content().json("{\"adminLoginEnabled\":true}", true));
    assertThat(db.queryForObject("SELECT password_hash FROM admin_account_configuration", String.class))
        .startsWith("$2a$12$").doesNotContain(NEW_PASSWORD);
    assertThat(new AdminAccountService(db, "", "").capabilities().adminLoginEnabled()).isTrue();
  }

  @Test void settingsRequireAdminAndNeverCreateAnUnauthenticatedSetupPath() throws Exception {
    mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    mvc.perform(put(PATH).contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    var user = auth.login(auth.user("normal-user", "User", "USER"));
    mvc.perform(get(PATH).header("Authorization", bearer(user))).andExpect(status().isForbidden());
    mvc.perform(save(user, firstInput())).andExpect(status().isForbidden());
    assertThat(accounts.capabilities().adminLoginEnabled()).isFalse();
    assertThat(auth.authenticate(user.token()).role()).isEqualTo("USER");
  }

  @Test void demoAndOtherAdminIdentitiesCannotConfigureOrImpersonateThePasswordOwner() throws Exception {
    var demo = auth.login(auth.user("dev:ADMIN", "Demo", "ADMIN"));
    mvc.perform(get(PATH).header("Authorization", bearer(demo))).andExpect(status().isOk())
        .andExpect(jsonPath("$.canConfigure").value(false))
        .andExpect(jsonPath("$.configurationBlockReason").value("PASSWORD_LOGIN_REQUIRED"));
    mvc.perform(save(demo, firstInput())).andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PASSWORD_LOGIN_REQUIRED"));
    var other = auth.login(auth.user("other-admin", "Other", "ADMIN"));
    mvc.perform(save(other, firstInput())).andExpect(status().isForbidden());
    assertThat(accounts.settings(admin.user()).version()).isZero();
  }

  @Test void rotationKeepsCurrentIdentityAndSessionButRevokesAllOtherAdminSessions() {
    var oldSession = auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD);
    var demo = auth.login(auth.user("dev:ADMIN", "Demo", "ADMIN"));
    var user = auth.login(auth.user("normal-user", "User", "USER"));
    var saved = accounts.update(admin.user(), bearer(admin), firstInput());
    assertThat(saved.username()).isEqualTo("managed-admin");
    assertThat(auth.authenticate(admin.token())).isEqualTo(admin.user());
    assertThat(auth.authenticate(oldSession.token())).isNull();
    assertThat(auth.authenticate(demo.token())).isNull();
    assertThat(auth.authenticate(user.token())).isEqualTo(user.user());
    expectCode(() -> auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD), 401, "INVALID_CREDENTIALS");
    var managed = auth.admin("managed-admin", NEW_PASSWORD);
    assertThat(managed.user().id()).isEqualTo(admin.user().id());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM app_user WHERE role='ADMIN' AND external_id LIKE 'admin:%'", Integer.class)).isEqualTo(1);
    // Database credentials remain authoritative after environment bootstrap is removed or changed.
    assertThat(new AdminAccountService(db, "different-env", "different-hash")
        .verifyLogin("managed-admin", NEW_PASSWORD).userId()).isEqualTo(admin.user().id());
    assertThat(accounts.update(admin.user(), bearer(admin), input("next-admin", "Next-password-9012", NEW_PASSWORD, 1)).version()).isEqualTo(2);
    assertThat(auth.authenticate(managed.token())).isNull();
    assertThat(auth.admin("next-admin", "Next-password-9012").user().id()).isEqualTo(admin.user().id());
  }

  @Test void wrongCurrentPasswordDoesNotRevokeSessionMutateOrLeakCredentials() throws Exception {
    String incorrect = "Incorrect-private-password-12";
    var response = mvc.perform(save(admin, input("managed-admin", NEW_PASSWORD, incorrect, 0)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CURRENT_PASSWORD_INVALID"))
        .andReturn().getResponse().getContentAsString();
    assertThat(response).doesNotContain(incorrect, NEW_PASSWORD, BOOTSTRAP_PASSWORD);
    assertThat(accounts.settings(admin.user()).version()).isZero();
    assertThat(auth.authenticate(admin.token())).isEqualTo(admin.user());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event", Integer.class)).isZero();
    assertThat(json.writeValueAsString(firstInput())).doesNotContain(NEW_PASSWORD, BOOTSTRAP_PASSWORD);
    assertThat(firstInput().toString()).doesNotContain(NEW_PASSWORD, BOOTSTRAP_PASSWORD);
  }

  @Test void credentialValidationRejectsWeakAmbiguousAndBcryptTruncatedPasswords() {
    for (String name : List.of("ab", " admin", "admin name", "admin@host", "中admin", "a".repeat(65)))
      expectCode(() -> accounts.update(admin.user(), bearer(admin), input(name, NEW_PASSWORD, BOOTSTRAP_PASSWORD, 0)), 400, "INVALID_ADMIN_USERNAME");
    for (String password : List.of("short123", "abcdefghijkl", "123456789012", "Password123\n", "a1" + "x".repeat(71), "Ab1" + "界".repeat(24)))
      expectCode(() -> accounts.update(admin.user(), bearer(admin), input("managed-admin", password, BOOTSTRAP_PASSWORD, 0)), 400, "WEAK_ADMIN_PASSWORD");
    assertThat(accounts.settings(admin.user()).version()).isZero();
    assertThat(auth.authenticate(admin.token())).isNotNull();
  }

  @Test void malformedVersionAndUnknownFieldsFailWithoutEchoingPassword() throws Exception {
    String secret = "Never-echo-this-1234";
    String body = json.writeValueAsString(Map.of("username", "managed-admin", "newPassword", secret,
        "currentPassword", BOOTSTRAP_PASSWORD, "version", -1));
    var invalid = mvc.perform(put(PATH).header("Authorization", bearer(admin)).contentType("application/json")
        .content(body).with(r -> { r.setRemoteAddr(ip); return r; }))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andReturn().getResponse().getContentAsString();
    assertThat(invalid).doesNotContain(secret, BOOTSTRAP_PASSWORD);
    mvc.perform(put(PATH).header("Authorization", bearer(admin)).contentType("application/json")
        .content(body.replace("\"version\":-1", "\"version\":0,\"role\":\"ADMIN\""))
        .with(r -> { r.setRemoteAddr(ip); return r; }))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    assertThat(accounts.settings(admin.user()).version()).isZero();
  }

  @Test void staleAndConcurrentSavesHaveExactlyOneWinner() throws Exception {
    try (var pool = Executors.newFixedThreadPool(2)) {
      var start = new CountDownLatch(1);
      List<Callable<String>> jobs = new ArrayList<>();
      for (String username : List.of("winner-one", "winner-two")) jobs.add(() -> {
        start.await();
        try { accounts.update(admin.user(), bearer(admin), input(username, NEW_PASSWORD, BOOTSTRAP_PASSWORD, 0)); return "OK"; }
        catch (ApiException e) { return e.code; }
      });
      var futures = jobs.stream().map(pool::submit).toList();
      start.countDown();
      assertThat(List.of(futures.get(0).get(10, TimeUnit.SECONDS), futures.get(1).get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder("OK", "STALE_VERSION");
    }
    assertThat(accounts.settings(admin.user()).version()).isEqualTo(1);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='ADMIN_ACCOUNT_CONFIGURE'", Integer.class)).isEqualTo(1);
    expectCode(() -> accounts.update(admin.user(), bearer(admin), firstInput()), 409, "STALE_VERSION");
    assertThat(auth.authenticate(admin.token())).isNotNull();
  }

  @Test void loginWaitingForRotationCannotIssueAnOldPasswordSession() throws Exception {
    try (var pool = Executors.newSingleThreadExecutor()) {
      new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
        db.queryForObject("SELECT id FROM admin_account_configuration WHERE id=1 FOR UPDATE", Integer.class);
        var started = new CountDownLatch(1);
        var login = pool.submit(() -> {
          started.countDown();
          try { auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD); return "OK"; }
          catch (ApiException e) { return e.code; }
        });
        try { assertThat(started.await(3, TimeUnit.SECONDS)).isTrue(); }
        catch (InterruptedException e) { throw new AssertionError(e); }
        // The exclusive lock must serialize the credential read before BCrypt and token creation.
        await().atMost(java.time.Duration.ofSeconds(3)).until(() -> db.queryForObject(
            "SELECT COUNT(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%admin_account_configuration%FOR SHARE%'",
            Integer.class) > 0);
        assertThat(login.isDone()).isFalse();
        accounts.update(admin.user(), bearer(admin), firstInput());
        pendingLogin = login;
      });
      assertThat(pendingLogin.get(10, TimeUnit.SECONDS)).isEqualTo("INVALID_CREDENTIALS");
    }
    assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_session WHERE user_id=?", Integer.class, admin.user().id())).isEqualTo(1);
  }
  Future<String> pendingLogin;

  @Test void anyLateFailureRollsBackCredentialsAndSessionRevocationTogether() {
    var otherSession = auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD);
    db.execute("ALTER TABLE audit_event ADD CONSTRAINT test_reject_admin_setup CHECK (action<>'ADMIN_ACCOUNT_CONFIGURE')");
    try {
      assertThatThrownBy(() -> accounts.update(admin.user(), bearer(admin), firstInput()))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    } finally {
      db.execute("ALTER TABLE audit_event DROP CONSTRAINT test_reject_admin_setup");
    }
    assertThat(accounts.settings(admin.user()).version()).isZero();
    assertThat(accounts.capabilities().adminLoginEnabled()).isFalse();
    assertThat(auth.authenticate(admin.token())).isNotNull();
    assertThat(auth.authenticate(otherSession.token())).isNotNull();
    assertThat(auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD).user().id()).isEqualTo(admin.user().id());
  }

  @Test void revokedOrExpiredBearerCannotSaveEvenWithCorrectPassword() {
    var expired = auth.admin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD);
    db.update("UPDATE auth_session SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE token_hash=?", AuthService.hash(expired.token()));
    expectCode(() -> accounts.update(expired.user(), bearer(expired), firstInput()), 401, "UNAUTHENTICATED");
    db.update("DELETE FROM auth_session WHERE token_hash=?", AuthService.hash(admin.token()));
    expectCode(() -> accounts.update(admin.user(), bearer(admin), firstInput()), 401, "UNAUTHENTICATED");
    assertThat(accounts.capabilities().adminLoginEnabled()).isFalse();
  }

  @Test void absentBootstrapAndMissingConfiguredOwnerFailClosed() {
    var absent = new AdminAccountService(db, "", "");
    assertThat(absent.settings(admin.user()).canConfigure()).isFalse();
    assertThat(absent.settings(admin.user()).configurationBlockReason()).isEqualTo("ADMIN_BOOTSTRAP_NOT_CONFIGURED");
    expectCode(() -> absent.update(admin.user(), bearer(admin), firstInput()), 503, "ADMIN_BOOTSTRAP_NOT_CONFIGURED");
    expectCode(() -> absent.verifyLogin(BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD), 503, "ADMIN_NOT_CONFIGURED");
    accounts.update(admin.user(), bearer(admin), firstInput());
    db.update("UPDATE app_user SET role='USER' WHERE id=?", admin.user().id());
    assertThat(accounts.capabilities().adminLoginEnabled()).isFalse();
    expectCode(() -> auth.admin("managed-admin", NEW_PASSWORD), 503, "ADMIN_NOT_CONFIGURED");
  }

  @Test void accountReauthenticationIsRateLimitedAndDoesNotTrustForwardedIp() throws Exception {
    var wrong = input("managed-admin", NEW_PASSWORD, "Wrong-current-1234", 0);
    // Cheaply exhaust the same credential bucket with unauthenticated requests.
    for (int i = 0; i < 20; i++) mvc.perform(put(PATH).contentType("application/json").content("{}")
        .with(r -> { r.setRemoteAddr(ip); return r; })).andExpect(status().isUnauthorized());
    mvc.perform(save(admin, wrong).header("X-Forwarded-For", "192.0.2.99"))
        .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    assertThat(accounts.settings(admin.user()).version()).isZero();
    assertThat(auth.authenticate(admin.token())).isNotNull();
  }
}
