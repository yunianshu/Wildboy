package com.wildboy;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class WechatLoginResponseTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test void acceptsOnlyTextualOpenidAndNeverReturnsSessionKey() throws Exception {
    assertEquals("test-openid_1", AuthService.parseWechatIdentity(json.readTree(
        "{\"openid\":\"test-openid_1\",\"session_key\":\"not-a-real-key\"}")));
    assertEquals("id", AuthService.parseWechatIdentity(json.readTree("{\"errcode\":0,\"openid\":\"id\"}")));
  }

  @Test void rejectsMalformedSuccessResponses() throws Exception {
    for (String payload : new String[]{"null", "[]", "{}", "{\"openid\":123}",
        "{\"openid\":\" \"}", "{\"openid\":\"bad id\"}",
        "{\"errcode\":\"0\",\"openid\":\"id\"}", "{\"errcode\":0.5,\"openid\":\"id\"}"}) {
      var response = json.readTree(payload);
      ApiException error = assertThrows(ApiException.class, () -> AuthService.parseWechatIdentity(response));
      assertEquals(502, error.status);
    }
  }

  @Test void distinguishesInvalidCodeRateLimitAndProviderFailureWithoutLeakingPayload() throws Exception {
    for (int code : new int[]{40029, 40163, 45011, -1, 40013, 99999}) {
      var response = json.readTree("{\"errcode\":" + code + ",\"errmsg\":\"secret-detail\"}");
      ApiException error = assertThrows(ApiException.class, () -> AuthService.parseWechatIdentity(response));
      assertEquals(code == 40029 || code == 40163 ? 401 : code == 45011 ? 429 : 503, error.status);
      assertFalse(error.getMessage().contains("secret-detail"));
    }
  }
}
