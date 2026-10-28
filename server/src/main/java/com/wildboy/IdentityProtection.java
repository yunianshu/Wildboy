package com.wildboy;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Dedicated, versioned identity encryption. Never log plaintext or the key. */
@Service
public class IdentityProtection {
  private final String configuredKey;
  public IdentityProtection(@Value("${wildboy.identity.encryption-key:}") String key) { this.configuredKey = key; }
  private byte[] key() {
    try {
      byte[] decoded = Base64.getDecoder().decode(configuredKey);
      if (decoded.length == 32) return decoded;
    } catch (IllegalArgumentException ignored) { }
    throw new ApiException(503, "IDENTITY_PROTECTION_NOT_READY", "身份信息安全配置未完成，请联系管理员");
  }
  public void requireReady() { key(); }
  public String encrypt(String value) {
    if (value == null || value.isEmpty()) return "";
    byte[] k = key();
    try {
      byte[] iv = new byte[12]; new SecureRandom().nextBytes(iv);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(k,"AES"), new GCMParameterSpec(128,iv));
      c.updateAAD("wildboy-participant-id-v1".getBytes(StandardCharsets.UTF_8));
      return "enc:v1:" + Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) { throw new IllegalStateException("Identity encryption failed"); }
  }
  public String reveal(String stored) {
    if (stored == null || stored.isEmpty()) return "";
    if (!stored.startsWith("enc:")) return stored; // legacy read, never a new write
    byte[] k = key();
    try {
      String[] parts = stored.split(":");
      if (parts.length != 4 || !parts[1].equals("v1")) throw new IllegalArgumentException();
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(k,"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[2])));
      c.updateAAD("wildboy-participant-id-v1".getBytes(StandardCharsets.UTF_8));
      return new String(c.doFinal(Base64.getDecoder().decode(parts[3])),StandardCharsets.UTF_8);
    } catch (Exception e) { throw new ApiException(503,"IDENTITY_UNAVAILABLE","身份信息暂不可读取，请联系管理员"); }
  }
  public String masked(String stored) {
    if (stored == null || stored.isEmpty()) return "";
    // List APIs never decrypt, even if encryption key is unavailable.
    if (stored.startsWith("enc:")) return "******************";
    return stored.length() < 8 ? "******" : stored.substring(0,3)+"***********"+stored.substring(stored.length()-4);
  }
}
