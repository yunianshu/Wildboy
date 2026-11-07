package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.TransactionAmount;
import com.wechat.pay.java.service.payments.model.TransactionPayer;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** HTTP contracts against an isolated database. No real WeChat identity or money is used. */
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class PaymentHttpContractTest {
  static final EmbeddedPostgres pg;
  static {
    try {
      pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
  }

  @TempDir static Path keys;
  static KeyPair pair;
  static WechatPayService notificationParser;
  // Synthetic local crypto fixture, never a merchant credential.
  static final String API_KEY = "0123456789abcdef0123456789abcdef";
  static final String OPENID = "http-contract-owner";
  static final ShopModels.PaymentRequest PREPAY =
      new ShopModels.PaymentRequest("1730000000", "fixture-nonce", "prepay_id=fixture", "RSA", "fixture-signature");

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate db;
  @Autowired AuthService auth;
  @Autowired ShopService shop;
  @Autowired LegalService legal;
  @MockitoBean WechatPayService pay;
  Models.User owner;
  ShopModels.Product product;
  String ownerToken, otherToken, adminToken;

  @BeforeAll
  static void cryptoFixture() throws Exception {
    var generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    pair = generator.generateKeyPair();
    Path pub = keys.resolve("public.pem"), priv = keys.resolve("private.pem");
    Files.writeString(pub, pem("PUBLIC KEY", pair.getPublic().getEncoded()));
    Files.writeString(priv, pem("PRIVATE KEY", pair.getPrivate().getEncoded()));
    notificationParser = new WechatPayService("app", "merchant", priv.toString(), "serial",
        pub.toString(), "PUB_KEY_ID_TEST", API_KEY, "https://example.test/notify");
  }

  static String pem(String type, byte[] value) {
    return "-----BEGIN " + type + "-----\n"
        + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(value)
        + "\n-----END " + type + "-----\n";
  }

  @BeforeEach
  void setup() {
    // This class owns this EmbeddedPostgres instance; no running QA database is contacted.
    db.execute("TRUNCATE app_user,product,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for (var kind : LegalModels.Kind.values()) {
      var draft = legal.save(kind, new LegalModels.DraftInput("HTTP fixture " + kind,
          "Synthetic local HTTP contract legal document.", 0L), "fixture");
      legal.publish(kind, draft.draft().revision(), "fixture");
    }
    reset(pay);
    when(pay.enabled()).thenReturn(true);
    when(pay.merchantId()).thenReturn("merchant");
    when(pay.appId()).thenReturn("app");
    when(pay.prepay(any(), any())).thenReturn(PREPAY);
    // Only outbound gateway calls are simulated. Inbound signatures/decryption run real code.
    when(pay.parseNotification(anyMap(), anyString())).thenAnswer(i ->
        notificationParser.parseNotification(i.getArgument(0), i.getArgument(1)));
    when(pay.parseRefundNotification(anyMap(), anyString())).thenAnswer(i ->
        notificationParser.parseRefundNotification(i.getArgument(0), i.getArgument(1)));
    owner = auth.user("wechat:" + OPENID, "HTTP fixture", "USER");
    ownerToken = bearer(owner);
    otherToken = bearer(auth.user("wechat:http-contract-other", "Other fixture", "USER"));
    adminToken = bearer(auth.user("http-contract-admin", "Admin fixture", "ADMIN"));
    product = shop.createProduct(new ShopModels.ProductInput("HTTP fixture gear", "Local test only",
        "/assets/equipment.jpg", 137, 10, ShopModels.ProductStatus.ON_SALE, null), "fixture");
  }

  String bearer(Models.User user) { return "Bearer " + auth.login(user).token(); }

  ShopModels.Order createOrder() throws Exception {
    var input = new ShopModels.OrderInput(List.of(new ShopModels.OrderItemInput(product.id(), 2)),
        "QA buyer", "13800000000", "Synthetic local test address", 1L, 1L, UUID.randomUUID().toString());
    var response = mvc.perform(post("/api/v1/orders").header("Authorization", ownerToken)
            .contentType("application/json").content(json.writeValueAsBytes(input)))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.totalCents").value(274)).andReturn();
    return json.readValue(response.getResponse().getContentAsByteArray(), ShopModels.Order.class);
  }

  ShopModels.Order readOrder(ShopModels.Order order) throws Exception {
    var response = mvc.perform(get("/api/v1/orders/" + order.id()).header("Authorization", ownerToken))
        .andExpect(status().isOk()).andReturn();
    return json.readValue(response.getResponse().getContentAsByteArray(), ShopModels.Order.class);
  }

  void prepay(ShopModels.Order order) throws Exception {
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", ownerToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.package").value(PREPAY.packageValue()));
  }

  void stock(int expected) { assertThat(shop.product(product.id(), true).stock()).isEqualTo(expected); }

  void audit(String id, String action, int expected) {
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action=?",
        Integer.class, id, action)).isEqualTo(expected);
  }

  Transaction transaction(ShopModels.Order order) {
    var result = new Transaction();
    result.setAppid("app"); result.setMchid("merchant"); result.setOutTradeNo(order.orderNo());
    result.setTransactionId("tx-" + order.id()); result.setTradeState(Transaction.TradeStateEnum.SUCCESS);
    result.setTradeType(Transaction.TradeTypeEnum.JSAPI);
    var amount = new TransactionAmount(); amount.setTotal(order.totalCents()); amount.setCurrency("CNY");
    result.setAmount(amount);
    var payer = new TransactionPayer(); payer.setOpenid(OPENID); result.setPayer(payer);
    return result;
  }

  Map<String, Object> paymentData(ShopModels.Order order) {
    return new HashMap<>(Map.of("appid", "app", "mchid", "merchant", "out_trade_no", order.orderNo(),
        "transaction_id", "tx-" + order.id(), "trade_state", "SUCCESS", "trade_type", "JSAPI",
        "payer", Map.of("openid", OPENID), "amount", Map.of("total", order.totalCents(), "currency", "CNY")));
  }

  record Notification(String body, Map<String, String> headers) {}

  Notification notification(String type, Map<String, Object> data) throws Exception {
    String nonce = "123456789012";
    var cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(API_KEY.getBytes(StandardCharsets.UTF_8), "AES"),
        new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8)));
    cipher.updateAAD(type.getBytes(StandardCharsets.UTF_8));
    String encrypted = Base64.getEncoder().encodeToString(cipher.doFinal(json.writeValueAsBytes(data)));
    String event = type.equals("refund") ? "REFUND.SUCCESS" : "TRANSACTION.SUCCESS";
    String body = json.writeValueAsString(Map.of("id", UUID.randomUUID().toString(), "event_type", event,
        "resource_type", "encrypt-resource", "resource", Map.of("algorithm", "AEAD_AES_256_GCM",
            "ciphertext", encrypted, "nonce", nonce, "associated_data", type, "original_type", type)));
    String timestamp = Long.toString(Instant.now().getEpochSecond()), signatureNonce = "signature-nonce";
    var signer = Signature.getInstance("SHA256withRSA"); signer.initSign(pair.getPrivate());
    signer.update((timestamp + "\n" + signatureNonce + "\n" + body + "\n").getBytes(StandardCharsets.UTF_8));
    return new Notification(body, Map.of("wechatpay-serial", "PUB_KEY_ID_TEST", "wechatpay-nonce", signatureNonce,
        "wechatpay-timestamp", timestamp, "wechatpay-signature", Base64.getEncoder().encodeToString(signer.sign())));
  }

  MockHttpServletRequestBuilder notify(String endpoint, Notification n) {
    var request = post(endpoint).contentType("application/json").content(n.body());
    n.headers().forEach(request::header);
    return request;
  }

  @Test
  void prepayHttpReturnsNativePaymentContractAndUsesServerOrderAndOwner() throws Exception {
    var order = createOrder();
    // Client-supplied amounts/status are not accepted as payment evidence by this endpoint.
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", ownerToken)
            .contentType("application/json").content("{\"totalCents\":1,\"status\":\"PAID\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.timeStamp").value(PREPAY.timeStamp()))
        .andExpect(jsonPath("$.nonceStr").value(PREPAY.nonceStr()))
        .andExpect(jsonPath("$.package").value(PREPAY.packageValue()))
        .andExpect(jsonPath("$.signType").value("RSA"))
        .andExpect(jsonPath("$.paySign").value(PREPAY.paySign()))
        .andExpect(jsonPath("$.packageValue").doesNotExist());
    var sent = org.mockito.ArgumentCaptor.forClass(ShopModels.Order.class);
    verify(pay).prepay(sent.capture(), eq(OPENID));
    assertThat(sent.getValue().id()).isEqualTo(order.id());
    assertThat(sent.getValue().totalCents()).isEqualTo(274);
    assertThat(sent.getValue().items().getFirst().quantity()).isEqualTo(2);
    var pending = readOrder(order);
    assertThat(pending.status()).isEqualTo("PENDING_PAYMENT");
    assertThat(pending.paymentInitiated()).isTrue(); assertThat(pending.paidAt()).isNull();
    stock(8); audit(order.id(), "ORDER_PAID", 0);
  }

  @Test
  void paymentEndpointsRequireAuthenticationOwnershipAndWechatIdentity() throws Exception {
    var order = createOrder();
    for (String action : List.of("pay", "verify", "cancel")) {
      String path = "/api/v1/orders/" + order.id() + "/" + action;
      mvc.perform(post(path)).andExpect(status().isUnauthorized());
      mvc.perform(post(path).header("Authorization", otherToken)).andExpect(status().isNotFound());
    }
    String dev = bearer(auth.user("dev:http-payment", "Dev fixture", "USER"));
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", dev))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("WECHAT_IDENTITY_REQUIRED"));
    verify(pay, never()).prepay(any(), any()); verify(pay, never()).queryOrder(any());
    verify(pay, never()).closeOrder(any());
    assertThat(readOrder(order).paymentInitiated()).isFalse(); stock(8);
  }

  @Test
  void missingMerchantConfigurationReturns503BeforeRecordingPaymentIntent() throws Exception {
    var order = createOrder();
    var unconfigured = new WechatPayService("", "", "", "", "", "", "", "");
    doAnswer(i -> { unconfigured.requireConfigured(); return null; }).when(pay).requireConfigured();
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", ownerToken))
        .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("PAYMENT_NOT_CONFIGURED"));
    verify(pay, never()).prepay(any(), any());
    assertThat(readOrder(order).paymentInitiated()).isFalse(); stock(8); audit(order.id(), "ORDER_PAID", 0);
  }

  @Test
  void prepayTimeoutHttpKeepsCommittedIntentAndReconciliationWithoutClaimingPayment() throws Exception {
    var order = createOrder();
    when(pay.prepay(any(), any())).thenThrow(new ApiException(502, "WECHAT_PAY_UNAVAILABLE", "Synthetic prepay timeout"));
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", ownerToken))
        .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("WECHAT_PAY_UNAVAILABLE"));
    var pending = readOrder(order);
    assertThat(pending.status()).isEqualTo("PENDING_PAYMENT");
    assertThat(pending.paymentInitiated()).isTrue();
    assertThat(pending.reconciliationRequired()).isTrue();
    assertThat(pending.paidAt()).isNull(); stock(8); audit(order.id(), "ORDER_PAID", 0);
  }

  @Test
  void verifyHttpReconcilesOnceThenAdminCanShipConfirmedPayment() throws Exception {
    var order = createOrder(); prepay(order);
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order));
    for (int i = 0; i < 2; i++) {
      mvc.perform(post("/api/v1/orders/" + order.id() + "/verify").header("Authorization", ownerToken))
          .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"))
          .andExpect(jsonPath("$.paymentTransactionId").value("tx-" + order.id()))
          .andExpect(jsonPath("$.paidAt").isNotEmpty());
    }
    verify(pay, times(1)).queryOrder(order.orderNo()); audit(order.id(), "ORDER_PAID", 1); stock(8);
    long version = readOrder(order).version();
    mvc.perform(post("/api/v1/admin/orders/" + order.id() + "/ship").header("Authorization", ownerToken)
            .contentType("application/json").content("{\"version\":" + version + "}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/admin/orders/" + order.id() + "/ship").header("Authorization", adminToken)
            .contentType("application/json").content("{\"version\":" + version + "}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SHIPPED"));
    audit(order.id(), "ORDER_SHIP", 1); stock(8);
    mvc.perform(post("/api/v1/orders/" + order.id() + "/cancel").header("Authorization", ownerToken))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_NOT_CANCELLABLE"));
  }

  @Test
  void cancelHttpClosesInitiatedGatewayOrderBeforeRestockingExactlyOnce() throws Exception {
    var order = createOrder(); prepay(order);
    doAnswer(i -> { stock(8); return null; }).when(pay).closeOrder(order.orderNo());
    for (int i = 0; i < 2; i++) {
      mvc.perform(post("/api/v1/orders/" + order.id() + "/cancel").header("Authorization", ownerToken))
          .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
    }
    verify(pay, times(1)).closeOrder(order.orderNo()); stock(10); audit(order.id(), "ORDER_CANCEL", 1);
    mvc.perform(post("/api/v1/orders/" + order.id() + "/pay").header("Authorization", ownerToken))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
    verify(pay, times(1)).prepay(any(), any());
  }

  @Test
  void uncertainGatewayCloseHttpRetainsStockUntilClosedIsConfirmed() throws Exception {
    var order = createOrder(); prepay(order);
    doThrow(new ApiException(502, "WECHAT_CLOSE_FAILED", "Synthetic gateway timeout")).when(pay).closeOrder(order.orderNo());
    when(pay.queryOrder(order.orderNo())).thenReturn(null);
    mvc.perform(post("/api/v1/orders/" + order.id() + "/cancel").header("Authorization", ownerToken))
        .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("WECHAT_CLOSE_FAILED"));
    assertThat(readOrder(order).status()).isEqualTo("PENDING_PAYMENT"); stock(8); audit(order.id(), "ORDER_CANCEL", 0);
    var closed = transaction(order); closed.setTradeState(Transaction.TradeStateEnum.CLOSED);
    when(pay.queryOrder(order.orderNo())).thenReturn(closed);
    mvc.perform(post("/api/v1/orders/" + order.id() + "/cancel").header("Authorization", ownerToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
    stock(10); audit(order.id(), "ORDER_CANCEL", 1);
  }

  @Test
  void signedNotifyHttpForwardsExactHeadersAndBodyAndBooksPaymentOnce() throws Exception {
    var order = createOrder(); prepay(order);
    var n = notification("transaction", paymentData(order));
    ShopModels.Order firstPaid = null;
    for (int i = 0; i < 2; i++) {
      mvc.perform(notify("/api/v1/payments/wechat/notify", n)).andExpect(status().isOk())
          .andExpect(jsonPath("$.code").value("SUCCESS"));
      var current = readOrder(order);
      assertThat(current.paidAt()).isNotNull();
      if (firstPaid == null) firstPaid = current;
      else {
        assertThat(current.version()).isEqualTo(firstPaid.version());
        assertThat(current.paidAt()).isEqualTo(firstPaid.paidAt());
        assertThat(current.paymentTransactionId()).isEqualTo(firstPaid.paymentTransactionId());
      }
    }
    verify(pay, times(2)).parseNotification(eq(n.headers()), eq(n.body()));
    assertThat(readOrder(order).status()).isEqualTo("PAID");
    assertThat(readOrder(order).paymentTransactionId()).isEqualTo("tx-" + order.id());
    stock(8); audit(order.id(), "ORDER_PAID", 1);
  }

  @Test
  void notifyHttpRejectsTamperingAndMissingHeadersWithoutBooking() throws Exception {
    var order = createOrder(); prepay(order);
    var n = notification("transaction", paymentData(order));
    mvc.perform(notify("/api/v1/payments/wechat/notify", new Notification(n.body() + " ", n.headers())))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_PAYMENT_SIGNATURE"));
    mvc.perform(post("/api/v1/payments/wechat/notify").contentType("application/json").content(n.body()))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_PAYMENT_SIGNATURE"));
    assertThat(readOrder(order).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(readOrder(order).paidAt()).isNull(); stock(8); audit(order.id(), "ORDER_PAID", 0);
  }

  @Test
  void notifyHttpCannotReviveCancelledOrderOrOverwriteAnExistingTransaction() throws Exception {
    var cancelled = createOrder();
    mvc.perform(post("/api/v1/orders/" + cancelled.id() + "/cancel").header("Authorization", ownerToken))
        .andExpect(status().isOk());
    mvc.perform(notify("/api/v1/payments/wechat/notify", notification("transaction", paymentData(cancelled))))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_ORDER_STATE_CONFLICT"));
    assertThat(readOrder(cancelled).status()).isEqualTo("CANCELLED");
    stock(10); audit(cancelled.id(), "ORDER_PAID", 0);
    var paid = paidOrder();
    var different = paymentData(paid); different.put("transaction_id", "different-transaction");
    mvc.perform(notify("/api/v1/payments/wechat/notify", notification("transaction", different)))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_ORDER_STATE_CONFLICT"));
    assertThat(readOrder(paid).paymentTransactionId()).isEqualTo(paid.paymentTransactionId());
    assertThat(readOrder(paid).status()).isEqualTo("PAID"); stock(8); audit(paid.id(), "ORDER_PAID", 1);
  }

  @ParameterizedTest(name = "signed notification mismatch: {0}")
  @CsvSource({"amount,PAYMENT_AMOUNT_MISMATCH", "currency,PAYMENT_AMOUNT_MISMATCH",
      "payer,PAYMENT_PAYER_MISMATCH", "type,PAYMENT_PAYER_MISMATCH",
      "merchant,PAYMENT_MERCHANT_MISMATCH", "app,PAYMENT_MERCHANT_MISMATCH",
      "order,PAYMENT_ORDER_MISMATCH", "transaction,PAYMENT_TRANSACTION_REQUIRED",
      "state,INVALID_PAYMENT_NOTIFICATION"})
  void signedButMismatchedNotifyHttpNeverCreditsOrder(String field, String code) throws Exception {
    var order = createOrder(); prepay(order);
    var data = paymentData(order);
    switch (field) {
      case "amount" -> data.put("amount", Map.of("total", 1, "currency", "CNY"));
      case "currency" -> data.put("amount", Map.of("total", order.totalCents(), "currency", "USD"));
      case "payer" -> data.put("payer", Map.of("openid", "other"));
      case "type" -> data.put("trade_type", "NATIVE");
      case "merchant" -> data.put("mchid", "other");
      case "app" -> data.put("appid", "other");
      case "order" -> data.put("out_trade_no", "unrelated-order");
      case "transaction" -> data.put("transaction_id", "");
      case "state" -> data.put("trade_state", "NOTPAY");
      default -> throw new AssertionError(field);
    }
    mvc.perform(notify("/api/v1/payments/wechat/notify", notification("transaction", data)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(code));
    assertThat(readOrder(order).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(readOrder(order).paidAt()).isNull(); stock(8); audit(order.id(), "ORDER_PAID", 0);
  }

  ShopModels.Order paidOrder() throws Exception {
    var order = createOrder(); prepay(order);
    mvc.perform(notify("/api/v1/payments/wechat/notify", notification("transaction", paymentData(order))))
        .andExpect(status().isOk());
    return readOrder(order);
  }

  RefundModels.Refund requestRefund(ShopModels.Order order) throws Exception {
    var response = mvc.perform(post("/api/v1/orders/" + order.id() + "/refund").header("Authorization", ownerToken)
            .contentType("application/json").content("{\"reason\":\"Synthetic local refund\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REQUESTED")).andReturn();
    return json.readValue(response.getResponse().getContentAsByteArray(), RefundModels.Refund.class);
  }

  RefundModels.GatewayResult refundResult(ShopModels.Order order, RefundModels.Refund r, String state) {
    return new RefundModels.GatewayResult(r.outRefundNo(), order.orderNo(), order.paymentTransactionId(),
        "wx-refund-fixture", order.totalCents(), r.amountCents(), "CNY", state);
  }

  RefundModels.Refund approveRefund(ShopModels.Order order, RefundModels.Refund r) throws Exception {
    when(pay.createRefund(any(), any())).thenReturn(refundResult(order, r, "PROCESSING"));
    var response = mvc.perform(post("/api/v1/admin/refunds/" + r.id() + "/approve").header("Authorization", adminToken)
            .contentType("application/json").content("{\"version\":" + r.version() + "}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PROCESSING")).andReturn();
    assertThat(readOrder(order).status()).isEqualTo("PAID"); stock(8);
    mvc.perform(post("/api/v1/admin/orders/" + order.id() + "/ship").header("Authorization", adminToken)
            .contentType("application/json").content("{\"version\":" + readOrder(order).version() + "}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REFUND_PENDING"));
    return json.readValue(response.getResponse().getContentAsByteArray(), RefundModels.Refund.class);
  }

  Map<String, Object> refundData(ShopModels.Order order, RefundModels.Refund refund) {
    return new HashMap<>(Map.of("mchid", "merchant", "out_trade_no", order.orderNo(),
        "transaction_id", order.paymentTransactionId(), "out_refund_no", refund.outRefundNo(),
        "refund_id", "wx-refund-fixture", "refund_status", "SUCCESS",
        "amount", Map.of("total", order.totalCents(), "refund", refund.amountCents(), "currency", "CNY")));
  }

  @Test
  void refundHttpApprovalAndSignedCallbackRestockOnlyOnConfirmedSuccessOnce() throws Exception {
    var order = paidOrder(); var r = requestRefund(order);
    assertThat(requestRefund(order).id()).isEqualTo(r.id());
    approveRefund(order, r);
    var n = notification("refund", refundData(order, r));
    for (int i = 0; i < 2; i++) {
      mvc.perform(notify("/api/v1/payments/wechat/refund-notify", n)).andExpect(status().isOk())
          .andExpect(jsonPath("$.code").value("SUCCESS"));
    }
    verify(pay, times(2)).parseRefundNotification(eq(n.headers()), eq(n.body()));
    mvc.perform(get("/api/v1/orders/" + order.id() + "/refund").header("Authorization", ownerToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUCCESS"));
    assertThat(readOrder(order).status()).isEqualTo("REFUNDED"); stock(10); audit(r.id(), "REFUND_SUCCESS", 1);
    var sent = org.mockito.ArgumentCaptor.forClass(ShopModels.Order.class);
    verify(pay).createRefund(sent.capture(), argThat(value -> value.outRefundNo().equals(r.outRefundNo())
        && value.amountCents() == 274));
    assertThat(sent.getValue().paymentTransactionId()).isEqualTo(order.paymentTransactionId());
  }

  @Test
  void refundVerificationHttpConfirmsGatewayResultAndEnforcesRoleAndVersion() throws Exception {
    var order = paidOrder(); var r = requestRefund(order); var processing = approveRefund(order, r);
    String endpoint = "/api/v1/admin/refunds/" + r.id() + "/verify";
    mvc.perform(post(endpoint).header("Authorization", ownerToken).contentType("application/json")
            .content("{\"version\":" + processing.version() + "}"))
        .andExpect(status().isForbidden());
    mvc.perform(post(endpoint).header("Authorization", adminToken).contentType("application/json")
            .content("{\"version\":" + r.version() + "}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_VERSION"));
    verify(pay, never()).queryRefund(any());
    when(pay.queryRefund(r.outRefundNo())).thenReturn(refundResult(order, r, "SUCCESS"));
    mvc.perform(post(endpoint).header("Authorization", adminToken).contentType("application/json")
            .content("{\"version\":" + processing.version() + "}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUCCESS"));
    verify(pay).queryRefund(r.outRefundNo());
    assertThat(readOrder(order).status()).isEqualTo("REFUNDED"); stock(10); audit(r.id(), "REFUND_SUCCESS", 1);
  }

  @Test
  void refundNotifyHttpRejectsInvalidSignatureAndAmountWithoutRestocking() throws Exception {
    var order = paidOrder(); var r = requestRefund(order); approveRefund(order, r);
    var good = notification("refund", refundData(order, r));
    mvc.perform(notify("/api/v1/payments/wechat/refund-notify", new Notification(good.body() + " ", good.headers())))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_REFUND_SIGNATURE"));
    var data = refundData(order, r);
    data.put("amount", Map.of("total", order.totalCents(), "refund", 1, "currency", "CNY"));
    mvc.perform(notify("/api/v1/payments/wechat/refund-notify", notification("refund", data)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("REFUND_MISMATCH"));
    assertThat(readOrder(order).status()).isEqualTo("PAID"); stock(8); audit(r.id(), "REFUND_SUCCESS", 0);
    mvc.perform(get("/api/v1/orders/" + order.id() + "/refund").header("Authorization", ownerToken))
        .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PROCESSING"));
  }
}
