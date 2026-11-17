package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 微信订单中心端点：深链解析的鉴权与归属、确认收货的服务端复核落库、
 * 管理侧路径配置的占位符校验。微信外呼全部通过 MockitoBean 模拟。
 */
@SpringBootTest
@AutoConfigureMockMvc
class OrderCenterIntegrationTest {
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
  }

  @Autowired MockMvc mvc;
  @Autowired AuthService auth;
  @Autowired JdbcTemplate db;
  @Autowired ObjectMapper json;
  @MockitoBean WechatOrderCenterService wechatOrders;

  Models.User owner;
  String token;

  @BeforeEach
  void setup() {
    db.update("TRUNCATE app_user,shop_order,shop_order_item,product,activity,activity_order CASCADE");
    owner = auth.user("order-center-qa:" + UUID.randomUUID(), "QA", "USER");
    token = "Bearer " + auth.login(owner).token();
  }

  private String shopOrder(String userId, String status, String transactionId, String orderNo) {
    var orderId = UUID.randomUUID().toString();
    var productId = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO product(id,name,description,image_url,price_cents,original_price_cents,stock,status)"
            + " VALUES(?,'水壶','QA','/a.jpg',500,500,3,'ON_SALE')",
        productId);
    db.update(
        """
        INSERT INTO shop_order(id,order_no,user_id,total_cents,original_total_cents,status,recipient_name,phone,address,
          payment_transaction_id,expires_at,shipping_company,shipping_tracking_no)
        VALUES(?,?,?,?,?,?,'测试收件人','18900001234','测试地址',?,CURRENT_TIMESTAMP,'顺丰速运','323244567777')
        """,
        orderId, orderNo, userId, 1000, 1000, status, transactionId);
    db.update(
        "INSERT INTO shop_order_item(id,order_id,product_id,product_name,image_url,price_cents,quantity,original_price_cents)"
            + " VALUES(?,?,?,'水壶','/a.jpg',500,2,500)",
        UUID.randomUUID().toString(), orderId, productId);
    return orderId;
  }

  private String activityOrder(String userId, String orderNo) {
    var activityId = UUID.randomUUID().toString();
    var orderId = UUID.randomUUID().toString();
    var start = java.time.OffsetDateTime.now().plusDays(7);
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
        VALUES(?,?,?,'徒步活动',?,'qa-key','fingerprint','PAID',2,2000,2000,'CNY','{}',
          '42000000000000000000000000000002',CURRENT_TIMESTAMP+INTERVAL '1 day')
        """,
        orderId, orderNo, activityId, userId);
    return orderId;
  }

  @Test
  void resolveRequiresOwnershipAndMapsBothOrderKinds() throws Exception {
    var shopNo = "3" + "0".repeat(31);
    var shopId = shopOrder(owner.id(), "PAID", "42000000000000000000000000000011", shopNo);
    var activityNo = "4" + "0".repeat(31);
    activityOrder(owner.id(), activityNo);

    mvc.perform(get("/api/v1/order-center/resolve").param("no", shopNo))
        .andExpect(status().isUnauthorized());

    mvc.perform(get("/api/v1/order-center/resolve").header("Authorization", token).param("no", shopNo))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.type").value("shop"))
        .andExpect(jsonPath("$.id").value(shopId));

    mvc.perform(get("/api/v1/order-center/resolve").header("Authorization", token).param("no", activityNo))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.type").value("activity"));

    var stranger = "Bearer " + auth.login(
        auth.user("order-center-qa:other" + UUID.randomUUID(), "Other", "USER")).token();
    mvc.perform(get("/api/v1/order-center/resolve").header("Authorization", stranger).param("no", shopNo))
        .andExpect(status().isNotFound());

    mvc.perform(get("/api/v1/order-center/resolve").header("Authorization", token).param("no", "not-exist"))
        .andExpect(status().isNotFound());
  }

  @Test
  void confirmReceiptVerifiesWechatStateBeforePersisting() throws Exception {
    var pending = shopOrder(owner.id(), "PAID", "42000000000000000000000000000021", "5" + "0".repeat(31));
    mvc.perform(post("/api/v1/order-center/orders/" + pending + "/confirm-receipt")
            .header("Authorization", token))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ORDER_NOT_SHIPPED"));

    var orderId = shopOrder(owner.id(), "SHIPPED", "42000000000000000000000000000022", "6" + "0".repeat(31));

    // 微信复核返回已确认收货（官方响应 order.order_state=3）→ 落库成功
    var confirmed = new WechatOrderCenterService.CallResult(true, 0, "",
        new ObjectMapper().createObjectNode().putObject("order").put("order_state", 3));
    when(wechatOrders.verifyReceiptConfirmed("42000000000000000000000000000022")).thenReturn(confirmed);
    mvc.perform(post("/api/v1/order-center/orders/" + orderId + "/confirm-receipt")
            .header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.receiptConfirmed").value(true));
    assertThat(db.queryForObject(
        "SELECT receipt_confirmed_at FROM shop_order WHERE id=?", java.time.OffsetDateTime.class, orderId))
        .isNotNull();

    // 重复确认保持幂等
    mvc.perform(post("/api/v1/order-center/orders/" + orderId + "/confirm-receipt")
            .header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.receiptConfirmed").value(true));

    // 微信侧尚未确认（order.order_state=2）→ 拒绝且不落库
    var early = new WechatOrderCenterService.CallResult(true, 0, "",
        new ObjectMapper().createObjectNode().putObject("order").put("order_state", 2));
    when(wechatOrders.verifyReceiptConfirmed("42000000000000000000000000000023")).thenReturn(early);
    var another = shopOrder(owner.id(), "SHIPPED", "42000000000000000000000000000023", "7" + "0".repeat(31));
    mvc.perform(post("/api/v1/order-center/orders/" + another + "/confirm-receipt")
            .header("Authorization", token))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("RECEIPT_NOT_CONFIRMED_WECHAT"));
    assertThat(db.queryForObject(
        "SELECT receipt_confirmed_at FROM shop_order WHERE id=?", java.time.OffsetDateTime.class, another))
        .isNull();
  }

  @Test
  void confirmReceiptSkipsWechatVerificationWhenOrderCenterDisabled() throws Exception {
    var orderId = shopOrder(owner.id(), "SHIPPED", "42000000000000000000000000000024", "8" + "0".repeat(31));
    when(wechatOrders.verifyReceiptConfirmed("42000000000000000000000000000024"))
        .thenReturn(new WechatOrderCenterService.CallResult(false, 0, "disabled", null));
    mvc.perform(post("/api/v1/order-center/orders/" + orderId + "/confirm-receipt")
            .header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.receiptConfirmed").value(true));
  }

  @Test
  void adminStatusAndPathConfigurationRequireAdminRole() throws Exception {
    var admin = "Bearer " + auth.login(
        auth.user("order-center-qa:admin" + UUID.randomUUID(), "Admin", "ADMIN")).token();

    when(wechatOrders.getOrderDetailPath()).thenReturn(new WechatOrderCenterService.CallResult(
        false, 0, "disabled", null));
    when(wechatOrders.confirmationCompleted()).thenReturn(new WechatOrderCenterService.CallResult(
        false, 0, "disabled", null));

    mvc.perform(get("/api/v1/admin/wechat-order-center/status"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/admin/wechat-order-center/status").header("Authorization", token))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/admin/wechat-order-center/status").header("Authorization", admin))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.enabled").value(false));

    mvc.perform(put("/api/v1/admin/wechat-order-center/order-detail-path")
            .header("Authorization", admin)
            .contentType("application/json")
            .content(json.writeValueAsString(
                new OrderCenterController.OrderDetailPathInput("pages/orders/index"))))
        .andExpect(status().isBadRequest());

    when(wechatOrders.updateOrderDetailPath("pages/order-detail/index?no=${商品订单号}"))
        .thenReturn(new WechatOrderCenterService.CallResult(true, 0, "", null));
    mvc.perform(put("/api/v1/admin/wechat-order-center/order-detail-path")
            .header("Authorization", admin)
            .contentType("application/json")
            .content(json.writeValueAsString(new OrderCenterController.OrderDetailPathInput(
                "pages/order-detail/index?no=${商品订单号}"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.errcode").value(0));
  }
}
