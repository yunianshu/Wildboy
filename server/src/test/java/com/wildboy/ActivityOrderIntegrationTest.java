package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.wildboy.ActivityOrderModels.*;
import com.wildboy.ActivityOrderModels.Order;
import static com.wildboy.Models.*;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.model.TransactionAmount;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

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
  @Autowired WaitlistService waitlists;
  @Autowired AuthService auth;
  @Autowired LegalService legal;
  @Autowired JdbcTemplate db;
  @org.springframework.test.context.bean.override.mockito.MockitoBean WechatPayService pay;
  @BeforeEach void setup(){
    db.execute("TRUNCATE app_user,activity,legal_consent,legal_document_version,audit_event CASCADE");
    db.update("UPDATE legal_document_state SET draft_title='',draft_content='',draft_revision=0,published_version=NULL");
    for(var kind:LegalModels.Kind.values()){
      var draft=legal.save(kind,new LegalModels.DraftInput("QA "+kind,"Test-only legal policy content for synthetic fixtures.",0L),"fixture");
      legal.publish(kind,draft.draft().revision(),"fixture");
    }
    when(pay.enabled()).thenReturn(true);when(pay.appId()).thenReturn("app");when(pay.merchantId()).thenReturn("merchant");
  }
  User user(){return auth.user("wechat:"+UUID.randomUUID(),"QA user","USER");}
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
    assertThatThrownBy(()->waitlists.join(a.id(),u.id(),input(1))).hasMessageContaining("暂不开放候补");
    assertThat(activities.get(a.id(),true).registeredCount()).isZero();
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
    transaction.getAmount().setTotal(600);orders.completePayment(transaction);orders.completePayment(transaction);
    assertThatThrownBy(()->orders.get(o.id(),user().id())).isInstanceOf(ApiException.class);
    var r=orders.refund(o.id(),u.id(),"QA cancel");
    var result=new RefundModels.GatewayResult((String)r.get("out_refund_no"),o.orderNo(),transaction.getTransactionId(),"refund-1",600,600,"CNY","SUCCESS");
    when(pay.createRefund(eq(o.orderNo()),eq(transaction.getTransactionId()),eq(600),anyString(),eq(600),anyString(),eq("activity-refund-notify"))).thenReturn(result);
    orders.decideRefund(o.id(),0,"admin",true,null);orders.applyRefund(result);
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

  @Test void closedRefundCanStartNewAttemptAndWrongOrderQueryCannotCompleteAnother(){
    var a=activity(2);var u=user();var o=reserve(a,u,1,600);var transaction=paid(o);orders.completePayment(transaction);
    var r=orders.refund(o.id(),u.id(),"First cancel");
    var closed=new RefundModels.GatewayResult((String)r.get("out_refund_no"),o.orderNo(),transaction.getTransactionId(),"closed-refund",600,600,"CNY","CLOSED");
    when(pay.createRefund(eq(o.orderNo()),eq(transaction.getTransactionId()),eq(600),anyString(),eq(600),anyString(),eq("activity-refund-notify"))).thenReturn(closed);
    orders.decideRefund(o.id(),0,"admin",true,null);assertThat(orders.get(o.id(),u.id()).status()).isEqualTo("PAID");
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
    orders.decideRefund(refundedByAdmin.id(),0,admin.id(),true,null);
    var pending=orders.refundStatus(refundedByAdmin.id(),refundedByAdmin.userId());
    var success=new RefundModels.GatewayResult((String)r.get("out_refund_no"),refundedByAdmin.orderNo(),paid(refundedByAdmin).getTransactionId(),"organizer-refund",600,600,"CNY","SUCCESS");
    doReturn(success).when(pay).createRefund(anyString(),anyString(),anyInt(),anyString(),anyInt(),anyString(),anyString());
    orders.retryRefund(refundedByAdmin.id(),((Number)pending.get("version")).longValue(),admin.id());
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
