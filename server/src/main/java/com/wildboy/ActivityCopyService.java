package com.wildboy;

import static com.wildboy.Models.*;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityCopyService {
  public record Copy(@NotNull OffsetDateTime startAt, @NotBlank @Size(max=80) String requestId, @NotNull @Min(0) Long version, Boolean publishImmediately) {
    @com.fasterxml.jackson.annotation.JsonCreator
    public Copy {}
    public Copy(OffsetDateTime startAt, String requestId, Long version) {
      this(startAt, requestId, version, false);
    }
  }
  private final JdbcTemplate db;
  private final ActivityService activities;

  public ActivityCopyService(JdbcTemplate db, ActivityService activities) {
    this.db = db;
    this.activities = activities;
  }

  ActivityInput snapshot(Activity a) { return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),a.startAt(),a.endAt(),a.registrationDeadline(),a.capacity(),a.priceCents(),null,a.identityRequired(),a.boardingPoints(),a.navigationPoints()); }
  private record RichSnapshot(String blocks, String markdown) {}
  private RichSnapshot rich(String id) {
    var rows = db.query("SELECT blocks,markdown FROM rich_content WHERE entity_type='activity' AND entity_id=?",
        (rs,n) -> new RichSnapshot(rs.getString("blocks"),rs.getString("markdown")),id);
    return rows.isEmpty() ? new RichSnapshot("[]",null) : rows.getFirst();
  }
  private void copyRich(String target,RichSnapshot rich) {
    if (rich.markdown()!=null || !"[]".equals(rich.blocks()))
      db.update("INSERT INTO rich_content(entity_type,entity_id,blocks,markdown,version) VALUES ('activity',?,?,?,1)",
          target,rich.blocks(),rich.markdown());
  }
  ActivityInput shifted(ActivityInput a,OffsetDateTime start) {
    start=start.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    if(!start.isAfter(OffsetDateTime.now()) || start.isAfter(OffsetDateTime.now().plusDays(730)))throw new ApiException(400,"INVALID_DATES","请选择未来两年内的开始时间");
    long duration=Duration.between(a.startAt(),a.endAt()).toSeconds(),lead=Duration.between(a.registrationDeadline(),a.startAt()).toSeconds();
    if(duration<=0 || lead<0)throw new ApiException(400,"INVALID_DATES","来源活动时间无效");
    OffsetDateTime deadline=start.minusSeconds(lead);
    if(!deadline.isAfter(OffsetDateTime.now()))throw new ApiException(400,"INVALID_DATES","新活动的报名截止时间已过，请调整开始时间");
    return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),start,start.plusSeconds(duration),deadline,a.capacity(),a.priceCents(),null,a.identityRequired(),a.boardingPoints(),a.navigationPoints());
  }
  private Activity createDraft(ActivityInput input,String actor) {
    // Copy the server-owned source price without
    // relaxing the public creation DTO or publishing a copied activity automatically.
    if(input.priceCents()<0 || input.priceCents()>100000000)throw new ApiException(400,"INVALID_PRICE","来源活动价格超出范围");
    var draft=activities.insertDraft(input,actor);
    if(input.priceCents()==0)return draft;
    db.update("UPDATE activity SET price_cents=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.priceCents(),draft.id());
    return activities.get(draft.id(),true);
  }
  @Transactional public Activity copy(String sourceId,Copy input,String actor) {
    // Per-actor row serializes idempotency without exposing another administrator's requests.
    db.queryForObject("SELECT id FROM app_user WHERE id=? FOR UPDATE",String.class,actor);
    // Use the same precision for the activity and its idempotency record. JDBC otherwise
    // rounds nanoseconds when persisting timestamps, while shifted() truncates them.
    var start=input.startAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    var old=db.queryForList("SELECT source_id,start_at,activity_id FROM activity_copy_request WHERE actor_id=? AND request_id=?",actor,input.requestId());
    if(!old.isEmpty()) { var row=old.getFirst();var at=((java.sql.Timestamp)row.get("start_at")).toInstant();if(!sourceId.equals(row.get("source_id"))||!start.toInstant().equals(at))throw ApiException.conflict("REQUEST_CONFLICT","请求号已用于其他复制操作");return activities.get((String)row.get("activity_id"),true); }
    Activity source=activities.get(sourceId,true);activities.checkVersion(source,input.version());var a=createDraft(shifted(snapshot(source),start),actor);
    db.update("INSERT INTO activity_copy_request(actor_id,request_id,source_id,start_at,activity_id) VALUES (?,?,?,?,?)",actor,input.requestId(),sourceId,start,a.id());copyRich(a.id(),rich(source.id()));activities.audit(actor,a.id(),"ACTIVITY_COPY");
    if (Boolean.TRUE.equals(input.publishImmediately())) {
      a = activities.publish(a.id(), a.version(), actor);
    }
    return a;
  }
}
