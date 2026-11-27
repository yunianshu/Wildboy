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
  @org.springframework.beans.factory.annotation.Autowired NotificationService notifications;

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
                    r.getString("phone"), r.getString("boarding_point")),
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
                  rs.getString("phone"), rs.getString("boarding_point"));
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
      int occupied=r.getInt("registered_count"),pending=r.getInt("pending_payment_count");
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
          occupied,
          r.getString("status"),
          r.getInt("price_cents"),
          r.getString("currency"),
          r.getLong("version"),
          r.getObject("created_at", OffsetDateTime.class),
          r.getObject("updated_at", OffsetDateTime.class), r.getBoolean("identity_required"),
          occupied-pending,pending,
          json.readValue(r.getString("boarding_points"), new TypeReference<List<String>>() {}),
          json.readValue(r.getString("navigation_points"), new TypeReference<List<NavigationPoint>>() {}));
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Invalid persisted gallery", e);
    }
  }

  private static final String ACTIVITY_SELECT = """
      SELECT a.*,COALESCE((SELECT SUM(o.party_size) FROM activity_order o
        WHERE o.activity_id=a.id AND o.status='PENDING_PAYMENT'),0) AS pending_payment_count FROM activity a
      """;

  static void pageCheck(int page, int size) {
    if (page < 0 || page > 100000 || size < 1 || size > 50)
      throw new ApiException(400, "INVALID_PAGE", "分页参数超出范围");
  }

  public Page<Activity> list(Category category, int page, int size, boolean admin) {
    return list(category, null, page, size, admin);
  }

  public Page<Activity> list(
      Category category, ActivityStatus status, int page, int size, boolean admin) {
    return list(category, status, null, page, size, admin);
  }

  public Page<Activity> list(
      Category category, ActivityStatus status, String title, int page, int size, boolean admin) {
    return list(category, status, title, null, page, size, admin, false);
  }

  static final String FULL_CAPACITY_FILTER = "registered_count>=capacity";

  public Page<Activity> list(
      Category category, ActivityStatus status, String title, String keyword, int page, int size, boolean admin,
      boolean upcomingFull) {
    pageCheck(page, size);
    var args = new ArrayList<Object>();
    String where = admin ? " WHERE 1=1" : " WHERE status='PUBLISHED'";
    if (admin && status != null) {
      where += " AND status=?";
      args.add(status.name());
    }
    if (admin && upcomingFull) {
      where += " AND status='PUBLISHED' AND start_at>=CURRENT_TIMESTAMP AND " + FULL_CAPACITY_FILTER;
    }
    if (category != null) {
      where += " AND category=?";
      args.add(category.name());
    }
    if (title != null && !title.isBlank()) {
      String term = title.strip();
      if (term.length() > 100)
        throw new ApiException(400, "INVALID_ACTIVITY_TITLE_FILTER", "标题筛选最多 100 个字符");
      where += " AND strpos(lower(title), lower(?)) > 0";
      args.add(term);
    }
    if (keyword != null && !keyword.isBlank()) {
      String term = keyword.strip();
      if (term.length() > 100)
        throw new ApiException(400, "INVALID_ACTIVITY_KEYWORD", "活动搜索最多 100 个字符");
      where += " AND (strpos(lower(title), lower(?)) > 0 OR strpos(lower(location), lower(?)) > 0)";
      args.add(term);
      args.add(term);
    }
    long total =
        db.queryForObject("SELECT COUNT(*) FROM activity" + where, Long.class, args.toArray());
    args.add(size);
    args.add(page * size);
    var items =
        db.query(
            ACTIVITY_SELECT + where + " ORDER BY start_at DESC,id DESC LIMIT ? OFFSET ?",
            this::map,
            args.toArray());
    return new Page<>(items, total, page, size, (long) (page + 1) * size < total);
  }

  public Activity get(String id, boolean admin) {
    var items =
        db.query(
            ACTIVITY_SELECT + " WHERE id=?"
                + (admin ? "" : " AND status IN ('PUBLISHED','CANCELLED')"),
            this::map,
            id);
    if (items.isEmpty()) throw ApiException.notFound();
    return items.getFirst();
  }

  Activity lock(String id) {
    var a = db.query(ACTIVITY_SELECT+" WHERE id=? FOR UPDATE OF a", this::map, id);
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

  private String boardingPointsJson(List<String> points) {
    var normalized = new LinkedHashSet<String>();
    for (String point : points) {
      if (point == null || point.isBlank() || point.length() > 200 || !normalized.add(point.strip()))
        throw new ApiException(400, "INVALID_BOARDING_POINTS", "上车地点须为不重复的有效名称，每项最多 200 字");
    }
    if (normalized.size() > 20)
      throw new ApiException(400, "INVALID_BOARDING_POINTS", "最多可设置 20 个上车地点");
    try {
      return json.writeValueAsString(normalized);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  public List<String> listBoardingPoints() {
    return db.queryForList("SELECT name FROM activity_boarding_point ORDER BY name", String.class);
  }

  public List<BoardingPointLocation> listBoardingPointLocations() {
    return db.query(
        "SELECT name, address, latitude, longitude, display_name FROM activity_boarding_point ORDER BY name",
        (r, n) -> new BoardingPointLocation(
            r.getString("name"),
            r.getString("address") == null ? "" : r.getString("address"),
            r.getObject("latitude", Double.class),
            r.getObject("longitude", Double.class),
            r.getString("display_name")));
  }

  public String saveBoardingPoint(String name) {
    String point = name.strip();
    db.update("INSERT INTO activity_boarding_point(name) VALUES (?) ON CONFLICT (name) DO NOTHING",
        point);
    return point;
  }

  public BoardingPointLocation saveBoardingPointLocation(BoardingPointLocation input) {
    String point = input.name().strip();
    String address = input.address() == null ? "" : input.address().strip();
    validateCoordinates(input.latitude(), input.longitude());
    return db.queryForObject("""
        INSERT INTO activity_boarding_point(name, address, latitude, longitude, display_name)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (name) DO UPDATE SET
          address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
          display_name = CASE WHEN EXCLUDED.display_name IS NOT NULL THEN EXCLUDED.display_name
                              WHEN activity_boarding_point.address = EXCLUDED.address THEN activity_boarding_point.display_name
                              ELSE NULL END
        RETURNING name, address, latitude, longitude, display_name
        """, (r, n) -> new BoardingPointLocation(r.getString("name"), r.getString("address"),
            r.getObject("latitude", Double.class), r.getObject("longitude", Double.class),
            r.getString("display_name")),
        point, address, input.latitude(), input.longitude(),
        input.displayName() == null ? null : input.displayName().strip());
  }

  public void deleteBoardingPointLocation(String name) {
    db.update("DELETE FROM activity_boarding_point WHERE name=?", name);
  }

  private void validateCoordinates(Double lat, Double lng) {
    if ((lat == null) != (lng == null))
      throw new ApiException(400, "INVALID_NAVIGATION_POINT", "导航经纬度须同时填写或同时留空");
    if (lat != null && (!Double.isFinite(lat) || !Double.isFinite(lng)
        || lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0))
      throw new ApiException(400, "INVALID_NAVIGATION_POINT", "导航经纬度超出有效范围");
  }

  private List<NavigationPoint> normalizeNavigationPoints(List<NavigationPoint> points) {
    if (points == null || points.isEmpty()) return List.of();
    if (points.size() > 30)
      throw new ApiException(400, "INVALID_NAVIGATION_POINT", "最多可设置 30 个导航地点");
    var result = new ArrayList<NavigationPoint>();
    for (NavigationPoint p : points) {
      if (p == null || p.kind() == null || !Set.of("DESTINATION", "MEETING", "BOARDING").contains(p.kind()))
        throw new ApiException(400, "INVALID_NAVIGATION_POINT", "导航地点类型无效");
      String label = p.label() == null ? "" : p.label().strip();
      if (label.isEmpty() || label.length() > 200)
        throw new ApiException(400, "INVALID_NAVIGATION_POINT", "导航地点名称须为 1–200 字");
      String address = p.address() == null ? "" : p.address().strip();
      if (address.length() > 300)
        throw new ApiException(400, "INVALID_NAVIGATION_POINT", "导航详细地址最多 300 字");
      validateCoordinates(p.latitude(), p.longitude());
      String pid = (p.id() == null || p.id().isBlank())
          ? UUID.randomUUID().toString()
          : p.id().strip();
      if (pid.length() > 64) pid = pid.substring(0, 64);
      result.add(new NavigationPoint(pid, p.kind(), label, address, p.latitude(), p.longitude()));
    }
    return result;
  }

  private String navigationPointsJson(List<NavigationPoint> normalized) {
    try {
      return json.writeValueAsString(normalized);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  @Transactional
  public Activity create(ActivityInput i, String actor) {
    return insertDraft(i, actor);
  }

  // An activity copy restores its own coordinates without updating shared locations.
  Activity insertDraft(ActivityInput i, String actor) {
    validate(i);
    String id = UUID.randomUUID().toString();
    List<String> points = i.boardingPoints() == null ? List.of() : i.boardingPoints();
    String pointsJson = boardingPointsJson(points);
    List<NavigationPoint> navPoints = normalizeNavigationPoints(i.navigationPoints());
    String navJson = navigationPointsJson(navPoints);
    db.update(
        "INSERT INTO"
            + " activity(id,title,category,cover_url,gallery_urls,summary,description,location,meeting_point,start_at,end_at,registration_deadline,capacity,status,price_cents,identity_required,boarding_points,navigation_points)"
            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',0,?,?,?)",
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
        i.capacity(), Boolean.TRUE.equals(i.identityRequired()),
        pointsJson,
        navJson);
    audit(actor, id, "ACTIVITY_CREATE");
    return get(id, true);
  }

  public boolean hasEnrollmentHistory(String activityId, int registeredCount) {
    if (registeredCount > 0) return true;
    return Boolean.TRUE.equals(db.queryForObject("""
        SELECT EXISTS(SELECT 1 FROM registration WHERE activity_id=?)
            OR EXISTS(SELECT 1 FROM activity_order WHERE activity_id=?)
        """, Boolean.class, activityId, activityId));
  }

  @Transactional
  public Activity edit(String id, ActivityInput i, String actor) {
    validate(i);
    Activity a = lock(id);
    checkVersion(a, i.version());
    // Capacity includes confirmed participants and unpaid reservations.
    if (a.registeredCount() > i.capacity())
      throw ApiException.conflict("CAPACITY_BELOW_ENROLLED", "人数上限不能小于已报名人数");
    if(a.registeredCount()>0&&i.identityRequired()!=null&&i.identityRequired()!=a.identityRequired())
      throw ApiException.conflict("ACTIVITY_IDENTITY_LOCKED","活动已有报名或待付款占位，暂不能更改实名要求");
    OffsetDateTime now = OffsetDateTime.now();
    boolean published = a.status().equals("PUBLISHED");
    boolean wasUpcoming = a.startAt().isAfter(now);
    boolean willBeUpcoming = i.startAt().isAfter(now);
    if (published && wasUpcoming && !willBeUpcoming) {
      throw ApiException.conflict("ACTIVITY_STARTED", "未开始活动的开始时间必须晚于当前时间");
    }
    if (!wasUpcoming && willBeUpcoming) {
      if (hasEnrollmentHistory(id, a.registeredCount())) {
        throw ApiException.conflict("ACTIVITY_HAS_HISTORY", "已开始的活动已有往期报名或订单记录，请点击「换时间重开一期」以保留往期名单");
      }
      if (published && !i.registrationDeadline().isAfter(now)) {
        throw ApiException.conflict("ACTIVITY_EXPIRED", "改期复用时，请将报名截止时间也调整到未来时间");
      }
    }
    List<String> points = i.boardingPoints() == null ? a.boardingPoints() : i.boardingPoints();
    String pointsJson = boardingPointsJson(points);
    List<NavigationPoint> navPoints = i.navigationPoints() == null
        ? a.navigationPoints()
        : normalizeNavigationPoints(i.navigationPoints());
    String navJson = navigationPointsJson(navPoints);
    db.update(
        "UPDATE activity SET"
            + " title=?,category=?,cover_url=?,gallery_urls=?,summary=?,description=?,location=?,meeting_point=?,start_at=?,end_at=?,registration_deadline=?,capacity=?,identity_required=?,boarding_points=?,navigation_points=?,version=version+1,updated_at=CURRENT_TIMESTAMP"
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
        pointsJson,
        navJson,
        id);
    audit(actor, id, "ACTIVITY_EDIT");
    Activity edited = get(id, true);
    if (a.status().equals("PUBLISHED") && (!a.startAt().equals(edited.startAt()) || !a.meetingPoint().equals(edited.meetingPoint()) || !a.location().equals(edited.location()))) notifications.activityNotice(edited, "ACTIVITY_CHANGED", "时间或集合地点已更新，请查看活动");
    return edited;
  }

  @Transactional
  public Activity reopenToDraft(String id, long version, String actor) {
    Activity a = lock(id);
    checkVersion(a, version);
    if (a.status().equals("DRAFT")) return a;
    if (hasEnrollmentHistory(id, a.registeredCount())) {
      throw ApiException.conflict("ACTIVITY_HAS_HISTORY", "该活动已有报名或订单记录，请使用「换时间重开一期」生成新活动");
    }
    db.update(
        "UPDATE activity SET status='DRAFT',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        id);
    audit(actor, id, "ACTIVITY_REOPEN_DRAFT");
    return get(id, true);
  }

  public AttendeeSummary publicAttendees(String id) {
    get(id, false);
    var items = db.query("""
        SELECT u.nickname, COALESCE(u.avatar_url, '') AS avatar_url,
          SUM(s.party_size)::int AS party_size, MIN(s.joined_at) AS joined_at
        FROM (
          SELECT r.user_id, GREATEST((SELECT COUNT(*) FROM registration_participant p WHERE p.registration_id=r.id), 1)::int AS party_size, r.created_at AS joined_at
          FROM registration r
          WHERE r.activity_id=? AND r.status='CONFIRMED'
          UNION ALL
          SELECT o.user_id, o.party_size, o.created_at AS joined_at
          FROM activity_order o
          WHERE o.activity_id=? AND o.status IN ('PAID', 'CONFIRMED_FREE')
        ) s
        JOIN app_user u ON u.id = s.user_id
        GROUP BY u.id, u.nickname, u.avatar_url
        ORDER BY MIN(s.joined_at) ASC, u.id ASC
        """,
        (r, n) -> {
          String nick = r.getString("nickname");
          String cleanNick = (nick == null || nick.isBlank()) ? "山野同行者" : nick.strip();
          return new AttendeeView(
              cleanNick,
              r.getString("avatar_url"),
              r.getInt("party_size"),
              r.getObject("joined_at", OffsetDateTime.class));
        },
        id, id);
    int totalParticipants = items.stream().mapToInt(AttendeeView::partySize).sum();
    return new AttendeeSummary(items, totalParticipants, items.size());
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
    if (db.queryForObject("SELECT COUNT(*) FROM activity_order WHERE activity_id=? AND status IN ('PENDING_PAYMENT','PAID','CONFIRMED_FREE','REFUND_PENDING')", Integer.class, id)>0)
      throw ApiException.conflict("ACTIVITY_HAS_UNSETTLED_ORDERS", "请先关闭未付款订单并完成已付款订单退款，再取消活动");
    notifications.activityNotice(a, "ACTIVITY_CANCELLED", "活动已取消");
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

  void requireRegistrationContact(String user) {
    // Real WeChat accounts confirm their contact before booking; local test identities
    // retain their existing fixture path.
    var account = db.query("SELECT * FROM app_user WHERE id=?", AuthService::mapUser, user)
        .stream().findFirst().orElseThrow(ApiException::notFound);
    if (account.accountSource() == UserModels.AccountSource.WECHAT && !account.profileCompleted())
      throw new ApiException(403, "USER_PROFILE_REQUIRED", "请先完善联系资料后再报名");
  }

  List<ParticipantInput> validatedParticipants(RegistrationInput input, Activity activity) {
    boolean required = activity.identityRequired();
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
      String point = participant.boardingPoint() == null ? "" : participant.boardingPoint().strip();
      if (activity.boardingPoints().isEmpty() ? !point.isEmpty() : !activity.boardingPoints().contains(point))
        throw new ApiException(400, "INVALID_BOARDING_POINT", "每位参与人须选择当前活动提供的上车地点，请刷新报名页后重试");
      normalized.add(new ParticipantInput(name, idNumber, phone, point.isEmpty() ? null : point));
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
    if (a.priceCents()>0) throw ApiException.conflict("PAID_ACTIVITY_ORDER_REQUIRED", "收费活动请使用报名订单入口");
    var participants = validatedParticipants(input, a);
    Registration existing = own(id, user);
    if (existing != null) {
      legal.accept(user, input.privacyVersion(), input.termsVersion(), "REGISTRATION");
      return new RegisterResult(existing, false);
    }
    enrollmentOpen(a);
    requireRegistrationContact(user);
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
          "INSERT INTO registration_participant(id,registration_id,participant_name,id_number,phone,position,boarding_point) VALUES(?,?,?,?,?,?,?)",
          UUID.randomUUID().toString(),
          registrationId,
          participant.participantName(),
          identity.encrypt(participant.idNumber()),
          participant.phone(),
          index,
          participant.boardingPoint());
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
    return registrations(user, activity, status, page, size, null);
  }

  public Page<Registration> registrations(
      String user, String activity, RegistrationStatus status, int page, int size, String participantQuery) {
    pageCheck(page, size);
    var args = new ArrayList<Object>();
    String where = registrationFilter(user, activity, status, participantQuery, args);
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

  private String registrationFilter(
      String user, String activity, RegistrationStatus status, String participantQuery, List<Object> args) {
    String where = user != null ? "r.user_id=?" : "r.activity_id=?";
    args.add(user != null ? user : activity);
    if (status != null) {
      where += " AND r.status=?";
      args.add(status.name());
    }
    if (user == null && participantQuery != null && !participantQuery.isBlank()) {
      String term = participantQuery.strip();
      if (term.length() > 80) throw new ApiException(400, "INVALID_PARTICIPANT_QUERY", "搜索最多 80 个字");
      where += " AND EXISTS (SELECT 1 FROM registration_participant p WHERE p.registration_id=r.id"
          + " AND (strpos(lower(p.participant_name), lower(?)) > 0 OR p.phone=?))";
      args.add(term);
      args.add(term);
    }
    return where;
  }

  public record RosterExportRow(String name, String maskedPhone, String status, OffsetDateTime createdAt, String boardingPoint) {}

  public List<RosterExportRow> exportRoster(String activity, RegistrationStatus status, String query) {
    if (get(activity, true).priceCents() > 0) {
      if (status != null || (query != null && !query.isBlank())) {
        throw new ApiException(400, "INVALID_PAID_ROSTER_FILTER", "收费活动导出仅包含已确认报名");
      }
      return db.query("""
          SELECT p.participant_name, p.phone, p.boarding_point, o.created_at
          FROM activity_order o JOIN activity_order_participant p ON p.order_id=o.id
          WHERE o.activity_id=? AND o.status IN ('PAID', 'CONFIRMED_FREE')
          ORDER BY o.created_at DESC, o.id, p.position
          """,
          (row, i) -> new RosterExportRow(row.getString("participant_name"),
              UserService.maskPhone(row.getString("phone")), RegistrationStatus.CONFIRMED.name(),
              row.getObject("created_at", OffsetDateTime.class), row.getString("boarding_point")),
          activity);
    }
    var args = new ArrayList<Object>();
    String where = registrationFilter(null, activity, status, query, args);
    return db.query(
        "SELECT p.participant_name, p.phone, p.boarding_point, r.status, r.created_at"
            + " FROM registration r JOIN registration_participant p ON p.registration_id=r.id"
            + " WHERE " + where + " ORDER BY r.created_at DESC,r.id,p.position",
        (row, i) -> new RosterExportRow(row.getString("participant_name"),
            UserService.maskPhone(row.getString("phone")), row.getString("status"),
            row.getObject("created_at", OffsetDateTime.class), row.getString("boarding_point")),
        args.toArray());
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
    var rows = db.query("SELECT p.* FROM registration_participant p JOIN registration r ON r.id=p.registration_id WHERE r.activity_id=? AND p.id=?", (r,n) -> new Participant(r.getString("id"),r.getString("participant_name"),identity.reveal(r.getString("id_number")),r.getString("phone"), r.getString("boarding_point")), activityId, participantId);
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
