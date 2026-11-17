const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { connectWeChat } = require('./wechat-session.cjs');
process.env.WILDBOY_LOCAL_API = 'http://127.0.0.1:19082';
process.env.WILDBOY_WECHAT_PORT = '9423';
const out = path.resolve(__dirname, '../../test-results/ui-citrus-2026-11-17');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled(m, route) {
  for (let i=0;i<60;i++) {
    const page=await m.currentPage();
    if(page?.path===route) {
      const data=await page.data();
      if(!data.loading&&!data.addressLoading&&!data.quoteLoading&&!data.shortcutLoading) return page;
    }
    await delay(150);
  }
  throw new Error('Page did not settle: '+route);
}
(async()=>{
  const mini=await connectWeChat();
  const checks=[];
  try {
    const legal=await (await fetch(process.env.WILDBOY_LOCAL_API+'/api/v1/legal/current')).json();
    await mini.evaluate(v=>{const api=require('utils/api.js');api.logout();return api.login(v).then(()=>true)},{privacyVersion:legal.privacy.version,termsVersion:legal.terms.version});
    const products=await (await fetch(process.env.WILDBOY_LOCAL_API+'/api/v1/shop/products')).json();
    await mini.reLaunch('/pages/checkout/index?id='+products[0].id+'&quantity=1');
    const page=await settled(mini,'pages/checkout/index');
    if((await page.data()).selectedAddressId) await page.setData({selectedAddressId:''});
    const row=await page.$('.shipping-select');assert.ok(row);
    assert.equal(await row.style('display'),'flex');
    const icon=await row.$('.row-chevron');assert.ok(icon);
    const pos=await row.offset(),size=await row.size(),arrow=await icon.offset();
    assert.ok(arrow.left>pos.left+Number(size.width)-35,'address arrow remains at the right edge');
    assert.ok(arrow.top>=pos.top&&arrow.top<pos.top+Number(size.height),'address arrow remains in the same row');
    await mini.screenshot({path:path.join(out,'native-checkout.png')});
    checks.push({name:'rebuilt checkout loads and address selector keeps its arrow in one row',passed:true});
    await mini.reLaunch('/pages/home/index');
    const home=await settled(mini,'pages/home/index');assert.ok(Array.isArray((await home.data()).items));
    await mini.screenshot({path:path.join(out,'native-home-after-cache.png')});
    checks.push({name:'protected home reloads with real data after compilation and network caches were cleared',passed:true});
  } finally {
    await fs.writeFile(path.join(out,'cache-smoke-report.json'),JSON.stringify({checks},null,2));
    await mini.disconnect();
  }
  console.log('PASS '+checks.length+' native post-cache checks');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
