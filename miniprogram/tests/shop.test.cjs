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
    if (path.endsWith("/pay"))
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
  assert.deepEqual(paths, ["/orders/order-1/pay", "/orders/order-1/verify"]);
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
test("invalid prepay payload never launches payment sheet", async () => {
  for (const payload of [null, {}, {timeStamp: "1", nonceStr: "n", package: "wrong", signType: "RSA", paySign: "x"}]) {
    api.request = async () => payload;
    await assert.rejects(shop.payOrder("order-1"), /参数异常/);
    assert.equal(paymentOptions, undefined);
  }
});
test("verification retries pending settlement and accepts only server-paid order", async () => {
  let calls = 0;
  api.request = async (path, method) => {
    assert.equal(path, "/orders/order-1/verify");
    assert.equal(method, "POST");
    return {...order, status: ++calls < 2 ? "PENDING_PAYMENT" : "PAID"};
  };
  assert.equal((await shop.verifyPayment("order-1")).status, "PAID");
  assert.equal(calls, 2);
});
test("verification stops on hidden page and ignores late paid response", async () => {
  let release, active = true;
  api.request = () => new Promise(resolve => release = resolve);
  const pending = shop.verifyPayment("order-1", () => active);
  active = false;
  release({...order, status:"PAID"});
  await assert.rejects(pending, /页面/);
});
test("verification never accepts a different order or retries unauthorized", async () => {
  let calls = 0;
  api.request = async () => { calls++; throw new api.ApiError("请重新登录", 401, "UNAUTHORIZED"); };
  await assert.rejects(shop.verifyPayment("order-1"), /登录/);
  assert.equal(calls, 1);
});
test("verification is bounded and retains server pending without inventing payment", async () => {
  let calls = 0;
  api.request = async () => { calls++; return {...order}; };
  assert.equal((await shop.verifyPayment("order-1")).status, "PENDING_PAYMENT");
  assert.equal(calls, 4);
});
test("verification recovers a transient query failure without launching payment", async () => {
  let calls = 0;
  api.request = async () => { if (++calls === 1) throw new api.ApiError("查询不可用", 502, "WECHAT_QUERY_FAILED"); return {...order,status:"PAID"}; };
  assert.equal((await shop.verifyPayment("order-1")).status,"PAID");
  assert.equal(paymentOptions,undefined);
});
test("verification cannot treat another order response as this purchase", async () => {
  api.request = async () => ({...order,id:"other-order",status:"PAID"});
  await assert.rejects(shop.verifyPayment("order-1"), /暂未确认/);
});
