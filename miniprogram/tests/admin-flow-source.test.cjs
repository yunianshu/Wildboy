const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const api = require('../dist/utils/api.js');
const shared = require('../dist/pages/admin-editor/shared.js');
let session, calls, alerts, modalAnswer;
const document = { kind: 'PRIVACY', title: '已发布隐私政策', content: '已经审核并发布的历史协议正文。', version: 2, publishedAt: '2026-10-31T00:00:00Z' };
const state = { kind: 'PRIVACY', draft: { title: '服务器草稿', content: '服务器上的协议草稿正文。', revision: 4 }, published: document };

// Compile only these owned page modules in memory: targeted checks never rebuild or change dist.
function page(name) {
  let definition;
  global.Page = value => { definition = value; };
  const filename = path.resolve(__dirname, `../dist/pages/${name}/index.js`);
  const source = fs.readFileSync(path.resolve(__dirname, `../src/pages/${name}/index.ts`), 'utf8');
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  const p = { ...definition, _visible: true, data: structuredClone(definition.data), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      const keys = key.split('.'); let target = this.data;
      for (const part of keys.slice(0, -1)) target = target[part];
      target[keys.at(-1)] = value;
    }
  } };
  for (const key in p) if (typeof p[key] === 'function') p[key] = p[key].bind(p);
  return p;
}
const event = dataset => ({ currentTarget: { dataset } });
function type(p, field, value) { p.input({ ...event({ field }), detail: { value } }); }

beforeEach(() => {
  session = 1; calls = []; alerts = []; modalAnswer = false;
  api.isSessionCurrent = value => value === session;
  api.sessionVersion = () => session;
  api.mediaUrl = value => value ? `resolved:${value}` : '';
  shared.requireAdmin = async () => session;
  api.request = async (url, method = 'GET', data) => {
    calls.push({ url, method, data });
    if (url.endsWith('/versions')) return [structuredClone(document)];
    if (url.includes('/admin/legal/')) return structuredClone(state);
    return { blocks: [], version: 3 };
  };
  global.wx = {
    canIUse: () => true,
    enableAlertBeforeUnload: () => alerts.push(true),
    disableAlertBeforeUnload: () => alerts.push(false),
    showModal: async () => ({ confirm: modalAnswer }),
    showToast() {},
  };
});

test('legal history and preview round trip preserve unsaved title, body, revision and leave protection', async () => {
  const p = page('admin-legal'); await p.load();
  type(p, 'title', '本地还未保存的标题'); type(p, 'content', '本地还未保存而且必须保留的协议正文。');
  const reads = calls.length;
  p.togglePreview(); p.showHistory();
  assert.equal(p.data.historyMode, true);
  p.viewHistory(event({ version: 2 })); assert.equal(p.data.selected.content, document.content);
  p.closeHistory(); p.returnToDraft();
  assert.equal(p.data.historyMode, false); assert.equal(p.data.selected, null);
  assert.equal(p.data.title, '本地还未保存的标题');
  assert.equal(p.data.content, '本地还未保存而且必须保留的协议正文。');
  assert.equal(p.data.revision, 4); assert.equal(p.data.dirty, true);
  assert.equal(alerts.at(-1), true); assert.equal(calls.length, reads);
});

test('legal publishing still requires explicit confirmation and current saved revision', async () => {
  const p = page('admin-legal'); await p.load();
  await p.publish(); assert.equal(calls.some(c => c.method === 'POST'), false);
  modalAnswer = true; await p.publish();
  assert.deepEqual(calls.find(c => c.method === 'POST'), { url: '/admin/legal/PRIVACY/publish', method: 'POST', data: { revision: 4 } });
  type(p, 'title', '尚未保存');
  const count = calls.filter(c => c.method === 'POST').length;
  await p.publish(); assert.equal(calls.filter(c => c.method === 'POST').length, count);
});

test('legal protocol switch cancellation keeps the current unsaved draft', async () => {
  const p = page('admin-legal'); await p.load(); type(p, 'title', '保留此标题');
  await p.switchKind(event({ kind: 'TERMS' }));
  assert.equal(p.data.kind, 'PRIVACY'); assert.equal(p.data.title, '保留此标题'); assert.equal(p.data.dirty, true);
});

test('content supports editing all block types, reordering and deleting without losing data', async () => {
  const p = page('admin-content'); p.onLoad({ id: 'activity-one' }); await p.load();
  p.setData({ blocks: [{ type: 'text', text: '原文' }, { type: 'image', url: '/assets/photo.jpg', caption: '原说明' }, { type: 'table', rows: [['列一', '列二']] }] });
  p.edit(event({ index: 0 })); type(p, 'draftText', '修改的文字'); p.confirmEdit();
  p.edit(event({ index: 1 })); type(p, 'draftCaption', '修改的图片说明'); p.confirmEdit();
  p.edit(event({ index: 2 })); type(p, 'draftText', '距离|时间\n5公里|2小时'); p.confirmEdit();
  assert.deepEqual(p.data.blocks, [{ type: 'text', text: '修改的文字' }, { type: 'image', url: '/assets/photo.jpg', caption: '修改的图片说明' }, { type: 'table', rows: [['距离', '时间'], ['5公里', '2小时']] }]);
  p.move(event({ index: 2, delta: -1 })); assert.equal(p.data.blocks[1].type, 'table');
  p.remove(event({ index: 0 })); assert.deepEqual(p.data.blocks.map(b => b.type), ['table', 'image']);
  assert.equal(p.data.dirty, true); assert.equal(alerts.at(-1), true);
});

test('first and last content moves are disabled in native markup and guarded in the handler', async () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../src/pages/admin-content/index.wxml'), 'utf8');
  const buttons = [...markup.matchAll(/<button\b([^>]*bindtap="move"[^>]*)>/g)];
  const disabled = delta => buttons.find(b => b[1].includes(`data-delta="${delta}"`))[1].match(/disabled="{{(.*?)}}"/)[1];
  for (const [index, expectedUp, expectedDown] of [[0, true, false], [1, false, false], [2, false, true]]) {
    const evaluate = expression => Boolean(Function('busy', 'index', 'blocks', `return (${expression});`)(false, index, [1, 2, 3]));
    assert.equal(evaluate(disabled(-1)), expectedUp); assert.equal(evaluate(disabled(1)), expectedDown);
  }
  const p = page('admin-content'); p.onLoad({ id: 'activity-one' }); await p.load();
  p.setData({ blocks: [{ type: 'text', text: 'first' }, { type: 'text', text: 'last' }] });
  for (const data of [{ index: 0, delta: -1 }, { index: 1, delta: 1 }, { index: -1, delta: 1 }, { index: 'bad', delta: 1 }]) p.move(event(data));
  assert.deepEqual(p.data.blocks.map(b => b.text), ['first', 'last']); assert.equal(p.data.dirty, false);
  p.edit(event({ index: 0 })); p.move(event({ index: 1, delta: -1 }));
  assert.deepEqual(p.data.blocks.map(b => b.text), ['first', 'last']);
});

test('unconfirmed content cannot be saved as a document and keeps its leave warning', async () => {
  const p = page('admin-content'); p.onLoad({ id: 'activity-one' }); await p.load();
  p.add(event({ type: 'text' })); type(p, 'draftText', '尚未确认的文字');
  await p.save(); assert.equal(calls.some(c => c.method === 'PUT'), false);
  assert.equal(p.data.draftText, '尚未确认的文字'); assert.equal(alerts.at(-1), true);
});

test('content conflict blocks repeated saves and cancelled reload keeps all local blocks and input',async()=>{
  const p=page('admin-content');p.onLoad({id:'activity-one'});await p.load();
  p.setData({blocks:[{type:'text',text:'保留的本地文字'}],dirty:true});
  let puts=0,gets=0;api.request=async(_url,method)=>{if(method==='PUT'){puts++;throw new api.ApiError('图文已更新',409,'CONTENT_CONFLICT');}gets++;return{blocks:[],version:9};};
  await p.save();assert.equal(p.data.conflict,true);assert.equal(p.data.version,3);
  await p.save();assert.equal(puts,1);
  p.add(event({type:'text'}));type(p,'draftText','未确认输入');
  await p.reload();assert.equal(gets,0);assert.equal(p.data.draftText,'未确认输入');
  assert.deepEqual(p.data.blocks,[{type:'text',text:'保留的本地文字'}]);assert.equal(p.data.dirty,true);
});
test('confirmed content reload replaces local blocks and saves with the newly fetched version',async()=>{
  const p=page('admin-content');p.onLoad({id:'activity-one'});await p.load();
  p.setData({blocks:[{type:'text',text:'旧本地文字'}],dirty:true,conflict:true});
  p.add(event({type:'text'}));type(p,'draftText','旧未确认输入');modalAnswer=true;
  const writes=[];api.request=async(_url,method='GET',body)=>method==='GET'?{blocks:[{type:'text',text:'最新服务器文字'}],version:9}:(writes.push(body),{...body,version:10});
  await p.reload();assert.equal(p.data.version,9);assert.equal(p.data.dirty,false);assert.equal(p.data.conflict,false);assert.equal(p.data.editing,-1);assert.equal(p.data.draftText,'');
  await p.save();assert.equal(writes[0].version,9);assert.equal(p.data.version,10);
});
test('failed forced content reload preserves the local draft and can be retried',async()=>{
  const p=page('admin-content');p.onLoad({id:'activity-one'});await p.load();
  p.setData({blocks:[{type:'text',text:'本地仍需保留'}],dirty:true,conflict:true});modalAnswer=true;
  api.request=async()=>{throw new api.ApiError('offline',503,'UNAVAILABLE');};
  await p.reload();assert.equal(p.data.version,3);assert.equal(p.data.conflict,true);assert.equal(p.data.authorized,true);assert.equal(p.data.dirty,true);assert.equal(p.data.busy,false);
  assert.equal(p.data.blocks[0].text,'本地仍需保留');
  api.request=async()=>({blocks:[{type:'text',text:'重试后的服务器文字'}],version:11});await p.reload();
  assert.equal(p.data.version,11);assert.equal(p.data.conflict,false);
});
test('a forced content reload cannot restore authority after the page is hidden',async()=>{
  const p=page('admin-content');p.onLoad({id:'activity-one'});await p.load();
  p.setData({blocks:[{type:'text',text:'本地文字'}],dirty:true,conflict:true});modalAnswer=true;
  let finish;api.request=()=>new Promise(resolve=>finish=resolve);
  const pending=p.reload();await new Promise(resolve=>setImmediate(resolve));p.onHide();
  finish({blocks:[{type:'text',text:'迟到内容'}],version:99});await pending;
  assert.equal(p.data.authorized,false);assert.equal(p.data.version,3);assert.equal(p.data.blocks[0].text,'本地文字');assert.equal(p.data.busy,false);
});
test('a hidden legal save cannot disable the new page leave warning or reauthorize the old page',async()=>{
  const p=page('admin-legal');await p.load();type(p,'title','本地新标题');
  let finish;api.request=(_url,method)=>method==='PUT'?new Promise(resolve=>finish=resolve):structuredClone(state);
  const pending=p.save();await new Promise(resolve=>setImmediate(resolve));p.onHide();
  alerts=[];wx.enableAlertBeforeUnload();finish({});await pending;
  assert.deepEqual(alerts,[true]);assert.equal(p.data.authorized,false);assert.equal(p.data.dirty,true);
});
test('returning to legal editing restores this page dirty protection without losing input',async()=>{
  const p=page('admin-legal');await p.load();type(p,'title','返回后保留的标题');p.onHide();
  alerts=[];wx.disableAlertBeforeUnload();p._visible=true;await p.load(false);
  assert.equal(p.data.title,'返回后保留的标题');assert.equal(p.data.dirty,true);assert.equal(alerts.at(-1),true);
});
test('confirmed content reload locks edits until the new server revision arrives',async()=>{
  const p=page('admin-content');p.onLoad({id:'activity-one'});await p.load();
  p.setData({blocks:[{type:'text',text:'确认前的文字'}],dirty:true,conflict:true});modalAnswer=true;
  let finish;api.request=()=>new Promise(resolve=>finish=resolve);
  const pending=p.reload();await new Promise(resolve=>setImmediate(resolve));
  p.remove(event({index:0}));p.add(event({type:'text'}));
  assert.equal(p.data.busy,true);assert.equal(p.data.blocks[0].text,'确认前的文字');assert.equal(p.data.editing,-1);
  finish({blocks:[{type:'text',text:'确认采用的新版本'}],version:12});await pending;
  assert.equal(p.data.busy,false);assert.equal(p.data.version,12);
});
