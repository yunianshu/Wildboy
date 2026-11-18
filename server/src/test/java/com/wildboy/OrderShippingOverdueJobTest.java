package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 微信支付单超时未发货本地预警：24h/40h 两级、每级每单一次、退款中不告警、
 * 免支付单与活动单不参与；运营看板计数与异常列表联动。全部为本地合成数据。
 */
@SpringBootTest
class OrderShippingOverdueJobTest {
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
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
    r.add("wildboy.orders.shipping-due-scan-ms", () -> 3600000);
  }

  @Autowired OrderShippingOverdueJob job;
  @Autowired OperationsService operations;
  @Autowired JdbcTemplate db;

  @BeforeEach
  void clean() {
    db.execute("TRUNCATE shop_order,shop_order_item,refund_request,audit_event CASCADE");
    db.update("DELETE FROM product");
    db.update("DELETE FROM app_user");
  }

  private String order(String status, String transaction, int hoursAgo) {
    String id = UUID.randomUUID().toString();
    String orderNo = id.replace("-", "");
    db.update("INSERT INTO app_user(id,external_id,nickname,role) VALUES(?,?,'QA','USER')",
        id, "wechat:" + id);
    db.update("""
        INSERT INTO shop_order(id,order_no,user_id,total_cents,original_total_cents,status,
          recipient_name,phone,address,payment_transaction_id,paid_at,expires_at)
        VALUES(?,?,?,?,?,?,'QA','13800000000','QA 地址',?,CURRENT_TIMESTAMP-(? * INTERVAL '1 hour'),CURRENT_TIMESTAMP)
        """, id, orderNo, id, 100, 100, status, transaction, hoursAgo);
    return id;
  }

  @Test
  void escalatesAt24And40HoursOncePerOrderAndSkipsIneligibleOrders() {
    var due24 = order("PAID", "tx-due-24", 25);
    var due40 = order("PAID", "tx-due-40", 41);
    var free = order("PAID", null, 30);            // 免支付单：无微信 48 小时约束
    var shipped = order("SHIPPED", "tx-shipped", 30);
    var refunded = order("PAID", "tx-refund", 30);
    db.update("INSERT INTO refund_request(id,order_id,user_id,out_refund_no,amount_cents,reason,status) VALUES(?,?,?,?,100,'QA','REQUESTED')",
        UUID.randomUUID().toString(), refunded, refunded, refunded.replace("-", ""));

    job.warn();

    assertThat(auditCount(due24, "SHIPPING_DUE_24H")).isEqualTo(1);
    assertThat(auditCount(due24, "SHIPPING_DUE_40H")).isZero();
    assertThat(auditCount(due40, "SHIPPING_DUE_24H")).isEqualTo(1);
    assertThat(auditCount(due40, "SHIPPING_DUE_40H")).isEqualTo(1);
    for (String excluded : new String[] {free, shipped, refunded})
      assertThat(db.queryForObject(
          "SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND actor_id='system'", Integer.class, excluded))
          .as("订单 %s 不应告警", excluded).isZero();

    // 重复扫描不重复告警
    job.warn();
    assertThat(auditCount(due24, "SHIPPING_DUE_24H")).isEqualTo(1);
    assertThat(auditCount(due40, "SHIPPING_DUE_40H")).isEqualTo(1);

    // 看板计数：due24 落在 24-40h 区间，due40 计入超时
    var dashboard = operations.dashboard(7);
    assertThat(dashboard.get("shippingDueSoon")).isEqualTo(1L);
    assertThat(dashboard.get("shippingOverdue")).isEqualTo(1L);
    // 异常列表按严重程度标注
    var exceptions = operations.exceptions(0, 20);
    var messages = exceptions.items().stream()
        .filter(row -> "SHIPPING".equals(row.get("kind")))
        .map(row -> (String) row.get("message"));
    assertThat(messages).containsExactlyInAnyOrder("微信单超24小时未发货", "微信单超40小时未发货");
  }

  @Test
  void refundedOrderStopsAlertingAfterBacklogClears() {
    var id = order("PAID", "tx-clears", 41);
    job.warn();
    assertThat(auditCount(id, "SHIPPING_DUE_40H")).isEqualTo(1);
    // 发货后异常列表与计数回落
    db.update("UPDATE shop_order SET status='SHIPPED' WHERE id=?", id);
    var dashboard = operations.dashboard(7);
    assertThat(dashboard.get("shippingDueSoon")).isEqualTo(0L);
    assertThat(dashboard.get("shippingOverdue")).isEqualTo(0L);
    assertThat(operations.exceptions(0, 20).items().stream()
        .filter(row -> "SHIPPING".equals(row.get("kind"))).count()).isZero();
  }

  private int auditCount(String orderId, String action) {
    return db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action=?",
        Integer.class, orderId, action);
  }
}
