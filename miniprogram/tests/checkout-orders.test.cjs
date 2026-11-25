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
const standardQuote = { productId: 'product-1', quantity: 1, originalTotalCents: 1200, totalCents: 1200, pricing: {originalPriceCents:1200,priceCents:1200,tierName:null} };
function checkout() {
  const p = page("checkout");
  Object.assign(p.data, {
    id: "product-1",
    quantity: 1,
    quote: structuredClone(standardQuote),
    quoteSession: session,
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
    if (path === "/shop/products/product-1/quote?quantity=1") return standardQuote;
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
    if (path.includes("/quote?")) return standardQuote;
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
  assert.match(p.data.recoveryError, /待核对/);
  await p.resumeCheckout();
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
test("resume finds a committed last-stock order before reading quote or address", async () => {
  const p = checkout();
  const path = "/orders/by-request/";
  let requestId;
  api.request = async (url, method, data) => {
    requests.push(url);
    if (url.startsWith(path) && requestId) return baseOrder;
    if (url.startsWith(path)) throw new api.ApiError("不存在", 404, "NOT_FOUND");
    if (url === "/me/addresses") return { items: [savedAddress] };
    if (url === "/orders" && method === "POST") {
      requestId = data.requestId;
      throw new Error("提交结果丢失");
    }
    throw new Error("找回原订单前不应读取报价或开启支付");
  };
  await p.submit();
  assert.match(p.data.recoveryError, /待核对/);
  p.onHide();
  p.setData({ product: { id: "product-1", stock: 0 }, selectedAddressId: "", legal: null });
  requests.length = 0;
  p.onShow();
  await flush();
  assert.deepEqual(requests, [path + requestId]);
  assert.equal(p.data.order.id, baseOrder.id);
  assert.equal(p.data.recoveredOrder, true);
  assert.equal(p.data.recoveryError, "");
});
test("explicit order recovery preserves the intent through repeated weak reads", async () => {
  const p = checkout();
  const key = shop.checkoutRequestId("user-1", "product-1", 1);
  p.setData({ recoveryError: "订单待核对", quote: null, selectedAddressId: "" });
  api.request = async (path) => {
    requests.push(path);
    if (requests.length === 1) throw new Error("查单暂时失败");
    return baseOrder;
  };
  await p.resumeCheckout();
  assert.equal(shop.pendingCheckoutRequestId("user-1", "product-1", 1), key);
  assert.match(p.data.recoveryError, /查单暂时失败/);
  await p.resumeCheckout();
  assert.deepEqual(requests, Array(2).fill("/orders/by-request/" + key));
  assert.equal(p.data.order.id, baseOrder.id);
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
  p.data.items = [p.view(baseOrder)];
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
  p.data.items = [p.view(baseOrder)];
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
  api.request = (path) => path.endsWith("/verify") ? Promise.resolve(baseOrder) : new Promise((resolve) => (release = resolve));
  wx.requestPayment = () => native++;
  const result = shop.payOrder("order-1");
  await flush();
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
test("checkout automatically reconciles an attempted payment on return", async () => {
  const p = checkout(); p.data.order = { ...baseOrder, paymentInitiated:true };
  api.request = async (path, method) => { requests.push({path,method}); return {...baseOrder,status:"PAID"}; };
  await p.onShow();
  assert.equal(p.data.order.status,"PAID");
  assert.deepEqual(requests,[{path:"/orders/order-1/verify",method:"POST"}]);
});
test("returning to an unattempted checkout does not contact payment endpoints", async () => {
  const p = checkout();
  p.data.order = { ...baseOrder, paymentInitiated: false, reconciliationRequired: false };
  await p.onShow();
  assert.deepEqual(requests, []);
});
test("order list provides active reconciliation without repeat payment", async () => {
  const p = page("orders"); p.data.loading = false; p.data.items = [p.view({ ...baseOrder, paymentInitiated:true })];
  api.request = async (path, method) => { requests.push({path,method}); return {...baseOrder,status:"PAID"}; };
  await p.reconcilePending();
  assert.equal(p.data.items[0].status,"PAID");
  assert.deepEqual(requests,[{path:"/orders/order-1/verify",method:"POST"}]);
});

test("refund modal only submits after reason and shows pending review, not refunded",async()=>{
 const p=page("orders");p.data.loading=false;api.request=async(path,method,data)=>{requests.push({path,method,data});return method==="POST"?{id:"r",orderId:"order-1",status:"REQUESTED",reason:data.reason}:null;};
 await p.openRefund(event("order-1"));assert.equal(p.data.refundOrderId,"order-1");assert.equal(p.data.refundRecord,null);
 await p.requestRefund();assert.match(p.data.refundError,/原因/);assert.equal(requests.length,1);
 p.refundInput({detail:{value:"不再需要"}});await p.requestRefund();assert.equal(p.data.refundRecord.status,"REQUESTED");assert.equal(p.data.refundStatusText,"待审核");
 await p.requestRefund();assert.equal(requests.filter(r=>r.method==="POST").length,1);
 p.closeRefund();assert.equal(p.data.refundOrderId,"");
});
test("refund cancellation and hidden-page responses do not retain private data",async()=>{
 const p=page("orders");p.data.loading=false;let resolve;api.request=()=>new Promise(r=>resolve=r);
 const pending=p.openRefund(event("order-1"));p.onHide();resolve({id:"r",status:"REQUESTED",reason:"private"});await pending;
 assert.equal(p.data.refundOrderId,"");assert.equal(p.data.refundRecord,null);
});
test("refund submission uses current identity and duplicate clicks send once",async()=>{
 const p=page("orders");p.setData({loading:false,refundOrderId:"order-1",refundReason:"不再需要"});let resolve;let calls=0;api.request=()=>{calls++;return new Promise(r=>resolve=r);};
 const pending=p.requestRefund();await p.requestRefund();assert.equal(calls,1);session++;resolve({id:"r",status:"REQUESTED"});await pending;assert.equal(p.data.refundRecord,null);
});
test("rejected or closed refunds can be re-requested but active or successful ones cannot",async()=>{
 // 已拒绝的退款允许重新提交
 const p=page("orders");p.data.loading=false;
 let record={id:"r1",orderId:"order-1",status:"REJECTED",reason:"第一次",decisionNote:"已沟通",lastError:"",amountCents:19905};
 api.request=async(path,method,data)=>{requests.push({path,method,data});
  if(method==="POST"){record={id:"r2",orderId:"order-1",status:"REQUESTED",reason:data.reason,decisionNote:"",lastError:"",amountCents:19905};return record;}
  return record;};
 await p.openRefund(event("order-1"));
 assert.equal(p.data.refundRecord.status,"REJECTED");
 assert.equal(p.data.refundReRequestable,true);
 assert.equal(p.data.refundStatusText,"已拒绝");
 p.refundInput({detail:{value:"重新申请退款"}});
 await p.requestRefund();
 assert.equal(p.data.refundRecord.status,"REQUESTED");
 assert.equal(p.data.refundReRequestable,false);
 assert.equal(p.data.refundStatusText,"待审核");
 await p.requestRefund();
 assert.equal(requests.filter(r=>r.method==="POST").length,1);
 // 进行中与已退款的申请不放开重申入口
 for(const status of ["REQUESTED","PROCESSING","UNKNOWN","ABNORMAL","SUCCESS"]){
  p.setData({refundOrderId:"order-1",refundRecord:{id:"x",orderId:"order-1",status,reason:"r",decisionNote:"",lastError:"",amountCents:19905},refundReRequestable:false,refundReason:"再来一次"});
  await p.requestRefund();
  assert.equal(requests.filter(r=>r.method==="POST").length,1,status+" 不应重复提交");
 }
 // 微信关闭的退款同样允许重新提交
 p.setData({refundOrderId:"order-1",refundRecord:{id:"c1",orderId:"order-1",status:"CLOSED",reason:"r",decisionNote:"",lastError:"",amountCents:19905},refundReRequestable:true,refundReason:"关闭后重申"});
 await p.requestRefund();
 assert.equal(p.data.refundRecord.status,"REQUESTED");
 assert.equal(requests.filter(r=>r.method==="POST").length,2);
 p.closeRefund();
 assert.equal(p.data.refundReRequestable,false);
});
test("refund dialog markup keeps the form available only for re-requestable records",()=>{
 const markup=fs.readFileSync("src/pages/orders/index.wxml","utf8");
 assert.match(markup,/wx:if="\{\{!refundRecord \|\| refundReRequestable\}\}"/);
 // 提交按钮与表单同门控；状态徽标仍只依赖记录存在
 const submit=markup.match(/<button[^>]*bindtap="requestRefund"[^>]*>/);
 assert.ok(submit);
 assert.match(submit[0],/wx:if="\{\{!refundRecord \|\| refundReRequestable\}\}"/);
});

test("refund actions cannot invalidate an in-flight order page and leave loading stuck", async () => {
  const p = page("orders");
  let release;
  api.request = (path) => {
    requests.push(path);
    if (path.startsWith("/orders?")) return new Promise(resolve => release = resolve);
    return Promise.resolve(null);
  };
  const loading = p.load();
  await p.openRefund(event("order-1"));
  p.setData({refundOrderId: "order-1", refundReason: "不再需要"});
  await p.requestRefund();
  release({items: [], page: 0, hasMore: false});
  await loading;
  assert.equal(p.data.loading, false);
  assert.equal(requests.length, 1);
});

test("server legal conflict loads current documents and requires fresh consent before retrying the order", async () => {
  const p=checkout();let legalReads=0,creates=0;
  const latest={...legalCurrent,privacy:{...legalCurrent.privacy,version:2}};
  legal.currentLegal=async()=>++legalReads===1?legalCurrent:latest;
  const normalRequest=api.request;
  api.request=async(path,method,data)=>{
    if(path==='/orders'&&method==='POST') {
      creates++;
      if(creates===1) throw new api.ApiError('协议已更新，请重新阅读并确认',409,'LEGAL_VERSION_CHANGED');
      assert.equal(data.privacyVersion,2);
    }
    return normalRequest(path,method,data);
  };
  await p.submit();
  assert.equal(p.data.legal.privacy.version,2);
  assert.equal(p.data.consent,false);assert.equal(p.data.privacyRead,false);assert.equal(p.data.termsRead,false);
  assert.equal(p.data.busy,false);assert.equal(p.data.order,null);
  p.privacy();assert.match(navigation.at(-1),/kind=PRIVACY&version=2/);
  await p.submit();assert.equal(creates,1);
  p.consentChange({detail:{value:['yes']}});await p.submit();
  assert.equal(creates,2);assert.equal(p.data.order.id,baseOrder.id);
});

test("failed legal recovery offers a retry that restores checkout without losing the address", async () => {
  const p=checkout();let legalReads=0;
  legal.currentLegal=async()=>{if(++legalReads>1)throw Error('暂时离线');return legalCurrent;};
  const normalRequest=api.request;
  api.request=async(path,method,data)=>{
    if(path==='/orders'&&method==='POST')throw new api.ApiError('协议尚未就绪',503,'LEGAL_NOT_READY');
    if(path==='/shop/products/product-1')return {id:'product-1',stock:3,imageUrl:'',priceCents:1200};
    return normalRequest(path,method,data);
  };
  await p.submit();assert.equal(p.data.legal,null);assert.equal(p.data.busy,false);
  const wxml=fs.readFileSync('src/pages/checkout/index.wxml','utf8');
  assert.match(wxml,/<button wx:if="\{\{!legal\}\}"[^>]*bindtap="retry"/);
  legal.currentLegal=async()=>legalCurrent;
  p.retry();await flush();
  assert.equal(p.data.legal.privacy.version,1);assert.equal(p.data.selectedAddressId,savedAddress.id);
  assert.equal(p.data.recipientName,savedAddress.recipientName);assert.equal(p.data.consent,false);
});

test("legal recovery after leaving checkout cannot write documents or restart an order", async () => {
  const p=checkout();let reads=0,release;
  legal.currentLegal=()=>++reads===1?Promise.resolve(legalCurrent):new Promise(resolve=>release=resolve);
  const normalRequest=api.request;
  api.request=async(path,method,data)=>{
    if(path==='/orders'&&method==='POST')throw new api.ApiError('协议已更新',409,'LEGAL_VERSION_CHANGED');
    return normalRequest(path,method,data);
  };
  const pending=p.submit();await flush();p.onHide();release(legalCurrent);await pending;
  assert.equal(p.data.legal,null);assert.equal(p.data.order,null);assert.equal(p.data.busy,false);
});

test("checkout accepts explicit agreement without requiring document-reader visits", async () => {
  const p=checkout();p.setData({consent:false,privacyRead:false,termsRead:false});
  await p.submit();assert.equal(requests.length,0);assert.match(p.data.error,/同意/);
  p.consentChange({detail:{value:['yes']}});await p.submit();
  assert.equal(p.data.order.id,baseOrder.id);
  assert.equal(requests.filter(request=>request.path==='/orders').length,1);
});


test('checkout always sends the displayed price and free orders never call payment', async () => {
  const p = checkout();
  p.data.quote.totalCents = 0;
  p.data.quote.pricing.priceCents = 0;
  const normal = api.request;
  api.request = async (path, method, data) => {
    if (path === '/orders') { requests.push({path,method,data}); return {...baseOrder,status:'CONFIRMED_FREE',totalCents:0,paidAt:null,paymentTransactionId:null}; }
    return normal(path,method,data);
  };
  await p.submit();
  assert.equal(requests.find(x=>x.path==='/orders').data.expectedTotalCents,0);
  assert.equal(p.data.orderStatusText,'免支付已确认');
  assert.equal(requests.some(x=>x.path.endsWith('/pay')),false);
  await p.payExisting();
  assert.equal(requests.some(x=>x.path.endsWith('/pay')),false);
});
test('price conflict refreshes quote but requires another explicit submission', async () => {
  const p = checkout();
  const normal = api.request;
  api.request = async (path,method,data) => {
    if(path==='/orders'){requests.push({path,method,data});throw new api.ApiError('changed',409,'PRICE_CHANGED');}
    if(path.includes('/quote?')) return {productId:'product-1',quantity:1,originalTotalCents:1200,totalCents:900,pricing:{originalPriceCents:1200,priceCents:900,tierName:'银卡'}};
    return normal(path,method,data);
  };
  await p.submit();
  assert.equal(requests.filter(x=>x.path==='/orders').length,1);
  assert.equal(p.data.quote.totalCents,900);
  assert.equal(p.data.totalText,'¥9.00');
  assert.equal(p.data.originalTotalText,'¥12.00');
  assert.match(p.data.error,/再次提交/);
  assert.equal(p.data.order,null);
});
test('quote failure and switched account quote fail closed before creating an order', async () => {
  const p=checkout();
  api.request=async()=>{throw new Error('quote unavailable');};
  await p.refreshQuote();
  await p.submit();
  assert.equal(p.data.quote,null);
  assert.equal(requests.length,0);
  assert.match(p.data.quoteError,/unavailable/);
  let release;
  api.request=()=>new Promise(resolve=>release=resolve);
  const pending=p.refreshQuote();
  session++;
  release({productId:'product-1',quantity:1,originalTotalCents:1200,totalCents:600,pricing:{originalPriceCents:1200,priceCents:600,tierName:'金卡'}});
  await pending;
  assert.equal(p.data.quote,null);
  assert.equal(p.data.totalText,'');
});
test('hidden quote cannot repopulate, returning refreshes without erasing legal consent', async () => {
  const p=checkout();
  let release;
  api.request=()=>new Promise(resolve=>release=resolve);
  const pending=p.refreshQuote();
  p.onHide();
  release({productId:'product-1',quantity:1,originalTotalCents:1200,totalCents:600,pricing:{originalPriceCents:1200,priceCents:600,tierName:'金卡'}});
  await pending;
  assert.equal(p.data.quote,null);
  assert.equal(p.data.consent,true);
  assert.equal(p.data.privacyRead,true);
});
test('malformed quote total never becomes payable', async () => {
  const p=checkout();
  api.request=async()=>({productId:'product-1',quantity:1,originalTotalCents:1200,totalCents:1,pricing:{originalPriceCents:1200,priceCents:900}});
  await p.refreshQuote();
  assert.equal(p.data.quote,null);
  assert.match(p.data.quoteError,/报价异常/);
});
test('free merchandise orders expose cancellation without implying payment or refund',async()=>{
 const p=page('orders');p.data.loading=false;p.data.items=[{...baseOrder,status:'CONFIRMED_FREE',totalCents:0}];
 let prompt;wx.showModal=async o=>{prompt=o;return {confirm:true};};
 api.request=async(path,method)=>{requests.push({path,method});return {...baseOrder,status:'CANCELLED',totalCents:0};};
 await p.cancel(event(baseOrder.id));assert.match(prompt.content,/免支付.*不涉及支付退款/);assert.equal(requests[0].path,'/orders/order-1/cancel');assert.equal(p.data.items[0].status,'CANCELLED');
 p.data.items=[{...baseOrder,status:'PAID'}];await p.cancel(event(baseOrder.id));assert.equal(requests.length,1);
 const markup=fs.readFileSync('src/pages/orders/index.wxml','utf8');assert.match(markup,/PENDING_PAYMENT' \|\| item.status === 'CONFIRMED_FREE'[\s\S]*?(?:bind|catch)tap="cancel"/);
});
