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
      const size = Number(new URLSearchParams(url.split("?")[1]).get("size"));
      if (size > 50) throw new api.ApiError("分页参数超出范围", 400, "INVALID_PAGE");
      return { items: [registration("r" + offset)], page: offset, size, total: 2, hasMore: offset === 0 };
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
  const pages = calls.filter((u) => u.includes("/registrations?") && u.includes("size=50"));
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

test("export locks duplicate confirmations and filter changes, then releases after denial", async () => {
  const p = page(); await p.load(true); let resolve, modalCount = 0;
  global.wx.showModal = () => { modalCount++; return new Promise(done => { resolve = done; }); };
  const pending = p.export(); await p.export();
  p.filter({ currentTarget: { dataset: { status: 'CANCELLED' } } });
  assert.equal(modalCount, 1); assert.equal(p.data.status, '');
  resolve({ confirm: true }); shared.requireAdmin = async () => { throw new api.ApiError('权限已失效', 403, 'FORBIDDEN'); };
  await pending;
  assert.equal(p.data.exporting, false); assert.equal(p.data.loading, false); assert.equal(p.data.authorized, false);
  assert.equal(written.length, 0);
});

test("export keeps its status filter across all pages and never truncates at page 100", async () => {
  const p = page(); await p.load(true); p.setData({ status: 'CONFIRMED' }); calls = [];
  api.request = async url => {
    calls.push(url); const query = new URLSearchParams(url.split('?')[1]);
    assert.equal(query.get('status'), 'CONFIRMED'); assert.equal(query.get('size'), '50');
    const page = Number(query.get('page'));
    const r = registration('r' + page); r.participants[0].participantName = page === 101 ? '=1+1' : '张三';
    return { items: [r], page, size: 50, total: 102, hasMore: page < 101 };
  };
  await p.export();
  assert.equal(calls.length, 102); assert.equal(written[0].c.split('\r\n').length, 103);
  assert.ok(written[0].c.includes('"\'=1+1"')); assert.equal(p.data.exporting, false);
});

test("hiding during export prevents a late response from writing or sharing a file", async () => {
  const p = page(); await p.load(true); let resolve;
  api.request = () => new Promise(done => { resolve = done; });
  const pending = p.export(); await flush(); p.onHide();
  resolve({ items: [registration('late')], page: 0, hasMore: false }); await pending;
  assert.equal(written.length, 0); assert.equal(shared_files.length, 0); assert.equal(p.data.exporting, false);
});
