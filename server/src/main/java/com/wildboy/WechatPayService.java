package com.wildboy;

import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.RSAPublicKeyConfig;
import com.wechat.pay.java.core.exception.ValidationException;
import com.wechat.pay.java.core.notification.NotificationConfig;
import com.wechat.pay.java.core.notification.NotificationParser;
import com.wechat.pay.java.core.notification.RSAPublicKeyNotificationConfig;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.jsapi.JsapiServiceExtension;
import com.wechat.pay.java.service.payments.jsapi.model.Amount;
import com.wechat.pay.java.service.payments.jsapi.model.CloseOrderRequest;
import com.wechat.pay.java.service.payments.jsapi.model.QueryOrderByOutTradeNoRequest;
import com.wechat.pay.java.service.payments.jsapi.model.Payer;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayRequest;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayWithRequestPaymentResponse;
import com.wechat.pay.java.service.payments.model.Transaction;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class WechatPayService {
  private final String appId;
  private final String merchantId;
  private final String privateKeyPath;
  private final String merchantSerialNumber;
  private final String publicKeyPath;
  private final String publicKeyId;
  private final String apiV3Key;
  private final String notifyUrl;

  public WechatPayService(
      @Value("${wildboy.wechat.app-id}") String appId,
      @Value("${wildboy.pay.merchant-id:}") String merchantId,
      @Value("${wildboy.pay.private-key-path:}") String privateKeyPath,
      @Value("${wildboy.pay.merchant-serial-number:}") String merchantSerialNumber,
      @Value("${wildboy.pay.public-key-path:}") String publicKeyPath,
      @Value("${wildboy.pay.public-key-id:}") String publicKeyId,
      @Value("${wildboy.pay.api-v3-key:}") String apiV3Key,
      @Value("${wildboy.pay.notify-url:}") String notifyUrl) {
    this.appId = appId;
    this.merchantId = merchantId;
    this.privateKeyPath = privateKeyPath;
    this.merchantSerialNumber = merchantSerialNumber;
    this.publicKeyPath = publicKeyPath;
    this.publicKeyId = publicKeyId;
    this.apiV3Key = apiV3Key;
    this.notifyUrl = notifyUrl;
  }

  public boolean enabled() {
    return !appId.isBlank()
        && !merchantId.isBlank()
        && !privateKeyPath.isBlank()
        && !merchantSerialNumber.isBlank()
        && !publicKeyPath.isBlank()
        && !publicKeyId.isBlank()
        && !apiV3Key.isBlank()
        && notifyUrl.startsWith("https://");
  }

  public void requireConfigured() {
    if (!enabled()) throw new ApiException(503, "PAYMENT_NOT_CONFIGURED", "微信支付尚未完成商户配置");
  }

  public String appId() { return appId; }

  public String merchantId() {
    return merchantId;
  }

  private Config config() {
    if (!enabled())
      throw new ApiException(503, "PAYMENT_NOT_CONFIGURED", "微信支付尚未完成商户配置");
    return new RSAPublicKeyConfig.Builder()
        .merchantId(merchantId)
        .privateKeyFromPath(privateKeyPath)
        .publicKeyFromPath(publicKeyPath)
        .publicKeyId(publicKeyId)
        .merchantSerialNumber(merchantSerialNumber)
        .apiV3Key(apiV3Key)
        .build();
  }

  private JsapiServiceExtension service() {
    return new JsapiServiceExtension.Builder().config(config()).build();
  }

  public ShopModels.PaymentRequest prepay(ShopModels.Order order, String openid) {
    if (openid == null || openid.isBlank())
      throw new ApiException(409, "WECHAT_IDENTITY_REQUIRED", "请使用真实微信账号登录后支付");
    try {
      var request = new PrepayRequest();
      request.setAppid(appId);
      request.setMchid(merchantId);
      request.setDescription("Wildboy 户外装备 " + order.orderNo());
      request.setOutTradeNo(order.orderNo());
      request.setNotifyUrl(notifyUrl);
      request.setTimeExpire(order.expiresAt().format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME));
      var amount = new Amount();
      amount.setTotal(order.totalCents());
      request.setAmount(amount);
      var payer = new Payer();
      payer.setOpenid(openid);
      request.setPayer(payer);
      PrepayWithRequestPaymentResponse response = service().prepayWithRequestPayment(request);
      return new ShopModels.PaymentRequest(
          response.getTimeStamp(),
          response.getNonceStr(),
          response.getPackageVal(),
          response.getSignType(),
          response.getPaySign());
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(502, "WECHAT_PAY_UNAVAILABLE", "微信支付暂不可用，请稍后重试");
    }
  }

  public void closeOrder(String orderNo) {
    try {
      var request = new CloseOrderRequest();
      request.setMchid(merchantId);
      request.setOutTradeNo(orderNo);
      service().closeOrder(request);
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(502, "WECHAT_CLOSE_FAILED", "微信订单暂未关闭，请稍后重试");
    }
  }

  public Transaction queryOrder(String orderNo) {
    try {
      var request = new QueryOrderByOutTradeNoRequest();
      request.setMchid(merchantId);
      request.setOutTradeNo(orderNo);
      return service().queryOrderByOutTradeNo(request);
    } catch (ApiException e) { throw e; }
    catch (Exception e) {
      throw new ApiException(502, "WECHAT_QUERY_FAILED", "微信订单状态暂无法确认，库存保留，请稍后重试");
    }
  }

  public Transaction parseNotification(Map<String, String> headers, String body) {
    try {
      NotificationConfig config =
          new RSAPublicKeyNotificationConfig.Builder()
              .publicKeyFromPath(publicKeyPath)
              .publicKeyId(publicKeyId)
              .apiV3Key(apiV3Key)
              .build();
      var request =
          new RequestParam.Builder()
              .serialNumber(headers.get("wechatpay-serial"))
              .nonce(headers.get("wechatpay-nonce"))
              .signature(headers.get("wechatpay-signature"))
              .timestamp(headers.get("wechatpay-timestamp"))
              .body(body)
              .build();
      return new NotificationParser(config).parse(request, Transaction.class);
    } catch (ValidationException e) {
      throw new ApiException(401, "INVALID_PAYMENT_SIGNATURE", "支付通知验签失败");
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(400, "INVALID_PAYMENT_NOTIFICATION", "支付通知内容无效");
    }
  }
}
