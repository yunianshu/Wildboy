const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../dist/utils/api.js');
let definition, calls, session, signedIn, navigations;
global.Page = value => { definition = value; };
function page(name) {
  const file = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[file];
  require(file);
  return { ...definition, data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  calls = []; session = 1; signedIn = true; navigations = [];
  api.hasSession = () => signedIn;
  api.sessionVersion = () => session;
  api.isSessionCurrent = value => value === session;
  api.getCurrentUser = async () => ({ id: 'u1', role: 'USER' });
  api.logout = () => { signedIn = false; session++; };
  global.wx = { navigateTo: value => navigations.push(value.url), getStorageSync: () => undefined };
  api.request = async url => {
    calls.push(url);
    if (url === '/auth/capabilities') return { adminLoginEnabled: false };
    if (url === '/me/consents') return { ready: true, requiresConsent: false };
    return { items: [], page: 0, hasMore: false };
  };
});

test('My account result cannot enable an unavailable administrator login', async () => {
  const p = page('mine');
  await p.loadAdminCapability();
  await p.load();
  p.adminSignIn();
  assert.equal(p.data.adminLoginEnabled, false);
  assert.deepEqual(navigations, []);
  api.request = async () => ({ adminLoginEnabled: true });
  await p.loadAdminCapability();
  api.request = async () => ({ ready: true, requiresConsent: false });
  await p.load();
  assert.equal(p.data.adminLoginEnabled, true, 'retrying account details preserves the independent capability');
});

test('hidden capability completion cannot finish a newer My request', async () => {
  const pending = [];
  api.request = () => new Promise(resolve => pending.push(resolve));
  const p = page('mine');
  const first = p.loadAdminCapability();
  p.onHide();
  const second = p.loadAdminCapability();
  pending[0]({ adminLoginEnabled: true });
  await first;
  assert.equal(p.data.adminCapabilityLoading, true);
  assert.equal(p.data.adminLoginEnabled, false);
  pending[1]({ adminLoginEnabled: false });
  await second;
  assert.equal(p.data.adminCapabilityLoading, false);
});

test('logout clears consent notices and an old confirmation cannot sign out another account', async () => {
  const p = page('mine');
  p.setData({ user: { id: 'u1' }, requiresConsent: true, legalStatusError: 'old', activityUser: true });
  let finish;
  wx.showModal = () => new Promise(resolve => { finish = resolve; });
  const stale = p.signOut();
  session++;
  finish({ confirm: true });
  await stale;
  assert.equal(signedIn, true);
  wx.showModal = async () => ({ confirm: true });
  await p.signOut();
  assert.equal(signedIn, false);
  assert.equal(p.data.user, null);
  assert.equal(p.data.requiresConsent, false);
  assert.equal(p.data.legalStatusError, '');
  assert.equal(p.data.activityUser, false);
});

test('notification refresh failure cannot continue from an old page', async () => {
  const p = page('notifications');
  p.setData({ items: [{ id: 'old' }], page: 3, hasMore: true });
  api.request = async url => { calls.push(url); throw new Error('offline'); };
  await p.load(true);
  p.more();
  await flush();
  assert.deepEqual(calls, ['/me/notifications?page=0&size=20']);
  assert.equal(p.data.hasMore, false);
  api.request = async url => { calls.push(url); return { items: [{ id: 'new', status: 'SENT' }], page: 0, hasMore: false }; };
  p.retry();
  await flush();
  assert.equal(calls.at(-1), '/me/notifications?page=0&size=20');
  assert.deepEqual(p.data.items.map(x => x.id), ['new']);
});

test('notification pagination deduplicates overlapping results', async () => {
  const p = page('notifications');
  p.setData({ items: [{ id: 'same', status: 'PENDING' }], page: 0, hasMore: true });
  api.request = async () => ({ items: [{ id: 'same', status: 'SENT' }, { id: 'next', status: 'SENT' }], page: 1, hasMore: false });
  await p.load(false);
  assert.deepEqual(p.data.items.map(x => x.id), ['same', 'next']);
});

test('returning home reloads activity capacity and equipment instead of keeping session-long stale data', async () => {
  const { homeEntries } = require('../dist/utils/home.js');
  api.request = async url => {
    calls.push(url);
    if (url === '/home/shortcuts') return { version: 0, items: homeEntries };
    if (url === '/home') return { banners: [], equipment: [] };
    return { items: [], page: 0, hasMore: false };
  };
  const p = page('home');
  p.onShow();
  p.onHide();
  p.onShow();
  await flush();
  assert.ok(calls.includes('/home'));
  assert.ok(calls.includes('/activities?page=0&size=6'));
});
