package com.wildboy;

import static com.wildboy.Models.*;
import static com.wildboy.UserModels.*;

import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
  private final JdbcTemplate db;
  private final LegalService legal;
  private final AuthService auth;
  private final ActivityService activities;
  private final AdminAccountService adminAccounts;

  public UserService(
      JdbcTemplate db, LegalService legal, AuthService auth, ActivityService activities,
      AdminAccountService adminAccounts) {
    this.db = db;
    this.legal = legal;
    this.auth = auth;
    this.activities = activities;
    this.adminAccounts = adminAccounts;
  }

  private static final String ADMIN_SELECT =
      "SELECT u.*,"
          + " (SELECT COUNT(*) FROM registration r WHERE r.user_id=u.id) AS registration_count,"
          + " (SELECT COUNT(*) FROM registration r WHERE r.user_id=u.id AND r.status='CONFIRMED') AS confirmed_registration_count,"
          + " (SELECT MAX(r.created_at) FROM registration r WHERE r.user_id=u.id) AS last_registration_at"
          + " FROM app_user u";

  private RowMapper<AdminUser> adminMapper(User actor) {
    return (r, n) -> {
      String id = r.getString("id"), role = r.getString("role");
      var source = accountSource(r.getString("external_id"));
      boolean verified = r.getObject("wechat_verified_at", OffsetDateTime.class) != null;
      String block = roleBlockReason(actor, id, source, verified, role);
      return new AdminUser(
              r.getString("id"),
              r.getString("nickname"),
              maskName(r.getString("real_name")),
              maskPhone(r.getString("phone")),
              r.getObject("profile_completed_at", OffsetDateTime.class) != null,
              r.getObject("created_at", OffsetDateTime.class),
              r.getObject("profile_updated_at", OffsetDateTime.class),
              r.getLong("registration_count"),
              r.getLong("confirmed_registration_count"),
              r.getObject("last_registration_at", OffsetDateTime.class),
              role, source, verified, block == null, block, r.getLong("role_version"));
    };
  }

  static String maskName(String name) {
    if (name == null || name.isEmpty()) return "";
    int first = name.offsetByCodePoints(0, 1);
    return name.substring(0, first) + "*".repeat(Math.max(1, name.codePointCount(0, name.length()) - 1));
  }

  private boolean eligibleActor(User actor) {
    return actor != null && "ADMIN".equals(actor.role())
        && (actor.accountSource() == AccountSource.PASSWORD
            || actor.accountSource() == AccountSource.WECHAT && actor.wechatVerified());
  }

  private String roleBlockReason(User actor, String id, AccountSource source, boolean verified, String role) {
    if (!eligibleActor(actor)) return "ROLE_MANAGEMENT_FORBIDDEN";
    if (actor.id().equals(id)) return "SELF_ROLE_CHANGE_FORBIDDEN";
    if (source != AccountSource.WECHAT || !verified) return "ROLE_TARGET_NOT_ELIGIBLE";
    if ("ADMIN".equals(role) && !adminAccounts.passwordLoginAvailable()
        && db.queryForObject("SELECT COUNT(*) FROM app_user WHERE role='ADMIN' AND external_id LIKE 'wechat:%' AND wechat_verified_at IS NOT NULL", Long.class) <= 1)
      return "LAST_ADMIN_REQUIRED";
    return null;
  }

  static String maskPhone(String phone) {
    if (phone == null || phone.isEmpty()) return "";
    return phone.length() < 7 ? "••••" : phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
  }

  @Transactional
  public User updateProfile(User actor, ProfileInput input) {
    legal.requireCurrent(input.privacyVersion(), input.termsVersion());
    var rows = db.query("SELECT * FROM app_user WHERE id=? FOR UPDATE", AuthService::mapUser, actor.id());
    if (rows.isEmpty()) throw new ApiException(401, "UNAUTHENTICATED", "请先登录");
    User current = rows.getFirst();
    if (!(current.role().equals("USER") || current.role().equals("ADMIN")
        && current.accountSource() == AccountSource.WECHAT && current.wechatVerified()))
      throw new ApiException(403, "USER_PROFILE_ONLY", "仅微信活动账号可填写用户资料");
    String name = input.realName() == null ? "" : input.realName().strip();
    String phone = input.phone() == null ? "" : input.phone().strip();
    if (name.length() < 2
        || name.length() > 40
        || name.codePoints().anyMatch(Character::isISOControl))
      throw new ApiException(400, "INVALID_PROFILE_NAME", "姓名须为 2–40 字，且不含控制字符");
    if (!phone.matches("1[3-9][0-9]{9}"))
      throw new ApiException(400, "INVALID_PROFILE_PHONE", "请填写有效的中国大陆手机号");
    db.update(
        "UPDATE app_user SET real_name=?,phone=?,"
            + "profile_completed_at=COALESCE(profile_completed_at,CURRENT_TIMESTAMP),"
            + "profile_updated_at=CURRENT_TIMESTAMP WHERE id=?",
        name,
        phone,
        actor.id());
    legal.accept(actor.id(), input.privacyVersion(), input.termsVersion(), "ACCEPT");
    db.update(
        "INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,'USER_PROFILE_UPDATE')",
        UUID.randomUUID().toString(),
        actor.id(),
        actor.id());
    return auth.byId(actor.id());
  }

  public Page<AdminUser> list(User actor, String query, ProfileStatus profile, Role role,
      AccountSource source, int page, int size) {
    ActivityService.pageCheck(page, size);
    String keyword = query == null ? "" : query.strip();
    if (keyword.length() > 80)
      throw new ApiException(400, "INVALID_USER_QUERY", "用户搜索内容不能超过 80 字");
    var where = new StringBuilder(" WHERE 1=1");
    var args = new ArrayList<Object>();
    if (role != null) { where.append(" AND u.role=?"); args.add(role.name()); }
    if (source != null) {
      where.append(" AND CASE WHEN u.external_id LIKE 'wechat:%' THEN 'WECHAT' WHEN u.external_id LIKE 'admin:%' THEN 'PASSWORD' WHEN u.external_id LIKE 'dev:%' OR u.external_id LIKE 'smoke:%' THEN 'DEMO' ELSE 'OTHER' END = ?");
      args.add(source.name());
    }
    if (profile != null) {
      where.append(" AND u.profile_completed_at IS ");
      where.append(profile == ProfileStatus.COMPLETE ? "NOT NULL" : "NULL");
    }
    if (!keyword.isEmpty()) {
      String like = "%" + keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
      where.append(
          " AND (u.nickname ILIKE ? ESCAPE '\\' OR u.real_name ILIKE ? ESCAPE '\\' OR u.id=? OR u.phone=?)");
      Collections.addAll(args, like, like, keyword, keyword);
    }
    long total =
        db.queryForObject(
            "SELECT COUNT(*) FROM app_user u" + where, Long.class, args.toArray());
    args.add(size);
    args.add(page * size);
    var items =
        db.query(
            ADMIN_SELECT + where + " ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?",
            adminMapper(actor),
            args.toArray());
    return new Page<>(items, total, page, size, (long) (page + 1) * size < total);
  }

  public AdminUserDetail detail(
      User actor, String id, RegistrationStatus status, int page, int size) {
    ActivityService.pageCheck(page, size);
    var users =
        db.query(ADMIN_SELECT + " WHERE u.id=?", adminMapper(actor), id);
    if (users.isEmpty()) throw ApiException.notFound();
    var registrations = activities.registrations(id, null, status, page, size);
    var masked =
        registrations.items().stream()
            .map(
                registration ->
                    activities.withParticipants(
                        registration,
                        registration.participants().stream()
                            .map(
                                participant ->
                                    new Participant(
                                        participant.id(),
                                        maskName(participant.participantName()),
                                        participant.idNumber(),
                                        maskPhone(participant.phone())))
                            .toList()))
            .toList();
    return new AdminUserDetail(
        users.getFirst(),
        new Page<>(
            masked,
            registrations.total(),
            registrations.page(),
            registrations.size(),
            registrations.hasMore()));
  }

  @Transactional
  public AdminUser changeRole(User actor, String bearer, String id, RoleInput input) {
    // The existing permanent account row serializes role writes and credential rotation.
    db.queryForObject("SELECT id FROM admin_account_configuration WHERE id=1 FOR UPDATE", Integer.class);
    if (actor == null || bearer == null || !bearer.startsWith("Bearer ") || bearer.length() > 107)
      throw new ApiException(401, "UNAUTHENTICATED", "请重新登录");
    var actors = db.query("SELECT * FROM app_user WHERE id=? FOR SHARE", AuthService::mapUser, actor.id());
    if (actors.isEmpty() || !eligibleActor(actors.getFirst()))
      throw new ApiException(403, "ROLE_MANAGEMENT_FORBIDDEN", "请使用正式管理员账号管理权限");
    User currentActor = actors.getFirst();
    if (!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM auth_session WHERE token_hash=? AND user_id=? AND expires_at>clock_timestamp())",
        Boolean.class, AuthService.hash(bearer.substring(7)), currentActor.id())))
      throw new ApiException(401, "UNAUTHENTICATED", "登录状态已变化，请重新登录");
    var targets = db.query("SELECT * FROM app_user WHERE id=? FOR UPDATE", AuthService::mapUser, id);
    if (targets.isEmpty()) throw ApiException.notFound();
    User target = targets.getFirst();
    if (input.version() == null || input.version() != target.version())
      throw ApiException.conflict("STALE_VERSION", "用户权限已更新，请重新读取后核对");
    String block = roleBlockReason(currentActor, id, target.accountSource(), target.wechatVerified(), target.role());
    if (block != null) throw ApiException.conflict(block, switch (block) {
      case "SELF_ROLE_CHANGE_FORBIDDEN" -> "不能修改自己的管理员角色，请由其他正式管理员操作";
      case "LAST_ADMIN_REQUIRED" -> "必须保留至少一个可登录的正式管理员";
      default -> "仅已完成真实微信登录的账号可设置管理员，请先让该用户重新微信登录";
    });
    if (input.role() == null) throw new ApiException(400, "BAD_REQUEST", "请选择有效角色");
    if (!target.role().equals(input.role().name())) {
      db.update("UPDATE app_user SET role=?,role_version=role_version+1 WHERE id=?", input.role().name(), id);
      db.update("DELETE FROM auth_session WHERE user_id=?", id);
      activities.audit(currentActor.id(), id, "USER_ROLE_" + input.role().name());
    }
    return db.queryForObject(ADMIN_SELECT + " WHERE u.id=?", adminMapper(currentActor), id);
  }
}
