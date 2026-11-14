// Native UI regression against the disposable LocalSmokeServer only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { connectWeChat } = require('./wechat-session.cjs');
process.env.WILDBOY_LOCAL_API ||= 'http://127.0.0.1:18080';
process.env.WILDBOY_WECHAT_PORT ||= '9422';
const origin = process.env.WILDBOY_LOCAL_API;
const parsed = new URL(origin);
assert.ok(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  && parsed.port === '18080' && parsed.pathname === '/' && !parsed.search && !parsed.hash
  && !parsed.username && !parsed.password, 'User review requires the loopback smoke API on port 18080');
assert.equal(process.env.WILDBOY_WECHAT_PORT, '9422', 'User review uses the dedicated automation port 9422');
const output = path.resolve(__dirname, '../../test-results/review-2026-11-11');
const checks = [], exceptions = [];
const secrets = ['smoke-only-password-123!'];
const sanitize = value => secrets.reduce((text, secret) => secret ? text.split(secret).join('[redacted]') : text,
  String(value)).replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(url, token, body, method = body ? 'POST' : 'GET') {
  assert.ok(url.startsWith('/') && !url.startsWith('//'), 'Fixture route must be API-relative');
  const response = await fetch(`${parsed.origin}/api/v1${url}`, { method,
    redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${url}: HTTP ${response.status}, code ${value?.code || 'unknown'}`);
  return value;
}
async function ready(page, predicate, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const data = await page.data();
    if (predicate(data)) return data;
    await delay(200);
  }
  throw new Error(`${label}: page did not reach expected state`);
}
async function route(mini, name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const page = await mini.currentPage();
    if (page?.path === `pages/${name}/index`) return page;
    await delay(200);
  }
  throw new Error(`Navigation to ${name} did not finish`);
}
async function click(page, selector) {
  const element = await page.$(selector);
  assert.ok(element, `Missing native control ${selector}`);
  await element.tap();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  let mini, userToken, createdAddressId, createdOrderId, failure;
  const cleanup = [], fixtures = {};
  const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
  try {
    // Verify the actual simulator configuration and the active disposable server
    // before creating any fixtures or changing a profile.
    mini = await connectWeChat();
    assert.equal(await mini.evaluate(() => require('config.js').config.devLogin), true,
      'User review requires the simulator development-login configuration');
    mini.on('exception', value => exceptions.push(String(value?.message || value)));
    const smokeEnv = Object.fromEntries(fs.readFileSync(path.join(os.tmpdir(), 'wildboy-smoke-env'), 'utf8')
      .split(/\r?\n/).filter(line => line.includes('='))
      .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    assert.ok(smokeEnv.USER_TOKEN_2, 'The active LocalSmokeServer must provide its smoke user token');
    secrets.push(smokeEnv.USER_TOKEN_2);
    const smokeUser = await api('/me', smokeEnv.USER_TOKEN_2);
    assert.equal(smokeUser.role, 'USER');
    const legal = await api('/legal/current');
    const development = await api('/auth/dev-login', null, {
      role: 'USER', privacyVersion: legal.privacy.version, termsVersion: legal.terms.version,
    });
    secrets.push(development.token);
    assert.equal(development.user.role, 'USER');
    const admin = await api('/auth/admin', null, { username: 'smoke-admin', password: 'smoke-only-password-123!' });
    secrets.push(admin.token);
    assert.equal(admin.user.role, 'ADMIN');
    const date = days => new Date(Date.now() + days * 86400000).toISOString();
    const suffix = Date.now().toString(36);
    let activity = await api('/admin/activities', admin.token, {
      title: `原生流程回归 ${suffix}`, category: 'WEEKLY', coverUrl: '/assets/category-weekly.jpg', galleryUrls: [],
      summary: '隔离环境合成活动', description: '仅用于原生报名流程验证', location: '测试山径', meetingPoint: '测试集合点',
      startAt: date(14), endAt: date(15), registrationDeadline: date(13), capacity: 20, priceCents: 0, identityRequired: false,
    });
    activity = await api(`/admin/activities/${activity.id}/publish`, admin.token, { version: activity.version });
    const product = await api('/admin/shop/products', admin.token, {
      name: `用户回归商品 ${suffix}`, description: '仅用于隔离数据库原生回归，不是真实商品。',
      imageUrl: '/assets/equipment.jpg', priceCents: 1299, originalPriceCents: 1299, stock: 1, status: 'ON_SALE',
    });
    Object.assign(fixtures, { activityId: activity.id, productId: product.id });
    await mini.evaluate(() => require('utils/api.js').logout());
    let page = await mini.reLaunch('/pages/mine/index');
    await ready(page, data => !data.loading && !data.user, 'guest My');
    await click(page, '.login-button');
    page = await route(mini, 'login');
    await ready(page, data => data.current && !data.loading, 'current legal');
    await click(page, '.agreement checkbox');
    let data = await ready(page, value => value.agreed, 'explicit login consent');
    assert.equal(data.agreed, true);
    assert.equal(data.privacyRead, false);
    assert.equal(data.termsRead, false);
    await mini.screenshot({ path: path.join(output, 'login-consent.png') });
    await click(page, 'button.primary');
    page = await route(mini, 'mine');
    await ready(page, data => !!data.user && !data.loading, 'logged-in My');
    userToken = await mini.callWxMethod('getStorageSync', 'wildboy-session');
    secrets.push(userToken);
    pass('native login with explicit consent and optional document opening');

    await mini.navigateTo(`/pages/register/index?id=${activity.id}`);
    page = await route(mini, 'register');
    await ready(page, data => !!data.activity && !!data.legal && !data.loading, 'registration');
    const current = await api('/me', userToken);
    assert.equal(current.id, development.user.id, 'Native login must use the same disposable development user');
    if (current.profileCompleted) {
      await mini.navigateTo('/pages/profile/index?from=register');
    } else {
      // With blank participants, the first submit opens contact completion directly.
      await click(page, 'button.primary');
    }
    let profile = await route(mini, 'profile');
    await ready(profile, data => data.editing && !!data.legal, 'contact editor');
    await (await profile.$('input[data-field="realName"]')).input('原生回归');
    await (await profile.$('input[data-field="phone"]')).input('13800000000');
    await click(profile, 'checkbox');
    await ready(profile, value => value.consent, 'explicit contact consent');
    await mini.screenshot({ path: path.join(output, 'profile-save-return.png') });
    await click(profile, '.dialog-actions button.primary');
    page = await route(mini, 'register');
    await ready(page, data => data.participants[0].participantName === '原生回归', 'contact prefill');
    assert.equal((await page.data()).participants[0].phone, '13800000000');
    pass('contact save returns to registration and prefills the first participant');
    await click(page, 'checkbox');
    await ready(page, value => value.consent, 'explicit registration consent');
    assert.equal((await page.data()).privacyRead, false);
    await click(page, 'button.primary');
    page = await route(mini, 'signup-success');
    data = await ready(page, value => value.confirmed, 'confirmed registration');
    assert.equal(data.registration.participants[0].participantName, '原生回归');
    await mini.screenshot({ path: path.join(output, 'registration-success.png') });
    pass('native registration confirms actual server participants');

    page = await mini.reLaunch(`/pages/checkout/index?id=${product.id}&quantity=1`);
    await ready(page, value => !!value.product && !!value.legal && !value.loading && !value.addressLoading, 'checkout');
    await click(page, '.shipping-card');
    let addresses = await route(mini, 'addresses');
    await ready(addresses, value => value.loggedIn && !value.loading, 'address list');
    await click(addresses, 'button.primary');
    await ready(addresses, value => value.editing, 'new address');
    await (await addresses.$('input[data-field="recipientName"]')).input('原生地址');
    await (await addresses.$('input[data-field="phone"]')).input('13800000000');
    await (await addresses.$('textarea[data-field="address"]')).input('厦门市隔离测试路一号，仅用于验收');
    assert.equal(await (await addresses.$('button.primary')).text(), '保存并使用');
    await mini.screenshot({ path: path.join(output, 'address-save-use.png') });
    await click(addresses, 'button.primary');
    page = await route(mini, 'checkout');
    data = await ready(page, value => value.selectedAddressId && value.recipientName === '原生地址' && !value.addressLoading, 'selected saved address');
    createdAddressId = data.selectedAddressId;
    fixtures.addressId = createdAddressId;
    assert.equal(data.order, null);
    pass('saving a selected address returns to checkout without an extra selection tap');
    await click(page, 'checkbox');
    data = await ready(page, value => value.consent, 'explicit checkout consent');
    assert.equal(data.consent, true);
    assert.equal(data.privacyRead, false);
    await click(page, 'button.submit');
    data = await ready(page, value => !!value.order && !value.busy, 'pending order');
    createdOrderId = data.order.id;
    fixtures.orderId = createdOrderId;
    assert.equal(data.order.status, 'PENDING_PAYMENT');
    assert.match(data.error, /真实微信/);
    await mini.screenshot({ path: path.join(output, 'checkout-review-pending.png') });
    pass('native checkout creates a real pending order without claiming payment success');
    assert.equal(exceptions.length, 0, 'Native runtime emitted an exception; inspect the sanitized report');
  } catch (error) {
    failure = sanitize(error?.message || error);
  } finally {
    // Only operate on IDs returned by this run, never sweep another user's data.
    if (userToken && createdOrderId) {
      try {
        const order = await api(`/orders/${createdOrderId}`, userToken);
        if (order.status === 'PENDING_PAYMENT') {
          const cancelled = await api(`/orders/${createdOrderId}/cancel`, userToken, undefined, 'POST');
          assert.equal(cancelled.status, 'CANCELLED');
          cleanup.push('Cancelled this run\'s pending order');
        }
      } catch (error) { cleanup.push(`Order cleanup failed: ${sanitize(error?.message || error)}`); failure ||= 'Fixture cleanup failed'; }
    }
    if (userToken && createdAddressId) {
      try {
        await api(`/me/addresses/${createdAddressId}`, userToken, undefined, 'DELETE');
        cleanup.push('Deleted this run\'s saved address');
      } catch (error) { cleanup.push(`Address cleanup failed: ${sanitize(error?.message || error)}`); failure ||= 'Fixture cleanup failed'; }
    }
    if (mini) await mini.disconnect().catch(() => {});
    fs.writeFileSync(path.join(output, 'native-user-report.json'), JSON.stringify({
      status: failure ? 'failed' : 'passed', apiOrigin: parsed.origin, fixtures, checks,
      exceptions: exceptions.map(sanitize), cleanup, ...(failure ? { failure } : {}),
    }, null, 2));
  }
  if (failure) throw new Error(failure);
})().catch(error => { console.error(sanitize(error?.message || error)); process.exitCode = 1; });
