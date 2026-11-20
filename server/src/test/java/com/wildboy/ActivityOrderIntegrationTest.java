package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.wildboy.ActivityOrderModels.*;
import com.wildboy.ActivityOrderModels.Order;
import static com.wildboy.Models.*;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.TransactionAmount;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class ActivityOrderIntegrationTest {
  static final EmbeddedPostgres pg;
  static {try{pg=EmbeddedPostgres.builder().setServerConfig("unix_socket_directories","").start();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
  @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
    r.add("spring.datasource.url",()->pg.getJdbcUrl("postgres","postgres"));r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->"");
    r.add("wildboy.identity.encryption-key",()->Base64.getEncoder().encodeToString(new byte[32]));
  }
  @Autowired ActivityOrderService orders;
  @Autowired ActivityService activities;
  @Autowired AuthService auth;
  @Autowired LegalService legal;
  @Autowired JdbcTemplate db;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired OperationsService operations;
  @org.springframework.test.context.bean.override.mockito.MockitoBean WechatPayService pay;
  @org.springframework.test.context.bean.override.mockito.MockitoBean WechatShippingService shipping;
  @BeforeEach void setup(){
    db.execute("TRUNCATE app_user,activity,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("INSERT INTO admin_account_configuration(id) VALUES(1) ON CONFLICT DO NOTHING");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for(var kind:LegalModels.Kind.values()){
      var draft=legal.save(kind,new LegalModels.DraftInput("QA "+kind,"Test-only legal policy content for synthetic fixtures.",0L),"fixture");
      legal.publish(kind,draft.draft().revision(),"fixture");
    }
    when(pay.enabled()).thenReturn(true);when(pay.appId()).thenReturn("app");when(pay.merchantId()).thenReturn("merchant");
  }
  User user(){
    var u=auth.user("wechat:"+UUID.randomUUID(),"QA user","USER");
    db.update("UPDATE app_user SET real_name='QA Contact',phone='13800138000',profile_completed_at=CURRENT_TIMESTAMP WHERE id=?",u.id());
    return u;
  }
  Activity activity(int capacity){
    var start=OffsetDateTime.now().plusDays(7);
    var a=activities.create(new ActivityInput("QA activity",Category.WEEKLY,"/assets/hiking.jpg",List.of(),"Summary","Description","Xiamen","Park",start,start.plusHours(4),start.minusDays(1),capacity,0,null,false),"fixture");
    a=orders.setPrice(a.id(),1000,a.version(),"fixture");return activities.publish(a.id(),a.version(),"fixture");
  }
  RegistrationInput input(int count){
    var people=new ArrayList<ParticipantInput>();for(int i=0;i<count;i++)people.add(new ParticipantInput("QA Person "+i,"","13800138000"));
    return new RegistrationInput(people,1L,1L);
  }
  Quote quote(int count,int charged){return new Quote(List.of(new PriceLine(1000,count,charged,"tier","QA tier",1L,"FIXED",charged)),"TEST_EXPLICIT_POLICY");}
  Order reserve(Activity a,User u,int count,int charged){return orders.reserve(a.id(),u.id(),input(count),quote(count,charged),UUID.randomUUID().toString());}
  Transaction paid(Order o){
    var t=new Transaction();t.setOutTradeNo(o.orderNo());t.setAppid("app");t.setMchid("merchant");t.setTransactionId("transaction-"+o.id());t.setTradeState(Transaction.TradeStateEnum.SUCCESS);
    t.setTradeType(Transaction.TradeTypeEnum.JSAPI);var payer=new com.wechat.pay.java.service.payments.model.TransactionPayer();payer.setOpenid(db.queryForObject("SELECT external_id FROM app_user WHERE id=?",String.class,o.userId()).substring("wechat:".length()));t.setPayer(payer);
    var amount=new TransactionAmount();amount.setTotal(o.totalCents());amount.setCurrency("CNY");t.setAmount(amount);return t;
  }
  @Test void guestUsesBasePriceAndLegacyPathsCannotBypassPayment(){
    var a=activity(2);var u=user();
    assertThat(orders.preview(a.id(),u.id(),2).totalCents()).isEqualTo(2000);
    assertThatThrownBy(()->orders.create(a.id(),u.id(),input(2),"request-key",1)).hasMessageContaining("价格已更新");
    assertThatThrownBy(()->activities.register(a.id(),u.id(),input(1))).hasMessageContaining("报名订单");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
  }
  @Test void paidRosterExportsEveryConfirmedParticipantAndMasksPhones() {
    var a = activity(6);
    var paidOrder = reserve(a, user(), 2, 1000);
    orders.completePayment(paid(paidOrder));
    var freeOrder = reserve(a, user(), 1, 0);
    db.update("UPDATE activity_order_participant SET participant_name='QA waived' WHERE order_id=?", freeOrder.id());
    reserve(a, user(), 1, 1000);
    var cancelled = reserve(a, user(), 1, 0);
    orders.cancel(cancelled.id(), cancelled.userId());
    reserve(activity(2), user(), 1, 0);

    var rows = activities.exportRoster(a.id(), null, null);
    assertThat(rows).extracting(ActivityService.RosterExportRow::name)
        .containsExactlyInAnyOrder("QA Person 0", "QA Person 1", "QA waived");
    assertThat(rows).allSatisfy(row -> {
      assertThat(row.maskedPhone()).isEqualTo("138****8000");
      assertThat(row.status()).isEqualTo("CONFIRMED");
    });
  }
  @Test void paidOrderNeedsTheSameWechatContactAsFreeRegistration(){
    var a=activity(1);
    var u=auth.user("wechat:"+UUID.randomUUID(),"QA incomplete contact","USER");
    assertThatThrownBy(()->orders.create(a.id(),u.id(),input(1),"request-key",1000))
        .hasMessageContaining("完善联系资料");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
    assertThat(orders.list(u.id(),0,10).items()).isEmpty();
    db.update("UPDATE app_user SET real_name='QA Contact',phone='13800138000',profile_completed_at=CURRENT_TIMESTAMP WHERE id=?",u.id());
    assertThat(orders.create(a.id(),u.id(),input(1),"request-key",1000).status()).isEqualTo("PENDING_PAYMENT");
  }
  @Test void activityNoticeCanReferenceUserWhileTheirQuoteWaitsForActivityLock() throws Exception {
    var a=activity(1);
    var u=user();
    var tx=new TransactionTemplate(transactionManager);
    var activityLocked=new CompletableFuture<Void>();
    var quoteConnection=new CompletableFuture<Integer>();
    try(var pool=Executors.newFixedThreadPool(2)) {
      var notice=pool.submit(()->tx.executeWithoutResult(status->{
        var locked=activities.lock(a.id());
        int noticePid=db.queryForObject("SELECT pg_backend_pid()",Integer.class);
        activityLocked.complete(null);
        int quotePid=quoteConnection.orTimeout(5,TimeUnit.SECONDS).join();
        await().pollInSameThread().atMost(Duration.ofSeconds(5)).until(()->Boolean.TRUE.equals(
            db.queryForObject("SELECT ? = ANY(pg_blocking_pids(?))",Boolean.class,noticePid,quotePid)));
        notifications.enqueue(u.id(),locked,"ACTIVITY_CHANGED","quote-lock:"+a.id(),"QA notice",a.startAt());
      }));
      var quote=pool.submit(()->{
        activityLocked.get(5,TimeUnit.SECONDS);
        return tx.execute(status->{
          quoteConnection.complete(db.queryForObject("SELECT pg_backend_pid()",Integer.class));
          return orders.preview(a.id(),u.id(),1);
        });
      });
      notice.get(10,TimeUnit.SECONDS);
      assertThat(quote.get(10,TimeUnit.SECONDS).totalCents()).isEqualTo(1000);
    }
    assertThat(notifications.list(u.id(),0,10).items()).hasSize(1);
  }
  @Test void snapshotsAndReservationsSurviveRebookingAndDuplicateRequests(){
    var a=activity(2);var u=user();String key="request-key";
    var o=orders.reserve(a.id(),u.id(),input(2),quote(2,600),key);
    assertThat(o.originalTotalCents()).isEqualTo(2000);assertThat(o.totalCents()).isEqualTo(1200);
    assertThat(orders.reserve(a.id(),u.id(),input(2),quote(2,100),key).id()).isEqualTo(o.id());
    assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(2);
    assertThatThrownBy(()->reserve(a,user(),1,1000)).hasMessageContaining("名额不足");
    orders.cancel(o.id(),u.id());orders.cancel(o.id(),u.id());
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
    var next=reserve(a,u,1,900);assertThat(next.id()).isNotEqualTo(o.id());
    assertThat(orders.get(o.id(),u.id()).totalCents()).isEqualTo(1200);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_order_participant WHERE order_id=?",Integer.class,o.id())).isEqualTo(2);
  }
  @Test void zeroPriceNeverUsesGatewayAndCanCancel(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,0);
    assertThat(o.status()).isEqualTo("CONFIRMED_FREE");verify(pay,never()).requireConfigured();
    assertThatThrownBy(()->orders.prepay(o.id(),u.id())).hasMessageContaining("无须付款");
    orders.cancel(o.id(),u.id());assertThat(activities.get(a.id(),true).registeredCount()).isZero();
    assertThat(orders.get(o.id(),u.id()).status()).isEqualTo("CLOSED");
  }
  @Test void missingGatewayRollsBackReservation(){
    var a=activity(1);var u=user();doThrow(new ApiException(503,"PAYMENT_NOT_CONFIGURED","微信支付尚未配置")).when(pay).requireConfigured();
    assertThatThrownBy(()->reserve(a,u,1,1000)).hasMessageContaining("未配置");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_order",Integer.class)).isZero();
  }
  @Test void uncertainCloseKeepsSeatAndPaidQueryCannotReleaseIt(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);
    db.update("UPDATE activity_order SET payment_attempted=TRUE WHERE id=?",o.id());
    when(pay.queryOrder(o.orderNo())).thenThrow(new ApiException(502,"QUERY_FAILED","Unknown"));
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).hasMessageContaining("Unknown");
    assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(1);
    doReturn(paid(o)).when(pay).queryOrder(o.orderNo());assertThat(orders.cancel(o.id(),u.id()).status()).isEqualTo("PAID");
    verify(pay,never()).closeOrder(anyString());assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(1);
  }
  @Test void paymentAndRefundAreValidatedIdempotentAndNeverTouchShop(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);var transaction=paid(o);
    transaction.getAmount().setTotal(1);assertThatThrownBy(()->orders.completePayment(transaction)).hasMessageContaining("不匹配");
    verifyNoInteractions(shipping);
    when(shipping.shippingEnabled()).thenReturn(true);
    when(shipping.uploadActivityFulfillmentNow(any(),any())).thenReturn(WechatShippingService.UploadResult.ok());
    transaction.getAmount().setTotal(600);orders.completePayment(transaction);orders.completePayment(transaction);
    var fulfillmentOrder = ArgumentCaptor.forClass(Order.class);
    verify(shipping).uploadActivityFulfillmentNow(fulfillmentOrder.capture(), eq(transaction.getTransactionId()));
    assertThat(fulfillmentOrder.getValue().id()).isEqualTo(o.id());
    assertThatThrownBy(()->orders.get(o.id(),user().id())).isInstanceOf(ApiException.class);
    var r=orders.refund(o.id(),u.id(),"QA cancel");
    var result=new RefundModels.GatewayResult((String)r.get("out_refund_no"),o.orderNo(),transaction.getTransactionId(),"refund-1",600,600,"CNY","SUCCESS");
    var processing=new RefundModels.GatewayResult(result.outRefundNo(),result.orderNo(),result.transactionId(),result.refundId(),600,600,"CNY","PROCESSING");
    when(pay.createRefund(eq(o.orderNo()),eq(transaction.getTransactionId()),eq(600),anyString(),eq(600),anyString(),eq("activity-refund-notify"))).thenReturn(processing);
    var approved=orders.decideRefund(o.id(),(String)r.get("id"),0,"admin",true,null);
    orders.applyRefund(processing);
    assertThat(orders.refundStatus(o.id(),u.id())).isEqualTo(approved);
    orders.applyRefund(result);orders.applyRefund(result);
    assertThat(orders.get(o.id(),u.id()).status()).isEqualTo("REFUNDED");assertThat(activities.get(a.id(),true).registeredCount()).isZero();
    assertThat(db.queryForObject("SELECT COUNT(*) FROM shop_order",Integer.class)).isZero();
  }
  @Autowired MembershipService memberships;
  @Test void explicitParticipantPoliciesAreIndependentAndSnapshotAtCheckout(){
    var a=activity(4);var u=user();
    var rules=List.of(new MembershipModels.PricingRule(MembershipModels.Scope.ACTIVITY,true,MembershipModels.PricingMode.FIXED,600,"ONE_BENEFIT"),
        new MembershipModels.PricingRule(MembershipModels.Scope.SHOP,true,MembershipModels.PricingMode.FIXED,1,null));
    var tier=memberships.create(new MembershipModels.TierInput("QA tier",0,true,rules,null),"fixture");
    memberships.assign(u.id(),new MembershipModels.Assignment(MembershipModels.CustomerType.MEMBER,tier.id(),0L),"fixture");
    assertThat(orders.preview(a.id(),u.id(),2).totalCents()).isEqualTo(1600);
    var order=orders.create(a.id(),u.id(),input(2),"first-request",1600);
    assertThat(order.quote().lines()).hasSize(2);
    db.update("UPDATE membership_pricing_rule SET participant_pricing='ACCOUNT_ALL' WHERE tier_id=? AND scope='ACTIVITY'",tier.id());
    assertThat(orders.preview(a.id(),u.id(),2).totalCents()).isEqualTo(1200);
    assertThat(orders.create(a.id(),u.id(),input(2),"first-request",1600).totalCents()).isEqualTo(1600);
    assertThatThrownBy(()->orders.create(a.id(),u.id(),input(1),"first-request",600)).hasMessageContaining("请求标识");
    orders.cancel(order.id(),u.id());
    assertThat(orders.create(a.id(),u.id(),input(2),"next-request",1200).totalCents()).isEqualTo(1200);
  }
  @Test void mismatchedPayerAndWrongClosedMerchantNeverReleaseSeats(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);var t=paid(o);
    t.getPayer().setOpenid("someone-else");assertThatThrownBy(()->orders.completePayment(t)).hasMessageContaining("不匹配");
    db.update("UPDATE activity_order SET payment_attempted=TRUE WHERE id=?",o.id());
    t.setTradeState(Transaction.TradeStateEnum.CLOSED);t.setAppid("wrong-app");when(pay.queryOrder(o.orderNo())).thenReturn(t);
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).hasMessageContaining("待核对");
    assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(1);
  }
  @Test void expiryRetriesAreDelayedAndFreeOrdersCannotBePaid(){
    var a=activity(2);var u=user();var o=reserve(a,u,1,600);
    db.update("UPDATE activity_order SET payment_attempted=TRUE,expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?",o.id());
    when(pay.queryOrder(o.orderNo())).thenThrow(new ApiException(502,"UNKNOWN","Unknown"));
    assertThat(orders.closeExpired().get("pendingReview")).isEqualTo(1);
    assertThat(orders.closeExpired().get("pendingReview")).isZero();verify(pay,times(1)).queryOrder(o.orderNo());
    var free=reserve(a,user(),1,0);assertThatThrownBy(()->orders.completePayment(paid(free))).isInstanceOf(ApiException.class);
  }

  @Test void uncreatedGatewayOrderNeedsTwoMatureAbsenceChecksBeforeExpiryReleasesSeats(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);
    when(pay.prepay(eq(o.orderNo()),eq(600),any(),anyString(),anyString(),eq("activity-notify")))
        .thenThrow(new ApiException(502,"WECHAT_PAY_UNAVAILABLE","Synthetic timeout"));
    assertThatThrownBy(()->orders.prepay(o.id(),u.id())).hasMessage("Synthetic timeout");
    when(pay.queryOrder(o.orderNo())).thenThrow(new WechatPayService.OrderNotFound());
    assertThat(orders.verifyPayment(o.id(),u.id()).status()).isEqualTo("PENDING_PAYMENT");
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).isInstanceOfSatisfying(ApiException.class,
        e->assertThat(e.code).isEqualTo("PAYMENT_UNCERTAIN"));
    assertThat(db.queryForObject("SELECT payment_not_found_at FROM activity_order WHERE id=?",OffsetDateTime.class,o.id())).isNull();
    db.update("UPDATE activity_order SET expires_at=CURRENT_TIMESTAMP-INTERVAL '3 minutes',payment_attempted_at=CURRENT_TIMESTAMP-INTERVAL '20 minutes' WHERE id=?",o.id());
    assertThat(orders.closeExpired()).containsEntry("pendingReview",1).containsEntry("closed",0);
    assertThat(db.queryForObject("SELECT payment_not_found_at FROM activity_order WHERE id=?",OffsetDateTime.class,o.id())).isNotNull();
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).isInstanceOf(ApiException.class);
    db.update("UPDATE activity_order SET payment_not_found_at=CURRENT_TIMESTAMP-INTERVAL '2 minutes',next_reconcile_at=CURRENT_TIMESTAMP WHERE id=?",o.id());
    doThrow(new ApiException(502,"WECHAT_QUERY_FAILED","Unknown")).when(pay).queryOrder(o.orderNo());
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).hasMessage("Unknown");
    assertThat(activities.get(a.id(),true).registeredCount()).isOne();
    doThrow(new WechatPayService.OrderNotFound()).when(pay).queryOrder(o.orderNo());
    assertThat(orders.closeExpired()).containsEntry("pendingReview",0).containsEntry("closed",1);
    assertThat(orders.cancel(o.id(),u.id()).status()).isEqualTo("CLOSED");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
    verify(pay,never()).closeOrder(anyString());
  }

  @Test void timeoutCanRecoverSamePayableOrderButSeenGatewayIsNeverReleasedOnAbsence(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);
    var params=new ShopModels.PaymentRequest("1","nonce","prepay_id=fixture","RSA","fixture");
    when(pay.prepay(eq(o.orderNo()),eq(600),any(),anyString(),anyString(),eq("activity-notify")))
        .thenThrow(new ApiException(502,"WECHAT_PAY_UNAVAILABLE","Synthetic timeout")).thenReturn(params);
    assertThatThrownBy(()->orders.prepay(o.id(),u.id())).isInstanceOf(ApiException.class);
    when(pay.queryOrder(o.orderNo())).thenThrow(new WechatPayService.OrderNotFound());
    assertThat(orders.verifyPayment(o.id(),u.id()).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(orders.prepay(o.id(),u.id())).isEqualTo(params);
    db.update("UPDATE activity_order SET expires_at=CURRENT_TIMESTAMP-INTERVAL '3 minutes',payment_attempted_at=CURRENT_TIMESTAMP-INTERVAL '20 minutes',payment_not_found_at=CURRENT_TIMESTAMP-INTERVAL '2 minutes' WHERE id=?",o.id());
    assertThatThrownBy(()->orders.cancel(o.id(),u.id())).isInstanceOf(ApiException.class);
    assertThat(activities.get(a.id(),true).registeredCount()).isOne();
    var closed=paid(o);closed.setTradeState(Transaction.TradeStateEnum.CLOSED);
    doReturn(closed).when(pay).queryOrder(o.orderNo());
    assertThat(orders.cancel(o.id(),u.id()).status()).isEqualTo("CLOSED");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
  }

  @Test void staleRefundActionsCannotTouchReplacementAndLateProcessingCannotDowngradeAbnormal(){
    var a=activity(1);var u=user();var o=reserve(a,u,1,600);var transaction=paid(o);orders.completePayment(transaction);
    var admin=auth.user("fixture:refund-review","QA Admin","ADMIN");
    String first=(String)orders.refund(o.id(),u.id(),"First request").get("id");
    orders.decideRefund(o.id(),first,0,admin.id(),false,"First rejection");
    var second=orders.refund(o.id(),u.id(),"Second request");
    String secondId=(String)second.get("id"),number=(String)second.get("out_refund_no");
    for(Runnable action:List.<Runnable>of(
        ()->orders.decideRefund(o.id(),first,0,admin.id(),true,null),
        ()->orders.decideRefund(o.id(),first,0,admin.id(),false,"Stale rejection"),
        ()->orders.verifyRefund(o.id(),first,0,admin.id()),
        ()->orders.retryRefund(o.id(),first,0,admin.id())))
      assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("STALE_REFUND"));
    assertThat(orders.refundStatus(o.id(),u.id())).isEqualTo(second);
    verify(pay,never()).queryRefund(anyString());
    var abnormal=new RefundModels.GatewayResult(number,o.orderNo(),transaction.getTransactionId(),"refund-2",600,600,"CNY","ABNORMAL");
    var processing=new RefundModels.GatewayResult(number,o.orderNo(),transaction.getTransactionId(),"refund-2",600,600,"CNY","PROCESSING");
    when(pay.createRefund(eq(o.orderNo()),eq(transaction.getTransactionId()),eq(600),eq(number),eq(600),anyString(),eq("activity-refund-notify")))
        .thenAnswer(i->{orders.applyRefund(abnormal);return processing;});
    var result=orders.decideRefund(o.id(),secondId,0,admin.id(),true,null);
    assertThat(result.get("status")).isEqualTo("ABNORMAL");
    assertThatThrownBy(()->orders.verifyRefund(o.id(),secondId,0,admin.id())).isInstanceOfSatisfying(ApiException.class,
        e->assertThat(e.code).isEqualTo("STALE_VERSION"));
    assertThat(activities.get(a.id(),true).registeredCount()).isOne();
  }

  @Test void closedRefundCanStartNewAttemptAndWrongOrderQueryCannotCompleteAnother(){
    var a=activity(2);var u=user();var o=reserve(a,u,1,600);var transaction=paid(o);orders.completePayment(transaction);
    var r=orders.refund(o.id(),u.id(),"First cancel");
    var closed=new RefundModels.GatewayResult((String)r.get("out_refund_no"),o.orderNo(),transaction.getTransactionId(),"closed-refund",600,600,"CNY","CLOSED");
    when(pay.createRefund(eq(o.orderNo()),eq(transaction.getTransactionId()),eq(600),anyString(),eq(600),anyString(),eq("activity-refund-notify"))).thenReturn(closed);
    orders.decideRefund(o.id(),(String)r.get("id"),0,"admin",true,null);assertThat(orders.get(o.id(),u.id()).status()).isEqualTo("PAID");
    var next=orders.refund(o.id(),u.id(),"Retry with new request");assertThat(next.get("out_refund_no")).isNotEqualTo(r.get("out_refund_no"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_order_refund WHERE order_id=?",Integer.class,o.id())).isEqualTo(2);
    var other=reserve(a,user(),1,600);db.update("UPDATE activity_order SET payment_attempted=TRUE WHERE id=?",other.id());
    when(pay.queryOrder(other.orderNo())).thenReturn(paid(o));
    assertThatThrownBy(()->orders.verifyPayment(other.id(),other.userId())).hasMessageContaining("不匹配");
    assertThat(orders.get(other.id(),other.userId()).status()).isEqualTo("PENDING_PAYMENT");
  }

  @Test void concurrentLastSeatHasExactlyOneOwner() throws Exception {
    var a=activity(1);var first=user();var second=user();
    var ready=new java.util.concurrent.CountDownLatch(2);var start=new java.util.concurrent.CountDownLatch(1);
    try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
      var futures=new ArrayList<java.util.concurrent.Future<Boolean>>();
      for(var u:List.of(first,second))futures.add(pool.submit(()->{ready.countDown();start.await();try{reserve(a,u,1,600);return true;}catch(ApiException e){return false;}}));
      assertThat(ready.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();start.countDown();
      int succeeded=0;for(var f:futures)if(f.get(10,java.util.concurrent.TimeUnit.SECONDS))succeeded++;
      assertThat(succeeded).isEqualTo(1);assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(1);
    }
  }

  @Autowired NotificationService notifications;
  @Test void cancelRejectsSuccessfulQueryForAnotherOrderBeforeSettlement(){
    var a=activity(2);var first=reserve(a,user(),1,600);var second=reserve(a,user(),1,600);
    db.update("UPDATE activity_order SET payment_attempted=TRUE WHERE id=?",first.id());
    when(pay.queryOrder(first.orderNo())).thenReturn(paid(second));
    assertThatThrownBy(()->orders.cancel(first.id(),first.userId())).hasMessageContaining("待核对");
    assertThat(orders.get(first.id(),first.userId()).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(orders.get(second.id(),second.userId()).status()).isEqualTo("PENDING_PAYMENT");
    assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(2);
  }
  @Test void orderListsFilterActivityWithoutLeakingOtherOwners(){
    var a=activity(2);var b=activity(2);var u=user();var other=user();
    var ownA=reserve(a,u,1,600);reserve(a,other,1,600);reserve(b,u,1,600);
    assertThat(orders.list(u.id(),a.id(),0,20).items()).extracting(Order::id).containsExactly(ownA.id());
    assertThat(orders.list(null,a.id(),0,20).total()).isEqualTo(2);
    assertThat(orders.list(u.id(),0,20).total()).isEqualTo(2);
    assertThat(orders.list(u.id(),"missing-activity",0,20).items()).isEmpty();
  }

  @Test void administrationCombinesHistoryAndSeparatesPendingSeatsWithMaskedContacts() throws Exception {
    var u=user();
    var admin=auth.user("fixture:history-review","QA admin","ADMIN");
    String adminBearer="Bearer "+auth.login(admin).token(),ownerBearer="Bearer "+auth.login(u).token();
    var paidEvent=activity(2);
    var anotherPaidEvent=activity(2);
    var pending=orders.reserve(paidEvent.id(),u.id(),
        new RegistrationInput(List.of(new ParticipantInput("QA Short Phone","","1234567")),1L,1L),
        quote(1,600),"short-phone-order");
    var confirmed=reserve(anotherPaidEvent,u,1,0);
    var start=OffsetDateTime.now().plusDays(7);
    var free=activities.create(new ActivityInput("QA free",Category.WEEKLY,"/assets/hiking.jpg",List.of(),"Summary","Description",
        "Xiamen","Park",start,start.plusHours(4),start.minusDays(1),2,0,null,false),admin.id());
    activities.publish(free.id(),free.version(),admin.id());
    activities.register(free.id(),u.id(),input(1));

    String details="/api/v1/admin/users/"+u.id();
    mvc.perform(get(details).param("status","PENDING_PAYMENT").header("Authorization",adminBearer))
        .andExpect(status().isOk()).andExpect(jsonPath("$.user.registrationCount").value(3))
        .andExpect(jsonPath("$.user.confirmedRegistrationCount").value(2))
        .andExpect(jsonPath("$.user.pendingRegistrationCount").value(1))
        .andExpect(jsonPath("$.registrations.total").value(1))
        .andExpect(jsonPath("$.registrations.items[0].id").value(pending.id()))
        .andExpect(jsonPath("$.registrations.items[0].source").value("ACTIVITY_ORDER"))
        .andExpect(jsonPath("$.registrations.items[0].participants[0].phone").value("••••"));
    mvc.perform(get(details).param("status","CONFIRMED").param("size","1").header("Authorization",adminBearer))
        .andExpect(status().isOk()).andExpect(jsonPath("$.registrations.total").value(2))
        .andExpect(jsonPath("$.registrations.hasMore").value(true))
        .andExpect(jsonPath("$.registrations.items[0].source").value("FREE_REGISTRATION"));
    mvc.perform(get(details).param("status","CONFIRMED").param("size","1").param("page","1").header("Authorization",adminBearer))
        .andExpect(status().isOk()).andExpect(jsonPath("$.registrations.items[0].id").value(confirmed.id()))
        .andExpect(jsonPath("$.registrations.items[0].orderStatus").value("CONFIRMED_FREE"));
    String participants="/api/v1/admin/activity-orders/"+pending.id()+"/participants";
    mvc.perform(get(participants).header("Authorization",adminBearer)).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].phone").value("••••"));
    mvc.perform(post(participants+"/reveal").header("Authorization",ownerBearer)).andExpect(status().isForbidden());
    mvc.perform(post(participants+"/reveal").header("Authorization",adminBearer)).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].phone").value("1234567"));
    assertThat(db.queryForList("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='ACTIVITY_CONTACTS_VIEW'",String.class,pending.id()))
        .containsExactly(admin.id());

    var occupied=activities.get(paidEvent.id(),true);
    assertThat(occupied.registeredCount()).isOne();
    assertThat(occupied.confirmedCount()).isZero();
    assertThat(occupied.pendingPaymentCount()).isOne();
    var edit=new ActivityInput(occupied.title(),occupied.category(),occupied.coverUrl(),occupied.galleryUrls(),occupied.summary(),
        occupied.description(),occupied.location(),occupied.meetingPoint(),occupied.startAt(),occupied.endAt(),
        occupied.registrationDeadline(),occupied.capacity(),0,occupied.version(),true);
    assertThatThrownBy(()->activities.edit(occupied.id(),edit,admin.id())).isInstanceOfSatisfying(ApiException.class,
        e->assertThat(e.code).isEqualTo("ACTIVITY_IDENTITY_LOCKED"));
    var totals=(Map<?,?>)operations.dashboard(7).get("activities");
    assertThat(((Number)totals.get("registrations")).intValue()).isEqualTo(2);
    assertThat(((Number)totals.get("pending_payment")).intValue()).isOne();
    assertThat(((Number)totals.get("occupied")).intValue()).isEqualTo(3);
    db.update("UPDATE activity_order SET payment_attempted=TRUE,expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?",pending.id());
    assertThat(operations.exceptions(0,20).items()).anySatisfy(row->{
      assertThat(row.get("kind")).isEqualTo("ACTIVITY_PAYMENT");
      assertThat(row.get("entity_id")).isEqualTo(pending.id());
    });
    orders.completePayment(paid(pending));
    orders.refund(pending.id(),u.id(),"QA cancellation");
    assertThat(operations.exceptions(0,20).items()).anySatisfy(row->{
      assertThat(row.get("kind")).isEqualTo("ACTIVITY_REFUND");
      assertThat(row.get("activity_id")).isEqualTo(paidEvent.id());
    });
  }
  @Test void noticesIncludeConfirmedPaidAndFreeAndRefundPendingOnlyAndDeduplicate(){
    var a=activity(10);var paidOrder=reserve(a,user(),1,600);orders.completePayment(paid(paidOrder));
    var free=reserve(a,user(),1,0);
    var refunding=reserve(a,user(),1,600);orders.completePayment(paid(refunding));orders.refund(refunding.id(),refunding.userId(),"QA cancellation");
    reserve(a,user(),1,600); // Pending payment must not receive confirmed-participant notices.
    var closed=reserve(a,user(),1,600);orders.cancel(closed.id(),closed.userId());
    var refunded=reserve(a,user(),1,600);db.update("UPDATE activity_order SET status='REFUNDED' WHERE id=?",refunded.id());
    // Imported legacy registration and a paid order for the same user must not duplicate a notice.
    db.update("INSERT INTO registration(id,activity_id,user_id,status) VALUES(?,?,?,'CONFIRMED')",UUID.randomUUID().toString(),a.id(),paidOrder.userId());
    for(String kind:List.of("PRETRIP","ACTIVITY_CHANGED")) {
      notifications.activityNotice(a,kind,"QA notice");
      var rows=db.queryForList("SELECT * FROM notification_outbox WHERE activity_id=? AND kind=?",a.id(),kind);
      assertThat(rows).hasSize(3);
      assertThat(rows).allSatisfy(row->assertThat(notifications.relevant(row)).isTrue());
      assertThat(rows).extracting(row->row.get("user_id")).containsExactlyInAnyOrder(paidOrder.userId(),free.userId(),refunding.userId());
    }
    orders.cancel(free.id(),free.userId());
    var freeNotices=db.queryForList("SELECT * FROM notification_outbox WHERE user_id=?",free.userId());
    assertThat(freeNotices).allSatisfy(row->assertThat(notifications.relevant(row)).isFalse());
  }

  @Autowired org.springframework.test.web.servlet.MockMvc mvc;
  @Test void administratorCanRequestSnapshotRefundWithOwnAuditAndNoImmediateSettlement() throws Exception {
    var a=activity(1);var owner=user();var o=reserve(a,owner,1,600);orders.completePayment(paid(o));
    var admin=auth.user("fixture:activity-refund-admin","QA admin","ADMIN");
    var ordinary=user();db.update("UPDATE app_user SET customer_type='LEADER' WHERE id=?",ordinary.id());
    String route="/api/v1/admin/activity-orders/"+o.id()+"/refund";
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(route)
        .contentType("application/json").content("{\"reason\":\"Organizer cancellation\"}"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(route)
        .header("Authorization","Bearer "+auth.login(ordinary).token()).contentType("application/json").content("{\"reason\":\"Organizer cancellation\"}"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
    assertThatThrownBy(()->orders.adminRefund(o.id(),ordinary.id(),"Cancel")).isInstanceOf(ApiException.class);
    // Current activity price must never affect the full refund of an already-paid snapshot.
    db.update("UPDATE activity SET price_cents=9000 WHERE id=?",a.id());
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(route)
        .header("Authorization","Bearer "+auth.login(admin).token()).contentType("application/json").content("{\"reason\":\"Organizer cancellation\"}"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("REQUESTED"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.amount_cents").value(600));
    var first=orders.refundStatus(o.id(),owner.id());
    assertThat(orders.adminRefund(o.id(),admin.id(),"Repeated request").get("id")).isEqualTo(first.get("id"));
    assertThat(orders.refund(o.id(),owner.id(),"Owner request").get("id")).isEqualTo(first.get("id"));
    assertThat(db.queryForList("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='ACTIVITY_REFUND_REQUEST'",String.class,o.id())).containsExactly(admin.id());
    assertThat(orders.get(o.id(),owner.id()).status()).isEqualTo("REFUND_PENDING");
    assertThat(activities.get(a.id(),true).registeredCount()).isEqualTo(1);
    verify(pay,never()).createRefund(anyString(),anyString(),anyInt(),anyString(),anyInt(),anyString(),anyString());
  }

  @Test void organizerCancellationNotifiesSettledParticipantsAndAuditsActualAdministrator(){
    var a=activity(3);var admin=auth.user("fixture:organizer","Organizer","ADMIN");
    var closedByAdmin=reserve(a,user(),1,0);var voluntary=reserve(a,user(),1,0);var refundedByAdmin=reserve(a,user(),1,600);
    orders.cancelAdmin(closedByAdmin.id(),admin.id());orders.cancel(voluntary.id(),voluntary.userId());
    orders.cancelAdmin(voluntary.id(),admin.id()); // Idempotent admin close must not relabel a voluntary cancellation.
    orders.completePayment(paid(refundedByAdmin));
    var r=orders.adminRefund(refundedByAdmin.id(),admin.id(),"Organizer cancellation");
    doThrow(new ApiException(502,"REFUND_UNCERTAIN","Unknown")).when(pay).createRefund(anyString(),anyString(),anyInt(),anyString(),anyInt(),anyString(),anyString());
    orders.decideRefund(refundedByAdmin.id(),(String)r.get("id"),0,admin.id(),true,null);
    var pending=orders.refundStatus(refundedByAdmin.id(),refundedByAdmin.userId());
    var success=new RefundModels.GatewayResult((String)r.get("out_refund_no"),refundedByAdmin.orderNo(),paid(refundedByAdmin).getTransactionId(),"organizer-refund",600,600,"CNY","SUCCESS");
    doReturn(success).when(pay).createRefund(anyString(),anyString(),anyInt(),anyString(),anyInt(),anyString(),anyString());
    orders.retryRefund(refundedByAdmin.id(),(String)r.get("id"),((Number)pending.get("version")).longValue(),admin.id());
    assertThat(db.queryForList("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='ACTIVITY_ZERO_CANCEL'",String.class,closedByAdmin.id())).containsExactly(admin.id());
    assertThat(db.queryForList("SELECT actor_id FROM audit_event WHERE entity_id=? AND action='ACTIVITY_REFUND_RETRY'",String.class,refundedByAdmin.id())).containsExactly(admin.id());
    assertThat(db.queryForObject("SELECT organizer_cancelled FROM activity_order WHERE id=?",Boolean.class,voluntary.id())).isFalse();
    var current=activities.get(a.id(),true);activities.cancel(a.id(),current.version(),admin.id());
    var notices=db.queryForList("SELECT * FROM notification_outbox WHERE activity_id=? AND kind='ACTIVITY_CANCELLED'",a.id());
    assertThat(notices).extracting(row->row.get("user_id")).containsExactlyInAnyOrder(closedByAdmin.userId(),refundedByAdmin.userId());
    assertThat(notices).allSatisfy(row->assertThat(notifications.relevant(row)).isTrue());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM activity_order_refund WHERE order_id=?",Integer.class,refundedByAdmin.id())).isEqualTo(1);
  }

}
