const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const shared = require("../dist/pages/admin-editor/shared.js");
let definition, calls, written, shared_files;
global.Page = (d) => { definition = d; };
function page() {
  const f = require.resolve("../dist/pages/admin-roster/index.js");
  delete require.cache[f];
  require(f);
  const p = { ...definition, data: structuredClone(definition.data), setData(v) { Object.assign(this.data, v); } };
  p.onLoad({ id: "a" });
  return p;
}
const registration = (id) => ({
  id, activityId: "a", status: "CONFIRMED", createdAt: "2026-11-01T00:00:00Z",
  participants: [{ id: id + "-p1", participantName: "张三", phone: "13800000000", idNumber: "110***X" }],
});
beforeEach(() => {
  calls = []; written = []; shared_files = [];
  shared.requireAdmin = async () => 1;
  api.sessionVersion = () => 1;
  api.isSessionCurrent = () => true;
  api.request = async (url) => {
    calls.push(url);
    if (url.includes("/registrations?")) {
      const offset = Number(new URLSearchParams(url.split("?")[1]).get("page") || 0);
      return { items: [registration("r" + offset)], page: offset, size: 100, total: 2, hasMore: offset === 0 };
    }
    return { id: "a", title: "山野徒步", capacity: 10, registeredCount: 1, startAt: "2026-11-10T00:00:00Z", location: "东门" };
  };
  global.wx = {
    navigateTo() {}, showToast() {},
    showModal: async () => ({ confirm: true }),
    env: { USER_DATA_PATH: "user://" },
    getFileSystemManager() {
      return { writeFileSync: (p, c, enc) => written.push({ p, c, enc }) };
    },
    shareFileMessage(o) { shared_files.push(o); o.success(); },
  };
});
const flush = () => new Promise((r) => setImmediate(r));

test("export fetches every page, writes a UTF-8 BOM CSV and hands one file to WeChat", async () => {
  const p = page();
  await p.load(true);
  await p.export();
  await flush();
  const pages = calls.filter((u) => u.includes("/registrations?") && u.includes("size=100"));
  assert.equal(pages.length, 2);
  assert.match(pages[0], /page=0/);
  assert.match(pages[1], /page=1/);
  assert.equal(shared_files.length, 1);
  assert.match(shared_files[0].fileName, /报名名单-山野徒步/);
  assert.equal(written.length, 1);
  assert.equal(written[0].enc, "utf8");
  const csv = written[0].c;
  assert.ok(csv.startsWith("﻿"), "CSV must carry a UTF-8 BOM so Excel opens Chinese text");
  assert.match(csv, /"序号","姓名","手机号","证件号","状态","报名时间","同行序号"/);
  assert.match(csv, /"1","张三","13800000000","110\*\*\*X","已报名"/);
  assert.match(csv, /"2","张三","13800000000","110\*\*\*X","已报名"/);
  assert.equal(shared_files[0].filePath, written[0].p);
});

test("export never writes or shares when the organizer declines the privacy confirm", async () => {
  const p = page();
  await p.load(true);
  global.wx.showModal = async () => ({ confirm: false });
  await p.export();
  await flush();
  assert.equal(written.length, 0);
  assert.equal(shared_files.length, 0);
});

test("a share failure surfaces as a page error instead of a fake success", async () => {
  const p = page();
  await p.load(true);
  global.wx.shareFileMessage = (o) => o.fail({ errMsg: "shareFileMessage:fail unsupported" });
  await p.export();
  await flush();
  assert.ok(p.data.error);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.authorized, true);
});
