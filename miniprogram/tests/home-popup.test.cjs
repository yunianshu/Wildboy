const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let definition, measurements, viewport;
global.Page = (value) => { definition = value; };
function page() {
  const file = require.resolve('../dist/pages/home/index.js');
  delete require.cache[file]; require(file);
  const p = { ...definition, data: structuredClone(definition.data), setData(update, done) { Object.assign(this.data, update); done?.(); } };
  for (const key of Object.keys(p)) if (typeof p[key] === 'function') p[key] = p[key].bind(p);
  p.data.shortcutLoading = false;
  return p;
}
beforeEach(() => {
  measurements = []; viewport = 800;
  global.wx = {
    getWindowInfo: () => ({windowHeight: viewport}),
    createSelectorQuery() {
      return { in() { return this; }, select() { return this; }, boundingClientRect() { return this; }, exec(callback) { measurements.push(callback); } };
    },
  };
});
function open(p, title = '', text = '', image = '/assets/qr.png') {
  p.data.categories[2] = {...p.data.categories[2], popupTitle:title, popupText:text, popupImageUrl:image};
  return p.openCategory({currentTarget:{dataset:{slot:3}}});
}
function measure(height, heading = 44) { assert.ok(measurements.length); measurements.shift()([{height},{height:heading}]); }
test('image-only popup omits whitespace title and text instead of falling back to shortcut name', async () => {
  const p=page(); await open(p, ' \n ', '\t \n');
  assert.equal(p.data.popup.title,''); assert.equal(p.data.popup.text,''); assert.equal(p.data.popup.image,'/assets/qr.png');
  measure(280); assert.equal(p.data.popupBodyHeight,280);
});
test('configured text keeps internal line breaks and only trims surrounding whitespace', async () => {
  const p=page(); await open(p,' 标题 ',' 第一句\n第二句 ','');
  assert.equal(p.data.popup.title,'标题'); assert.equal(p.data.popup.text,'第一句\n第二句');
  measure(52); assert.equal(p.data.popupBodyHeight,52);
});
test('short content hugs its height and long content gets a bounded scroll viewport', async () => {
  const p=page(); await open(p); measure(1200); assert.equal(p.data.popupBodyHeight,552);
  viewport=400; p.onResize(); measure(1200); assert.equal(p.data.popupBodyHeight,232);
  p.resizePopup(); measure(60); assert.equal(p.data.popupBodyHeight,60);
});
test('closed or superseded popup ignores stale image and measurement callbacks', async () => {
  const p=page(); await open(p); const old=measurements.shift(); const generation=p.data.popupGeneration;
  p.closePopup(); old([{height:500},{height:44}]); assert.equal(p.data.popupBodyHeight,0);
  await open(p); old([{height:500},{height:44}]); assert.equal(p.data.popupBodyHeight,0);
  const count=measurements.length; p.resizePopup({currentTarget:{dataset:{generation}}}); assert.equal(measurements.length,count);
  measure(240); assert.equal(p.data.popupBodyHeight,240);
});
test('image failure remeasures compact feedback without retaining image height', async () => {
  const p=page(); await open(p); measure(300);
  p.popupImageFailed({currentTarget:{dataset:{generation:p.data.popupGeneration}}});
  assert.equal(p.data.popupImageError,true); measure(24); assert.equal(p.data.popupBodyHeight,24);
});
test('popup template has only a top-right accessible close control and optional copy', () => {
  const wxml=fs.readFileSync('src/pages/home/index.wxml','utf8').split('<view wx:if="{{popup}}"')[1];
  assert.match(wxml,/wx:if="\{\{popup\.title\}\}"/); assert.match(wxml,/wx:if="\{\{popup\.text\}\}"/);
  assert.equal((wxml.match(/<button\b/g)||[]).length,1);
  assert.match(wxml,/class="shortcut-close"[^>]*bindtap="closePopup"[^>]*aria-label="关闭弹窗"/);
  assert.ok(wxml.indexOf('shortcut-close')<wxml.indexOf('shortcut-body'));
  assert.match(wxml,/mode="widthFix" show-menu-by-longpress/); assert.match(wxml,/bindload="resizePopup"/);
  assert.match(wxml,/popupBodyHeight/); assert.doesNotMatch(wxml,/>关闭<\/button>/);
  const css=fs.readFileSync('src/pages/home/index.wxss','utf8');
  assert.doesNotMatch(css,/height:\s*55vh/); assert.match(css,/button\.shortcut-close\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
});
test('newer measurement wins within the same popup generation', async () => {
  const p=page(); await open(p); const old=measurements.shift();
  p.popupImageFailed({currentTarget:{dataset:{generation:p.data.popupGeneration}}});
  measure(24); old([{height:400},{height:44}]); assert.equal(p.data.popupBodyHeight,24);
});
test('unload invalidates pending measurement even without an earlier hide', async () => {
  const p=page(); await open(p); const pending=measurements.shift();
  p.onUnload(); pending([{height:400},{height:44}]); assert.equal(p.data.popupBodyHeight,0);
  p.resizePopup(); p.popupImageFailed({currentTarget:{dataset:{generation:p.data.popupGeneration}}});
  assert.equal(measurements.length,0); assert.equal(p.data.popupImageError,false);
});
