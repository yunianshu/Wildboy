const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = require("../dist/utils/api.js");
const shop = require("../dist/utils/shop.js");
const legal = require("../dist/utils/legal.js");
let definition, storage, requests, session, navigation;
global.Page = (value) => {
  definition = value;
};
const legalCurrent = {
  ready: true,
  privacy: { version: 1, kind: "PRIVACY", content: "privacy" },
  terms: { version: 1, kind: "TERMS", content: "terms" },
};
const baseOrder = {
  id: "order-1",
  orderNo: "2026-1",
  status: "PENDING_PAYMENT",
  totalCents: 1200,
  createdAt: "2026-10-28T00:00:00Z",
  items: [],
  recipientName: "原收货人",
  phone: "13800000000",
  address: "厦门市原地址",
};
function page(name) {
  const path = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[path];
  require(path);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  for (const key of Object.keys(p))
    if (typeof p[key] === "function") p[key] = p[key].bind(p);
  return p;
}
function checkout() {
  const p = page("checkout");
  Object.assign(p.data, {
    id: "product-1",
    quantity: 1,
    product: { id: "product-1", stock: 3 },
    legal: legalCurrent,
    selectedAddressId: "address-1",
    recipientName: "收货人",
    phone: "13800000000",
    address: "厦门市测试地址",
    consent: true,
    privacyRead: true,
    termsRead: true,
    loading: false,
    session,
  });
  return p;
}
const savedAddress = {
  id: "address-1",
  recipientName: "收货人",
  phone: "13800000000",
  address: "厦门市测试地址",
  isDefault: true,
};
const event = (id) => ({ currentTarget: { dataset: { id } } });
const flush = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
  storage = new Map();
  requests = [];
  session = 1;
  navigation = [];
  global.wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    navigateTo: (o) => navigation.push(o.url),
    redirectTo: (o) => navigation.push(o.url),
    requestPayment: (o) => o.fail({ errMsg: "cancel" }),
    showModal: async () => ({ confirm: true }),
    stopPullDownRefresh() {},
  };
  api.requireSession = async () => {};
  api.hasSession = () => true;
  api.getCurrentUser = async () => ({ id: "user-1", role: "USER" });
  api.sessionVersion = () => session;
  api.isSessionCurrent = (v) => v === session;
  legal.currentLegal = async () => legalCurrent;
  api.request = async (path, method = "GET", data) => {
    requests.push({ path, method, data });
    if (path === "/me/addresses") return { items: [savedAddress] };
    if (path.includes("/by-request/"))
      throw new api.ApiError("not found", 404, "NOT_FOUND");
    if (path === "/orders") return { ...baseOrder };
    if (path.endsWith("/pay"))
      return {
        timeStamp: "1",
        nonceStr: "x",
        package: "prepay_id=x",
        signType: "RSA",
        paySign: "x",
      };
    return { ...baseOrder };
  };
});
test("persistent opaque checkout identity survives reopen and is scoped by user/product/quantity", () => {
  const first = shop.checkoutRequestId("user-1", "p", 1);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(shop.checkoutRequestId("user-1", "p", 1), first);
  assert.notEqual(shop.checkoutRequestId("user-2", "p", 1), first);
  assert.notEqual(shop.checkoutRequestId("user-1", "p", 2), first);
  assert.ok(
    [...storage.values()].every(
      (v) => typeof v === "string" && v.length === 36,
    ),
  );
  shop.finishCheckoutIntent("user-1", "p", 1, "old");
  assert.equal(shop.pendingCheckoutRequestId("user-1", "p", 1), first);
  shop.finishCheckoutIntent("user-1", "p", 1, first);
  assert.equal(shop.pendingCheckoutRequestId("user-1", "p", 1), undefined);
});
test("lost create response retries original request identity, never uses a new key", async () => {
  const p = checkout();
  let first;
  api.request = async (path, method, data) => {
    if (path === "/me/addresses") return { items: [savedAddress] };
    if (path.includes("/by-request/"))
      throw new api.ApiError("missing", 404, "NOT_FOUND");
    if (path === "/orders") {
      requests.push(data);
      first ||= data.requestId;
      throw new Error("network timeout");
    }
  };
  await p.submit();
  assert.equal(p.data.busy, false);
  await p.submit();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].requestId, requests[1].requestId);
  assert.equal(shop.pendingCheckoutRequestId("user-1", "product-1", 1), first);
});
test("reopened checkout recovers original order before unavailable product lookup and never auto-pays", async () => {
  const requestId = shop.checkoutRequestId("user-1", "product-1", 1);
  const p = checkout();
  p.data.address = "new address";
  api.request = async (path) => {
    requests.push(path);
    assert.equal(path, `/orders/by-request/${requestId}`);
    return { ...baseOrder };
  };
  await p.load();
  assert.equal(p.data.order.address, "厦门市原地址");
  assert.equal(p.data.recoveredOrder, true);
  assert.equal(requests.length, 1);
  assert.equal(p.data.loading, false);
});
test("recover prior order even after shipping fields change, without creating or paying again", async () => {
  const p = checkout();
  const requestId = shop.checkoutRequestId("user-1", "product-1", 1);
  api.request = async (path) => {
    requests.push(path);
    assert.equal(path, `/orders/by-request/${requestId}`);
    return { ...baseOrder, status: "PAID" };
  };
  await p.submit();
  assert.equal(p.data.order.status, "PAID");
  assert.equal(p.data.recoveredOrder, true);
  assert.equal(requests.length, 1);
});
test("cancelled payment retains created order and exposes actionable error in result branch", async () => {
  const p = checkout();
  await p.submit();
  assert.equal(p.data.order.id, "order-1");
  assert.equal(p.data.awaitingConfirmation, false);
  assert.match(p.data.error, /订单已保留/);
  assert.equal(p.data.orderStatusText, "待支付");
  const wxml = fs.readFileSync("src/pages/checkout/index.wxml", "utf8");
  const branch = wxml.slice(
    wxml.indexOf('wx:elif="{{order}}"'),
    wxml.indexOf('wx:elif="{{product}}"'),
  );
  assert.match(branch, /wx:if="{{error}}"/);
  assert.match(branch, /orderStatusText/);
  p.showOrder({ ...baseOrder, status: "SHIPPED" });
  assert.equal(p.data.orderStatusText, "已发货");
});
test("late create response after hide keeps persisted identity and never triggers payment", async () => {
  const p = checkout();
  let release;
  api.request = async (path, method, data) => {
    if (path === "/me/addresses") return { items: [savedAddress] };
    if (path.includes("/by-request/"))
      throw new api.ApiError("missing", 404, "NOT_FOUND");
    if (path === "/orders")
      return new Promise((resolve) => (release = resolve));
    throw new Error("must not pay");
  };
  const submit = p.submit();
  await flush();
  p.onHide();
  release({ ...baseOrder });
  await submit;
  assert.equal(p.data.order, null);
  assert.ok(shop.pendingCheckoutRequestId("user-1", "product-1", 1));
});
test("account switch during legal fetch cannot create order for another identity", async () => {
  const p = checkout();
  let release;
  legal.currentLegal = () => new Promise((resolve) => (release = resolve));
  const pending = p.submit();
  await flush();
  session++;
  release(legalCurrent);
  await pending;
  assert.equal(requests.length, 0);
  p.onShow();
  assert.equal(p.data.address, "");
  assert.equal(p.data.order, null);
});
test("double submit only creates one order", async () => {
  const p = checkout();
  await Promise.all([p.submit(), p.submit()]);
  assert.equal(requests.filter((r) => r.path === "/orders").length, 1);
});
test("orders request subsequent pages and preserve first page on next-page failure", async () => {
  const p = page("orders");
  let fail = false;
  api.request = async (path) => {
    requests.push(path);
    if (path.includes("page=1") && fail) throw new Error("retry");
    return {
      items: [
        { ...baseOrder, id: path.includes("page=1") ? "order-2" : "order-1" },
      ],
      page: path.includes("page=1") ? 1 : 0,
      hasMore: !path.includes("page=1"),
    };
  };
  await p.load();
  fail = true;
  await p.load(false);
  assert.equal(p.data.items.length, 1);
  assert.equal(p.data.hasMore, true);
  assert.match(p.data.error, /retry/);
  fail = false;
  await p.load(false);
  assert.equal(p.data.items.length, 2);
  assert.equal(p.data.hasMore, false);
  assert.match(requests[1], /page=1&size=20/);
});
test("orders new status filter wins over slower old page response", async () => {
  const p = page("orders");
  let release;
  api.request = (path) => {
    requests.push(path);
    if (path.includes("status=PAID"))
      return Promise.resolve({
        items: [{ ...baseOrder, status: "PAID" }],
        page: 0,
        hasMore: false,
      });
    return new Promise((resolve) => (release = resolve));
  };
  const first = p.load();
  p.select({ currentTarget: { dataset: { code: "PAID" } } });
  await flush();
  release({ items: [{ ...baseOrder, id: "stale" }], page: 0, hasMore: false });
  await first;
  assert.equal(p.data.selected, "PAID");
  assert.equal(p.data.items[0].id, "order-1");
  assert.match(requests[1], /status=PAID/);
});
test("cancel confirmation after page hide cannot send mutation", async () => {
  const p = page("orders");
  p.data.loading = false;
  let release;
  wx.showModal = () => new Promise((resolve) => (release = resolve));
  const pending = p.cancel(event("order-1"));
  p.onHide();
  release({ confirm: true });
  await pending;
  assert.equal(requests.length, 0);
});
test("successful cancel removes row from pending status list", async () => {
  const p = page("orders");
  p.data.loading = false;
  p.data.selected = "PENDING_PAYMENT";
  p.data.items = [p.view(baseOrder)];
  api.request = async () => ({ ...baseOrder, status: "CANCELLED" });
  await p.cancel(event("order-1"));
  assert.deepEqual(p.data.items, []);
});
test("pay helper does not launch native payment when page became stale", async () => {
  let native = 0;
  wx.requestPayment = () => native++;
  await assert.rejects(
    shop.payOrder("order-1", () => false),
    /页面/,
  );
  assert.equal(native, 0);
});

test("cancel modal failure unlocks row without sending cancellation", async () => {
  const p = page("orders");
  p.data.loading = false;
  wx.showModal = async () => {
    throw new Error("弹窗未打开");
  };
  await p.cancel(event("order-1"));
  assert.equal(p.data.busyId, "");
  assert.equal(requests.length, 0);
  assert.match(p.data.error, /弹窗未打开/);
});
test("order list authentication revocation clears previously loaded private orders", async () => {
  const p = page("orders");
  p.data.loading = false;
  p.data.items = [p.view(baseOrder)];
  p.data.hasMore = true;
  api.request = async () => {
    api.hasSession = () => false;
    throw new api.ApiError("重新登录", 401, "UNAUTHORIZED");
  };
  await p.load(false);
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.loggedIn, false);
});
test("payment cannot open native sheet after account switches during prepay request", async () => {
  let release,
    native = 0;
  api.request = () => new Promise((resolve) => (release = resolve));
  wx.requestPayment = () => native++;
  const result = shop.payOrder("order-1");
  session++;
  release({ package: "prepay_id=x" });
  await assert.rejects(result, /登录状态/);
  assert.equal(native, 0);
});
test("server expiry is displayed rather than a locally invented payment deadline", () => {
  const order = { ...baseOrder, expiresAt: "2026-10-28T07:00:00Z" };
  const p = checkout();
  p.showOrder(order);
  assert.equal(p.data.orderDeadlineText, "10.28 15:00");
  assert.equal(page("orders").view(order).deadlineText, "10.28 15:00");
});

test("address changed on server requires explicit re-confirmation and no premature order", async () => {
  const p = checkout();
  api.request = async (path, method, data) => {
    requests.push({ path, method, data });
    if (path.includes("/by-request/"))
      throw new api.ApiError("missing", 404, "NOT_FOUND");
    if (path === "/me/addresses")
      return {
        items: [{ ...savedAddress, address: "厦门市已更新的街道地址" }],
      };
    throw new Error("must not create");
  };
  await p.submit();
  assert.match(p.data.error, /地址已更新/);
  assert.equal(p.data.address, "厦门市已更新的街道地址");
  assert.equal(requests.filter((r) => r.path === "/orders").length, 0);
  assert.equal(p.data.busy, false);
});
test("deleted selected address cannot create order", async () => {
  const p = checkout();
  api.request = async (path) => {
    requests.push(path);
    if (path.includes("/by-request/"))
      throw new api.ApiError("missing", 404, "NOT_FOUND");
    if (path === "/me/addresses") return { items: [] };
    throw new Error("must not create");
  };
  await p.submit();
  assert.match(p.data.error, /地址已删除/);
  assert.equal(p.data.selectedAddressId, "");
  assert.ok(!requests.includes("/orders"));
});
test("checkout explicit refresh actively reconciles rather than trusting local status", async () => {
  const p = checkout(); p.data.order = baseOrder;
  api.request = async (path, method) => { requests.push({path,method}); return {...baseOrder,status:"PAID"}; };
  await p.refreshOrder();
  assert.equal(p.data.order.status,"PAID");
  assert.deepEqual(requests,[{path:"/orders/order-1/verify",method:"POST"}]);
});
test("order list provides active reconciliation without repeat payment", async () => {
  const p = page("orders"); p.data.loading = false; p.data.items = [p.view(baseOrder)];
  api.request = async (path, method) => { requests.push({path,method}); return {...baseOrder,status:"PAID"}; };
  await p.verify(event("order-1"));
  assert.equal(p.data.items[0].status,"PAID");
  assert.deepEqual(requests,[{path:"/orders/order-1/verify",method:"POST"}]);
});

test("refund modal only submits after reason and shows pending review, not refunded",async()=>{
 const p=page("orders");api.request=async(path,method,data)=>{requests.push({path,method,data});return method==="POST"?{id:"r",orderId:"order-1",status:"REQUESTED",reason:data.reason}:null;};
 await p.openRefund(event("order-1"));assert.equal(p.data.refundOrderId,"order-1");assert.equal(p.data.refundRecord,null);
 await p.requestRefund();assert.match(p.data.refundError,/原因/);assert.equal(requests.length,1);
 p.refundInput({detail:{value:"不再需要"}});await p.requestRefund();assert.equal(p.data.refundRecord.status,"REQUESTED");assert.equal(p.data.refundStatusText,"待审核");
 await p.requestRefund();assert.equal(requests.filter(r=>r.method==="POST").length,1);
 p.closeRefund();assert.equal(p.data.refundOrderId,"");
});
test("refund cancellation and hidden-page responses do not retain private data",async()=>{
 const p=page("orders");let resolve;api.request=()=>new Promise(r=>resolve=r);
 const pending=p.openRefund(event("order-1"));p.onHide();resolve({id:"r",status:"REQUESTED",reason:"private"});await pending;
 assert.equal(p.data.refundOrderId,"");assert.equal(p.data.refundRecord,null);
});
test("refund submission uses current identity and duplicate clicks send once",async()=>{
 const p=page("orders");p.setData({refundOrderId:"order-1",refundReason:"不再需要"});let resolve;let calls=0;api.request=()=>{calls++;return new Promise(r=>resolve=r);};
 const pending=p.requestRefund();await p.requestRefund();assert.equal(calls,1);session++;resolve({id:"r",status:"REQUESTED"});await pending;assert.equal(p.data.refundRecord,null);
});
