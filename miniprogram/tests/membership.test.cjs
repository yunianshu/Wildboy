const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const api=require('../dist/utils/api.js');
const membership=require('../dist/utils/membership.js');
let session,calls,respond;
const tier={id:'tier-1',name:'银卡',sortOrder:0,enabled:true,version:2,rules:membership.scopes.map(scope=>({scope,enabled:false,pricingMode:'DISCOUNT',pricingValue:10000}))};
const user={id:'full-stable-user-123',nickname:'同名',customerType:'GUEST',tierId:null,tierName:null,tierEnabled:false,version:1};
function page(name) { let def; global.Page=d=>def=d;const f=path.resolve(__dirname,`../dist/pages/${name}/index.js`);delete require.cache[f];require(f);return {...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}}; }
const event=(id,key,value)=>({currentTarget:{dataset:{id,key}},detail:{value}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
beforeEach(()=>{ session=1;calls=[];api.isSessionCurrent=s=>s===session;api.sessionVersion=()=>session;api.hasSession=()=>true;respond=async(p,m,d)=>p==='/me/membership'?user:{...tier,...d};api.request=async(p,m,d)=>{calls.push({p,m,d});return respond(p,m,d);};global.wx={navigateTo(){}};});
test('two independent scopes preserve all three pricing modes and exact units',()=>{
 const f=membership.emptyTier();f.name='金卡';
 assert.deepEqual(membership.scopes,['ACTIVITY','SHOP']);
 assert.deepEqual(f.rules.map(r=>r.enabled),[false,false]);
 f.rules[0]={...f.rules[0],enabled:true,value:'8',participantPolicy:1};
 f.rules[1]={...f.rules[1],enabled:true,mode:1,value:'12.99'};
 const body=membership.tierInput(f,null);
 assert.deepEqual(body.rules.map(r=>r.scope),['ACTIVITY','SHOP']);
 assert.deepEqual(body.rules.map(r=>r.pricingValue),[8000,1299]);
 assert.deepEqual(body.rules.map(r=>r.pricingMode),['DISCOUNT','FIXED']);
 assert.equal(body.version,null);
 assert.deepEqual(membership.tierInput(membership.tierForm({...tier,rules:body.rules}),2).rules,body.rules);
 const reduction=membership.tierInput({...f,rules:[f.rules[0],{...f.rules[1],enabled:false,mode:2,value:'5.01'}]},2);
 assert.equal(reduction.rules[1].pricingValue,501);
 assert.equal(reduction.rules[1].pricingMode,'REDUCTION');
 assert.equal(reduction.rules[1].enabled,false);
 assert.deepEqual(membership.tierInput(membership.tierForm({...tier,rules:reduction.rules}),2).rules,reduction.rules);
 for(const value of ['0','10.001','1.0001','-1','NaN'])assert.throws(()=>membership.tierInput({...f,rules:[{...f.rules[0],value},f.rules[1]]},0));
 for(const name of ['', 'x'.repeat(41)])assert.throws(()=>membership.tierInput({...f,name},0));
 assert.throws(()=>membership.tierInput({...f,sortOrder:'1.2'},0));
 assert.throws(()=>membership.tierInput({...f,rules:[f.rules[0]]},0));
});
test('membership UI has only activity and shop controls and no course entry or description',async()=>{
 const fs=require('node:fs');
 const markup=fs.readFileSync(path.join(__dirname,'../src/pages/profile/index.wxml'),'utf8');
 assert.doesNotMatch(markup,/课程|COURSE/i);
 assert.deepEqual(membership.scopeLabels,['活动','商品']);
});
test('profile shows full stable ID, no mutation, and discards switched-account response',async()=>{const p=page('profile');p.visible=true;await p.loadMembership();assert.equal(p.data.membership.id,user.id);assert.equal(p.data.membershipLabel,'散客');assert.equal(calls.some(c=>c.m),false);p.onHide();p.visible=true;const d=deferred();respond=()=>d.promise;const a=p.loadMembership();session++;d.resolve(user);await a;assert.equal(p.data.membership,null);});
test('product detail shows independent member and original prices, latest quantity wins',async()=>{
  const p=page('product');p.data.id='gear';p.data.product={id:'gear',priceCents:1000,stock:100};
  respond=async()=>({productId:'gear',quantity:1,originalTotalCents:1000,totalCents:800,pricing:{originalPriceCents:1000,priceCents:800,tierName:'银卡'}});
  await p.refreshQuote();assert.equal(p.data.memberPriceText,'¥8.00');assert.equal(p.data.memberTotalText,'¥8.00');assert.equal(p.data.tierName,'银卡');
  const d=deferred();respond=()=>d.promise;const pending=p.refreshQuote();p.onHide();d.resolve({productId:'gear',quantity:1,originalTotalCents:1000,totalCents:800,pricing:{originalPriceCents:1000,priceCents:800,tierName:'银卡'}});await pending;assert.equal(p.data.memberPriceText,'');assert.equal(p.data.tierName,'');
  p.data.quantity=99;p.changeQuantity({currentTarget:{dataset:{delta:1}}});assert.equal(p.data.quantity,99);
});
