package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 微信「发货信息管理」上报：交易类小程序按运营规范必须在发货后上报物流/履约信息，
 * 否则公众平台会限制小程序支付权限（用户端调起收银台报 errno 102）。
 * 商城实物单在管理端发货时上报实体物流；活动订单属虚拟商品，支付成功即上报。
 * 上报走小程序 access_token（与支付 APIv3 凭证无关），失败不阻断业务主流程，
 * 只记 WARN 日志（含微信 errcode），运营可在平台侧补录。
 */
@Service
public class WechatShippingService {
  private static final Logger log = LoggerFactory.getLogger(WechatShippingService.class);
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private final WechatNotificationGateway gateway; // 复用 access_token 缓存，避免同 appid 重复取 token
  private final AuthService auth;
  private final RestClient client;
  private final boolean enabled; // 生产开启；测试环境保持关闭，避免外呼微信
  private Boolean tradeManaged; // 平台开通状态探测缓存；开通/重启后自动刷新

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
    if (order.paymentTransactionId() == null || order.paymentTransactionId().isBlank()) return;
    var shipping = new LinkedHashMap<String, Object>();
    shipping.put(
        "item_desc",
        itemDesc(order.items().stream().map(i -> i.productName() + "×" + i.quantity()).toList()));
    shipping.put("owner", order.recipientName());
    shipping.put("tel", order.phone());
    if (company != null && !company.isBlank()) shipping.put("company", company);
    if (trackingNo != null && !trackingNo.isBlank()) shipping.put("tracking_no", trackingNo);
    upload(order.orderNo(), order.userId(), 1, shipping, "shop");
  }

  /** 活动订单为虚拟商品（logistics_type=3），支付成功即上报，无需物流信息。 */
  public void uploadActivityFulfillment(ActivityOrderModels.Order order) {
    upload(
        order.orderNo(),
        order.userId(),
        3,
        new LinkedHashMap<>(
            Map.of("item_desc", itemDesc(List.of(order.activityTitle() + "×" + order.partySize())))),
        "activity");
  }

  private void upload(
      String orderNo, String userId, int logisticsType, Map<String, Object> shipping, String source) {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank()) return;
    String openid;
    try {
      openid = auth.wechatOpenid(userId);
    } catch (RuntimeException e) {
      return; // 非微信身份用户没有可上报的收货方
    }
    if (!tradeManaged()) return;
    try {
      var body = new LinkedHashMap<String, Object>();
      body.put("order_key", Map.of("order_number_type", 2, "out_trade_no", orderNo));
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
      int code = r == null ? -1 : r.path("errcode").asInt(0);
      if (code == 0) log.info("发货信息已上报({}) order={}", source, orderNo);
      else
        log.warn(
            "发货信息上报未成功({}) order={} errcode={} errmsg={}",
            source,
            orderNo,
            code,
            r == null ? "响应为空" : r.path("errmsg").asText(""));
    } catch (RuntimeException e) {
      log.warn("发货信息上报异常({}) order={}", source, orderNo, e);
    }
  }

  /** 平台是否已对本小程序开通发货信息管理；未开通时上报无意义，探测结果进程内缓存。 */
  private synchronized boolean tradeManaged() {
    if (tradeManaged != null) return tradeManaged;
    try {
      JsonNode r =
          client.get()
              .uri(
                  b ->
                      b.path("/wxa/sec/order/is_trade_managed")
                          .queryParam("access_token", gateway.accessToken())
                          .queryParam("appid", gateway.appId)
                          .build())
              .retrieve()
              .body(JsonNode.class);
      tradeManaged = r != null && r.path("is_trade_managed").asBoolean(false);
      if (!tradeManaged) log.warn("小程序尚未开通发货信息管理服务，请在公众平台申请开通；开通后重启服务生效");
    } catch (RuntimeException e) {
      log.warn("发货信息管理开通状态查询失败，本次按未开通处理", e);
      tradeManaged = false;
    }
    return tradeManaged;
  }

  private static String itemDesc(List<String> parts) {
    var joined = String.join("、", parts);
    return joined.codePointCount(0, joined.length()) <= 90
        ? joined
        : joined.substring(0, joined.offsetByCodePoints(0, 90));
  }
}
