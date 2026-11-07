const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
let definition, calls, navigation, stopped, now;
const realNow = Date.now;
global.Page = value => definition = value;
require("../dist/pages/shop/index.js");

const product = (id = "p1", stock = 3) => ({
  id, name: `装备 ${id}`, description: "商品说明", imageUrl: "/assets/equipment.jpg",
  priceCents: 19900, stock, status: "ON_SALE", version: 0,
});
const flush = () => new Promise(resolve => setImmediate(resolve));
function page() {
  const instance = {
    ...definition,
    data: structuredClone(definition.data),
    updates: [],
    setData(update) { this.updates.push(update); Object.assign(this.data, update); },
  };
  for (const key of Object.keys(instance))
    if (typeof instance[key] === "function") instance[key] = instance[key].bind(instance);
  // Isolate the catalog lifecycle; category loading has its own integration cases.
  instance.loadCategories = () => Promise.resolve();
  return instance;
}

beforeEach(() => {
  calls = []; navigation = []; stopped = 0; now = 0;
  Date.now = () => now;
  global.wx = {
    getWindowInfo: () => ({statusBarHeight: 47}),
    navigateTo: options => navigation.push(options.url),
    stopPullDownRefresh: () => stopped++,
  };
  api.request = async path => { calls.push(path); return [product()]; };
});
afterEach(() => { Date.now = realNow; });

test("shop first show fetches once, renders real products, and records a successful load", async () => {
  const p = page();
  p.onLoad();
  assert.equal(calls.length, 0);
  p.onShow();
  assert.equal(p.data.loading, true);
  assert.equal(p.data.loaded, false);
  assert.equal(p.data.refreshing, false);
  await p._flight;
  assert.deepEqual(calls, ["/shop/products"]);
  assert.equal(p.data.loaded, true);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.items[0].id, "p1");
  assert.equal(p.data.items[0].priceText, "¥199.00");
});

test("returning within 30 seconds retains the catalog without another request or blocking state", async () => {
  const p = page();
  await p.load();
  const rows = p.data.items;
  now = 29_999;
  p.onShow(); p.onShow();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(p.data.items, rows);
  assert.equal(p.data.loaded, true);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.refreshing, false);
});

test("expired catalog refreshes in the background while its cards remain usable", async () => {
  const p = page();
  await p.load();
  const rows = p.data.items;
  let finish;
  api.request = path => { calls.push(path); return new Promise(resolve => finish = resolve); };
  now = 30_000;
  p.onShow();
  assert.equal(p.data.loading, false);
  assert.equal(p.data.refreshing, true);
  assert.equal(p.data.items, rows);
  p.open({currentTarget: {dataset: {id: "p1"}}});
  assert.deepEqual(navigation, ["/pages/product/index?id=p1"]);
  await flush();
  assert.equal(calls.length, 2);
  finish([product("p2", 1)]);
  await p._flight;
  assert.equal(p.data.items[0].id, "p2");
  assert.equal(p.data.refreshing, false);
  assert.equal(p._lastLoadedAt, now);
});

test("pull-to-refresh and retry bypass a fresh TTL and finish the native refresh indicator", async () => {
  const p = page();
  await p.load();
  now = 1_000;
  await p.onPullDownRefresh();
  assert.equal(calls.length, 2);
  assert.equal(stopped, 1);
  assert.equal(p.data.loading, false);
  await p.retry();
  assert.equal(calls.length, 3);
});

test("concurrent shows and forced refreshes return the same flight without queuing requests", async () => {
  const p = page();
  let finish;
  api.request = path => { calls.push(path); return new Promise(resolve => finish = resolve); };
  const first = p.load();
  assert.equal(p.load(), first);
  assert.equal(p.load(true), first);
  assert.equal(p.retry(), first);
  p.onShow(); p.onShow();
  assert.equal(p._flight, first);
  await flush();
  assert.equal(calls.length, 1);
  finish([product()]);
  await first;
  assert.equal(p._flight, undefined);
  assert.equal(p.data.loaded, true);
});

test("initial failure remains recoverable and never becomes a cached success", async () => {
  const p = page();
  api.request = async path => { calls.push(path); throw new Error("离线"); };
  await p.load();
  assert.equal(p.data.loaded, false);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.error, "离线");
  api.request = async path => { calls.push(path); return [product()]; };
  await p.retry();
  assert.equal(calls.length, 2);
  assert.equal(p.data.loaded, true);
  assert.equal(p.data.error, "");
});

test("refresh failure keeps the catalog, permits navigation, and can recover immediately", async () => {
  const p = page();
  await p.load();
  const rows = p.data.items;
  now = 31_000;
  api.request = async path => { calls.push(path); throw new Error("刷新失败"); };
  await p.load();
  assert.equal(p.data.loaded, true);
  assert.equal(p.data.items, rows);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.refreshing, false);
  assert.equal(p.data.error, "刷新失败");
  p.open({currentTarget: {dataset: {id: "p1"}}});
  assert.equal(navigation.at(-1), "/pages/product/index?id=p1");
  api.request = async path => { calls.push(path); return [product("fresh")]; };
  await p.retry();
  assert.equal(p.data.items[0].id, "fresh");
  assert.equal(p.data.error, "");
  assert.equal(p._lastLoadedAt, now);
});

test("successful empty results are cached and expire as a background refresh", async () => {
  const p = page();
  api.request = async path => { calls.push(path); return []; };
  await p.load();
  assert.equal(p.data.loaded, true);
  assert.deepEqual(p.data.items, []);
  now = 29_999;
  p.onShow();
  await flush();
  assert.equal(calls.length, 1);
  now = 30_000;
  p.onShow();
  assert.equal(p.data.loading, false);
  assert.equal(p.data.refreshing, true);
  await p._flight;
  assert.equal(calls.length, 2);
});

test("unload rejects late view updates and a new instance has an independent epoch and flight", async () => {
  const finishes = [];
  api.request = path => { calls.push(path); return new Promise(resolve => finishes.push(resolve)); };
  const old = page(), current = page();
  const oldFlight = old.load(), currentFlight = current.load();
  assert.notEqual(oldFlight, currentFlight);
  await flush();
  assert.equal(calls.length, 2);
  old.onUnload();
  const writes = old.updates.length;
  finishes[0]([product("stale")]);
  finishes[1]([product("current")]);
  await Promise.all([oldFlight, currentFlight]);
  assert.equal(old.updates.length, writes);
  assert.equal(old.data.loaded, false);
  assert.deepEqual(old.data.items, []);
  assert.equal(current.data.items[0].id, "current");
  assert.equal(current.data.loaded, true);
  await old.load(true);
  assert.equal(calls.length, 2);
  const fresh = page();
  assert.equal(fresh.data.loaded, false);
  assert.equal(fresh._flight, undefined);
  const freshFlight = fresh.load();
  await flush();
  assert.equal(calls.length, 3);
  finishes[2]([]);
  await freshFlight;
  assert.equal(fresh.data.loaded, true);
});
