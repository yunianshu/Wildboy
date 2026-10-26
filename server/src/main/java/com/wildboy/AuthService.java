package com.wildboy;

import static com.wildboy.Models.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AuthService {
  private final JdbcTemplate db;
  private final Environment env;
  private final String appId, appSecret, adminUsername, adminHash;
  private final boolean devEnabled;
  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
  private final RestClient wechat;

  public AuthService(
      JdbcTemplate db,
      Environment env,
      @Value("${wildboy.wechat.app-id}") String appId,
      @Value("${wildboy.wechat.app-secret}") String appSecret,
      @Value("${wildboy.admin.username}") String adminUsername,
      @Value("${wildboy.admin.password-hash}") String adminHash,
      @Value("${wildboy.dev-login-enabled:false}") boolean devEnabled) {
    this.db = db;
    this.env = env;
    this.appId = appId;
    this.appSecret = appSecret;
    this.adminUsername = adminUsername;
    this.adminHash = adminHash;
    this.devEnabled = devEnabled;
    var factory =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    factory.setReadTimeout(Duration.ofSeconds(8));
    wechat =
        RestClient.builder().baseUrl("https://api.weixin.qq.com").requestFactory(factory).build();
  }

  public Login wechat(String code) {
    if (appId.isBlank() || appSecret.isBlank())
      throw new ApiException(503, "WECHAT_NOT_CONFIGURED", "微信登录尚未配置");
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
      if (r == null || r.path("errcode").asInt(0) != 0 || r.path("openid").asText().isBlank())
        throw new ApiException(401, "WECHAT_CODE_INVALID", "微信登录凭证无效，请重试");
      openid = r.path("openid").asText();
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(502, "WECHAT_UNAVAILABLE", "微信登录暂不可用，请稍后重试");
    }
    return login(user("wechat:" + openid, "微信用户", "USER"));
  }

  public Login admin(String username, String password) {
    if (adminUsername.isBlank() || adminHash.isBlank())
      throw new ApiException(503, "ADMIN_NOT_CONFIGURED", "管理登录尚未配置");
    boolean matches;
    try {
      matches = encoder.matches(password, adminHash);
    } catch (Exception e) {
      matches = false;
    }
    if (!MessageDigest.isEqual(
            username.getBytes(StandardCharsets.UTF_8),
            adminUsername.getBytes(StandardCharsets.UTF_8))
        || !matches) throw new ApiException(401, "INVALID_CREDENTIALS", "账号或密码错误");
    return login(user("admin:" + adminUsername, "管理员", "ADMIN"));
  }

  public boolean isDev() {
    return devEnabled
        && Arrays.asList(env.getActiveProfiles()).contains("dev")
        && !Arrays.asList(env.getActiveProfiles()).contains("prod");
  }

  public Login dev(String role) {
    if (!isDev()) throw ApiException.notFound();
    return login(user("dev:" + role, "演示" + (role.equals("ADMIN") ? "管理员" : "用户"), role));
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
    return db.queryForObject(
        "SELECT id,nickname,role FROM app_user WHERE external_id=?",
        (r, n) -> new User(r.getString(1), r.getString(2), r.getString(3)),
        external);
  }

  Login login(User user) {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    db.update("DELETE FROM auth_session WHERE expires_at<CURRENT_TIMESTAMP");
    db.update(
        "INSERT INTO auth_session(token_hash,user_id,expires_at) VALUES(?,?,?)",
        hash(token),
        user.id(),
        OffsetDateTime.now().plusHours(user.role().equals("ADMIN") ? 8 : 168));
    return new Login(token, user);
  }

  User authenticate(String token) {
    if (token == null || token.length() > 100) return null;
    return db
        .query(
            "SELECT u.id,u.nickname,u.role FROM app_user u JOIN auth_session s ON s.user_id=u.id"
                + " WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP",
            (r, n) -> new User(r.getString(1), r.getString(2), r.getString(3)),
            hash(token))
        .stream()
        .findFirst()
        .orElse(null);
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
