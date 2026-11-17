package com.wildboy;

import static com.wildboy.Models.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 微信「电商订单（订单中心）」配套端点。
 *
 * <ul>
 *   <li>用户侧：按订单号解析订单（微信订单中心深链以 ${商品订单号} 跳入小程序订单详情页）、
 *       确认收货（经微信 get_order 复核后落库，防伪造组件回调）；
 *   <li>管理侧：订单中心状态（订单详情路径 + 结算确认完成度）、配置订单详情路径。
 * </ul>
 */
@RestController
public class OrderCenterController {
  final ShopService shop;
  final JdbcTemplate db;
  final WechatOrderCenterService wechatOrders;

  public OrderCenterController(
      ShopService shop, JdbcTemplate db, WechatOrderCenterService wechatOrders) {
    this.shop = shop;
    this.db = db;
    this.wechatOrders = wechatOrders;
  }

  /** 微信订单中心深链与订单详情页入口：按商户订单号解析本人订单的类型与 id。 */
  @GetMapping("/api/v1/order-center/resolve")
  Map<String, String> resolve(@RequestParam String no, @AuthenticationPrincipal Models.User user) {
    if (no == null || no.isBlank()) throw ApiException.notFound();
    var found = db.query(
        "SELECT id FROM shop_order WHERE order_no=? AND user_id=? LIMIT 1",
        (r, n) -> r.getString("id"), no.strip(), user.id());
    if (!found.isEmpty()) return Map.of("type", "shop", "id", found.getFirst());
    found = db.query(
        "SELECT id FROM activity_order WHERE order_no=? AND user_id=? LIMIT 1",
        (r, n) -> r.getString("id"), no.strip(), user.id());
    if (!found.isEmpty()) return Map.of("type", "activity", "id", found.getFirst());
    throw ApiException.notFound();
  }

  public record ConfirmReceiptOutput(String orderId, boolean receiptConfirmed) {}

  /**
   * 确认收货：仅已发货的微信支付装备订单；服务端以微信 get_order 复核 order_state≥3
   * 后写入 receipt_confirmed_at。发货上报开关关闭（测试环境）时跳过复核直接落库，
   * 与发货上报的守卫口径一致。
   */
  @PostMapping("/api/v1/order-center/orders/{id}/confirm-receipt")
  ConfirmReceiptOutput confirmReceipt(
      @PathVariable String id, @AuthenticationPrincipal Models.User user) {
    var order = shop.order(id, user.id(), false);
    if (!"SHIPPED".equals(order.status()))
      throw ApiException.conflict("ORDER_NOT_SHIPPED",
          "只有已发货订单可以确认收货");
    if (order.receiptConfirmedAt() != null)
      return new ConfirmReceiptOutput(order.id(), true);
    if (order.paymentTransactionId() == null || order.paymentTransactionId().isBlank())
      throw ApiException.conflict("NO_WECHAT_TRANSACTION",
          "免微信支付订单无需确认收货");
    var verify = wechatOrders.verifyReceiptConfirmed(order.paymentTransactionId());
    if (verify.attempted() && verify.errcode() == 0) {
      int state = WechatOrderCenterService.orderState(verify);
      if (state < WechatOrderCenterService.ORDER_STATE_CONFIRMED)
        throw ApiException.conflict("RECEIPT_NOT_CONFIRMED_WECHAT",
            "微信订单状态尚未确认收货，请稍后重试");
    } else if (verify.attempted()) {
      throw ApiException.conflict("WECHAT_ORDER_VERIFY_FAILED",
          "微信订单状态核对未通过（errcode=" + verify.errcode() + "），请稍后重试");
    }
    db.update(
        "UPDATE shop_order SET receipt_confirmed_at=CURRENT_TIMESTAMP,"
            + "version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND receipt_confirmed_at IS NULL",
        id);
    return new ConfirmReceiptOutput(order.id(), true);
  }

  /** 管理侧状态：当前订单详情路径 + 结算确认完成度（开启外呼时）。 */
  @GetMapping("/api/v1/admin/wechat-order-center/status")
  Map<String, Object> status() {
    var path = wechatOrders.getOrderDetailPath();
    var confirmation = wechatOrders.confirmationCompleted();
    Map<String, Object> out = new java.util.LinkedHashMap<>();
    out.put("enabled", wechatOrders.enabled());
    out.put("orderDetailPathConfigured", path.attempted() && path.errcode() == 0
        && path.body() != null && !path.body().path("path").asText("").isBlank());
    out.put("orderDetailPath", path.body() == null ? ""
        : path.body().path("path").asText(""));
    out.put("confirmationCompleted", confirmation.attempted() && confirmation.errcode() == 0
        && confirmation.body() != null
        && confirmation.body().path("is_completed").asBoolean(false));
    out.put("pathErrcode", path.errcode());
    out.put("confirmationErrcode", confirmation.errcode());
    return out;
  }

  public record OrderDetailPathInput(
      @NotBlank @Size(max = 256) String path) {}

  @PutMapping("/api/v1/admin/wechat-order-center/order-detail-path")
  Map<String, Object> updateOrderDetailPath(@Valid @RequestBody OrderDetailPathInput input) {
    if (!WechatOrderCenterService.validDetailPath(input.path()))
      throw new ApiException(400, "INVALID_ORDER_PATH",
          "订单详情路径需包含 ${商品订单号} 占位符");
    var result = wechatOrders.updateOrderDetailPath(input.path());
    if (result == null)
      throw ApiException.conflict("WECHAT_ORDER_CENTER_UNAVAILABLE", "微信订单服务不可用");
    return Map.of(
        "attempted", result.attempted(),
        "errcode", result.errcode(),
        "error", result.error());
  }
}
