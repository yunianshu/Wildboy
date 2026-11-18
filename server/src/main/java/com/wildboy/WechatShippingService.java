package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

/**
 * 微信「发货信息管理」上报：交易类小程序按运营规范必须在发货后上报物流/履约信息，
 * 未按规范接入可能导致公众平台限制小程序支付权限。
 * 商城实物单发货后上报实体物流；活动订单确认报名后上报虚拟发货。
 * 上报走小程序 access_token（与支付 APIv3 凭证无关），失败不阻断业务主流程；
 * 结果通过回调交给 {@link ShippingReportService} 落库，失败由重试任务与后台补报兜底。
 */
@Service
public class WechatShippingService {
  private static final Logger log = LoggerFactory.getLogger(WechatShippingService.class);
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private final WechatNotificationGateway gateway; // 复用 access_token 缓存，避免同 appid 重复取 token
  private final AuthService auth;
  private final RestClient client;
  private final boolean enabled; // 生产开启；测试环境保持关闭，避免外呼微信
  private boolean tradeManaged;
  private Clock clock = Clock.systemUTC();
  private Instant nextTradeCheck = Instant.MIN;
  private UploadResult tradeFailure;
  private int tradeFailures;

  public enum Outcome { REPORTED, RETRYABLE, NOT_OPEN, DISABLED, INAPPLICABLE }

  /** 明确区分永久不适用、关闭开关、尚未开通和临时失败；只有 REPORTED 是受理成功。 */
  public record UploadResult(Outcome outcome, int errcode, String error) {
    boolean attempted() { return outcome == Outcome.REPORTED || outcome == Outcome.RETRYABLE; }
    static UploadResult skipped(String reason) { return new UploadResult(Outcome.INAPPLICABLE, 0, reason); }
    static UploadResult disabled() { return new UploadResult(Outcome.DISABLED, 0, "disabled"); }
    static UploadResult notOpen() { return new UploadResult(Outcome.NOT_OPEN, 0, "trade_management_not_open"); }
    static UploadResult ok() { return new UploadResult(Outcome.REPORTED, 0, ""); }
    static UploadResult failed(int errcode, String error) { return new UploadResult(Outcome.RETRYABLE, errcode, error); }
  }

  public WechatShippingService(
      WechatNotificationGateway gateway,
      AuthService auth,
      @Value("${wildboy.shipping.enabled:false}") boolean enabled) {
    this.gateway = gateway;
    this.auth = auth;
    this.enabled = enabled;
    var f = new JdkClientHttpRequestFactory(
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    f.setReadTimeout(Duration.ofSeconds(8));
    client = RestClient.builder().baseUrl("https://api.weixin.qq.com").requestFactory(f).build();
  }

  /** 商城实物订单发货上报（logistics_type=1 实体物流）；非微信支付订单（免支付）无交易记录，跳过。 */
  public void uploadShopShipment(ShopModels.Order order, String company, String trackingNo) {
    uploadShopShipment(order, company, trackingNo, r -> {});
  }

  public void uploadShopShipment(
      ShopModels.Order order, String company, String trackingNo, Consumer<UploadResult> onResult) {
    afterCommit(
        () -> onResult.accept(uploadShopShipmentNow(order, company, trackingNo)));
  }

  // ShippingReportService 持有订单锁时同步调用，避免资格检查与退款之间的竞态。
  UploadResult uploadShopShipmentNow(ShopModels.Order order, String company, String trackingNo) {
    return upload(order.orderNo(), order.paymentTransactionId(), order.userId(), 1,
        () -> courierShipping(order, company, trackingNo));
  }

  private Map<String, Object> courierShipping(ShopModels.Order order, String company, String trackingNo) {
    if (company == null || company.isBlank() || trackingNo == null || trackingNo.isBlank()) {
      log.warn("发货信息缺少物流公司或运单号 order={}", order.orderNo());
      return null;
    }
    String carrierCode = resolveCarrierCode(company.strip());
    if (carrierCode == null) {
      log.warn("发货信息未匹配到唯一的微信物流公司编码 order={}", order.orderNo());
      return null;
    }
    var shipping = new LinkedHashMap<String, Object>();
    shipping.put(
        "item_desc",
        itemDesc(order.items().stream().map(i -> i.productName() + "×" + i.quantity()).toList()));
    shipping.put("express_company", carrierCode);
    shipping.put("tracking_no", trackingNo.strip());
    if ("SF".equals(carrierCode)) {
      String digits = order.phone() == null ? "" : order.phone().replaceAll("\\D", "");
      if (digits.length() < 4) {
        log.warn("顺丰发货信息缺少可用的收件电话尾号 order={}", order.orderNo());
        return null;
      }
      shipping.put("contact", Map.of("receiver_contact", "****" + digits.substring(digits.length() - 4)));
    }
    return shipping;
  }

  /** 活动订单确认报名后上报虚拟发货（logistics_type=3）。 */
  public void uploadActivityFulfillment(ActivityOrderModels.Order order, String transactionId) {
    uploadActivityFulfillment(order, transactionId, r -> {});
  }

  public void uploadActivityFulfillment(
      ActivityOrderModels.Order order, String transactionId, Consumer<UploadResult> onResult) {
    afterCommit(
        () -> onResult.accept(uploadActivityFulfillmentNow(order, transactionId)));
  }

  UploadResult uploadActivityFulfillmentNow(ActivityOrderModels.Order order, String transactionId) {
    return upload(order.orderNo(), transactionId, order.userId(), 3,
        () -> Map.of("item_desc", itemDesc(List.of(order.activityTitle() + "×" + order.partySize()))));
  }

  /** 单次上报外呼；跳过与失败都不抛异常，结果交给调用方落库。 */
  UploadResult upload(
      String orderNo, String transactionId, String userId, int logisticsType,
      Supplier<Map<String, Object>> shippingInfo) {
    if (transactionId == null || transactionId.isBlank())
      return UploadResult.skipped("missing_transaction"); // 免支付订单没有微信交易记录，无需上报
    if (!enabled) return UploadResult.disabled();
    if (gateway.appId.isBlank() || gateway.secret.isBlank())
      return UploadResult.failed(-1, "shipping_configuration_unavailable");
    String openid;
    try {
      openid = auth.wechatOpenid(userId);
    } catch (ApiException e) {
      return "WECHAT_IDENTITY_REQUIRED".equals(e.code)
          ? UploadResult.skipped("no_wechat_identity") : UploadResult.failed(-1, "identity_lookup_failed");
    } catch (RuntimeException e) {
      return UploadResult.failed(-1, "identity_lookup_failed");
    }
    if (openid == null || openid.isBlank()) return UploadResult.skipped("no_wechat_identity");
    UploadResult unavailable = tradeManagementUnavailable();
    if (unavailable != null) return unavailable;
    try {
      var shipping = shippingInfo.get();
      if (shipping == null) return UploadResult.failed(-1, "shipping_payload_unavailable");
      var body = new LinkedHashMap<String, Object>();
      body.put("order_key", Map.of("order_number_type", 2, "transaction_id", transactionId));
      body.put("logistics_type", logisticsType);
      body.put("delivery_mode", 1);
      body.put("is_all_delivered", true);
      body.put(
          "upload_time", OffsetDateTime.now(ZONE).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
      body.put("payer", Map.of("openid", openid));
      body.put("shipping_list", List.of(shipping));
      JsonNode r =
          client.post()
              .uri(
                  b ->
                      b.path("/wxa/sec/order/upload_shipping_info")
                          .queryParam("access_token", gateway.accessToken())
                          .build())
              .body(body)
              .retrieve()
              .body(JsonNode.class);
      int code = errorCode(r);
      if (code == 0) log.info("发货信息已上报 order={}", orderNo);
      else log.warn("发货信息上报未成功 order={} errcode={}", orderNo, code);
      return code == 0 ? UploadResult.ok() : UploadResult.failed(code, "upload_shipping_info");
    } catch (RuntimeException e) {
      log.warn("发货信息上报异常 order={} error={}", orderNo, e.getClass().getSimpleName());
      return UploadResult.failed(-1, "shipping_request_failed");
    }
  }

  /** 重试任务与后台补报需要据此判断是否可以外呼。 */
  boolean shippingEnabled() { return enabled; }

  private synchronized UploadResult tradeManagementUnavailable() {
    if (tradeManaged) return null;
    if (clock.instant().isBefore(nextTradeCheck)) return tradeFailure;
    try {
      JsonNode r =
          client.post()
              .uri(
                  b ->
                      b.path("/wxa/sec/order/is_trade_managed")
                          .queryParam("access_token", gateway.accessToken())
                          .build())
              .body(Map.of("appid", gateway.appId))
              .retrieve()
              .body(JsonNode.class);
      int code = errorCode(r);
      if (code != 0 || !r.path("is_trade_managed").isBoolean()) {
        log.warn("发货信息管理开通状态查询失败 errcode={}", code);
        tradeFailure = UploadResult.failed(code == 0 ? -1 : code, "trade_management_query_failed");
      } else {
        tradeManaged = r.path("is_trade_managed").asBoolean();
        if (tradeManaged) return null;
        tradeFailure = UploadResult.notOpen();
      }
    } catch (RuntimeException e) {
      log.warn("发货信息管理开通状态查询失败 error={}", e.getClass().getSimpleName());
      tradeFailure = UploadResult.failed(-1, "trade_management_query_failed");
    }
    // 同一实例的多个订单共享探测退避，避免服务未开通或持续故障时每单重复探测。
    long minutes = tradeFailure.outcome() == Outcome.NOT_OPEN ? 360 : Math.min(60, 1L << Math.min(tradeFailures++, 6));
    nextTradeCheck = clock.instant().plus(Duration.ofMinutes(minutes));
    return tradeFailure;
  }

  private String resolveCarrierCode(String company) {
    JsonNode r = client.post()
        .uri(b -> b.path("/cgi-bin/express/delivery/open_msg/get_delivery_list")
            .queryParam("access_token", gateway.accessToken()).build())
        .body(Map.of())
        .retrieve()
        .body(JsonNode.class);
    int code = errorCode(r);
    if (code != 0 || !r.path("delivery_list").isArray()) {
      log.warn("微信物流公司编码列表查询失败 errcode={}", code);
      return null;
    }
    String nameMatch = null;
    boolean ambiguous = false;
    for (JsonNode carrier : r.path("delivery_list")) {
      String carrierCode = carrier.path("delivery_id").asText("");
      if (carrierCode.isBlank()) continue;
      if (company.equalsIgnoreCase(carrierCode)) return carrierCode;
      if (company.equals(carrier.path("delivery_name").asText())) {
        if (nameMatch != null && !nameMatch.equals(carrierCode)) ambiguous = true;
        nameMatch = carrierCode;
      }
    }
    return ambiguous ? null : nameMatch;
  }

  private static int errorCode(JsonNode response) {
    JsonNode code = response == null ? null : response.get("errcode");
    return code != null && code.isIntegralNumber() && code.canConvertToInt() ? code.intValue() : -1;
  }

  private static void afterCommit(Runnable report) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      report.run();
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCommit() {
        report.run();
      }
    });
  }

  private static String itemDesc(List<String> parts) {
    var joined = String.join("、", parts);
    return joined.codePointCount(0, joined.length()) <= 90
        ? joined
        : joined.substring(0, joined.offsetByCodePoints(0, 90));
  }
}
