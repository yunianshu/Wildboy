package com.wildboy;

import static com.wildboy.Models.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AuthService {
  private final JdbcTemplate db;
  private final Environment env;
  private final String appId, appSecret;
  private final boolean devEnabled;
  private final RestClient wechat;
  private final LegalService legal;
  private final AdminAccountService adminAccounts;
  private final org.springframework.transaction.support.TransactionTemplate tx;

  public AuthService(
      JdbcTemplate db,
      Environment env,
      LegalService legal,
      AdminAccountService adminAccounts,
      org.springframework.transaction.PlatformTransactionManager transactionManager,
      @Value("${wildboy.wechat.app-id}") String appId,
      @Value("${wildboy.wechat.app-secret}") String appSecret,
      @Value("${wildboy.dev-login-enabled:false}") boolean devEnabled) {
    this.db = db;
    this.legal = legal;
    this.adminAccounts = adminAccounts;
    this.tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
    this.env = env;
    this.appId = appId;
    this.appSecret = appSecret;
    this.devEnabled = devEnabled;
    var factory =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    factory.setReadTimeout(Duration.ofSeconds(8));
    wechat =
        RestClient.builder().baseUrl("https://api.weixin.qq.com").requestFactory(factory).build();
  }

  public Login wechat(String code, Long privacyVersion, Long termsVersion) {
    legal.requireCurrent(privacyVersion, termsVersion);
    if (appId.isBlank() || appSecret.isBlank())
      throw new ApiException(503, "WECHAT_NOT_CONFIGURED", "微信登录尚未配置");
    if (code == null || code.isBlank() || code.length() > 512)
      throw new ApiException(400, "WECHAT_CODE_INVALID", "微信登录凭证无效，请重试");
    String openid;
    try {
      String payload =
          wechat
              .get()
              .uri(
                  b ->
                      b.path("/sns/jscode2session")
                          .queryParam("appid", appId)
                          .queryParam("secret", appSecret)
                          .queryParam("js_code", code)
                          .queryParam("grant_type", "authorization_code")
                          .build())
              .retrieve()
              .body(String.class);
      JsonNode r =
          new com.fasterxml.jackson.databind.ObjectMapper()
              .readTree(payload == null ? "{}" : payload);
      openid = parseWechatIdentity(r);
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(502, "WECHAT_UNAVAILABLE", "微信登录暂不可用，请稍后重试");
    }
    return finishWechat(openid, privacyVersion, termsVersion);
  }

  // Never propagate provider payloads: they can contain session keys or identifiers.
  static String parseWechatIdentity(JsonNode response) {
    if (response == null || !response.isObject())
      throw new ApiException(502, "WECHAT_RESPONSE_INVALID", "微信登录响应异常，请稍后重试");
    JsonNode error = response.get("errcode");
    if (error != null && (!error.isIntegralNumber() || !error.canConvertToInt()))
      throw new ApiException(502, "WECHAT_RESPONSE_INVALID", "微信登录响应异常，请稍后重试");
    int code = error == null ? 0 : error.intValue();
    if (code == 40029 || code == 40163)
      throw new ApiException(401, "WECHAT_CODE_INVALID", "微信登录凭证已失效，请重新登录");
    if (code == 45011)
      throw new ApiException(429, "WECHAT_LOGIN_RATE_LIMITED", "登录过于频繁，请稍后重试");
    if (code != 0)
      throw new ApiException(503, "WECHAT_UNAVAILABLE", "微信登录暂不可用，请稍后重试");
    JsonNode openid = response.get("openid");
    if (openid == null || !openid.isTextual() || openid.textValue().isBlank()
        || openid.textValue().length() > 128 || !openid.textValue().matches("[A-Za-z0-9_-]+"))
      throw new ApiException(502, "WECHAT_RESPONSE_INVALID", "微信登录响应异常，请稍后重试");
    return openid.textValue();
  }

  Login finishWechat(String openid, Long privacyVersion, Long termsVersion) {
    return tx.execute(
        status -> {
          legal.requireCurrent(privacyVersion, termsVersion);
          // A validated provider login is the only proof of a real WeChat account; it
          // marks the row eligible for role management on this and future logins.
          User user = user("wechat:" + openid, "微信用户", "USER");
          db.update(
              "UPDATE app_user SET wechat_verified_at=CURRENT_TIMESTAMP"
                  + " WHERE id=? AND wechat_verified_at IS NULL",
              user.id());
          legal.accept(user.id(), privacyVersion, termsVersion, "LOGIN");
          return login(byId(user.id()));
        });
  }

  public Login admin(String username, String password) {
    // One transaction spans credential verification and session creation so a rotation
    // cannot commit between checking the old password and issuing its session.
    return tx.execute(
        status -> {
          AdminAccountService.Credentials credentials =
              adminAccounts.verifyLogin(username, password);
          User admin =
              credentials.userId() == null
                  ? user("admin:" + credentials.username(), "管理员", "ADMIN")
                  : adminAccounts.configuredUser(credentials.userId());
          return login(admin);
        });
  }

  public boolean isDev() {
    return devEnabled
        && Arrays.asList(env.getActiveProfiles()).contains("dev")
        && !Arrays.asList(env.getActiveProfiles()).contains("prod");
  }

  public Login dev(String role, Long privacyVersion, Long termsVersion) {
    if (!isDev()) throw ApiException.notFound();
    if (role.equals("ADMIN")) return login(user("dev:ADMIN", "演示管理员", "ADMIN"));
    return tx.execute(
        status -> {
          legal.requireCurrent(privacyVersion, termsVersion);
          User user = user("dev:USER", "演示用户", "USER");
          legal.accept(user.id(), privacyVersion, termsVersion, "LOGIN");
          return login(user);
        });
  }

  User user(String external, String nickname, String role) {
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO app_user(id,external_id,nickname,role) VALUES(?,?,?,?) ON"
            + " CONFLICT(external_id) DO NOTHING",
        id,
        external,
        nickname,
        role);
    return db.queryForObject("SELECT * FROM app_user WHERE external_id=?", AuthService::mapUser, external);
  }

  Login login(User user) {
    // Never trust a caller-supplied snapshot: the session always carries the current
    // database role and the expiry that follows from it.
    User current =
        db.query("SELECT * FROM app_user WHERE id=?", AuthService::mapUser, user.id()).stream()
            .findFirst()
            .orElse(user);
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    db.update("DELETE FROM auth_session WHERE expires_at<CURRENT_TIMESTAMP");
    db.update(
        "INSERT INTO auth_session(token_hash,user_id,expires_at) VALUES(?,?,?)",
        hash(token),
        current.id(),
        OffsetDateTime.now().plusHours(current.role().equals("ADMIN") ? 8 : 168));
    return new Login(token, current);
  }

  public String wechatOpenid(String userId) {
    String external =
        db.queryForObject("SELECT external_id FROM app_user WHERE id=?", String.class, userId);
    if (external == null || !external.startsWith("wechat:"))
      throw new ApiException(409, "WECHAT_IDENTITY_REQUIRED", "请使用真实微信账号登录后支付");
    return external.substring("wechat:".length());
  }

  User authenticate(String token) {
    if (token == null || token.length() > 100) return null;
    return db
        .query(
            "SELECT u.* FROM app_user u JOIN auth_session s ON s.user_id=u.id"
                + " WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP",
            AuthService::mapUser,
            hash(token))
        .stream()
        .findFirst()
        .orElse(null);
  }

  public User byId(String id) {
    return db
        .query("SELECT * FROM app_user WHERE id=?", AuthService::mapUser, id)
        .stream()
        .findFirst()
        .orElseThrow(() -> new ApiException(401, "UNAUTHENTICATED", "请重新登录"));
  }

  // Maps a full app_user row (SELECT *); provenance columns come from V20/V21 migrations.
  static User mapUser(ResultSet r, int n) throws SQLException {
    return new User(
        r.getString("id"),
        r.getString("nickname"),
        r.getString("role"),
        UserModels.accountSource(r.getString("external_id")),
        r.getObject("wechat_verified_at", OffsetDateTime.class) != null,
        r.getString("real_name"),
        r.getString("phone"),
        r.getObject("profile_completed_at", OffsetDateTime.class) != null,
        r.getLong("role_version"), r.getString("avatar_url"),
        r.getObject("display_profile_updated_at") != null);
  }

  static String hash(String token) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
