const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {connectWeChat}=require('./wechat-session.cjs');
process.env.WILDBOY_LOCAL_API='http://127.0.0.1:19082';process.env.WILDBOY_WECHAT_PORT='9423';
const out=path.resolve(__dirname,'../../test-results/ui-citrus-2026-11-17');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function settled(m,name){for(let i=0;i<60;i++){const p=await m.currentPage();if(p?.path===`pages/${name}/index`){const d=await p.data();if(!d.loading&&!d.busy&&!d.legalLoading)return p}await delay(150)}throw Error('Unsettled '+name)}
(async()=>{
 await fs.mkdir(out,{recursive:true});const results=[],m=await connectWeChat();
 try{
  const legal=await(await fetch(process.env.WILDBOY_LOCAL_API+'/api/v1/legal/current')).json();
  await m.evaluate(v=>{const a=require('utils/api.js');a.logout();return a.login(v).then(()=>true)},{privacyVersion:legal.privacy.version,termsVersion:legal.terms.version});
  await m.reLaunch('/pages/profile/index');let p=await settled(m,'profile');const before=JSON.stringify((await p.data()).user);
  await p.callMethod('openEditor');await delay(300);let shell=await p.$('ui-dialog');assert.ok(shell,'shared profile dialog');
  const panel=await shell.$('.ui-dialog-panel');assert.ok(panel);const bounds=await panel.size();assert.ok(bounds.width<=390&&bounds.height<=760);
  await m.screenshot({path:path.join(out,'dialog-profile.png')});
  await p.callMethod('input',{currentTarget:{dataset:{field:'realName'}},detail:{value:'未保存的测试输入'}});
  await p.setData({saving:true});await shell.callMethod('close');assert.equal((await p.data()).editing,true);
  await p.setData({saving:false});await shell.callMethod('close');assert.equal((await p.data()).editing,false);assert.equal(JSON.stringify((await p.data()).user),before);
  results.push({name:'profile shared dialog, busy close lock and cancelled draft',passed:true,bounds});
  const data=await(await fetch(process.env.WILDBOY_LOCAL_API+'/api/v1/activities?size=30')).json();const activity=data.items.find(x=>x.status==='PUBLISHED'&&x.capacity>x.registeredCount)||data.items[0];
  await m.reLaunch('/pages/register/index?id='+activity.id);p=await settled(m,'register');const count=(await p.data()).participants.length;
  await p.callMethod('addParticipant');await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);
  await p.callMethod('confirmParticipant');assert.ok((await p.data()).participantError);assert.equal((await p.data()).participants.length,count);
  await m.screenshot({path:path.join(out,'dialog-participant-validation.png')});
  await shell.callMethod('close');assert.equal((await p.data()).participantModalOpen,false);assert.equal((await p.data()).participants.length,count);
  results.push({name:'participant validation preserves records and close cancels isolated draft',passed:true});
  await m.reLaunch('/pages/orders/index');p=await settled(m,'orders');await p.setData({refundOrderId:'ui-only-refund-fixture',refundRecord:null,refundReason:''});await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);
  await p.callMethod('requestRefund');assert.ok((await p.data()).refundError);await m.screenshot({path:path.join(out,'dialog-refund-validation.png')});await shell.callMethod('close');assert.equal((await p.data()).refundOrderId,'');
  results.push({name:'refund dialog validates an empty reason and clears the cancelled draft',passed:true,fixture:'UI-only refund state; validation stops before a request, no refund submitted'});
  await m.evaluate(()=>{const a=require('utils/api.js');a.logout();return a.adminLogin('smoke-admin','smoke-only-password-123!').then(()=>true)});
  await m.reLaunch('/pages/admin-users/index');p=await settled(m,'admin-users');await p.callMethod('openFilters');await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);
  await m.screenshot({path:path.join(out,'dialog-user-filter.png')});await shell.callMethod('close');assert.equal((await p.data()).filterOpen,false);
  results.push({name:'admin user filters use shared shell and close correctly',passed:true});
  const users=(await p.data()).items;if(users.length){await p.callMethod('openUser',{currentTarget:{dataset:{id:users[0].id}}});await delay(800);shell=await p.$('ui-dialog');assert.ok(shell);assert.ok((await p.data()).detail);await m.screenshot({path:path.join(out,'dialog-user-detail.png')});await shell.callMethod('close');assert.ok(!(await p.data()).detailId);results.push({name:'admin detail and registration history render in shared dialog',passed:true})}
  await m.reLaunch('/pages/admin-editor/index');p=await settled(m,'admin-editor');await p.setData({confirming:true});await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);await m.screenshot({path:path.join(out,'dialog-publish-confirm.png')});await shell.callMethod('maskTap');assert.equal((await p.data()).confirming,true);await shell.callMethod('close');assert.equal((await p.data()).confirming,false);
  results.push({name:'publication confirmation backdrop does not discard a pending decision',passed:true,fixture:'UI-only confirmation state; no publish performed'});
  await m.reLaunch('/pages/admin-activities/index');p=await settled(m,'admin-activities');const row=(await p.data()).items[0];assert.ok(row);await p.callMethod('change',{currentTarget:{dataset:{id:row.id,action:'cancel'}}});await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);await m.screenshot({path:path.join(out,'dialog-activity-cancel.png')});await shell.callMethod('maskTap');assert.equal((await p.data()).pendingId,row.id);await shell.callMethod('close');assert.equal((await p.data()).pendingId,'');
  results.push({name:'activity cancellation keeps the selected snapshot and close abandons the action',passed:true,fixture:'Real selected QA activity; confirmation cancelled, no cancellation submitted'});
  await m.reLaunch('/pages/admin-activity-orders/index');p=await settled(m,'admin-activity-orders');await p.setData({confirmation:{title:'核对订单状态？',content:'以支付渠道与服务端返回结果为准。',kind:'order',id:'ui-only-order-fixture',action:'verify'}});await delay(200);shell=await p.$('ui-dialog');assert.ok(shell);await m.screenshot({path:path.join(out,'dialog-activity-order-confirm.png')});await shell.callMethod('close');assert.equal((await p.data()).confirmation,null);
  results.push({name:'activity order confirmation uses the common shell and closes without executing',passed:true,fixture:'UI-only confirmation state; no order action submitted'});
  await m.callWxMethod('switchTab',{url:'/pages/home/index'});await settled(m,'home');
 }finally{await fs.writeFile(path.join(out,'native-dialogs-report.json'),JSON.stringify({results},null,2));await m.disconnect()}
 console.log('PASS '+results.length+' native dialog checks');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
