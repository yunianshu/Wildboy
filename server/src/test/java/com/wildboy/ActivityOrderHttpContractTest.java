package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Real loopback HTTP and PostgreSQL with synthetic keys and simulated outbound merchant calls. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "server.address=127.0.0.1", "wildboy.activity-orders.expiry-scan-ms=3600000",
    "wildboy.orders.expiry-scan-ms=3600000", "wildboy.notifications.enabled=false"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ActivityOrderHttpContractTest {
  private static final String OPEN_ID = "activity-http-fixture-owner";
  private static final String APP_ID = "activity-http-fixture-app";
  private static final String MERCHANT_ID = "activity-http-fixture-merchant";
  private static final String PUBLIC_KEY_ID = "PUB_KEY_ID_ACTIVITY_HTTP";
  private static final String LOCAL_API_KEY = "activity-http-test-key-only-0000";
  private static final String TX_ID = "activity-http-fixture-transaction";
  private static final String REFUND_ID = "activity-http-fixture-refund";
  private static final int ACTIVITY_TOTAL = 1800;
  private static final WechatPayService.PaymentRequest PREPAY =
      new WechatPayService.PaymentRequest("1730000000", "fixture-nonce", "prepay_id=activity-test", "RSA", "test-only");
  private static final EmbeddedPostgres PG = startDatabase();
  @TempDir static Path keys;
  private static KeyPair fixtureKey;
  private static WechatPayService parser;

  @LocalServerPort int port;
  @Autowired JdbcTemplate db;
  @Autowired AuthService auth;
  @Autowired LegalService legal;
  @Autowired ObjectMapper json;
  @MockitoBean WechatPayService pay;
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  private String adminToken;
  private String ownerToken;
  private String ownerId;

  private static EmbeddedPostgres startDatabase() {
    try {
      return EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", () -> PG.getJdbcUrl("postgres", "postgres"));
    registry.add("spring.datasource.username", () -> "postgres");
    registry.add("spring.datasource.password", () -> "");
    registry.add("wildboy.identity.encryption-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
  }

  @BeforeAll
  static void prepareLocalKeys() throws Exception {
    var generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    fixtureKey = generator.generateKeyPair();
    var publicKey = keys.resolve("public.pem");
    var privateKey = keys.resolve("private.pem");
    Files.writeString(publicKey, pem("PUBLIC KEY", fixtureKey.getPublic().getEncoded()));
    Files.writeString(privateKey, pem("PRIVATE KEY", fixtureKey.getPrivate().getEncoded()));
    parser = new WechatPayService(APP_ID, MERCHANT_ID, privateKey.toString(), "local-serial",
        publicKey.toString(), PUBLIC_KEY_ID, LOCAL_API_KEY, "https://example.test/api/v1/payments/wechat/notify");
  }

  @AfterAll
  static void stopDatabase() throws Exception {
    PG.close();
  }

  private static String pem(String type, byte[] bytes) {
    return "-----BEGIN " + type + "-----\n"
        + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(bytes)
        + "\n-----END " + type + "-----\n";
  }

  @BeforeEach
  void configureFixture() throws Exception {
    db.execute("TRUNCATE app_user,activity,product,membership_tier,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for (var kind : LegalModels.Kind.values()) {
      var draft = legal.save(kind, new LegalModels.DraftInput("Local HTTP " + kind,
          "Synthetic local payment contract document.", 0L), "fixture");
      legal.publish(kind, draft.draft().revision(), "fixture");
    }
    when(pay.enabled()).thenReturn(true);
    when(pay.appId()).thenReturn(APP_ID);
    when(pay.merchantId()).thenReturn(MERCHANT_ID);
    when(pay.parseNotification(anyMap(), anyString())).thenAnswer(call ->
        parser.parseNotification(call.getArgument(0), call.getArgument(1)));
    when(pay.parseRefundNotification(anyMap(), anyString())).thenAnswer(call ->
        parser.parseRefundNotification(call.getArgument(0), call.getArgument(1)));
    adminToken = auth.login(auth.user("admin:activity-http-fixture", "Test administrator", "ADMIN")).token();
    var login = auth.finishWechat(OPEN_ID, 1L, 1L);
    ownerId = login.user().id();
    ownerToken = login.token();
    request("PUT", "/me/profile", ownerToken,
        Map.of("realName", "测试联系人", "phone", "13800000000", "privacyVersion", 1, "termsVersion", 1), 200);

    var tier = request("POST", "/admin/membership/tiers", adminToken, Map.of(
        "name", "Local member fixture", "sortOrder", 0, "enabled", true,
        "rules", List.of(
            Map.of("scope", "ACTIVITY", "enabled", true, "pricingMode", "DISCOUNT",
                "pricingValue", 8000, "participantPricing", "ONE_BENEFIT"),
            Map.of("scope", "SHOP", "enabled", true, "pricingMode", "REDUCTION", "pricingValue", 100))), 201);
    var membership = request("GET", "/me/membership", ownerToken, null, 200);
    request("PUT", "/admin/membership/users/" + ownerId, adminToken,
        Map.of("customerType", "MEMBER", "tierId", tier.path("id").asText(), "version", membership.path("version").asLong()), 200);
  }

  @Test
  void paidActivityAndRefundReachConfirmedStatesThroughSignedHttpCallbacks() throws Exception {
    var activity = createPaidActivity();
    String activityId = activity.path("id").asText();
    String orders = "/activities/" + activityId + "/orders";
    var quote = request("GET", "/activities/" + activityId + "/quote?participants=2", ownerToken, null, 200);
    assertThat(quote.path("originalTotalCents").asInt()).isEqualTo(2000);
    assertThat(quote.path("totalCents").asInt()).isEqualTo(ACTIVITY_TOTAL);
    assertThat(quote.path("participantPricing").asText()).isEqualTo("ONE_BENEFIT");
    var signup = Map.of("participants", List.of(
        Map.of("participantName", "测试甲", "idNumber", "", "phone", "13800000000"),
        Map.of("participantName", "测试乙", "idNumber", "", "phone", "13800000001")),
        "privacyVersion", 1, "termsVersion", 1);
    String key = "local-http-activity-order";
    var changed = request("POST", orders, ownerToken,
        Map.of("requestKey", key, "expectedTotalCents", 1, "registration", signup), 409);
    assertThat(changed.path("code").asText()).isEqualTo("ACTIVITY_PRICE_CHANGED");
    assertSeats(activityId, 0, 0);
    var input = Map.of("requestKey", key, "expectedTotalCents", ACTIVITY_TOTAL, "registration", signup);
    var order = request("POST", orders, ownerToken, input, 200);
    String orderId = order.path("id").asText();
    String orderNo = order.path("orderNo").asText();
    String mine = "/activity-orders/" + orderId;
    String admin = "/admin/activity-orders/" + orderId;
    assertThat(order.path("status").asText()).isEqualTo("PENDING_PAYMENT");
    assertThat(request("POST", orders, ownerToken, input, 200).path("id").asText()).isEqualTo(orderId);
    assertSeats(activityId, 2, 0);

    when(pay.prepay(eq(orderNo), eq(ACTIVITY_TOTAL), any(OffsetDateTime.class), eq(OPEN_ID),
        anyString(), eq("activity-notify"))).thenReturn(PREPAY);
    assertThat(request("POST", mine + "/pay", ownerToken, null, 200).path("package").asText())
        .isEqualTo(PREPAY.packageValue());
    String paymentNotify = "/payments/wechat/activity-notify";
    var payment = signedEvent("transaction", "TRANSACTION.SUCCESS", paymentData(orderNo, ACTIVITY_TOTAL));
    raw("POST", paymentNotify, null, payment.body() + " ", payment.headers(), 401);
    callback(paymentNotify, signedEvent("transaction", "TRANSACTION.SUCCESS", paymentData(orderNo, ACTIVITY_TOTAL + 1)), 400);
    assertSeats(activityId, 2, 0);
    callback(paymentNotify, payment, 200);
    callback(paymentNotify, payment, 200);
    assertThat(request("GET", mine, ownerToken, null, 200).path("status").asText()).isEqualTo("PAID");
    assertSeats(activityId, 2, 2);

    var initialRefund = request("POST", mine + "/refund", ownerToken, Map.of("reason", "First fixture request"), 200);
    request("POST", admin + "/refund/reject", adminToken,
        Map.of("refundId", initialRefund.path("id").asText(), "version", initialRefund.path("version").asLong(),
            "note", "Please submit the updated reason"), 200);
    var refund = request("POST", mine + "/refund", ownerToken, Map.of("reason", "Updated fixture request"), 200);
    var stale = request("POST", admin + "/refund/approve", adminToken, refundTarget(initialRefund), 409);
    assertThat(stale.path("code").asText()).isEqualTo("STALE_REFUND");
    verify(pay, never()).createRefund(anyString(), anyString(), anyInt(), anyString(), anyInt(), anyString(), anyString());
    assertThat(refund.path("amount_cents").asInt()).isEqualTo(ACTIVITY_TOTAL);
    String refundNo = refund.path("out_refund_no").asText();
    when(pay.createRefund(eq(orderNo), eq(TX_ID), eq(ACTIVITY_TOTAL), eq(refundNo), eq(ACTIVITY_TOTAL),
        anyString(), eq("activity-refund-notify"))).thenReturn(new RefundModels.GatewayResult(
            refundNo, orderNo, TX_ID, REFUND_ID, ACTIVITY_TOTAL, ACTIVITY_TOTAL, "CNY", "PROCESSING"));
    var approved = request("POST", admin + "/refund/approve", adminToken, refundTarget(refund), 200);
    assertThat(approved.path("status").asText()).isEqualTo("PROCESSING");
    assertSeats(activityId, 2, 2);

    String refundNotify = "/payments/wechat/activity-refund-notify";
    callback(refundNotify, signedEvent("refund", "REFUND.SUCCESS", refundData(orderNo, refundNo, ACTIVITY_TOTAL - 1)), 400);
    assertSeats(activityId, 2, 2);
    var success = signedEvent("refund", "REFUND.SUCCESS", refundData(orderNo, refundNo, ACTIVITY_TOTAL));
    callback(refundNotify, success, 200);
    callback(refundNotify, success, 200);
    var refunded = request("GET", mine, ownerToken, null, 200);
    assertThat(refunded.path("status").asText()).isEqualTo("REFUNDED");
    assertThat(refunded.path("totalCents").asInt()).isEqualTo(ACTIVITY_TOTAL);
    assertSeats(activityId, 0, 0);
    var released = request("GET", "/activities/" + activityId, null, null, 200);
    assertThat(request("POST", "/admin/activities/" + activityId + "/cancel", adminToken,
        Map.of("version", released.path("version").asLong()), 200).path("status").asText()).isEqualTo("CANCELLED");
  }

  @Test
  void expiredOrderReleasesOnlyAfterTwoAuthoritativeMissingOrderChecks() throws Exception {
    String activityId = createPaidActivity().path("id").asText();
    var signup = Map.of("participants", List.of(
        Map.of("participantName", "测试甲", "idNumber", "", "phone", "13800000000")),
        "privacyVersion", 1, "termsVersion", 1);
    var order = request("POST", "/activities/" + activityId + "/orders", ownerToken,
        Map.of("requestKey", "local-http-expiry-order", "expectedTotalCents", 800, "registration", signup), 200);
    String orderId = order.path("id").asText();
    String orderNo = order.path("orderNo").asText();
    String mine = "/activity-orders/" + orderId;
    when(pay.prepay(eq(orderNo), eq(800), any(OffsetDateTime.class), eq(OPEN_ID), anyString(), eq("activity-notify")))
        .thenThrow(new ApiException(502, "WECHAT_PAY_UNAVAILABLE", "Synthetic prepay timeout"));
    request("POST", mine + "/pay", ownerToken, null, 502);
    when(pay.queryOrder(orderNo)).thenThrow(new WechatPayService.OrderNotFound());
    assertThat(request("POST", mine + "/verify", ownerToken, null, 200).path("status").asText())
        .isEqualTo("PENDING_PAYMENT");
    assertThat(request("POST", mine + "/cancel", ownerToken, null, 409).path("code").asText())
        .isEqualTo("PAYMENT_UNCERTAIN");
    assertSeats(activityId, 1, 0);

    // Move the isolated fixture clock fields through the configured observation windows.
    db.update("UPDATE activity_order SET expires_at=CURRENT_TIMESTAMP-INTERVAL '3 minutes', "
        + "payment_attempted_at=CURRENT_TIMESTAMP-INTERVAL '5 minutes' WHERE id=?", orderId);
    doThrow(new ApiException(502, "WECHAT_QUERY_FAILED", "Synthetic lookup timeout"))
        .when(pay).queryOrder(orderNo);
    request("POST", mine + "/cancel", ownerToken, null, 502);
    assertSeats(activityId, 1, 0);
    doThrow(new WechatPayService.OrderNotFound()).when(pay).queryOrder(orderNo);
    assertThat(request("POST", mine + "/cancel", ownerToken, null, 409).path("code").asText())
        .isEqualTo("PAYMENT_UNCERTAIN");
    assertSeats(activityId, 1, 0);
    db.update("UPDATE activity_order SET payment_not_found_at=CURRENT_TIMESTAMP-INTERVAL '2 minutes' WHERE id=?", orderId);
    var reconciled = request("POST", "/admin/activity-orders/close-expired", adminToken, null, 200);
    assertThat(reconciled.path("closed").asInt()).isEqualTo(1);
    assertThat(request("POST", mine + "/cancel", ownerToken, null, 200).path("status").asText()).isEqualTo("CLOSED");
    assertSeats(activityId, 0, 0);
  }

  private JsonNode createPaidActivity() throws Exception {
    var start = OffsetDateTime.now().plusDays(7);
    var draft = request("POST", "/admin/activities", adminToken, Map.ofEntries(
        Map.entry("title", "Synthetic local hike"), Map.entry("category", "WEEKLY"),
        Map.entry("coverUrl", "/assets/category-weekly.jpg"), Map.entry("galleryUrls", List.of()),
        Map.entry("summary", "Local checkout fixture"), Map.entry("description", "Synthetic paid activity"),
        Map.entry("location", "本地测试"), Map.entry("meetingPoint", "测试集合点"),
        Map.entry("startAt", start.toString()), Map.entry("endAt", start.plusHours(4).toString()),
        Map.entry("registrationDeadline", start.minusDays(1).toString()), Map.entry("capacity", 2),
        Map.entry("priceCents", 0), Map.entry("identityRequired", false)), 201);
    String adminPath = "/admin/activities/" + draft.path("id").asText();
    var priced = request("POST", adminPath + "/price", adminToken,
        Map.of("priceCents", 1000, "version", draft.path("version").asLong()), 200);
    return request("POST", adminPath + "/publish", adminToken, Map.of("version", priced.path("version").asLong()), 200);
  }

  private void assertSeats(String id, int occupied, int confirmed) throws Exception {
    var activity = request("GET", "/activities/" + id, null, null, 200);
    assertThat(activity.path("registeredCount").asInt()).isEqualTo(occupied);
    assertThat(activity.path("confirmedCount").asInt(-1)).isEqualTo(confirmed);
    assertThat(activity.path("pendingPaymentCount").asInt(-1)).isEqualTo(occupied - confirmed);
  }

  private Map<String, Object> refundTarget(JsonNode refund) {
    return Map.of("refundId", refund.path("id").asText(), "version", refund.path("version").asLong());
  }

  private Map<String, Object> paymentData(String orderNo, int amount) {
    return Map.of("appid", APP_ID, "mchid", MERCHANT_ID, "out_trade_no", orderNo, "transaction_id", TX_ID,
        "trade_state", "SUCCESS", "trade_type", "JSAPI", "payer", Map.of("openid", OPEN_ID),
        "amount", Map.of("total", amount, "currency", "CNY"));
  }

  private Map<String, Object> refundData(String orderNo, String refundNo, int amount) {
    return Map.of("mchid", MERCHANT_ID, "out_trade_no", orderNo, "transaction_id", TX_ID,
        "out_refund_no", refundNo, "refund_id", REFUND_ID, "refund_status", "SUCCESS",
        "amount", Map.of("total", ACTIVITY_TOTAL, "refund", amount, "currency", "CNY"));
  }

  private record SignedEvent(String body, Map<String, String> headers) {}

  private SignedEvent signedEvent(String type, String event, Map<String, Object> data) throws Exception {
    var random = new byte[12];
    new java.security.SecureRandom().nextBytes(random);
    String nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(random).substring(0, 12);
    var cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(LOCAL_API_KEY.getBytes(StandardCharsets.UTF_8), "AES"),
        new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8)));
    cipher.updateAAD(type.getBytes(StandardCharsets.UTF_8));
    String ciphertext = Base64.getEncoder().encodeToString(cipher.doFinal(json.writeValueAsBytes(data)));
    String body = json.writeValueAsString(Map.of("id", UUID.randomUUID().toString(), "event_type", event,
        "resource_type", "encrypt-resource", "resource", Map.of("algorithm", "AEAD_AES_256_GCM", "ciphertext", ciphertext,
            "nonce", nonce, "associated_data", type, "original_type", type)));
    String timestamp = Long.toString(Instant.now().getEpochSecond());
    var signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(fixtureKey.getPrivate());
    signature.update((timestamp + "\n" + nonce + "\n" + body + "\n").getBytes(StandardCharsets.UTF_8));
    return new SignedEvent(body, Map.of("Wechatpay-Serial", PUBLIC_KEY_ID, "Wechatpay-Nonce", nonce,
        "Wechatpay-Timestamp", timestamp, "Wechatpay-Signature", Base64.getEncoder().encodeToString(signature.sign())));
  }

  private void callback(String path, SignedEvent event, int status) throws Exception {
    raw("POST", path, null, event.body(), event.headers(), status);
  }

  private JsonNode request(String method, String path, String token, Object body, int status) throws Exception {
    return raw(method, path, token, body == null ? null : json.writeValueAsString(body), Map.of(), status);
  }

  private JsonNode raw(String method, String path, String token, String body, Map<String, String> headers, int status)
      throws Exception {
    var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
        .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json");
    if (token != null) request.header("Authorization", "Bearer " + token);
    headers.forEach(request::header);
    request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
    var response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as("%s %s: %s", method, path, response.body()).isEqualTo(status);
    return json.readTree(response.body());
  }
}
