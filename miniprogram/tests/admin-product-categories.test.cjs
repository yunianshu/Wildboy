const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const api = require('../dist/utils/api.js');
const auth = require('../dist/pages/admin-editor/shared.js');
const { emptyProduct, productInput, productForm, categoryInput } = require('../dist/utils/admin-shop.js');
const fallback = { id: 'uncategorized', name: '未分类', sortOrder: 9999, version: 0, productCount: 1 };
const gear = { id: 'gear', name: '徒步装备', sortOrder: 10, version: 2, productCount: 1 };
const product = { id: 'product-one', name: '徒步背包', description: '轻量装备', imageUrl: '/assets/equipment.jpg', priceCents: 1299, originalPriceCents: 1599, categoryId: 'uncategorized', categoryName: '未分类', stock: 8, status: 'OFF_SHELF', version: 3 };
let session, role, calls, alerts, toasts, categories, transport, modal;
const event = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function page() {
  let definition; global.Page = value => { definition = value; };
  const file = path.resolve(__dirname, '../dist/pages/admin-product/index.js'); delete require.cache[file]; require(file);
  const p = { ...definition, data: structuredClone(definition.data), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
  } };
  return p;
}
async function loaded(id = 'product-one') { const p = page(); p.onLoad(id ? { id } : {}); await p.load(); await tick(); return p; }
async function start(p, edit = false) { await p.toggleCategoryManager(); await (edit ? p.editCategory() : p.newCategory()); }
const writes = () => calls.filter(call => call.method === 'POST' || call.method === 'PUT');
beforeEach(() => {
  session = 1; role = 'ADMIN'; calls = []; alerts = []; toasts = []; categories = [gear, fallback];
  modal = async () => ({ confirm: true });
  api.isSessionCurrent = value => value === session; api.sessionVersion = () => session;
  api.mediaUrl = value => value;
  auth.requireAdmin = async () => { if (role !== 'ADMIN') throw new api.ApiError('权限已失效', 403, 'FORBIDDEN'); return session; };
  transport = async (url, method, body) => {
    if (url === '/admin/shop/categories' && method === 'GET') return structuredClone(categories);
    if (url === '/admin/shop/products' && method === 'GET') return [structuredClone(product)];
    if (url.startsWith('/admin/shop/categories')) {
      const saved = { ...body, id: method === 'POST' ? 'new-gear' : url.split('/').at(-1), version: method === 'POST' ? 0 : body.version + 1, productCount: 0 };
      categories = [...categories.filter(item => item.id !== saved.id), saved]; return saved;
    }
    return { ...product, ...body, version: 4 };
  };
  api.request = async (url, method = 'GET', body) => { calls.push({ url, method, body }); return transport(url, method, body); };
  global.wx = { showModal: options => modal(options), showToast: options => toasts.push(options),
    enableAlertBeforeUnload: () => alerts.push(true), disableAlertBeforeUnload: () => alerts.push(false),
    navigateBack() {}, navigateTo() {}, pageScrollTo() {}, hideKeyboard() {} };
});

test('product DTO carries exact two-price cents and category while legacy display defaults original to current', () => {
  const legacy = productForm({ ...product, categoryId: undefined, originalPriceCents: undefined });
  assert.equal(legacy.categoryId, 'uncategorized'); assert.equal(legacy.originalPrice, '12.99');
  const form = { ...emptyProduct(), name: '装备', description: '说明', price: '0.29', originalPrice: '1.99', stock: '4', categoryId: 'gear' };
  assert.deepEqual(productInput(form, 3), { name: '装备', description: '说明', imageUrl: '/assets/equipment.jpg', categoryId: 'gear', priceCents: 29, originalPriceCents: 199, stock: 4, status: 'OFF_SHELF', version: 3 });
  for (const change of [{ originalPrice: '0.28' }, { originalPrice: '1.001' }, { originalPrice: '1000001' }, { categoryId: '' }, { categoryId: '../bad' }]) assert.throws(() => productInput({ ...form, ...change }));
  assert.equal(productInput({ ...form, originalPrice: '' }).originalPriceCents, 29);
  assert.deepEqual(categoryInput({ name: ' 装备 ', sortOrder: '0' }, 2), { name: '装备', sortOrder: 0, version: 2 });
  for (const form of [{ name: ' ', sortOrder: '0' }, { name: 'A\u0085', sortOrder: '0' }, { name: '装备', sortOrder: '-1' }, { name: '装备', sortOrder: '10000' }]) assert.throws(() => categoryInput(form));
});
test('new-product original defaults to the first current-price inputs until explicitly edited', async () => {
  const p = await loaded(''); p.input(event('price', '12.99')); assert.equal(p.data.form.originalPrice, '12.99');
  p.input(event('price', '11.99')); assert.equal(p.data.form.originalPrice, '11.99');
  p.input(event('originalPrice', '15.99')); p.input(event('price', '10.99')); assert.equal(p.data.form.originalPrice, '15.99');
});
test('category read failure does not hide the loaded product and retry preserves edits', async () => {
  const real = transport; let fail = true;
  transport = (url, method, body) => url === '/admin/shop/categories' && fail ? Promise.reject(Error('分类断开')) : real(url, method, body);
  const p = await loaded(); assert.equal(p.data.authorized, true); assert.equal(p.data.loadFailed, false); assert.match(p.data.categoriesError, /分类断开/);
  p.input(event('name', '保留商品草稿')); await p.save(); assert.equal(writes().length, 0); assert.match(p.data.error, /成功加载分类/);
  fail = false; await p.loadCategories(); assert.equal(p.data.form.name, '保留商品草稿'); assert.equal(p.data.dirty, true); assert.equal(p.data.categoryName, '未分类');
});
test('picker selects only real categories, clears old confirmation and preserves product version', async () => {
  const p = await loaded(); await p.save(); assert.equal(p.data.pendingSave, true);
  p.chooseCategory({ detail: { value: '99' } }); assert.equal(p.data.form.categoryId, 'uncategorized');
  p.chooseCategory({ detail: { value: '0' } }); assert.equal(p.data.form.categoryId, 'gear'); assert.equal(p.data.pendingSave, false);
  await p.save(); await p.confirmSave(); assert.deepEqual(writes()[0].body, { name: product.name, description: product.description, imageUrl: product.imageUrl, categoryId: 'gear', priceCents: 1299, originalPriceCents: 1599, stock: 8, status: product.status, version: 3 });
});
test('same-page category creation retains product draft and selects the authoritative created category', async () => {
  const p = await loaded(); p.input(event('name', '未保存的背包')); await start(p);
  p.categoryInput(event('name', ' 新装备 ')); p.categoryInput(event('sortOrder', '12')); await p.saveCategory(); await tick();
  assert.equal(p.data.form.name, '未保存的背包'); assert.equal(p.data.form.categoryId, 'new-gear'); assert.equal(p.data.categoryName, '新装备');
  assert.equal(p.data.version, 3); assert.equal(p.data.dirty, true); assert.equal(alerts.at(-1), true);
  assert.deepEqual(writes()[0], { url: '/admin/shop/categories', method: 'POST', body: { name: '新装备', sortOrder: 12 } });
  assert.equal(writes().length, 1);
});
test('default category editing sends its own version without marking the unchanged product category dirty', async () => {
  const p = await loaded(); await start(p, true); p.categoryInput(event('name', '其他装备')); await p.saveCategory(); await tick();
  assert.deepEqual(writes()[0], { url: '/admin/shop/categories/uncategorized', method: 'PUT', body: { name: '其他装备', sortOrder: 9999, version: 0 } });
  assert.equal(p.data.categoryName, '其他装备'); assert.equal(p.data.form.categoryId, 'uncategorized'); assert.equal(p.data.dirty, false);
});
test('editing a different managed category does not silently reassign the product', async () => {
  const p = await loaded(); await p.toggleCategoryManager(); await p.chooseManagedCategory({ detail: { value: '0' } });
  await p.editCategory(); p.categoryInput(event('name', '新徒步分类名')); await p.saveCategory(); await tick();
  assert.equal(writes()[0].url, '/admin/shop/categories/gear'); assert.equal(writes()[0].body.version, 2);
  assert.equal(p.data.form.categoryId, 'uncategorized'); assert.equal(p.data.dirty, false);
});

test('visible edit entry opens the current category and picker immediately loads the new snapshot', async () => {
  const markup = require('node:fs').readFileSync(path.resolve(__dirname, '../src/pages/admin-product/index.wxml'), 'utf8');
  assert.match(markup, /bindtap="editCategory"[^>]*>编辑当前分类/);
  const p = await loaded(); await p.editCategory();
  assert.equal(p.data.categoryManagerOpen, true);
  assert.equal(p.data.categoryForm.name, fallback.name);
  await p.chooseManagedCategory({ detail: { value: '0' } });
  assert.deepEqual(p.data.categoryForm, { name: gear.name, sortOrder: String(gear.sortOrder) });
  assert.equal(p.data.categoryVersion, gear.version);
  p.categoryInput(event('name', '新徒步分类名')); await p.saveCategory();
  assert.deepEqual(writes()[0], { url: '/admin/shop/categories/gear', method: 'PUT', body: { name: '新徒步分类名', sortOrder: 10, version: 2 } });
});

test('category switch cancellation preserves target and draft, while pending save locks all category changes', async () => {
  const p = await loaded(); await p.editCategory(); p.categoryInput(event('name', '分类草稿'));
  modal = async () => ({ confirm: false });
  await p.chooseManagedCategory({ detail: { value: '0' } });
  assert.equal(p._categoryId, fallback.id); assert.equal(p.data.categoryForm.name, '分类草稿');
  let resolve; transport = async () => new Promise(done => { resolve = done; });
  const saving = p.saveCategory(); await tick();
  await p.newCategory(); await p.chooseManagedCategory({ detail: { value: '0' } });
  p.categoryInput(event('name', '不应覆盖')); await p.save();
  assert.equal(p._categoryId, fallback.id); assert.equal(p.data.categoryForm.name, '分类草稿');
  assert.equal(p.data.pendingSave, false); assert.equal(p.data.categorySaving, true);
  resolve({ ...fallback, name: '分类草稿', version: 1 }); await saving;
  assert.equal(p.data.categorySaving, false); assert.equal(writes().length, 1);
});

test('clearing the optional original price saves the current price as original', async () => {
  const p = await loaded(); p.input(event('originalPrice', ''));
  await p.save(); await p.confirmSave();
  assert.equal(writes()[0].body.originalPriceCents, product.priceCents);
});
test('duplicate category name remains correctable with no stale-version lock', async () => {
  const real = transport; transport = (url, method, body) => method === 'POST' ? Promise.reject(new api.ApiError('同名', 409, 'CATEGORY_NAME_EXISTS')) : real(url, method, body);
  const p = await loaded(); await start(p); p.categoryInput(event('name', '已有分类')); await p.saveCategory();
  assert.equal(p.data.categoryConflict, false); assert.equal(p.data.categoryUncertain, false); assert.equal(p.data.categoryDirty, true);
  assert.match(p.data.categoryError, /名称已存在/); p.categoryInput(event('name', '修改分类')); await p.saveCategory(); assert.equal(writes().length, 2);
});
test('category stale version locks writes; canceled/failed reload preserves both drafts, fresh reload adopts the new version', async () => {
  const p = await loaded(); p.input(event('name', '商品草稿')); await start(p, true); p.categoryInput(event('name', '分类草稿'));
  const real = transport; transport = (url, method, body) => method === 'PUT' ? Promise.reject(new api.ApiError('过时', 409, 'STALE_VERSION')) : real(url, method, body);
  await p.saveCategory(); await p.saveCategory(); assert.equal(writes().length, 1); assert.equal(p.data.categoryConflict, true);
  modal = async () => ({ confirm: false }); const reads = calls.length; await p.reloadCategory(); assert.equal(calls.length, reads); assert.equal(p.data.categoryForm.name, '分类草稿');
  modal = async () => ({ confirm: true }); transport = async () => { throw Error('重读失败'); }; await p.reloadCategory();
  assert.equal(p.data.categoryForm.name, '分类草稿'); assert.equal(p.data.categoryConflict, true); assert.equal(p.data.form.name, '商品草稿');
  transport = real; categories = [gear, { ...fallback, name: '服务器分类', version: 5 }]; await p.reloadCategory();
  assert.equal(p.data.categoryForm.name, '服务器分类'); assert.equal(p.data.categoryVersion, 5); assert.equal(p.data.categoryConflict, false); assert.equal(p.data.form.name, '商品草稿');
  p.categoryInput(event('name', '再次修改')); await p.saveCategory(); assert.equal(writes().at(-1).body.version, 5);
});
for (const kind of ['network', 'server']) test(`unknown ${kind} category create does not repeat and can reconcile the unique existing name`, async () => {
  const p = await loaded(); await start(p); p.categoryInput(event('name', '待核对分类'));
  const real = transport; transport = (url, method, body) => method === 'POST' ? Promise.reject(kind === 'network' ? Error('network') : new api.ApiError('timeout', 503, 'UNAVAILABLE')) : real(url, method, body);
  await p.saveCategory(); await p.saveCategory(); await p.toggleCategoryManager(); assert.equal(writes().length, 1); assert.equal(p.data.categoryUncertain, true); assert.equal(p.data.categoryManagerOpen, true);
  categories = [{ ...gear, id: 'saved-category', name: '待核对分类' }, fallback]; await p.reloadCategory();
  assert.equal(p.data.categoryUncertain, false); assert.equal(p.data.form.categoryId, 'saved-category'); assert.equal(writes().length, 1); assert.equal(p.data.form.name, product.name);
});
test('unknown creation not found in latest list requires explicit review before allowing another create', async () => {
  const p = await loaded(); await start(p); p.categoryInput(event('name', '未创建分类')); const real = transport;
  transport = (url, method, body) => method === 'POST' ? Promise.reject(Error('network')) : real(url, method, body);
  await p.saveCategory(); modal = async () => ({ confirm: false }); await p.reloadCategory(); assert.equal(p.data.categoryUncertain, true);
  modal = async () => ({ confirm: true }); await p.reloadCategory(); assert.equal(p.data.categoryUncertain, false); assert.equal(p.data.categoryForm.name, '未创建分类'); assert.equal(p.data.categoryDirty, true);
  transport = real; await p.saveCategory(); assert.equal(writes().length, 2);
});
test('double category save sends one request and hidden result cannot change another page leave protection', async () => {
  const p = await loaded(); await start(p); p.categoryInput(event('name', '隐藏创建')); let resolve;
  transport = async () => new Promise(done => { resolve = done; });
  const first = p.saveCategory(); await tick(); await p.saveCategory(); assert.equal(writes().length, 1); p.onHide(); alerts = [];
  resolve({ ...gear, id: 'hidden-new', name: '隐藏创建' }); await first;
  assert.equal(p.data.categoryUncertain, true); assert.equal(p.data.form.categoryId, 'uncategorized'); assert.equal(toasts.length, 0); assert.deepEqual(alerts, []);
});
test('session change during category revalidation sends no write and clears both drafts', async () => {
  const p = await loaded(); p.input(event('name', '敏感草稿')); await start(p); p.categoryInput(event('name', '新分类'));
  auth.requireAdmin = async () => { session++; return session; }; await p.saveCategory();
  assert.equal(writes().length, 0); assert.equal(p.data.authorized, false); assert.equal(p.data.form.name, ''); assert.equal(p.data.categoryForm.name, ''); assert.equal(p.data.authRequired, true);
});
for (const status of [401, 403]) test(`category ${status} clears product/category draft and requires identity verification`, async () => {
  const p = await loaded(); p.input(event('name', '草稿')); await start(p); p.categoryInput(event('name', '新分类'));
  transport = async () => { throw new api.ApiError('权限失效', status, 'FORBIDDEN'); }; await p.saveCategory();
  assert.equal(p.data.form.name, ''); assert.equal(p.data.categoryForm.name, ''); assert.equal(p.data.authorized, false); assert.equal(p.data.authRequired, true);
});
test('late reload confirmations after hide do not read or replace product or category drafts', async () => {
  const p = await loaded(); p.input(event('name', '商品草稿')); await start(p, true); p.categoryInput(event('name', '分类草稿')); let resolve;
  modal = () => new Promise(done => { resolve = done; }); const pending = p.reloadCategory(); const reads = calls.length;
  p.onHide(); resolve({ confirm: true }); await pending; assert.equal(calls.length, reads); assert.equal(p.data.categoryForm.name, '分类草稿'); assert.equal(p.data.form.name, '商品草稿');
  p._visible = true; await p.load(); await tick(); const pendingProduct = p.reload(); const productReads = calls.length;
  p.onHide(); resolve({ confirm: true }); await pendingProduct; assert.equal(calls.length, productReads); assert.equal(p.data.form.name, '商品草稿');
});
test('category permission denial invalidates a simultaneous older product reload', async () => {
  const p = await loaded(); let rejectCategory, resolveProducts;
  transport = (url) => url === '/admin/shop/categories'
    ? new Promise((_, reject) => { rejectCategory = reject; })
    : new Promise(resolve => { resolveProducts = resolve; });
  const categoriesRead = p.loadCategories(), productReload = p.load(true); await tick();
  rejectCategory(new api.ApiError('撤销权限', 403, 'FORBIDDEN')); await categoriesRead;
  resolveProducts([product]); await productReload;
  assert.equal(p.data.authorized, false); assert.equal(p.data.form.name, ''); assert.equal(p.data.loading, false);
});
test('product stale version blocks old payload and failed/canceled reload retains original prices/category', async () => {
  const p = await loaded(); p.input(event('originalPrice', '19.99')); const real = transport;
  transport = (url, method, body) => method === 'PUT' ? Promise.reject(new api.ApiError('过时', 409, 'STALE_VERSION')) : real(url, method, body);
  await p.save(); await p.confirmSave(); await p.save(); assert.equal(writes().length, 1); assert.equal(p.data.conflict, true); assert.equal(p.data.form.originalPrice, '19.99');
  modal = async () => ({ confirm: false }); await p.reload(); assert.equal(p.data.form.originalPrice, '19.99'); assert.equal(p.data.conflict, true);
});
test('HTTP zero product-create outcome remains uncertain and cannot issue a second creation', async () => {
  const p = await loaded(''); p.input(event('name', '新商品')); p.input(event('description', '商品说明')); p.input(event('price', '10'));
  transport = async () => { throw new api.ApiError('unknown', 0, 'UNKNOWN'); };
  await p.save(); await p.confirmSave(); await p.save();
  assert.equal(p.data.uncertainCreate, true); assert.equal(writes().length, 1);
});
