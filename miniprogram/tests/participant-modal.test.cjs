const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let definition;
global.Page = (d) => { definition = d; };
require("../dist/pages/register/index.js");
const blank = { participantName: "", idNumber: "", phone: "" };
const first = { participantName: "第一人", idNumber: "11010519491231002X", phone: "13800000000" };
const second = { participantName: "第二人", idNumber: "110105194912310038", phone: "13800000001" };
function page(identityRequired = false) {
  return {
    ...definition,
    data: { ...structuredClone(definition.data), participants: [structuredClone(first)], activity: { enabled: true, available: 3, identityRequired } },
    setData(update) { Object.assign(this.data, update); },
  };
}
function type(p, field, value) {
  p.inputParticipantDraft({ currentTarget: { dataset: { field } }, detail: { value } });
}
function fill(p, person = second) {
  for (const [field, value] of Object.entries(person)) type(p, field, value);
}
test("add opens isolated draft, repeated open and typing never append a row", () => {
  const p = page();
  p.addParticipant();
  assert.equal(p.data.participantModalOpen, true);
  assert.deepEqual(p.data.participants, [first]);
  fill(p);
  p.addParticipant();
  assert.deepEqual(p.data.participantDraft, second);
  assert.deepEqual(p.data.participants, [first]);
  type(p, "unexpected", "bad");
  assert.deepEqual(p.data.participantDraft, second);
});
test("cancel, close or background discards draft without changing participants", () => {
  for (const close of ["cancelParticipant", "onHide", "onUnload"]) {
    const p = page();
    p.addParticipant(); fill(p); p[close]();
    assert.equal(p.data.participantModalOpen, false);
    assert.deepEqual(p.data.participantDraft, blank);
    assert.deepEqual(p.data.participants, [first]);
    p.confirmParticipant();
    assert.deepEqual(p.data.participants, [first]);
    p.addParticipant();
    assert.deepEqual(p.data.participantDraft, blank);
  }
});
test("confirm validates before appending and repeated confirm adds only once", () => {
  const p = page(); p.addParticipant(); p.confirmParticipant();
  assert.match(p.data.participantError, /姓名/);
  assert.equal(p.data.participants.length, 1);
  fill(p, { ...second, phone: "123" }); p.confirmParticipant();
  assert.match(p.data.participantError, /手机号/);
  assert.equal(p.data.participantModalOpen, true);
  fill(p, { ...second, participantName: " 第二人 ", phone: " 13800000001 " });
  p.confirmParticipant(); p.confirmParticipant();
  assert.deepEqual(p.data.participants, [first, { ...second, idNumber: "" }]);
  assert.equal(p.data.participantModalOpen, false);
  assert.deepEqual(p.data.participantDraft, blank);
});
test("required identity remains mandatory and duplicates cannot be added", () => {
  const p = page(true); p.addParticipant();
  fill(p, { ...second, idNumber: "" }); p.confirmParticipant();
  assert.match(p.data.participantError, /身份证号/);
  fill(p, first); p.confirmParticipant();
  assert.match(p.data.participantError, /已在报名名单/);
  assert.equal(p.data.participants.length, 1);
  fill(p, second); p.confirmParticipant();
  assert.deepEqual(p.data.participants, [first, second]);
});
test("capacity is rechecked at open and confirm, disabled activity blocks addition", () => {
  const p = page(); p.data.activity.available = 1; p.addParticipant();
  assert.equal(p.data.participantModalOpen, false);
  assert.match(p.data.fieldError, /剩余名额/);
  p.data.activity.available = 2; p.addParticipant(); fill(p);
  p.data.activity.available = 1; p.confirmParticipant();
  assert.match(p.data.participantError, /名额不足/);
  assert.equal(p.data.participants.length, 1);
  p.data.activity.available = 2; p.data.activity.enabled = false; p.confirmParticipant();
  assert.equal(p.data.participants.length, 1);
});
test("submitting and success block participant mutation and modal blocks submit", async () => {
  for (const flag of ["submitting", "success"]) {
    const p = page(); p.data[flag] = true; p.addParticipant();
    assert.equal(p.data.participantModalOpen, false);
    p.removeParticipant({ currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(p.data.participants, [first]);
  }
  const p = page(); p.addParticipant(); fill(p); await p.submit();
  assert.equal(p.data.submitting, false);
  assert.equal(p.data.fieldError, "");
  assert.equal(p.data.participants.length, 1);
});
test("markup connects modal buttons and uses isolated draft inputs", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/pages/register/index.wxml"), "utf8");
  assert.match(html, /wx:if="{{participantModalOpen}}"[^>]+catchtap="cancelParticipant"/);
  assert.match(html, /class="participant-dialog"[^>]+catchtap="stopModalEvent"/);
  assert.match(html, /bindtap="confirmParticipant">确认添加/);
  assert.match(html, /participantDraft\.participantName/);
  assert.match(html, /participantDraft\.phone/);
  assert.match(html, /bindinput="inputParticipantDraft"/);
});
