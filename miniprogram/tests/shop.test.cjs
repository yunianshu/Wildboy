const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const shop = require("../dist/utils/shop.js");
const order = {
  id: "order-1",
  orderNo: "order-number-1",
  status: "PENDING_PAYMENT",
  totalCents: 19900,
  items: [],
};
let paymentOptions;
beforeEach(() => {
  paymentOptions = undefined;
  global.wx = {
    requestPayment(options) {
      paymentOptions = options;
      options.success();
    },
  };
});
test("money and order status are user readable", () => {
  assert.equal(shop.money(19900), "¥199.00");
  assert.equal(shop.money(5), "¥0.05");
  assert.equal(shop.orderStatusLabel("PENDING_PAYMENT"), "待支付");
  assert.equal(shop.orderStatusLabel("SHIPPED"), "已发货");
});
test("payment uses signed backend parameters then verifies server order", async () => {
  const paths = [];
  api.request = async (path, method) => {
    paths.push(path);
    if (method === "POST")
      return {
        timeStamp: "1",
        nonceStr: "nonce",
        package: "prepay_id=server",
        signType: "RSA",
        paySign: "signature",
      };
    return { ...order, status: "PAID" };
  };
  const result = await shop.payOrder("order-1");
  assert.equal(result.status, "PAID");
  assert.deepEqual(paths, ["/orders/order-1/pay", "/orders/order-1"]);
  assert.equal(paymentOptions.package, "prepay_id=server");
  assert.equal(paymentOptions.paySign, "signature");
});
test("cancelled payment keeps order pending and never invents success", async () => {
  const paths = [];
  api.request = async (path) => {
    paths.push(path);
    return {
      timeStamp: "1",
      nonceStr: "nonce",
      package: "prepay_id=server",
      signType: "RSA",
      paySign: "signature",
    };
  };
  wx.requestPayment = (options) => options.fail({ errMsg: "cancel" });
  await assert.rejects(shop.payOrder("order-1"), /订单已保留/);
  assert.deepEqual(paths, ["/orders/order-1/pay"]);
  assert.equal(order.status, "PENDING_PAYMENT");
});
