package com.wildboy;

import com.wechat.pay.java.core.exception.HttpException;
import com.wechat.pay.java.core.exception.MalformedMessageException;
import com.wechat.pay.java.core.exception.ServiceException;
import com.wechat.pay.java.core.exception.ValidationException;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Strict allowlist: SDK exception messages, requests, responses and causes must never be logged. */
final class PaymentDiagnostics {
  private static final Logger log = LoggerFactory.getLogger(WechatPayService.class);

  enum Stage { CONFIGURATION, REQUEST_BUILD, SDK_INITIALIZATION, PREPAY, RESPONSE_MAPPING }

  // Official JSAPI/miniprogram prepay and common HTTP error codes. Unknown values are never echoed.
  // https://pay.weixin.qq.com/doc/v3/merchant/4012791897
  // https://pay.weixin.qq.com/doc/v3/merchant/4012081717
  private static final Set<String> SAFE_CODES = Set.of(
      "PARAM_ERROR", "INVALID_REQUEST", "SIGN_ERROR", "SYSTEM_ERROR", "APPID_MCHID_NOT_MATCH", "MCH_NOT_EXISTS",
      "NO_AUTH", "OUT_TRADE_NO_USED", "FREQUENCY_LIMITED", "RATELIMIT_EXCEEDED",
      "SERVICE_UNAVAILABLE", "ORDER_NOT_EXIST");

  private PaymentDiagnostics() {}

  static ApiException failure(Stage stage, Exception failure) {
    var diagnostic = classify(stage, failure);
    String reference = UUID.randomUUID().toString();
    // No Throwable argument: even SDK getMessage()/toString() can contain Authorization and PII.
    log.warn("WeChat Pay failed ref={} stage={} category={} upstream_code={} http_status={}",
        reference, stage, diagnostic.category(), diagnostic.upstreamCode(), diagnostic.httpStatus());
    boolean configuration = "CONFIGURATION_INVALID".equals(diagnostic.category());
    // 配置类失败保留可操作的提示（不含任何内部配置细节），与微信故障区分开。
    return new ApiException(configuration ? 503 : 502,
        configuration ? "PAYMENT_NOT_CONFIGURED" : "WECHAT_PAY_UNAVAILABLE",
        (configuration ? "微信支付暂未完成商户配置，请联系管理员处理" : "微信支付暂不可用，请稍后重试")
            + "（排查编号：" + reference + "）");
  }

  private static Diagnostic classify(Stage stage, Exception failure) {
    if (stage == Stage.CONFIGURATION) return diagnostic("CONFIGURATION_INVALID");
    boolean transport = false;
    boolean timeout = false;
    // Bounded traversal also handles wrapped transport errors and cyclic cause chains safely.
    Throwable cause = failure;
    for (int depth = 0; cause != null && depth < 8; depth++, cause = cause.getCause()) {
      if (cause instanceof ApiException api && "PAYMENT_NOT_CONFIGURED".equals(api.code))
        return diagnostic("CONFIGURATION_INVALID");
      if (cause instanceof ServiceException service) {
        String code = service.getErrorCode();
        int status = service.getHttpStatusCode();
        return new Diagnostic("UPSTREAM_REJECTED", code != null && SAFE_CODES.contains(code) ? code : "UNKNOWN",
            status >= 100 && status <= 599 ? status : 0);
      }
      if (cause instanceof ValidationException) return diagnostic("RESPONSE_SIGNATURE_INVALID");
      if (cause instanceof MalformedMessageException) return diagnostic("RESPONSE_FORMAT_INVALID");
      if (cause instanceof HttpException) transport = true;
      if (cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException) timeout = true;
    }
    if (timeout) return diagnostic("TRANSPORT_TIMEOUT");
    if (transport) return diagnostic("TRANSPORT_FAILURE");
    return diagnostic(switch (stage) {
      case REQUEST_BUILD -> "REQUEST_BUILD_FAILED";
      case SDK_INITIALIZATION -> "SDK_INITIALIZATION_FAILED";
      case RESPONSE_MAPPING -> "RESPONSE_FORMAT_INVALID";
      default -> "SDK_FAILURE";
    });
  }

  private static Diagnostic diagnostic(String category) { return new Diagnostic(category, "NONE", 0); }
  private record Diagnostic(String category, String upstreamCode, int httpStatus) {}
}
