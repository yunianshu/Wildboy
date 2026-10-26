package com.wildboy;

import static com.wildboy.Models.*;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityService {
  final JdbcTemplate db;
  final ObjectMapper json;
  final LegalService legal;

  public ActivityService(JdbcTemplate db, ObjectMapper json, LegalService legal) {
    this.db = db;
    this.json = json;
    this.legal = legal;
  }

  final RowMapper<Registration> registrationMapper =
      (r, n) ->
          new Registration(
              r.getString("id"),
              r.getString("activity_id"),
              r.getString("activity_title"),
              r.getString("status"),
              r.getObject("created_at", OffsetDateTime.class),
              r.getString("participant_name"),
              r.getString("phone"));

  Activity map(ResultSet r, int n) throws SQLException {
    try {
      return new Activity(
          r.getString("id"),
          r.getString("title"),
          Category.valueOf(r.getString("category")),
          r.getString("cover_url"),
          json.readValue(r.getString("gallery_urls"), new TypeReference<List<String>>() {}),
          r.getString("summary"),
          r.getString("description"),
          r.getString("location"),
          r.getString("meeting_point"),
          r.getObject("start_at", OffsetDateTime.class),
          r.getObject("end_at", OffsetDateTime.class),
          r.getObject("registration_deadline", OffsetDateTime.class),
          r.getInt("capacity"),
          r.getInt("registered_count"),
          r.getString("status"),
          r.getInt("price_cents"),
          r.getString("currency"),
          r.getLong("version"),
          r.getObject("created_at", OffsetDateTime.class),
          r.getObject("updated_at", OffsetDateTime.class));
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Invalid persisted gallery", e);
    }
  }

  static void pageCheck(int page, int size) {
    if (page < 0 || page > 100000 || size < 1 || size > 50)
      throw new ApiException(400, "INVALID_PAGE", "分页参数超出范围");
  }

  public Page<Activity> list(Category category, int page, int size, boolean admin) {
    return list(category, null, page, size, admin);
  }

  public Page<Activity> list(
      Category category, ActivityStatus status, int page, int size, boolean admin) {
    pageCheck(page, size);
    var args = new ArrayList<Object>();
    String where = admin ? " WHERE 1=1" : " WHERE status='PUBLISHED'";
    if (admin && status != null) {
      where += " AND status=?";
      args.add(status.name());
    }
    if (category != null) {
      where += " AND category=?";
      args.add(category.name());
    }
    long total =
        db.queryForObject("SELECT COUNT(*) FROM activity" + where, Long.class, args.toArray());
    args.add(size);
    args.add(page * size);
    var items =
        db.query(
            "SELECT * FROM activity" + where + " ORDER BY start_at,id LIMIT ? OFFSET ?",
            this::map,
            args.toArray());
    return new Page<>(items, total, page, size, (long) (page + 1) * size < total);
  }

  public Activity get(String id, boolean admin) {
    var items =
        db.query(
            "SELECT * FROM activity WHERE id=?"
                + (admin ? "" : " AND status IN ('PUBLISHED','CANCELLED')"),
            this::map,
            id);
    if (items.isEmpty()) throw ApiException.notFound();
    return items.getFirst();
  }

  Activity lock(String id) {
    var a = db.query("SELECT * FROM activity WHERE id=? FOR UPDATE", this::map, id);
    if (a.isEmpty()) throw ApiException.notFound();
    return a.getFirst();
  }

  void validate(ActivityInput i) {
    if (!i.endAt().isAfter(i.startAt()) || i.registrationDeadline().isAfter(i.startAt()))
      throw new ApiException(400, "INVALID_DATES", "结束时间应晚于开始时间，报名截止不得晚于开始时间");
    validateUrl(i.coverUrl());
    if (i.galleryUrls() != null) i.galleryUrls().forEach(this::validateUrl);
  }

  void validateUrl(String value) {
    if (value.startsWith("/assets/")
        && !value.contains("..")
        && !value.contains("\\")
        && !value.contains("?")
        && !value.contains("#")) return;
    try {
      URI u = URI.create(value);
      if ("https".equals(u.getScheme()) && u.getHost() != null && u.getUserInfo() == null) return;
    } catch (IllegalArgumentException ignored) {
    }
    throw new ApiException(400, "INVALID_IMAGE_URL", "图片须使用 HTTPS 或 /assets/ 路径");
  }

  String gallery(ActivityInput i) {
    try {
      return json.writeValueAsString(i.galleryUrls() == null ? List.of() : i.galleryUrls());
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid gallery");
    }
  }

  @Transactional
  public Activity create(ActivityInput i, String actor) {
    validate(i);
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO"
            + " activity(id,title,category,cover_url,gallery_urls,summary,description,location,meeting_point,start_at,end_at,registration_deadline,capacity,status,price_cents)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',0)",
        id,
        i.title().strip(),
        i.category().name(),
        i.coverUrl(),
        gallery(i),
        i.summary().strip(),
        i.description(),
        i.location().strip(),
        i.meetingPoint().strip(),
        i.startAt(),
        i.endAt(),
        i.registrationDeadline(),
        i.capacity());
    audit(actor, id, "ACTIVITY_CREATE");
    return get(id, true);
  }

  @Transactional
  public Activity edit(String id, ActivityInput i, String actor) {
    validate(i);
    Activity a = lock(id);
    checkVersion(a, i.version());
    if (a.status().equals("CANCELLED"))
      throw ApiException.conflict("ACTIVITY_CANCELLED", "已取消活动不能编辑");
    if (a.registeredCount() > i.capacity())
      throw ApiException.conflict("CAPACITY_BELOW_ENROLLED", "人数上限不能小于已报名人数");
    if (a.status().equals("PUBLISHED")
        && (!a.startAt().isAfter(OffsetDateTime.now())
            || !i.startAt().isAfter(OffsetDateTime.now())))
      throw ApiException.conflict("ACTIVITY_STARTED", "已开始活动不能修改");
    db.update(
        "UPDATE activity SET"
            + " title=?,category=?,cover_url=?,gallery_urls=?,summary=?,description=?,location=?,meeting_point=?,start_at=?,end_at=?,registration_deadline=?,capacity=?,version=version+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE id=?",
        i.title().strip(),
        i.category().name(),
        i.coverUrl(),
        gallery(i),
        i.summary().strip(),
        i.description(),
        i.location().strip(),
        i.meetingPoint().strip(),
        i.startAt(),
        i.endAt(),
        i.registrationDeadline(),
        i.capacity(),
        id);
    audit(actor, id, "ACTIVITY_EDIT");
    return get(id, true);
  }

  void checkVersion(Activity a, Long v) {
    if (v == null || v != a.version())
      throw ApiException.conflict("STALE_VERSION", "活动已被修改，请刷新后重试");
  }

  @Transactional
  public Activity publish(String id, long version, String actor) {
    Activity a = lock(id);
    checkVersion(a, version);
    if (!a.status().equals("DRAFT")) throw ApiException.conflict("INVALID_STATE", "只有草稿可以发布");
    if (!a.registrationDeadline().isAfter(OffsetDateTime.now())
        || !a.startAt().isAfter(OffsetDateTime.now()))
      throw ApiException.conflict("ACTIVITY_EXPIRED", "请设置未来的活动与报名截止时间");
    db.update(
        "UPDATE activity SET status='PUBLISHED',version=version+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE id=?",
        id);
    audit(actor, id, "ACTIVITY_PUBLISH");
    return get(id, true);
  }

  @Transactional
  public Activity cancel(String id, long version, String actor) {
    Activity a = lock(id);
    checkVersion(a, version);
    if (a.status().equals("CANCELLED")) return a;
    if (!a.startAt().isAfter(OffsetDateTime.now()))
      throw ApiException.conflict("ACTIVITY_STARTED", "已开始活动不能取消");
    db.update(
        "UPDATE registration SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE"
            + " activity_id=? AND status='CONFIRMED'",
        id);
    db.update(
        "UPDATE activity SET"
            + " status='CANCELLED',registered_count=0,version=version+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE id=?",
        id);
    audit(actor, id, "ACTIVITY_CANCEL");
    return get(id, true);
  }

  public Registration own(String id, String user) {
    return db
        .query(
            "SELECT r.*,a.title AS activity_title FROM registration r JOIN activity a ON"
                + " a.id=r.activity_id WHERE r.activity_id=? AND r.user_id=? AND"
                + " r.status='CONFIRMED'",
            registrationMapper,
            id,
            user)
        .stream()
        .findFirst()
        .orElse(null);
  }

  void enrollmentOpen(Activity a) {
    if (!a.status().equals("PUBLISHED")
        || !a.registrationDeadline().isAfter(OffsetDateTime.now())
        || !a.startAt().isAfter(OffsetDateTime.now()))
      throw ApiException.conflict("REGISTRATION_CLOSED", "活动报名已关闭");
  }

  @Transactional
  public RegisterResult register(String id, String user, RegistrationInput input) {
    legal.requireCurrent(input.privacyVersion(), input.termsVersion());
    Activity a = lock(id);
    if (a.status().equals("DRAFT")) throw ApiException.notFound();
    Registration existing = own(id, user);
    if (existing != null) {
      legal.accept(user, input.privacyVersion(), input.termsVersion(), "REGISTRATION");
      return new RegisterResult(existing, false);
    }
    enrollmentOpen(a);
    if (a.registeredCount() >= a.capacity()) throw ApiException.conflict("ACTIVITY_FULL", "活动名额已满");
    var previous =
        db.queryForList(
            "SELECT id FROM registration WHERE activity_id=? AND user_id=?",
            String.class,
            id,
            user);
    if (previous.isEmpty())
      db.update(
          "INSERT INTO registration(id,activity_id,user_id,participant_name,phone,status)"
              + " VALUES(?,?,?,?,?,'CONFIRMED')",
          UUID.randomUUID().toString(),
          id,
          user,
          input.participantName().strip(),
          input.phone().strip());
    else
      db.update(
          "UPDATE registration SET"
              + " status='CONFIRMED',participant_name=?,phone=?,created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP"
              + " WHERE id=?",
          input.participantName().strip(),
          input.phone().strip(),
          previous.getFirst());
    db.update(
        "UPDATE activity SET"
            + " registered_count=registered_count+1,version=version+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE id=?",
        id);
    legal.accept(user, input.privacyVersion(), input.termsVersion(), "REGISTRATION");
    audit(user, id, "REGISTER");
    return new RegisterResult(own(id, user), true);
  }

  @Transactional
  public void cancelOwn(String id, String user) {
    Activity a = lock(id);
    if (own(id, user) == null) return;
    enrollmentOpen(a);
    db.update(
        "UPDATE registration SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE"
            + " activity_id=? AND user_id=?",
        id,
        user);
    db.update(
        "UPDATE activity SET"
            + " registered_count=registered_count-1,version=version+1,updated_at=CURRENT_TIMESTAMP"
            + " WHERE id=?",
        id);
    audit(user, id, "UNREGISTER");
  }

  public Page<Registration> registrations(String user, String activity, int page, int size) {
    return registrations(user, activity, null, page, size);
  }

  public Page<Registration> registrations(
      String user, String activity, RegistrationStatus status, int page, int size) {
    pageCheck(page, size);
    String where = user != null ? "r.user_id=?" : "r.activity_id=?";
    var args = new ArrayList<Object>();
    args.add(user != null ? user : activity);
    if (status != null) {
      where += " AND r.status=?";
      args.add(status.name());
    }
    long total =
        db.queryForObject(
            "SELECT COUNT(*) FROM registration r WHERE " + where, Long.class, args.toArray());
    args.add(size);
    args.add(page * size);
    var items =
        db.query(
            "SELECT r.*,a.title AS activity_title FROM registration r JOIN activity a ON"
                + " a.id=r.activity_id WHERE "
                + where
                + " ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?",
            registrationMapper,
            args.toArray());
    return new Page<>(items, total, page, size, (long) (page + 1) * size < total);
  }

  void audit(String actor, String entity, String action) {
    db.update(
        "INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",
        UUID.randomUUID().toString(),
        actor,
        entity,
        action);
  }
}
