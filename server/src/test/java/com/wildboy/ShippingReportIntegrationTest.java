package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
  @MockitoBean WechatShippingService shipping;

  @BeforeEach
  void setup() {
    db.execute("TRUNCATE app_user,activity,legal_consent,legal_document_version,audit_event,product,shipping_report CASCADE");
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
    reports.complete(reportId, WechatShippingService.UploadResult.ok());
    var row = reports.get(reportId);
    assertThat(row.get("status")).isEqualTo("REPORTED");
    assertThat(row.get("attempts")).isEqualTo(1);
    assertThat(row.get("reported_at")).isNotNull();
    assertThat(row.get("last_errcode")).isEqualTo(0);
  }

  @Test
  void failedCompletionSchedulesBackoffUntilAttemptsAreExhausted() {
    var reportId = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000004", 3);
    reports.complete(reportId, WechatShippingService.UploadResult.failed(9400001, "upload_shipping_info"));
    var first = reports.get(reportId);
    assertThat(first.get("status")).isEqualTo("FAILED");
    assertThat(first.get("attempts")).isEqualTo(1);
    assertThat(first.get("last_errcode")).isEqualTo(9400001);
    assertThat(first.get("next_retry_at")).isNotNull();

    for (int attempt = 2; attempt <= ShippingReportService.MAX_ATTEMPTS; attempt++) {
      db.update("UPDATE shipping_report SET attempts=? WHERE id=?", attempt - 1, reportId);
      reports.complete(reportId, WechatShippingService.UploadResult.failed(-1, "RuntimeException"));
    }
    var exhausted = reports.get(reportId);
    assertThat(exhausted.get("attempts")).isEqualTo(ShippingReportService.MAX_ATTEMPTS);
    assertThat(exhausted.get("next_retry_at")).isNull(); // 重试耗尽，仅剩手动补报
  }

  @Test
  void skippedCompletionRecordsTheReasonWithoutRetry() {
    var reportId = reports.register("shop", UUID.randomUUID().toString(), "30000000000000000000000000000005", 1);
    reports.complete(reportId, WechatShippingService.UploadResult.skipped("missing_transaction"));
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
    @SuppressWarnings("unchecked")
    var consumer = ArgumentCaptor.forClass(Consumer.class);

    reports.retry(reportId);

    verify(shipping).uploadShopShipment(any(ShopModels.Order.class), eq("顺丰速运"), eq("323244567777"), consumer.capture());
    consumer.getValue().accept(WechatShippingService.UploadResult.ok());
    assertThat(reports.get(reportId).get("status")).isEqualTo("REPORTED");
  }

  @Test
  void activityRetryRebuildsTheVirtualPayloadAndMarksReported() {
    var userId = user();
    var orderId = paidActivityOrder(userId);
    var reportId = reports.register("activity", orderId, "30000000000000000000000000000007", 3);
    @SuppressWarnings("unchecked")
    var consumer = ArgumentCaptor.forClass(Consumer.class);

    reports.retry(reportId);

    var order = ArgumentCaptor.forClass(ActivityOrderModels.Order.class);
    verify(shipping).uploadActivityFulfillment(order.capture(), eq("42000000000000000000000000000002"), consumer.capture());
    assertThat(order.getValue().activityTitle()).isEqualTo("徒步活动");
    assertThat(order.getValue().partySize()).isEqualTo(2);
    consumer.getValue().accept(WechatShippingService.UploadResult.failed(9400001, "upload_shipping_info"));
    var row = reports.get(reportId);
    assertThat(row.get("status")).isEqualTo("FAILED");
    assertThat(row.get("last_errcode")).isEqualTo(9400001);
  }

  @Test
  void retryRefusesAnAlreadyReportedOrder() {
    var reportId = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000008", 3);
    reports.complete(reportId, WechatShippingService.UploadResult.ok());
    assertThatThrownBy(() -> reports.retry(reportId))
        .hasMessageContaining("已上报成功");
  }

  @Test
  void dueRetriesStayIdleWhileShippingIsDisabled() {
    when(shipping.shippingEnabled()).thenReturn(false);
    reports.retryDue();
    verify(shipping, never()).uploadShopShipment(any(), any(), any(), any());
    verify(shipping, never()).uploadActivityFulfillment(any(), any(), any());
  }

  @Test
  void listFiltersByStatusAndPaginates() {
    var reported = reports.register("shop", UUID.randomUUID().toString(), "30000000000000000000000000000009", 1);
    reports.complete(reported, WechatShippingService.UploadResult.ok());
    var failed = reports.register("activity", UUID.randomUUID().toString(), "30000000000000000000000000000010", 3);
    reports.complete(failed, WechatShippingService.UploadResult.failed(500, "upload_shipping_info"));

    var onlyFailed = reports.list(0, 20, "FAILED");
    assertThat(onlyFailed.total()).isEqualTo(1);
    assertThat(onlyFailed.items().getFirst().get("id")).isEqualTo(failed);
    var all = reports.list(0, 1, null);
    assertThat(all.total()).isEqualTo(2);
    assertThat(all.items()).hasSize(1);
    assertThatThrownBy(() -> reports.list(0, 20, "NOPE")).hasMessageContaining("上报状态无效");
  }
}
