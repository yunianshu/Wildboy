const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { homeActivitySlots, fallbackBanners } = require("../dist/utils/home.js");
const api = require("../dist/utils/api.js");
const activity = (id) => ({
  id, title: `活动 ${id}`, category: "WEEKLY", coverUrl: "/assets/category-weekly.jpg",
  location: "厦门", startAt: "2099-01-01T00:00:00Z", registrationDeadline: "2098-12-31T00:00:00Z",
  status: "PUBLISHED", capacity: 20, registeredCount: 2, priceCents: 0,
});
let definition, calls, navigation, storage;
global.Page = (value) => { definition = value; };
global.wx = {
  navigateTo: ({url}) => navigation.push(url),
  switchTab: ({url}) => navigation.push(url),
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageSync: (key) => storage.get(key),
  removeStorageSync: (key) => storage.delete(key),
  showModal: async () => ({confirm: true}),
};
function page(name = "home") {
  const path = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[path]; require(path);
  const p = {...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update); }};
  for (const key of Object.keys(p)) if (typeof p[key] === "function") p[key] = p[key].bind(p);
  return p;
}
const home = {banners: [], equipment: [], categories: [], paymentEnabled: false};
function responses(items) {
  api.request = async (path, method = "GET") => {
    calls.push({path, method});
    return path === "/home" ? home : {items, total: items.length, page: 0, hasMore: true};
  };
}
beforeEach(() => { calls = []; navigation = []; storage = new Map(); responses([]); });

test("zero real activities remains empty, never fabricates signups", () => {
  assert.deepEqual(homeActivitySlots([]), []);
});
for (const count of [1, 2, 3, 4, 5, 6, 7, 10]) {
  test(`${count} real activities produces exactly six ordered presentation slots`, () => {
    const source = Array.from({length: count}, (_, i) => activity(`a-${i}`));
    const before = structuredClone(source);
    const slots = homeActivitySlots(source);
    assert.equal(slots.length, 6);
    assert.equal(new Set(slots.map(x => x.slotKey)).size, 6);
    assert.deepEqual(slots.map(x => x.id), Array.from({length: 6}, (_, i) => source[i % Math.min(count, 6)].id));
    assert.deepEqual(source, before);
    assert.deepEqual(homeActivitySlots(source).map(x => x.slotKey), slots.map(x => x.slotKey));
  });
}
test("home only reads six activities, duplicate cards navigate using original ID", async () => {
  responses([activity("real-1"), activity("real-2")]);
  const p = page(); await p.load();
  assert.deepEqual(calls, [{path: "/home", method: "GET"}, {path: "/activities?page=0&size=6", method: "GET"}]);
  assert.equal(p.data.items.length, 6);
  assert.equal(p.onReachBottom, undefined);
  p.openActivity({currentTarget: {dataset: {id: p.data.items[4].id}}});
  assert.deepEqual(navigation, ["/pages/detail/index?id=real-1"]);
});
test("bottom carousel has safe local fallback and explicit pause/resume", async () => {
  const p = page(); await p.load();
  assert.deepEqual(p.data.banners, fallbackBanners);
  p.toggleCarousel(); assert.equal(p.data.carouselPlaying, false);
  await p.load(); assert.equal(p.data.carouselPlaying, false);
  p.toggleCarousel(); assert.equal(p.data.carouselPlaying, true);
  p.openActivity({currentTarget: {dataset: {id: ""}}});
  assert.deepEqual(navigation, []);
});
test("server banners retain matching activity navigation", async () => {
  api.request = async (path) => path === "/home" ? {...home, banners: [{id:"banner", title:"标题", subtitle:"说明", imageUrl:"/assets/category-weekly.jpg", activityId:"real-1"}]} : {items: []};
  const p = page(); await p.load();
  assert.equal(p.data.banners.length, 1);
  assert.equal(p.data.banners[0].imageUrl, "/assets/category-weekly.jpg");
  p.openActivity({currentTarget: {dataset: {id:p.data.banners[0].activityId}}});
  assert.deepEqual(navigation, ["/pages/detail/index?id=real-1"]);
});
test("empty refresh removes old display copies; failure offers retry without fake data", async () => {
  responses([activity("a")]); const p = page(); await p.load();
  responses([]); await p.load(); assert.deepEqual(p.data.items, []);
  api.request = async () => { throw new Error("网络失败"); }; await p.load();
  assert.equal(p.data.error, "网络失败"); assert.deepEqual(p.data.items, []);
  assert.equal(p.data.loading, false);
  responses([activity("b")]); await p.load();
  assert.equal(p.data.error, ""); assert.equal(p.data.items[0].id, "b");
});
test("late refresh cannot overwrite newer six slots", async () => {
  let resolveOld;
  api.request = async (path) => path === "/home" ? home : new Promise(resolve => {resolveOld = resolve;});
  const p = page(); const old = p.load();
  responses([activity("new")]); await p.load();
  resolveOld({items:[activity("old")]}); await old;
  assert.deepEqual(p.data.items.map(x => x.id), Array(6).fill("new"));
});
test("unload invalidates inflight home response", async () => {
  let finish;
  api.request = async path => path === "/home" ? home : new Promise(resolve => {finish=resolve;});
  const p = page(); const pending = p.load(); p.onUnload(); finish({items:[activity("old")]}); await pending;
  assert.deepEqual(p.data.items, []);
});
test("all activities clears an earlier category and keeps separate pagination route", async () => {
  const p = page(); p.allActivities();
  assert.deepEqual(navigation, ["/pages/activities/index"]);
  const listing = page("activities"); listing.setData({selected:"WEEKLY"}); listing.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listing.data.selected, "");
  assert.ok(calls.some(x => x.path === "/activities?page=0&size=10"));
});
test("native template order matches reference: static hero, four categories, six slots, shop, carousel", () => {
  const markup = fs.readFileSync("dist/pages/home/index.wxml", "utf8");
  const positions = ['class="hero"', 'class="category-grid"', 'class="grid"', 'class="shop"', '<swiper class="scenery-swiper"'].map(x => markup.indexOf(x));
  assert.ok(positions.every((x,i) => x >= 0 && (!i || x > positions[i-1])));
  assert.equal((markup.match(/<swiper\s/g) || []).length, 1);
  assert.match(markup, /wx:key="slotKey"/);
  assert.match(markup, /autoplay="{{carouselPlaying}}"/);
  const styles = fs.readFileSync("dist/pages/home/index.wxss", "utf8");
  assert.match(styles, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /safe-area-inset-bottom/);
});
