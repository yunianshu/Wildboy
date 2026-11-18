const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '../src/pages/detail/index');
const markup = fs.readFileSync(base + '.wxml', 'utf8');
const css = fs.readFileSync(base + '.wxss', 'utf8');

test('detail share is one accessible icon-only native button inside cover, not article heading', () => {
  const button = markup.match(/<button\b[^>]*open-type="share"[^>]*>([\s\S]*?)<\/button>/g);
  assert.equal(button.length, 1);
  assert.match(button[0], /aria-label="分享活动"/);
  assert.equal(button[0].replace(/<[^>]+>/g, '').trim(), '');
  assert.match(button[0], /share\.svg/);
  assert.match(markup, /<view class="article-cover-wrap">\s*<image[^>]+article-cover[^>]+\/>\s*<button[^>]+open-type="share"/);
  assert.doesNotMatch(markup.match(/<view class="article-head">([\s\S]*?)<\/view>\s*<view class="article-intro">/)[1], /open-type="share"|分享活动/);
});

test('share overlays cover with 44px target below retained native navigation', () => {
  const config = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/app.json'), 'utf8'));
  assert.notEqual(config.navigationStyle, 'custom');
  assert.notEqual(app.window.navigationStyle, 'custom');
  assert.match(css, /\.article-cover-wrap\s*{[^}]*position:\s*relative/);
  const rule = css.match(/\.share\s*{([^}]+)}/)[1];
  for (const declaration of ['position: absolute', 'top: 12px', 'right: 16px', 'width: 44px', 'height: 44px', 'margin: 0', 'padding: 0', 'background: var(--rf-surface)']) assert.ok(rule.includes(declaration), declaration);
  assert.doesNotMatch(rule, /position:\s*fixed|top:\s*-/);
});

function definition() {
  let page;
  const code = ts.transpileModule(fs.readFileSync(base + '.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports: {}, Page: value => { page = value; }, require(name) {
    if (name.endsWith('/domain')) return { RequestEpoch: class {} };
    return {};
  } });
  return page;
}

test('native share preserves activity title, cover and deep link on repeated invocation', () => {
  const page = definition();
  const context = { data: { id: 'activity-123', activity: { title: '山野徒步', coverUrl: '/cover.jpg' } } };
  for (let n = 0; n < 2; n++) {
    const result = page.onShareAppMessage.call(context);
    assert.equal(result.title, '山野徒步');
    assert.equal(result.path, '/pages/detail/index?id=activity-123');
    assert.equal(result.imageUrl, '/cover.jpg');
  }
  assert.equal(context.data.id, 'activity-123');
});

test('native menu share keeps its safe unloaded-page fallback', () => {
  const page = definition();
  const result = page.onShareAppMessage.call({ data: { id: '', activity: null } });
  assert.equal(result.title, 'Wildboy · 一起去山野');
  assert.equal(result.imageUrl, undefined);
  assert.equal(result.path, '/pages/detail/index?id=');
});
