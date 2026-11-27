const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");

let definition;
global.Page = (def) => {
  definition = def;
};

function mountPage(name) {
  const file = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[file];
  require(file);
  const instance = {
    ...definition,
    data: structuredClone(definition.data),
    setData(update, cb) {
      Object.assign(this.data, update);
      cb?.();
    },
  };
  for (const key of Object.keys(instance)) {
    if (typeof instance[key] === "function") {
      instance[key] = instance[key].bind(instance);
    }
  }
  return instance;
}

let openedOfficialUrls = [];
let openedLocations = [];
let navigated = [];

beforeEach(() => {
  openedOfficialUrls = [];
  openedLocations = [];
  navigated = [];
  global.wx = {
    openOfficialAccountArticle: ({ url, success }) => {
      openedOfficialUrls.push(url);
      success?.({});
    },
    openLocation: (loc) => {
      openedLocations.push(loc);
    },
    navigateTo: ({ url, complete }) => {
      navigated.push(url);
      complete?.();
    },
    switchTab: ({ url, complete }) => {
      navigated.push(url);
      complete?.();
    },
    setStorageSync() {},
    getStorageSync() {},
    showToast() {},
    showModal: async () => ({ confirm: true }),
    setClipboardData: ({ success }) => success?.(),
    previewImage() {},
  };
  api.hasSession = () => false;
});

test("modular home layout renders drag-ordered activities, multi-QR popup, WeChat OA link and custom footer brand width", async () => {
  api.request = async (path) => {
    if (path === "/home/layout") {
      return {
        layout: {
          version: 5,
          modules: [
            { id: "HERO", enabled: true },
            { id: "ACTIVITIES", enabled: true },
            { id: "SHORTCUTS", enabled: true },
            { id: "SHOP", enabled: false },
            { id: "GALLERY", enabled: true },
            { id: "FOOTER", enabled: true },
          ],
          hero: {
            imageUrl: "/assets/hero-hiking.jpg",
            brandName: "野小子",
            brandCaption: "自由出发",
            kicker: "OUTDOOR",
            title: "定制首页主标题",
            subtitle: "自由编辑副标题",
            action: { type: "NONE" },
          },
          shortcuts: {
            columns: 3,
            items: [
              {
                id: "s1",
                name: "多群二维码",
                icon: "QRCODE",
                imageUrl: "/assets/category-holiday.jpg",
                type: "POPUP",
                popupTitle: "扫码加群",
                popupText: "长按识别对应二维码",
                popupImages: [
                  { url: "/assets/equipment.jpg", label: "领队微信" },
                  { url: "/assets/hero-hiking.jpg", label: "徒步交流群" },
                ],
              },
              {
                id: "s2",
                name: "关于野小子",
                icon: "INTRO",
                imageUrl: "",
                type: "WECHAT_ARTICLE",
                wechatArticleUrl: "https://mp.weixin.qq.com/s/WildboyStory2026",
                articleId: "12345678-1234-1234-1234-123456789abc",
              },
            ],
          },
          activities: {
            eyebrow: "CUSTOM",
            title: "精选六场活动",
            showAllLink: true,
            maxCount: 6,
            autoFill: true,
          },
          shop: { showBanner: false, showProducts: false, maxCount: 4 },
          gallery: { eyebrow: "GALLERY", title: "山野之间", mode: "AUTO_ARTICLES", slides: [] },
          footer: {
            followEnabled: true,
            followTitle: "扫码关注公众号",
            followSubtitle: "长按识别二维码",
            followQrcodes: [
              { url: "/assets/equipment.jpg", label: "官方公众号" },
              { url: "/assets/category-leisure.jpg", label: "客服二维码" },
            ],
            brandEnabled: true,
            brandImageUrl: "/assets/hero-hiking.jpg",
            brandWidthPx: 296,
          },
        },
        featuredActivities: [
          {
            id: "pinned-2",
            title: "排在第一位的活动",
            category: "WEEKLY",
            coverUrl: "/assets/category-weekly.jpg",
            location: "泉州清源山",
            startAt: "2099-03-10T09:00:00Z",
            registrationDeadline: "2099-03-09T12:00:00Z",
            status: "PUBLISHED",
            capacity: 30,
            registeredCount: 5,
            priceCents: 0,
          },
          {
            id: "pinned-1",
            title: "排在第二位的活动",
            category: "DOMESTIC",
            coverUrl: "/assets/category-domestic.jpg",
            location: "武夷山",
            startAt: "2099-03-02T09:00:00Z",
            registrationDeadline: "2099-03-01T12:00:00Z",
            status: "PUBLISHED",
            capacity: 20,
            registeredCount: 8,
            priceCents: 19900,
          },
        ],
        featuredEquipment: [],
      };
    }
    if (path.startsWith("/articles")) return { items: [] };
    return { banners: [], equipment: [], categories: [], paymentEnabled: false };
  };

  const home = mountPage("home");
  await home.load();

  assert.equal(home.data.modules[1].id, "ACTIVITIES");
  assert.equal(home.data.hero.title, "定制首页主标题");
  assert.deepEqual(
    home.data.items.map((x) => x.id),
    ["pinned-2", "pinned-1"],
  );
  assert.equal(home.data.footer.followEnabled, true);
  assert.equal(home.data.footer.followQrcodes.length, 2);
  assert.equal(home.data.footer.brandWidthPx, 296);

  // Open multi-QR popup
  await home.openCategory({ currentTarget: { dataset: { slot: 1 } } });
  assert.equal(home.data.popup.title, "扫码加群");
  assert.equal(home.data.popupImages.length, 2);
  assert.equal(home.data.popupImages[0].label, "领队微信");
  home.closePopup();

  const url = "https://mp.weixin.qq.com/s/WildboyStory2026";
  await home.openCategory({ currentTarget: { dataset: { slot: 2 } } });
  assert.deepEqual(openedOfficialUrls, []);
  assert.deepEqual(navigated, ["/pages/article/index?about=1&source=" + encodeURIComponent(url) + "&content=12345678-1234-1234-1234-123456789abc"]);

  // Other explicitly external article actions keep their original behavior.
  await home.dispatchAction({ type: "WECHAT_ARTICLE", wechatArticleUrl: url });
  assert.deepEqual(openedOfficialUrls, [url]);
});

test("activity detail displays confirmed attendee avatars/nicknames and supports single & multi-address map navigation", async () => {
  api.request = async (path) => {
    if (path === "/activities/act-nav") {
      return {
        id: "act-nav",
        title: "多上车点海岸徒步",
        category: "WEEKLY",
        coverUrl: "/assets/category-weekly.jpg",
        galleryUrls: [],
        summary: "集合出发",
        description: "详细行程",
        location: "漳州火山岛",
        meetingPoint: "岛内与海沧两处集合",
        boardingPoints: ["SM城市广场北门", "海沧阿罗海"],
        navigationPoints: [
          {
            id: "n-dest",
            kind: "DESTINATION",
            label: "漳州火山岛景区",
            address: "漳州市漳浦县前亭镇",
            latitude: 24.198765,
            longitude: 117.923456,
          },
          {
            id: "n-meet-1",
            kind: "MEETING",
            label: "SM城市广场北门",
            address: "厦门市湖里区嘉禾路468号",
            latitude: 24.501111,
            longitude: 118.126666,
          },
          {
            id: "n-meet-2",
            kind: "MEETING",
            label: "海沧阿罗海广场",
            address: "厦门市海沧区滨湖北二路",
            latitude: 24.484444,
            longitude: 118.033333,
          },
        ],
        startAt: "2099-05-01T08:30:00Z",
        endAt: "2099-05-01T18:00:00Z",
        registrationDeadline: "2099-04-30T18:00:00Z",
        capacity: 30,
        registeredCount: 3,
        status: "PUBLISHED",
        priceCents: 0,
        currency: "CNY",
        version: 1,
      };
    }
    if (path === "/activities/act-nav/attendees") {
      return {
        totalParticipants: 3,
        totalUsers: 2,
        items: [
          {
            nickname: "阿野",
            avatarUrl: "/assets/hero-hiking.jpg",
            partySize: 2,
            joinedAt: "2026-11-25T10:00:00Z",
          },
          {
            nickname: "小山",
            avatarUrl: "",
            partySize: 1,
            joinedAt: "2026-11-25T11:00:00Z",
          },
        ],
      };
    }
    return { blocks: [], version: 0 };
  };

  const detail = mountPage("detail");
  detail.onLoad({ id: "act-nav" });
  await Promise.all([detail.load(), detail.loadAttendees()]);

  // Attendees avatars & nicknames
  assert.equal(detail.data.attendeeTotalParticipants, 3);
  assert.equal(detail.data.visibleAttendees.length, 2);
  assert.equal(detail.data.visibleAttendees[0].nickname, "阿野");
  assert.equal(detail.data.visibleAttendees[0].partySize, 2);
  assert.equal(detail.data.visibleAttendees[1].initial, "小");

  // Single destination opens wx.openLocation directly
  detail.tapDestinationNav();
  assert.equal(openedLocations.length, 1);
  assert.equal(openedLocations[0].name, "漳州火山岛景区");
  assert.equal(openedLocations[0].latitude, 24.198765);

  // Multiple meeting points opens selector sheet, choosing item #2 opens its coordinates
  detail.tapMeetingNav();
  assert.equal(detail.data.navPickerOpen, true);
  assert.equal(detail.data.navPickerItems.length, 2);
  detail.selectNavItem({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(detail.data.navPickerOpen, false);
  assert.equal(openedLocations.length, 2);
  assert.equal(openedLocations[1].name, "海沧阿罗海广场");
});

test("activity boarding addresses stay folded until the native detail button is tapped", () => {
  const markup = require("node:fs").readFileSync(require("node:path").join(__dirname, "../dist/pages/detail/index.wxml"), "utf8");
  const boarding = markup.slice(markup.indexOf('class="fact-row boarding-fact-block"') - 45, markup.indexOf("报名截止"));
  assert.ok(boarding.includes('wx:if="{{boardingStops.length}}"'));
  assert.ok(boarding.includes('bindtap="toggleBoardingStops"'));
  assert.ok(boarding.includes("查看上车点") && boarding.includes("收起上车点"));
  assert.ok(boarding.includes('wx:if="{{boardingStopsExpanded}}" class="boarding-stop-list"'));
  assert.ok(boarding.indexOf("{{item.address}}") > boarding.indexOf('wx:if="{{boardingStopsExpanded}}"'));
  assert.ok(boarding.includes('bindtap="tapBoardingStop"'));

  const detail = mountPage("detail");
  detail.toggleBoardingStops();
  assert.equal(detail.data.boardingStopsExpanded, false, "no stops cannot open");
  detail.setData({
    boardingStops: [
      { label: "北门", address: "厦门市湖里区嘉禾路468号", hasCoord: true, latitude: 24.501, longitude: 118.126 },
      { label: "南门", address: "海沧阿罗海", hasCoord: false },
    ],
  });
  assert.equal(detail.data.boardingStopsExpanded, false);
  detail.toggleBoardingStops();
  assert.equal(detail.data.boardingStopsExpanded, true);
  const copied = [];
  wx.setClipboardData = ({ data }) => copied.push(data);
  detail.tapBoardingStop({ currentTarget: { dataset: { index: 0 } } });
  detail.tapBoardingStop({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(openedLocations[0].latitude, 24.501);
  assert.deepEqual(copied, ["海沧阿罗海"]);
  detail.toggleBoardingStops();
  assert.equal(detail.data.boardingStopsExpanded, false);
  assert.equal(detail.data.boardingStops.length, 2, "closing does not clear the places");
});

test("plain destination and meeting addresses copy their own text when only boarding has coordinates", () => {
  const copied = [];
  wx.setClipboardData = ({ data }) => copied.push(data);
  const detail = mountPage("detail");
  detail.setData({
    activity: { location: "徒步终点", meetingPoint: "山下停车场" },
    navPoints: [{ kind: "BOARDING", label: "市区上车点", latitude: 24.48, longitude: 118.08 }],
  });
  detail.tapDestinationNav();
  detail.tapMeetingNav();
  assert.deepEqual(copied, ["徒步终点", "山下停车场"]);
  assert.deepEqual(openedLocations, []);
});

test("a single QR keeps its configured label and full-size preview", () => {
  const home = mountPage("home");
  const image = { url: "https://example.com/qr.png", label: "领队微信" };
  home.showPopupDialog("扫码", "", [image]);
  assert.deepEqual(home.data.popupImages, [image]);
  let preview;
  wx.previewImage = (options) => { preview = options; };
  home.previewPopupQr({ currentTarget: { dataset: { url: image.url } } });
  assert.deepEqual(preview, { current: image.url, urls: [image.url] });
  const markup = require("node:fs").readFileSync("dist/pages/home/index.wxml", "utf8");
  assert.match(markup, /popupImages\.length === 1[\s\S]*?{{popupImages\[0\]\.label}}/);
});

test("an explicit empty shortcut image list clears a legacy QR", () => {
  const { normalizePublicHomeLayout } = require("../dist/utils/home-layout.js");
  const legacy = { name: "二维码", type: "POPUP", popupImageUrl: "/assets/equipment.jpg" };
  const result = normalizePublicHomeLayout({ layout: {
    modules: [], shortcuts: { items: [legacy, { ...legacy, popupImages: [] }] },
  } });
  assert.deepEqual(result.shortcuts[0].popupImages, [{ url: legacy.popupImageUrl, label: "" }]);
  assert.deepEqual(result.shortcuts[1].popupImages, []);
  assert.equal(result.shortcuts[1].popupImageUrl, "");
});


test("the native home footer renders custom cells, omits blanks and preserves additional QR codes", () => {
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const wxml = readFileSync(join(__dirname, "../dist/pages/home/index.wxml"), "utf8");
  const wxss = readFileSync(join(__dirname, "../dist/pages/home/index.wxss"), "utf8");
  const footer = wxml.slice(wxml.indexOf('class="home-footer {{'), wxml.indexOf('class="shortcut-mask"'));
  assert.match(footer, /wx:for="{{footer\.cells}}" wx:key="id"/);
  assert.match(footer, /show-menu-by-longpress[^>]+bindtap="previewFollowQr"/);
  assert.match(wxss, /\.home-footer\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  const { normalizePublicHomeLayout } = require("../dist/utils/home-layout.js");
  const raw = { followEnabled: true, brandEnabled: true, followTitle: "关注", followSubtitle: "",
    followQrcodes: ["one", "two", "three"].map(s => ({url: "/assets/" + s + ".png", label: ""})) };
  const cells = (args) => normalizePublicHomeLayout({layout: { modules: [], footer: {...raw, ...args} }}).footer.cells.map(cell => cell.id);
  assert.deepEqual(cells({}), ["BRAND","QR1","TEXT","QR2","QR3"]);
  assert.deepEqual(cells({cellOrder: ["TEXT","QR2","BRAND","QR1"]}), ["TEXT","QR2","BRAND","QR1","QR3"]);
  assert.deepEqual(cells({cellOrder: ["TEXT","TEXT","BRAND","QR1"]}), ["BRAND","QR1","TEXT","QR2","QR3"]);
  assert.deepEqual(cells({followTitle: " ", brandEnabled: false}), ["QR1","QR2","QR3"]);
  assert.deepEqual(cells({followQrcodes: []}), ["BRAND"]);
  assert.deepEqual(cells({followEnabled: false, brandEnabled: false}), []);
  const threeFooter = normalizePublicHomeLayout({
    layout: {
      modules: [],
      footer: { ...raw, layoutPreset: "THREE_L1_R2", colRatio: 40, rowRatio: 60 },
    },
  }).footer;
  assert.deepEqual(threeFooter.cells.map((cell) => cell.id), ["BRAND", "QR1", "TEXT", "QR3"]);
  assert.equal(threeFooter.cells[0].cellStyle, "grid-column:1;grid-row:1 / span 2;");
  assert.match(threeFooter.gridStyle, /minmax\(0,40fr\) minmax\(0,60fr\)/);
  assert.match(threeFooter.gridStyle, /minmax\(0,60fr\) minmax\(0,40fr\)/);
  const twoTbFooter = normalizePublicHomeLayout({
    layout: {
      modules: [],
      footer: { ...raw, followQrcodes: [raw.followQrcodes[0]], layoutPreset: "TWO_TB", rowRatio: 35 },
    },
  }).footer;
  assert.deepEqual(twoTbFooter.cells.map((cell) => cell.id), ["BRAND", "QR1"]);
  assert.match(twoTbFooter.gridStyle, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(twoTbFooter.gridStyle, /minmax\(0,35fr\) minmax\(0,65fr\)/);
  const genericFooter = normalizePublicHomeLayout({
    layout: {
      modules: [],
      footer: {
        ...raw,
        columns: 3,
        colRatios: [30, 40, 30],
        blocks: [
          { id: "b1", enabled: true, colSpan: 2, rowSpan: 1, topType: "IMAGE", topImageUrl: "/assets/one.png", topImageWidthPx: 180, topPreviewable: false, bottomType: "TEXT", bottomText: "品牌标语" },
          { id: "b2", enabled: true, colSpan: 1, rowSpan: 1, topType: "IMAGE", topImageUrl: "https://example.test/qr.png", topImageWidthPx: 92, topPreviewable: true, bottomType: "TEXT", bottomText: "扫码关注" },
          { id: "b3", enabled: false, colSpan: 1, rowSpan: 1, topType: "TEXT", topText: "隐藏项", bottomType: "NONE" },
        ],
      },
    },
  }).footer;
  assert.deepEqual(genericFooter.cells.map((c) => c.id), ["b1", "b2"]);
  assert.equal(genericFooter.cells[0].cellStyle, "grid-column:span 2");
  assert.match(genericFooter.gridStyle, /minmax\(0,30fr\) minmax\(0,40fr\) minmax\(0,30fr\)/);
  assert.deepEqual(genericFooter.previewUrls, ["https://example.test/qr.png"]);
  const home = mountPage("home");
  const urls = ["https://example.test/oa.png", "https://example.test/video.png"];
  home.data.footer = normalizePublicHomeLayout({layout: {modules: [], footer: {...raw, cellOrder: ["BRAND","QR2","TEXT","QR1"], followQrcodes: urls.map((url) => ({ url, label: "" }))} }}).footer;
  const calls = [];
  wx.previewImage = (input) => calls.push(input);
  home.previewFollowQr({ currentTarget: { dataset: { url: urls[1] } } });
  assert.deepEqual(calls.map(({ current, urls }) => ({ current, urls })), [{ current: urls[1], urls: [urls[1], urls[0]] }]);
});
