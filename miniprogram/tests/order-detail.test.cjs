const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let PageDefinition, wxStubs, state;

function loadPageModule() {
  const filename = path.resolve(__dirname, '../src/pages/order-detail/index.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  PageDefinition = undefined;
  const context = vm.createContext({
    Page(value) { PageDefinition = value; },
    wx: wxStubs,
  });
  const apiStub = {
    hasSession: () => true,
    request: async (p, method) => {
      state.requests.push({ path: p, method: method || 'GET' });
      if (p.startsWith('/order-center/resolve')) return state.resolved;
      if (p.startsWith('/order-center/orders/')) return { orderId: 'order-1', receiptConfirmed: true };
      if (p.startsWith('/activity-orders/')) return state.activityOrder;
      if (p.startsWith('/orders/')) return state.shopOrder;
      throw new Error('unexpected path ' + p);
    },
  };
  const requireSource = request => {
    if (request.endsWith('/api')) return apiStub;
    if (request.endsWith('/models')) return {};
    if (request.endsWith('/domain'))
      return {
        message: e => String(e && e.message ? e.message : e),
        dateLabel: () => '时间',
        RequestEpoch: class { next() { return 1; } valid() { return true; } invalidate() {} },
      };
    if (request.endsWith('/shop'))
      return { money: c => '¥' + (c / 100).toFixed(2), orderStatusLabel: s => s };
    if (request.endsWith('/activity-orders'))
      return { activityOrderStatus: () => '已支付 · 报名已确认' };
    if (request.endsWith('/page-motion')) return { enterPage: () => {} };
    throw new Error('unexpected require ' + request);
  };
  const module = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(
    requireSource, module, module.exports);
  assert.ok(PageDefinition, '页面应注册 Page');
  return PageDefinition;
}

function makeInstance(definition, overrides = {}) {
  const instance = Object.create(definition);
  instance.data = { ...definition.data, detail: null, loading: false };
  instance.setData = function (patch) { Object.assign(this.data, patch); };
  Object.assign(instance, {
    orderId: '', orderType: '', pendingNo: '',
    ...overrides,
  });
  return instance;
}

function shopOrderFixture(overrides = {}) {
  return {
    id: 'order-1', orderNo: 'N-1', userId: 'u', totalCents: 39600, originalTotalCents: 39600,
    status: 'SHIPPED', recipientName: '张三', phone: '138****5678', address: '厦门',
    paymentTransactionId: '42000...1', paymentInitiated: true, paidAt: null, version: 1,
    createdAt: '2026-11-16T00:00:00Z', updatedAt: '',
    items: [{ id: 'i1', productId: 'p1', productName: '登山杖', imageUrl: '/a.jpg', priceCents: 19800, quantity: 2 }],
    shippedAt: '2026-11-17T00:00:00Z', receiptConfirmedAt: null,
    shippingCompany: '顺丰速运', shippingTrackingNo: 'SF123',
    ...overrides,
  };
}

beforeEach(() => {
  state = {
    requests: [], resolved: { type: 'shop', id: 'order-1' },
    shopOrder: shopOrderFixture(),
    activityOrder: null,
    businessViews: [], navigations: [], toasts: [],
    componentStatus: 'success',
  };
  wxStubs = {
    openBusinessView(options) {
      state.businessViews.push(options.businessType);
      // 官方组件以 extraData.status 回传业务结果
      options.success({ extraData: { status: state.componentStatus || 'success' } });
    },
    navigateTo(options) { state.navigations.push(options.url); },
    showToast(options) { state.toasts.push(options.title); },
  };
});

test('微信深链按订单号解析并渲染装备订单详情', async () => {
  const definition = loadPageModule();
  const instance = makeInstance(definition);
  instance.onLoad({ no: 'N-1', channel: '1' });
  assert.equal(instance.pendingNo, 'N-1');
  await instance.load();
  assert.equal(state.requests[0].path, '/order-center/resolve?no=N-1');
  assert.equal(state.requests[1].path, '/orders/order-1');
  const detail = instance.data.detail;
  assert.equal(detail.kind, 'shop');
  assert.equal(detail.statusText, 'SHIPPED');
  assert.equal(detail.totalText, '¥396.00');
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].priceText, '¥198.00');
  assert.equal(detail.canConfirmReceipt, true);
});

test('微信发货与确认收货消息跳转携带 merchant_trade_no 或 transaction_id 均可解析订单', async () => {
  const definition = loadPageModule();
  const byMerchantTradeNo = makeInstance(definition);
  byMerchantTradeNo.onLoad({ merchant_trade_no: 'M-100', transaction_id: '420001' });
  assert.equal(byMerchantTradeNo.pendingNo, 'M-100');
  await byMerchantTradeNo.load();
  assert.equal(state.requests[0].path, '/order-center/resolve?no=M-100');

  state.requests = [];
  const byTransactionId = makeInstance(definition);
  byTransactionId.onLoad({ transaction_id: '420001' });
  assert.equal(byTransactionId.pendingNo, '420001');
  await byTransactionId.load();
  assert.equal(state.requests[0].path, '/order-center/resolve?no=420001');
});

test('确认收货调用微信组件并经服务端复核后回填不可再次确认', async () => {
  const definition = loadPageModule();
  const instance = makeInstance(definition, { orderId: 'order-1', orderType: 'shop' });
  await instance.load();
  assert.equal(instance.data.detail.canConfirmReceipt, true);
  // 服务端确认成功后重新返回的订单已带确认时间
  state.shopOrder = shopOrderFixture({ receiptConfirmedAt: '2026-11-18T00:00:00Z' });
  instance.confirmReceipt();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.businessViews, ['weappOrderConfirm']);
  const confirmCall = state.requests.find(
    r => r.method === 'POST' && r.path === '/order-center/orders/order-1/confirm-receipt');
  assert.ok(confirmCall, '应调用服务端确认收货端点');
  assert.equal(instance.data.detail.canConfirmReceipt, false);
  assert.equal(instance.data.detail.order.receiptConfirmedAt, '2026-11-18T00:00:00Z');
  assert.deepEqual(state.toasts, ['已确认收货']);
});

test('组件打开失败时不调用服务端并提示', async () => {
  const definition = loadPageModule();
  wxStubs.openBusinessView = options => {
    state.businessViews.push(options.businessType);
    options.fail({});
  };
  const instance = makeInstance(definition, { orderId: 'order-1', orderType: 'shop' });
  await instance.load();
  instance.confirmReceipt();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(
    state.requests.find(r => r.method === 'POST' && r.path.startsWith('/order-center/orders/')),
    undefined,
  );
  assert.ok(instance.data.confirmError.length > 0);
});

test('组件回调 status 非 success（用户取消）不触发服务端确认', async () => {
  const definition = loadPageModule();
  state.componentStatus = 'cancel';
  const instance = makeInstance(definition, { orderId: 'order-1', orderType: 'shop' });
  await instance.load();
  assert.equal(instance.data.detail.canConfirmReceipt, true);
  instance.confirmReceipt();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.businessViews, ['weappOrderConfirm']);
  assert.equal(
    state.requests.find(r => r.method === 'POST' && r.path.startsWith('/order-center/orders/')),
    undefined,
  );
  assert.equal(instance.data.busy, false);
  assert.equal(instance.data.detail.canConfirmReceipt, true);
});

test('活动订单展示虚拟履约说明且不出现确认收货', async () => {
  const definition = loadPageModule();
  state.activityOrder = {
    id: 'a-1', orderNo: 'A-1', activityId: 'act', activityTitle: '徒步活动', userId: 'u',
    status: 'PAID', partySize: 2, originalTotalCents: 20000, totalCents: 20000, currency: 'CNY',
    quote: { lines: [] }, paymentTransactionId: '42000...2', paymentAttempted: true,
    expiresAt: '2026-11-20T00:00:00Z', version: 1,
  };
  const instance = makeInstance(definition, { orderId: 'a-1', orderType: 'activity' });
  await instance.load();
  assert.equal(instance.data.detail.kind, 'activity');
  assert.equal(state.requests[0].path, '/activity-orders/a-1');
  assert.equal(instance.data.detail.statusText, '已支付 · 报名已确认');
  instance.confirmReceipt(); // 活动订单：不产生任何组件或服务端调用
  assert.equal(state.businessViews.length, 0);
  assert.equal(
    state.requests.find(r => r.method === 'POST' && r.path.startsWith('/order-center/orders/')),
    undefined,
  );
});

test('未登录时展示登录引导且不发起订单请求', async () => {
  const definition = loadPageModule();
  // hasSession 为 false 的 api stub：重载模块
  const filename = path.resolve(__dirname, '../src/pages/order-detail/index.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({
    Page(value) { PageDefinition = value; },
    wx: wxStubs,
  });
  const requireSource = request => {
    if (request.endsWith('/api')) return { hasSession: () => false, request: async () => { throw new Error('不应请求'); } };
    if (request.endsWith('/domain'))
      return {
        message: e => String(e), dateLabel: () => '',
        RequestEpoch: class { next() { return 1; } valid() { return true; } invalidate() {} },
      };
    if (request.endsWith('/shop')) return { money: c => '¥' + (c / 100).toFixed(2), orderStatusLabel: s => s };
    if (request.endsWith('/activity-orders')) return { activityOrderStatus: () => '' };
    if (request.endsWith('/page-motion')) return { enterPage: () => {} };
    return {};
  };
  const module = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(
    requireSource, module, module.exports);
  const instance = makeInstance(PageDefinition, { orderId: 'order-1', orderType: 'shop' });
  await instance.onShow();
  assert.equal(instance.data.loggedIn, false);
  assert.equal(instance.data.detail, null);
  assert.equal(state.requests.length, 0);
});
