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
  assert.equal(d.categories.length, 4);
  assert.equal(d.categoryName("DOMESTIC"), "国内游行");
  assert.equal(d.validCategory("ADMIN"), false);
});
test("dates display Asia/Shanghai independent of host zone", () => {
  assert.equal(d.dateLabel("2026-10-25T18:00:00Z"), "10.26 02:00");
  assert.equal(d.dateLabel("bad"), "时间待确认");
});
test("registration is free and published only", () => {
  assert.equal(d.registrationState(a, now).enabled, true);
  for (const overrides of [
    { status: "DRAFT" },
    { status: "CANCELLED" },
    { priceCents: 100 },
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
test("registration name phone and explicit consent validated", () => {
  assert.equal(d.validateParticipant("王小明", "13800138000", true), "");
  assert.notEqual(d.validateParticipant("王", "13800138000", true), "");
  assert.notEqual(d.validateParticipant("王小明", "1380013800", true), "");
  assert.notEqual(d.validateParticipant("王小明", "13800138000", false), "");
  assert.notEqual(
    d.validateParticipant("a".repeat(41), "13800138000", true),
    "",
  );
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
