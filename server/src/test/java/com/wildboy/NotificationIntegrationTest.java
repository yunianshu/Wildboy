package com.wildboy;

import static com.wildboy.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class NotificationIntegrationTest {
  static final EmbeddedPostgres pg;
  static {
    try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); }
  }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.notifications.scan-ms", () -> "3600000");
    r.add("wildboy.identity.encryption-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
  }
  @Autowired ActivityService activities;
  @Autowired LegalService legal;
  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired NotificationService notifications;
  @Autowired ActivityReminderJob reminders;
  @Autowired MockMvc mvc;
  @MockitoBean WechatNotificationGateway gateway;

  @BeforeEach void setup() {
    db.update("DELETE FROM notification_outbox"); db.update("DELETE FROM notification_permission");
    db.update("DELETE FROM activity_waitlist"); db.update("DELETE FROM registration_participant");
    db.update("DELETE FROM registration"); db.update("DELETE FROM activity");
    db.execute("TRUNCATE legal_consent,legal_document_version");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for (var kind : LegalModels.Kind.values()) {
      var d = legal.save(kind, new LegalModels.DraftInput("Test " + kind,
          "Test synthetic policy for QA only.", 0L), "test");
      legal.publish(kind, d.draft().revision(), "test");
    }
    reset(gateway); when(gateway.ready()).thenReturn(false); when(gateway.templateId()).thenReturn("");
  }
  User user() {
    var user = auth.user("wechat:qa-" + UUID.randomUUID(), "QA", "USER");
    db.update("UPDATE app_user SET real_name='测试用户',phone='13800000000',profile_completed_at=CURRENT_TIMESTAMP WHERE id=?", user.id());
    return auth.byId(user.id());
  }
  String token(User u) { return "Bearer " + auth.login(u).token(); }
  Activity activity(int capacity) {
    var start = OffsetDateTime.now().plusDays(2);
    var a = activities.create(new ActivityInput("QA hike", Category.WEEKLY, "/assets/hiking.jpg",
        List.of(), "Summary", "Details", "Xiamen", "Gate", start, start.plusHours(2),
        start.minusHours(1), capacity, 0, null, false), "test");
    return activities.publish(a.id(), a.version(), "test");
  }
  RegistrationInput input(int count) {
    var p = new ArrayList<ParticipantInput>();
    for (int i = 0; i < count; i++) p.add(new ParticipantInput("QA " + i, "", "13800000000"));
    return new RegistrationInput(p, 1L, 1L);
  }
  ActivityInput edit(Activity a, int capacity, boolean identity, String location, OffsetDateTime start) {
    return new ActivityInput(a.title(), a.category(), a.coverUrl(), a.galleryUrls(), a.summary(),
        a.description(), location, a.meetingPoint(), start, start.plusHours(2), start.minusHours(1),
        capacity, 0, a.version(), identity);
  }
  void sendingEnabled(User owner) {
    when(gateway.ready()).thenReturn(true); notifications.subscribe(owner.id(), true);
    when(gateway.send(anyString(), anyString(), anyString(), anyString(), any()))
        .thenReturn(new WechatNotificationGateway.Result("SENT", "", false));
  }

  @Test void notificationConfigPermissionOutcomesAndRetries() {
    var a = activity(1); var owner = user(); activities.register(a.id(), owner.id(), input(1));
    notifications.enqueue(owner.id(), a, "PRETRIP", "test-notice", "准备出发", a.startAt());
    String id = notifications.list(owner.id(), 0, 20).items().getFirst().id();
    notifications.dispatch(id);
    assertThat(notifications.list(owner.id(), 0, 20).items().getFirst().status()).isEqualTo("UNCONFIGURED");
    when(gateway.ready()).thenReturn(true); notifications.retry(id, "admin"); notifications.dispatch(id);
    assertThat(notifications.list(owner.id(), 0, 20).items().getFirst().status()).isEqualTo("NO_PERMISSION");
    sendingEnabled(owner); notifications.retry(id, "admin"); notifications.dispatch(id); notifications.dispatch(id);
    verify(gateway, times(1)).send(anyString(), anyString(), anyString(), anyString(), any());
    assertThat(notifications.list(owner.id(), 0, 20).items().getFirst().status()).isEqualTo("SENT");
    assertThatThrownBy(() -> notifications.retry(id, "admin")).isInstanceOf(ApiException.class);
  }

  @Test void uncertainSendIsNotRetriedAndPretripDeduplicates() {
    var a = activity(1); var owner = user(); activities.register(a.id(), owner.id(), input(1));
    sendingEnabled(owner);
    notifications.activityNotice(a, "PRETRIP", "准备出发");
    notifications.activityNotice(activities.get(a.id(), true), "PRETRIP", "准备出发");
    assertThat(notifications.list(owner.id(), 0, 20).items()).hasSize(1);
    String id = notifications.list(owner.id(), 0, 20).items().getFirst().id();
    when(gateway.send(anyString(), anyString(), anyString(), anyString(), any()))
        .thenReturn(new WechatNotificationGateway.Result("UNKNOWN", "结果未确认", false));
    notifications.dispatch(id); notifications.scan();
    verify(gateway, times(1)).send(anyString(), anyString(), anyString(), anyString(), any());
    assertThatThrownBy(() -> notifications.retry(id, "admin")).isInstanceOf(ApiException.class);
  }

  @Test void rescheduledPretripNeverSends() {
    var a = activity(1); var owner = user(); activities.register(a.id(), owner.id(), input(1));
    sendingEnabled(owner); notifications.activityNotice(a, "PRETRIP", "准备出发");
    db.update("UPDATE activity SET start_at=start_at+INTERVAL '1 day',end_at=end_at+INTERVAL '1 day' WHERE id=?", a.id());
    notifications.scan();
    assertThat(notifications.list(owner.id(), 0, 20).items().getFirst().status()).isEqualTo("OBSOLETE");
    verify(gateway, never()).send(anyString(), anyString(), anyString(), anyString(), any());
  }

  @Test void changedAndCancelledActivitiesStillNotifyRegisteredUsers() {
    var a = activity(2); var owner = user(); var outsider = user();
    activities.register(a.id(), owner.id(), input(1)); sendingEnabled(owner);
    notifications.subscribe(owner.id(), true);
    var current = activities.get(a.id(), true);
    var changed = activities.edit(a.id(), edit(current, 2, false, "New gathering location", current.startAt()), "test");
    notifications.scan();
    assertThat(notifications.list(owner.id(), 0, 20).items()).singleElement()
        .satisfies(n -> { assertThat(n.kind()).isEqualTo("ACTIVITY_CHANGED"); assertThat(n.status()).isEqualTo("SENT"); });
    activities.cancel(changed.id(), changed.version(), "test"); notifications.scan();
    assertThat(notifications.list(owner.id(), 0, 20).items()).hasSize(2)
        .extracting(NotificationService.Notice::kind).containsExactlyInAnyOrder("ACTIVITY_CHANGED", "ACTIVITY_CANCELLED");
    assertThat(notifications.list(owner.id(), 0, 20).items()).allMatch(n -> n.status().equals("SENT"));
    assertThat(notifications.list(outsider.id(), 0, 20).items()).isEmpty();
    assertThat(activities.get(a.id(), true).registeredCount()).isZero();
    assertThat(activities.own(a.id(), owner.id())).isNull();
    verify(gateway, times(2)).send(anyString(), eq(a.id()), anyString(), anyString(), any());
  }

  @Test void reminderScanRetainsDeduplicatedUpcomingActivityNotice() {
    var a = activity(1);
    a = activities.edit(a.id(), edit(a, 1, false, a.location(), OffsetDateTime.now().plusHours(2)), "test");
    var owner = user(); activities.register(a.id(), owner.id(), input(1)); sendingEnabled(owner);
    reminders.scan(); reminders.scan();
    assertThat(notifications.list(owner.id(), 0, 20).items()).singleElement()
        .satisfies(n -> { assertThat(n.kind()).isEqualTo("PRETRIP"); assertThat(n.status()).isEqualTo("SENT"); });
    verify(gateway, times(1)).send(anyString(), eq(a.id()), anyString(), anyString(), any());
  }

  @Test void retiredNotificationsStayInDatabaseButCannotListRetrySendOrConsumePermission() throws Exception {
    var a = activity(1); var owner = user(); activities.register(a.id(), owner.id(), input(1)); sendingEnabled(owner);
    var ids = new ArrayList<String>();
    for (int index = 0; index < 3; index++) {
      String id = UUID.randomUUID().toString(); ids.add(id);
      db.update("INSERT INTO notification_outbox(id,user_id,activity_id,kind,dedupe_key,title,detail,event_at,status,retired_at) VALUES(?,?,?,?,?,'Historical title','Historical detail',?,'FAILED',?)",
          id, owner.id(), a.id(), index == 1 ? "ACTIVITY_CANCELLED" : "WAITLIST_OFFER",
          "retired-fixture:" + index, a.startAt(), index == 2 ? null : OffsetDateTime.now());
    }
    String admin = token(auth.user("notification-admin", "QA admin", "ADMIN"));
    for (String id : ids) {
      mvc.perform(post("/api/v1/admin/notifications/" + id + "/retry").header("Authorization", admin))
          .andExpect(status().isNotFound());
      notifications.dispatch(id);
    }
    notifications.scan();
    verify(gateway, never()).send(anyString(), anyString(), anyString(), anyString(), any());
    assertThat(db.queryForObject("SELECT credits FROM notification_permission WHERE user_id=?", Integer.class, owner.id())).isEqualTo(1);
    notifications.activityNotice(activities.get(a.id(), true), "PRETRIP", "正常活动消息");
    mvc.perform(get("/api/v1/me/notifications?size=1").header("Authorization", token(owner)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].kind").value("PRETRIP"));
    mvc.perform(get("/api/v1/admin/notifications?size=1").header("Authorization", admin))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    notifications.scan();
    verify(gateway, times(1)).send(anyString(), anyString(), anyString(), anyString(), any());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE id IN (?,?,?) AND status='FAILED'",
        Integer.class, ids.toArray())).isEqualTo(3);
    assertThat(db.queryForObject("SELECT credits FROM notification_permission WHERE user_id=?", Integer.class, owner.id())).isZero();
    assertThatThrownBy(() -> notifications.enqueue(owner.id(), a, "WAITLIST_OFFER", "cannot-create", "retired", a.startAt()))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test void removedEndpointsAreAbsentAndIndependentNotificationRoutesRemainProtected() throws Exception {
    var a = activity(1); var owner = user(); String bearer = token(owner);
    String admin = token(auth.user("notification-admin", "QA admin", "ADMIN"));
    mvc.perform(post("/api/v1/activities/" + a.id() + "/waitlist").header("Authorization", bearer)
            .contentType("application/json").content("{}")) .andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/me/waitlist").header("Authorization", bearer)).andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/admin/waitlist").header("Authorization", admin)).andExpect(status().isNotFound());
    mvc.perform(post("/api/v1/waitlist/retired/confirm").header("Authorization", bearer)
            .contentType("application/json").content("{}")) .andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/waitlist/retired").header("Authorization", bearer)).andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/notifications/config")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/notifications/config").header("Authorization", bearer))
        .andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(false));
    mvc.perform(get("/api/v1/admin/notifications").header("Authorization", bearer)).andExpect(status().isForbidden());
    when(gateway.ready()).thenReturn(true);
    mvc.perform(post("/api/v1/me/notifications/subscribe").header("Authorization", bearer)
            .contentType("application/json").content("{\"accepted\":true}")) .andExpect(status().isOk());
    assertThat(db.queryForObject("SELECT credits FROM notification_permission WHERE user_id=?", Integer.class, owner.id())).isEqualTo(1);
  }

  @Test void historicalQueueDoesNotReserveSeatsBlockEditsOrPromoteAfterCancellation() {
    var a = activity(3); var holder = user(); activities.register(a.id(), holder.id(), input(1));
    for (String state : List.of("WAITING", "OFFERED")) {
      db.update("INSERT INTO activity_waitlist(id,activity_id,user_id,status,party_size,participants_json,privacy_version,terms_version,offer_expires_at) VALUES(?,?,?,?,5,?,1,1,?)",
          UUID.randomUUID().toString(), a.id(), user().id(), state, "historical payload", a.registrationDeadline());
    }
    var next = user(); var result = activities.register(a.id(), next.id(), input(2));
    assertThat(result.created()).isTrue(); assertThat(activities.register(a.id(), next.id(), input(2)).created()).isFalse();
    var full = activities.get(a.id(), true);
    assertThat(full.registeredCount()).isEqualTo(3);
    assertThatThrownBy(() -> activities.edit(a.id(), edit(full, 2, false, full.location(), full.startAt()), "test"))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code).isEqualTo("CAPACITY_BELOW_ENROLLED"));
    activities.cancelOwn(a.id(), next.id()); activities.cancelOwn(a.id(), next.id());
    var available = activities.get(a.id(), true);
    assertThat(available.registeredCount()).isEqualTo(1);
    var edited = activities.edit(a.id(), edit(available, 1, false, available.location(), available.startAt()), "test");
    assertThat(edited.capacity()).isEqualTo(1);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_waitlist WHERE activity_id=? AND participants_json='historical payload' AND status IN ('WAITING','OFFERED')", Integer.class, a.id())).isEqualTo(2);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM notification_outbox WHERE activity_id=?", Integer.class, a.id())).isZero();
    activities.cancelOwn(a.id(), holder.id());
    var empty = activities.get(a.id(), true);
    assertThat(activities.edit(a.id(), edit(empty, 1, true, empty.location(), empty.startAt()), "test").identityRequired()).isTrue();
    var identityInput = new RegistrationInput(List.of(new ParticipantInput("QA identity", "11010519491231002X", "13800000000")), 1L, 1L);
    assertThat(activities.register(a.id(), user().id(), identityInput).created()).isTrue();
    assertThat(activities.get(a.id(), true).registeredCount()).isEqualTo(1);
  }
}
