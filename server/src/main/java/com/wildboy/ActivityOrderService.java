package com.wildboy;

import static com.wildboy.ActivityOrderModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wechat.pay.java.service.payments.model.Transaction;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Activity-specific settlement; never touches product stock or shop_order. */
@Service
public class ActivityOrderService {
  private static final long ABSENCE_CONFIRMATION_SECONDS=60;
  private record PaymentAttempt(OffsetDateTime attemptedAt,String merchantId,String appId,
      OffsetDateTime notFoundAt,boolean gatewaySeen) {}
  private final JdbcTemplate db;
  private final ActivityService activities;
  private final WechatPayService pay;
  private final MembershipService memberships;
  private final LegalService legal;
  private final IdentityProtection identity;
  private final ObjectMapper json;
  private final TransactionTemplate tx;
  private final WechatShippingService shipping;
  private final ShippingReportService shippingReports;
  public ActivityOrderService(JdbcTemplate db, ActivityService activities, WechatPayService pay,
      ObjectMapper json, PlatformTransactionManager tm, MembershipService memberships, LegalService legal, IdentityProtection identity, WechatShippingService shipping, ShippingReportService shippingReports) {
    this.legal=legal;this.identity=identity;this.memberships=memberships;this.db=db;this.activities=activities;this.pay=pay;this.json=json;this.tx=new TransactionTemplate(tm);this.shipping=shipping;this.shippingReports=shippingReports;
  }
  public Order get(String id,String user) {
    return db.query("SELECT * FROM activity_order WHERE id=?"+(user==null?"":" AND user_id=?"),(r,n)-> {
      try {return new Order(r.getString("id"),r.getString("order_no"),r.getString("activity_id"),
          r.getString("activity_title"),r.getString("user_id"),r.getString("status"),r.getInt("party_size"),
          r.getInt("original_total_cents"),r.getInt("total_cents"),r.getString("currency"),
          json.readValue(r.getString("quote_json"),Quote.class),r.getString("payment_transaction_id"),
          r.getBoolean("payment_attempted"),r.getObject("expires_at",OffsetDateTime.class),r.getLong("version"));}
      catch(java.io.IOException e){throw new IllegalStateException("Invalid activity price snapshot",e);}
    },user==null?new Object[]{id}:new Object[]{id,user}).stream().findFirst().orElseThrow(ApiException::notFound);
  }
  public List<Models.Participant> participants(String id,String user) {
    get(id,user);
    return db.query("SELECT * FROM activity_order_participant WHERE order_id=? ORDER BY position",(r,n)->new Models.Participant(r.getString("id"),r.getString("participant_name"),identity.masked(r.getString("id_number")),r.getString("phone")),id);
  }
  public List<Models.Participant> maskedParticipants(String id) {
    return participants(id,null).stream().map(UserService::maskedParticipant).toList();
  }
  public List<Models.Participant> revealParticipants(String id,String actor) {
    requireAdmin(actor);
    return tx.execute(s->{
      var people=participants(id,null);
      activities.audit(actor,id,"ACTIVITY_CONTACTS_VIEW");
      return people;
    });
  }
  private Order lock(String id,String user) {
    Order initial=get(id,user);
    activities.lock(initial.activityId());
    db.queryForList("SELECT id FROM activity_order WHERE id=? FOR UPDATE",String.class,id);
    return get(id,user);
  }

  private String requestFingerprint(String activityId,Models.RegistrationInput input) {
    if(input==null||input.participants()==null||input.participants().isEmpty())throw new ApiException(400,"PARTICIPANTS_REQUIRED","请填写参与人");
    try {
      var normalized=new ArrayList<List<String>>();
      for(var p:input.participants()) {
        if(p==null)throw new ApiException(400,"INVALID_PARTICIPANT","参与人信息不完整");
        normalized.add(List.of(p.participantName()==null?"":p.participantName().strip(),p.idNumber()==null?"":p.idNumber().strip().toUpperCase(Locale.ROOT),p.phone()==null?"":p.phone().strip()));
      }
      String value=json.writeValueAsString(Arrays.asList(activityId,normalized,input.privacyVersion(),input.termsVersion()));
      return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }catch(ApiException e){throw e;}catch(Exception e){throw new IllegalStateException("Cannot hash registration request",e);}
  }
  public Order byRequest(String key,String user) {
    var ids=db.queryForList("SELECT id FROM activity_order WHERE user_id=? AND request_key=?",String.class,user,key);
    if(ids.isEmpty())throw ApiException.notFound();return get(ids.getFirst(),user);
  }
  public Preview preview(String activityId,String user,int count) {
    return tx.execute(s->{
      lockBookingUser(user);
      return quoteLocked(activityId,user,count);
    });
  }
  private void lockBookingUser(String user) {
    // Serialize booking and membership changes without blocking the user foreign key
    // when activity notices or free registrations are written under the activity lock.
    db.queryForList("SELECT id FROM app_user WHERE id=? FOR NO KEY UPDATE",String.class,user);
  }
  private Preview quoteLocked(String activityId,String user,int count) {
    if(count<1||count>10000)throw new ApiException(400,"INVALID_PARTY_SIZE","报名人数无效");
    // Read the price before taking membership locks, then recheck under the activity lock.
    var initial=activities.get(activityId,false);
    var price=memberships.price(user,MembershipModels.Scope.ACTIVITY,initial.priceCents());
    String mode=memberships.activityParticipantPricing(user);
    var a=activities.lock(activityId);activities.enrollmentOpen(a);
    if(a.priceCents()!=initial.priceCents())throw ApiException.conflict("ACTIVITY_PRICE_CHANGED","活动价格已更新，请重新报价");
    var lines=new ArrayList<PriceLine>();
    int discounted=mode==null?0:("ACCOUNT_ALL".equals(mode)?count:1);
    if(mode!=null&&!Set.of("ACCOUNT_ALL","ONE_BENEFIT").contains(mode))throw ApiException.conflict("INVALID_PRICING_POLICY","活动优惠范围尚未配置");
    if(discounted>0)lines.add(new PriceLine(a.priceCents(),discounted,price.priceCents(),price.tierId(),price.tierName(),price.tierVersion(),price.pricingMode(),price.pricingValue()));
    if(count>discounted)lines.add(new PriceLine(a.priceCents(),count-discounted,a.priceCents(),null,null,null,null,null));
    var quote=new Quote(lines,"ACTIVITY_V1:"+(mode==null?"BASE":mode));
    try{if(quote.originalTotal()>100000000||quote.total()>100000000)throw new ArithmeticException();
      return new Preview(count,quote.originalTotal(),quote.total(),"CNY",mode,quote);}
    catch(ArithmeticException e){throw new ApiException(400,"ORDER_AMOUNT_TOO_LARGE","报名总金额超出支持范围");}
  }
  public Order create(String activityId,String user,Models.RegistrationInput input,String key,int expectedTotalCents) {
    return tx.execute(s->{
      lockBookingUser(user);
      String fingerprint=requestFingerprint(activityId,input);
      var previous=db.queryForList("SELECT id FROM activity_order WHERE user_id=? AND request_key=?",String.class,user,key);
      if(!previous.isEmpty()) {
        var order=get(previous.getFirst(),user);
        if(!order.activityId().equals(activityId)||!fingerprint.equals(db.queryForObject("SELECT request_fingerprint FROM activity_order WHERE id=?",String.class,order.id())))throw ApiException.conflict("IDEMPOTENCY_CONFLICT","请求标识已用于其他活动");return order;
      }
      if(input==null||input.participants()==null)throw new ApiException(400,"PARTICIPANTS_REQUIRED","请填写参与人");
      var preview=quoteLocked(activityId,user,input.participants().size());
      if(preview.totalCents()!=expectedTotalCents)throw ApiException.conflict("ACTIVITY_PRICE_CHANGED","报名价格已更新，请重新确认");
      return reserve(activityId,user,input,preview.quote(),key);
    });
  }
  public Models.Activity setPrice(String id,int price,long version,String actor) {
    if(price<0||price>100000000)throw new ApiException(400,"INVALID_PRICE","活动价格超出范围");
    return tx.execute(s->{var a=activities.lock(id);activities.checkVersion(a,version);
      if(!a.status().equals("DRAFT"))throw ApiException.conflict("INVALID_STATE","仅草稿活动可设置收费价格");
      if(a.registeredCount()!=0)throw ApiException.conflict("ACTIVITY_HAS_REGISTRATIONS","活动已有报名");
      db.update("UPDATE activity SET price_cents=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",price,id);
      activities.audit(actor,id,"ACTIVITY_PRICE_SET");return activities.get(id,true);});
  }

  /** Internal server-only entry point. Caller must resolve the approved pricing policy first. */
  Order reserve(String activityId,String user,Models.RegistrationInput input,Quote quote,String key) {
    if (key==null||!key.matches("[A-Za-z0-9_-]{8,80}")) throw new ApiException(400,"INVALID_IDEMPOTENCY_KEY","请提供有效请求标识");
    return tx.execute(s->{
      lockBookingUser(user);
      String fingerprint=requestFingerprint(activityId,input);
      var previous=db.queryForList("SELECT id FROM activity_order WHERE user_id=? AND request_key=?",String.class,user,key);
      if(!previous.isEmpty()) {
        Order order=get(previous.getFirst(),user);
        if(!order.activityId().equals(activityId)||!fingerprint.equals(db.queryForObject("SELECT request_fingerprint FROM activity_order WHERE id=?",String.class,order.id())))throw ApiException.conflict("IDEMPOTENCY_CONFLICT","请求标识已用于其他活动");
        return order;
      }
      var a=activities.lock(activityId);activities.enrollmentOpen(a);
      var participants=activities.validatedParticipants(input,a.identityRequired());
      legal.requireCurrent(input.privacyVersion(),input.termsVersion());
      activities.requireRegistrationContact(user);
      if(a.priceCents()<=0)throw ApiException.conflict("FREE_REGISTRATION_REQUIRED","免费活动请使用报名入口");
      if(quote.count()!=participants.size()||quote.lines().stream().anyMatch(l->l.unitPriceCents()!=a.priceCents()))
        throw ApiException.conflict("ACTIVITY_PRICE_CHANGED","活动价格已更新，请重新确认");
      if(activities.own(activityId,user)!=null || db.queryForObject("SELECT COUNT(*) FROM activity_order WHERE activity_id=? AND user_id=? AND status IN ('PENDING_PAYMENT','PAID','CONFIRMED_FREE','REFUND_PENDING')",Integer.class,activityId,user)>0)
        throw ApiException.conflict("ALREADY_REGISTERED","已有有效报名或待付款订单");
      if(participants.size()>a.capacity()-a.registeredCount())throw ApiException.conflict("ACTIVITY_FULL","活动剩余名额不足");
      if(a.identityRequired())identity.requireReady();
      int total,original;
      try{total=quote.total();original=quote.originalTotal();if(total>100000000||original>100000000)throw new ArithmeticException();}
      catch(ArithmeticException e){throw new ApiException(400,"ORDER_AMOUNT_TOO_LARGE","报名总金额超出支持范围");}
      if(total>0)pay.requireConfigured();
      String id=UUID.randomUUID().toString(),no="A"+UUID.randomUUID().toString().replace("-","").substring(0,31);
      OffsetDateTime expiry=OffsetDateTime.now().plusMinutes(15);
      if(a.registrationDeadline().isBefore(expiry))expiry=a.registrationDeadline();
      String quoteJson;
      try{quoteJson=json.writeValueAsString(quote);}catch(Exception e){throw new IllegalArgumentException(e);}
      db.update("INSERT INTO activity_order(id,order_no,activity_id,activity_title,user_id,request_key,status,party_size,original_total_cents,total_cents,quote_json,expires_at,request_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          id,no,a.id(),a.title(),user,key,total==0?"CONFIRMED_FREE":"PENDING_PAYMENT",participants.size(),original,total,quoteJson,expiry,fingerprint);
      for(int i=0;i<participants.size();i++) {
        var p=participants.get(i);
        db.update("INSERT INTO activity_order_participant(id,order_id,participant_name,id_number,phone,position) VALUES(?,?,?,?,?,?)",
            UUID.randomUUID().toString(),id,p.participantName(),identity.encrypt(p.idNumber()),p.phone(),i);
      }
      db.update("UPDATE activity SET registered_count=registered_count+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",participants.size(),activityId);
      legal.accept(user,input.privacyVersion(),input.termsVersion(),"REGISTRATION");
      activities.audit(user,id,"ACTIVITY_ORDER_CREATE");return get(id,user);
    });
  }
  public ShopModels.PaymentRequest prepay(String id,String user) {
    tx.executeWithoutResult(s->{var o=lock(id,user);requirePayable(o);
      pay.requireConfigured();
      payerOpenId(user);
      if(o.paymentAttempted()&&!sameGateway(paymentAttempt(id)))
        throw ApiException.conflict("PAYMENT_UNCERTAIN","原支付渠道待核对，名额继续保留");
      db.update("UPDATE activity_order SET payment_attempted=TRUE,payment_attempted_at=clock_timestamp(),payment_merchant_id=?,payment_app_id=?,payment_not_found_at=NULL WHERE id=?",pay.merchantId(),pay.appId(),id);
    });
    // The intent is committed before the gateway call. The same order number is used
    // on retries, and the activity/order locks prevent concurrent local closure.
    return tx.execute(s->{var o=lock(id,user);var expiry=requirePayable(o);
      var payment=pay.prepay(o.orderNo(),o.totalCents(),expiry,payerOpenId(user),"Wildboy 活动报名 "+o.orderNo(),"activity-notify");
      markGatewaySeen(id);
      return payment;
    });
  }
  private OffsetDateTime requirePayable(Order order) {
    if(!order.status().equals("PENDING_PAYMENT"))throw ApiException.conflict("ORDER_NOT_PENDING","订单无须付款");
    var activity=activities.get(order.activityId(),true);
    activities.enrollmentOpen(activity);
    var expiry=order.expiresAt().isBefore(activity.registrationDeadline())?order.expiresAt():activity.registrationDeadline();
    // JSAPI extends deadlines shorter than one minute; never let it extend ours.
    if(!expiry.isAfter(OffsetDateTime.now().plusMinutes(1)))
      throw ApiException.conflict("ORDER_EXPIRED","付款时间不足，请关闭订单后重新报名");
    return expiry;
  }
  private String payerOpenId(String user) {
    String external=db.queryForObject("SELECT external_id FROM app_user WHERE id=?",String.class,user);
    if(external==null||!external.startsWith("wechat:")||external.length()=="wechat:".length())
      throw ApiException.conflict("WECHAT_IDENTITY_REQUIRED","请使用真实微信账号登录后支付");
    return external.substring("wechat:".length());
  }
  private PaymentAttempt paymentAttempt(String id) {
    return db.queryForObject("SELECT payment_attempted_at,payment_merchant_id,payment_app_id,payment_not_found_at,payment_gateway_seen FROM activity_order WHERE id=?",
        (r,n)->new PaymentAttempt(r.getObject(1,OffsetDateTime.class),r.getString(2),r.getString(3),r.getObject(4,OffsetDateTime.class),r.getBoolean(5)),id);
  }
  private boolean sameGateway(PaymentAttempt attempt) {
    return attempt.merchantId()!=null&&attempt.appId()!=null&&pay.enabled()
        &&attempt.merchantId().equals(pay.merchantId())&&attempt.appId().equals(pay.appId());
  }
  private void markGatewaySeen(String id) {
    db.update("UPDATE activity_order SET payment_gateway_seen=TRUE,payment_not_found_at=NULL WHERE id=?",id);
  }
  private boolean confirmGatewayAbsence(Order order) {
    var attempt=paymentAttempt(order.id());
    var now=OffsetDateTime.now();
    if(attempt.gatewaySeen()||!sameGateway(attempt)||attempt.attemptedAt()==null
        ||now.isBefore(order.expiresAt().plusSeconds(ABSENCE_CONFIRMATION_SECONDS))
        ||now.isBefore(attempt.attemptedAt().plusSeconds(2*ABSENCE_CONFIRMATION_SECONDS)))return false;
    if(attempt.notFoundAt()!=null)
      return !now.isBefore(attempt.notFoundAt().plusSeconds(ABSENCE_CONFIRMATION_SECONDS));
    db.update("UPDATE activity_order SET payment_not_found_at=? WHERE id=?",now,order.id());
    return false;
  }
  private void validatePayment(Order o,Transaction t) {
    String external=db.queryForObject("SELECT external_id FROM app_user WHERE id=?",String.class,o.userId());
    if(!pay.enabled()||t==null||t.getTradeType()!=Transaction.TradeTypeEnum.JSAPI||t.getPayer()==null
        ||external==null||!external.startsWith("wechat:")||!Objects.equals(t.getPayer().getOpenid(),external.substring("wechat:".length()))
        ||!Objects.equals(o.orderNo(),t.getOutTradeNo())||!Objects.equals(pay.appId(),t.getAppid())
        ||!Objects.equals(pay.merchantId(),t.getMchid())||t.getAmount()==null
        ||!Objects.equals(t.getAmount().getTotal(),o.totalCents())||!"CNY".equals(t.getAmount().getCurrency())
        ||t.getTransactionId()==null||t.getTransactionId().isBlank()||t.getTransactionId().length()>64)
      throw new ApiException(400,"PAYMENT_MISMATCH","活动支付信息不匹配");
  }
  public void completePayment(Transaction t) {
    if(t==null||t.getTradeState()!=Transaction.TradeStateEnum.SUCCESS)throw new ApiException(400,"INVALID_PAYMENT","付款结果无效");
    tx.executeWithoutResult(s->{
      var ids=db.queryForList("SELECT id FROM activity_order WHERE order_no=?",String.class,t.getOutTradeNo());
      if(ids.isEmpty())throw ApiException.notFound();var o=lock(ids.getFirst(),null);validatePayment(o,t);
      if(Set.of("PAID","REFUND_PENDING","REFUNDED").contains(o.status())) {
        if(!Objects.equals(o.paymentTransactionId(),t.getTransactionId()))throw ApiException.conflict("PAYMENT_CONFLICT","支付交易不匹配");
        return;
      }
      if(!o.status().equals("PENDING_PAYMENT"))throw ApiException.conflict("PAYMENT_CONFLICT","订单状态异常，需要核对");
      db.update("UPDATE activity_order SET status='PAID',payment_transaction_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",t.getTransactionId(),o.id());
      activities.audit(o.userId(),o.id(),"ACTIVITY_ORDER_PAID");
      // 付费报名确认后上报虚拟发货，使用本次已核验的微信交易单号；结果落库供补报。
      String reportId=shippingReports.register("activity",o.id(),o.orderNo(),3);
      shippingReports.submitAfterCommit(reportId);
    });
  }
  public Order cancel(String id,String user) {
    return requireClosedOrPaid(cancelInternal(id,user,user));
  }
  public Order cancelAdmin(String id,String actor) {
    requireAdmin(actor);
    return requireClosedOrPaid(tx.execute(s->{
      var initial=lock(id,null);
      var result=cancelInternal(id,null,actor);
      if(!initial.status().equals("CLOSED")&&!result.status().equals("PENDING_PAYMENT"))
        db.update("UPDATE activity_order SET organizer_cancelled=TRUE WHERE id=?",id);
      return result;
    }));
  }
  private Order requireClosedOrPaid(Order order) {
    if(order.status().equals("PENDING_PAYMENT"))
      throw ApiException.conflict("PAYMENT_UNCERTAIN","付款状态待核对，名额继续保留");
    return order;
  }
  private Order cancelInternal(String id,String user,String actor) {
    return tx.execute(s->{var o=lock(id,user);
      if(o.status().equals("CLOSED"))return o;
      if(o.status().equals("CONFIRMED_FREE")) {
        if(!activities.get(o.activityId(),true).startAt().isAfter(OffsetDateTime.now()))throw ApiException.conflict("ACTIVITY_STARTED","活动已开始，请联系客服");
        db.update("UPDATE activity_order SET status='CLOSED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);release(o);activities.audit(actor,id,"ACTIVITY_ZERO_CANCEL");return get(id,user);
      }
      if(!o.status().equals("PENDING_PAYMENT"))throw ApiException.conflict("REFUND_REQUIRED","已付款订单请申请退款");
      if(o.paymentAttempted()) {
        try {
          var remote=pay.queryOrder(o.orderNo());
          requireMatchingQuery(o,remote);
          if(remote.getTradeState()==Transaction.TradeStateEnum.SUCCESS){completePayment(remote);return get(id,user);}
          markGatewaySeen(id);
          if(remote.getTradeState()!=Transaction.TradeStateEnum.CLOSED) {
            try{pay.closeOrder(o.orderNo());}catch(ApiException e){return o;}
          }
        } catch(WechatPayService.OrderNotFound e) {
          if(!confirmGatewayAbsence(o))return o;
        }
      }
      db.update("UPDATE activity_order SET status='CLOSED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
      release(o);activities.audit(actor,id,"ACTIVITY_ORDER_CLOSE");return get(id,user);
    });
  }
  public Map<String,Object> refundStatus(String id,String user) {
    get(id,user);var rows=db.queryForList("SELECT * FROM activity_order_refund WHERE order_id=? AND is_current=TRUE",id);
    return rows.isEmpty()?Map.of():rows.getFirst();
  }
  public Map<String,Object> refund(String id,String user,String reason) {
    return requestRefund(id,user,reason,user);
  }
  private void requireAdmin(String actor) {
    if(actor==null||!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND role='ADMIN')",Boolean.class,actor)))
      throw new ApiException(403,"FORBIDDEN","无操作权限");
  }
  public Map<String,Object> adminRefund(String id,String actor,String reason) {
    requireAdmin(actor);
    return tx.execute(s->{
      var initial=lock(id,null);
      var result=requestRefund(id,null,reason,actor);
      if(Set.of("PAID","REFUND_PENDING").contains(initial.status()))db.update("UPDATE activity_order SET organizer_cancelled=TRUE WHERE id=?",id);
      return result;
    });
  }
  private Map<String,Object> requestRefund(String id,String user,String reason,String actor) {
    if(reason==null||reason.isBlank()||reason.length()>200)throw new ApiException(400,"INVALID_REFUND_REASON","请填写退款原因");
    return tx.execute(s->{var o=lock(id,user);
      var existing=db.queryForList("SELECT * FROM activity_order_refund WHERE order_id=? AND is_current=TRUE",id);
      if(!existing.isEmpty()&&!Set.of("REJECTED","CLOSED").contains(existing.getFirst().get("status")))return existing.getFirst();
      if(!o.status().equals("PAID"))throw ApiException.conflict("REFUND_NOT_ELIGIBLE","当前订单无法申请退款");
      if(!activities.get(o.activityId(),true).startAt().isAfter(OffsetDateTime.now()))throw ApiException.conflict("ACTIVITY_STARTED","活动已开始，请联系客服");
      if(o.paymentTransactionId()==null)throw ApiException.conflict("PAYMENT_UNCERTAIN","支付信息待核对");
      db.update("UPDATE activity_order_refund SET is_current=FALSE WHERE order_id=? AND is_current=TRUE",id);
      String refundId=UUID.randomUUID().toString();
      db.update("INSERT INTO activity_order_refund(id,order_id,out_refund_no,amount_cents,reason,status) VALUES(?,?,?,?,?,'REQUESTED')",refundId,id,UUID.randomUUID().toString().replace("-",""),o.totalCents(),reason.strip());
      db.update("UPDATE activity_order SET status='REFUND_PENDING',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
      activities.audit(actor,id,"ACTIVITY_REFUND_REQUEST");return db.queryForMap("SELECT * FROM activity_order_refund WHERE id=?",refundId);
    });
  }
  private Map<String,Object> requireCurrentRefund(String orderId,String refundId,long version) {
    var rows=db.queryForList("SELECT * FROM activity_order_refund WHERE order_id=? AND id=? AND is_current=TRUE",orderId,refundId);
    if(rows.isEmpty())throw ApiException.conflict("STALE_REFUND","退款申请已替换，请重新加载当前申请");
    var refund=rows.getFirst();
    if(((Number)refund.get("version")).longValue()!=version)throw ApiException.conflict("STALE_VERSION","退款申请已更新");
    return refund;
  }
  public Map<String,Object> decideRefund(String orderId,String refundId,long version,String actor,boolean approve,String note) {
    if(!approve&&(note==null||note.isBlank()||note.length()>200))throw new ApiException(400,"REFUND_NOTE_REQUIRED","请填写拒绝原因");
    Map<String,Object> refund=tx.execute(s->{var o=lock(orderId,null);
      var r=requireCurrentRefund(orderId,refundId,version);
      if(!o.status().equals("REFUND_PENDING")||!"REQUESTED".equals(r.get("status")))throw ApiException.conflict("REFUND_STATE","退款申请状态已改变");
      if(approve)pay.requireConfigured();
      db.update("UPDATE activity_order_refund SET status=?,decision_note=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",approve?"PROCESSING":"REJECTED",approve?"":note.strip(),refundId);
      if(!approve)db.update("UPDATE activity_order SET status='PAID',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",orderId);
      activities.audit(actor,orderId,approve?"ACTIVITY_REFUND_APPROVE":"ACTIVITY_REFUND_REJECT");return r;
    });
    if(approve) {
      var o=get(orderId,null);
      submitRefund(o,refund);
    }
    return db.queryForMap("SELECT * FROM activity_order_refund WHERE id=?",refundId);
  }
  public Map<String,Object> verifyRefund(String id,String refundId,long version,String actor) {
    var r=tx.execute(s->{lock(id,null);var row=requireCurrentRefund(id,refundId,version);
      if(!Set.of("PROCESSING","UNKNOWN","ABNORMAL").contains(row.get("status")))throw ApiException.conflict("REFUND_STATE","退款状态不支持查单");activities.audit(actor,id,"ACTIVITY_REFUND_VERIFY");return row;});
    String number=(String)r.get("out_refund_no");
    try{applyExpectedRefund(number,pay.queryRefund(number));}catch(ApiException e){unknownRefund(id,number);}
    return db.queryForMap("SELECT * FROM activity_order_refund WHERE id=?",refundId);
  }
  public Map<String,Object> retryRefund(String id,String refundId,long version,String actor) {
    requireAdmin(actor);
    var r=tx.execute(s->{var o=lock(id,null);var row=requireCurrentRefund(id,refundId,version);
      if(!o.status().equals("REFUND_PENDING")||!Set.of("PROCESSING","UNKNOWN").contains(row.get("status")))throw ApiException.conflict("REFUND_STATE","退款状态不支持重试");
      pay.requireConfigured();
      db.update("UPDATE activity_order_refund SET status='PROCESSING',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",refundId);activities.audit(actor,id,"ACTIVITY_REFUND_RETRY");return row;});
    submitRefund(get(id,null),r);
    return db.queryForMap("SELECT * FROM activity_order_refund WHERE id=?",refundId);
  }
  private void submitRefund(Order order,Map<String,Object> refund) {
    String number=(String)refund.get("out_refund_no");
    try{applyExpectedRefund(number,pay.createRefund(order.orderNo(),order.paymentTransactionId(),order.totalCents(),number,order.totalCents(),(String)refund.get("reason"),"activity-refund-notify"));}
    catch(ApiException e){unknownRefund(order.id(),number);}
  }
  private void applyExpectedRefund(String number,RefundModels.GatewayResult result) {
    if(result==null||!number.equals(result.outRefundNo()))
      throw new ApiException(502,"REFUND_QUERY_MISMATCH","退款结果不匹配，请核对原申请");
    applyRefund(result);
  }
  private void unknownRefund(String id,String refundNo) {
    tx.executeWithoutResult(s->{lock(id,null);db.update("UPDATE activity_order_refund SET status='UNKNOWN',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND out_refund_no=? AND is_current=TRUE AND status='PROCESSING'",id,refundNo);});
  }
  public void applyRefund(RefundModels.GatewayResult remote) {
    if(remote==null)throw new ApiException(400,"INVALID_REFUND","退款通知无效");
    tx.executeWithoutResult(s->{
      var found=db.queryForList("SELECT order_id FROM activity_order_refund WHERE out_refund_no=?",String.class,remote.outRefundNo());
      if(found.isEmpty())throw ApiException.notFound();var o=lock(found.getFirst(),null);
      var r=db.queryForMap("SELECT * FROM activity_order_refund WHERE out_refund_no=?",remote.outRefundNo());
      if(!Objects.equals(remote.orderNo(),o.orderNo())||!Objects.equals(remote.transactionId(),o.paymentTransactionId())
          ||remote.total()!=o.totalCents()||remote.refund()!=o.totalCents()||!"CNY".equals(remote.currency())
          ||remote.refundId()==null||remote.refundId().isBlank()||remote.refundId().length()>64
          ||(r.get("gateway_refund_id")!=null&&!Objects.equals(r.get("gateway_refund_id"),remote.refundId()))
          ||remote.status()==null||!Set.of("SUCCESS","PROCESSING","ABNORMAL","CLOSED").contains(remote.status()))
        throw new ApiException(400,"REFUND_MISMATCH","活动退款信息不匹配");
      if("SUCCESS".equals(r.get("status")) || ("CLOSED".equals(r.get("status")) && "CLOSED".equals(remote.status())))return;
      if(!Boolean.TRUE.equals(r.get("is_current")))throw ApiException.conflict("REFUND_STATE","历史退款状态冲突，需要人工核对");
      if(!Set.of("PROCESSING","UNKNOWN","ABNORMAL").contains(r.get("status"))||!o.status().equals("REFUND_PENDING"))throw ApiException.conflict("REFUND_STATE","活动退款状态冲突");
      if("ABNORMAL".equals(r.get("status"))&&"PROCESSING".equals(remote.status()))return;
      if(Objects.equals(r.get("status"),remote.status()) && Objects.equals(r.get("gateway_refund_id"),remote.refundId()))return;
      if(remote.status().equals("SUCCESS")) {
        db.update("UPDATE activity_order SET status='REFUNDED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",o.id());release(o);
      }
      if(remote.status().equals("CLOSED"))db.update("UPDATE activity_order SET status='PAID',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",o.id());
      db.update("UPDATE activity_order_refund SET status=?,gateway_refund_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND is_current=TRUE",remote.status(),remote.refundId(),o.id());
      activities.audit(o.userId(),o.id(),"ACTIVITY_REFUND_"+remote.status());
    });
  }
  public Models.Page<Order> list(String user,int page,int size) {
    return list(user,null,page,size);
  }
  public Models.Page<Order> list(String user,String activityId,int page,int size) {
    return list(user,activityId,null,page,size);
  }
  public Models.Page<Order> list(String user,String activityId,String orderId,int page,int size) {
    ActivityService.pageCheck(page,size);String where=" WHERE 1=1";
    var args=new ArrayList<Object>();if(user!=null){where+=" AND user_id=?";args.add(user);}
    if(activityId!=null&&!activityId.isBlank()){where+=" AND activity_id=?";args.add(activityId);}
    if(orderId!=null&&!orderId.isBlank()){where+=" AND id=?";args.add(orderId);}
    long total=db.queryForObject("SELECT COUNT(*) FROM activity_order"+where,Long.class,args.toArray());
    args.add(size);args.add(page*size);
    var ids=db.queryForList("SELECT id FROM activity_order"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",String.class,args.toArray());
    return new Models.Page<>(ids.stream().map(id->get(id,user)).toList(),total,page,size,(long)(page+1)*size<total);
  }
  public Order verifyPayment(String id,String user) {
    return tx.execute(s->{
      var o=lock(id,user);
      if(!o.status().equals("PENDING_PAYMENT")||!o.paymentAttempted())return o;
      try {
        var remote=pay.queryOrder(o.orderNo());
        requireMatchingQuery(o,remote);
        markGatewaySeen(id);
        if(remote.getTradeState()==Transaction.TradeStateEnum.SUCCESS)completePayment(remote);
      } catch(WechatPayService.OrderNotFound e) {
        return o;
      }
      return get(id,user);
    });
  }
  private void requireMatchingQuery(Order o,Transaction remote) {
    if(remote==null||remote.getTradeState()==null||!Objects.equals(remote.getOutTradeNo(),o.orderNo())
        ||!Objects.equals(remote.getAppid(),pay.appId())||!Objects.equals(remote.getMchid(),pay.merchantId())||!pay.enabled())
      throw new ApiException(502,"PAYMENT_QUERY_MISMATCH","支付查询结果不匹配，待核对期间名额继续保留");
  }
  /** Explicit bounded reconciliation. Each failed gateway call leaves its reservation untouched. */
  public Map<String,Integer> closeExpired() {
    var ids=db.queryForList("SELECT id FROM activity_order WHERE status='PENDING_PAYMENT' AND expires_at<=CURRENT_TIMESTAMP AND next_reconcile_at<=CURRENT_TIMESTAMP ORDER BY next_reconcile_at,expires_at,id LIMIT 50",String.class);
    int closed=0,uncertain=0;
    for(String id:ids)try{db.update("UPDATE activity_order SET next_reconcile_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes' WHERE id=?",id);var o=get(id,null);if(cancel(id,o.userId()).status().equals("CLOSED"))closed++;}catch(ApiException e){uncertain++;}
    return Map.of("closed",closed,"pendingReview",uncertain);
  }
  private void release(Order o) {
    db.update("UPDATE activity SET registered_count=registered_count-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",o.partySize(),o.activityId());
  }
}
