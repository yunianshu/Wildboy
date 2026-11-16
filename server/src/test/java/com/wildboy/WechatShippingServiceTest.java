package com.wildboy;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
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

  private AuthService auth;
  private MockRestServiceServer wechat;
  private WechatShippingService shipping;

  @BeforeEach
  void useSimulatedWechat() {
    var builder = RestClient.builder().baseUrl(WECHAT);
    wechat = MockRestServiceServer.bindTo(builder).build();
    var gateway = new WechatNotificationGateway(
        APP, "shipping-test-secret", false, "", "thing1", "time2", "thing3", "trial");
    auth = mock(AuthService.class);
    when(auth.wechatOpenid(USER)).thenReturn(OPENID);
    shipping = new WechatShippingService(gateway, auth, true);
    RestClient client = builder.build();
    ReflectionTestUtils.setField(gateway, "client", client);
    ReflectionTestUtils.setField(shipping, "client", client);
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

    shipping.uploadActivityFulfillment(activityOrder(), "4200000000000000000000000000");
    shipping.uploadActivityFulfillment(activityOrder(), ACTIVITY_TRANSACTION);

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

  private static ShopModels.Order shopOrder(String transactionId) {
    return new ShopModels.Order("shop-order-id", "SHOP-ORDER-NO", USER, 1000, "SHIPPED", "测试收件人",
        "18900001234", "测试地址", transactionId, transactionId != null, null, 1,
        null, null, null, false,
        List.of(new ShopModels.OrderItem("item-id", "product-id", "水壶", "", 500, 2, 500, "")),
        1000);
  }

  private static ActivityOrderModels.Order activityOrder() {
    return new ActivityOrderModels.Order("activity-order-id", "ACTIVITY-ORDER-NO", "activity-id", "徒步活动",
        USER, "PENDING_PAYMENT", 2, 1000, 1000, "CNY", null, null, true, null, 1);
  }
}
