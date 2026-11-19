const {test, beforeEach} = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const helpers = require("../dist/utils/display-profile.js");
let definition, current, calls, back, user, storage;
global.Page = d => { definition = d; };
global.wx = {
 getStorageSync: k => storage[k], setStorageSync: (k,v) => {storage[k]=v;},
 navigateBack: () => {back++;}, switchTab() {}, canIUse: () => true,
 getAppBaseInfo: () => ({SDKVersion:"3.7.0"}), getSystemInfoSync: () => ({SDKVersion:"3.7.0"})
};
function page() {
 const path = require.resolve("../dist/pages/display-profile/index.js"); delete require.cache[path]; require(path);
 const p = {...definition, data:structuredClone(definition.data), setData(v) {Object.assign(this.data,v);}};
 p.setData({canChooseAvatar:true,canReviewNickname:true});
 for(const k in p) if(typeof p[k] === "function") p[k]=p[k].bind(p);
 return p;
}
beforeEach(() => {
 current=true;calls=[];back=0;storage={};
 user={id:"u",role:"USER",accountSource:"WECHAT",wechatVerified:true,nickname:"Existing",avatarUrl:"/assets/uploads/avatar-old.png",displayProfileCompleted:true};
 api.hasSession=()=>true; api.sessionVersion=()=>1; api.isSessionCurrent=()=>current;
 api.getCurrentUser=async()=>({...user});
 api.request=async(path,method,data)=> {calls.push({path,method,data});return {...user,nickname:data.nickname||user.nickname,avatarUrl:data.avatarBase64?"/assets/uploads/avatar-new.png":user.avatarUrl,displayProfileCompleted:true};};
 helpers.readAvatarBase64=async()=>"aW1hZ2U=";
});
test("existing data is loaded and skipping never writes or changes login",async()=>{
 const p=page();await p.load();assert.equal(p.data.nickname,"Existing");p.skip();assert.equal(calls.length,0);assert.equal(back,1);
});
test("empty nickname preserves stored nickname when changing avatar",async()=>{
 const p=page();await p.load();p.setData({nickname:"",avatarPath:"wxfile://avatar"});await p.save();
 assert.deepEqual(calls[0].data,{avatarBase64:"aW1hZ2U="});assert.equal(p.data.user.nickname,"Existing");assert.equal(p.data.saved,true);
});
test("native avatar picker hide keeps draft",async()=>{
 const p=page();await p.load();p.setData({nickname:"Draft"});p.onHide();p.chooseAvatar({detail:{avatarUrl:"wxfile://avatar"}});
 assert.equal(p.data.nickname,"Draft");assert.equal(p.data.avatarPath,"wxfile://avatar");
});
test("account switch while reading avatar cannot send another user profile",async()=>{
 const p=page();await p.load();p.setData({avatarPath:"wxfile://avatar"});let resolve;
 helpers.readAvatarBase64=()=>new Promise(r=>{resolve=r;});const task=p.save();current=false;resolve("aW1hZ2U=");await task;
 assert.equal(calls.length,0);assert.equal(p.data.user,null);
});
test("unload during avatar read blocks write and navigation",async()=>{
 const p=page();await p.load();p.setData({avatarPath:"wxfile://avatar"});let resolve;
 helpers.readAvatarBase64=()=>new Promise(r=>{resolve=r;});const task=p.save();p.onUnload();resolve("aW1hZ2U=");await task;
 assert.equal(calls.length,0);assert.equal(back,0);
});
test("failed save preserves retry draft and skip remains available",async()=>{
 const p=page();await p.load();p.setData({avatarPath:"wxfile://avatar"});api.request=async()=>{throw new Error("network");};await p.save();
 assert.equal(p.data.avatarPath,"wxfile://avatar");assert.equal(p.data.saving,false);assert.equal(p.data.saved,false);p.skip();assert.equal(back,1);
});
test("incomplete confirmed response is not treated as saved",async()=>{
 const p=page();await p.load();p.setData({avatarPath:"wxfile://avatar"});api.request=async()=>({...user,id:"different"});await p.save();
 assert.equal(p.data.saved,false);assert.ok(p.data.error);
});
test("optional prompting is scoped to real WeChat account and per-user skip",()=>{
 const fresh={...user,displayProfileCompleted:false};assert.equal(helpers.shouldOfferDisplayProfile(fresh),true);
 helpers.markDisplayProfileSeen("u");assert.equal(helpers.shouldOfferDisplayProfile(fresh),false);
 assert.equal(helpers.shouldOfferDisplayProfile({...fresh,id:"v"}),true);
 assert.equal(helpers.shouldOfferDisplayProfile({...fresh,id:"v",accountSource:"PASSWORD"}),false);
});

test("nickname cannot save until current review passes",async()=>{
 const p=page();await p.load();p.inputNickname({detail:{value:"New"}});await p.save();assert.equal(calls.length,0);
 p.blurNickname({detail:{value:"New"}});await p.save();assert.equal(calls.length,0);
 p.reviewNickname({detail:{pass:true},currentTarget:{dataset:{reviewKey:p.inputGeneration}}});await p.save();
 assert.deepEqual(calls[0].data,{nickname:"New"});assert.equal(p.data.saved,true);
});
test("failed or stale nickname review cannot authorize a newer value",async()=>{
 const p=page();await p.load();p.inputNickname({detail:{value:"First"}});p.blurNickname({detail:{value:"First"}});
 const oldGeneration=p.inputGeneration;p.resetNicknameReview();p.inputNickname({detail:{value:"Second"}});p.blurNickname({detail:{value:"Second"}});
 p.reviewNickname({detail:{pass:true},currentTarget:{dataset:{reviewKey:oldGeneration}}});await p.save();assert.equal(calls.length,0);
 p.reviewNickname({detail:{pass:false},currentTarget:{dataset:{reviewKey:p.inputGeneration}}});await p.save();assert.equal(calls.length,0);p.skip();assert.equal(back,1);
});
test("unsupported nickname review never saves unreviewed new name",async()=>{
 const p=page();await p.load();p.setData({canReviewNickname:false,nickname:"New"});await p.save();assert.equal(calls.length,0);p.skip();assert.equal(back,1);
});
test("avatar dimension precheck rejects oversized images before any upload",async()=>{
 const p=page();await p.load();
 try{
  global.wx.getImageInfo=o=>o.success({width:2000,height:100});
  p.chooseAvatar({detail:{avatarUrl:"wxfile://big"}});
  assert.match(p.data.error,/1024/);assert.equal(p.data.avatarPath,"");
  global.wx.getImageInfo=o=>o.success({width:1024,height:1024});
  p.chooseAvatar({detail:{avatarUrl:"wxfile://ok"}});
  assert.equal(p.data.avatarPath,"wxfile://ok");assert.equal(p.data.error,"");
  global.wx.getImageInfo=o=>o.fail();
  p.chooseAvatar({detail:{avatarUrl:"wxfile://fallback"}});
  assert.equal(p.data.avatarPath,"wxfile://fallback");
 }finally{delete global.wx.getImageInfo;}
});
