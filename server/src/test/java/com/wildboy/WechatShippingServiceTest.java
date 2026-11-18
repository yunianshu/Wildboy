package com.wildboy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;
import org.springframework.web.client.RestClient;

class WechatShippingServiceTest {
  private static final String WECHAT = "https://api.weixin.qq.com";
  private static final String APP = "shipping-test-app";
  private static final String USER = "shipping-test-user";
  private static final String OPENID = "shipping-test-openid";
  private static final String SHOP_TRANSACTION = "4200000000000000000000000001";
  private static final String ACTIVITY_TRANSACTION = "4200000000000000000000000002";
  private static final Instant START = Instant.parse("2026-11-18T00:00:00Z");

  private AuthService auth;
  private WechatNotificationGateway gateway;
  private MockRestServiceServer wechat;
  private WechatShippingService shipping;

  @BeforeEach
  void useSimulatedWechat() {
    var builder = RestClient.builder().baseUrl(WECHAT);
    wechat = MockRestServiceServer.bindTo(builder).build();
    gateway = new WechatNotificationGateway(
        APP, "shipping-test-secret", false, "", "thing1", "time2", "thing3", "trial");
    auth = mock(AuthService.class);
    when(auth.wechatOpenid(USER)).thenReturn(OPENID);
    shipping = new WechatShippingService(gateway, auth, true);
    RestClient client = builder.build();
    ReflectionTestUtils.setField(gateway, "client", client);
    ReflectionTestUtils.setField(shipping, "client", client);
    at(START);
  }

  @Test
  void reportsPhysicalShipmentByWechatTransactionAndCarrierCode() {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/cgi-bin/express/delivery/open_msg/get_delivery_list?access_token=shipping-test-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().json("{}", JsonCompareMode.STRICT))
        .andRespond(withSuccess("""
            {"errcode":0,"errmsg":"ok","delivery_list":[{"delivery_id":"SF","delivery_name":"顺丰速运"}]}
            """, MediaType.APPLICATION_JSON));
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(jsonPath("$.order_key.order_number_type").value(2))
        .andExpect(jsonPath("$.order_key.transaction_id").value(SHOP_TRANSACTION))
        .andExpect(jsonPath("$.order_key.out_trade_no").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.payer.openid").value(OPENID))
        .andExpect(jsonPath("$.logistics_type").value(1))
        .andExpect(jsonPath("$.delivery_mode").value(1))
        .andExpect(jsonPath("$.shipping_list[0].express_company").value("SF"))
        .andExpect(jsonPath("$.shipping_list[0].tracking_no").value("323244567777"))
        .andExpect(jsonPath("$.shipping_list[0].item_desc").value("水壶×2"))
        .andExpect(jsonPath("$.shipping_list[0].contact.receiver_contact").value("****1234"))
        .andExpect(jsonPath("$.shipping_list[0].company").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.shipping_list[0].owner").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.shipping_list[0].tel").doesNotHaveJsonPath())
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

    TransactionSynchronizationManager.initSynchronization();
    try {
      shipping.uploadShopShipment(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777");
      verifyNoInteractions(auth);
      TransactionSynchronizationUtils.triggerAfterCommit();
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }

    wechat.verify();
  }

  @Test
  void reportsPaidActivityAsVirtualFulfillmentWithoutCourierData() {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(jsonPath("$.order_key.order_number_type").value(2))
        .andExpect(jsonPath("$.order_key.transaction_id").value(ACTIVITY_TRANSACTION))
        .andExpect(jsonPath("$.order_key.out_trade_no").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.payer.openid").value(OPENID))
        .andExpect(jsonPath("$.logistics_type").value(3))
        .andExpect(jsonPath("$.shipping_list[0].item_desc").value("徒步活动×2"))
        .andExpect(jsonPath("$.shipping_list[0].express_company").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.shipping_list[0].tracking_no").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.shipping_list[0].contact").doesNotHaveJsonPath())
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

    // The caller has verified the payment, while its prepayment snapshot has no transaction ID yet.
    shipping.uploadActivityFulfillment(activityOrder(), ACTIVITY_TRANSACTION);

    wechat.verify();
  }

  @Test
  void doesNotReportOrdersWithoutAWechatTransaction() {
    shipping.uploadShopShipment(shopOrder(null), "DHL", "323244567777");
    shipping.uploadActivityFulfillment(activityOrder(), null);

    wechat.verify();
  }

  @Test
  void doesNotReportAnActivityAfterTheLocalTransactionRollsBack() {
    TransactionSynchronizationManager.initSynchronization();
    try {
      shipping.uploadActivityFulfillment(activityOrder(), ACTIVITY_TRANSACTION);
      TransactionSynchronizationUtils.triggerAfterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }

    verifyNoInteractions(auth);
    wechat.verify();
  }

  @Test
  void probesAgainAfterWechatReturnsATemporaryError() {
    expectAccessToken();
    expectTradeManagementProbe("{\"errcode\":-1,\"errmsg\":\"system error\"}");
    expectTradeManagementProbe("{\"errcode\":0,\"errmsg\":\"ok\",\"is_trade_managed\":true}");
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(jsonPath("$.order_key.transaction_id").value(ACTIVITY_TRANSACTION))
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), "4200000000000000000000000000");
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("trade_management_query_failed");
    // Other orders share the failed probe until its cooldown expires.
    at(START.plusSeconds(59));
    assertThat(shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777"))
        .isEqualTo(failed);
    at(START.plusSeconds(60));
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);

    wechat.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "{\"errcode\":40001,\"is_trade_managed\":true}",
      "{\"errcode\":0}",
      "{\"errcode\":0,\"is_trade_managed\":\"true\"}",
      "{\"is_trade_managed\":false}",
      "{\"errcode\":\"0\",\"is_trade_managed\":true}",
      "{\"errcode\":false,\"is_trade_managed\":true}",
      "{\"errcode\":0.5,\"is_trade_managed\":true}",
      "{\"errcode\":4294967296,\"is_trade_managed\":true}",
      "null", "invalid-json"
  })
  void failedOrIncompleteProbesStayRetryableAndCanRecover(String response) {
    expectAccessToken();
    expectTradeManagementProbe(response);
    expectTradeManagementProbe("{\"errcode\":0,\"is_trade_managed\":true}");
    expectSuccessfulActivityUpload();

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.errcode()).isNotZero();
    assertThat(failed.error()).isEqualTo("trade_management_query_failed");
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION)).isEqualTo(failed);
    at(START.plusSeconds(60));
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);
    wechat.verify();
  }

  @Test
  void networkFailureInProbeIsRetryableAndThrottled() {
    expectAccessToken();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/is_trade_managed?access_token=shipping-test-token"))
        .andRespond(request -> { throw new IOException("simulated connection failure"); });
    expectTradeManagementProbe("{\"errcode\":0,\"is_trade_managed\":true}");
    expectSuccessfulActivityUpload();

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("trade_management_query_failed");
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION)).isEqualTo(failed);
    at(START.plusSeconds(60));
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);
    wechat.verify();
  }

  @Test
  void persistentProbeFailureUsesGrowingCooldownCappedAtAnHour() {
    expectAccessToken();
    long[] minutes = {1, 2, 4, 8, 16, 32, 60, 60, 60};
    wechat.expect(ExpectedCount.times(minutes.length),
            requestTo(WECHAT + "/wxa/sec/order/is_trade_managed?access_token=shipping-test-token"))
        .andRespond(withSuccess("{\"errcode\":-1}", MediaType.APPLICATION_JSON));
    Instant now = START;
    for (long delay : minutes) {
      at(now);
      var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
      assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
      at(now.plus(Duration.ofMinutes(delay)).minusSeconds(1));
      assertThat(shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777"))
          .isEqualTo(failed);
      now = now.plus(Duration.ofMinutes(delay));
    }
    wechat.verify();
  }

  @Test
  void notOpenedManagementWaitsSixHoursAndThenRecovers() {
    expectAccessToken();
    expectTradeManagementProbe("{\"errcode\":0,\"is_trade_managed\":false}");
    expectTradeManagementProbe("{\"errcode\":0,\"is_trade_managed\":true}");
    expectSuccessfulActivityUpload();

    var notOpen = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(notOpen.outcome()).isEqualTo(WechatShippingService.Outcome.NOT_OPEN);
    assertThat(notOpen.error()).isEqualTo("trade_management_not_open");
    at(START.plus(Duration.ofHours(6)).minusSeconds(1));
    assertThat(shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777"))
        .isEqualTo(notOpen);
    at(START.plus(Duration.ofHours(6)));
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);
    wechat.verify();
  }

  @Test
  void disabledShippingDoesNotProbeAndDoesNotMeanPermanentlyInapplicable() {
    var disabled = new WechatShippingService(gateway, auth, false);
    ReflectionTestUtils.setField(disabled, "client", ReflectionTestUtils.getField(shipping, "client"));

    assertThat(disabled.shippingEnabled()).isFalse();
    assertThat(disabled.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.DISABLED);
    assertThat(disabled.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777").outcome())
        .isEqualTo(WechatShippingService.Outcome.DISABLED);
    verifyNoInteractions(auth);
    wechat.verify();
  }

  @Test
  void missingConfigurationIsRetryableWithoutExternalCalls() {
    ReflectionTestUtils.setField(gateway, "secret", "");

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("shipping_configuration_unavailable");
    verifyNoInteractions(auth);
    wechat.verify();
  }

  @Test
  void accessTokenRejectionIsRetryableAndRecoversAfterCooldown() {
    wechat.expect(requestTo(WECHAT + "/cgi-bin/token?grant_type=client_credential&appid=" + APP
            + "&secret=shipping-test-secret"))
        .andRespond(withSuccess("{\"errcode\":40164,\"errmsg\":\"simulated rejection\"}", MediaType.APPLICATION_JSON));
    expectAvailableShippingManagement();
    expectSuccessfulActivityUpload();

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("trade_management_query_failed");
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION)).isEqualTo(failed);
    at(START.plusSeconds(60));
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);
    wechat.verify();
  }

  @Test
  void accessTokenNetworkFailureIsRetryable() {
    wechat.expect(requestTo(WECHAT + "/cgi-bin/token?grant_type=client_credential&appid=" + APP
            + "&secret=shipping-test-secret"))
        .andRespond(request -> { throw new IOException("simulated token timeout"); });

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("trade_management_query_failed");
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION)).isEqualTo(failed);
    wechat.verify();
  }

  @Test
  void identityDatabaseFailureDoesNotPermanentlySkipAnOrder() {
    when(auth.wechatOpenid(USER)).thenThrow(new DataAccessResourceFailureException("simulated database outage"))
        .thenReturn(OPENID);
    expectAvailableShippingManagement();
    expectSuccessfulActivityUpload();

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("identity_lookup_failed");
    assertThat(shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION).outcome())
        .isEqualTo(WechatShippingService.Outcome.REPORTED);
    wechat.verify();
  }

  @Test
  void explicitlyNonWechatIdentityIsPermanentlyInapplicable() {
    when(auth.wechatOpenid(USER)).thenThrow(new ApiException(409, "WECHAT_IDENTITY_REQUIRED", "not a wechat user"));

    var skipped = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(skipped.outcome()).isEqualTo(WechatShippingService.Outcome.INAPPLICABLE);
    assertThat(skipped.error()).isEqualTo("no_wechat_identity");
    wechat.verify();
  }

  @Test
  void unrelatedIdentityApiFailureIsRetryable() {
    when(auth.wechatOpenid(USER)).thenThrow(new ApiException(503, "IDENTITY_UNAVAILABLE", "simulated outage"));

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("identity_lookup_failed");
    wechat.verify();
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"   "})
  void absentTransactionIsPermanentlyInapplicableWithoutEvenResolvingIdentity(String transaction) {
    var skipped = shipping.uploadActivityFulfillmentNow(activityOrder(), transaction);
    assertThat(skipped.outcome()).isEqualTo(WechatShippingService.Outcome.INAPPLICABLE);
    assertThat(skipped.error()).isEqualTo("missing_transaction");
    verifyNoInteractions(auth);
    wechat.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {"{\"errcode\":-1}", "{\"errcode\":0}", "{\"errcode\":0,\"delivery_list\":[]}"})
  void carrierLookupFailureIsRetryableInsteadOfPermanentSkip(String response) {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/cgi-bin/express/delivery/open_msg/get_delivery_list?access_token=shipping-test-token"))
        .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

    var failed = shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777");
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("shipping_payload_unavailable");
    wechat.verify();
  }

  @Test
  void missingShippingDetailsStayRetryableAndDoNotUpload() {
    expectAvailableShippingManagement();

    var missingCompany = shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "", "323244567777");
    var missingTracking = shipping.uploadShopShipmentNow(shopOrder(SHOP_TRANSACTION), "顺丰速运", null);
    assertThat(missingCompany.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(missingCompany.error()).isEqualTo("shipping_payload_unavailable");
    assertThat(missingTracking).isEqualTo(missingCompany);
    wechat.verify();
  }

  @Test
  void uploadNetworkFailureRemainsRetryable() {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andRespond(request -> { throw new IOException("simulated upload timeout"); });

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.error()).isEqualTo("shipping_request_failed");
    wechat.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "{}", "null", "{\"errcode\":\"0\"}", "{\"errcode\":false}",
      "{\"errcode\":0.5}", "{\"errcode\":4294967296}"
  })
  void malformedUploadResponseCannotBecomeReported(String response) {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

    var failed = shipping.uploadActivityFulfillmentNow(activityOrder(), ACTIVITY_TRANSACTION);
    assertThat(failed.outcome()).isEqualTo(WechatShippingService.Outcome.RETRYABLE);
    assertThat(failed.errcode()).isEqualTo(-1);
    assertThat(failed.error()).isEqualTo("upload_shipping_info");
    wechat.verify();
  }

  @Test
  void reportsTheUploadOutcomeThroughTheConsumerCallback() {
    expectAvailableShippingManagement();
    wechat.expect(requestTo(WECHAT + "/cgi-bin/express/delivery/open_msg/get_delivery_list?access_token=shipping-test-token"))
        .andRespond(withSuccess(
            "{\"errcode\":0,\"errmsg\":\"ok\",\"delivery_list\":[{\"delivery_id\":\"SF\",\"delivery_name\":\"顺丰速运\"}]}",
            MediaType.APPLICATION_JSON));
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andRespond(withSuccess("{\"errcode\":0,\"errmsg\":\"ok\"}", MediaType.APPLICATION_JSON));
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andRespond(withSuccess("{\"errcode\":9400001,\"errmsg\":\"order not found\"}", MediaType.APPLICATION_JSON));

    var accepted = new java.util.concurrent.atomic.AtomicReference<WechatShippingService.UploadResult>();
    var rejected = new java.util.concurrent.atomic.AtomicReference<WechatShippingService.UploadResult>();
    TransactionSynchronizationManager.initSynchronization();
    try {
      shipping.uploadShopShipment(shopOrder(SHOP_TRANSACTION), "顺丰速运", "323244567777", accepted::set);
      shipping.uploadActivityFulfillment(activityOrder(), ACTIVITY_TRANSACTION, rejected::set);
      TransactionSynchronizationUtils.triggerAfterCommit();
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }

    var ok = accepted.get();
    assert ok != null && ok.attempted() && ok.errcode() == 0;
    var failed = rejected.get();
    assert failed != null && failed.attempted() && failed.errcode() == 9400001;
    wechat.verify();
  }

  @Test
  void skippedOrdersNeverCallWechatAndCarryASkipReason() {
    var skipped = new java.util.concurrent.atomic.AtomicReference<WechatShippingService.UploadResult>();
    shipping.uploadShopShipment(shopOrder(null), "顺丰速运", "323244567777", skipped::set);

    var result = skipped.get();
    assert result != null && !result.attempted() && "missing_transaction".equals(result.error());
    verifyNoInteractions(auth);
    wechat.verify();
  }

  private void expectAvailableShippingManagement() {
    expectAccessToken();
    expectTradeManagementProbe("{\"errcode\":0,\"errmsg\":\"ok\",\"is_trade_managed\":true}");
  }

  private void expectAccessToken() {
    wechat.expect(requestTo(WECHAT + "/cgi-bin/token?grant_type=client_credential&appid=" + APP
            + "&secret=shipping-test-secret"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("{\"access_token\":\"shipping-test-token\",\"expires_in\":7200}",
            MediaType.APPLICATION_JSON));
  }

  private void expectTradeManagementProbe(String response) {
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/is_trade_managed?access_token=shipping-test-token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(jsonPath("$.appid").value(APP))
        .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
  }

  private void expectSuccessfulActivityUpload() {
    wechat.expect(requestTo(WECHAT + "/wxa/sec/order/upload_shipping_info?access_token=shipping-test-token"))
        .andExpect(jsonPath("$.order_key.transaction_id").value(ACTIVITY_TRANSACTION))
        .andRespond(withSuccess("{\"errcode\":0}", MediaType.APPLICATION_JSON));
  }

  private void at(Instant instant) {
    ReflectionTestUtils.setField(shipping, "clock", Clock.fixed(instant, ZoneOffset.UTC));
  }

  private static ShopModels.Order shopOrder(String transactionId) {
    return new ShopModels.Order("shop-order-id", "SHOP-ORDER-NO", USER, 1000, "SHIPPED", "测试收件人",
        "18900001234", "测试地址", transactionId, transactionId != null, null, 1,
        null, null, null, false,
        List.of(new ShopModels.OrderItem("item-id", "product-id", "水壶", "", 500, 2, 500, "")),
        1000, null, null, "", "");
  }

  private static ActivityOrderModels.Order activityOrder() {
    return new ActivityOrderModels.Order("activity-order-id", "ACTIVITY-ORDER-NO", "activity-id", "徒步活动",
        USER, "PENDING_PAYMENT", 2, 1000, 1000, "CNY", null, null, true, null, 1);
  }
}
