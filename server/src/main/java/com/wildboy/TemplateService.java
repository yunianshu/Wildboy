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
  public record Input(@NotBlank @Size(max=120) String name, String sourceId, @Min(0) Long sourceVersion, Long version) {}
  public record ContentInput(
      @NotBlank @Size(max=120) String name, @NotNull @Min(0) Long version,
      @NotBlank @Size(max=120) String title, @NotNull Category category,
      @NotBlank @Size(max=300) String summary, @NotBlank @Size(max=20000) String description,
      @NotBlank @Size(max=200) String location, @NotBlank @Size(max=200) String meetingPoint,
      @NotBlank @Size(max=2048) String coverUrl,
      @NotNull @Size(max=12) List<@NotBlank @Size(max=2048) String> galleryUrls,
      @NotNull @Min(1) @Max(10000) Integer capacity,
      @NotNull @Min(0) @Max(100000000) Integer priceCents, @NotNull Boolean identityRequired,
      @Min(1) @Max(1051200) Integer durationMinutes,
      @Min(0) @Max(1051200) Integer deadlineLeadMinutes) {}
  public record Generate(@NotEmpty @Size(max=12) List<@NotNull OffsetDateTime> starts, @NotNull @Min(0) Long version) {}
  public record Copy(@NotNull OffsetDateTime startAt, @NotBlank @Size(max=80) String requestId, @NotNull @Min(0) Long version, Boolean publishImmediately) {
    @com.fasterxml.jackson.annotation.JsonCreator
    public Copy {}
    public Copy(OffsetDateTime startAt, String requestId, Long version) {
      this(startAt, requestId, version, false);
    }
  }
  final JdbcTemplate db; final ActivityService activities; final ObjectMapper json;
  public TemplateService(JdbcTemplate db, ActivityService activities, ObjectMapper json) { this.db=db;this.activities=activities;this.json=json; }
  ActivityInput snapshot(Activity a) { return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),a.startAt(),a.endAt(),a.registrationDeadline(),a.capacity(),a.priceCents(),null,a.identityRequired(),a.boardingPoints(),a.navigationPoints()); }
  String encode(ActivityInput input) { try { return json.writeValueAsString(input); } catch(Exception e) { throw new IllegalStateException(e); } }
  ActivityInput decode(String value) { try { return json.readValue(value,ActivityInput.class); } catch(Exception e) { throw new IllegalStateException(e); } }
  Template map(java.sql.ResultSet r,int row) throws java.sql.SQLException { return new Template(r.getString("id"),r.getString("name"),decode(r.getString("payload")),r.getLong("version")); }
  public Page<Template> list(int page,int size) { ActivityService.pageCheck(page,size);long total=db.queryForObject("SELECT COUNT(*) FROM activity_template",Long.class);return new Page<>(db.query("SELECT * FROM activity_template ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::map,size,page*size),total,page,size,(long)(page+1)*size<total); }
  Template get(String id,boolean lock) { var rows=db.query("SELECT * FROM activity_template WHERE id=?"+(lock?" FOR UPDATE":""),this::map,id);if(rows.isEmpty())throw ApiException.notFound();return rows.getFirst(); }
  @Transactional public Template save(String id,Input input,String actor) {
    if(id!=null && get(id,true).version()!=Objects.requireNonNullElse(input.version(),-1L))throw ApiException.conflict("STALE_VERSION","模板已更新，请刷新");
    if (input.sourceId() == null || input.sourceId().isBlank()) {
      if (id == null) throw new ApiException(400, "SOURCE_REQUIRED", "请选择来源活动");
      db.update("UPDATE activity_template SET name=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          input.name().strip(), id);
      activities.audit(actor,id,"TEMPLATE_SAVE");
      return get(id,false);
    }
    if (input.sourceVersion() == null) throw new ApiException(400, "SOURCE_VERSION_REQUIRED", "请重新读取来源活动");
    Activity source=activities.get(input.sourceId(),true);activities.checkVersion(source,input.sourceVersion());
    var rich = rich(source.id());
    if(id==null){id=UUID.randomUUID().toString();db.update("INSERT INTO activity_template(id,name,payload,rich_blocks,rich_markdown) VALUES (?,?,?,?,?)",id,input.name().strip(),encode(snapshot(source)),rich.blocks(),rich.markdown());}
    else db.update("UPDATE activity_template SET name=?,payload=?,rich_blocks=?,rich_markdown=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.name().strip(),encode(snapshot(source)),rich.blocks(),rich.markdown(),id);
    activities.audit(actor,id,"TEMPLATE_SAVE");return get(id,false);
  }
  @Transactional public Template updateContent(String id, ContentInput input, String actor) {
    var current = get(id, true);
    if (current.version() != input.version())
      throw ApiException.conflict("STALE_VERSION", "模板已更新，请刷新");
    var previous = current.activity();
    var start = previous.startAt();
    var end = input.durationMinutes() == null
        ? previous.endAt() : start.plusMinutes(input.durationMinutes());
    var deadline = input.deadlineLeadMinutes() == null
        ? previous.registrationDeadline() : start.minusMinutes(input.deadlineLeadMinutes());
    var updated = new ActivityInput(
        input.title().strip(), input.category(), input.coverUrl().strip(),
        input.galleryUrls().stream().map(String::strip).toList(),
        input.summary().strip(), input.description(), input.location().strip(), input.meetingPoint().strip(),
        start, end, deadline, input.capacity(), input.priceCents(), null, input.identityRequired(),
        previous.boardingPoints(), previous.navigationPoints());
    activities.validate(updated);
    // Change only the snapshot. Keep rich blocks, source and created drafts intact.
    db.update("UPDATE activity_template SET name=?,payload=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        input.name().strip(), encode(updated), id);
    activities.audit(actor, id, "TEMPLATE_SAVE");
    return get(id, false);
  }

  @Transactional public void delete(String id, long version, String actor) {
    if (get(id, true).version() != version)
      throw ApiException.conflict("STALE_VERSION", "模板已更新，请刷新");
    db.update("DELETE FROM activity_template WHERE id=?", id);
    activities.audit(actor, id, "TEMPLATE_DELETE");
  }
  private record RichSnapshot(String blocks, String markdown) {}
  private RichSnapshot rich(String id) {
    var rows = db.query("SELECT blocks,markdown FROM rich_content WHERE entity_type='activity' AND entity_id=?",
        (rs,n) -> new RichSnapshot(rs.getString("blocks"),rs.getString("markdown")),id);
    return rows.isEmpty() ? new RichSnapshot("[]",null) : rows.getFirst();
  }
  private RichSnapshot templateRich(String id) {
    return db.queryForObject("SELECT rich_blocks,rich_markdown FROM activity_template WHERE id=?",
        (rs,n) -> new RichSnapshot(rs.getString("rich_blocks"),rs.getString("rich_markdown")),id);
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
    if(duration<=0 || lead<0)throw new ApiException(400,"INVALID_DATES","模板时间无效");
    OffsetDateTime deadline=start.minusSeconds(lead);
    if(!deadline.isAfter(OffsetDateTime.now()))throw new ApiException(400,"INVALID_DATES","新活动的报名截止时间已过，请调整开始时间");
    return new ActivityInput(a.title(),a.category(),a.coverUrl(),a.galleryUrls(),a.summary(),a.description(),a.location(),a.meetingPoint(),start,start.plusSeconds(duration),deadline,a.capacity(),a.priceCents(),null,a.identityRequired(),a.boardingPoints(),a.navigationPoints());
  }
  private Activity createDraft(ActivityInput input,String actor) {
    // Sources/templates are server-owned snapshots; preserve their base price without
    // relaxing the public creation DTO or publishing a copied activity automatically.
    if(input.priceCents()<0 || input.priceCents()>100000000)throw new ApiException(400,"INVALID_PRICE","模板价格超出范围");
    var draft=activities.insertDraft(input,actor);
    if(input.priceCents()==0)return draft;
    db.update("UPDATE activity SET price_cents=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.priceCents(),draft.id());
    return activities.get(draft.id(),true);
  }
  @Transactional public List<Activity> generate(String id,Generate input,String actor) {
    Template template=get(id,true);if(template.version()!=input.version())throw ApiException.conflict("STALE_VERSION","模板已更新，请刷新");
    if(input.starts().stream().map(t->t.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS)).distinct().count()!=input.starts().size())throw new ApiException(400,"DUPLICATE_DATES","生成日期不能重复");
    // Validate all before creating any rows; the transaction also rolls back on late failures.
    var shifted=input.starts().stream().map(t->shifted(template.activity(),t)).toList();var result=new ArrayList<Activity>();
    var snapshot=templateRich(id);
    for(int n=0;n<input.starts().size();n++) {
      var start=shifted.get(n).startAt();var prior=db.queryForList("SELECT activity_id FROM activity_generation WHERE template_id=? AND start_at=?",String.class,id,start);
      if(!prior.isEmpty()){result.add(activities.get(prior.getFirst(),true));continue;}
      var a=createDraft(shifted.get(n),actor);copyRich(a.id(),snapshot);db.update("INSERT INTO activity_generation(template_id,start_at,activity_id) VALUES (?,?,?)",id,start,a.id());result.add(a);
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
    Activity source=activities.get(sourceId,true);activities.checkVersion(source,input.version());var a=createDraft(shifted(snapshot(source),start),actor);
    db.update("INSERT INTO activity_copy_request(actor_id,request_id,source_id,start_at,activity_id) VALUES (?,?,?,?,?)",actor,input.requestId(),sourceId,start,a.id());copyRich(a.id(),rich(source.id()));activities.audit(actor,a.id(),"ACTIVITY_COPY");
    if (Boolean.TRUE.equals(input.publishImmediately())) {
      a = activities.publish(a.id(), a.version(), actor);
    }
    return a;
  }
}
