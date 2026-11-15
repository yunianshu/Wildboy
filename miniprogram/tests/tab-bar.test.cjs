const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise current navigation source in memory; never rebuild or write dist.
let pages, calls, toasts, context, modules, componentDefinition, pageDefinition;
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const requireSource = request => {
    if (request.endsWith('/tab-bar')) return source('utils/tab-bar.ts');
    if (request.endsWith('/capsule-header')) return source('utils/capsule-header.ts');
    // Only onShow is exercised on real page definitions; business effects are replaced below.
    if (request.endsWith('/domain')) return { categories: [], RequestEpoch: class {} };
    if (request.endsWith('/page-motion')) return { enterPage() {} };
    if (request.endsWith('/home')) return { fallbackBanners: [] };
    if (request.endsWith('/config')) return { config: {} };
    return {};
  };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireSource, module, module.exports);
  return module.exports;
}

function bar() {
  source('custom-tab-bar/index.ts');
  const definition = componentDefinition;
  const component = { ...definition.methods, data: structuredClone(definition.data), setData(update) {
    Object.assign(this.data, update);
  } };
  component.attached = () => definition.lifetimes.attached.call(component);
  component.show = () => definition.pageLifetimes.show.call(component);
  return component;
}
function page(route, component = bar()) {
  return { route, getTabBar: () => component, component };
}
function activate(p) { pages = [p]; }
const event = path => ({ currentTarget: { dataset: { path } } });

beforeEach(() => {
  pages = []; calls = []; toasts = []; modules = new Map();
  context = vm.createContext({
    Component(value) { componentDefinition = value; },
    Page(value) { pageDefinition = value; },
    getCurrentPages: () => pages,
    wx: {
      switchTab(options) { calls.push(options); },
      showToast(options) { toasts.push(options); },
      getStorageSync() { return ''; },
    },
  });
});

test('the declared Tab destinations are exactly the three native Tab pages', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/app.json'), 'utf8'));
  assert.equal(config.tabBar.custom, true);
  assert.deepEqual(config.tabBar.list, [
    { pagePath: 'pages/home/index', text: '探索' },
    { pagePath: 'pages/activities/index', text: '活动' },
    { pagePath: 'pages/mine/index', text: '我的' },
  ]);
});

test('each independent component initializes and resynchronizes from the actual visible route', () => {
  const nav = source('utils/tab-bar.ts');
  const instances = nav.TAB_ITEMS.map(item => page(item.pagePath));
  for (const p of instances) {
    activate(p); p.component.attached();
    assert.equal(p.component.data.selected, p.route);
  }
  const home = instances[0]; activate(home); home.component.show();
  assert.equal(home.component.data.selected, home.route);
  assert.equal(calls.length, 0);
});

test('all three real page onShow hooks synchronize external navigation without wrapping their loads', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/app.json'), 'utf8'));
  for (const item of config.tabBar.list) {
    source(`${item.pagePath}.ts`);
    const actual = pageDefinition;
    const p = page(item.pagePath);
    let loads = 0, capabilities = 0;
    Object.assign(p, actual, { data: structuredClone(actual.data), setData(update) { Object.assign(this.data, update); },
      load() { loads++; }, loadCategories() {}, loadAdminCapability() { capabilities++; } });
    activate(p); actual.onShow.call(p);
    assert.equal(p.component.data.selected, p.route);
    assert.equal(loads, item.pagePath === 'pages/home/index' ? 0 : 1);
    assert.equal(capabilities, item.pagePath === 'pages/mine/index' ? 1 : 0);
  }
  assert.equal(calls.length, 0);
});

test('same Tab and invalid paths never navigate or optimistically change selection', () => {
  const p = page('pages/home/index'); activate(p); p.component.attached();
  for (const value of [p.route, '/pages/home/index', 'pages/detail/index', 'pages/article/index?x=1', null, {}, ''])
    p.component.selectTab(event(value));
  assert.equal(calls.length, 0);
  assert.equal(p.component.data.selected, p.route);
});

test('rapid and cross-instance taps share one switch; visible-route arrival accepts a new switch', () => {
  const nav = source('utils/tab-bar.ts');
  const home = page('pages/home/index'), activities = page('pages/activities/index');
  activate(home); home.component.attached();
  home.component.selectTab(event(activities.route));
  home.component.selectTab(event('pages/mine/index'));
  activities.component.selectTab(event('pages/mine/index'));
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/pages/activities/index');
  assert.equal(home.component.data.selected, home.route);
  activate(activities); nav.syncTabBar(activities);
  assert.equal(activities.component.data.selected, activities.route);
  activities.component.selectTab(event('pages/mine/index'));
  assert.equal(calls.length, 2);
});

test('failed navigation keeps actual selection and releases the guard for immediate retry', () => {
  const p = page('pages/home/index'); activate(p); p.component.attached();
  p.component.selectTab(event('pages/activities/index')); calls[0].fail({ errMsg: 'switchTab:fail' });
  assert.equal(p.component.data.selected, p.route); assert.equal(toasts.length, 1);
  p.component.selectTab(event('pages/activities/index'));
  assert.equal(calls.length, 2);
});

test('native reentry during switchTab cannot start a second route operation', () => {
  const nav = source('utils/tab-bar.ts');
  const p = page('pages/home/index'); activate(p);
  context.wx.switchTab = options => {
    calls.push(options);
    nav.switchTab('pages/mine/index');
  };
  p.component.selectTab(event('pages/activities/index'));
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/pages/activities/index');
});

test('synchronous native failure also releases navigation without throwing into the page', () => {
  const p = page('pages/home/index'); activate(p);
  context.wx.switchTab = () => { throw new Error('native unavailable'); };
  assert.doesNotThrow(() => p.component.selectTab(event('pages/activities/index')));
  context.wx.switchTab = options => calls.push(options);
  p.component.selectTab(event('pages/activities/index'));
  assert.equal(calls.length, 1); assert.equal(toasts.length, 1);
});

test('late callbacks cannot clear a newer switch, overwrite its route or show a stale error', () => {
  const nav = source('utils/tab-bar.ts');
  const home = page('pages/home/index'), activities = page('pages/activities/index'), mine = page('pages/mine/index');
  activate(home); home.component.selectTab(event(activities.route)); const first = calls[0];
  activate(activities); nav.syncTabBar(activities);
  activities.component.selectTab(event(mine.route)); const second = calls[1];
  first.fail({ errMsg: 'late failure' }); first.success({ errMsg: 'late success' });
  activities.component.selectTab(event('pages/home/index'));
  assert.equal(calls.length, 2); assert.equal(activities.component.data.selected, activities.route); assert.equal(toasts.length, 0);
  activate(mine); nav.syncTabBar(mine); second.success({ errMsg: 'switchTab:ok' });
  assert.equal(mine.component.data.selected, mine.route);
});

test('an external route change before a failed callback restores only the now-visible component', () => {
  const home = page('pages/home/index'), mine = page('pages/mine/index');
  activate(home); home.component.attached(); home.component.selectTab(event('pages/activities/index'));
  activate(mine); calls[0].fail({ errMsg: 'stale route failure' });
  assert.equal(mine.component.data.selected, mine.route);
  assert.equal(home.component.data.selected, home.route);
  assert.equal(toasts.length, 0);
});

test('component attachment recovers selection before getTabBar is available; non-Tab routes stay untouched', () => {
  const nav = source('utils/tab-bar.ts');
  const component = bar(); activate({ route: 'pages/activities/index' }); component.attached();
  assert.equal(component.data.selected, 'pages/activities/index');
  activate({ route: 'pages/detail/index' });
  assert.equal(nav.syncTabBar(), '');
  component.selectTab(event('pages/mine/index'));
  assert.equal(calls.length, 0);
});
