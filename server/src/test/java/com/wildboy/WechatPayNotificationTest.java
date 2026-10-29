package com.wildboy;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class WechatPayNotificationTest {
  @TempDir Path temp;
  KeyPair pair;
  WechatPayService pay;
  final String apiKey = "0123456789abcdef0123456789abcdef"; // Synthetic local crypto fixture only.
  final ObjectMapper json = new ObjectMapper();
  @BeforeEach void setup() throws Exception {
    var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);pair=generator.generateKeyPair();
    Path pub=temp.resolve("public.pem"),priv=temp.resolve("private.pem");
    Files.writeString(pub,pem("PUBLIC KEY",pair.getPublic().getEncoded()));
    Files.writeString(priv,pem("PRIVATE KEY",pair.getPrivate().getEncoded()));
    pay=new WechatPayService("app","merchant",priv.toString(),"serial",pub.toString(),"PUB_KEY_ID_TEST",apiKey,"https://example.test/notify");
  }
  String pem(String type,byte[] data) { return "-----BEGIN "+type+"-----\n"+Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(data)+"\n-----END "+type+"-----\n"; }
  String body(String event) throws Exception {
    String nonce="123456789012",aad="transaction";
    String transaction=json.writeValueAsString(Map.of("appid","app","mchid","merchant","out_trade_no","ORDER_TEST","transaction_id","TRANSACTION_TEST","trade_state","SUCCESS","trade_type","JSAPI","payer",Map.of("openid","test-openid"),"amount",Map.of("total",100,"currency","CNY")));
    var cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(apiKey.getBytes(StandardCharsets.UTF_8),"AES"),new GCMParameterSpec(128,nonce.getBytes(StandardCharsets.UTF_8)));
    cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
    String encrypted=Base64.getEncoder().encodeToString(cipher.doFinal(transaction.getBytes(StandardCharsets.UTF_8)));
    return json.writeValueAsString(Map.of("id","fixture-notification","event_type",event,"resource_type","encrypt-resource","resource",Map.of("algorithm","AEAD_AES_256_GCM","ciphertext",encrypted,"nonce",nonce,"associated_data",aad,"original_type","transaction")));
  }
  Map<String,String> headers(String body,long timestamp) throws Exception {
    String nonce="signature-nonce";
    var signer=Signature.getInstance("SHA256withRSA");signer.initSign(pair.getPrivate());
    signer.update((timestamp+"\n"+nonce+"\n"+body+"\n").getBytes(StandardCharsets.UTF_8));
    return new HashMap<>(Map.of("wechatpay-serial","PUB_KEY_ID_TEST","wechatpay-nonce",nonce,"wechatpay-timestamp",Long.toString(timestamp),"wechatpay-signature",Base64.getEncoder().encodeToString(signer.sign())));
  }
  @Test void verifiesRealRsaAndDecryptsAesGcmWithoutExternalCalls() throws Exception {
    String body=body("TRANSACTION.SUCCESS");
    var tx=pay.parseNotification(headers(body,Instant.now().getEpochSecond()),body);
    assertThat(tx.getOutTradeNo()).isEqualTo("ORDER_TEST");assertThat(tx.getAmount().getTotal()).isEqualTo(100);
    pay.requireConfigured();
  }
  @Test void rejectsTamperedSignatureWrongKeyMissingHeaderAndExpiredReplay() throws Exception {
    String body=body("TRANSACTION.SUCCESS");long now=Instant.now().getEpochSecond();var headers=headers(body,now);
    assertThatThrownBy(() -> pay.parseNotification(headers,body+" ")).isInstanceOf(ApiException.class);
    var wrong=new HashMap<>(headers);wrong.put("wechatpay-serial","UNKNOWN_KEY");
    assertThatThrownBy(() -> pay.parseNotification(wrong,body)).isInstanceOf(ApiException.class);
    var missing=new HashMap<>(headers);missing.remove("wechatpay-nonce");
    assertThatThrownBy(() -> pay.parseNotification(missing,body)).hasMessageContaining("缺失");
    var old=headers(body,now-301);
    assertThatThrownBy(() -> pay.parseNotification(old,body)).hasMessageContaining("过期");
    var future=headers(body,now+301);
    assertThatThrownBy(() -> pay.parseNotification(future,body)).hasMessageContaining("过期");
  }
  @Test void rejectsWrongEventAndSignedButUndecryptableResource() throws Exception {
    String wrong=body("REFUND.SUCCESS");var headers=headers(wrong,Instant.now().getEpochSecond());
    assertThatThrownBy(() -> pay.parseNotification(headers,wrong)).hasMessageContaining("类型无效");
    var tree=json.readTree(body("TRANSACTION.SUCCESS"));
    ((com.fasterxml.jackson.databind.node.ObjectNode)tree.get("resource")).put("ciphertext",Base64.getEncoder().encodeToString(new byte[32]));
    String broken=json.writeValueAsString(tree);var signed=headers(broken,Instant.now().getEpochSecond());
    assertThatThrownBy(() -> pay.parseNotification(signed,broken)).isInstanceOf(ApiException.class);
  }
  @Test void invalidConfigurationFailsBeforePaymentIntent() {
    var broken=new WechatPayService("app","merchant","/missing/private","serial","/missing/public","PUB_KEY_ID_TEST",apiKey,"https://example.test/notify");
    assertThatThrownBy(broken::requireConfigured).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status).isEqualTo(503));
  }
}
