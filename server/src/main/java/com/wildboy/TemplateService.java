package com.wildboy;

import static com.wildboy.Models.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TemplateService {
  public record Template(String id, String name, ActivityInput activity, long version) {}
  public record Input(@NotBlank @Size(max=120) String name, @NotBlank String sourceId, @NotNull @Min(0) Long sourceVersion, Long version) {}
  public record Generate(@NotEmpty @Size(max=12) List<@NotNull OffsetDateTime> starts, @NotNull @Min(0) Long version) {}
  public record Copy(@NotNull OffsetDateTime startAt, @NotBlank @Size(max=80) String requestId, @NotNull @Min(0) Long version) {}
  final JdbcTemplate db; final ActivityService activities; final ObjectMapper json;
  public TemplateService(JdbcTemplate db, ActivityService activities, ObjectMapper json) { this.db=db;this.activities=activities;this.json=json; }
  ActivityInput snapshot(Activity a) { return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),a.startAt(),a.endAt(),a.registrationDeadline(),a.capacity(),0,null,a.identityRequired()); }
  String encode(ActivityInput input) { try { return json.writeValueAsString(input); } catch(Exception e) { throw new IllegalStateException(e); } }
  ActivityInput decode(String value) { try { return json.readValue(value,ActivityInput.class); } catch(Exception e) { throw new IllegalStateException(e); } }
  Template map(java.sql.ResultSet r,int row) throws java.sql.SQLException { return new Template(r.getString("id"),r.getString("name"),decode(r.getString("payload")),r.getLong("version")); }
  public Page<Template> list(int page,int size) { ActivityService.pageCheck(page,size);long total=db.queryForObject("SELECT COUNT(*) FROM activity_template",Long.class);return new Page<>(db.query("SELECT * FROM activity_template ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::map,size,page*size),total,page,size,(long)(page+1)*size<total); }
  Template get(String id,boolean lock) { var rows=db.query("SELECT * FROM activity_template WHERE id=?"+(lock?" FOR UPDATE":""),this::map,id);if(rows.isEmpty())throw ApiException.notFound();return rows.getFirst(); }
  @Transactional public Template save(String id,Input input,String actor) {
    if(id!=null && get(id,true).version()!=Objects.requireNonNullElse(input.version(),-1L))throw ApiException.conflict("STALE_VERSION","模板已更新，请刷新");
    Activity source=activities.get(input.sourceId(),true);activities.checkVersion(source,input.sourceVersion());
    if(id==null){id=UUID.randomUUID().toString();db.update("INSERT INTO activity_template(id,name,payload,rich_blocks) VALUES (?,?,?,?)",id,input.name().strip(),encode(snapshot(source)),rich(source.id()));}
    else db.update("UPDATE activity_template SET name=?,payload=?,rich_blocks=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.name().strip(),encode(snapshot(source)),rich(source.id()),id);
    activities.audit(actor,id,"TEMPLATE_SAVE");return get(id,false);
  }
  String rich(String id) { var rows=db.queryForList("SELECT blocks FROM rich_content WHERE entity_type='activity' AND entity_id=?",String.class,id);return rows.isEmpty()?"[]":rows.getFirst(); }
  void copyRich(String target,String blocks) { if(!"[]".equals(blocks)) db.update("INSERT INTO rich_content(entity_type,entity_id,blocks,version) VALUES ('activity',?,?,1)",target,blocks); }
  ActivityInput shifted(ActivityInput a,OffsetDateTime start) {
    start=start.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    if(!start.isAfter(OffsetDateTime.now()) || start.isAfter(OffsetDateTime.now().plusDays(730)))throw new ApiException(400,"INVALID_DATES","请选择未来两年内的开始时间");
    long duration=Duration.between(a.startAt(),a.endAt()).toSeconds(),lead=Duration.between(a.registrationDeadline(),a.startAt()).toSeconds();
    if(duration<=0 || lead<0)throw new ApiException(400,"INVALID_DATES","模板时间无效");
    OffsetDateTime deadline=start.minusSeconds(lead);
    if(!deadline.isAfter(OffsetDateTime.now()))throw new ApiException(400,"INVALID_DATES","新活动的报名截止时间已过，请调整开始时间");
    return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),start,start.plusSeconds(duration),deadline,a.capacity(),0,null,a.identityRequired());
  }
  @Transactional public List<Activity> generate(String id,Generate input,String actor) {
    Template template=get(id,true);if(template.version()!=input.version())throw ApiException.conflict("STALE_VERSION","模板已更新，请刷新");
    if(input.starts().stream().map(t->t.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS)).distinct().count()!=input.starts().size())throw new ApiException(400,"DUPLICATE_DATES","生成日期不能重复");
    // Validate all before creating any rows; the transaction also rolls back on late failures.
    var shifted=input.starts().stream().map(t->shifted(template.activity(),t)).toList();var result=new ArrayList<Activity>();
    for(int n=0;n<input.starts().size();n++) {
      var start=shifted.get(n).startAt();var prior=db.queryForList("SELECT activity_id FROM activity_generation WHERE template_id=? AND start_at=?",String.class,id,start);
      if(!prior.isEmpty()){result.add(activities.get(prior.getFirst(),true));continue;}
      var a=activities.create(shifted.get(n),actor);copyRich(a.id(),db.queryForObject("SELECT rich_blocks FROM activity_template WHERE id=?",String.class,id));db.update("INSERT INTO activity_generation(template_id,start_at,activity_id) VALUES (?,?,?)",id,start,a.id());result.add(a);
    }
    activities.audit(actor,id,"TEMPLATE_GENERATE");return result;
  }
  @Transactional public Activity copy(String sourceId,Copy input,String actor) {
    // Per-actor row serializes idempotency without exposing another administrator's requests.
    db.queryForObject("SELECT id FROM app_user WHERE id=? FOR UPDATE",String.class,actor);
    // Use the same precision for the activity and its idempotency record. JDBC otherwise
    // rounds nanoseconds when persisting timestamps, while shifted() truncates them.
    var start=input.startAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    var old=db.queryForList("SELECT source_id,start_at,activity_id FROM activity_copy_request WHERE actor_id=? AND request_id=?",actor,input.requestId());
    if(!old.isEmpty()) { var row=old.getFirst();var at=((java.sql.Timestamp)row.get("start_at")).toInstant();if(!sourceId.equals(row.get("source_id"))||!start.toInstant().equals(at))throw ApiException.conflict("REQUEST_CONFLICT","请求号已用于其他复制操作");return activities.get((String)row.get("activity_id"),true); }
    Activity source=activities.get(sourceId,true);activities.checkVersion(source,input.version());var a=activities.create(shifted(snapshot(source),start),actor);
    db.update("INSERT INTO activity_copy_request(actor_id,request_id,source_id,start_at,activity_id) VALUES (?,?,?,?,?)",actor,input.requestId(),sourceId,start,a.id());copyRich(a.id(),rich(source.id()));activities.audit(actor,a.id(),"ACTIVITY_COPY");return a;
  }
}
