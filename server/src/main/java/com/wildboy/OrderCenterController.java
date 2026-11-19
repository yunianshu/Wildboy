package com.wildboy;

import static com.wildboy.Models.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

/**
 * 微信「电商订单（订单中心）」配套端点。
 *
 * <ul>
 *   <li>用户侧：按订单号解析订单（微信订单中心深链以 ${商品订单号} 跳入小程序订单详情页）、
 *       确认收货（经微信 get_order 复核后落库，防伪造组件回调）；</li>
 *   <li>管理侧：订单中心状态（订单详情路径 + 结算确认完成度）、配置订单详情路径。</li>
 * </ul>
 */
@RestController
public class OrderCenterController {
  final ShopService shop;
  final JdbcTemplate db;
  final WechatOrderCenterService wechatOrders;
  final TransactionTemplate transactions;

  public OrderCenterController(
      ShopService shop,
      JdbcTemplate db,
      WechatOrderCenterService wechatOrders,
      PlatformTransactionManager transactionManager) {
    this.shop = shop;
    this.db = db;
    this.wechatOrders = wechatOrders;
    this.transactions = new TransactionTemplate(transactionManager);
  }

  /** 微信订单中心深链与发货消息跳转入口：按商户订单号或微信支付交易单号解析本人订单的类型与 id。 */
  @GetMapping("/api/v1/order-center/resolve")
  Map<String, String> resolve(@RequestParam String no, @AuthenticationPrincipal Models.User user) {
    if (no == null || no.isBlank()) throw ApiException.notFound();
    String key = no.strip();
    var found = db.query(
        "SELECT id FROM shop_order WHERE (order_no=? OR payment_transaction_id=?) AND user_id=? LIMIT 1",
        (r, n) -> r.getString("id"), key, key, user.id());
    if (!found.isEmpty()) return Map.of("type", "shop", "id", found.getFirst());
    found = db.query(
        "SELECT id FROM activity_order WHERE (order_no=? OR payment_transaction_id=?) AND user_id=? LIMIT 1",
        (r, n) -> r.getString("id"), key, key, user.id());
    if (!found.isEmpty()) return Map.of("type", "activity", "id", found.getFirst());
    throw ApiException.notFound();
  }

  public record ConfirmReceiptOutput(String orderId, boolean receiptConfirmed) {}

  /**
   * 确认收货：仅已发货的微信支付装备订单；服务端以微信 get_order 复核 order_state≥3
   * 后写入 receipt_confirmed_at。复核未外呼或未通过一律拒绝，不放行本地确认。
   *
   * <p>复核与落库在同一事务内持有订单行锁：复核期间退款/取消无法插队改写状态；
   * 落库仍带状态守卫，复核通过后订单若已离开 SHIPPED（如已退款）则拒绝确认。
   */
  @PostMapping("/api/v1/order-center/orders/{id}/confirm-receipt")
  ConfirmReceiptOutput confirmReceipt(
      @PathVariable String id, @AuthenticationPrincipal Models.User user) {
    return transactions.execute(status -> {
      var order = shop.lockOrder(id, user.id(), false);
      if (!"SHIPPED".equals(order.status()))
        throw ApiException.conflict("ORDER_NOT_SHIPPED",
            "只有已发货订单可以确认收货");
      if (order.receiptConfirmedAt() != null)
        return new ConfirmReceiptOutput(order.id(), true);
      if (order.paymentTransactionId() == null || order.paymentTransactionId().isBlank())
        throw ApiException.conflict("NO_WECHAT_TRANSACTION",
            "免微信支付订单无需确认收货");
      var verify = wechatOrders.verifyReceiptConfirmed(order.paymentTransactionId());
      if (!verify.attempted())
        // A skipped verification is never proof of receipt for a real WeChat transaction.
        throw ApiException.conflict("WECHAT_ORDER_VERIFY_FAILED",
            "微信订单状态暂无法核对，请稍后重试");
      if (verify.attempted() && verify.errcode() == 0) {
        int state = WechatOrderCenterService.orderState(verify);
        if (state < WechatOrderCenterService.ORDER_STATE_CONFIRMED)
          throw ApiException.conflict(state < 0 ? "WECHAT_ORDER_VERIFY_FAILED" : "RECEIPT_NOT_CONFIRMED_WECHAT",
              state < 0
                  ? "微信订单状态核对未通过（无法解析订单状态），请稍后重试"
                  : "微信订单状态尚未确认收货，请稍后重试");
      } else if (verify.attempted()) {
        throw ApiException.conflict("WECHAT_ORDER_VERIFY_FAILED",
            "微信订单状态核对未通过（errcode=" + verify.errcode() + "），请稍后重试");
      }
      int updated =
          db.update(
              "UPDATE shop_order SET receipt_confirmed_at=CURRENT_TIMESTAMP,"
                  + "version=version+1,updated_at=CURRENT_TIMESTAMP"
                  + " WHERE id=? AND status='SHIPPED' AND receipt_confirmed_at IS NULL",
              id);
      // 行锁已排除常规竞态；再读一次状态防御触发器等非常规改写，异常时整体回滚。
      if (updated == 0 || !"SHIPPED".equals(
          db.queryForObject("SELECT status FROM shop_order WHERE id=?", String.class, id)))
        throw ApiException.conflict("ORDER_NOT_SHIPPED", "只有已发货订单可以确认收货");
      return new ConfirmReceiptOutput(order.id(), true);
    });
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
        && (confirmation.body().path("completed").asBoolean(false)
            || confirmation.body().path("is_completed").asBoolean(false)));
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

  /** 设置发货消息/确认收货消息点击后的跳转路径（微信会在路径后追加订单参数）。 */
  public record MsgJumpPathInput(
      @NotBlank @Size(max = 256) String path) {}

  @PutMapping("/api/v1/admin/wechat-order-center/msg-jump-path")
  Map<String, Object> updateMsgJumpPath(@Valid @RequestBody MsgJumpPathInput input) {
    var result = wechatOrders.setMsgJumpPath(input.path());
    if (result == null)
      throw ApiException.conflict("WECHAT_ORDER_CENTER_UNAVAILABLE", "微信订单服务不可用");
    return Map.of(
        "attempted", result.attempted(),
        "errcode", result.errcode(),
        "error", result.error());
  }

  /**
   * 对账查询微信侧发货管理订单列表（get_order_list 直通）。orderState：
   * 1=待发货 2=已发货 3=确认收货 4=交易完成 5=已退款 6=资金待结算；
   * begin/end 为秒级时间戳，lastIndex 翻页续传。
   */
  @GetMapping("/api/v1/admin/wechat-order-center/wechat-orders")
  Map<String, Object> wechatOrders(
      @RequestParam(required = false) Long begin,
      @RequestParam(required = false) Long end,
      @RequestParam(required = false) Integer orderState,
      @RequestParam(required = false) String openid,
      @RequestParam(required = false) String lastIndex,
      @RequestParam(required = false, defaultValue = "20") Integer size) {
    if (orderState != null && (orderState < 1 || orderState > 6))
      throw new ApiException(400, "INVALID_ORDER_STATE", "订单状态需为 1-6");
    if (begin != null && end != null && begin > end)
      throw new ApiException(400, "INVALID_TIME_RANGE", "开始时间不能晚于结束时间");
    var result = wechatOrders.getOrderList(begin, end, orderState, openid, lastIndex, size);
    var out = new java.util.LinkedHashMap<String, Object>();
    out.put("attempted", result.attempted());
    out.put("errcode", result.errcode());
    out.put("error", result.error());
    out.put("lastIndex", result.body() == null ? "" : result.body().path("last_index").asText(""));
    out.put("hasMore", result.body() != null && result.body().path("has_more").asBoolean(false));
    out.put("orders", result.body() == null ? java.util.List.of()
        : result.body().path("order_list"));
    return out;
  }
}
