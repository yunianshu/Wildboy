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
  private boolean tradeManaged; // 只缓存确认已开通的结果

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

  /** 活动订单确认报名后上报虚拟发货（logistics_type=3）。 */
  public void uploadActivityFulfillment(ActivityOrderModels.Order order, String transactionId) {
    afterCommit(
        () -> upload(order.orderNo(), transactionId, order.userId(), 3,
            () -> Map.of("item_desc", itemDesc(List.of(order.activityTitle() + "×" + order.partySize()))),
            "activity"));
  }

  private void upload(
      String orderNo, String transactionId, String userId, int logisticsType,
      Supplier<Map<String, Object>> shippingInfo, String source) {
    if (!enabled || gateway.appId.isBlank() || gateway.secret.isBlank()
        || transactionId == null || transactionId.isBlank()) return;
    String openid;
    try {
      openid = auth.wechatOpenid(userId);
    } catch (RuntimeException e) {
      return; // 非微信身份用户没有可上报的收货方
    }
    if (!tradeManaged()) return;
    try {
      var shipping = shippingInfo.get();
      if (shipping == null) return;
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
      if (code == 0) log.info("发货信息已上报({}) order={}", source, orderNo);
      else log.warn("发货信息上报未成功({}) order={} errcode={}", source, orderNo, code);
    } catch (RuntimeException e) {
      log.warn("发货信息上报异常({}) order={} error={}", source, orderNo, e.getClass().getSimpleName());
    }
  }

  private synchronized boolean tradeManaged() {
    if (tradeManaged) return true;
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
        return false;
      }
      tradeManaged = r.path("is_trade_managed").asBoolean();
      if (!tradeManaged) log.warn("小程序尚未开通发货信息管理服务，请在公众平台确认");
    } catch (RuntimeException e) {
      log.warn("发货信息管理开通状态查询失败 error={}", e.getClass().getSimpleName());
    }
    return tradeManaged;
  }

  private static int errorCode(JsonNode response) {
    return response == null ? -1 : response.path("errcode").asInt(-1);
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
