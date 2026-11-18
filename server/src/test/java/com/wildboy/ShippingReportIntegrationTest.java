package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class ShippingReportIntegrationTest {
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
    r.add("wildboy.identity.encryption-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
  }
  @Autowired ShippingReportService reports;
  @Autowired JdbcTemplate db;
  @Autowired PlatformTransactionManager manager;
  @MockitoBean WechatShippingService shipping;

  @BeforeEach
  void setup() {
    db.execute("TRUNCATE app_user,activity,legal_consent,legal_document_version,audit_event,product,shipping_report CASCADE");
    when(shipping.shippingEnabled()).thenReturn(true);
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenReturn(WechatShippingService.UploadResult.ok());
    when(shipping.uploadActivityFulfillmentNow(any(), any())).thenReturn(WechatShippingService.UploadResult.ok());
  }

  private String user() {
    var id = UUID.randomUUID().toString();
    db.update("INSERT INTO app_user(id,external_id,nickname,role) VALUES(?,?,'QA user','USER')", id, "wechat:qa-" + id);
    return id;
  }

  /** 商城发货夹具：已发货订单 + 物流单号 + 一条商品明细。 */
  private String shippedShopOrder(String userId) {
    var orderId = UUID.randomUUID().toString();
    var productId = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO product(id,name,description,image_url,price_cents,original_price_cents,stock,status) VALUES(?,'水壶','QA','/a.jpg',500,500,3,'ON_SALE')",
        productId);
    db.update(
        """
        INSERT INTO shop_order(id,order_no,user_id,total_cents,original_total_cents,status,recipient_name,phone,address,
          payment_transaction_id,expires_at,shipping_company,shipping_tracking_no)
        VALUES(?,'10000000000000000000000000000001',?,1000,1000,'SHIPPED','测试收件人','18900001234','测试地址',
          '42000000000000000000000000000001',CURRENT_TIMESTAMP,'顺丰速运','323244567777')
        """,
        orderId, userId);
    db.update(
        "INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity,original_price_cents) VALUES(?,?,?,'水壶','/a.jpg',500,2,500)",
        UUID.randomUUID().toString(), orderId, productId);
    return orderId;
  }

  private String paidActivityOrder(String userId) {
    var activityId = UUID.randomUUID().toString();
    var orderId = UUID.randomUUID().toString();
    var start = OffsetDateTime.now().plusDays(7);
    db.update(
        """
        INSERT INTO activity(id,title,category,cover_url,summary,description,location,meeting_point,
          start_at,end_at,registration_deadline,capacity,status,price_cents)
        VALUES(?,'徒步活动','WEEKLY','/a.jpg','QA','QA','厦门','公园',?,?,?,2,'PUBLISHED',0)
        """,
        activityId, start, start.plusHours(4), start.minusDays(1));
    db.update(
        """
        INSERT INTO activity_order(id,order_no,activity_id,activity_title,user_id,request_key,request_fingerprint,
          status,party_size,original_total_cents,total_cents,currency,quote_json,payment_transaction_id,expires_at)
        VALUES(?,'20000000000000000000000000000002',?,'徒步活动',?,'qa-key','fingerprint','PAID',2,2000,2000,'CNY','{}',
          '42000000000000000000000000000002',CURRENT_TIMESTAMP+INTERVAL '1 day')
        """,
        orderId, activityId, userId);
    return orderId;
  }

  @Test
  void successCompletionMarksTheOrderReported() {
    var reportId = reports.register("shop", UUID.randomUUID().toString(), "30000000000000000000000000000003", 1);
    finish(reportId, WechatShippingService.UploadResult.ok());
    var row = reports.get(reportId);
    assertThat(row.get("status")).isEqualTo("REPORTED");
    assertThat(row.get("attempts")).isEqualTo(1);
    assertThat(row.get("reported_at")).isNotNull();
    assertThat(row.get("last_errcode")).isEqualTo(0);
  }

  @Test
  void failedCompletionSchedulesBackoffUntilAttemptsAreExhausted() {
    var reportId = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000004", 3);
    finish(reportId, WechatShippingService.UploadResult.failed(9400001, "upload_shipping_info"));
    var first = reports.get(reportId);
    assertThat(first.get("status")).isEqualTo("FAILED");
    assertThat(first.get("attempts")).isEqualTo(1);
    assertThat(first.get("last_errcode")).isEqualTo(9400001);
    assertThat(first.get("next_retry_at")).isNotNull();

    for (int attempt = 2; attempt <= ShippingReportService.MAX_ATTEMPTS; attempt++) {
      due(reportId);
      finish(reportId, WechatShippingService.UploadResult.failed(-1, "RuntimeException"));
    }
    var exhausted = reports.get(reportId);
    assertThat(exhausted.get("attempts")).isEqualTo(ShippingReportService.MAX_ATTEMPTS);
    assertThat(exhausted.get("next_retry_at")).isNull(); // 重试耗尽，仅剩手动补报
  }

  @Test
  void skippedCompletionRecordsTheReasonWithoutRetry() {
    var reportId = reports.register("shop", UUID.randomUUID().toString(), "30000000000000000000000000000005", 1);
    finish(reportId, WechatShippingService.UploadResult.skipped("missing_transaction"));
    var row = reports.get(reportId);
    assertThat(row.get("status")).isEqualTo("SKIPPED");
    assertThat(row.get("last_error")).isEqualTo("missing_transaction");
    assertThat(row.get("reported_at")).isNull();
  }

  @Test
  void shopRetryRebuildsTheCourierPayloadAndMarksReported() {
    var userId = user();
    var orderId = shippedShopOrder(userId);
    var reportId = reports.register("shop", orderId, "30000000000000000000000000000006", 1);

    reports.retry(reportId);

    verify(shipping).uploadShopShipmentNow(any(ShopModels.Order.class), eq("顺丰速运"), eq("323244567777"));
    assertThat(reports.get(reportId).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void activityRetryRebuildsTheVirtualPayloadAndMarksReported() {
    var userId = user();
    var orderId = paidActivityOrder(userId);
    var reportId = reports.register("activity", orderId, "30000000000000000000000000000007", 3);

    when(shipping.uploadActivityFulfillmentNow(any(), any())).thenReturn(WechatShippingService.UploadResult.failed(9400001, "upload_shipping_info"));
    reports.retry(reportId);

    var order = ArgumentCaptor.forClass(ActivityOrderModels.Order.class);
    verify(shipping).uploadActivityFulfillmentNow(order.capture(), eq("42000000000000000000000000000002"));
    assertThat(order.getValue().activityTitle()).isEqualTo("徒步活动");
    assertThat(order.getValue().partySize()).isEqualTo(2);
    var row = reports.get(reportId);
    assertThat(row.get("status")).isEqualTo("FAILED");
    assertThat(row.get("last_errcode")).isEqualTo(9400001);
  }

  @Test
  void retryRefusesAnAlreadyReportedOrder() {
    var reportId = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000008", 3);
    finish(reportId, WechatShippingService.UploadResult.ok());
    assertThatThrownBy(() -> reports.retry(reportId))
        .hasMessageContaining("已上报成功");
  }

  @Test
  void dueRetriesStayIdleWhileShippingIsDisabled() {
    when(shipping.shippingEnabled()).thenReturn(false);
    reports.retryDue();
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
    verify(shipping, never()).uploadActivityFulfillmentNow(any(), any());
  }

  @Test
  void listFiltersByStatusAndPaginates() {
    var reported = reports.register("shop", UUID.randomUUID().toString(), "30000000000000000000000000000009", 1);
    finish(reported, WechatShippingService.UploadResult.ok());
    var failed = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000010", 3);
    finish(failed, WechatShippingService.UploadResult.failed(500, "upload_shipping_info"));

    var onlyFailed = reports.list(0, 20, "FAILED");
    assertThat(onlyFailed.total()).isEqualTo(1);
    assertThat(onlyFailed.items().getFirst().get("id")).isEqualTo(failed);
    var all = reports.list(0, 1, null);
    assertThat(all.total()).isEqualTo(2);
    assertThat(all.items()).hasSize(1);
    assertThatThrownBy(() -> reports.list(0, 20, "NOPE")).hasMessageContaining("上报状态无效");
  }

  private void due(String id) {
    db.update("UPDATE shipping_report SET next_retry_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?", id);
  }

  private void finish(String id, WechatShippingService.UploadResult result) {
    var claim = reports.claim(id, false);
    assertThat(claim).isNotNull();
    reports.complete(id, claim.token(), result);
  }

  private String shopReport() {
    return reports.register("shop", shippedShopOrder(user()), "test-shop", 1);
  }

  @ParameterizedTest
  @ValueSource(strings = {"PENDING", "FAILED", "SKIPPED"})
  void historicalSuccessTimestampBlocksAllReportingEvenIfStatusWasRegressed(String status) {
    String id = shopReport();
    db.update("UPDATE shipping_report SET status=?,reported_at=CURRENT_TIMESTAMP WHERE id=?", status, id);
    var before = reports.get(id);
    reports.submitAfterCommit(id);
    reports.retryDue();
    assertThat(reports.claim(id, true)).isNull();
    assertThatThrownBy(() -> reports.retry(id)).hasMessageContaining("已上报成功");
    assertThat(reports.get(id)).isEqualTo(before);
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
  }

  @Test
  void dispatchKeepsTheOrderLockedWhileTheGatewayIsRunning() throws Exception {
    String id = shopReport();
    String order = (String) reports.get(id).get("order_id");
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenAnswer(call -> {
      entered.countDown();
      assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
      return WechatShippingService.UploadResult.ok();
    });
    try (var pool = Executors.newSingleThreadExecutor()) {
      var upload = pool.submit(() -> reports.retry(id));
      try {
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
        // 退款流程也先拿同一订单锁，无法在检查通过后抢先提交退款。
        assertThatThrownBy(() -> db.queryForObject("SELECT id FROM shop_order WHERE id=? FOR UPDATE NOWAIT", String.class, order))
            .rootCause().isInstanceOfSatisfying(java.sql.SQLException.class,
                e -> assertThat(e.getSQLState()).isEqualTo("55P03"));
      } finally { release.countDown(); }
      upload.get(10, TimeUnit.SECONDS);
    }
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void exceptionAfterBusinessCommitPersistsFailureInANewTransaction() {
    String order = shippedShopOrder(user());
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenThrow(new IllegalStateException("private"));
    String id = new TransactionTemplate(manager).execute(s -> {
      String report = reports.register("shop", order, "test", 1);
      reports.submitAfterCommit(report);
      return report;
    });
    assertThat(reports.get(id).get("status")).isEqualTo("FAILED");
    assertThat(reports.get(id).get("last_error")).isEqualTo("dispatch_failed");
    assertThat(reports.get(id).get("next_retry_at")).isNotNull();
  }

  @Test
  void duplicateRegistrationReturnsThePersistedIdAndPreservesFailureAndSuccess() {
    String order = UUID.randomUUID().toString();
    String id = reports.register("shop", order, "original", 1);
    finish(id, WechatShippingService.UploadResult.failed(-1, "trade_management_query_failed"));
    var failed = reports.get(id);
    assertThat(reports.register("shop", order, "replacement", 1)).isEqualTo(id);
    assertThat(reports.get(id)).isEqualTo(failed);
    due(id);
    finish(id, WechatShippingService.UploadResult.ok());
    var reported = reports.get(id);
    assertThat(reports.register("shop", order, "replacement", 1)).isEqualTo(id);
    assertThat(reports.get(id)).isEqualTo(reported);
    assertThat(reported.get("next_retry_at")).isNull();
  }

  @Test
  void concurrentRegistrationHasOneIdAndDoesNotResetAClaim() throws Exception {
    String order = UUID.randomUUID().toString();
    var start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(6)) {
      var jobs = new java.util.ArrayList<java.util.concurrent.Future<String>>();
      for (int i = 0; i < 6; i++) jobs.add(pool.submit(() -> {
        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
        return reports.register("shop", order, "concurrent", 1);
      }));
      start.countDown();
      String id = jobs.getFirst().get(10, TimeUnit.SECONDS);
      for (var job : jobs) assertThat(job.get(10, TimeUnit.SECONDS)).isEqualTo(id);
      var claim = reports.claim(id, false);
      assertThat(reports.register("shop", order, "concurrent", 1)).isEqualTo(id);
      assertThat(reports.claim(id, true)).isNull();
      reports.complete(id, claim.token(), WechatShippingService.UploadResult.ok());
      assertThat(reports.get(id).get("attempts")).isEqualTo(1);
    }
  }

  @Test
  void duplicateAndLateCompletionsCannotIncreaseAttemptsOrRegressSuccess() throws Exception {
    String id = shopReport();
    var claim = reports.claim(id, false);
    try (var pool = Executors.newFixedThreadPool(6)) {
      var jobs = new java.util.ArrayList<java.util.concurrent.Future<?>>();
      for (int i = 0; i < 6; i++) jobs.add(pool.submit(() ->
          reports.complete(id, claim.token(), WechatShippingService.UploadResult.failed(-1, "failed"))));
      for (var job : jobs) job.get(10, TimeUnit.SECONDS);
    }
    assertThat(reports.get(id).get("attempts")).isEqualTo(1);
    due(id);
    var next = reports.claim(id, false);
    reports.complete(id, claim.token(), WechatShippingService.UploadResult.ok());
    assertThat(reports.get(id).get("status")).isEqualTo("FAILED");
    reports.complete(id, next.token(), WechatShippingService.UploadResult.ok());
    var success = reports.get(id);
    reports.complete(id, next.token(), WechatShippingService.UploadResult.failed(-1, "late"));
    reports.complete(id, claim.token(), WechatShippingService.UploadResult.skipped("late"));
    reports.complete("missing", claim.token(), WechatShippingService.UploadResult.ok());
    assertThat(reports.get(id)).isEqualTo(success);
    reports.retryDue();
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
  }

  @Test
  void expiredLeaseAllowsRecoveryButItsOldCompletionIsFenced() {
    String id = shopReport();
    var old = reports.claim(id, false);
    due(id);
    assertThat(reports.claim(id, false)).isNull();
    db.update("UPDATE shipping_report SET lease_until=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?", id);
    var current = reports.claim(id, false);
    assertThat(current.token()).isNotEqualTo(old.token());
    reports.complete(id, old.token(), WechatShippingService.UploadResult.failed(-1, "late"));
    reports.complete(id, current.token(), WechatShippingService.UploadResult.ok());
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
    assertThat(reports.get(id).get("attempts")).isEqualTo(2);
  }

  @Test
  void initialManualAndScheduledDispatchShareOneClaim() throws Exception {
    String id = shopReport();
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenAnswer(call -> {
      entered.countDown();
      assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
      return WechatShippingService.UploadResult.ok();
    });
    try (var pool = Executors.newFixedThreadPool(3)) {
      var first = pool.submit(() -> reports.submitAfterCommit(id));
      assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
      var manual = pool.submit(() -> {
        try { reports.retry(id); } catch (ApiException e) { assertThat(e.code).isEqualTo("SHIPPING_ALREADY_REPORTED"); }
      });
      var scheduled = pool.submit(() -> reports.retryDue());
      release.countDown();
      first.get(10, TimeUnit.SECONDS);
      manual.get(10, TimeUnit.SECONDS);
      scheduled.get(10, TimeUnit.SECONDS);
    } finally { release.countDown(); }
    verify(shipping, times(1)).uploadShopShipmentNow(any(), any(), any());
    assertThat(reports.get(id).get("attempts")).isEqualTo(1);
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void transientFailureRecoversAndRepeatedScansOrClicksRespectBackoff() {
    String id = shopReport();
    when(shipping.uploadShopShipmentNow(any(), any(), any()))
        .thenReturn(WechatShippingService.UploadResult.failed(-1, "trade_management_query_failed"),
            WechatShippingService.UploadResult.ok());
    reports.retryDue();
    for (int i = 0; i < 3; i++) { reports.retryDue(); reports.retry(id); }
    verify(shipping, times(1)).uploadShopShipmentNow(any(), any(), any());
    due(id);
    reports.retryDue();
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
    assertThat(reports.get(id).get("attempts")).isEqualTo(2);
    reports.retryDue();
    verify(shipping, times(2)).uploadShopShipmentNow(any(), any(), any());
  }

  @Test
  void disabledThenEnabledKeepsPendingWorkAndRetryBudget() {
    String id = shopReport();
    when(shipping.shippingEnabled()).thenReturn(false);
    reports.submitAfterCommit(id);
    reports.retryDue();
    reports.retry(id);
    assertThat(reports.get(id).get("status")).isEqualTo("PENDING");
    assertThat(reports.get(id).get("attempts")).isEqualTo(0);
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
    when(shipping.shippingEnabled()).thenReturn(true);
    when(shipping.uploadShopShipmentNow(any(), any(), any()))
        .thenReturn(WechatShippingService.UploadResult.disabled(), WechatShippingService.UploadResult.ok());
    reports.retryDue();
    assertThat(reports.get(id).get("attempts")).isEqualTo(0);
    assertThat(reports.get(id).get("status")).isEqualTo("PENDING");
    reports.retryDue();
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void notOpenUsesSlowBackoffAndPersistentFailuresStopAtTheBudget() {
    String id = shopReport();
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenReturn(WechatShippingService.UploadResult.notOpen());
    reports.retryDue();
    assertThat(db.queryForObject("SELECT next_retry_at>CURRENT_TIMESTAMP+INTERVAL '359 minutes' FROM shipping_report WHERE id=?", Boolean.class, id)).isTrue();
    for (int i = 1; i < ShippingReportService.MAX_ATTEMPTS; i++) { due(id); reports.retryDue(); }
    assertThat(reports.get(id).get("attempts")).isEqualTo(ShippingReportService.MAX_ATTEMPTS);
    assertThat(reports.get(id).get("next_retry_at")).isNull();
    reports.retryDue();
    reports.retry(id);
    verify(shipping, times(ShippingReportService.MAX_ATTEMPTS)).uploadShopShipmentNow(any(), any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"PAID", "REFUNDED", "CANCELLED", "PENDING_PAYMENT"})
  void unfulfilledOrRefundedShopOrdersAreNeverUploaded(String status) {
    String id = shopReport();
    db.update("UPDATE shop_order SET status=? WHERE id=(SELECT order_id FROM shipping_report WHERE id=?)", status, id);
    reports.retry(id);
    reports.retryDue();
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"REFUND_PENDING", "REFUNDED", "CLOSED", "PENDING_PAYMENT"})
  void unfulfilledOrRefundedActivitiesAreNeverUploaded(String status) {
    String order = paidActivityOrder(user());
    String id = reports.register("activity", order, "activity", 3);
    db.update("UPDATE activity_order SET status=? WHERE id=?", status, order);
    reports.retry(id);
    verify(shipping, never()).uploadActivityFulfillmentNow(any(), any());
  }

  @Test
  void missingTransactionAndRefundRequestsBlockShipment() {
    String id = shopReport();
    db.update("UPDATE shop_order SET payment_transaction_id=NULL WHERE id=(SELECT order_id FROM shipping_report WHERE id=?)", id);
    reports.retry(id);
    assertThat(reports.get(id).get("last_error")).isEqualTo("missing_transaction");
    assertThat(reports.get(id).get("next_retry_at")).isNull();
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
  }

  @Test
  void activeRefundBlocksAnOtherwiseFulfilledOrderAndCanRecoverAfterRejection() {
    String id = shopReport();
    db.update("""
        INSERT INTO refund_request(id,order_id,user_id,out_refund_no,amount_cents,reason,status)
        SELECT ?,o.id,o.user_id,'test-refund',1000,'test','REQUESTED' FROM shop_order o
        JOIN shipping_report r ON r.order_id=o.id WHERE r.id=?
        """, UUID.randomUUID().toString(), id);
    reports.retry(id);
    assertThat(reports.get(id).get("last_error")).isEqualTo("refund_pending");
    verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
    db.update("UPDATE refund_request SET status='REJECTED'");
    due(id);
    reports.retryDue();
    assertThat(reports.get(id).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void failuresBeforeUploadAlsoPersistBackoff() {
    String id = shopReport();
    when(shipping.uploadShopShipmentNow(any(), any(), any())).thenThrow(new IllegalStateException("sensitive"));
    reports.retry(id);
    assertThat(reports.get(id).get("last_error")).isEqualTo("dispatch_failed");
    assertThat(reports.get(id).get("attempts")).isEqualTo(1);
    reports.retryDue();
    verify(shipping, times(1)).uploadShopShipmentNow(any(), any(), any());
  }

  @Test
  void afterCommitReallyPersistsAndRollbackDoesNotDispatch() {
    String order = shippedShopOrder(user());
    var transaction = new TransactionTemplate(manager);
    String rolledBack = transaction.execute(s -> {
      String id = reports.register("shop", order, "rollback", 1);
      reports.submitAfterCommit(id);
      verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
      s.setRollbackOnly();
      return id;
    });
    assertThatThrownBy(() -> reports.get(rolledBack)).isInstanceOf(ApiException.class);
    String committed = transaction.execute(s -> {
      String id = reports.register("shop", order, "commit", 1);
      reports.submitAfterCommit(id);
      verify(shipping, never()).uploadShopShipmentNow(any(), any(), any());
      return id;
    });
    assertThat(reports.get(committed).get("status")).isEqualTo("REPORTED");
    verify(shipping, times(1)).uploadShopShipmentNow(any(), any(), any());
  }
}
