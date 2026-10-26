package com.wildboy;

import static com.wildboy.Models.*;
import static org.assertj.core.api.Assertions.*;
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

  @BeforeEach
  void clean() {
    db.update("DELETE FROM audit_event");
    db.update("DELETE FROM registration");
    db.update("DELETE FROM activity");
    db.update("DELETE FROM auth_session");
    db.update("DELETE FROM app_user");
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
        null);
  }

  Activity publish(int capacity) {
    Activity a = activities.create(input(capacity), "fixture");
    return activities.publish(a.id(), a.version(), "fixture");
  }

  User user() {
    return auth.user("fixture:" + UUID.randomUUID(), "Test user", "USER");
  }

  String bearer(User u) {
    return "Bearer " + auth.login(u).token();
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
                .content("{\"code\":\"not-real\"}"))
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
    String body = "{\"participantName\":\"QA private\",\"phone\":\"13800001234\"}";
    mvc.perform(
            post(path).header("Authorization", token).contentType("application/json").content(body))
        .andExpect(status().isCreated());
    mvc.perform(
            post(path).header("Authorization", token).contentType("application/json").content(body))
        .andExpect(status().isOk());
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
    mvc.perform(get(path + "/me").header("Authorization", token))
        .andExpect(jsonPath("$.participantName").value("QA private"));
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
                  activities.register(a.id(), u.id(), new RegistrationInput("QA", "13800001234"));
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
          () -> activities.register(a.id(), u.id(), new RegistrationInput("QA", "13800001234")));
    var results = pool.invokeAll(calls);
    int created = 0;
    for (var r : results) if (r.get().created()) created++;
    pool.shutdownNow();
    assertThat(created).isEqualTo(1);
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
  }

  @Test
  void staleEditCapacityAndCancelAtomic() {
    Activity a = publish(2);
    activities.register(a.id(), user().id(), new RegistrationInput("One", "13800000001"));
    activities.register(a.id(), user().id(), new RegistrationInput("Two", "13800000002"));
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
                    a.id(), user().id(), new RegistrationInput("Three", "13800000003")))
        .hasMessageContaining("关闭");
  }

  @Test
  void expiredRegistrationAndCancellationRejected() {
    Activity a = publish(4);
    User u = user();
    activities.register(a.id(), u.id(), new RegistrationInput("QA", "13800000000"));
    db.update(
        "UPDATE activity SET registration_deadline=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE id=?",
        a.id());
    assertThatThrownBy(
            () ->
                activities.register(
                    a.id(), user().id(), new RegistrationInput("Another", "13800000001")))
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
}
