const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { homeActivitySlots, homeEntries } = require("../dist/utils/home.js");
const api = require("../dist/utils/api.js");
const activity = (id) => ({
  id,
  title: `活动 ${id}`,
  category: "WEEKLY",
  coverUrl: "/assets/category-weekly.jpg",
  location: "厦门",
  startAt: "2099-01-01T00:00:00Z",
  registrationDeadline: "2098-12-31T00:00:00Z",
  status: "PUBLISHED",
  capacity: 20,
  registeredCount: 2,
  priceCents: 0,
});
let definition, calls, navigation, storage;
global.Page = (value) => {
  definition = value;
};
global.wx = {
  navigateTo: ({ url, complete }) => {
    navigation.push(url);
    complete?.();
  },
  switchTab: ({ url, complete }) => {
    navigation.push(url);
    complete?.();
  },
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageSync: (key) => storage.get(key),
  removeStorageSync: (key) => storage.delete(key),
  showToast: () => {},
  showModal: async () => ({ confirm: true }),
};
function page(name = "home") {
  const path = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[path];
  require(path);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(update) {
      Object.assign(this.data, update);
    },
  };
  for (const key of Object.keys(p))
    if (typeof p[key] === "function") p[key] = p[key].bind(p);
  return p;
}
const home = {
  banners: [],
  equipment: [],
  categories: [],
  paymentEnabled: false,
};
function responses(items) {
  api.request = async (path, method = "GET") => {
    calls.push({ path, method });
    return path === "/home/shortcuts"
      ? { version: 0, items: homeEntries }
      : path === "/home"
        ? home
        : {
            items: path.startsWith("/articles") ? [] : items,
            total: items.length,
            page: 0,
            hasMore: true,
          };
  };
}
beforeEach(() => {
  calls = [];
  navigation = [];
  storage = new Map();
  responses([]);
});

test("home fourth shortcut is Wildboy without renaming the leisure activity category", () => {
  assert.equal(homeEntries.length, 4);
  assert.deepEqual(
    homeEntries.map((x) => x.icon),
    ["WEEKLY", "DOMESTIC", "QRCODE", "INTRO"],
  );
  assert.equal(homeEntries[3].name, "野小子");
  const domain = require("../dist/utils/domain.js");
  assert.equal(domain.categoryName("LEISURE"), "休闲活动");
  assert.equal(domain.validCategory("INTRO"), false);
  assert.deepEqual(
    page().data.categories.map(({ image, ...x }) => x),
    homeEntries,
  );
  assert.equal(homeEntries[2].name, "二维码");
  assert.equal(domain.categoryName("HOLIDAY"), "假期活动");
});

test("zero real activities remains empty, never fabricates signups", () => {
  assert.deepEqual(homeActivitySlots([]), []);
});
for (const count of [1, 2, 3, 4, 5, 6, 7, 10]) {
  test(`${count} real activities displays at most four ordered activities without repetition`, () => {
    const source = Array.from({ length: count }, (_, i) => activity(`a-${i}`));
    const before = structuredClone(source);
    const slots = homeActivitySlots(source);
    assert.equal(slots.length, Math.min(count, 4));
    assert.equal(new Set(slots.map((x) => x.slotKey)).size, slots.length);
    assert.deepEqual(
      slots.map((x) => x.id),
      source.slice(0, 4).map((x) => x.id),
    );
    assert.deepEqual(source, before);
    assert.deepEqual(
      homeActivitySlots(source).map((x) => x.slotKey),
      slots.map((x) => x.slotKey),
    );
  });
}
test("home reads four activities and cards navigate using original IDs", async () => {
  responses([activity("real-1"), activity("real-2")]);
  const p = page();
  await p.load();
  assert.deepEqual(calls, [
    { path: "/articles?page=0&size=10", method: "GET" },
    { path: "/home/shortcuts", method: "GET" },
    { path: "/home", method: "GET" },
    { path: "/activities?page=0&size=4", method: "GET" },
  ]);
  assert.equal(p.data.items.length, 2);
  assert.equal(p.onReachBottom, undefined);
  p.openActivity({ currentTarget: { dataset: { id: p.data.items[0].id } } });
  assert.deepEqual(navigation, ["/pages/detail/index?id=real-1"]);
});
test("empty carousel never fabricates articles", async () => {
  const p = page();
  await p.load();
  assert.deepEqual(p.data.articles, []);
  p.openArticle({ currentTarget: { dataset: { id: "" } } });
  assert.deepEqual(navigation, []);
});
test("carousel opens article and official shortcut resolves current designation", async () => {
  api.request = async (path) =>
    path === "/home/shortcuts"
      ? { version: 0, items: homeEntries }
      : path === "/home"
        ? home
        : {
            items: path.startsWith("/articles")
              ? [
                  {
                    id: "article-1",
                    coverUrl: "/assets/category-weekly.jpg",
                    isOfficial: false,
                  },
                  { id: "intro", isOfficial: true },
                ]
              : [],
          };
  const p = page();
  await p.load();
  assert.equal(p.data.articles.length, 1);
  p.openArticle({ currentTarget: { dataset: { id: p.data.articles[0].id } } });
  await p.openCategory({ currentTarget: { dataset: { slot: 4 } } });
  assert.deepEqual(navigation, [
    "/pages/article/index?id=article-1",
    "/pages/article/index?official=1",
  ]);
  assert.equal(storage.has("wildboy-category"), false);
});
test("article load failure leaves activities usable and clears stale carousel", async () => {
  responses([activity("a")]);
  const p = page();
  await p.load();
  api.request = async () => {
    throw new Error("文章网络错误");
  };
  await p.loadArticles();
  assert.equal(p.data.articleError, "文章网络错误");
  assert.equal(p.data.items[0].id, "a");
  assert.deepEqual(p.data.articles, []);
  responses([]);
  await p.loadArticles();
  assert.equal(p.data.articleError, "");
  assert.equal(p.data.articleLoading, false);
});
test("empty refresh removes old activities; failure offers retry without fake data", async () => {
  responses([activity("a")]);
  const p = page();
  await p.load();
  responses([]);
  await p.load();
  assert.deepEqual(p.data.items, []);
  api.request = async () => {
    throw new Error("网络失败");
  };
  await p.load();
  assert.equal(p.data.error, "网络失败");
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.loading, false);
  responses([activity("b")]);
  await p.load();
  assert.equal(p.data.error, "");
  assert.equal(p.data.items[0].id, "b");
});
test("late refresh cannot overwrite newer activities", async () => {
  let resolveOld;
  api.request = async (path) =>
    path === "/home/shortcuts"
      ? { version: 0, items: homeEntries }
      : path === "/home"
        ? home
        : path.startsWith("/articles")
          ? { items: [] }
          : new Promise((resolve) => {
              resolveOld = resolve;
            });
  const p = page();
  const old = p.load();
  responses([activity("new")]);
  await p.load();
  resolveOld({ items: [activity("old")] });
  await old;
  assert.deepEqual(
    p.data.items.map((x) => x.id),
    ["new"],
  );
});
test("unload invalidates inflight home response", async () => {
  let finish;
  api.request = async (path) =>
    path === "/home/shortcuts"
      ? { version: 0, items: homeEntries }
      : path === "/home"
        ? home
        : path.startsWith("/articles")
          ? { items: [] }
          : new Promise((resolve) => {
              finish = resolve;
            });
  const p = page();
  const pending = p.load();
  p.onUnload();
  finish({ items: [activity("old")] });
  await pending;
  assert.deepEqual(p.data.items, []);
});
test("all activities clears an earlier category and keeps separate pagination route", async () => {
  const p = page();
  p.allActivities();
  assert.deepEqual(navigation, ["/pages/activities/index"]);
  const listing = page("activities");
  listing.setData({ selected: "WEEKLY" });
  listing.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listing.data.selected, "");
  assert.ok(calls.some((x) => x.path === "/activities?page=0&size=10"));
});
test("native template order matches reference: static hero, four categories, activity grid, shop, carousel", () => {
  const markup = fs.readFileSync("dist/pages/home/index.wxml", "utf8");
  const positions = [
    'class="hero"',
    'class="category-grid"',
    'class="grid"',
    'class="shop"',
    '<swiper wx:else class="scenery-swiper"',
  ].map((x) => markup.indexOf(x));
  assert.ok(positions.every((x, i) => x >= 0 && (!i || x > positions[i - 1])));
  assert.equal((markup.match(/<swiper\s/g) || []).length, 1);
  assert.match(markup, /wx:key="slotKey"/);
  assert.match(markup, /autoplay="{{true}}"/);
  const styles = fs.readFileSync("dist/pages/home/index.wxss", "utf8");
  assert.match(styles, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test("late article response cannot overwrite refresh or restore cards after unload", async () => {
  const p = page();
  let finish;
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const old = p.loadArticles();
  api.request = async () => ({
    items: [{ id: "new", coverUrl: "", isOfficial: false }],
  });
  await p.loadArticles();
  finish({ items: [{ id: "old", coverUrl: "", isOfficial: false }] });
  await old;
  assert.deepEqual(
    p.data.articles.map((x) => x.id),
    ["new"],
  );
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = p.loadArticles();
  p.onUnload();
  finish({ items: [{ id: "late", coverUrl: "", isOfficial: false }] });
  await pending;
  assert.deepEqual(p.data.articles, []);
});
test("returning to Explore refreshes the article publication state", async () => {
  const p = page();
  p.onShow();
  assert.equal(calls.length, 0);
  p.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0].path, "/articles?page=0&size=10");
});

test("QR popup defaults to honest unconfigured state; repeated taps and dismissal do not navigate", async () => {
  const p = page();
  await p.loadShortcuts();
  await p.openCategory({ currentTarget: { dataset: { slot: 3 } } });
  assert.deepEqual(p.data.popup, { title: "二维码", text: "", image: "" });
  await p.openCategory({ currentTarget: { dataset: { slot: 1 } } });
  assert.deepEqual(navigation, []);
  p.keepPopup();
  assert.ok(p.data.popup);
  p.closePopup();
  assert.equal(p.data.popup, null);
  await p.openCategory({ currentTarget: { dataset: { slot: 1 } } });
  assert.deepEqual(navigation, ["/pages/activities/index"]);
  assert.equal(storage.get("wildboy-category"), "WEEKLY");
});
test("configured popup renders uploaded image and plain text; image failure is explicit and hide closes", async () => {
  const p = page();
  const items = structuredClone(homeEntries);
  items[2].popupImageUrl = "/assets/uploads/real.png";
  items[2].popupText = "<b>plain text</b>";
  api.request = async () => ({ version: 2, items });
  await p.loadShortcuts();
  await p.openCategory({ currentTarget: { dataset: { slot: 3 } } });
  assert.match(p.data.popup.image, /\/assets\/uploads\/real.png$/);
  assert.equal(p.data.popup.text, "<b>plain text</b>");
  p.popupImageFailed({
    currentTarget: { dataset: { generation: p.data.popupGeneration - 1 } },
  });
  assert.equal(p.data.popupImageError, false);
  p.popupImageFailed({
    currentTarget: { dataset: { generation: p.data.popupGeneration } },
  });
  assert.equal(p.data.popupImageError, true);
  p.onHide();
  assert.equal(p.data.popup, null);
});
test("page allowlist rejects injected target and invalid four-slot configuration", () => {
  const { shortcutViews } = require("../dist/utils/home-shortcuts.js");
  for (const mutate of [
    (a) => a.pop(),
    (a) => (a[1].slot = 1),
    (a) => (a[0].page = "../../admin"),
    (a) => (a[0].icon = "__proto__"),
    (a) => (a[0].name = ""),
    (a) => (a[3].articleId = "a?admin=1"),
  ]) {
    const items = structuredClone(homeEntries);
    mutate(items);
    assert.throws(() => shortcutViews({ version: 0, items }));
  }
});
test("unsafe popup image is never handed to native image component", () => {
  const { safeShortcutImage } = require("../dist/utils/home-shortcuts.js");
  for (const url of [
    "javascript:alert(1)",
    "//evil.test/x",
    "/assets/../secret.png",
    "https://user@host/x",
    "https://host/\\evil",
    "/api/v1/admin",
  ])
    assert.equal(safeShortcutImage(url), "");
});
test("all allowlisted destinations dispatch correctly without arbitrary routes", async () => {
  const p = page();
  for (const [target, url] of [
    ["WEEKLY", "activities"],
    ["DOMESTIC", "activities"],
    ["ACTIVITIES", "activities"],
    ["SHOP", "shop"],
    ["PROFILE", "mine"],
  ]) {
    const items = structuredClone(homeEntries);
    items[0].page = target;
    api.request = async () => ({ version: 1, items });
    await p.loadShortcuts();
    await p.openCategory({ currentTarget: { dataset: { slot: 1 } } });
    assert.equal(navigation.at(-1), `/pages/${url}/index`);
  }
});
test("article is checked at click; unpublished article never navigates and repeated clicks coalesce", async () => {
  const p = page();
  await p.loadShortcuts();
  let finish;
  let calls = 0;
  api.request = () => {
    calls++;
    return new Promise((resolve, reject) => {
      finish = reject;
    });
  };
  const tap = p.openCategory({ currentTarget: { dataset: { slot: 4 } } });
  await p.openCategory({ currentTarget: { dataset: { slot: 4 } } });
  assert.equal(calls, 1);
  finish(new Error("文章已下架"));
  await tap;
  assert.deepEqual(navigation, []);
  assert.equal(p.data.shortcutBusy, false);
});
test("late article check after hide cannot navigate; config refresh closes old popup", async () => {
  const p = page();
  await p.loadShortcuts();
  let finish;
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const tap = p.openCategory({ currentTarget: { dataset: { slot: 4 } } });
  p.onHide();
  finish({});
  await tap;
  assert.deepEqual(navigation, []);
  responses([]);
  await p.loadShortcuts();
  await p.openCategory({ currentTarget: { dataset: { slot: 3 } } });
  await p.loadShortcuts();
  assert.equal(p.data.popup, null);
});
test("late shortcut load cannot overwrite refresh or unload; failure does not leave old actions active", async () => {
  const p = page();
  let finish;
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const old = p.loadShortcuts();
  const items = structuredClone(homeEntries);
  items[0].name = "新入口";
  api.request = async () => ({ version: 1, items });
  await p.loadShortcuts();
  finish({ version: 0, items: homeEntries });
  await old;
  assert.equal(p.data.categories[0].name, "新入口");
  api.request = async () => {
    throw Error("断网");
  };
  await p.loadShortcuts();
  await p.openCategory({ currentTarget: { dataset: { slot: 1 } } });
  assert.deepEqual(navigation, []);
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const last = p.loadShortcuts();
  p.onUnload();
  finish({ version: 0, items: homeEntries });
  await last;
  assert.equal(p.data.categories[0].name, "新入口");
});
