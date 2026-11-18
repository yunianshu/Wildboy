package com.wildboy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/**
 * 微信小程序「消息推送服务」接收端点（发货信息管理相关事件）。
 *
 * <p>启用方式：在小程序管理后台「开发-开发管理-消息推送」填写本服务地址
 * {@code /api/v1/wechat/messages}、Token（{@code wildboy.wechat.push-token}）与
 * EncodingAESKey（{@code wildboy.wechat.push-aes-key}，安全模式必填）。提交时微信
 * 发起 GET 验证（sha1(token,timestamp,nonce) 字典序拼接，回显 echostr）；事件以
 * POST 推送：明文模式验 signature，安全模式验 msg_signature 并 AES-256-CBC 解密
 * （密文结构 random(16B)+msg_len(4B 网络字节序)+msg+appid，需校验 appid）。
 *
 * <p>发货信息管理四类事件入库 audit_event 供运营追查；其余事件仅确认接收。
 * 日志与审计不记录 openid、消息全文等敏感字段，只留事件名与订单标识。
 */
@RestController
@RequestMapping("/api/v1/wechat/messages")
public class WechatMessagePushController {
  private static final Logger log = LoggerFactory.getLogger(WechatMessagePushController.class);
  private static final ObjectMapper JSON = new ObjectMapper();

  private final WechatNotificationGateway gateway;
  private final JdbcTemplate db;
  private final String token;
  private final String aesKey;

  public WechatMessagePushController(
      WechatNotificationGateway gateway,
      JdbcTemplate db,
      @Value("${wildboy.wechat.push-token:}") String token,
      @Value("${wildboy.wechat.push-aes-key:}") String aesKey) {
    this.gateway = gateway;
    this.db = db;
    this.token = token == null ? "" : token.strip();
    this.aesKey = aesKey == null ? "" : aesKey.strip();
  }

  /** 后台「消息推送」提交时的 URL 验证：验签通过后原样回显 echostr。 */
  @GetMapping
  String verify(
      @RequestParam(required = false) String signature,
      @RequestParam(required = false) String timestamp,
      @RequestParam(required = false) String nonce,
      @RequestParam(required = false) String echostr) {
    if (token.isEmpty()) throw new ApiException(503, "PUSH_NOT_CONFIGURED", "消息推送 Token 未配置");
    if (echostr == null || echostr.isBlank() || !signature(token, timestamp, nonce).equals(signature))
      throw new ApiException(403, "INVALID_PUSH_SIGNATURE", "消息推送验签失败");
    return echostr;
  }

  @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
  String receive(
      @RequestParam(required = false) String signature,
      @RequestParam(required = false) String msg_signature,
      @RequestParam(required = false) String encrypt_type,
      @RequestParam(required = false) String timestamp,
      @RequestParam(required = false) String nonce,
      @RequestBody String body) {
    if (token.isEmpty()) throw new ApiException(503, "PUSH_NOT_CONFIGURED", "消息推送 Token 未配置");
    if (body == null || body.isBlank() || body.length() > 65536)
      throw new ApiException(400, "INVALID_PUSH_BODY", "消息推送内容无效");
    JsonNode event;
    if ("aes".equals(encrypt_type)) {
      // 安全模式：必须校验 msg_signature（token+timestamp+nonce+Encrypt 字典序 sha1），
      // 不能用 signature。解密后需校验 appid 归属，防止其它小程序的密文重放。
      if (aesKey.isEmpty() || aesKey.length() != 43)
        throw new ApiException(503, "PUSH_NOT_CONFIGURED", "消息推送安全模式密钥未配置");
      String encrypt;
      try {
        JsonNode envelope = JSON.readTree(body);
        encrypt = envelope.path("Encrypt").asText(envelope.path("encrypt").asText(""));
      } catch (Exception e) {
        throw new ApiException(400, "INVALID_PUSH_BODY", "消息推送内容无效");
      }
      if (encrypt.isBlank()
          || !signature(token, timestamp, nonce, encrypt).equals(msg_signature))
        throw new ApiException(403, "INVALID_PUSH_SIGNATURE", "消息推送验签失败");
      event = parse(decrypt(encrypt));
    } else {
      if (!signature(token, timestamp, nonce).equals(signature))
        throw new ApiException(403, "INVALID_PUSH_SIGNATURE", "消息推送验签失败");
      event = parse(body);
    }
    handle(event);
    // 官方要求：无特定回包要求时回复 success 或空串即可，无需加密。
    return "success";
  }

  private void handle(JsonNode event) {
    switch (event.path("Event").asText("")) {
      // 订单超 48 小时未发货的官方催办：与本地 24h/40h 预警（OrderShippingOverdueJob）互补。
      case "trade_manage_remind_shipping" ->
          record("WX_PUSH_REMIND_SHIPPING", identifier(event, "merchant_trade_no", "transaction_id"), event);
      case "trade_manage_order_settlement" ->
          record("WX_PUSH_SETTLEMENT", identifier(event, "merchant_trade_no", "transaction_id"), event);
      case "trade_manage_remind_access_api" -> record("WX_PUSH_REMIND_API", gateway.appId, event);
      case "wxa_trade_controlled" -> record("WX_PUSH_CONTROLLED", gateway.appId, event);
      // 同一推送地址还会收到客服消息等其它事件：确认接收即可，不留敏感内容。
      default -> log.info("忽略未接入的微信推送事件 event={}", event.path("Event").asText(""));
    }
  }

  private void record(String action, String entity, JsonNode event) {
    // 只落事件名与订单/应用标识；不落 openid、消息文本等敏感字段。
    db.update("INSERT INTO audit_event(id,actor_id,entity_id,action) VALUES(?,?,?,?)",
        UUID.randomUUID().toString(), "system", entity, action);
    log.info("微信推送事件已记录 action={} entity={}", action, entity);
  }

  private static String identifier(JsonNode event, String... fields) {
    for (String field : fields) {
      String value = event.path(field).asText("");
      if (!value.isBlank()) return value.length() > 36 ? value.substring(0, 36) : value;
    }
    return "unknown";
  }

  private static JsonNode parse(String content) {
    try {
      JsonNode node = JSON.readTree(content);
      if (node == null || !node.isObject()) throw new IllegalArgumentException("not an object");
      return node;
    } catch (Exception e) {
      throw new ApiException(400, "INVALID_PUSH_BODY", "消息推送内容无效");
    }
  }

  /** 官方签名算法：各参数字典序排序后拼接取 sha1。 */
  static String signature(String... parts) {
    String[] sorted = parts.clone();
    Arrays.sort(sorted);
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1")
          .digest(String.join("", sorted).getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  /**
   * 安全模式解密：AESKey=Base64Decode(EncodingAESKey+"=")；
   * 明文结构 random(16B)+msg_len(4B 网络字节序)+msg+appid，尾部 appid 必须属于本小程序。
   */
  String decrypt(String encrypt) {
    try {
      byte[] key = Base64.getDecoder().decode(aesKey + "=");
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
      cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(Arrays.copyOf(key, 16)));
      byte[] plain = cipher.doFinal(Base64.getDecoder().decode(encrypt));
      int length = ((plain[16] & 0xff) << 24) | ((plain[17] & 0xff) << 16) | ((plain[18] & 0xff) << 8) | (plain[19] & 0xff);
      if (length <= 0 || 20 + length >= plain.length) throw new IllegalArgumentException("bad length");
      String appid = new String(plain, 20 + length, plain.length - 20 - length, StandardCharsets.UTF_8);
      if (!gateway.appId.equals(appid))
        throw new ApiException(403, "INVALID_PUSH_SIGNATURE", "消息推送应用不匹配");
      return new String(plain, 20, length, StandardCharsets.UTF_8);
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw new ApiException(400, "INVALID_PUSH_BODY", "消息推送内容无效");
    }
  }
}
