// Independent native Page/transport verification. Run after miniprogram build.
// Uses only synthetic accounts and mocked wx; NOT a WeChat-device test.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const DIST = path.resolve(__dirname, "../../miniprogram/dist");
let store, requests, navigations, modalAnswer, transport, api, config, navigationOptions, wxLoginCalls;
function fresh() {
  for (const key of Object.keys(require.cache))
    if (key.startsWith(DIST + path.sep)) delete require.cache[key];
  store = {};
  requests = [];
  navigations = [];
  navigationOptions = [];
  wxLoginCalls = 0;
  modalAnswer = { confirm: true, cancel: false };
  transport = (o) =>
    o.success({
      statusCode: 404,
      data: { message: "Unmatched synthetic endpoint" },
    });
  global.wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => (store[k] = v),
    removeStorageSync: (k) => delete store[k],
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    login: (o) => { wxLoginCalls++; o.success({ code: "synthetic-once" }); },
    request: (o) => {
      requests.push(o);
      transport(o);
    },
    navigateTo: (o) => { navigationOptions.push(o); navigations.push(o.url); },
    canIUse: () => true,
    redirectTo: (o) => navigations.push(o.url),
    switchTab: (o) => navigations.push(o.url),
    navigateBack: (o) => navigations.push("BACK"),
    showToast: () => {},
    showModal: async () => modalAnswer,
    stopPullDownRefresh: () => {},
    setNavigationBarTitle: () => {},
    enableAlertBeforeUnload: () => {},
    disableAlertBeforeUnload: () => {},
    getWindowInfo: () => ({ statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 28, bottom: 60 }),
  };
  config = require(path.join(DIST, "config.js")).config;
  config.apiOrigin = "https://wildboy.test";
  config.devLogin = false;
  api = require(path.join(DIST, "utils/api.js"));
}
function respond(o, data, statusCode = 200) {
  o.success({ statusCode, data });
}
function page(name) {
  let def;
  global.Page = (x) => (def = x);
  const file = path.join(DIST, "pages", name, "index.js");
  delete require.cache[require.resolve(file)];
  require(file);
  assert.ok(def, `Page ${name} registered`);
  const p = {
    ...def,
    data: structuredClone(def.data),
    setData(update) {
      for (const [k, v] of Object.entries(update)) {
        const parts = k.split(".");
        let node = this.data;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        node[parts.at(-1)] = v;
      }
    },
  };
  for (const [k, v] of Object.entries(p))
    if (typeof v === "function") p[k] = v.bind(p);
  return p;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(fresh);
const versions = { privacyVersion: 1, termsVersion: 1 };
const document = (kind, version=1) => ({kind,version,title:kind==='PRIVACY'?'测试隐私政策':'测试用户协议',content:'合成测试协议文本，仅用于自动化验证，不是实际法律文本。',publishedAt:'2026-01-01T00:00:00Z'});
const current = (version=1) => ({ready:true,privacy:document('PRIVACY',version),terms:document('TERMS')});
const auth = {token:'synthetic-user-token',user:{id:'user-1',nickname:'Synthetic',role:'USER'}};
const legalState = () => ({kind:'PRIVACY',draft:{title:'示例隐私政策',content:'仅用于隔离测试的足够长纯文本内容。',revision:1},published:document('PRIVACY')});
async function loadedLogin() { const p=page('login'); transport=o=>respond(o,current()); await p.load(); return p; }
function readBoth(p) { p.readPrivacy(); navigationOptions.at(-1).events.legalDocumentLoaded({kind:'PRIVACY',version:1}); p.readTerms(); navigationOptions.at(-1).events.legalDocumentLoaded({kind:'TERMS',version:1}); p.agreement({detail:{value:['yes']}}); }
async function loadedAdmin() { store['wildboy-session']='admin-token'; const p=page('admin-legal'); transport=o=>respond(o,o.url.endsWith('/me')?{id:'admin',role:'ADMIN'}:o.url.endsWith('/versions')?[document('PRIVACY')]:legalState()); await p.load(); return p; }
test('login without explicit legal versions never invokes wx login or sends auth',async()=>{await assert.rejects(api.login(),e=>e.code==='CONSENT_REQUIRED');assert.equal(wxLoginCalls,0);assert.equal(requests.length,0);});
test('login starts unchecked and cannot proceed without reading both documents',async()=>{const p=await loadedLogin();assert.equal(p.data.agreed,false);p.agreement({detail:{value:['yes']}});await p.submit();assert.equal(p.data.agreed,false);assert.equal(wxLoginCalls,0);assert.equal(requests.filter(x=>x.method==='POST').length,0);});
test('failed or mismatched document navigation does not mark versions read',async()=>{const p=await loadedLogin();p.readPrivacy();assert.equal(p.data.privacyRead,false);navigationOptions.at(-1).events.legalDocumentLoaded({kind:'TERMS',version:1});navigationOptions.at(-1).events.legalDocumentLoaded({kind:'PRIVACY',version:2});assert.equal(p.data.privacyRead,false);await p.submit();assert.equal(wxLoginCalls,0);});
test('current document acknowledgments lead to exact versions in login request',async()=>{const p=await loadedLogin();readBoth(p);transport=o=>respond(o,o.url.endsWith('/legal/current')?current():auth);await p.submit();const posted=requests.find(o=>o.url.endsWith('/auth/wechat'));assert.deepEqual(posted.data,{code:'synthetic-once',...versions});assert.equal(p.data.success,true);assert.equal(store['wildboy-session'],auth.token);});
test('newly published version clears checkbox and prevents stale wx login',async()=>{const p=await loadedLogin();readBoth(p);transport=o=>respond(o,current(2));await p.submit();assert.equal(p.data.agreed,false);assert.equal(p.data.privacyRead,false);assert.equal(p.data.termsRead,false);assert.equal(wxLoginCalls,0);assert.equal(p.data.current.privacy.version,2);});
test('unpublished policies fail closed while browse remains available',async()=>{const p=page('login');transport=o=>respond(o,{ready:false,privacy:null,terms:null});await p.load();assert.equal(p.data.current,null);await p.submit();p.browse();assert.equal(wxLoginCalls,0);assert.equal(navigations.at(-1),'/pages/home/index');});
test('cancelled login page cannot install a late successful session',async()=>{const p=await loadedLogin();readBoth(p);let pending;transport=o=>o.url.endsWith('/legal/current')?respond(o,current()):pending=o;const work=p.submit();await tick();p.onHide();respond(pending,auth);await work;assert.equal(api.hasSession(),false);assert.equal(p.data.success,false);});
test('existing-user reconsent posts exact versions without wx login',async()=>{store['wildboy-session']='existing-user';const p=await loadedLogin();p.setData({mode:'consent'});readBoth(p);transport=o=>respond(o,o.url.endsWith('/legal/current')?current():{requiresConsent:false});await p.submit();assert.equal(wxLoginCalls,0);assert.deepEqual(requests.find(o=>o.url.endsWith('/me/consents')).data,versions);assert.equal(store['wildboy-session'],'existing-user');});
test('policy document failure never emits a read confirmation',async()=>{const p=page('privacy');const events=[];p.getOpenerEventChannel=()=>({emit:(...args)=>events.push(args)});p.setData({kind:'PRIVACY',version:1});transport=o=>respond(o,{code:'NOT_FOUND'},404);await p.load();assert.equal(events.length,0);assert.equal(p.data.document,null);});
test('policy document validates exact kind and version before read event',async()=>{const p=page('privacy');const events=[];p.getOpenerEventChannel=()=>({emit:(...args)=>events.push(args)});p.setData({kind:'PRIVACY',version:1});transport=o=>respond(o,document('PRIVACY',2));await p.load();assert.equal(events.length,0);transport=o=>respond(o,document('PRIVACY'));await p.load();assert.deepEqual(events,[['legalDocumentLoaded',{kind:'PRIVACY',version:1}]]);});
test('normal user cannot load legal management drafts',async()=>{store['wildboy-session']='user-token';const p=page('admin-legal');transport=o=>respond(o,{id:'u',role:'USER'});await p.load();assert.equal(p.data.authorized,false);assert.equal(requests.some(o=>o.url.includes('/admin/legal/')),false);});
test('saving legal draft does not issue publish or consent requests',async()=>{const p=await loadedAdmin();p.input({currentTarget:{dataset:{field:'content'}},detail:{value:'独立修改的纯文本测试内容，长度足够。'}});await p.save();assert.equal(requests.filter(o=>o.method==='PUT').length,1);assert.equal(requests.some(o=>o.url.endsWith('/publish')||o.url.endsWith('/consents')),false);});
test('cancelled legal publish confirmation makes no mutation',async()=>{const p=await loadedAdmin();modalAnswer={confirm:false,cancel:true};await p.publish();assert.equal(requests.filter(o=>o.method==='POST'||o.method==='PUT').length,0);});
test('draft conflict retains unsaved content and blocks blind republish',async()=>{const p=await loadedAdmin();p.input({currentTarget:{dataset:{field:'content'}},detail:{value:'需要保留的未保存测试正文，长度足够。'}});transport=o=>o.method==='PUT'?respond(o,{code:'STALE_VERSION',message:'Conflict'},409):respond(o,{id:'a',role:'ADMIN'});await p.save();assert.equal(p.data.conflict,true);assert.match(p.data.content,/需要保留/);await p.publish();assert.equal(requests.filter(o=>o.method==='POST').length,0);});
test('expired legal-management identity clears cached draft and history',async()=>{const p=await loadedAdmin();transport=o=>respond(o,{code:'UNAUTHENTICATED'},401);await p.load();assert.equal(p.data.authorized,false);assert.equal(p.data.content,'');assert.deepEqual(p.data.history,[]);});
test('legal pages render text without executable HTML bindings',()=>{const admin=fs.readFileSync(path.join(DIST,'pages/admin-legal/index.wxml'),'utf8');const privacy=fs.readFileSync(path.join(DIST,'pages/privacy/index.wxml'),'utf8');assert.doesNotMatch(admin+privacy,/<web-view|<rich-text[^>]*nodes=/);assert.match(privacy,/document\.content/);});
