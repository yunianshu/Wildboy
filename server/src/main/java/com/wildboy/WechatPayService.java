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
  private volatile Config cachedConfig;

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
    config();
  }

  public String appId() { return appId; }

  public String merchantId() {
    return merchantId;
  }

  private synchronized Config config() {
    if (cachedConfig != null) return cachedConfig;
    if (!enabled() || apiV3Key.getBytes(java.nio.charset.StandardCharsets.UTF_8).length != 32)
      throw new ApiException(503, "PAYMENT_NOT_CONFIGURED", "微信支付尚未完成商户配置");
    try {
      var uri = java.net.URI.create(notifyUrl);
      if (!"https".equals(uri.getScheme()) || uri.getHost() == null
          || uri.getUserInfo() != null || uri.getFragment() != null)
        throw new IllegalArgumentException("Invalid notification URL");
      cachedConfig = new RSAPublicKeyConfig.Builder()
          .merchantId(merchantId)
          .privateKeyFromPath(privateKeyPath)
          .publicKeyFromPath(publicKeyPath)
          .publicKeyId(publicKeyId)
          .merchantSerialNumber(merchantSerialNumber)
          .apiV3Key(apiV3Key)
          .build();
      return cachedConfig;
    } catch (Exception e) {
      // Never expose paths, key material or upstream response internals to clients.
      throw new ApiException(503, "PAYMENT_NOT_CONFIGURED", "微信支付商户配置无效，请联系管理员");
    }
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
      amount.setCurrency("CNY");
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
      if (headers == null || body == null || body.isBlank() || body.length() > 65536)
        throw new ApiException(400, "INVALID_PAYMENT_NOTIFICATION", "支付通知内容无效");
      for (String name : java.util.List.of("wechatpay-serial", "wechatpay-nonce", "wechatpay-signature", "wechatpay-timestamp")) {
        if (headers.get(name) == null || headers.get(name).isBlank())
          throw new ApiException(401, "INVALID_PAYMENT_SIGNATURE", "支付通知签名信息缺失");
      }
      long timestamp = Long.parseLong(headers.get("wechatpay-timestamp"));
      long now = java.time.Instant.now().getEpochSecond();
      if (timestamp < now - 300 || timestamp > now + 300)
        throw new ApiException(401, "INVALID_PAYMENT_SIGNATURE", "支付通知签名已过期");
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
      Transaction transaction = new NotificationParser(config).parse(request, Transaction.class);
      var envelope = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
      if (!"TRANSACTION.SUCCESS".equals(envelope.path("event_type").asText())
          || !"encrypt-resource".equals(envelope.path("resource_type").asText())
          || !"transaction".equals(envelope.path("resource").path("original_type").asText())
          || transaction == null || transaction.getTradeState() != Transaction.TradeStateEnum.SUCCESS)
        throw new ApiException(400, "INVALID_PAYMENT_NOTIFICATION", "支付通知类型无效");
      return transaction;
    } catch (ValidationException e) {
      throw new ApiException(401, "INVALID_PAYMENT_SIGNATURE", "支付通知验签失败");
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(400, "INVALID_PAYMENT_NOTIFICATION", "支付通知内容无效");
    }
  }
  private com.wechat.pay.java.service.refund.RefundService refunds() {
    return new com.wechat.pay.java.service.refund.RefundService.Builder().config(config()).build();
  }
  private RefundModels.GatewayResult refundResult(com.wechat.pay.java.service.refund.model.Refund r) {
    if(r==null || r.getAmount()==null || r.getStatus()==null || r.getAmount().getTotal()==null || r.getAmount().getRefund()==null)
      throw new ApiException(502,"INVALID_REFUND_RESPONSE","微信退款响应不完整");
    return new RefundModels.GatewayResult(r.getOutRefundNo(),r.getOutTradeNo(),r.getTransactionId(),r.getRefundId(),
        r.getAmount().getTotal(),r.getAmount().getRefund(),r.getAmount().getCurrency(),r.getStatus().name());
  }
  public RefundModels.GatewayResult createRefund(ShopModels.Order order,RefundModels.Refund refund) {
    try {
      var request=new com.wechat.pay.java.service.refund.model.CreateRequest();
      request.setTransactionId(order.paymentTransactionId());
      request.setOutTradeNo(order.orderNo());request.setOutRefundNo(refund.outRefundNo());request.setReason(refund.reason());
      request.setNotifyUrl(java.net.URI.create(notifyUrl).resolve("refund-notify").toString());
      var amount=new com.wechat.pay.java.service.refund.model.AmountReq();
      amount.setTotal((long)order.totalCents());amount.setRefund((long)refund.amountCents());amount.setCurrency("CNY");
      request.setAmount(amount);return refundResult(refunds().create(request));
    } catch(ApiException e){throw e;} catch(Exception e){throw new ApiException(502,"REFUND_UNCERTAIN","退款结果待核对");}
  }
  public RefundModels.GatewayResult queryRefund(String outRefundNo) {
    try {
      var request=new com.wechat.pay.java.service.refund.model.QueryByOutRefundNoRequest();request.setOutRefundNo(outRefundNo);
      return refundResult(refunds().queryByOutRefundNo(request));
    } catch(ApiException e){throw e;} catch(Exception e){throw new ApiException(502,"REFUND_QUERY_FAILED","退款结果暂无法确认");}
  }
  public RefundModels.GatewayResult parseRefundNotification(Map<String,String> headers,String body) {
    try {
      if(headers==null||body==null||body.isBlank()||body.length()>65536)throw new IllegalArgumentException();
      for(String name:java.util.List.of("wechatpay-serial","wechatpay-nonce","wechatpay-signature","wechatpay-timestamp"))
        if(headers.get(name)==null||headers.get(name).isBlank())throw new ApiException(401,"INVALID_REFUND_SIGNATURE","退款通知签名缺失");
      long timestamp=Long.parseLong(headers.get("wechatpay-timestamp")),now=java.time.Instant.now().getEpochSecond();
      if(timestamp<now-300||timestamp>now+300)throw new ApiException(401,"INVALID_REFUND_SIGNATURE","退款通知签名已过期");
      NotificationConfig nc=new RSAPublicKeyNotificationConfig.Builder().publicKeyFromPath(publicKeyPath).publicKeyId(publicKeyId).apiV3Key(apiV3Key).build();
      var request=new RequestParam.Builder().serialNumber(headers.get("wechatpay-serial")).nonce(headers.get("wechatpay-nonce"))
          .signature(headers.get("wechatpay-signature")).timestamp(headers.get("wechatpay-timestamp")).body(body).build();
      com.fasterxml.jackson.databind.JsonNode data=new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(new NotificationParser(nc).parse(request,Map.class));
      var envelope=new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
      String state=data.get("refund_status").asText();
      if(!java.util.Set.of("SUCCESS","ABNORMAL","CLOSED").contains(state)
          || !("REFUND."+state).equals(envelope.path("event_type").asText())
          || !"encrypt-resource".equals(envelope.path("resource_type").asText())
          || !"refund".equals(envelope.path("resource").path("original_type").asText())
          || !merchantId.equals(data.get("mchid").asText()) || merchantId.isBlank())
        throw new ApiException(400,"REFUND_MERCHANT_MISMATCH","退款通知类型或商户无效");
      var amount=data.get("amount");
      return new RefundModels.GatewayResult(data.get("out_refund_no").asText(),data.get("out_trade_no").asText(),
          data.get("transaction_id").asText(),data.get("refund_id").asText(),amount.get("total").decimalValue().longValueExact(),
          amount.get("refund").decimalValue().longValueExact(),amount.has("currency")?amount.get("currency").asText():"CNY",state);
    } catch(ValidationException e){throw new ApiException(401,"INVALID_REFUND_SIGNATURE","退款通知验签失败");}
      catch(ApiException e){throw e;} catch(Exception e){throw new ApiException(400,"INVALID_REFUND_NOTIFICATION","退款通知内容无效");}
  }

}
