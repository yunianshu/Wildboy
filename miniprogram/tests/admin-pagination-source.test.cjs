const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const api = require('../dist/utils/api.js');
const shared = require('../dist/pages/admin-editor/shared.js');

const activity = { id: 'activity-one', title: 'QA route', category: 'WEEKLY', coverUrl: '/assets/category-weekly.jpg',
  startAt: '2099-11-06T09:00:00+08:00', location: 'QA location', capacity: 20, registeredCount: 2, status: 'PUBLISHED', version: 3 };
let listReads, failPage, hasMore, total;

// Run current page source without changing dist while native verification is using it.
function page(name) {
  let definition;
  global.Page = value => { definition = value; };
  const filename = path.resolve(__dirname, `../dist/pages/${name}/index.js`);
  const source = fs.readFileSync(path.resolve(__dirname, `../src/pages/${name}/index.ts`), 'utf8');
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); } };
}

function item(name, index, status) {
  if (name === 'admin-activities') return { ...activity, id: `activity-${index}`, status: status || 'PUBLISHED' };
  return { id: `registration-${index}`, status: status || 'CONFIRMED', createdAt: '2026-10-31T00:00:00Z',
    participants: [{ id: `participant-${index}`, participantName: 'QA participant', phone: '13800000000', idNumber: '******************' }] };
}

function respond(name) {
  api.request = async url => {
    if (name === 'admin-roster' && !url.includes('/registrations?')) return { ...activity };
    const query = new URL(`http://qa.invalid${url}`).searchParams;
    const number = Number(query.get('page'));
    listReads.push({ page: number, status: query.get('status') || '' });
    if (number === failPage) throw new Error('QA list network unavailable');
    return { items: [item(name, number, query.get('status'))], page: number, size: 20, total, hasMore };
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  listReads = []; failPage = -1; hasMore = true; total = 41;
  shared.requireAdmin = async () => 1;
  api.isSessionCurrent = value => value === 1;
  global.wx = { showToast() {}, pageScrollTo() {}, showModal: async () => ({ confirm: true }) };
});

for (const name of ['admin-activities', 'admin-roster']) {
  test(`${name} retries failed filtered page zero before it can load any later page`, async () => {
    const p = page(name);
    if (name === 'admin-roster') p.onLoad({ id: activity.id });
    respond(name); await p.load(true);
    assert.equal(p.data.hasMore, true); assert.equal(p.data.items.length, 1);
    const filter = name === 'admin-activities' ? 'DRAFT' : 'CANCELLED';
    listReads = []; failPage = 0;
    p.filter({ currentTarget: { dataset: { status: filter } } }); await settle();
    assert.equal(p.data.items.length, 0); assert.equal(p.data.hasMore, false); assert.equal(p.data.page, 0);
    if (name === 'admin-roster') assert.equal(p.data.total, 0);
    assert.match(p.data.error, /network unavailable/);
    p.onReachBottom(); await settle(); await p.load(false);
    assert.deepEqual(listReads, [{ page: 0, status: filter }]);
    failPage = -1;
    p.retry(); await settle();
    assert.deepEqual(listReads, [{ page: 0, status: filter }, { page: 0, status: filter }]);
    assert.equal(p.data.items.length, 1); assert.equal(p.data.hasMore, true); assert.equal(p.data.error, '');
  });

  test(`${name} retains its old rows after a later-page failure and can retry that same page`, async () => {
    const p = page(name);
    if (name === 'admin-roster') p.onLoad({ id: activity.id });
    respond(name); await p.load(true);
    const firstId = p.data.items[0].id;
    listReads = []; failPage = 1;
    await p.load(false);
    assert.equal(p.data.items.length, 1); assert.equal(p.data.items[0].id, firstId);
    assert.equal(p.data.page, 0); assert.equal(p.data.hasMore, true); assert.equal(p.data.loadingMore, false);
    failPage = -1; hasMore = false; total = 2;
    p.onReachBottom(); await settle();
    assert.deepEqual(listReads.map(value => value.page), [1, 1]);
    assert.deepEqual(p.data.items.map(value => value.id), [firstId, item(name, 1).id]);
    assert.equal(p.data.page, 1); assert.equal(p.data.hasMore, false); assert.equal(p.data.error, '');
  });
}
