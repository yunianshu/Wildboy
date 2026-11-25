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

  // Tap "关于野小子" -> opens WeChat Official Account article natively
  await home.openCategory({ currentTarget: { dataset: { slot: 2 } } });
  assert.deepEqual(openedOfficialUrls, [
    "https://mp.weixin.qq.com/s/WildboyStory2026",
  ]);
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
