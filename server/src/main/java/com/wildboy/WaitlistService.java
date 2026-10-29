package com.wildboy;

import static com.wildboy.Models.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WaitlistService {
  final LegalService legal;final IdentityProtection identity;final JdbcTemplate db; final ActivityService activities; final NotificationService notifications; final ObjectMapper json;
  public record Entry(String id,String activityId,String activityTitle,String status,int partySize,OffsetDateTime offerExpiresAt,OffsetDateTime createdAt) {}
  public WaitlistService(JdbcTemplate db,ActivityService activities,NotificationService notifications,ObjectMapper json,LegalService legal,IdentityProtection identity) {this.legal=legal;this.identity=identity;this.db=db;this.activities=activities;this.notifications=notifications;this.json=json;}
  Entry map(java.sql.ResultSet r,int n) throws java.sql.SQLException { return new Entry(r.getString("id"),r.getString("activity_id"),r.getString("title"),r.getString("status"),r.getInt("party_size"),r.getObject("offer_expires_at",OffsetDateTime.class),r.getObject("created_at",OffsetDateTime.class)); }
  Entry entry(String id,String user) {return db.query("SELECT w.*,a.title FROM activity_waitlist w JOIN activity a ON a.id=w.activity_id WHERE w.id=? AND w.user_id=?",this::map,id,user).stream().findFirst().orElseThrow(ApiException::notFound);}
  public Page<Entry> mine(String user,int page,int size) { ActivityService.pageCheck(page,size); long total=db.queryForObject("SELECT COUNT(*) FROM activity_waitlist WHERE user_id=?",Long.class,user); return new Page<>(db.query("SELECT w.*,a.title FROM activity_waitlist w JOIN activity a ON a.id=w.activity_id WHERE w.user_id=? ORDER BY w.created_at DESC,w.id LIMIT ? OFFSET ?",this::map,user,size,page*size),total,page,size,(long)(page+1)*size<total); }
  public Page<Entry> admin(int page,int size) { ActivityService.pageCheck(page,size); long total=db.queryForObject("SELECT COUNT(*) FROM activity_waitlist WHERE status IN ('WAITING','OFFERED')",Long.class);return new Page<>(db.query("SELECT w.*,a.title FROM activity_waitlist w JOIN activity a ON a.id=w.activity_id WHERE w.status IN ('WAITING','OFFERED') ORDER BY w.created_at,w.id LIMIT ? OFFSET ?",this::map,size,page*size),total,page,size,(long)(page+1)*size<total); }
  @Transactional public Entry join(String activityId,String user,RegistrationInput input) {
    legal.requireCurrent(input.privacyVersion(),input.termsVersion());
    Activity a=activities.lock(activityId); activities.enrollmentOpen(a);
    var prior=db.queryForList("SELECT id FROM activity_waitlist WHERE activity_id=? AND user_id=? AND status IN ('WAITING','OFFERED')",String.class,activityId,user);
    if(!prior.isEmpty()) return entry(prior.getFirst(),user);
    if(activities.own(activityId,user)!=null) throw ApiException.conflict("ALREADY_REGISTERED","已报名，无需候补");
    var people=activities.validatedParticipants(input,a.identityRequired());
    if(people.size()>Math.min(100,a.capacity())) throw new ApiException(400,"PARTY_TOO_LARGE","同行人数超过活动容量");
    if(a.identityRequired()) identity.requireReady();
    if(!hasQueue(activityId) && people.size()<=a.capacity()-a.registeredCount()) throw ApiException.conflict("SEATS_AVAILABLE","还有名额，请直接报名");
    if(db.queryForObject("SELECT COUNT(*) FROM activity_waitlist WHERE activity_id=? AND status IN ('WAITING','OFFERED')",Long.class,activityId)>=500) throw ApiException.conflict("WAITLIST_LIMIT","候补队列已满");
    var stored=people.stream().map(p->new ParticipantInput(p.participantName(),identity.encrypt(p.idNumber()),p.phone())).toList();
    String id=UUID.randomUUID().toString();
    try {db.update("INSERT INTO activity_waitlist(id,activity_id,user_id,status,party_size,participants_json,privacy_version,terms_version) VALUES(?,?,?,'WAITING',?,?,?,?)",id,activityId,user,people.size(),json.writeValueAsString(stored),input.privacyVersion(),input.termsVersion());}
    catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("Invalid participants");}
    legal.accept(user,input.privacyVersion(),input.termsVersion(),"REGISTRATION"); activities.audit(user,id,"WAITLIST_JOIN");
    promoteLocked(a); return entry(id,user);
  }
  public boolean hasQueue(String activity) {return db.queryForObject("SELECT COUNT(*) FROM activity_waitlist WHERE activity_id=? AND status IN ('WAITING','OFFERED')",Long.class,activity)>0;}
  public int reserved(String activity) {return db.queryForObject("SELECT COALESCE(SUM(party_size),0) FROM activity_waitlist WHERE activity_id=? AND status='OFFERED'",Integer.class,activity);}
  @Transactional public void promote(String activity) {promoteLocked(activities.lock(activity));}
  void promoteLocked(Activity a) {
    db.update("UPDATE activity_waitlist SET offer_expires_at=LEAST(offer_expires_at,?),updated_at=CURRENT_TIMESTAMP WHERE activity_id=? AND status='OFFERED' AND offer_expires_at>?",a.registrationDeadline(),a.id(),a.registrationDeadline());
    db.update("UPDATE activity_waitlist SET status='EXPIRED',participants_json='[]',updated_at=CURRENT_TIMESTAMP WHERE activity_id=? AND status='OFFERED' AND offer_expires_at<=CURRENT_TIMESTAMP",a.id());
    if(!a.status().equals("PUBLISHED") || !a.registrationDeadline().isAfter(OffsetDateTime.now()) || !a.startAt().isAfter(OffsetDateTime.now())) {
      db.update("UPDATE activity_waitlist SET status=?,participants_json='[]',updated_at=CURRENT_TIMESTAMP WHERE activity_id=? AND status IN ('WAITING','OFFERED')",a.status().equals("CANCELLED")?"CANCELLED":"EXPIRED",a.id()); return;
    }
    int available=a.capacity()-a.registeredCount()-reserved(a.id());
    var waiting=db.queryForList("SELECT id,user_id,party_size FROM activity_waitlist WHERE activity_id=? AND status='WAITING' ORDER BY created_at,id FOR UPDATE",a.id());
    for(var row:waiting) {
      int count=((Number)row.get("party_size")).intValue(); if(count>available) break; // never skip a larger party
      OffsetDateTime deadline=OffsetDateTime.now().plusMinutes(30); if(deadline.isAfter(a.registrationDeadline())) deadline=a.registrationDeadline();
      db.update("UPDATE activity_waitlist SET status='OFFERED',offer_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",deadline,row.get("id"));
      notifications.enqueue((String)row.get("user_id"),a,"WAITLIST_OFFER","waitlist:"+row.get("id"),"候补已有名额，请及时确认",deadline);
      available-=count;
    }
  }
  @Transactional public Registration confirm(String id,String user,LegalModels.ConsentInput input) {
    Entry e=entry(id,user); Activity a=activities.lock(e.activityId()); promoteLocked(a); e=entry(id,user);
    if(e.status().equals("CONFIRMED")) {var r=activities.own(a.id(),user); if(r!=null) return r; throw ApiException.conflict("WAITLIST_CLOSED","报名已取消");}
    if(!e.status().equals("OFFERED")) throw ApiException.conflict("OFFER_NOT_AVAILABLE","候补名额尚未开放或已过期");
    legal.requireCurrent(input.privacyVersion(),input.termsVersion());
    String payload=db.queryForObject("SELECT participants_json FROM activity_waitlist WHERE id=?",String.class,id);
    List<ParticipantInput> people;
    try {people=json.readValue(payload,new TypeReference<List<ParticipantInput>>(){});} catch(Exception ex){throw new IllegalStateException("Invalid waitlist data");}
    var decoded=people.stream().map(p->new ParticipantInput(p.participantName(),identity.reveal(p.idNumber()),p.phone())).toList();
    Registration result=activities.registerPriority(a.id(),user,new RegistrationInput(decoded,input.privacyVersion(),input.termsVersion())).registration();
    db.update("UPDATE activity_waitlist SET status='CONFIRMED',participants_json='[]',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
    activities.audit(user,id,"WAITLIST_CONFIRM"); return result;
  }
  @Transactional public void cancel(String id,String user) {
    Entry e=entry(id,user); Activity a=activities.lock(e.activityId());
    db.update("UPDATE activity_waitlist SET status='CANCELLED',participants_json='[]',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status IN ('WAITING','OFFERED')",id,user);
    promoteLocked(a); activities.audit(user,id,"WAITLIST_CANCEL");
  }
  @Transactional public void activityCancelled(Activity a) {
    for(String user:db.queryForList("SELECT user_id FROM activity_waitlist WHERE activity_id=? AND status IN ('WAITING','OFFERED')",String.class,a.id())) notifications.enqueue(user,a,"ACTIVITY_CANCELLED","cancel-wait:"+a.id()+":"+a.version()+":"+user,"活动已取消",a.startAt());
    db.update("UPDATE activity_waitlist SET status='CANCELLED',participants_json='[]',updated_at=CURRENT_TIMESTAMP WHERE activity_id=? AND status IN ('WAITING','OFFERED')",a.id());
  }
}
