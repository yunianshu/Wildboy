package com.wildboy;

import static com.wildboy.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class BackendIntegrationTest {
  static final EmbeddedPostgres pg;

  static {
    try {
      pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.dev-login-enabled", () -> true);
    r.add("wildboy.identity.encryption-key", () -> java.util.Base64.getEncoder().encodeToString(new byte[32]));
    r.add("wildboy.admin.username", () -> "qa-admin");
    r.add(
        "wildboy.admin.password-hash",
        () ->
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
                .encode("test-only-password-123!"));
  }

  @Autowired MockMvc mvc;
  @Autowired ActivityService activities;
  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired ObjectMapper json;
  @Autowired LegalService legal;
  @Autowired ShopService shop;

  @org.springframework.test.context.bean.override.mockito.MockitoBean
  WechatPayService pay;

  @BeforeEach
  void clean() {
    db.execute("TRUNCATE legal_consent,legal_document_version");
    db.update(
        "UPDATE legal_document_state SET"
            + " draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    db.update("DELETE FROM audit_event");
    db.update("DELETE FROM registration");
    db.update("DELETE FROM shop_order");
    db.update("DELETE FROM product");
    db.update("DELETE FROM activity");
    db.update("DELETE FROM auth_session");
    db.update("DELETE FROM app_user");
    for (var kind : LegalModels.Kind.values()) {
      var draft =
          legal.save(
              kind,
              new LegalModels.DraftInput(
                  "QA " + kind, "Test-only legal policy content for synthetic fixtures.", 0L),
              "fixture");
      legal.publish(kind, draft.draft().revision(), "fixture");
    }
    db.update("DELETE FROM audit_event");
  }

  ActivityInput input(int capacity) {
    var start = OffsetDateTime.now().plusDays(7);
    return new ActivityInput(
        "Test hiking",
        Category.WEEKLY,
        "/assets/hiking.jpg",
        List.of(),
        "Summary",
        "Description",
        "Xiamen",
        "Park gate",
        start,
        start.plusHours(4),
        start.minusDays(1),
        capacity,
        0,
        null, true);
  }

  Activity publish(int capacity) {
    Activity a = activities.create(input(capacity), "fixture");
    return activities.publish(a.id(), a.version(), "fixture");
  }

  RegistrationInput registrationInput(String name, String phone) {
    return registrationInput(name, phone, 1L, 1L);
  }

  RegistrationInput registrationInput(
      String name, String phone, Long privacyVersion, Long termsVersion) {
    return new RegistrationInput(
        List.of(new ParticipantInput(name, "11010519491231002X", phone)),
        privacyVersion,
        termsVersion);
  }

  User user() {
    return auth.user("fixture:" + UUID.randomUUID(), "Test user", "USER");
  }

  ShopModels.Product product(int priceCents, int stock) {
    return shop.createProduct(
        new ShopModels.ProductInput(
            "QA backpack",
            "Synthetic test product",
            "/assets/equipment.jpg",
            priceCents,
            stock,
            ShopModels.ProductStatus.ON_SALE,
            null),
        "fixture");
  }

  ShopModels.OrderInput orderInput(String productId, int quantity) {
    return new ShopModels.OrderInput(
        List.of(new ShopModels.OrderItemInput(productId, quantity)),
        "QA recipient",
        "13800000000",
        "Xiamen synthetic address",
        1L,
        1L);
  }

  String bearer(User u) {
    return "Bearer " + auth.login(u).token();
  }

  @Test
  void identitiesAreEncryptedMaskedAndExplicitlyAudited() throws Exception {
    Activity a = publish(3);
    User owner = user();
    var result = activities.register(a.id(), owner.id(), registrationInput("测试人", "13800000000"));
    var person = result.registration().participants().getFirst();
    String stored = db.queryForObject("SELECT id_number FROM registration_participant WHERE id=?", String.class, person.id());
    assertThat(stored).startsWith("enc:v1:").doesNotContain("11010519491231002X");
    assertThat(person.idNumber()).isEqualTo("******************");
    String path = "/api/v1/admin/activities/"+a.id()+"/participants/"+person.id()+"/reveal";
    mvc.perform(post(path).header("Authorization",bearer(owner))).andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/admin/privacy/encrypt-legacy-identities").header("Authorization",bearer(owner))).andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/admin/activities/other/participants/"+person.id()+"/reveal").header("Authorization",bearer(auth.user("fixture:other-admin", "Admin", "ADMIN")))).andExpect(status().isNotFound());
    mvc.perform(post(path).header("Authorization",bearer(auth.user("fixture:privacy-admin", "Admin", "ADMIN"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.idNumber").value("11010519491231002X"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE action='PARTICIPANT_IDENTITY_REVEAL'", Integer.class)).isEqualTo(1);
  }

  @Test
  void legacyIdentityMigrationIsBoundedAuditedAndIdempotent() {
    Activity a=publish(1); User owner=user();
    var participant=activities.register(a.id(),owner.id(),registrationInput("测试人","13800000000")).registration().participants().getFirst();
    db.update("UPDATE registration_participant SET id_number='11010519491231002X' WHERE id=?",participant.id());
    assertThat(activities.own(a.id(),owner.id()).participants().getFirst().idNumber()).doesNotContain("19491231");
    assertThat(activities.encryptLegacyIdentities("fixture").get("encrypted")).isEqualTo(1);
    assertThat(activities.encryptLegacyIdentities("fixture").get("encrypted")).isZero();
    assertThat(activities.revealParticipant(a.id(),participant.id(),"fixture").idNumber()).isEqualTo("11010519491231002X");
  }

  @Test
  void noIdentityActivityAllowsMultipleParticipantsWithoutIdsAndRejectsUnnecessaryIds() {
    Activity a = publish(3);
    db.update("UPDATE activity SET identity_required=false WHERE id=?",a.id());
    User owner = user();
    var result = activities.register(a.id(), owner.id(), new RegistrationInput(List.of(
        new ParticipantInput("测试一", "", "13800000000"), new ParticipantInput("测试二", "", "13800000001")),1L,1L));
    assertThat(result.registration().participants()).hasSize(2).allMatch(x -> x.idNumber().isEmpty());
    assertThatThrownBy(() -> activities.register(a.id(),user().id(),registrationInput("测试三","13800000002"))).hasMessageContaining("不采集");
  }

  @Test
  void productionDevLoginFailClosedEvenFlagTrue() throws Exception {
    mvc.perform(
            post("/api/v1/auth/dev-login")
                .contentType("application/json")
                .content("{\"role\":\"ADMIN\"}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void wechatWithoutSecretsFailsClosed() throws Exception {
    mvc.perform(
            post("/api/v1/auth/wechat")
                .contentType("application/json")
                .content("{\"code\":\"not-real\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("WECHAT_NOT_CONFIGURED"));
  }

  @Test
  void anonymousCannotWriteAndUserCannotAdmin() throws Exception {
    mvc.perform(
            post("/api/v1/admin/activities")
                .contentType("application/json")
                .content(json.writeValueAsBytes(input(4))))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/admin/activities").header("Authorization", bearer(user())))
        .andExpect(status().isForbidden());
  }

  @Test
  void draftHiddenAndFeedPaginationValid() throws Exception {
    Activity a = activities.create(input(3), "fixture");
    mvc.perform(get("/api/v1/activities/" + a.id())).andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/activities")).andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/v1/activities?page=-1")).andExpect(status().isBadRequest());
    mvc.perform(get("/api/v1/activities?size=51")).andExpect(status().isBadRequest());
  }

  @Test
  void fullHttpRegistrationCancelReregisterAndPrivacy() throws Exception {
    Activity a = publish(1);
    String token = bearer(user());
    String path = "/api/v1/activities/" + a.id() + "/registrations";
    String body = json.writeValueAsString(registrationInput("QA private", "13800001234"));
    mvc.perform(
            post(path).header("Authorization", token).contentType("application/json").content(body))
        .andExpect(status().isCreated());
    mvc.perform(
            post(path).header("Authorization", token).contentType("application/json").content(body))
        .andExpect(status().isOk());
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
    mvc.perform(get(path + "/me").header("Authorization", token))
        .andExpect(jsonPath("$.participants[0].participantName").value("QA private"));
    mvc.perform(get("/api/v1/activities/" + a.id()))
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("13800001234"))));
    mvc.perform(delete(path + "/me").header("Authorization", token))
        .andExpect(status().isNoContent());
    mvc.perform(delete(path + "/me").header("Authorization", token))
        .andExpect(status().isNoContent());
    assertThat(activities.get(a.id(), true).registeredCount()).isZero();
    mvc.perform(
            post(path).header("Authorization", token).contentType("application/json").content(body))
        .andExpect(status().isCreated());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM registration", Integer.class)).isEqualTo(1);
  }

  @Test
  void twentyConcurrentApplicantsNeverOverbook() throws Exception {
    Activity a = publish(3);
    var users = new ArrayList<User>();
    for (int i = 0; i < 20; i++) users.add(user());
    var pool = Executors.newFixedThreadPool(10);
    var ready = new CountDownLatch(1);
    List<Future<Boolean>> futures = new ArrayList<>();
    for (User u : users)
      futures.add(
          pool.submit(
              () -> {
                ready.await();
                try {
                  activities.register(
                      a.id(), u.id(), registrationInput("QA", "13800001234", 1L, 1L));
                  return true;
                } catch (ApiException e) {
                  assertThat(e.code).isEqualTo("ACTIVITY_FULL");
                  return false;
                }
              }));
    ready.countDown();
    int successes = 0;
    for (var f : futures) if (f.get(30, TimeUnit.SECONDS)) successes++;
    pool.shutdownNow();
    assertThat(successes).isEqualTo(3);
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(3);
    assertThat(
            db.queryForObject(
                "SELECT COUNT(*) FROM registration WHERE status='CONFIRMED'", Integer.class))
        .isEqualTo(3);
  }

  @Test
  void concurrentSameUserIdempotent() throws Exception {
    Activity a = publish(2);
    User u = user();
    var pool = Executors.newFixedThreadPool(5);
    List<Callable<RegisterResult>> calls = new ArrayList<>();
    for (int i = 0; i < 5; i++)
      calls.add(
          () ->
              activities.register(
                  a.id(), u.id(), registrationInput("QA", "13800001234", 1L, 1L)));
    var results = pool.invokeAll(calls);
    int created = 0;
    for (var r : results) if (r.get().created()) created++;
    pool.shutdownNow();
    assertThat(created).isEqualTo(1);
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
  }

  @Test
  void multipleParticipantsConsumeAndReleaseAllSeatsAtomically() {
    Activity a = publish(3);
    User owner = user(), other = user();
    var first = new ParticipantInput("第一位", "11010519491231002X", "13800000001");
    var second = new ParticipantInput("第二位", "110105194912310038", "13800000002");
    var input = new RegistrationInput(List.of(first, second), 1L, 1L);
    var created = activities.register(a.id(), owner.id(), input);
    assertThat(created.created()).isTrue();
    assertThat(created.registration().participants()).hasSize(2);
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(2);
    assertThat(activities.register(a.id(), owner.id(), input).created()).isFalse();
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(2);
    assertThatThrownBy(() -> activities.register(a.id(), other.id(), input))
        .hasMessageContaining("剩余名额不足");
    activities.cancelOwn(a.id(), owner.id());
    assertThat(activities.get(a.id(), true).registeredCount()).isZero();
    var reregistered =
        activities.register(
            a.id(), owner.id(), new RegistrationInput(List.of(second), 1L, 1L));
    assertThat(reregistered.registration().participants())
        .extracting(Participant::idNumber)
        .containsExactly("******************");
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(),
                    other.id(),
                    new RegistrationInput(
                        List.of(
                            new ParticipantInput(
                                "错误证件", "110105194912310020", "13800000003")),
                        1L,
                        1L)))
        .hasMessageContaining("身份证");
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), other.id(), new RegistrationInput(List.of(first, first), 1L, 1L)))
        .hasMessageContaining("不能重复");
  }

  @Test
  void staleEditCapacityAndCancelAtomic() {
    Activity a = publish(2);
    activities.register(a.id(), user().id(), registrationInput("One", "13800000001", 1L, 1L));
    activities.register(a.id(), user().id(), registrationInput("Two", "13800000002", 1L, 1L));
    assertThatThrownBy(() -> activities.edit(a.id(), input(1), "fixture"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("刷新");
    Activity current = activities.get(a.id(), true);
    ActivityInput in = input(1);
    var tooSmall =
        new ActivityInput(
            in.title(),
            in.category(),
            in.coverUrl(),
            in.galleryUrls(),
            in.summary(),
            in.description(),
            in.location(),
            in.meetingPoint(),
            in.startAt(),
            in.endAt(),
            in.registrationDeadline(),
            1,
            0,
            current.version());
    assertThatThrownBy(() -> activities.edit(a.id(), tooSmall, "fixture"))
        .hasMessageContaining("已报名");
    Activity cancelled = activities.cancel(a.id(), current.version(), "fixture");
    assertThat(cancelled.registeredCount()).isZero();
    assertThat(
            db.queryForObject(
                "SELECT COUNT(*) FROM registration WHERE status='CONFIRMED'", Integer.class))
        .isZero();
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), user().id(), registrationInput("Three", "13800000003", 1L, 1L)))
        .hasMessageContaining("关闭");
  }

  @Test
  void expiredRegistrationAndCancellationRejected() {
    Activity a = publish(4);
    User u = user();
    activities.register(a.id(), u.id(), registrationInput("QA", "13800000000", 1L, 1L));
    db.update(
        "UPDATE activity SET registration_deadline=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE id=?",
        a.id());
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), user().id(), registrationInput("Another", "13800000001", 1L, 1L)))
        .hasMessageContaining("关闭");
    assertThatThrownBy(() -> activities.cancelOwn(a.id(), u.id())).hasMessageContaining("关闭");
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
  }

  @Test
  void startedActivityCannotBeMovedIntoFuture() {
    Activity a = publish(1);
    db.update(
        "UPDATE activity SET start_at=CURRENT_TIMESTAMP-INTERVAL '1"
            + " hour',end_at=CURRENT_TIMESTAMP+INTERVAL '1"
            + " hour',registration_deadline=CURRENT_TIMESTAMP-INTERVAL '2 hours' WHERE id=?",
        a.id());
    var in = input(1);
    var updated =
        new ActivityInput(
            in.title(),
            in.category(),
            in.coverUrl(),
            in.galleryUrls(),
            in.summary(),
            in.description(),
            in.location(),
            in.meetingPoint(),
            in.startAt(),
            in.endAt(),
            in.registrationDeadline(),
            1,
            0,
            a.version());
    assertThatThrownBy(() -> activities.edit(a.id(), updated, "fixture"))
        .hasMessageContaining("已开始");
  }

  @Test
  void sessionStoredHashedAndExpiredRejected() throws Exception {
    User u = user();
    var login = auth.login(u);
    assertThat(db.queryForObject("SELECT token_hash FROM auth_session", String.class))
        .isNotEqualTo(login.token())
        .hasSize(64);
    mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + login.token()))
        .andExpect(status().isOk());
    db.update("UPDATE auth_session SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");
    mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + login.token()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void invalidInputAndPaymentsRejected() throws Exception {
    String token = bearer(auth.user("fixture:admin", "Admin", "ADMIN"));
    var tree = json.valueToTree(input(2));
    ((com.fasterxml.jackson.databind.node.ObjectNode) tree).put("priceCents", 100);
    mvc.perform(
            post("/api/v1/admin/activities")
                .header("Authorization", token)
                .contentType("application/json")
                .content(json.writeValueAsBytes(tree)))
        .andExpect(status().isBadRequest());
    ((com.fasterxml.jackson.databind.node.ObjectNode) tree)
        .put("priceCents", 0)
        .put("coverUrl", "http://unsafe.example/image.jpg");
    mvc.perform(
            post("/api/v1/admin/activities")
                .header("Authorization", token)
                .contentType("application/json")
                .content(json.writeValueAsBytes(tree)))
        .andExpect(status().isBadRequest());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity", Integer.class)).isZero();
  }

  @Test
  void adminLoginWorksAndWrongPasswordFails() throws Exception {
    mvc.perform(
            post("/api/v1/auth/admin")
                .contentType("application/json")
                .content("{\"username\":\"qa-admin\",\"password\":\"test-only-password-123!\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.role").value("ADMIN"));
    mvc.perform(
            post("/api/v1/auth/admin")
                .contentType("application/json")
                .content("{\"username\":\"qa-admin\",\"password\":\"wrong\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void normalUserCannotReachAnyMobileAdminRouteOrMutateData() throws Exception {
    Activity a = publish(3);
    String token = bearer(user());
    String base = "/api/v1/admin/activities";
    String version = "{\"version\":" + a.version() + "}";
    for (String path : List.of(base, base + "/" + a.id(), base + "/" + a.id() + "/registrations")) {
      mvc.perform(get(path).header("Authorization", token)).andExpect(status().isForbidden());
    }
    mvc.perform(
            post(base)
                .header("Authorization", token)
                .contentType("application/json")
                .content(json.writeValueAsBytes(input(3))))
        .andExpect(status().isForbidden());
    mvc.perform(
            put(base + "/" + a.id())
                .header("Authorization", token)
                .contentType("application/json")
                .content(json.writeValueAsBytes(input(3))))
        .andExpect(status().isForbidden());
    for (String action : List.of("publish", "cancel")) {
      mvc.perform(
              post(base + "/" + a.id() + "/" + action)
                  .header("Authorization", token)
                  .contentType("application/json")
                  .content(version))
          .andExpect(status().isForbidden());
    }
    assertThat(activities.get(a.id(), true).status()).isEqualTo("PUBLISHED");
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity", Integer.class)).isEqualTo(1);
  }

  @Test
  void clientCannotForgeRoleInLoginBodyOrHeaders() throws Exception {
    mvc.perform(
            post("/api/v1/auth/admin")
                .contentType("application/json")
                .content(
                    "{\"username\":\"qa-admin\",\"password\":\"test-only-password-123!\",\"role\":\"ADMIN\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/auth/wechat")
                .contentType("application/json")
                .content("{\"code\":\"not-real\",\"role\":\"ADMIN\",\"openid\":\"forged\"}"))
        .andExpect(status().isBadRequest());
    String userToken = bearer(user());
    mvc.perform(
            get("/api/v1/admin/activities")
                .header("Authorization", userToken)
                .header("X-Role", "ADMIN")
                .header("X-User-Role", "ADMIN"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/me").header("Authorization", userToken))
        .andExpect(jsonPath("$.role").value("USER"));
  }

  @Test
  void expiredAdminSessionCannotReadRosterOrWriteActivity() throws Exception {
    Activity a = publish(3);
    String token = bearer(auth.user("fixture:mobile-admin", "Admin", "ADMIN"));
    db.update("UPDATE auth_session SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");
    mvc.perform(
            get("/api/v1/admin/activities/" + a.id() + "/registrations")
                .header("Authorization", token))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/v1/admin/activities")
                .header("Authorization", token)
                .contentType("application/json")
                .content(json.writeValueAsBytes(input(3))))
        .andExpect(status().isUnauthorized());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity", Integer.class)).isEqualTo(1);
  }

  @Test
  void mobileAdminHttpLifecycleAndCancelledRosterStayPrivate() throws Exception {
    String loginJson =
        mvc.perform(
                post("/api/v1/auth/admin")
                    .contentType("application/json")
                    .content(
                        "{\"username\":\"qa-admin\",\"password\":\"test-only-password-123!\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.role").value("ADMIN"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String adminToken = "Bearer " + json.readTree(loginJson).path("token").asText();
    mvc.perform(get("/api/v1/me").header("Authorization", adminToken))
        .andExpect(jsonPath("$.role").value("ADMIN"));
    String created =
        mvc.perform(
                post("/api/v1/admin/activities")
                    .header("Authorization", adminToken)
                    .contentType("application/json")
                    .content(json.writeValueAsBytes(input(2))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    Activity draft = json.readValue(created, Activity.class);
    var edit = json.valueToTree(input(2));
    ((com.fasterxml.jackson.databind.node.ObjectNode) edit)
        .put("title", "Mobile revised hiking")
        .put("version", draft.version());
    String base = "/api/v1/admin/activities/" + draft.id();
    String edited =
        mvc.perform(
                put(base)
                    .header("Authorization", adminToken)
                    .contentType("application/json")
                    .content(json.writeValueAsBytes(edit)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Mobile revised hiking"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    Activity current = json.readValue(edited, Activity.class);
    mvc.perform(
            put(base)
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content(json.writeValueAsBytes(edit)))
        .andExpect(status().isConflict());
    mvc.perform(
            post(base + "/publish")
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content("{\"version\":" + current.version() + "}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PUBLISHED"));
    String ordinaryToken = bearer(user());
    mvc.perform(
            post("/api/v1/activities/" + draft.id() + "/registrations")
                .header("Authorization", ordinaryToken)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(
                        registrationInput("Private attendee", "13800008888"))))
        .andExpect(status().isCreated());
    mvc.perform(get(base + "/registrations").header("Authorization", adminToken))
        .andExpect(
            jsonPath("$.items[0].participants[0].participantName").value("Private attendee"))
        .andExpect(jsonPath("$.items[0].participants[0].phone").value("13800008888"));
    current = activities.get(draft.id(), true);
    mvc.perform(
            post(base + "/cancel")
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content("{\"version\":" + current.version() + "}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.registeredCount").value(0));
    mvc.perform(get(base + "/registrations").header("Authorization", adminToken))
        .andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
    mvc.perform(get(base + "/registrations").header("Authorization", ordinaryToken))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/activities/" + draft.id()))
        .andExpect(status().isOk())
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("13800008888"))));
  }

  @Test
  void adminStatusFilterUsesWholeDatasetWithAccuratePagination() throws Exception {
    Activity first = activities.create(input(2), "fixture");
    activities.create(input(2), "fixture");
    Activity published = publish(2);
    Activity cancelled = publish(2);
    activities.cancel(cancelled.id(), cancelled.version(), "fixture");
    String token = bearer(auth.user("fixture:filter-admin", "Admin", "ADMIN"));
    String path = "/api/v1/admin/activities";
    mvc.perform(get(path + "?status=DRAFT&size=1&page=0").header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.hasMore").value(true))
        .andExpect(jsonPath("$.items[0].status").value("DRAFT"));
    mvc.perform(get(path + "?status=DRAFT&size=1&page=1").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.hasMore").value(false));
    mvc.perform(get(path + "?status=PUBLISHED").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(published.id()));
    mvc.perform(get(path + "?status=CANCELLED").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(cancelled.id()));
    mvc.perform(get(path + "?status=DRAFT&category=HOLIDAY").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(0))
        .andExpect(jsonPath("$.hasMore").value(false));
    mvc.perform(get(path + "?status=UNKNOWN").header("Authorization", token))
        .andExpect(status().isBadRequest());
    mvc.perform(get(path).header("Authorization", token)).andExpect(jsonPath("$.total").value(4));
    // Public clients cannot leak drafts by supplying an admin-only status parameter.
    mvc.perform(get("/api/v1/activities?status=DRAFT"))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(published.id()));
  }

  @Test
  void ownRegistrationStatusFilterIsGlobalPaginatedAndUserScoped() throws Exception {
    User owner = user();
    User other = user();
    for (int i = 0; i < 3; i++) {
      Activity a = publish(3);
      activities.register(
          a.id(), owner.id(), registrationInput("Owner", "13800000001", 1L, 1L));
      activities.register(
          a.id(), other.id(), registrationInput("Other", "13800000002", 1L, 1L));
      if (i == 0) activities.cancelOwn(a.id(), owner.id());
    }
    String token = bearer(owner);
    String path = "/api/v1/me/registrations";
    mvc.perform(get(path + "?status=CONFIRMED&size=1&page=0").header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.hasMore").value(true))
        .andExpect(jsonPath("$.items[0].participants[0].participantName").value("Owner"));
    mvc.perform(get(path + "?status=CONFIRMED&size=1&page=1").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(2))
        .andExpect(jsonPath("$.hasMore").value(false));
    mvc.perform(get(path + "?status=CANCELLED").header("Authorization", token))
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
    mvc.perform(get(path + "?status=UNKNOWN").header("Authorization", token))
        .andExpect(status().isBadRequest());
    mvc.perform(get(path).header("Authorization", token)).andExpect(jsonPath("$.total").value(3));
  }

  void publishLegalPrivacy2() {
    var state = legal.admin(LegalModels.Kind.PRIVACY);
    var saved =
        legal.save(
            LegalModels.Kind.PRIVACY,
            new LegalModels.DraftInput(
                "QA privacy v2",
                "Updated test-only privacy content, not a real legal agreement.",
                state.draft().revision()),
            "fixture");
    legal.publish(LegalModels.Kind.PRIVACY, saved.draft().revision(), "fixture");
  }

  @Test
  void legalDraftPublishPermissionsAndImmutableHistory() throws Exception {
    String userToken = bearer(user());
    String adminToken = bearer(auth.user("fixture:legal-admin", "Admin", "ADMIN"));
    String base = "/api/v1/admin/legal/PRIVACY";
    for (String path : List.of(base, base + "/versions"))
      mvc.perform(get(path).header("Authorization", userToken)).andExpect(status().isForbidden());
    var state = legal.admin(LegalModels.Kind.PRIVACY);
    String body =
        json.writeValueAsString(
            new LegalModels.DraftInput(
                "New draft title",
                "A new draft is not a published policy for public users.",
                state.draft().revision()));
    mvc.perform(
            put(base + "/draft")
                .header("Authorization", userToken)
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(base + "/publish")
                .header("Authorization", userToken)
                .contentType("application/json")
                .content("{\"revision\":2}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            put(base + "/draft")
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.draft.revision").value(3));
    mvc.perform(get("/api/v1/legal/current"))
        .andExpect(jsonPath("$.privacy.version").value(1))
        .andExpect(jsonPath("$.privacy.title").value("QA PRIVACY"));
    mvc.perform(get("/api/v1/legal/PRIVACY/versions/2")).andExpect(status().isNotFound());
    mvc.perform(
            put(base + "/draft")
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content(body))
        .andExpect(status().isConflict());
    mvc.perform(
            post(base + "/publish")
                .header("Authorization", adminToken)
                .contentType("application/json")
                .content("{\"revision\":3}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(2));
    mvc.perform(get("/api/v1/legal/PRIVACY/versions/1"))
        .andExpect(jsonPath("$.title").value("QA PRIVACY"));
    mvc.perform(get(base + "/versions").header("Authorization", adminToken))
        .andExpect(jsonPath("$[0].version").value(2))
        .andExpect(jsonPath("$.length()").value(2));
    assertThatThrownBy(
            () ->
                db.update(
                    "UPDATE legal_document_version SET content='tampered' WHERE kind='PRIVACY' AND"
                        + " version=1"))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThatThrownBy(
            () ->
                db.update("DELETE FROM legal_document_version WHERE kind='PRIVACY' AND version=1"))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThat(legal.version(LegalModels.Kind.PRIVACY, 1).title()).isEqualTo("QA PRIVACY");
  }

  @Test
  void consentVersionsAreAppendOnlyAndUpdateRequiresExplicitNewVersion() throws Exception {
    User u = user();
    String token = bearer(u);
    mvc.perform(get("/api/v1/me/consents").header("Authorization", token))
        .andExpect(jsonPath("$.requiresConsent").value(true));
    for (int i = 0; i < 2; i++)
      mvc.perform(
              post("/api/v1/me/consents")
                  .header("Authorization", token)
                  .contentType("application/json")
                  .content("{\"privacyVersion\":1,\"termsVersion\":1}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.requiresConsent").value(false));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM legal_consent", Integer.class)).isEqualTo(1);
    publishLegalPrivacy2();
    mvc.perform(get("/api/v1/me/consents").header("Authorization", token))
        .andExpect(jsonPath("$.requiresConsent").value(true))
        .andExpect(jsonPath("$.accepted.privacyVersion").value(1));
    mvc.perform(
            post("/api/v1/me/consents")
                .header("Authorization", token)
                .contentType("application/json")
                .content("{\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LEGAL_VERSION_CHANGED"));
    mvc.perform(
            post("/api/v1/me/consents")
                .header("Authorization", token)
                .contentType("application/json")
                .content("{\"privacyVersion\":2,\"termsVersion\":1}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accepted.privacyVersion").value(2));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM legal_consent", Integer.class)).isEqualTo(2);
    assertThatThrownBy(
            () -> db.update("UPDATE legal_consent SET privacy_version=2 WHERE privacy_version=1"))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThatThrownBy(() -> db.update("DELETE FROM legal_consent"))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    mvc.perform(
            post("/api/v1/me/consents")
                .header("Authorization", token)
                .contentType("application/json")
                .content("{\"privacyVersion\":2,\"termsVersion\":1,\"userId\":\"other\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void missingPublishedPoliciesFailClosedButAdminCanConfigure() throws Exception {
    Activity a = publish(2);
    User u = user();
    String token = bearer(u);
    db.execute("TRUNCATE legal_consent,legal_document_version");
    db.update("UPDATE legal_document_state SET published_version=NULL");
    mvc.perform(get("/api/v1/legal/current"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ready").value(false))
        .andExpect(jsonPath("$.privacy").isEmpty());
    mvc.perform(
            post("/api/v1/auth/wechat")
                .contentType("application/json")
                .content("{\"code\":\"not-real\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("LEGAL_NOT_READY"));
    mvc.perform(
            post("/api/v1/activities/" + a.id() + "/registrations")
                .header("Authorization", token)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(registrationInput("QA", "13800001234", 1L, 1L))))
        .andExpect(status().isServiceUnavailable());
    mvc.perform(
            post("/api/v1/auth/admin")
                .contentType("application/json")
                .content("{\"username\":\"qa-admin\",\"password\":\"test-only-password-123!\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.role").value("ADMIN"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM legal_consent", Integer.class)).isZero();
    assertThat(activities.get(a.id(), true).registeredCount()).isZero();
  }

  @Test
  void failedWechatAndPostExchangeVersionRaceDoNotRecordFalseConsent() throws Exception {
    mvc.perform(
            post("/api/v1/auth/wechat")
                .contentType("application/json")
                .content("{\"code\":\"invalid\",\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isServiceUnavailable());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM legal_consent", Integer.class)).isZero();
    publishLegalPrivacy2();
    assertThatThrownBy(() -> auth.finishWechat("synthetic-post-exchange", 1L, 1L))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("更新");
    assertThat(db.queryForObject("SELECT COUNT(*) FROM app_user", Integer.class)).isZero();
    assertThat(db.queryForObject("SELECT COUNT(*) FROM auth_session", Integer.class)).isZero();
    assertThat(db.queryForObject("SELECT COUNT(*) FROM legal_consent", Integer.class)).isZero();
    Login login = auth.finishWechat("synthetic-post-exchange", 2L, 1L);
    assertThat(login.user().role()).isEqualTo("USER");
    assertThat(legal.consentState(login.user().id()).requiresConsent()).isFalse();
  }

  @Test
  void registrationPolicyChangeBlocksOldConsentButDoesNotBlockCancellation() {
    Activity a = publish(1);
    User first = user(), second = user();
    activities.register(a.id(), first.id(), registrationInput("QA", "13800001234", 1L, 1L));
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), second.id(), registrationInput("QA2", "13800001235", 1L, 1L)))
        .hasMessageContaining("已满");
    assertThat(legal.consentState(second.id()).accepted()).isNull();
    publishLegalPrivacy2();
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), second.id(), registrationInput("QA2", "13800001235", 1L, 1L)))
        .hasMessageContaining("更新");
    activities.cancelOwn(a.id(), first.id());
    assertThat(activities.get(a.id(), true).registeredCount()).isZero();
    activities.register(a.id(), second.id(), registrationInput("QA2", "13800001235", 2L, 1L));
    assertThat(legal.consentState(first.id()).accepted().privacyVersion()).isEqualTo(1);
    assertThat(legal.consentState(second.id()).accepted().privacyVersion()).isEqualTo(2);
  }

  @Test
  void shopUsesServerPriceAndPreventsOverselling() throws Exception {
    var product = product(1299, 2);
    User owner = user(), other = user();
    var order = shop.createOrder(owner.id(), orderInput(product.id(), 2));
    assertThat(order.totalCents()).isEqualTo(2598);
    assertThat(order.items().getFirst().productName()).isEqualTo("QA backpack");
    assertThat(shop.product(product.id(), true).stock()).isZero();
    assertThatThrownBy(() -> shop.createOrder(other.id(), orderInput(product.id(), 1)))
        .hasMessageContaining("库存不足");
    assertThatThrownBy(() -> shop.order(order.id(), other.id(), false))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("不存在");
    assertThat(shop.orders(owner.id(), null, 0, 20).total()).isEqualTo(1);
    assertThat(shop.orders(other.id(), null, 0, 20).total()).isZero();
  }

  @Test
  void shopConcurrentOrdersNeverExceedStock() throws Exception {
    var product = product(100, 3);
    var users = new ArrayList<User>();
    for (int index = 0; index < 12; index++) users.add(user());
    var pool = Executors.newFixedThreadPool(6);
    var futures = new ArrayList<Future<Boolean>>();
    for (User current : users)
      futures.add(
          pool.submit(
              () -> {
                try {
                  shop.createOrder(current.id(), orderInput(product.id(), 1));
                  return true;
                } catch (ApiException e) {
                  assertThat(e.code).isEqualTo("INSUFFICIENT_STOCK");
                  return false;
                }
              }));
    int successes = 0;
    for (var future : futures) if (future.get(30, TimeUnit.SECONDS)) successes++;
    pool.shutdownNow();
    assertThat(successes).isEqualTo(3);
    assertThat(shop.product(product.id(), true).stock()).isZero();
    assertThat(shop.orders(null, ShopModels.OrderStatus.PENDING_PAYMENT, 0, 20).total())
        .isEqualTo(3);
  }

  @Test
  void paymentPrepayCloseAndShipmentFollowOrderState() {
    var product = product(5000, 2);
    User customer = auth.user("wechat:qa-openid", "Wechat customer", "USER");
    var order = shop.createOrder(customer.id(), orderInput(product.id(), 1));
    when(pay.prepay(any(), eq("qa-openid")))
        .thenReturn(
            new ShopModels.PaymentRequest(
                "1", "nonce", "prepay_id=qa", "RSA", "signature"));
    var payment = shop.payment(order.id(), customer.id());
    assertThat(payment.packageValue()).isEqualTo("prepay_id=qa");
    assertThat(shop.order(order.id(), customer.id(), false).paymentInitiated()).isTrue();
    var cancelled = shop.cancelOrder(order.id(), customer.id());
    assertThat(cancelled.status()).isEqualTo("CANCELLED");
    assertThat(shop.product(product.id(), true).stock()).isEqualTo(2);
    verify(pay).closeOrder(order.orderNo());
    assertThatThrownBy(() -> shop.payment(order.id(), customer.id()))
        .hasMessageContaining("不可支付");
  }

  @Test
  void onlyVerifiedPaymentNotificationMarksPaidOnce() {
    var product = product(3600, 1);
    User customer = auth.user("wechat:payment-fixture", "Test user", "USER");
    var order = shop.createOrder(customer.id(), orderInput(product.id(), 1));
    when(pay.enabled()).thenReturn(true);
    when(pay.merchantId()).thenReturn("merchant-qa");
    var transaction = new com.wechat.pay.java.service.payments.model.Transaction();
    transaction.setMchid("merchant-qa");
    transaction.setTradeType(com.wechat.pay.java.service.payments.model.Transaction.TradeTypeEnum.JSAPI);
    var payer = new com.wechat.pay.java.service.payments.model.TransactionPayer();payer.setOpenid("payment-fixture");transaction.setPayer(payer);
    transaction.setOutTradeNo(order.orderNo());
    transaction.setTransactionId("transaction-qa");
    transaction.setTradeState(
        com.wechat.pay.java.service.payments.model.Transaction.TradeStateEnum.SUCCESS);
    var amount = new com.wechat.pay.java.service.payments.model.TransactionAmount();
    amount.setTotal(order.totalCents());amount.setCurrency("CNY");
    transaction.setAmount(amount);
    shop.completePayment(transaction);
    assertThat(shop.order(order.id(), customer.id(), false).status()).isEqualTo("PAID");
    shop.completePayment(transaction);
    assertThat(shop.order(order.id(), customer.id(), false).version()).isEqualTo(1);
    var shipped = shop.ship(order.id(), 1L, "fixture-admin");
    assertThat(shipped.status()).isEqualTo("SHIPPED");
    var secondProduct = product(3600, 1);
    var second = shop.createOrder(user().id(), orderInput(secondProduct.id(), 1));
    transaction.setOutTradeNo(second.orderNo());
    transaction.setTransactionId("transaction-other");
    amount.setTotal(1);
    assertThatThrownBy(() -> shop.completePayment(transaction))
        .hasMessageContaining("金额不匹配");
    assertThat(shop.order(second.id(), second.userId(), false).status())
        .isEqualTo("PENDING_PAYMENT");
  }

  @Test
  void devIdentityCannotCreateRealPaymentOrMarkOrderPaid() throws Exception {
    var product = product(100, 1);
    User customer = user();
    var order = shop.createOrder(customer.id(), orderInput(product.id(), 1));
    mvc.perform(
            post("/api/v1/orders/" + order.id() + "/pay")
                .header("Authorization", bearer(customer)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("WECHAT_IDENTITY_REQUIRED"));
    assertThat(shop.order(order.id(), customer.id(), false).status())
        .isEqualTo("PENDING_PAYMENT");
    verify(pay, never()).prepay(any(), any());
  }

  @Test
  void legalPlainTextValidationAndDuplicatePublishAreEnforced() throws Exception {
    String token = bearer(auth.user("fixture:legal-editor", "Admin", "ADMIN"));
    mvc.perform(
            put("/api/v1/admin/legal/TERMS/draft")
                .header("Authorization", token)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(
                        new LegalModels.DraftInput("Terms", "<script>alert('x')</script>", 2L))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PLAIN_TEXT_ONLY"));
    mvc.perform(
            post("/api/v1/admin/legal/TERMS/publish")
                .header("Authorization", token)
                .contentType("application/json")
                .content("{\"revision\":2}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("NO_LEGAL_CHANGES"));
    mvc.perform(
            post("/api/v1/me/consents")
                .contentType("application/json")
                .content("{\"privacyVersion\":1,\"termsVersion\":1}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/v1/me/consents")
                .header("Authorization", token)
                .contentType("application/json")
                .content("{\"privacyVersion\":0,\"termsVersion\":1}"))
        .andExpect(status().isBadRequest());
  }
}
