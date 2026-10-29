package com.wildboy;
import static com.wildboy.Models.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.Transactional;
@Service
public class NotificationService {
  final JdbcTemplate db;final WechatNotificationGateway gateway;final TransactionTemplate tx;
  public record Notice(String id,String activityId,String kind,String title,String detail,String status,int attempts,String lastError,OffsetDateTime createdAt){}
  public NotificationService(JdbcTemplate db,WechatNotificationGateway gateway,PlatformTransactionManager manager){this.db=db;this.gateway=gateway;this.tx=new TransactionTemplate(manager);}
  Notice map(java.sql.ResultSet r,int n)throws java.sql.SQLException{return new Notice(r.getString("id"),r.getString("activity_id"),r.getString("kind"),r.getString("title"),r.getString("detail"),r.getString("status"),r.getInt("attempts"),r.getString("last_error"),r.getObject("created_at",OffsetDateTime.class));}
  public Map<String,Object> config(){return Map.of("ready",gateway.ready(),"templateId",gateway.templateId());}
  @Transactional public void subscribe(String user,boolean accepted){
    if(!accepted)return;if(!gateway.ready())throw new ApiException(503,"NOTIFICATIONS_NOT_CONFIGURED","订阅消息尚未配置");
    db.update("INSERT INTO notification_permission(user_id,credits) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET credits=LEAST(notification_permission.credits+1,3)",user);
  }
  public void enqueue(String user,Activity a,String kind,String key,String detail,OffsetDateTime at){
    db.update("INSERT INTO notification_outbox(id,user_id,activity_id,kind,dedupe_key,title,detail,event_at,status) VALUES(?,?,?,?,?,?,?,?,'PENDING') ON CONFLICT(dedupe_key) DO NOTHING",UUID.randomUUID().toString(),user,a.id(),kind,key,a.title(),detail,at);
  }
  public void activityNotice(Activity a,String kind,String detail){
    for(String user:db.queryForList("SELECT user_id FROM registration WHERE activity_id=? AND status='CONFIRMED'",String.class,a.id())) enqueue(user,a,kind,kind+":"+a.id()+":"+(kind.equals("PRETRIP")?a.startAt().toString():a.version())+":"+user,detail,a.startAt());
  }
  public Page<Notice> list(String user,int page,int size){
    ActivityService.pageCheck(page,size);String where=user==null?"":" WHERE user_id=?";var args=new ArrayList<Object>();if(user!=null)args.add(user);
    long count=db.queryForObject("SELECT COUNT(*) FROM notification_outbox"+where,Long.class,args.toArray());args.add(size);args.add(page*size);
    return new Page<>(db.query("SELECT * FROM notification_outbox"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::map,args.toArray()),count,page,size,(long)(page+1)*size<count);
  }
  @Transactional public void retry(String id,String actor){
    var states=db.queryForList("SELECT status FROM notification_outbox WHERE id=? FOR UPDATE",String.class,id);if(states.isEmpty())throw ApiException.notFound();
    if(!Set.of("FAILED","NO_PERMISSION","UNCONFIGURED").contains(states.getFirst()))throw ApiException.conflict("NOT_RETRYABLE","该消息不可重发，结果不明时请先人工核对");
    db.update("UPDATE notification_outbox SET status='PENDING',attempts=0,last_error='',next_attempt_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,'NOTIFICATION_RETRY')",UUID.randomUUID().toString(),actor,id);
  }
  boolean relevant(Map<String,Object> r){
    String kind=(String)r.get("kind"),activity=(String)r.get("activity_id"),user=(String)r.get("user_id");
    if(kind.equals("WAITLIST_OFFER"))return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM activity_waitlist w JOIN activity a ON a.id=w.activity_id WHERE w.id=? AND w.user_id=? AND w.status='OFFERED' AND w.offer_expires_at>CURRENT_TIMESTAMP AND a.status='PUBLISHED' AND a.registration_deadline>CURRENT_TIMESTAMP AND a.start_at>CURRENT_TIMESTAMP)",Boolean.class,((String)r.get("dedupe_key")).replaceFirst("^waitlist:",""),user));
    if(kind.equals("PRETRIP")||kind.equals("ACTIVITY_CHANGED"))return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM activity a JOIN registration r ON r.activity_id=a.id WHERE a.id=? AND r.user_id=? AND r.status='CONFIRMED' AND a.status='PUBLISHED' AND a.start_at>CURRENT_TIMESTAMP AND a.start_at=? )",Boolean.class,activity,user,r.get("event_at"))) && (!kind.equals("ACTIVITY_CHANGED")||!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM notification_outbox WHERE activity_id=? AND user_id=? AND kind='ACTIVITY_CHANGED' AND created_at>?)",Boolean.class,activity,user,r.get("created_at"))));
    if(kind.equals("ACTIVITY_CANCELLED"))return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM activity WHERE id=? AND status='CANCELLED')",Boolean.class,activity));
    return false;
  }
  public void dispatch(String id){
    Map<String,Object> row=tx.execute(s->{
      var rows=db.queryForList("SELECT * FROM notification_outbox WHERE id=? AND status IN ('PENDING','FAILED') AND attempts<3 AND next_attempt_at<=CURRENT_TIMESTAMP FOR UPDATE SKIP LOCKED",id);if(rows.isEmpty())return null;
      var r=rows.getFirst();String user=(String)r.get("user_id");
      if(!relevant(r)){db.update("UPDATE notification_outbox SET status='OBSOLETE',last_error='活动或候补状态已变化，无需发送',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);return null;}
      if(!gateway.ready()){db.update("UPDATE notification_outbox SET status='UNCONFIGURED',last_error='订阅消息尚未配置',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);return null;}
      if(db.update("UPDATE notification_permission SET credits=credits-1 WHERE user_id=? AND credits>0",user)==0){db.update("UPDATE notification_outbox SET status='NO_PERMISSION',last_error='请在小程序订阅提醒',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);return null;}
      db.update("UPDATE notification_outbox SET status='SENDING',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",id);return r;
    });
    if(row==null)return;
    String external=db.queryForObject("SELECT external_id FROM app_user WHERE id=?",String.class,row.get("user_id"));
    WechatNotificationGateway.Result result;
    if(external==null||!external.startsWith("wechat:"))result=new WechatNotificationGateway.Result("FAILED","该账号不是微信用户",false);
    else result=gateway.send(external.substring(7),(String)row.get("activity_id"),(String)row.get("title"),(String)row.get("detail"),row.get("event_at") instanceof OffsetDateTime at ? at : ((java.sql.Timestamp)row.get("event_at")).toInstant().atOffset(java.time.ZoneOffset.UTC));
    var finalResult=result;
    tx.executeWithoutResult(s->{
      int changed=db.update("UPDATE notification_outbox SET status=?,last_error=?,next_attempt_at=CASE WHEN ? THEN CURRENT_TIMESTAMP+INTERVAL '5 minutes' ELSE 'infinity'::timestamptz END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='SENDING'",finalResult.status(),finalResult.error(),finalResult.retryable(),id);
      if(changed>0&&finalResult.status().equals("FAILED"))db.update("UPDATE notification_permission SET credits=LEAST(credits+1,3) WHERE user_id=?",row.get("user_id"));
    });
  }
  public void scan(){
    db.update("UPDATE notification_outbox SET status='UNKNOWN',last_error='发送进程中断，结果需人工核对',updated_at=CURRENT_TIMESTAMP WHERE status='SENDING' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '5 minutes'");
    for(String id:db.queryForList("SELECT id FROM notification_outbox WHERE status IN ('PENDING','FAILED') AND attempts<3 AND next_attempt_at<=CURRENT_TIMESTAMP ORDER BY created_at LIMIT 50",String.class))dispatch(id);
  }
}
