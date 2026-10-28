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
  final IdentityProtection identity;

  public ActivityService(JdbcTemplate db, ObjectMapper json, LegalService legal, IdentityProtection identity) {
    this.db = db;
    this.json = json;
    this.legal = legal;
    this.identity = identity;
  }

  final RowMapper<Registration> registrationMapper =
      (r, n) ->
          new Registration(
              r.getString("id"),
              r.getString("activity_id"),
              r.getString("activity_title"),
              r.getString("status"),
              r.getObject("created_at", OffsetDateTime.class),
              List.of());

  Registration withParticipants(Registration registration, List<Participant> participants) {
    return new Registration(
        registration.id(),
        registration.activityId(),
        registration.activityTitle(),
        registration.status(),
        registration.createdAt(),
        participants);
  }

  Registration attachParticipants(Registration registration) {
    var participants =
        db.query(
            "SELECT * FROM registration_participant WHERE registration_id=? ORDER BY position",
            (r, n) ->
                new Participant(
                    r.getString("id"),
                    r.getString("participant_name"),
                    identity.masked(r.getString("id_number")),
                    r.getString("phone")),
            registration.id());
    return withParticipants(registration, participants);
  }

  List<Registration> attachParticipants(List<Registration> registrations) {
    if (registrations.isEmpty()) return registrations;
    var ids = registrations.stream().map(Registration::id).toList();
    var byRegistration = new HashMap<String, List<Participant>>();
    db.query(
        "SELECT * FROM registration_participant WHERE registration_id IN ("
            + String.join(",", Collections.nCopies(ids.size(), "?"))
            + ") ORDER BY registration_id,position",
        rs -> {
          var participant =
              new Participant(
                  rs.getString("id"),
                  rs.getString("participant_name"),
                  identity.masked(rs.getString("id_number")),
                  rs.getString("phone"));
          byRegistration
              .computeIfAbsent(rs.getString("registration_id"), key -> new ArrayList<>())
              .add(participant);
        },
        ids.toArray());
    return registrations.stream()
        .map(
            registration ->
                withParticipants(
                    registration,
                    byRegistration.getOrDefault(registration.id(), List.of())))
        .toList();
  }

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
          r.getObject("updated_at", OffsetDateTime.class), r.getBoolean("identity_required"));
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
            + " activity(id,title,category,cover_url,gallery_urls,summary,description,location,meeting_point,start_at,end_at,registration_deadline,capacity,status,price_cents,identity_required)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',0,?)",
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
        i.capacity(), Boolean.TRUE.equals(i.identityRequired()));
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
            + " title=?,category=?,cover_url=?,gallery_urls=?,summary=?,description=?,location=?,meeting_point=?,start_at=?,end_at=?,registration_deadline=?,capacity=?,identity_required=?,version=version+1,updated_at=CURRENT_TIMESTAMP"
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
        i.capacity(), i.identityRequired() == null ? a.identityRequired() : i.identityRequired(),
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
        .map(this::attachParticipants)
        .orElse(null);
  }

  void enrollmentOpen(Activity a) {
    if (!a.status().equals("PUBLISHED")
        || !a.registrationDeadline().isAfter(OffsetDateTime.now())
        || !a.startAt().isAfter(OffsetDateTime.now()))
      throw ApiException.conflict("REGISTRATION_CLOSED", "活动报名已关闭");
  }

  List<ParticipantInput> validatedParticipants(RegistrationInput input, boolean required) {
    if (input.participants() == null || input.participants().isEmpty())
      throw new ApiException(400, "PARTICIPANTS_REQUIRED", "请至少填写一位参与人");
    var normalized = new ArrayList<ParticipantInput>();
    var idNumbers = new HashSet<String>();
    for (ParticipantInput participant : input.participants()) {
      if (participant == null)
        throw new ApiException(400, "INVALID_PARTICIPANT", "参与人信息不完整");
      String name = participant.participantName() == null ? "" : participant.participantName().strip();
      String idNumber = participant.idNumber() == null ? "" : participant.idNumber().strip().toUpperCase(Locale.ROOT);
      String phone = participant.phone() == null ? "" : participant.phone().strip();
      if (name.length() < 2 || name.length() > 80)
        throw new ApiException(400, "INVALID_PARTICIPANT_NAME", "参与人姓名须为 2–80 字");
      if (!phone.matches("[+0-9][0-9 ()-]{5,28}"))
        throw new ApiException(400, "INVALID_PARTICIPANT_PHONE", "参与人手机号格式不正确");
      if (!required && !idNumber.isEmpty())
        throw new ApiException(400, "IDENTITY_NOT_REQUIRED", "本活动不采集身份证号，请刷新报名页面");
      if (required && !validIdNumber(idNumber))
        throw new ApiException(400, "INVALID_ID_NUMBER", "请填写有效的 18 位身份证号");
      if (!idNumber.isEmpty() && !idNumbers.add(idNumber))
        throw new ApiException(400, "DUPLICATE_PARTICIPANT", "同一报名中身份证号不能重复");
      normalized.add(new ParticipantInput(name, idNumber, phone));
    }
    return normalized;
  }

  boolean validIdNumber(String value) {
    if (!value.matches("[0-9]{17}[0-9X]")) return false;
    try {
      java.time.LocalDate.of(
          Integer.parseInt(value.substring(6, 10)),
          Integer.parseInt(value.substring(10, 12)),
          Integer.parseInt(value.substring(12, 14)));
    } catch (java.time.DateTimeException | NumberFormatException e) {
      return false;
    }
    int[] weights = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
    int sum = 0;
    for (int index = 0; index < weights.length; index++)
      sum += (value.charAt(index) - '0') * weights[index];
    return "10X98765432".charAt(sum % 11) == value.charAt(17);
  }

  @Transactional
  public RegisterResult register(String id, String user, RegistrationInput input) {
    legal.requireCurrent(input.privacyVersion(), input.termsVersion());
    Activity a = lock(id);
    if (a.status().equals("DRAFT")) throw ApiException.notFound();
    var participants = validatedParticipants(input, a.identityRequired());
    Registration existing = own(id, user);
    if (existing != null) {
      legal.accept(user, input.privacyVersion(), input.termsVersion(), "REGISTRATION");
      return new RegisterResult(existing, false);
    }
    enrollmentOpen(a);
    if (a.identityRequired()) identity.requireReady();
    if (participants.size() > a.capacity() - a.registeredCount())
      throw ApiException.conflict("ACTIVITY_FULL", "名额已满或剩余名额不足，请减少参与人数后重试");
    var previous =
        db.queryForList(
            "SELECT id FROM registration WHERE activity_id=? AND user_id=?",
            String.class,
            id,
            user);
    String registrationId = previous.isEmpty() ? UUID.randomUUID().toString() : previous.getFirst();
    if (previous.isEmpty())
      db.update(
          "INSERT INTO registration(id,activity_id,user_id,status) VALUES(?,?,?,'CONFIRMED')",
          registrationId,
          id,
          user);
    else
      db.update(
          "UPDATE registration SET status='CONFIRMED',created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          registrationId);
    db.update("DELETE FROM registration_participant WHERE registration_id=?", registrationId);
    for (int index = 0; index < participants.size(); index++) {
      ParticipantInput participant = participants.get(index);
      db.update(
          "INSERT INTO registration_participant(id,registration_id,participant_name,id_number,phone,position) VALUES(?,?,?,?,?,?)",
          UUID.randomUUID().toString(),
          registrationId,
          participant.participantName(),
          identity.encrypt(participant.idNumber()),
          participant.phone(),
          index);
    }
    db.update(
        "UPDATE activity SET registered_count=registered_count+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        participants.size(),
        id);
    legal.accept(user, input.privacyVersion(), input.termsVersion(), "REGISTRATION");
    audit(user, id, "REGISTER");
    return new RegisterResult(own(id, user), true);
  }

  @Transactional
  public void cancelOwn(String id, String user) {
    Activity a = lock(id);
    Registration existing = own(id, user);
    if (existing == null) return;
    enrollmentOpen(a);
    db.update(
        "UPDATE registration SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE"
            + " activity_id=? AND user_id=?",
        id,
        user);
    db.update(
        "UPDATE activity SET registered_count=registered_count-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        existing.participants().size(),
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
    return new Page<>(
        attachParticipants(items), total, page, size, (long) (page + 1) * size < total);
  }

  /** Explicit operator-run, bounded migration. No background data deletion. */
  @Transactional
  public Map<String, Integer> encryptLegacyIdentities(String actor) {
    identity.requireReady();
    var rows = db.queryForList("SELECT id,id_number FROM registration_participant WHERE id_number<>'' AND id_number NOT LIKE 'enc:%' ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED");
    for (var row : rows) {
      db.update("UPDATE registration_participant SET id_number=? WHERE id=?",identity.encrypt((String)row.get("id_number")),row.get("id"));
    }
    audit(actor, "participant-identity", "IDENTITY_ENCRYPT_LEGACY_BATCH");
    return Map.of("encrypted", rows.size());
  }

  @Transactional
  public Participant revealParticipant(String activityId, String participantId, String actor) {
    var rows = db.query("SELECT p.* FROM registration_participant p JOIN registration r ON r.id=p.registration_id WHERE r.activity_id=? AND p.id=?", (r,n) -> new Participant(r.getString("id"),r.getString("participant_name"),identity.reveal(r.getString("id_number")),r.getString("phone")), activityId, participantId);
    if (rows.isEmpty()) throw ApiException.notFound();
    audit(actor, participantId, "PARTICIPANT_IDENTITY_REVEAL");
    return rows.getFirst();
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
