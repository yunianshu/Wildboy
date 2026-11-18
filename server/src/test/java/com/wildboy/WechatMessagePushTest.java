package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 微信消息推送端点：URL 验证、明文/安全模式验签解密、发货信息管理事件入库。
 * Token/AESKey 为测试专用合成值；全部用 MockMvc，不外呼微信。
 */
@SpringBootTest
@AutoConfigureMockMvc
class WechatMessagePushTest {
  static final EmbeddedPostgres pg;
  static final String TOKEN = "push-test-token";
  static final String AES_KEY = "abcdefghijklmnopqrstuvwx0123456789ABCDEFGHI"; // 43 字符合成密钥
  static final String APP_ID = "push-test-app";
  static {
    try {
      pg = EmbeddedPostgres.builder().setServerConfig("unix_socket_directories", "").start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }
  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
    r.add("spring.datasource.username", () -> "postgres");
    r.add("spring.datasource.password", () -> "");
    r.add("wildboy.wechat.app-id", () -> APP_ID);
    r.add("wildboy.wechat.push-token", () -> TOKEN);
    r.add("wildboy.wechat.push-aes-key", () -> AES_KEY);
    r.add("wildboy.orders.expiry-scan-ms", () -> 3600000);
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired WechatNotificationGateway gateway;

  @BeforeEach
  void clean() {
    db.update("DELETE FROM audit_event WHERE actor_id='system'");
  }

  private static String sha1(String... parts) {
    String[] sorted = parts.clone();
    Arrays.sort(sorted);
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1")
          .digest(String.join("", sorted).getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  /** 按官方规范构造安全模式密文：random(16B)+len(4B 网络字节序)+msg+appid。 */
  private static String encrypt(String message) throws Exception {
    byte[] key = Base64.getDecoder().decode(AES_KEY + "=");
    byte[] msg = message.getBytes(StandardCharsets.UTF_8);
    byte[] appid = APP_ID.getBytes(StandardCharsets.UTF_8);
    var raw = new java.io.ByteArrayOutputStream();
    raw.write("0123456789abcdef".getBytes(StandardCharsets.UTF_8), 0, 16);
    raw.write(new byte[] {(byte) (msg.length >>> 24), (byte) (msg.length >>> 16), (byte) (msg.length >>> 8), (byte) msg.length});
    raw.write(msg);
    raw.write(appid);
    Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(Arrays.copyOf(key, 16)));
    return Base64.getEncoder().encodeToString(cipher.doFinal(raw.toByteArray()));
  }

  @Test
  void urlVerificationEchoesEchostrOnlyWithValidSignature() throws Exception {
    mvc.perform(get("/api/v1/wechat/messages")
            .queryParam("signature", sha1(TOKEN, "1714036504", "1514711492"))
            .queryParam("timestamp", "1714036504")
            .queryParam("nonce", "1514711492")
            .queryParam("echostr", "4375120948345356249"))
        .andExpect(status().isOk())
        .andExpect(content().string("4375120948345356249"));
    mvc.perform(get("/api/v1/wechat/messages")
            .queryParam("signature", "deadbeef")
            .queryParam("timestamp", "1714036504")
            .queryParam("nonce", "1514711492")
            .queryParam("echostr", "4375120948345356249"))
        .andExpect(status().isForbidden());
  }

  @Test
  void plaintextRemindShippingIsAuditedAndAcknowledged() throws Exception {
    var body = """
        {"ToUserName":"%s","FromUserName":"system","CreateTime":1714037059,"MsgType":"event",
         "Event":"trade_manage_remind_shipping","transaction_id":"4200000000000000000000000001",
         "merchant_id":"1900000109","merchant_trade_no":"30000000000000000000000000000042","msg":"请尽快发货"}
        """.formatted(APP_ID);
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("signature", sha1(TOKEN, "1714037059", "486452656"))
            .queryParam("timestamp", "1714037059")
            .queryParam("nonce", "486452656")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andExpect(content().string("success"));
    assertThat(db.queryForObject(
        "SELECT COUNT(*) FROM audit_event WHERE actor_id='system' AND action='WX_PUSH_REMIND_SHIPPING' AND entity_id='30000000000000000000000000000042'",
        Integer.class)).isEqualTo(1);
  }

  @Test
  void safeModeDecryptsAuditsAndRejectsTampering() throws Exception {
    String event = "{\"ToUserName\":\"%s\",\"CreateTime\":1714112445,\"MsgType\":\"event\",\"Event\":\"trade_manage_order_settlement\",\"transaction_id\":\"4200000000000000000000000002\",\"merchant_trade_no\":\"30000000000000000000000000000043\",\"settlement_time\":1714200000}"
        .formatted(APP_ID);
    String encrypt = encrypt(event);
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("msg_signature", sha1(TOKEN, "1714112445", "415670741", encrypt))
            .queryParam("timestamp", "1714112445")
            .queryParam("nonce", "415670741")
            .queryParam("encrypt_type", "aes")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"ToUserName\":\"%s\",\"Encrypt\":\"%s\"}".formatted(APP_ID, encrypt)))
        .andExpect(status().isOk())
        .andExpect(content().string("success"));
    assertThat(db.queryForObject(
        "SELECT COUNT(*) FROM audit_event WHERE action='WX_PUSH_SETTLEMENT' AND entity_id='30000000000000000000000000000043'",
        Integer.class)).isEqualTo(1);
    // 篡改密文但沿用旧 msg_signature：验签失败，不入库
    String forged = encrypt(event.replace("30000000000000000000000000000043", "30000000000000000000000000000099"));
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("msg_signature", sha1(TOKEN, "1714112445", "415670741", encrypt))
            .queryParam("timestamp", "1714112445")
            .queryParam("nonce", "415670741")
            .queryParam("encrypt_type", "aes")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"Encrypt\":\"" + forged + "\"}"))
        .andExpect(status().isForbidden());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE actor_id='system'", Integer.class)).isEqualTo(1);
  }

  @Test
  void foreignAppidCiphertextIsRejected() throws Exception {
    String event = "{\"Event\":\"wxa_trade_controlled\",\"msg\":\"controlled\"}";
    String foreign = WechatMessagePushTest.encryptWithAppId(event, "wx-other-app");
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("msg_signature", sha1(TOKEN, "1714112445", "415670741", foreign))
            .queryParam("timestamp", "1714112445")
            .queryParam("nonce", "415670741")
            .queryParam("encrypt_type", "aes")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"Encrypt\":\"" + foreign + "\"}"))
        .andExpect(status().isForbidden());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE actor_id='system'", Integer.class)).isZero();
  }

  @Test
  void wrongPlaintextSignatureAndUnknownEventsAreHandledSafely() throws Exception {
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("signature", "bad")
            .queryParam("timestamp", "1")
            .queryParam("nonce", "2")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"Event\":\"trade_manage_remind_access_api\"}"))
        .andExpect(status().isForbidden());
    // 未接入的事件（如客服消息）：确认接收但不入库
    mvc.perform(post("/api/v1/wechat/messages")
            .queryParam("signature", sha1(TOKEN, "3", "4"))
            .queryParam("timestamp", "3")
            .queryParam("nonce", "4")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"Event\":\"kf_msg\",\"Content\":\"private\"}"))
        .andExpect(status().isOk())
        .andExpect(content().string("success"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM audit_event WHERE actor_id='system'", Integer.class)).isZero();
  }

  @Test
  void unconfiguredTokenFailsClosedWithoutSpringContext() {
    // 直接构造未配置 Token 的控制器：GET 验证与 POST 都拒绝，绝不在无验签下接收
    var dataSource = new DriverManagerDataSource(pg.getJdbcUrl("postgres", "postgres"), "postgres", "");
    var controller = new WechatMessagePushController(gateway, new JdbcTemplate(dataSource), "", "");
    var standalone = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiErrors()).build();
    try {
      standalone.perform(get("/api/v1/wechat/messages")
              .queryParam("signature", "x").queryParam("timestamp", "1")
              .queryParam("nonce", "2").queryParam("echostr", "echo"))
          .andExpect(status().isServiceUnavailable())
          .andExpect(jsonPath("$.code").value("PUSH_NOT_CONFIGURED"));
      standalone.perform(post("/api/v1/wechat/messages")
              .queryParam("signature", "x").queryParam("timestamp", "1")
              .queryParam("nonce", "2").contentType(MediaType.APPLICATION_JSON)
              .content("{\"Event\":\"wxa_trade_controlled\"}"))
          .andExpect(status().isServiceUnavailable());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  /** 与 encrypt 相同的算法，但尾部 appid 可指定，用于跨应用重放测试。 */
  static String encryptWithAppId(String message, String appId) {
    try {
      byte[] key = Base64.getDecoder().decode(AES_KEY + "=");
      byte[] msg = message.getBytes(StandardCharsets.UTF_8);
      var raw = new java.io.ByteArrayOutputStream();
      raw.write("0123456789abcdef".getBytes(StandardCharsets.UTF_8), 0, 16);
      raw.write(new byte[] {(byte) (msg.length >>> 24), (byte) (msg.length >>> 16), (byte) (msg.length >>> 8), (byte) msg.length});
      raw.write(msg);
      raw.write(appId.getBytes(StandardCharsets.UTF_8));
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
      cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(Arrays.copyOf(key, 16)));
      return Base64.getEncoder().encodeToString(cipher.doFinal(raw.toByteArray()));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
