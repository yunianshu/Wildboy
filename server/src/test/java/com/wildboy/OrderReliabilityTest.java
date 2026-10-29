package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.TransactionAmount;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class OrderReliabilityTest {
  static final EmbeddedPostgres pg;
  static { try { pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start(); }
    catch (Exception e) { throw new ExceptionInInitializerError(e); } }
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
  }
  @Autowired org.springframework.test.web.servlet.MockMvc mvc;
  @Autowired ShopService shop;
  @Autowired AuthService auth;
  @Autowired LegalService legal;
  @Autowired JdbcTemplate db;
  @org.springframework.test.context.bean.override.mockito.MockitoBean WechatPayService pay;
  Models.User user;
  ShopModels.Product product;
  @BeforeEach void setup() {
    db.execute("TRUNCATE legal_consent,legal_document_version");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    db.update("DELETE FROM audit_event"); db.update("DELETE FROM shop_order"); db.update("DELETE FROM product");
    db.update("DELETE FROM auth_session"); db.update("DELETE FROM app_user");
    for (var kind : LegalModels.Kind.values()) {
      var d = legal.save(kind,new LegalModels.DraftInput("QA " + kind,"Synthetic fixture legal document only.",0L),"fixture");
      legal.publish(kind,d.draft().revision(),"fixture");
    }
    when(pay.enabled()).thenReturn(true);when(pay.merchantId()).thenReturn("merchant");when(pay.appId()).thenReturn("app");
    user = auth.user("wechat:reliability-user", "QA", "USER");
    product = shop.createProduct(new ShopModels.ProductInput("QA gear","Synthetic gear","/assets/equipment.jpg",100,100,ShopModels.ProductStatus.ON_SALE,null),"fixture");
  }
  ShopModels.OrderInput input(String key, int quantity) {
    return new ShopModels.OrderInput(List.of(new ShopModels.OrderItemInput(product.id(),quantity)),"QA buyer","13800000000","Synthetic street address",1L,1L,key);
  }
  Transaction transaction(ShopModels.Order order, Transaction.TradeStateEnum state) {
    var tx = new Transaction(); tx.setMchid("merchant");tx.setOutTradeNo(order.orderNo());tx.setTradeState(state);tx.setTransactionId("tx-"+order.id());
    tx.setAppid("app");tx.setTradeType(Transaction.TradeTypeEnum.JSAPI);
    var payer = new com.wechat.pay.java.service.payments.model.TransactionPayer();payer.setOpenid("reliability-user");tx.setPayer(payer);
    var amount = new TransactionAmount();amount.setTotal(order.totalCents());amount.setCurrency("CNY");tx.setAmount(amount);
    return tx;
  }
  @Test void concurrentRetriesReturnOneOrderAndReserveStockOnce() throws Exception {
    try (var executor = Executors.newFixedThreadPool(6)) {
      var tasks = new ArrayList<Callable<String>>();
      for (int i=0;i<6;i++) tasks.add(() -> shop.createOrder(user.id(),input("stable-request",2)).id());
      var ids = new HashSet<String>();for (var result:executor.invokeAll(tasks)) ids.add(result.get(10,TimeUnit.SECONDS));
      assertThat(ids).hasSize(1);assertThat(shop.product(product.id(),true).stock()).isEqualTo(98);
    }
    assertThatThrownBy(() -> shop.createOrder(user.id(),input("stable-request",3))).hasMessageContaining("内容已改变");
    assertThat(shop.orders(user.id(),null,0,20).total()).isEqualTo(1);
  }
  @Test void cancelledRetryReturnsOriginalAndDoesNotReserveAgain() {
    var order=shop.createOrder(user.id(),input("stable-request",2));shop.cancelOrder(order.id(),user.id());
    assertThat(shop.createOrder(user.id(),input("stable-request",2)).status()).isEqualTo("CANCELLED");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);
  }
  @Test void transactionFailureRollsBackStockOrderAndIdempotency() {
    db.execute("CREATE FUNCTION fail_qa_order_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ORDER_CREATE' THEN RAISE EXCEPTION 'QA rollback'; END IF; RETURN NEW; END $$");
    db.execute("CREATE TRIGGER qa_failure BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION fail_qa_order_audit()");
    try { assertThatThrownBy(() -> shop.createOrder(user.id(),input("rollback-key",2))).isInstanceOf(RuntimeException.class); }
    finally { db.execute("DROP TRIGGER qa_failure ON audit_event");db.execute("DROP FUNCTION fail_qa_order_audit()"); }
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);
    assertThat(shop.orders(user.id(),null,0,20).total()).isZero();
    assertThat(shop.createOrder(user.id(),input("rollback-key",2)).totalCents()).isEqualTo(200);
  }
  @Test void prepayInFlightSerializesCancelAndClosesBeforeRestocking() throws Exception {
    var order=shop.createOrder(user.id(),input("race-request",1));
    var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
    when(pay.prepay(any(),any())).thenAnswer(inv -> {entered.countDown();assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();return new ShopModels.PaymentRequest("1","nonce","prepay_id=qa","RSA","sig");});
    doAnswer(inv -> {assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);return null;}).when(pay).closeOrder(order.orderNo());
    try (var executor=Executors.newFixedThreadPool(2)) {
      var paying=executor.submit(() -> shop.payment(order.id(),user.id()));
      assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
      var cancelling=executor.submit(() -> shop.cancelOrder(order.id(),user.id()));
      assertThatThrownBy(() -> cancelling.get(150,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      release.countDown();assertThat(paying.get(10,TimeUnit.SECONDS)).isNotNull();
      assertThat(cancelling.get(10,TimeUnit.SECONDS).status()).isEqualTo("CANCELLED");
    } finally {release.countDown();}
    verify(pay).closeOrder(order.orderNo());assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);
  }
  @Test void timedOutPrepayPersistsIntentAndUnknownCloseKeepsStock() {
    var order=shop.createOrder(user.id(),input("timeout-key",1));
    when(pay.prepay(any(),any())).thenThrow(new ApiException(502,"TIMEOUT","timeout"));
    assertThatThrownBy(() -> shop.payment(order.id(),user.id())).hasMessageContaining("timeout");
    assertThat(shop.order(order.id(),user.id(),false).paymentInitiated()).isTrue();
    assertThat(shop.order(order.id(),user.id(),false).reconciliationRequired()).isTrue();
    doThrow(new ApiException(502,"UNKNOWN","unknown")).when(pay).closeOrder(order.orderNo());
    when(pay.queryOrder(order.orderNo())).thenThrow(new ApiException(502,"UNKNOWN","unknown"));
    assertThatThrownBy(() -> shop.cancelOrder(order.id(),user.id())).hasMessageContaining("unknown");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
    assertThat(shop.order(order.id(),user.id(),false).status()).isEqualTo("PENDING_PAYMENT");
    doNothing().when(pay).closeOrder(order.orderNo());
    assertThat(shop.cancelOrder(order.id(),user.id()).status()).isEqualTo("CANCELLED");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);
  }
  @Test void expiryUninitiatedReleasesOnceAndRejectsPay() {
    var order=shop.createOrder(user.id(),input("expired-key",2));
    db.update("UPDATE shop_order SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?",order.id());
    assertThatThrownBy(() -> shop.payment(order.id(),user.id())).hasMessageContaining("期限已过");
    shop.expireOrder(order.id());shop.expireOrder(order.id());
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);verify(pay,never()).closeOrder(any());
  }
  @Test void expiryWithUnknownGatewayNeverReleasesAndPaidQueryReconciles() {
    var order=shop.createOrder(user.id(),input("expiry-key",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE,expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?",order.id());
    doThrow(new ApiException(502,"CLOSE_FAILED","close failed")).when(pay).closeOrder(order.orderNo());
    when(pay.queryOrder(order.orderNo())).thenReturn(null);
    assertThatThrownBy(() -> shop.expireOrder(order.id())).hasMessageContaining("close failed");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
    assertThat(shop.expiredOrderIds()).doesNotContain(order.id());
    assertThat(shop.order(order.id(),user.id(),false).reconciliationRequired()).isTrue();
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order,Transaction.TradeStateEnum.SUCCESS));
    shop.expireOrder(order.id());
    assertThat(shop.order(order.id(),user.id(),false).status()).isEqualTo("PAID");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
  }
  @Test void confirmedClosedGatewayCanReconcileLostCloseResponse() {
    var order=shop.createOrder(user.id(),input("closed-key",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    doThrow(new ApiException(502,"TIMEOUT","timeout")).when(pay).closeOrder(order.orderNo());
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order,Transaction.TradeStateEnum.CLOSED));
    assertThat(shop.cancelOrder(order.id(),user.id()).status()).isEqualTo("CANCELLED");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(100);
  }
  @Test void paidCallbackRacingCancelNeverRestocks() throws Exception {
    var order=shop.createOrder(user.id(),input("callback-race",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    var tx=transaction(order,Transaction.TradeStateEnum.SUCCESS);
    var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
    doAnswer(inv -> { entered.countDown();assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();throw new ApiException(409,"ALREADY_PAID","already paid"); }).when(pay).closeOrder(order.orderNo());
    when(pay.queryOrder(order.orderNo())).thenReturn(tx);
    try(var executor=Executors.newFixedThreadPool(2)) {
      var cancelling=executor.submit(() -> shop.cancelOrder(order.id(),user.id()));
      assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
      var callback=executor.submit(() -> shop.completePayment(tx));
      assertThatThrownBy(() -> callback.get(150,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      release.countDown();
      assertThat(cancelling.get(10,TimeUnit.SECONDS).status()).isEqualTo("PAID");
      callback.get(10,TimeUnit.SECONDS);
    } finally {release.countDown();}
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='ORDER_PAID'",Integer.class,order.id())).isEqualTo(1);
  }
  @Test void requestRecoveryIsOwnerScoped() {
    var order=shop.createOrder(user.id(),input("recovery-request",1));
    assertThat(shop.orderByRequest("recovery-request",user.id()).id()).isEqualTo(order.id());
    var other=auth.user("wechat:other","Other","USER");
    assertThatThrownBy(() -> shop.orderByRequest("recovery-request",other.id())).isInstanceOf(ApiException.class);
  }
  @Test void unpaidLimitIsEnforcedButRetryStillWorks() {
    for(int i=0;i<10;i++) shop.createOrder(user.id(),input("request-"+i,1));
    assertThatThrownBy(() -> shop.createOrder(user.id(),input("request-11",1))).hasMessageContaining("待支付订单过多");
    assertThat(shop.createOrder(user.id(),input("request-0",1))).isNotNull();
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(90);
  }
  @Test void activeVerificationReconcilesMissingCallbackIdempotently() {
    var order = shop.createOrder(user.id(),input("verify-request",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order,Transaction.TradeStateEnum.SUCCESS));
    assertThat(shop.verifyPayment(order.id(),user.id()).status()).isEqualTo("PAID");
    assertThat(shop.verifyPayment(order.id(),user.id()).status()).isEqualTo("PAID");
    verify(pay,times(1)).queryOrder(order.orderNo());
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='ORDER_PAID'",Integer.class,order.id())).isEqualTo(1);
  }
  @Test void verificationIsOwnerScopedAndUnknownNeverMarksPaidOrRestocks() {
    var order = shop.createOrder(user.id(),input("verify-request",1));
    var other=auth.user("wechat:other","Other","USER");
    assertThatThrownBy(() -> shop.verifyPayment(order.id(),other.id())).isInstanceOf(ApiException.class);
    assertThat(shop.verifyPayment(order.id(),user.id()).status()).isEqualTo("PENDING_PAYMENT");
    verify(pay,never()).queryOrder(any());
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    when(pay.queryOrder(order.orderNo())).thenReturn(null);
    assertThatThrownBy(() -> shop.verifyPayment(order.id(),user.id())).hasMessageContaining("暂无法确认");
    for(var state : List.of(Transaction.TradeStateEnum.NOTPAY,Transaction.TradeStateEnum.USERPAYING,Transaction.TradeStateEnum.CLOSED)) {
      when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order,state));
      assertThat(shop.verifyPayment(order.id(),user.id()).status()).isEqualTo("PENDING_PAYMENT");
      assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
    }
  }
  @Test void verificationRejectsMismatchedOrderAndCallbackRejectsCurrencyTypePayerAndNullAmount() {
    var order = shop.createOrder(user.id(),input("verify-request",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    var tx=transaction(order,Transaction.TradeStateEnum.SUCCESS);tx.setOutTradeNo("different");
    when(pay.queryOrder(order.orderNo())).thenReturn(tx);
    assertThatThrownBy(() -> shop.verifyPayment(order.id(),user.id())).hasMessageContaining("不匹配");
    tx.setOutTradeNo(order.orderNo());tx.getAmount().setTotal(null);
    assertThatThrownBy(() -> shop.completePayment(tx)).hasMessageContaining("金额不匹配");
    tx.getAmount().setTotal(order.totalCents());tx.getAmount().setCurrency("USD");
    assertThatThrownBy(() -> shop.completePayment(tx)).hasMessageContaining("金额不匹配");
    tx.getAmount().setCurrency("CNY");tx.setTradeType(Transaction.TradeTypeEnum.NATIVE);
    assertThatThrownBy(() -> shop.completePayment(tx)).hasMessageContaining("付款账号不匹配");
    tx.setTradeType(Transaction.TradeTypeEnum.JSAPI);tx.getPayer().setOpenid("other");
    assertThatThrownBy(() -> shop.completePayment(tx)).hasMessageContaining("付款账号不匹配");
    assertThat(shop.order(order.id(),user.id(),false).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
  }

  @Test void httpVerificationRequiresOwnerAndReturnsReconciledOrder() throws Exception {
    var order=shop.createOrder(user.id(),input("http-verify",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    when(pay.queryOrder(order.orderNo())).thenReturn(transaction(order,Transaction.TradeStateEnum.SUCCESS));
    String endpoint="/api/v1/orders/"+order.id()+"/verify";
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(endpoint))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
    var other=auth.user("wechat:foreign","Foreign","USER");
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(endpoint).header("Authorization","Bearer "+auth.login(other).token()))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
    verify(pay,never()).queryOrder(any());
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(endpoint).header("Authorization","Bearer "+auth.login(user).token()))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("PAID"));
  }

  @Test void concurrentVerificationAndCallbackApplyPaymentOnce() throws Exception {
    var order=shop.createOrder(user.id(),input("verify-callback",1));
    db.update("UPDATE shop_order SET payment_initiated=TRUE WHERE id=?",order.id());
    var tx=transaction(order,Transaction.TradeStateEnum.SUCCESS);
    var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
    when(pay.queryOrder(order.orderNo())).thenAnswer(inv -> {entered.countDown();assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();return tx;});
    try(var executor=Executors.newFixedThreadPool(2)) {
      var verifying=executor.submit(() -> shop.verifyPayment(order.id(),user.id()));
      assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
      var callback=executor.submit(() -> shop.completePayment(tx));
      assertThatThrownBy(() -> callback.get(150,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
      release.countDown();assertThat(verifying.get(10,TimeUnit.SECONDS).status()).isEqualTo("PAID");callback.get(10,TimeUnit.SECONDS);
    } finally {release.countDown();}
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE entity_id=? AND action='ORDER_PAID'",Integer.class,order.id())).isEqualTo(1);
    assertThat(shop.product(product.id(),true).stock()).isEqualTo(99);
  }

}
