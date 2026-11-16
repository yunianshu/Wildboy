const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let context, modules, pageDefinition, info, menu, reads;
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const requireSource = request => {
    if (request.endsWith('/capsule-header')) return source('utils/capsule-header.ts');
    if (request.endsWith('/domain')) return { categories: [], RequestEpoch: class {} };
    return {};
  };
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireSource, module, module.exports);
  return module.exports;
}
const normalized = value => JSON.parse(JSON.stringify(value));
const center = layout => layout.top + layout.height / 2;
function rect(left, top, width = 87, height = 32) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

beforeEach(() => {
  info = { windowWidth: 390, windowHeight: 762, statusBarHeight: 47 };
  menu = rect(296, 51); reads = { window: 0, menu: 0 }; modules = new Map();
  context = vm.createContext({
    Page(value) { pageDefinition = value; },
    wx: {
      getWindowInfo() { reads.window++; return info; },
      getMenuButtonBoundingClientRect() { reads.menu++; return menu; },
    },
  });
});

test('portrait, Android and landscape titles share the real capsule center and preserve its gap', () => {
  const { capsuleHeaderLayout } = source('utils/capsule-header.ts');
  for (const [windowInfo, capsule] of [
    [info, menu],
    [{ windowWidth: 360, windowHeight: 720, statusBarHeight: 24 }, rect(266, 30)],
    [{ windowWidth: 844, windowHeight: 390, statusBarHeight: 0 }, rect(750, 8)],
    [{ windowWidth: 393, windowHeight: 800, statusBarHeight: 50 }, rect(296.5, 53.5, 89, 31.5)],
  ]) {
    const result = capsuleHeaderLayout(windowInfo, capsule);
    assert.equal(center(result), capsule.top + capsule.height / 2);
    const titleRight = windowInfo.windowWidth - 16 - result.rightInset;
    assert.equal(titleRight, capsule.left - 12);
    assert.ok(result.top >= windowInfo.statusBarHeight);
  }
});

test('missing capsule falls back relative to the real status bar rather than a phone-specific top', () => {
  const { capsuleHeaderLayout } = source('utils/capsule-header.ts');
  for (const statusBarHeight of [0, 20, 47, 59]) {
    const result = capsuleHeaderLayout({ ...info, statusBarHeight });
    assert.equal(center(result), statusBarHeight + 44 / 2);
    assert.ok(result.rightInset > 0);
  }
});

test('zero, malformed, off-window and non-navigation rectangles fall back as one unit', () => {
  const { capsuleHeaderLayout } = source('utils/capsule-header.ts');
  const fallback = normalized(capsuleHeaderLayout(info));
  for (const invalid of [null, {}, rect(0, 0, 0, 0),
    { ...menu, height: NaN }, { ...menu, left: Infinity }, { ...menu, right: 500 },
    { ...menu, bottom: menu.bottom + 10 }, rect(-1, 51), rect(296, 20),
    rect(296, 500), rect(296, 51, 87, 100)]) {
    assert.deepEqual(normalized(capsuleHeaderLayout(info, invalid)), fallback);
  }
});

test('bad or absent window measurements always yield finite nonnegative layout values', () => {
  const { capsuleHeaderLayout } = source('utils/capsule-header.ts');
  for (const windowInfo of [null, {}, { windowWidth: NaN, windowHeight: Infinity, statusBarHeight: -1 },
    { windowWidth: -390, windowHeight: 0, statusBarHeight: 500 },
    { windowWidth: 120, windowHeight: 200, statusBarHeight: 0 },
    { windowWidth: 1, windowHeight: 200, statusBarHeight: 0 }]) {
    for (const value of Object.values(capsuleHeaderLayout(windowInfo))) {
      assert.ok(Number.isFinite(value)); assert.ok(value >= 0);
    }
  }
});

test('native measurements refresh after resize and one failing API preserves the other fallback input', () => {
  const { measureCapsuleHeader } = source('utils/capsule-header.ts');
  assert.equal(center(measureCapsuleHeader()), 67);
  info = { windowWidth: 844, windowHeight: 390, statusBarHeight: 0 }; menu = rect(750, 8);
  assert.equal(center(measureCapsuleHeader()), 24);
  assert.deepEqual(reads, { window: 2, menu: 2 });
  context.wx.getMenuButtonBoundingClientRect = () => { throw new Error('capsule unavailable'); };
  assert.equal(center(measureCapsuleHeader()), 22);
  context.wx.getWindowInfo = () => { throw new Error('window unavailable'); };
  assert.doesNotThrow(measureCapsuleHeader);
});

test('all three real load/resize hooks update only header geometry without business calls', () => {
  for (const name of ['activities', 'shop', 'mine']) {
    source(`pages/${name}/index.ts`);
    const definition = pageDefinition;
    const p = { data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update); },
      load() { throw new Error('geometry must not load business data'); },
      loadAdminCapability() { throw new Error('geometry must not load login state'); } };
    definition.onLoad.call(p);
    assert.equal(center(p.data.headerLayout), menu.top + menu.height / 2);
    menu = rect(menu.left, menu.top + 1);
    definition.onResize.call(p);
    assert.equal(center(p.data.headerLayout), menu.top + menu.height / 2);
  }
  assert.deepEqual(reads, { window: 6, menu: 6 });
});
