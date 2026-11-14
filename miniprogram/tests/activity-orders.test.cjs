const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const api=require('../dist/utils/api.js'), legal=require('../dist/utils/legal.js'), activityOrders=require('../dist/utils/activity-orders.js');
const policy={ready:true,privacy:{version:1,kind:'PRIVACY',content:'privacy'},terms:{version:2,kind:'TERMS',content:'terms'}};
const quote={participants:1,originalTotalCents:1000,totalCents:800,currency:'CNY',participantPricing:'ONE_BENEFIT',quote:{policyVersion:'v1',lines:[{unitPriceCents:1000,quantity:1,chargedUnitPriceCents:800,tierName:'银卡'}]}};
const order={id:'ao-1',orderNo:'AO1',activityId:'a-1',activityTitle:'山野',status:'PENDING_PAYMENT',partySize:1,originalTotalCents:1000,totalCents:800,quote:quote.quote,expiresAt:'2099-01-01T00:00:00Z',version:1};
let session,calls,respond,nav,storage,payments;
function page(name){let def;global.Page=d=>def=d;const file=path.resolve(__dirname,`../dist/pages/${name}/index.js`);delete require.cache[file];require(file);return {...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}};}
function signup(){const p=page('register');Object.assign(p.data,{id:'a-1',session,activity:{priceCents:1000,enabled:true,available:10,capacity:10,canCancel:true,identityRequired:false},participants:[{participantName:'测试',phone:'13800000000',idNumber:''}],legal:policy,consent:true,privacyRead:true,termsRead:true,loading:false,quote,quoteSession:session});return p;}
const event=id=>({currentTarget:{dataset:{id}}});const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
beforeEach(()=>{session=1;calls=[];nav=[];storage=new Map();payments=0;api.sessionVersion=()=>session;api.isSessionCurrent=s=>s===session;api.hasSession=()=>true;api.requireSession=async()=>{};api.getCurrentUser=async()=>({id:'u-1',role:'USER'});legal.currentLegal=async()=>policy;respond=async(p,m,d)=>{if(p.includes('/by-request/'))throw new api.ApiError('missing',404,'NOT_FOUND');if(p.includes('/quote?'))return quote;if(p==='/me/activity-orders?page=0&size=20')return {items:[order],page:0,hasMore:false};if(p.endsWith('/refund'))return {};if(p.endsWith('/pay'))return {timeStamp:'1',nonceStr:'n',package:'prepay_id=p',signType:'RSA',paySign:'sign'};return order;};api.request=async(p,m,d)=>{calls.push({p,m,d});return respond(p,m,d);};global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),redirectTo:o=>{nav.push(o.url);o.success?.();},navigateTo:o=>nav.push(o.url),requestPayment:o=>{payments++;o.success();}};});
test('activity member quote enforces count and exact sums; no implied participant identity',()=>{assert.equal(activityOrders.validActivityQuote(quote,1),true);assert.equal(activityOrders.validActivityQuote({...quote,totalCents:1},1),false);assert.equal(activityOrders.validActivityQuote(quote,2),false);assert.match(activityOrders.priceLines(quote.quote)[0].label,/银卡会员价.*8.00/);});
test('paid registration submits immutable quoted amount separately and does not claim free signup success',async()=>{const p=signup();await p.submit();const sent=calls.find(c=>c.p==='/activities/a-1/orders');assert.equal(sent.d.expectedTotalCents,800);assert.equal(sent.d.registration.participants.length,1);assert.equal(sent.d.registration.termsVersion,2);assert.match(sent.d.requestKey,/^[0-9a-f-]{36}$/);assert.equal(calls.some(c=>c.p.endsWith('/registrations')),false);assert.equal(p.data.success,false);assert.deepEqual(nav,['/pages/activity-orders/index?id=ao-1']);assert.equal(payments,0);});
test('paid registration rejects absent or cross-account quote without writing free registrations',async()=>{const p=signup();p.data.quote=null;await p.submit();assert.equal(calls.length,0);p.data.quote=quote;p.data.quoteSession=0;await p.submit();assert.equal(calls.length,0);});
test('activity price changes refresh quote and require explicit resubmission',async()=>{const p=signup();respond=async(p)=>{if(p.includes('/by-request/'))throw new api.ApiError('missing',404,'NOT_FOUND');if(p.endsWith('/orders'))throw new api.ApiError('changed',409,'ACTIVITY_PRICE_CHANGED');return {...quote,totalCents:700,quote:{...quote.quote,lines:[{...quote.quote.lines[0],chargedUnitPriceCents:700}]}};};await p.submit();assert.equal(p.data.quote.totalCents,700);assert.match(p.data.fieldError,/重新提交/);assert.equal(calls.filter(x=>x.m==='POST').length,1);assert.equal(nav.length,0);});
test('lost activity create response recovers original key before resending, never duplicate payment',async()=>{const p=signup();let first,created=false;respond=async(path,m,d)=>{if(path.includes('/by-request/')){if(created)return order;throw new api.ApiError('missing',404,'NOT_FOUND');}if(path.endsWith('/orders')){first=d.requestKey;created=true;throw new Error('lost response');}};await p.submit();await p.submit();assert.equal(calls.filter(x=>x.p==='/activities/a-1/orders').length,1);assert.ok(calls.some(x=>x.p===`/activity-orders/by-request/${first}`));assert.equal(nav.length,1);assert.equal(payments,0);});
test('reopening paid signup recovers pending order without storing participant data',async()=>{const key=activityOrders.activityIntent('u-1','a-1');const p=signup();respond=async(path)=>path==='/activities/a-1'?{...p.data.activity,id:'a-1'}:order;await p.load();assert.ok(calls.some(x=>x.p===`/activity-orders/by-request/${key}`));assert.equal(nav.length,1);assert.equal([...storage.values()].length,0);});
test('duplicate create and hidden/account switched response cannot navigate or display stale order',async()=>{for(const mode of ['hide','switch']){const p=signup(),d=deferred();respond=async(path)=>{if(path.includes('/by-request/'))throw new api.ApiError('missing',404,'NOT_FOUND');return d.promise;};const pending=p.submit();await new Promise(setImmediate);await p.submit();if(mode==='hide')p.onHide();else session++;d.resolve(order);await pending;assert.equal(nav.length,0);assert.equal(payments,0);}});
test('native payment success is not paid unless server verifies; free orders never pay',async()=>{const pending=await activityOrders.payActivityOrder(order);assert.equal(pending.status,'PENDING_PAYMENT');assert.equal(payments,1);assert.equal(calls.at(-1).p,'/activity-orders/ao-1/verify');await assert.rejects(activityOrders.payActivityOrder({...order,status:'CONFIRMED_FREE',totalCents:0}));assert.equal(payments,1);});
test('activity payment recovers a settled order before requesting another payment', async () => {
  respond = async () => ({ ...order, status: "PAID" });
  const result = await activityOrders.payActivityOrder(order);
  assert.equal(result.status, "PAID");
  assert.deepEqual(calls.map(({ p, m }) => [p, m]), [["/activity-orders/ao-1/verify", "POST"]]);
  assert.equal(payments, 0);
});
test('activity payment cannot launch when order verification fails or returns another amount', async () => {
  respond = async () => { throw new Error("查单失败"); };
  await assert.rejects(activityOrders.payActivityOrder(order), /查单失败/);
  respond = async () => ({ ...order, totalCents: 700 });
  await assert.rejects(activityOrders.payActivityOrder(order), /金额待核对/);
  assert.ok(calls.every(({ p }) => p.endsWith("/verify")));
  assert.equal(payments, 0);
});
test('invalid payment and cancelled payment leave order unchanged',async()=>{respond=async(path)=>path.endsWith('/verify')?order:{};await assert.rejects(activityOrders.payActivityOrder(order),/支付参数异常/);assert.equal(payments,0);respond=async(path)=>path.endsWith('/verify')?order:{timeStamp:'1',nonceStr:'n',package:'prepay_id=p',signType:'RSA',paySign:'sign'};wx.requestPayment=o=>o.fail({errMsg:'cancel'});await assert.rejects(activityOrders.payActivityOrder(order),/名额暂保留/);});
test('activity order page cancellation and refund need separate inline confirmation',async()=>{const p=page('activity-orders');await p.load();p.askCancel(event(order.id));assert.equal(calls.some(x=>x.p.endsWith('/cancel')),false);p.dismiss();await p.confirm();assert.equal(calls.some(x=>x.p.endsWith('/cancel')),false);p.askCancel(event(order.id));respond=async()=>({...order,status:'CLOSED'});await p.confirm();assert.equal(p.data.items[0].statusText,'已取消');assert.equal(calls.filter(x=>x.p.endsWith('/cancel')).length,1);p.data.items[0].status='PAID';respond=async()=>({});await p.openRefund(event(order.id));p.data.reason='行程变化';p.askRefund();assert.equal(calls.some(x=>x.p.endsWith('/refund')&&x.m==='POST'),false);respond=async(path,m)=>path.endsWith('/refund')?{status:'REQUESTED',amount_cents:800,version:0}:{...order,status:'REFUND_PENDING'};await p.confirm();assert.equal(p.data.refundStatus,'待审核');assert.equal(p.data.items[0].status,'REFUND_PENDING');});
test('late private activity orders and participant details are discarded after hiding',async()=>{const p=page('activity-orders'),d=deferred();respond=()=>d.promise;const pending=p.load();p.onHide();d.resolve({items:[order],page:0,hasMore:false});await pending;assert.deepEqual(p.data.items,[]);});
test('member activity policy has no default and must be explicit; shop scope remains null',()=>{const m=require('../dist/utils/membership.js'),f=m.emptyTier();f.name='银卡';f.rules[0].enabled=true;assert.equal(f.rules[0].participantPolicy,0);assert.throws(()=>m.tierInput(f,null),/多人优惠/);f.rules[0].participantPolicy=2;const body=m.tierInput(f,null);assert.equal(body.rules[0].participantPricing,'ONE_BENEFIT');assert.equal(body.rules[1].participantPricing,null);assert.deepEqual(body.rules.map(r=>r.scope),['ACTIVITY','SHOP']);});
test('closed or rejected refund allows a new explicit application but processing does not',async()=>{const p=page('activity-orders');await p.load();p.data.items[0].status='PAID';p.data.refundId=order.id;p.data.reason='再次申请';for(const status of ['REJECTED','CLOSED']){p.data.refund={status};p.askRefund();assert.equal(p.data.confirmAction,'refund');p.dismiss();}p.data.refund={status:'PROCESSING'};p.askRefund();assert.equal(p.data.confirmAction,'');});
test('changed participant count invalidates an older quote, and background clears quote',async()=>{const p=signup(),d=deferred();respond=()=>d.promise;const pending=p.refreshQuote();p.data.participants.push({participantName:'同行',phone:'13800000001',idNumber:''});d.resolve(quote);await pending;assert.equal(p.data.quote,null);p.data.quote=quote;p.onHide();assert.equal(p.data.quote,null);assert.deepEqual(p.data.quoteLines,[]);});
test('paid admin roster routes to scoped activity orders without querying empty legacy registrations',async()=>{const auth=require('../dist/pages/admin-editor/shared.js');auth.requireAdmin=async()=>session;const p=page('admin-roster');p.onLoad({id:'a-1'});respond=async()=>({id:'a-1',priceCents:1000});await p.load();assert.deepEqual(nav,[]);p.paidOrders();assert.deepEqual(nav,['/pages/admin-activity-orders/index?activityId=a-1']);assert.equal(calls.length,1);assert.equal(p.data.paidActivity,true);assert.equal(p.data.hasMore,false);});
test('free admin roster retains the original registration endpoint',async()=>{const auth=require('../dist/pages/admin-editor/shared.js');auth.requireAdmin=async()=>session;const p=page('admin-roster');p.onLoad({id:'a-1'});respond=async(path)=>path.endsWith('/a-1')?{id:'a-1',priceCents:0,capacity:10,registeredCount:0,startAt:'2099-01-01'}:{items:[],page:0,hasMore:false,total:0};await p.load();assert.equal(calls.at(-1).p,'/admin/activities/a-1/registrations?page=0&size=20');assert.equal(nav.length,0);assert.equal(p.data.paidActivity,false);});
test('switching accounts clears a deep linked old order and displays the new list',async()=>{const p=page('activity-orders');p.onLoad({id:order.id});await p.load();p.onHide();session++;respond=async()=>({items:[{...order,id:'new-account-order'}],page:0,hasMore:false});calls=[];await p.load();assert.equal(p.data.selectedId,'');assert.equal(p.data.items[0].id,'new-account-order');assert.equal(calls.some(x=>x.p==='/activity-orders/ao-1'),false);});
test('unavailable deep link does not discard current account order list',async()=>{const p=page('activity-orders');p.onLoad({id:'missing-order'});respond=async(path)=>{if(path==='/activity-orders/missing-order')throw new api.ApiError('missing',404,'NOT_FOUND');return {items:[order],page:0,hasMore:false};};await p.load();assert.equal(p.data.items[0].id,order.id);assert.equal(p.data.selectedId,'');assert.match(p.data.error,/当前账号订单/);});
test('expired or forbidden order access clears already-rendered participants and rows', async () => {
  for (const status of [401, 403]) {
    const p = page("activity-orders");
    respond = async (path) => {
      if (path.includes("?page=")) return { items: [order], page: 0, hasMore: false };
      if (path.endsWith("/participants")) return [{ id: "person", participantName: "测试参与人" }];
      if (status === 401) session++;
      throw new api.ApiError("访问已失效", status, "DENIED");
    };
    await p.load();
    await p.participants(event(order.id));
    assert.equal(p.data.participants.length, 1);
    await p.openRefund(event(order.id));
    assert.equal(p.data.loggedIn, false);
    assert.deepEqual(p.data.items, []);
    assert.deepEqual(p.data.participants, []);
    assert.equal(p.data.refundId, "");
    assert.match(p.data.error, /访问已失效/);
  }
});
test('a late access failure from the prior account cannot clear newly loaded orders', async () => {
  const p = page("activity-orders"), old = deferred();
  await p.load();
  respond = () => old.promise;
  const pending = p.openRefund(event(order.id));
  p.onHide();
  session++;
  respond = async () => ({ items: [{ ...order, id: "new-order" }], page: 0, hasMore: false });
  await p.load();
  old.reject(new api.ApiError("旧会话过期", 401, "UNAUTHENTICATED"));
  await pending;
  assert.deepEqual(p.data.items.map(item => item.id), ["new-order"]);
  assert.equal(p.data.loggedIn, true);
});
test('a paid activity loads own scoped active order and navigates there even when sold out', async () => {
  const p = page("detail");
  p.onLoad({ id: "a-1" });
  respond = async (path) => {
    if (path === "/activities/a-1") return {
      id: "a-1", status: "PUBLISHED", priceCents: 1000, capacity: 1, registeredCount: 1,
      startAt: "2099-01-01T00:00:00Z", endAt: "2099-01-01T12:00:00Z",
      registrationDeadline: "2098-12-31T00:00:00Z", galleryUrls: [], coverUrl: "",
    };
    assert.equal(path, "/me/activity-orders?page=0&size=20&activityId=a-1");
    return { items: [{ ...order, id: "closed", status: "CLOSED" }, order] };
  };
  await p.load();
  assert.equal(p.data.activity.enabled, false);
  assert.equal(p.data.activeOrder.id, order.id);
  assert.match(p.data.activeOrderText, /待支付/);
  p.register();
  assert.deepEqual(nav, ["/pages/activity-orders/index?activityId=a-1&id=ao-1"]);
});
