const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const api = require('../dist/utils/api.js');
const capabilities = require('../dist/utils/admin-capability.js');
const shared = require('../dist/pages/admin-editor/shared.js');
let writes, navigation, current, nextCapability, nextModal;
const activity = { id:'activity-one', title:'QA route', category:'WEEKLY', coverUrl:'/assets/category-weekly.jpg', galleryUrls:[], summary:'QA summary', description:'QA route description', location:'QA location', meetingPoint:'QA meeting point', startAt:'2099-11-06T09:00:00+08:00', endAt:'2099-11-06T15:00:00+08:00', registrationDeadline:'2099-11-05T09:00:00+08:00', capacity:20, registeredCount:2, status:'DRAFT', version:3 };
function page(name) {
  let definition;
  global.Page = value => definition = value;
  const file = path.resolve(__dirname, `../dist/pages/${name}/index.js`);
  delete require.cache[file]; require(file);
  return { ...definition, data:structuredClone(definition.data), setData(values, done) {
    for (const [key,value] of Object.entries(values)) {
      const parts=key.split('.');
      if(parts.length===2) this.data[parts[0]][parts[1]]=value; else this.data[key]=value;
    }
    done?.();
  }};
}
async function prepareShipment(p, row) {
  await p.ship({ currentTarget: { dataset: { id: row.id } } });
  for (const [field, value] of [["shipCompany", "SF"], ["shipTrackingNo", "SF123456"]]) {
    p.shipInput({ currentTarget: { dataset: { id: row.id, field } }, detail: { value } });
  }
}
beforeEach(() => {
  writes=[]; navigation=[]; current=1; nextCapability=async()=>true; nextModal=async()=>({confirm:true});
  shared.requireAdmin=async()=>current;
  api.isSessionCurrent=n=>n===current;
  capabilities.getAdminLoginCapability=()=>nextCapability();
  api.adminLogin=async(...args)=>{ writes.push(args); };
  api.request=async(url,method='GET',body)=>{
    if(method!=='GET') { writes.push({url,method,body}); return {...activity,version:4}; }
    return {...activity};
  };
  global.wx={ pageScrollTo(){}, hideKeyboard(){}, showToast(){}, enableAlertBeforeUnload(){}, disableAlertBeforeUnload(){}, showModal:()=>nextModal(), redirectTo:({url})=>navigation.push(url), navigateTo:({url})=>navigation.push(url), switchTab:({url})=>navigation.push(url) };
});
test('admin login stays closed before capability resolves and after confirmed unconfigured state',async()=>{
  let resolve; nextCapability=()=>new Promise(r=>resolve=r);
  const p=page('admin-login'); p.data.username='qa-admin'; p.data.password='QA-only-password';
  const pending=p.loadCapability(); await p.submit(); assert.equal(writes.length,0);
  resolve(false); await pending;
  p.data.password='QA-only-password'; await p.submit();
  assert.equal(p.data.capabilityState,'ready'); assert.equal(p.data.adminLoginEnabled,false); assert.equal(writes.length,0);
});
test('capability failures have a retry state; a late successful response cannot reopen a hidden login page',async()=>{
  nextCapability=async()=>{throw new Error('offline');};
  const p=page('admin-login'); await p.loadCapability();
  assert.equal(p.data.capabilityState,'error'); assert.equal(p.data.adminLoginEnabled,false);
  let resolve; nextCapability=()=>new Promise(r=>resolve=r);
  const retry=p.loadCapability(); p.onHide(); resolve(true); await retry;
  assert.equal(p.data.adminLoginEnabled,false); assert.equal(p.data.password,'');
});
test('enabled admin login submits once and clears the secret on success',async()=>{
  const p=page('admin-login'); await p.loadCapability(); p.data.username='qa-admin'; p.data.password='QA-only-password';
  let finish; api.adminLogin=async()=>{writes.push('login'); await new Promise(r=>finish=r);};
  const pending=p.submit(); await p.submit(); assert.equal(writes.length,1); finish(); await pending;
  assert.equal(p.data.password,''); assert.deepEqual(navigation,['/pages/admin-activities/index']);
});
test('activity tabs preserve one dirty form and do not save while navigating',()=>{
  const p=page('admin-editor'); p.data.authorized=true; p.data.form.title='unsaved'; p.data.dirty=true;
  p.sectionChange({currentTarget:{dataset:{section:2}}}); p.previousSection(); p.nextSection();
  assert.equal(p.data.section,2); assert.equal(p.data.form.title,'unsaved'); assert.equal(p.data.dirty,true); assert.equal(writes.length,0);
});
test('saving from a different tab validates hidden fields and reveals the failing section',async()=>{
  const p=page('admin-editor'); p.data.authorized=true; p._session=1; p.data.form=shared.formFromActivity(activity); p.data.form.summary=''; p.data.section=0;
  await p.save({currentTarget:{dataset:{action:'save'}}});
  assert.equal(p.data.section,2); assert.match(p.data.error,/简介/); assert.equal(writes.length,0);
  p.data.form.summary='fixed'; p.data.form.deadlineDate=''; p.data.section=0;
  await p.save({currentTarget:{dataset:{action:'save'}}});
  assert.equal(p.data.section,1); assert.equal(writes.length,0);
});
test('save then edit rich content does not navigate after validation fails',async()=>{
  const p=page('admin-editor'); p.data.authorized=true; p._session=1; p.data.id=activity.id;
  await p.saveAndEditContent(); assert.equal(navigation.length,0); assert.equal(writes.length,0);
});
test('a queued identity switch cannot modify the submitted form while saving or without authority',()=>{
  const p=page('admin-editor');p.data.authorized=true;p.data.busy=true;
  p.identityChange({detail:{value:true}});assert.equal(p.data.form.identityRequired,false);assert.equal(p.data.dirty,false);
  p.data.busy=false;p.data.authorized=false;p.identityChange({detail:{value:true}});
  assert.equal(p.data.form.identityRequired,false);assert.equal(p.data.dirty,false);
});
test('product status writes prevent queued refresh and navigation from invalidating their operation',async()=>{
  const p=page('admin-shop');p.data.authorized=true;p._session=current;p.data.busyId='product-one';p._epoch=7;
  let reads=0;api.request=async()=>{reads++;return[];};
  await p.load();p.create();p.edit({currentTarget:{dataset:{id:'product-one'}}});p.orders();
  assert.equal(reads,0);assert.equal(p._epoch,7);assert.deepEqual(navigation,[]);
});
test('leaving an activity list invalidates an in-flight response and its authority',async()=>{
  const p=page('admin-activities'); let resolve;
  api.request=()=>new Promise(r=>resolve=r);
  const pending=p.load(true); await new Promise(r=>setImmediate(r)); p.onHide();
  resolve({items:[activity],page:0,hasMore:false}); await pending;
  assert.equal(p.data.authorized,false); assert.deepEqual(p.data.items,[]);
});
test('cancelling recipient reveal keeps private information hidden',async()=>{
  const p=page('admin-orders'); p.data.authorized=true; p._session=1; nextModal=async()=>({confirm:false});
  await p.reveal({currentTarget:{dataset:{id:'order-one'}}});
  assert.equal(p.data.revealedId,'');
});
test('known unresolved order reconciliation never opens a ship confirmation',async()=>{
  const p=page('admin-orders'); p.data.authorized=true; p._session=1;
  p.data.items=[{id:'order-one',status:'PAID',reconciliationRequired:true}];
  await p.ship({currentTarget:{dataset:{id:'order-one'}}});
  assert.equal(p.data.pendingId,''); assert.equal(writes.length,0);
});

for (const name of ['admin-activities', 'admin-orders']) {
  test(`${name} cannot invalidate an active write by refreshing or reaching the next page`, async () => {
    const p = page(name);
    p.data.authorized = true; p._session = current; p.data.hasMore = true;
    const row = name === 'admin-activities' ? { ...activity, status: 'PUBLISHED' } : { id: 'order-one', status: 'PAID', version: 1 };
    p.data.items = [row];
    if (name === 'admin-activities') await p.change({ currentTarget: { dataset: { id: row.id, action: 'cancel' } } });
    else await prepareShipment(p, row);
    let finish, reads = 0;
    api.request = async (url, method = 'GET') => {
      if (method === 'POST') return new Promise(resolve => { finish = resolve; });
      reads++; return { items: [], page: 0, hasMore: false };
    };
    const pending = name === 'admin-activities' ? p.confirmChange() : p.confirmShip();
    await new Promise(resolve => setImmediate(resolve));
    const epoch = p._epoch;
    await p.load(false); await p.load(true);
    assert.equal(reads, 0); assert.equal(p._epoch, epoch); assert.equal(p.data.busyId, row.id);
    finish({ ...row, status: name === 'admin-activities' ? 'CANCELLED' : 'SHIPPED', version: row.version + 1 });
    await pending;
    assert.equal(p.data.busyId, '');
  });
}

test('a hidden activity save cannot close another page leave protection or show a success toast', async () => {
  const p = page('admin-editor');
  p.data.authorized = true; p._session = current; p._loaded = true;
  p.data.id = activity.id; p.data.form = shared.formFromActivity(activity); p.data.dirty = true;
  let finish, disabled = 0, toasts = 0;
  wx.disableAlertBeforeUnload = () => disabled++;
  wx.showToast = () => toasts++;
  api.request = () => new Promise(resolve => { finish = resolve; });
  const pending = p.save({ currentTarget: { dataset: { action: 'save' } } });
  await new Promise(resolve => setImmediate(resolve)); p.onHide();
  finish({ ...activity, version: 4 }); await pending;
  assert.equal(disabled, 0); assert.equal(toasts, 0); assert.equal(p.data.dirty, false);
  // Returning revalidates the same session and restores this page's correct saved state.
  p._visible = true; await p.load(false);
  assert.equal(p.data.authorized, true); assert.equal(disabled, 1);
});

test('returning before a hidden activity creation resolves preserves its uncertain draft and prevents another POST', async () => {
  const p = page('admin-editor');
  p.data.authorized = true; p._session = current; p._loaded = true;
  p.data.form = shared.formFromActivity(activity); p.data.dirty = true;
  let finish, posts = 0;
  api.request = async () => { posts++; return new Promise(resolve => { finish = resolve; }); };
  const pending = p.save({ currentTarget: { dataset: { action: 'save' } } });
  await new Promise(resolve => setImmediate(resolve)); p.onHide();
  assert.equal(p.data.uncertain, true);
  p._visible = true; await p.load(false);
  await p.save({ currentTarget: { dataset: { action: 'save' } } });
  assert.equal(posts, 1); assert.equal(p.data.dirty, true); assert.equal(p.data.form.title, activity.title);
  assert.match(p.data.error, /返回管理列表核对/);
  finish({ ...activity }); await pending;
  assert.equal(p.data.uncertain, true); assert.equal(p.data.id, '');
});

for (const status of [0, 500, 502, 503]) {
  test(`activity creation HTTP ${status} is uncertain and cannot be submitted twice`, async () => {
    const p = page('admin-editor');
    p.data.authorized = true; p._session = current; p._loaded = true;
    p.data.form = shared.formFromActivity(activity); p.data.dirty = true;
    let posts = 0;
    api.request = async () => { posts++; throw new api.ApiError('Response unavailable', status, 'QA_UPSTREAM_FAILURE'); };
    await p.save({ currentTarget: { dataset: { action: 'save' } } });
    await p.save({ currentTarget: { dataset: { action: 'save' } } });
    assert.equal(posts, 1); assert.equal(p.data.uncertain, true);
    assert.equal(p.data.form.title, activity.title); assert.equal(p.data.dirty, true);
  });
}

test('failed authorization revalidation before creation remains retryable without pretending a POST was sent', async () => {
  const p = page('admin-editor');
  p.data.authorized = true; p._session = current; p._loaded = true;
  p.data.form = shared.formFromActivity(activity); p.data.dirty = true;
  shared.requireAdmin = async () => { throw new Error('Network unavailable'); };
  await p.save({ currentTarget: { dataset: { action: 'save' } } });
  assert.equal(writes.length, 0); assert.equal(p.data.uncertain, false); assert.equal(p.data.dirty, true);
});

test('hidden cover upload retains its result and rearms leave protection only when returning to the editor', async () => {
  const content = require('../dist/utils/content.js');
  const originalUpload = content.uploadImage;
  const p = page('admin-editor');
  p.data.authorized = true; p._session = current; p._loaded = true; p.data.id = activity.id;
  p.data.form = shared.formFromActivity(activity);
  let finish, alerts = 0;
  wx.enableAlertBeforeUnload = () => alerts++;
  content.uploadImage = () => new Promise(resolve => { finish = resolve; });
  try {
    const pending = p.uploadCover(); p.onHide();
    finish('/assets/uploads/qa-hidden-cover.png'); await pending;
    assert.equal(p.data.form.coverUrl, '/assets/uploads/qa-hidden-cover.png');
    assert.equal(p.data.dirty, true); assert.equal(alerts, 0);
    p._visible = true; await p.load(false);
    assert.equal(p.data.authorized, true); assert.equal(p.data.dirty, true); assert.equal(alerts, 1);
  } finally { content.uploadImage = originalUpload; }
});

for (const name of ['admin-activities', 'admin-orders']) {
  test(`${name} rejects a confirmation whose displayed v3 snapshot was replaced by a delayed v4 page`, async () => {
    const p = page(name);
    p.data.authorized = true; p._session = current; p.data.hasMore = true;
    const row = name === 'admin-activities' ? { ...activity, status: 'PUBLISHED' }
      : { id: 'order-one', status: 'PAID', version: 3, phone: '13800000000', totalCents: 100 };
    p.data.items = [row];
    if (name === 'admin-activities') await p.change({ currentTarget: { dataset: { id: row.id, action: 'cancel' } } });
    else await prepareShipment(p, row);
    let finish;
    api.request = async (url, method = 'GET', body) => {
      if (method === 'POST') { writes.push({ url, body }); return row; }
      return new Promise(resolve => { finish = resolve; });
    };
    const pending = p.load(false); await new Promise(resolve => setImmediate(resolve));
    finish({ items: [{ ...row, title: 'Changed after opening confirmation', version: 4 }], page: 1, hasMore: false });
    await pending;
    assert.equal((p.data.pendingItem || p.data.pendingOrder).version, 3);
    assert.equal(p.data.items[0].version, 4);
    if (name === 'admin-activities') await p.confirmChange(); else await p.confirmShip();
    assert.equal(writes.length, 0); assert.equal(p.data.pendingId, '');
    assert.match(p.data.error, /重新核对/);
  });

  test(`${name} closes confirmation when the previously displayed row is no longer present`, async () => {
    const p = page(name); p.data.authorized = true; p._session = current;
    const row = name === 'admin-activities' ? { ...activity, status: 'PUBLISHED' } : { id: 'order-one', status: 'PAID', version: 3 };
    p.data.items = [row];
    if (name === 'admin-activities') await p.change({ currentTarget: { dataset: { id: row.id, action: 'cancel' } } });
    else await prepareShipment(p, row);
    p.data.items = [];
    if (name === 'admin-activities') await p.confirmChange(); else await p.confirmShip();
    assert.equal(writes.length, 0); assert.equal(p.data.pendingId, ''); assert.match(p.data.error, /重新核对/);
  });
}

test('a server refund block preserves its accurate reason instead of suggesting an unrelated stale version', async () => {
  const p = page('admin-orders'); p.data.authorized = true; p._session = current;
  p.data.items = [{ id: 'order-one', status: 'PAID', version: 3 }];
  await prepareShipment(p, p.data.items[0]);
  api.request = async () => { throw new api.ApiError('退款申请处理中，不能发货', 409, 'REFUND_PENDING'); };
  await p.confirmShip();
  assert.equal(p.data.error, '退款申请处理中，不能发货'); assert.equal(p.data.busyId, '');
});

for (const name of ['admin-activities', 'admin-orders']) {
  const makeRow = () => name === 'admin-activities' ? { ...activity, status:'PUBLISHED' }
    : { id:'order-one', orderNo:'QA-ORDER-1', status:'PAID', version:3, phone:'13800000000', totalCents:100, items:[] };
  const choose = async (p,row) => name === 'admin-activities'
    ? p.change({currentTarget:{dataset:{id:row.id,action:'cancel'}}})
    : prepareShipment(p,row);
  const confirm = p => name === 'admin-activities' ? p.confirmChange() : p.confirmShip();
  const result = p => name === 'admin-activities' ? p.data.resultItem : p.data.resultOrder;

  test(`${name} shows completion only for the confirmed server state and clears it on hide`,async()=>{
    const p=page(name), row=makeRow(); p.data.authorized=true; p._session=current; p.data.items=[row];
    await choose(p,row);
    const completed={...row,status:name==='admin-activities'?'CANCELLED':'SHIPPED',version:4};
    api.request=async(_url,method='GET')=>method==='POST'?completed:{items:[completed],page:0,hasMore:false};
    await confirm(p);
    assert.equal(result(p).status,completed.status); assert.equal(p.data.busyId,'');
    p.onHide(); assert.equal(result(p),null); assert.equal(p.data.authorized,false);
  });
  test(`${name} does not announce completion for an unconfirmed response`,async()=>{
    const p=page(name),row=makeRow(); p.data.authorized=true;p._session=current;p.data.items=[row];
    await choose(p,row); api.request=async()=>row; await confirm(p);
    assert.equal(result(p),null); assert.match(p.data.error,/尚未确认/); assert.equal(p.data.busyId,'');
  });
}
