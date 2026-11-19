const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {validateParticipants} = require("../dist/utils/domain.js");
test("identity-free activities allow multiple blank ID participants", () => {
  assert.equal(validateParticipants([{participantName:"张三",idNumber:"",phone:"13800000000"},{participantName:"李四",idNumber:"",phone:"13800000001"}],true,false), "");
});
test("identity-required activities retain ID validation", () => {
  assert.match(validateParticipants([{participantName:"张三",idNumber:"",phone:"13800000000"}],true,true), /身份证/);
});
test("registration only displays ID field when activity requires it", () => {
  const text = fs.readFileSync(path.join(__dirname,"../src/pages/register/index.wxml"),"utf8");
  assert.match(text, /wx:if="{{activity.identityRequired}}"/);
});
