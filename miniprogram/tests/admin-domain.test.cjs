const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emptyForm,
  buildInput,
  chinaIso,
  chinaFields,
  formFromActivity,
  maskPhone,
  safeImage,
  statusLabel,
} = require("../dist/pages/admin-editor/shared.js");
const form = () => ({
  ...emptyForm(),
  title: "山野徒步",
  summary: "一场轻徒步",
  description: "带好饮水，保护山野",
  location: "示例山野",
  meetingPoint: "示例集合点",
  startDate: "2099-11-07",
  startTime: "06:30",
  endDate: "2099-11-07",
  endTime: "12:00",
  deadlineDate: "2099-11-06",
  deadlineTime: "18:00",
});
test("admin valid form produces server contract and zero payment", () => {
  const p = buildInput(form(), 0, 0);
  assert.equal(p.priceCents, 0);
  assert.equal(p.startAt, "2099-11-07T06:30:00+08:00");
  assert.deepEqual(p.galleryUrls, []);
  assert.equal(p.capacity, 20);
});
test("invalid capacity below attendance, fractions and limits rejected", () => {
  for (const capacity of ["0", "3.2", "10001", "1e2", "-1"])
    assert.throws(() => buildInput({ ...form(), capacity }, 0, 0));
  assert.throws(() => buildInput({ ...form(), capacity: "2" }, 3, 0));
});
test("date validation rejects impossible day and invalid clock", () => {
  for (const [date, time] of [
    ["2099-02-30", "12:00"],
    ["2099-11-07", "25:00"],
    ["bad", "06:30"],
  ])
    assert.throws(() => chinaIso(date, time));
});
test("chronology and registration cutoff validated independently of device zone", () => {
  assert.throws(() => buildInput({ ...form(), endTime: "06:00" }, 0, 0));
  assert.throws(() =>
    buildInput({ ...form(), deadlineDate: "2099-11-08" }, 0, 0),
  );
  assert.throws(() => buildInput(form(), 0, Date.parse("2100-01-01")));
});
test("UTC instant renders correct Shanghai picker fields", () => {
  assert.deepEqual(chinaFields("2099-11-06T22:30:00Z"), {
    date: "2099-11-07",
    time: "06:30",
  });
});
test("covers and gallery reject unsafe URL schemes/path traversal", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://x.test/i.jpg",
    "/assets/../a",
    "data:image/png",
  ])
    assert.equal(safeImage(url), false);
  assert.equal(safeImage("/assets/category-weekly.jpg"), true);
  assert.throws(() =>
    buildInput(
      {
        ...form(),
        galleryText: Array(13).fill("https://x.test/a.jpg").join("\n"),
      },
      0,
      0,
    ),
  );
});
test("full form preserves gallery and maps activity dates", () => {
  const input = buildInput(
    { ...form(), galleryText: "https://a.test/1.jpg\nhttps://a.test/2.jpg" },
    0,
    0,
  );
  const f = formFromActivity({
    ...input,
    registeredCount: 4,
    status: "DRAFT",
    version: 2,
  });
  assert.equal(f.galleryText, "https://a.test/1.jpg\nhttps://a.test/2.jpg");
  assert.equal(f.deadlineDate, "2099-11-06");
});
test("name, summary, location and category cannot be omitted", () => {
  for (const field of [
    "title",
    "summary",
    "description",
    "location",
    "meetingPoint",
  ])
    assert.throws(() => buildInput({ ...form(), [field]: "" }, 0, 0));
  assert.throws(() => buildInput({ ...form(), category: "UNKNOWN" }, 0, 0));
});
test("phones masked and status user-readable", () => {
  assert.equal(maskPhone("13812340123"), "138 **** 0123");
  assert.equal(maskPhone("123"), "••••");
  assert.equal(statusLabel("CANCELLED"), "已取消");
});
