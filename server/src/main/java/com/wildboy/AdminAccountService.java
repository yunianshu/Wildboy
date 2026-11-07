package com.wildboy;

import static com.wildboy.AdminAccountModels.*;
import static com.wildboy.Models.User;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminAccountService {
  private final JdbcTemplate db;
  private final String bootstrapUsername, bootstrapHash;
  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

  record Credentials(String username, String passwordHash, String userId) {
    @Override public String toString() { return "AdminCredentials[redacted]"; }
  }
  private record State(String username, String passwordHash, String userId, long version) {
    boolean configured() { return userId != null; }
    @Override public String toString() { return "AdminAccountState[redacted]"; }
  }

  public AdminAccountService(
      JdbcTemplate db,
      @Value("${wildboy.admin.username:}") String bootstrapUsername,
      @Value("${wildboy.admin.password-hash:}") String bootstrapHash) {
    this.db = db;
    this.bootstrapUsername = bootstrapUsername;
    this.bootstrapHash = bootstrapHash;
  }

  private State state(String lock) {
    return db.queryForObject(
        "SELECT username,password_hash,admin_user_id,version FROM admin_account_configuration WHERE id=1" + lock,
        (r, n) -> new State(r.getString(1), r.getString(2), r.getString(3), r.getLong(4)));
  }

  private boolean bootstrapReady() {
    return !bootstrapUsername.isBlank() && !bootstrapHash.isBlank();
  }

  private Credentials credentials(State state) {
    if (state.configured()) return new Credentials(state.username(), state.passwordHash(), state.userId());
    if (!bootstrapReady()) throw new ApiException(503, "ADMIN_NOT_CONFIGURED", "管理登录尚未配置");
    return new Credentials(bootstrapUsername, bootstrapHash, null);
  }

  private boolean passwordMatches(String password, String hash) {
    if (password == null || hash == null) return false;
    try { return encoder.matches(password, hash); }
    catch (IllegalArgumentException failure) { return false; }
  }

  // AuthService.admin holds its transaction through token creation. Rotation cannot
  // commit between checking an old password and issuing a session for it.
  Credentials verifyLogin(String username, String password) {
    Credentials c = credentials(state(" FOR SHARE"));
    boolean passwordValid = passwordMatches(password, c.passwordHash());
    if (username == null || !MessageDigest.isEqual(
        username.getBytes(StandardCharsets.UTF_8), c.username().getBytes(StandardCharsets.UTF_8)) || !passwordValid)
      throw new ApiException(401, "INVALID_CREDENTIALS", "账号或密码错误");
    return c;
  }

  User configuredUser(String id) {
    return db.query("SELECT * FROM app_user WHERE id=? AND role='ADMIN'",
        AuthService::mapUser, id).stream()
        .findFirst().orElseThrow(() -> new ApiException(503, "ADMIN_NOT_CONFIGURED", "管理账号暂不可用，请联系部署管理员"));
  }

  public Capabilities capabilities() {
    // Environment bootstrap is deliberately not advertised as the mini-program entry.
    boolean enabled = Boolean.TRUE.equals(db.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM admin_account_configuration c JOIN app_user u ON u.id=c.admin_user_id WHERE c.id=1 AND u.role='ADMIN')",
        Boolean.class));
    return new Capabilities(enabled);
  }

  boolean passwordLoginAvailable() {
    State current = state("");
    if (!current.configured()) return bootstrapReady();
    return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND role='ADMIN')", Boolean.class, current.userId()));
  }

  private String blockReason(State state, User actor) {
    if (actor == null || !"ADMIN".equals(actor.role())) return "PASSWORD_LOGIN_REQUIRED";
    var external = db.queryForList("SELECT external_id FROM app_user WHERE id=? AND role='ADMIN'", String.class, actor.id());
    if (external.isEmpty() || external.getFirst().startsWith("dev:") || external.getFirst().startsWith("smoke:")) return "PASSWORD_LOGIN_REQUIRED";
    if (state.configured()) return actor.id().equals(state.userId()) ? null : "PASSWORD_LOGIN_REQUIRED";
    if (!bootstrapReady()) return "ADMIN_BOOTSTRAP_NOT_CONFIGURED";
    return external.getFirst().equals("admin:" + bootstrapUsername) ? null : "PASSWORD_LOGIN_REQUIRED";
  }

  private Settings settings(State state, User actor) {
    String reason = blockReason(state, actor);
    return new Settings(state.configured(), state.configured() ? state.username() : bootstrapUsername,
        state.version(), reason == null, reason);
  }

  public Settings settings(User actor) { return settings(state(""), actor); }

  private void validateNewCredentials(UpdateInput input) {
    if (input.username() == null || !input.username().matches("[A-Za-z0-9][A-Za-z0-9._-]{2,63}"))
      throw new ApiException(400, "INVALID_ADMIN_USERNAME", "账号须为 3–64 位字母、数字、点、下划线或短横线，首位为字母或数字");
    String password = input.newPassword();
    if (password == null || password.codePointCount(0, password.length()) < 12
        || password.codePointCount(0, password.length()) > 72
        || password.getBytes(StandardCharsets.UTF_8).length > 72
        || !password.matches("(?s).*[A-Za-z].*") || !password.matches("(?s).*[0-9].*")
        || password.codePoints().anyMatch(Character::isISOControl))
      throw new ApiException(400, "WEAK_ADMIN_PASSWORD", "新密码须为 12–72 个字符，包含字母和数字，不含控制字符，且 UTF-8 不超过 72 字节");
  }

  @Transactional
  public Settings update(User actor, String bearer, UpdateInput input) {
    validateNewCredentials(input);
    State current = state(" FOR UPDATE");
    if (actor == null || bearer == null || !bearer.startsWith("Bearer ") || bearer.length() > 107)
      throw new ApiException(401, "UNAUTHENTICATED", "请重新登录");
    String sessionHash = AuthService.hash(bearer.substring(7));
    if (!Boolean.TRUE.equals(db.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM auth_session WHERE token_hash=? AND user_id=? AND expires_at>clock_timestamp())",
        Boolean.class, sessionHash, actor.id())))
      throw new ApiException(401, "UNAUTHENTICATED", "登录状态已变化，请重新登录");
    String reason = blockReason(current, actor);
    if (reason != null) throw new ApiException(reason.equals("ADMIN_BOOTSTRAP_NOT_CONFIGURED") ? 503 : 403,
        reason, "请先使用已配置的管理员账号密码登录；演示身份不能修改管理账号");
    if (input.version() == null || input.version() != current.version())
      throw ApiException.conflict("STALE_VERSION", "管理员账号已在别处更新，请刷新后重试");
    if (!passwordMatches(input.currentPassword(), credentials(current).passwordHash()))
      throw new ApiException(400, "CURRENT_PASSWORD_INVALID", "当前管理员密码不正确");
    String hash = encoder.encode(input.newPassword());
    // Preserve the current administrator's identity, audit references and current session.
    db.update("UPDATE admin_account_configuration SET username=?,password_hash=?,admin_user_id=?,version=version+1,configured_at=COALESCE(configured_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=1",
        input.username(), hash, actor.id());
    db.update("DELETE FROM auth_session WHERE user_id IN (SELECT id FROM app_user WHERE role='ADMIN') AND token_hash<>?", sessionHash);
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)", UUID.randomUUID().toString(),
        actor.id(), "admin-account", current.configured() ? "ADMIN_ACCOUNT_UPDATE" : "ADMIN_ACCOUNT_CONFIGURE");
    return settings(state(""), actor);
  }
}
