package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 微信「电商订单（订单中心）」配套服务端能力。
 *
 * <p>现行机制下订单数据由微信支付交易自动同步（旧版逐单上报 API 已下线），代码侧需要：
 *
 * <ul>
 *   <li>配置订单详情跳转路径（update_order_detail_path / get_order_detail_path），
 *       用户在微信「小程序购物订单」中点「前往小程序」时按 ${商品订单号} 占位符跳回；
 *   <li>确认收货复核（get_order）：小程序 weappOrderConfirm 组件回调不可信，
 *       服务端必须以微信 order_state 复核后才落库；
 *   <li>确认收货提醒（notify_confirm_receive，每支付单限一次）。
 * </ul>
 *
 * <p>与 {@link WechatShippingService} 一致：走小程序 access_token（复用
 * WechatNotificationGateway 缓存）、由 {@code wildboy.shipping.enabled} 守卫（同一交易
 * 合规开关，测试环境关闭避免外呼微信）、失败不抛异常由调用方决定降级。
 */
@Service
public class WechatOrderCenterService {
  private static final Logger log = LoggerFactory.getLogger(WechatOrderCenterService.class);
  /** 订单详情路径的占位符，微信跳转时会替换为实际商户订单号。 */
  public static final String ORDER_NO_PLACEHOLDER = "${商品订单号}";
  /** get_order 返回的 order_state：3=确认收货、4=交易完成。 */
  static final int ORDER_STATE_CONFIRMED = 3;
  static final int ORDER_STATE_FINISHED = 4;

  private final WechatNotificationGateway gateway;
  private final RestClient client;
  private final boolean enabled;

  public WechatOrderCenterService(
      WechatNotificationGateway gateway,
      @Value("${wildboy.shipping.enabled:false}") boolean enabled) {
    this.gateway = gateway;
    this.enabled = enabled;
    var f = new JdkClientHttpRequestFactory(
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    f.setReadTimeout(Duration.ofSeconds(8));
    client = RestClient.builder().baseUrl("https://api.weixin.qq.com").requestFactory(f).build();
  }

  /** 一次外呼的结果：attempted=false 表示未外呼（未启用/缺配置），errcode=0 表示微信已受理；body 保留响应供调用方解析（如 order_state）。 */
  public record CallResult(boolean attempted, int errcode, String error, JsonNode body) {
    static CallResult skipped(String reason) { return new CallResult(false, 0, reason, null); }
    static CallResult ok(JsonNode body) { return new CallResult(true, 0, "", body); }
    static CallResult failed(int errcode, String stage) {
      return new CallResult(true, errcode, stage, null);
    }
  }

  boolean enabled() { return enabled; }

  /** 校验订单详情路径必须包含微信要求的订单号占位符。 */
  public static boolean validDetailPath(String path) {
    return path != null && path.contains(ORDER_NO_PLACEHOLDER);
  }

  /** 配置订单详情跳转路径；需先在小程序后台签署订单中心授权协议，否则微信返回 10060034。 */
  public CallResult updateOrderDetailPath(String path) {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank())
      return CallResult.skipped("disabled");
    if (!validDetailPath(path))
      throw new ApiException(400, "INVALID_ORDER_PATH",
          "订单详情路径需包含 ${商品订单号} 占位符");
    return post("update_order_detail_path", Map.of("path", path.strip()));
  }

  /** 查询当前配置的订单详情跳转路径。 */
  public CallResult getOrderDetailPath() {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank())
      return CallResult.skipped("disabled");
    return post("get_order_detail_path", Map.of());
  }

  /**
   * 确认收货复核：order_state ≥ 3 视为微信侧已确认/已完成。
   *
   * <p>Disabled integration returns skipped; callers must not treat it as proof of receipt.
   * Missing configuration is a verification failure.
   */
  public CallResult verifyReceiptConfirmed(String transactionId) {
    if (!enabled) return CallResult.skipped("disabled");
    if (gateway.appId.isBlank() || gateway.secret.isBlank())
      return CallResult.failed(-1, "shipping_configuration_unavailable");
    if (transactionId == null || transactionId.isBlank())
      return CallResult.skipped("missing_transaction");
    var body = new LinkedHashMap<String, Object>();
    body.put("transaction_id", transactionId);
    return post("get_order", body);
  }

  /**
   * 从 get_order 结果解析 order_state；-1 表示响应不含该字段（errcode!=0 或字段缺失）。
   * 官方响应中状态位于 order.order_state；兼容顶层 order_state 以防字段位置调整。
   */
  public static int orderState(CallResult result) {
    if (result.body() == null) return -1;
    JsonNode order = result.body().path("order");
    JsonNode state = order.has("order_state") ? order.get("order_state")
        : result.body().path("order_state");
    return state.asInt(-1);
  }

  /** 确认收货提醒（快递签收后提醒用户确认收货，每支付单限一次）。 */
  public CallResult notifyConfirmReceive(String transactionId) {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank())
      return CallResult.skipped("disabled");
    if (transactionId == null || transactionId.isBlank())
      return CallResult.skipped("missing_transaction");
    var body = new LinkedHashMap<String, Object>();
    body.put("transaction_id", transactionId);
    return post("notify_confirm_receive", body);
  }

  /** 查询小程序关联商户号是否全部完成「交易结算管理确认」；官方要求请求携带小程序 appid。 */
  public CallResult confirmationCompleted() {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank())
      return CallResult.skipped("disabled");
    return post("is_trade_management_confirmation_completed", Map.of("appid", gateway.appId));
  }

  private CallResult post(String action, Map<String, Object> body) {
    try {
      JsonNode r =
          client.post()
              .uri(b -> b.path("/wxa/sec/order/" + action)
                  .queryParam("access_token", gateway.accessToken())
                  .build())
              .body(body)
              .retrieve()
              .body(JsonNode.class);
      int code = errorCode(r);
      if (code == 0) {
        log.info("订单中心接口成功 action={}", action);
        return CallResult.ok(r);
      }
      // 凭据类错误说明缓存 token 已失效：作废缓存，避免后续每次调用都带着坏 token 重试。
      if (CREDENTIAL_ERRORS.contains(code)) gateway.invalidateToken();
      log.warn("订单中心接口未成功 action={} errcode={}", action, code);
      return CallResult.failed(code, action);
    } catch (RuntimeException e) {
      log.warn("订单中心接口异常 action={} error={}", action, e.getClass().getSimpleName());
      return CallResult.failed(-1, action);
    }
  }

  /** 与通知网关一致的凭据类错误码：token 无效/过期，重试前需重新获取。 */
  static final java.util.Set<Integer> CREDENTIAL_ERRORS = java.util.Set.of(40001, 40014, 42001);

  /** 严格解析整数 errcode：非整数（缺失/小数/越界）一律按 -1 处理，避免 asInt 静默截断。 */
  private static int errorCode(JsonNode response) {
    JsonNode code = response == null ? null : response.get("errcode");
    return code != null && code.isIntegralNumber() && code.canConvertToInt() ? code.intValue() : -1;
  }
}
