package com.wildboy;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 微信订单中心服务：路径配置、确认收货复核与提醒的请求形态与结果解析。
 * 外呼通过 MockRestServiceServer 模拟，不触达真实微信。
 */
class WechatOrderCenterServiceTest {
  private static final String WECHAT = "https://api.weixin.qq.com";
  private static final String APP = "order-center-test-app";

  private MockRestServiceServer wechat;
  private WechatOrderCenterService service;

  @BeforeEach
  void useSimulatedWechat() {
    var builder = RestClient.builder().baseUrl(WECHAT);
    wechat = MockRestServiceServer.bindTo(builder).build();
    var gateway = new WechatNotificationGateway(
        APP, "order-center-test-secret", false, "", "thing1", "time2", "thing3", "trial");
    service = new WechatOrderCenterService(gateway, true);
    RestClient client = builder.build();
    ReflectionTestUtils.setField(gateway, "client", client);
    ReflectionTestUtils.setField(service, "client", client);
  }

  @Test
  void rejectsDetailPathWithoutTheOrderNumberPlaceholder() {
    var thrown = assertThrows(ApiException.class,
        () -> service.updateOrderDetailPath("pages/orders/index"));
    assertEquals(400, thrown.status);
    assertEquals("INVALID_ORDER_PATH", thrown.code);
    wechat.verify();
  }

  @Test
  void updatesDetailPathWithAccessToken() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/update_order_detail_path?access_token=order-center-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json(
            "{\"path\":\"pages/order-detail/index?no=${商品订单号}\"}", JsonCompareMode.STRICT))
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

    var result = service.updateOrderDetailPath("pages/order-detail/index?no=${商品订单号}");

    assertTrue(result.attempted());
    assertEquals(0, result.errcode());
    wechat.verify();
  }

  @Test
  void readsOrderStateFromGetOrderForReceiptVerification() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order?access_token=order-center-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json("{\"transaction_id\":\"4200000001\"}", JsonCompareMode.STRICT))
        .andRespond(withSuccess(
            "{\"errcode\":0,\"order\":{\"order_state\":3,\"transaction_id\":\"4200000001\"}}",
            MediaType.APPLICATION_JSON));

    var result = service.verifyReceiptConfirmed("4200000001");

    assertTrue(result.attempted());
    assertEquals(0, result.errcode());
    assertEquals(3, WechatOrderCenterService.orderState(result));
    wechat.verify();
  }

  @Test
  void orderStatePrefersTheNestedOrderFieldAndFallsBackToTopLevel() {
    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
    var nested = mapper.createObjectNode();
    nested.putObject("order").put("order_state", 2);
    assertEquals(2, WechatOrderCenterService.orderState(
        new WechatOrderCenterService.CallResult(true, 0, "", nested)));
    var topOnly = mapper.createObjectNode();
    topOnly.put("order_state", 4);
    assertEquals(4, WechatOrderCenterService.orderState(
        new WechatOrderCenterService.CallResult(true, 0, "", topOnly)));
  }

  @Test
  void missingOrderStateResolvesToMinusOne() {
    var missing = new WechatOrderCenterService.CallResult(true, 0, "", null);
    assertEquals(-1, WechatOrderCenterService.orderState(missing));
  }

  @Test
  void confirmationCompletedCarriesTheAppidAsRequiredByWechat() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/is_trade_management_confirmation_completed?access_token=order-center-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json("{\"appid\":\"order-center-test-app\"}", JsonCompareMode.STRICT))
        .andRespond(withSuccess(
            "{\"errcode\":0,\"is_completed\":true}", MediaType.APPLICATION_JSON));

    var result = service.confirmationCompleted();

    assertTrue(result.attempted());
    assertEquals(0, result.errcode());
    wechat.verify();
  }

  @Test
  void fractionalOrMalformedErrcodeIsNeverTreatedAsSuccess() {
    var responses = new String[] {"{}", "{\"errcode\":0.5}", "{\"errcode\":\"0\"}", "{\"errcode\":4294967296}"};
    // 网关会缓存 token：全部期望预先声明，四次复核共用同一 token。
    expectAccessToken();
    for (String response : responses)
      wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order?access_token=order-center-token"))
          .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
    for (String ignored : responses) {
      var result = service.verifyReceiptConfirmed("4200000001");
      assertTrue(result.attempted());
      assertEquals(-1, result.errcode());
    }
    wechat.verify();
  }

  @Test
  void credentialErrorsInvalidateTheCachedTokenForTheNextCall() {
    // 顺序：取 token → 42001（作废缓存）→ 重新取 token → 成功
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order?access_token=order-center-token"))
        .andRespond(withSuccess("{\"errcode\":42001,\"errmsg\":\"access_token expired\"}", MediaType.APPLICATION_JSON));
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order?access_token=order-center-token"))
        .andRespond(withSuccess("{\"errcode\":0,\"order\":{\"order_state\":3}}", MediaType.APPLICATION_JSON));
    assertEquals(42001, service.verifyReceiptConfirmed("4200000001").errcode());
    assertEquals(0, service.verifyReceiptConfirmed("4200000001").errcode());
    wechat.verify();
  }

  @Test
  void disabledServiceSkipsAllCalls() {
    var gateway = new WechatNotificationGateway(
        "", "", false, "", "thing1", "time2", "thing3", "trial");
    var disabled = new WechatOrderCenterService(gateway, false);

    var path = disabled.updateOrderDetailPath("pages/order-detail/index?no=${商品订单号}");
    var verify = disabled.verifyReceiptConfirmed("4200000001");
    var remind = disabled.notifyConfirmReceive("4200000001");
    var confirmation = disabled.confirmationCompleted();

    assertFalse(path.attempted());
    assertFalse(verify.attempted());
    assertFalse(remind.attempted());
    assertFalse(confirmation.attempted());
    wechat.verify();
  }

  @Test
  void receiptVerificationFailsClosedWhenEnabledButUnconfigured() {
    // 已启用但缺少小程序配置：按核对失败处理（attempted + errcode=-1），不放行本地确认收货
    var gateway = new WechatNotificationGateway("", "", false, "", "thing1", "time2", "thing3", "trial");
    var enabled = new WechatOrderCenterService(gateway, true);
    var result = enabled.verifyReceiptConfirmed("4200000001");
    assertTrue(result.attempted());
    assertEquals(-1, result.errcode());
    wechat.verify();
  }

  private void expectAccessToken() {
    wechat.expect(requestTo(WECHAT + "/cgi-bin/token?grant_type=client_credential&appid=" + APP
            + "&secret=order-center-test-secret"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("{\"access_token\":\"order-center-token\",\"expires_in\":7200}",
            MediaType.APPLICATION_JSON));
  }

  @Test
  void setsMsgJumpPathWithAccessTokenAndStripsWhitespace() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/set_msg_jump_path?access_token=order-center-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json("{\"path\":\"pages/order-detail/index\"}", JsonCompareMode.STRICT))
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));
    var result = service.setMsgJumpPath(" pages/order-detail/index ");
    assertTrue(result.attempted());
    assertEquals(0, result.errcode());
    wechat.verify();
  }

  @Test
  void invalidJumpPathNeverCallsWechat() {
    for (String path : new String[] {"", "   ", "javascript:alert(1)", "https://example.com/x",
        "a".repeat(257), null}) {
      var thrown = assertThrows(ApiException.class, () -> service.setMsgJumpPath(path));
      assertEquals(400, thrown.status);
      assertEquals("INVALID_JUMP_PATH", thrown.code);
    }
    wechat.verify();
  }

  @Test
  void queriesWechatOrderListWithStrictBodyAndCappedPageSize() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order_list?access_token=order-center-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json(
            "{\"pay_time_range\":{\"begin_time\":100,\"end_time\":200},\"order_state\":2,"
                + "\"openid\":\"o-pay\",\"page_size\":100}", JsonCompareMode.STRICT))
        .andRespond(withSuccess(
            "{\"errcode\":0,\"last_index\":\"idx\",\"has_more\":false,\"order_list\":[]}",
            MediaType.APPLICATION_JSON));
    var result = service.getOrderList(100L, 200L, 2, "o-pay", null, 500);
    assertEquals(0, result.errcode());
    assertEquals("idx", result.body().path("last_index").asText());
    wechat.verify();
  }

  @Test
  void orderListWithoutFiltersSendsEmptyBody() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/get_order_list?access_token=order-center-token"))
        .andExpect(content().json("{}", JsonCompareMode.STRICT))
        .andRespond(withSuccess("{\"errcode\":0,\"order_list\":[]}", MediaType.APPLICATION_JSON));
    assertEquals(0, service.getOrderList(null, null, null, null, null, null).errcode());
    wechat.verify();
  }
}
