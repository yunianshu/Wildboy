// Native route coverage for the 2026-11-17 redesign, against the disposable QA API.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {connectWeChat} = require('./wechat-session.cjs');
process.env.WILDBOY_LOCAL_API ||= 'http://127.0.0.1:19082';
process.env.WILDBOY_WECHAT_PORT ||= '9423';
assert.equal(process.env.WILDBOY_LOCAL_API, 'http://127.0.0.1:19082');
const base = process.env.WILDBOY_LOCAL_API + '/api/v1';
const fixtureRoot = path.resolve(__dirname, '../../test-results/ui-refresh-2026-11-17');
const out = process.env.WILDBOY_EVIDENCE_DIR || fixtureRoot;
const delay = ms => new Promise(r => setTimeout(r,ms));
const get = async url => {const r=await fetch(base+url); assert.ok(r.ok, url+' '+r.status);return r.json()};
async function settled(m, route) {
  for(let i=0;i<60;i++) {
    const p=await m.currentPage();
    if(p?.path===route) {
      const d=await p.data();
      if(!d.loading && !d.busy && !d.addressLoading && !d.quoteLoading) return p;
    }
    await delay(150);
  }
  throw new Error('Native page did not settle: '+route);
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const results=[], exceptions=[];
  const m=await connectWeChat();
  m.on('exception', e=>exceptions.push(String(e?.message||e)));
  try {
    const legal=await get('/legal/current');
    const activity=(await get('/activities?size=1')).items[0];
    const product=(await get('/shop/products'))[0];
    const userReport=JSON.parse(await fs.readFile(path.join(fixtureRoot,'native-user-report.json'),'utf8'));
    const adminReport=JSON.parse(await fs.readFile(path.join(fixtureRoot,'admin-report.json'),'utf8'));
    const versions={privacyVersion:legal.privacy.version,termsVersion:legal.terms.version};
    await m.evaluate(function(v){const a=require('utils/api.js');a.logout();return a.login(v).then(()=>true)},versions);
    const registration=await m.evaluate(function(id){return require('utils/api.js').request('/activities/'+id+'/registrations/me')},userReport.fixtures.activityId);
    const userRoutes=[
      ['home','',d=>Array.isArray(d.items)],
      ['activities','',d=>d.items?.length>0],['shop','',d=>d.items?.length>0],['mine','',d=>!!d.user],
      ['detail','?id='+activity.id,d=>!!d.activity],['product','?id='+product.id,d=>!!d.product],
      ['checkout','?id='+product.id+'&quantity=1',d=>!!d.product],['orders','',d=>!d.error],
      ['register','?id='+activity.id,d=>!!d.activity&&!!d.legal],['registrations','',d=>!d.error],
      ['signup-success',`?id=${userReport.fixtures.activityId}&registrationId=${registration.id}`,d=>d.confirmed],
      ['addresses','',d=>d.loggedIn],['notifications','',d=>!d.error],['profile','',d=>!!d.user],
      ['activity-orders','',d=>!d.error],['privacy','?kind=PRIVACY',d=>!!d.document],
      ['article','?official=1',d=>!!d.article||!!d.empty],
    ];
    async function capture(name,query,valid,label=name) {
      const route='pages/'+name+'/index';
      await m.reLaunch('/'+route+query);
      const p=await settled(m,route);await delay(350);
      const d=await p.data();assert.ok(valid(d),name+' data state: '+String(d.error||'missing data'));
      await m.callWxMethod('pageScrollTo',{scrollTop:0,duration:0});await delay(100);
      const file='native-'+label+'.png';await m.screenshot({path:path.join(out,file)});
      const w=await p.size();
      results.push({route,query,file,rendered:true,dataValidated:true,size:w,error:d.error||'',role:name.startsWith('admin-')?'ADMIN':'USER'});
      console.log('PASS native route '+route);
      return p;
    }
    for(const args of userRoutes)await capture(...args);
    await m.evaluate(()=>{require('utils/api.js').logout();return true});
    await capture('login','',d=>!!d.current);
    await capture('admin-login','',d=>!d.loading);
    await m.evaluate(function(){return require('utils/api.js').adminLogin('smoke-admin','smoke-only-password-123!').then(()=>true)});
    // A valid server ID is required for each editor/content/roster route.
    const adminActivity=adminReport.fixtures.activityId||activity.id;
    const adminProduct=adminReport.fixtures.productId||product.id;
    for(const [name,q] of [
      ['admin-activities',''],['admin-editor','?id='+adminActivity],['admin-roster','?id='+adminActivity],
      ['admin-legal',''],['admin-shop',''],['admin-product','?id='+adminProduct],['admin-orders',''],
      ['admin-users',''],['admin-content','?id='+adminActivity+'&kind=activity'],
      ['admin-memberships',''],['admin-activity-orders','']
    ]) await capture(name,q,d=>d.authorized===true&&!d.error);
    await m.callWxMethod('switchTab',{url:'/pages/home/index'});
    await settled(m,'pages/home/index');
  } finally {
    await fs.writeFile(path.join(out,'native-pages-report.json'),JSON.stringify({results,exceptions},null,2));
    await m.disconnect();
  }
  assert.equal(results.length,30);assert.equal(exceptions.length,0);
  console.log('PASS 30 native routes');
})().catch(e=>{console.error(e.message);process.exitCode=1});
