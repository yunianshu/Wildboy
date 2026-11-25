const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../dist/utils/domain.js");
const now = Date.parse("2026-10-26T00:00:00Z");
const a = {
  status: "PUBLISHED",
  startAt: "2026-11-01T08:00:00+08:00",
  registrationDeadline: "2026-10-30T23:00:00+08:00",
  capacity: 10,
  registeredCount: 9,
  priceCents: 0,
};
test("category labels preserve requested wording and exactly four entries", () => {
  assert.deepEqual(d.categories.map(({ code, name }) => [code, name]), [
    ["WEEKLY", "户外活动"],
    ["DOMESTIC", "户外旅行"],
    ["HOLIDAY", "重装露营"],
    ["LEISURE", "休闲活动"],
  ]);
  assert.equal(d.categoryName("DOMESTIC"), "户外旅行");
  assert.equal(d.validCategory("ADMIN"), false);
});
test("dates display Asia/Shanghai independent of host zone", () => {
  assert.equal(d.dateLabel("2026-10-25T18:00:00Z"), "10.26 02:00");
  assert.equal(d.dateLabel("bad"), "时间待确认");
});
test("registration preserves free flow and opens valid published paid activities", () => {
  assert.equal(d.registrationState(a, now).enabled, true);
  assert.equal(d.registrationState(a, now).label, "免费报名");
  assert.deepEqual(d.registrationState({...a,priceCents:100},now), {enabled:true,label:"报名并确认费用"});
  for (const overrides of [
    { status: "DRAFT" },
    { status: "CANCELLED" },
    { priceCents: -1 },
    { priceCents: 1.1 },
  ])
    assert.equal(
      d.registrationState({ ...a, ...overrides }, now).enabled,
      false,
    );
});
test("capacity and date boundaries close registration", () => {
  for (const overrides of [
    { registeredCount: 10 },
    { registeredCount: 11 },
    { registrationDeadline: new Date(now).toISOString() },
    { startAt: new Date(now).toISOString() },
    { registrationDeadline: "invalid" },
  ])
    assert.equal(
      d.registrationState({ ...a, ...overrides }, now).enabled,
      false,
    );
});
test("multiple participants require valid identity, phone and consent", () => {
  const first = {
    participantName: "王小明",
    idNumber: "11010519491231002X",
    phone: "13800138000",
  };
  const second = {
    participantName: "李小红",
    idNumber: "110105194912310038",
    phone: "13800138001",
  };
  assert.equal(d.validateParticipants([first, second], true), "");
  assert.notEqual(d.validateParticipants([], true), "");
  assert.notEqual(
    d.validateParticipants([{ ...first, participantName: "王" }], true),
    "",
  );
  assert.notEqual(
    d.validateParticipants([{ ...first, idNumber: "110105194912310020" }], true),
    "",
  );
  assert.notEqual(
    d.validateParticipants([{ ...first, phone: "1380013800" }], true),
    "",
  );
  assert.notEqual(d.validateParticipants([first, first], true), "");
  assert.notEqual(d.validateParticipants([first], false), "");
  const stops = ["北门", "南门"];
  assert.match(d.validateParticipants([{ ...first, boardingPoint: "北门" }, second], true, true, stops), /第 2 位参与人的上车地点/);
  assert.match(d.validateParticipants([{ ...first, boardingPoint: "旧站" }], true, true, stops), /上车地点/);
  assert.equal(d.validateParticipants([
    { ...first, boardingPoint: "北门" },
    { ...second, boardingPoint: "南门" },
  ], true, true, stops), "");
  assert.equal(d.maskIdNumber(first.idNumber), "110105********002X");
  assert.equal(d.maskIdNumber(""), "历史记录未登记");
});
test("pagination merges repeats rather than duplicate cards", () => {
  assert.deepEqual(
    d.mergeUnique(
      [{ id: "1", a: 1 }],
      [
        { id: "1", a: 2 },
        { id: "2", a: 3 },
      ],
    ),
    [
      { id: "1", a: 2 },
      { id: "2", a: 3 },
    ],
  );
});
test("stale and unloaded requests cannot overwrite newer state", () => {
  const e = new d.RequestEpoch();
  const first = e.next(),
    second = e.next();
  assert.equal(e.valid(first), false);
  assert.equal(e.valid(second), true);
  e.invalidate();
  assert.equal(e.valid(second), false);
});
test("navigation rejects traversal and malformed ids", () => {
  assert.equal(d.safeId("../admin"), "");
  assert.equal(d.safeId("x?foo=1"), "");
  assert.equal(d.safeId("a-b_2"), "a-b_2");
  assert.equal(d.safeId(undefined), "");
});
