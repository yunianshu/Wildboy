package com.wildboy;

import static com.wildboy.RefundModels.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RefundService {
  private final JdbcTemplate db;
  private final ShopService shop;
  private final WechatPayService pay;
  private final ActivityService activities;
  private final TransactionTemplate tx;
  private final RowMapper<Refund> mapper = (r,n) -> new Refund(r.getString("id"), r.getString("order_id"),
      r.getString("order_no"),r.getString("user_id"),r.getString("out_refund_no"),r.getInt("amount_cents"),
      r.getString("reason"),r.getString("status"),r.getString("decision_note"),r.getString("last_error"),
      r.getString("gateway_refund_id"),r.getLong("version"),r.getObject("created_at",OffsetDateTime.class),
      r.getObject("updated_at",OffsetDateTime.class));
  private static final String SELECT="SELECT r.*,o.order_no FROM refund_request r JOIN shop_order o ON o.id=r.order_id ";
  public RefundService(JdbcTemplate db, ShopService shop, WechatPayService pay, ActivityService activities, PlatformTransactionManager tm) {
    this.db=db;this.shop=shop;this.pay=pay;this.activities=activities;this.tx=new TransactionTemplate(tm);
  }
  public Models.Page<Refund> list(String user,int page,int size) {
    if(page<0 || page>100000 || size<1 || size>100) throw new ApiException(400,"INVALID_PAGE","分页参数无效");
    String where=user==null?"":"WHERE r.user_id=? ";
    List<Object> args=new ArrayList<>();if(user!=null)args.add(user);
    Long count=db.queryForObject("SELECT COUNT(*) FROM refund_request r "+where,Long.class,args.toArray());
    args.add(size);args.add(page*size);
    var rows=db.query(SELECT+where+"ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?",mapper,args.toArray());
    return new Models.Page<>(rows,count,page,size,(long)(page+1)*size<count);
  }
  public Refund own(String orderId,String user) {
    shop.order(orderId,user,false);
    return db.query(SELECT+"WHERE r.order_id=? AND r.user_id=?",mapper,orderId,user).stream().findFirst().orElse(null);
  }
  public Refund get(String id) {
    return db.query(SELECT+"WHERE r.id=?",mapper,id).stream().findFirst().orElseThrow(ApiException::notFound);
  }
  private ShopModels.Order lockOrder(String id,String user) {
    var ids=db.queryForList("SELECT id FROM shop_order WHERE id=?"+(user==null?"":" AND user_id=?")+" FOR UPDATE",String.class,user==null?new Object[]{id}:new Object[]{id,user});
    if(ids.isEmpty())throw ApiException.notFound();
    return shop.order(id,user,true);
  }
  private Refund lock(String id) {
    Refund initial=get(id);lockOrder(initial.orderId(),null);
    return get(id);
  }
  private void version(Refund r,long version) {
    if(r.version()!=version)throw ApiException.conflict("STALE_VERSION","退款申请已更新，请刷新");
  }
  public Refund request(String orderId,String user,String reason) {
    String clean=reason==null?"":reason.trim();
    if(clean.isEmpty()||clean.length()>200)throw new ApiException(400,"INVALID_REFUND_REASON","请填写退款原因");
    return tx.execute(s->{
      var order=lockOrder(orderId,user);
      var previous=db.query(SELECT+"WHERE r.order_id=?",mapper,orderId);
      if(!previous.isEmpty())return previous.getFirst();
      if(!order.status().equals("PAID") || order.paymentTransactionId()==null)
        throw ApiException.conflict("REFUND_NOT_ELIGIBLE","仅已付款未发货订单可申请在线退款，已发货请联系客服");
      String id=UUID.randomUUID().toString();
      db.update("INSERT INTO refund_request(id,order_id,user_id,out_refund_no,amount_cents,reason,status) VALUES(?,?,?,?,?,?,'REQUESTED')",id,orderId,user,UUID.randomUUID().toString().replace("-",""),order.totalCents(),clean);
      db.update("UPDATE shop_order SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",orderId);
      activities.audit(user,id,"REFUND_REQUEST");return get(id);
    });
  }
  public Refund reject(String id,long version,String note,String actor) {
    String clean=note==null?"":note.trim();
    if(clean.isEmpty()||clean.length()>200)throw new ApiException(400,"REFUND_NOTE_REQUIRED","请填写拒绝原因");
    return tx.execute(s->{var r=lock(id);version(r,version);
      if(!r.status().equals("REQUESTED"))throw ApiException.conflict("REFUND_STATE","该申请不能拒绝");
      db.update("UPDATE refund_request SET status='REJECTED',decision_note=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",clean,id);
      activities.audit(actor,id,"REFUND_REJECT");return get(id);});
  }
  public Refund approve(String id,long version,String actor,boolean retry) {
    // Configuration failures must leave the request actionable rather than pretending it was sent.
    pay.requireConfigured();
    Refund r=tx.execute(s->{var current=lock(id);version(current,version);
      if(!(retry?Set.of("PROCESSING","UNKNOWN").contains(current.status()):current.status().equals("REQUESTED")))
        throw ApiException.conflict("REFUND_STATE","退款状态已改变，请刷新");
      var order=shop.order(current.orderId(),null,true);
      if(!order.status().equals("PAID"))throw ApiException.conflict("REFUND_STATE","订单不支持退款");
      db.update("UPDATE refund_request SET status='PROCESSING',last_error='',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
      activities.audit(actor,id,retry?"REFUND_RETRY":"REFUND_APPROVE");return get(id);});
    try {
      var order=shop.order(r.orderId(),null,true);
      apply(pay.createRefund(order,r),actor);
    } catch(Exception e) { markUnknown(id); }
    return get(id);
  }
  public Refund verify(String id,long version,String actor) {
    Refund r=tx.execute(s->{var current=lock(id);version(current,version);
      if(!Set.of("PROCESSING","UNKNOWN","ABNORMAL").contains(current.status()))
        throw ApiException.conflict("REFUND_STATE","当前退款无需查单");return current;});
    try { apply(pay.queryRefund(r.outRefundNo()),actor); }
    catch(Exception e) { markUnknown(id); }
    return get(id);
  }
  private void markUnknown(String id) {
    tx.executeWithoutResult(s->{var r=lock(id);
      if(Set.of("SUCCESS","REJECTED","CLOSED").contains(r.status()))return;
      db.update("UPDATE refund_request SET status='UNKNOWN',last_error='退款结果待核对，请刷新结果；未确认前不恢复库存',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
    });
  }
  public void apply(GatewayResult remote,String actor) {
    if(remote==null || remote.outRefundNo()==null)throw new ApiException(400,"INVALID_REFUND","退款通知无效");
    tx.executeWithoutResult(s->{
      var found=db.query(SELECT+"WHERE r.out_refund_no=?",mapper,remote.outRefundNo());
      if(found.isEmpty())throw new ApiException(400,"REFUND_NOT_FOUND","退款单不存在");
      Refund r=lock(found.getFirst().id());
      var order=shop.order(r.orderId(),null,true);
      if(!Objects.equals(remote.orderNo(),order.orderNo())||!Objects.equals(remote.transactionId(),order.paymentTransactionId())
          ||remote.total()!=order.totalCents()||remote.refund()!=r.amountCents()||!"CNY".equals(remote.currency())
          ||remote.refundId()==null||remote.refundId().isBlank()||remote.refundId().length()>64
          ||(r.gatewayRefundId()!=null&&!Objects.equals(r.gatewayRefundId(),remote.refundId()))
          ||!Set.of("SUCCESS","PROCESSING","ABNORMAL","CLOSED").contains(remote.status()))
        throw new ApiException(400,"REFUND_MISMATCH","退款订单或金额不匹配");
      if(r.status().equals("SUCCESS"))return;
      if(Set.of("REQUESTED","REJECTED","CLOSED").contains(r.status()))throw ApiException.conflict("REFUND_STATE","退款状态冲突");
      if(remote.status().equals("SUCCESS")) {
        if(!order.status().equals("PAID"))throw ApiException.conflict("REFUND_STATE","订单退款状态冲突");
        for(var item:order.items().stream().sorted(Comparator.comparing(ShopModels.OrderItem::productId)).toList())
          db.update("UPDATE product SET stock=stock+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",item.quantity(),item.productId());
        db.update("UPDATE shop_order SET status='REFUNDED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",order.id());
      }
      db.update("UPDATE refund_request SET status=?,gateway_refund_id=?,last_error='',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",remote.status(),remote.refundId(),r.id());
      activities.audit(actor==null?order.userId():actor,r.id(),"REFUND_"+remote.status());
    });
  }
}
