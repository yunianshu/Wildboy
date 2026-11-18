package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wechat.pay.java.core.Config;
import com.wechat.pay.java.core.exception.HttpException;
import com.wechat.pay.java.core.exception.MalformedMessageException;
import com.wechat.pay.java.core.exception.ServiceException;
import com.wechat.pay.java.core.exception.ValidationException;
import com.wechat.pay.java.core.http.HttpMethod;
import com.wechat.pay.java.core.http.HttpRequest;
import com.wechat.pay.java.core.http.JsonRequestBody;
import com.wechat.pay.java.service.payments.jsapi.JsapiServiceExtension;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayRequest;
import com.wechat.pay.java.service.payments.jsapi.model.PrepayWithRequestPaymentResponse;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

/** All data is synthetic. SDK construction is intercepted; these tests never call WeChat. */
class WechatPayDiagnosticsTest {
  private static final String SECRET = "PRIVATE_SECRET_AND_SIGNATURE";
  private static final String OPENID = "PRIVATE_OPENID";
  private static final String ORDER = "PRIVATE_ORDER_NUMBER";
  private static final String PERSON = "PRIVATE_PERSON_NAME";
  private static final String UNSAFE_MESSAGE = "Authorization: " + SECRET + "; openid=" + OPENID
      + "; name=" + PERSON + "; order=" + ORDER + "\nfull upstream response";
  private final Logger logger = (Logger) LoggerFactory.getLogger(WechatPayService.class);
  private ListAppender<ILoggingEvent> appender;
  private Level previousLevel;
  private boolean previousAdditive;
  private WechatPayService pay;
  private JsapiServiceExtension sdk;

  @BeforeEach void setup() {
    previousLevel = logger.getLevel();
    previousAdditive = logger.isAdditive();
    logger.setLevel(Level.WARN);
    logger.setAdditive(false);
    appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
    pay = spy(new WechatPayService("PRIVATE_APP", "PRIVATE_MERCHANT", "/PRIVATE_KEY_PATH", "PRIVATE_SERIAL",
        "/PRIVATE_PUBLIC_KEY_PATH", "PRIVATE_PUBLIC_KEY_ID", SECRET, "https://example.test/notify"));
    ReflectionTestUtils.setField(pay, "cachedConfig", mock(Config.class));
    sdk = mock(JsapiServiceExtension.class);
  }

  @AfterEach void cleanup() {
    logger.detachAppender(appender);
    appender.stop();
    logger.setLevel(previousLevel);
    logger.setAdditive(previousAdditive);
  }

  @ParameterizedTest
  @MethodSource("gatewayFailures")
  void classifiesSdkFailuresWithoutLoggingMessagesOrCauses(RuntimeException failure, String category) {
    when(sdk.prepayWithRequestPayment(any())).thenThrow(failure);
    stubSdk();
    ApiException clientError = catchThrowableOfType(this::prepay, ApiException.class);
    assertSafeFailure(clientError, "PREPAY", category, 502, "WECHAT_PAY_UNAVAILABLE");
  }

  static Stream<Arguments> gatewayFailures() {
    return Stream.of(
        Arguments.of(new HttpException(UNSAFE_MESSAGE, new SocketTimeoutException(UNSAFE_MESSAGE)), "TRANSPORT_TIMEOUT"),
        Arguments.of(new RuntimeException(UNSAFE_MESSAGE,
            new HttpException(UNSAFE_MESSAGE, new ConnectException(UNSAFE_MESSAGE))), "TRANSPORT_FAILURE"),
        Arguments.of(new ValidationException(UNSAFE_MESSAGE), "RESPONSE_SIGNATURE_INVALID"),
        Arguments.of(new MalformedMessageException(UNSAFE_MESSAGE), "RESPONSE_FORMAT_INVALID"),
        Arguments.of(new IllegalStateException(UNSAFE_MESSAGE), "SDK_FAILURE"));
  }

  @Test void recordsOnlyAllowlistedUpstreamCodeAndHttpStatus() throws Exception {
    when(sdk.prepayWithRequestPayment(any())).thenThrow(serviceFailure("APPID_MCHID_NOT_MATCH", 400));
    stubSdk();
    ApiException clientError = catchThrowableOfType(this::prepay, ApiException.class);
    String log = assertSafeFailure(clientError, "PREPAY", "UPSTREAM_REJECTED", 502, "WECHAT_PAY_UNAVAILABLE");
    assertThat(log).contains("upstream_code=APPID_MCHID_NOT_MATCH", "http_status=400");
    assertThat(clientError.getMessage()).doesNotContain("APPID_MCHID_NOT_MATCH");
  }

  @ParameterizedTest
  @ValueSource(strings = {"PRIVATE_SECRET_AND_SIGNATURE", "PARAM_ERROR\nAuthorization: PRIVATE_SECRET_AND_SIGNATURE", "", "NEW_UNKNOWN_CODE"})
  void redactsUnknownOrInjectedUpstreamCodesEvenWhenTheyLookLikeCodes(String code) throws Exception {
    when(sdk.prepayWithRequestPayment(any())).thenThrow(serviceFailure(code, 999));
    stubSdk();
    ApiException clientError = catchThrowableOfType(this::prepay, ApiException.class);
    String log = assertSafeFailure(clientError, "PREPAY", "UPSTREAM_REJECTED", 502, "WECHAT_PAY_UNAVAILABLE");
    assertThat(log).contains("upstream_code=UNKNOWN", "http_status=0").doesNotContain("NEW_UNKNOWN_CODE");
  }

  @Test void handlesMissingUpstreamCodeAndKeepsCorrelationUniqueAcrossFailures() {
    when(sdk.prepayWithRequestPayment(any())).thenThrow(new ServiceException(null, 503, "{}"));
    stubSdk();
    ApiException first = catchThrowableOfType(this::prepay, ApiException.class);
    String firstLog = assertSafeFailure(first, "PREPAY", "UPSTREAM_REJECTED", 502, "WECHAT_PAY_UNAVAILABLE");
    assertThat(firstLog).contains("upstream_code=UNKNOWN", "http_status=503");
    appender.list.clear();
    ApiException second = catchThrowableOfType(this::prepay, ApiException.class);
    assertSafeFailure(second, "PREPAY", "UPSTREAM_REJECTED", 502, "WECHAT_PAY_UNAVAILABLE");
    assertThat(second.getMessage()).isNotEqualTo(first.getMessage());
  }

  @Test void configurationPreflightHasSafeDiagnosticsBeforeOrderPaymentIntent() {
    var unconfigured = new WechatPayService("", "", "", "", "", "", "", "");
    ApiException error = catchThrowableOfType(unconfigured::requireConfigured, ApiException.class);
    assertSafeFailure(error, "CONFIGURATION", "CONFIGURATION_INVALID", 503, "PAYMENT_NOT_CONFIGURED");
    // 提示可操作但不暴露任何内部配置细节（路径、证书、密钥等）。
    assertThat(error.getMessage()).contains("配置").doesNotContain("证书", "私钥", "路径", "序列号");
  }

  @Test void prepayConfigurationFailureDoesNotExposeInternalConfiguration() {
    ReflectionTestUtils.setField(pay, "cachedConfig", null);
    ApiException error = catchThrowableOfType(this::prepay, ApiException.class);
    assertSafeFailure(error, "SDK_INITIALIZATION", "CONFIGURATION_INVALID", 503, "PAYMENT_NOT_CONFIGURED");
  }

  @Test void distinguishesSdkInitializationFromPrepayFailure() {
    doThrow(new IllegalStateException(UNSAFE_MESSAGE)).when(pay).service();
    ApiException error = catchThrowableOfType(this::prepay, ApiException.class);
    assertSafeFailure(error, "SDK_INITIALIZATION", "SDK_INITIALIZATION_FAILED", 502, "WECHAT_PAY_UNAVAILABLE");
    verifyNoInteractions(sdk);
  }

  @Test void distinguishesRequestConstructionAndResponseMappingFailures() {
    ApiException requestError = catchThrowableOfType(() -> pay.prepay(ORDER, 100, null, OPENID, PERSON, "notify"), ApiException.class);
    assertSafeFailure(requestError, "REQUEST_BUILD", "REQUEST_BUILD_FAILED", 502, "WECHAT_PAY_UNAVAILABLE");
    appender.list.clear();
    stubSdk();
    ApiException responseError = catchThrowableOfType(this::prepay, ApiException.class);
    assertSafeFailure(responseError, "RESPONSE_MAPPING", "RESPONSE_FORMAT_INVALID", 502, "WECHAT_PAY_UNAVAILABLE");
  }

  @Test void boundedCauseTraversalDoesNotHangOnCycles() {
    var first = new IllegalStateException(UNSAFE_MESSAGE);
    var second = new IllegalStateException(UNSAFE_MESSAGE, first);
    first.initCause(second);
    ApiException error = org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(java.time.Duration.ofSeconds(2),
        () -> PaymentDiagnostics.failure(PaymentDiagnostics.Stage.PREPAY, first));
    assertSafeFailure(error, "PREPAY", "SDK_FAILURE", 502, "WECHAT_PAY_UNAVAILABLE");
  }

  @ParameterizedTest
  @ValueSource(strings = {"notify", "activity-notify"})
  void preservesOfficialSdkRequestAndClientPaymentParameters(String callback) {
    var response = new PrepayWithRequestPaymentResponse();
    response.setTimeStamp("1700000000");
    response.setNonceStr("test-nonce");
    response.setPackageVal("prepay_id=synthetic");
    response.setSignType("RSA");
    response.setPaySign("synthetic-signature");
    when(sdk.prepayWithRequestPayment(any())).thenReturn(response);
    OffsetDateTime expires = OffsetDateTime.parse("2026-11-18T13:00:00Z");
    stubSdk();
    var result = pay.prepay(ORDER, 100, expires, OPENID, PERSON, callback);
    assertThat(result).isEqualTo(new ShopModels.PaymentRequest("1700000000", "test-nonce", "prepay_id=synthetic", "RSA", "synthetic-signature"));
    var json = new ObjectMapper().valueToTree(result);
    assertThat(json.path("package").asText()).isEqualTo("prepay_id=synthetic");
    assertThat(json.has("packageValue")).isFalse();
    var request = ArgumentCaptor.forClass(PrepayRequest.class);
    verify(sdk).prepayWithRequestPayment(request.capture());
    assertThat(request.getValue().getOutTradeNo()).isEqualTo(ORDER);
    assertThat(request.getValue().getPayer().getOpenid()).isEqualTo(OPENID);
    assertThat(request.getValue().getNotifyUrl()).isEqualTo("https://example.test/" + callback);
    assertThat(request.getValue().getAmount().getTotal()).isEqualTo(100);
    assertThat(appender.list).isEmpty();
  }

  private ShopModels.PaymentRequest prepay() {
    return pay.prepay(ORDER, 100, OffsetDateTime.now().plusMinutes(10), OPENID, PERSON, "notify");
  }

  /** 项目固定使用 subclass mock maker，SDK 通过包可见的 service() 以 spy 注入。 */
  private void stubSdk() {
    doReturn(sdk).when(pay).service();
  }

  private static ServiceException serviceFailure(String code, int status) throws Exception {
    var request = new HttpRequest.Builder().url("https://example.test/prepay")
        .httpMethod(HttpMethod.POST).addHeader("Authorization", SECRET)
        .body(new JsonRequestBody.Builder().body(UNSAFE_MESSAGE).build()).build();
    return new ServiceException(request, status, new ObjectMapper().writeValueAsString(Map.of("code", code, "message", UNSAFE_MESSAGE)));
  }

  private String assertSafeFailure(ApiException error, String stage, String category, int status, String code) {
    assertThat(error).isNotNull();
    assertThat(error.status).isEqualTo(status);
    assertThat(error.code).isEqualTo(code);
    assertThat(error.getCause()).isNull();
    assertThat(appender.list).hasSize(1);
    var event = appender.list.getFirst();
    assertThat(event.getThrowableProxy()).isNull();
    String log = event.getFormattedMessage();
    assertThat(log).contains("stage=" + stage, "category=" + category)
        .doesNotContain(SECRET, OPENID, ORDER, PERSON, "Authorization", "response", "PRIVATE_APP",
            "PRIVATE_MERCHANT", "PRIVATE_SERIAL", "PRIVATE_KEY_PATH", "PRIVATE_PUBLIC_KEY", "\n", "\r");
    var reference = Pattern.compile("ref=([a-f0-9-]{36})").matcher(log);
    assertThat(reference.find()).isTrue();
    assertThat(UUID.fromString(reference.group(1)).toString()).isEqualTo(reference.group(1));
    assertThat(error.getMessage()).contains(reference.group(1))
        .doesNotContain(SECRET, OPENID, ORDER, PERSON, "Authorization", "PRIVATE_", stage, category);
    var httpError = new ApiErrors().api(error);
    assertThat(httpError.getStatusCode().value()).isEqualTo(status);
    assertThat(httpError.getBody()).isEqualTo(Map.of("code", code, "message", error.getMessage()));
    return log;
  }
}
