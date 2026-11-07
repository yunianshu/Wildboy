const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const api=require('../dist/utils/api.js'),legal=require('../dist/utils/legal.js'),shared=require('../dist/pages/admin-editor/shared.js'),profiles=require('../dist/utils/user-profile.js');
let definition,session,signed,calls,nav,actor,target,answer,handler,allowed;
global.Page=d=>{definition=d};
const policy=v=>({ready:true,privacy:{kind:'PRIVACY',version:v,title:'隐私政策',content:'当前正文',publishedAt:'2026-10-30T00:00:00Z'},terms:{kind:'TERMS',version:v,title:'用户协议',content:'当前正文',publishedAt:'2026-10-30T00:00:00Z'}});
const result=items=>({items,page:0,size:20,total:items.length,hasMore:false});
function page(name){const f=require.resolve('../dist/pages/'+name+'/index.js');delete require.cache[f];require(f);return {...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}}}
const event=id=>({currentTarget:{dataset:{id}}}),flush=()=>new Promise(r=>setImmediate(r));
beforeEach(()=>{session=1;signed=true;allowed=true;calls=[];nav=[];answer={confirm:true};
 actor={id:'owner',nickname:'微信用户',role:'USER',accountSource:'WECHAT',wechatVerified:true,version:0,profileCompleted:false,realName:'',phone:''};
 target={id:'target',nickname:'目标用户',role:'USER',accountSource:'WECHAT',wechatVerified:true,version:2,canChangeRole:true,roleChangeBlockReason:null,realName:'张*',phone:'138****0000',profileCompleted:true,createdAt:'2026-10-30T00:00:00Z',profileUpdatedAt:null,registrationCount:1,confirmedRegistrationCount:1,lastRegistrationAt:null};
 api.hasSession=()=>signed;api.sessionVersion=()=>session;api.isSessionCurrent=n=>n===session;api.requireSession=async()=>{};api.getCurrentUser=async()=>({...actor});
 legal.currentLegal=async()=>policy(1);shared.requireAdmin=async()=>{if(!allowed)throw new api.ApiError('无管理权限',403,'FORBIDDEN');return session};
 handler=async(url,method,body)=>{if(url.startsWith('/admin/users?'))return result([{...target}]);if(url.endsWith('/role'))return {...target,role:body.role,version:target.version+1};if(url.startsWith('/admin/users/'))return {user:{...target},registrations:result([])};if(url==='/me/profile')return {...actor,...body,profileCompleted:true};return {ready:true,requiresConsent:false}};
 api.request=async(url,method='GET',body)=>{calls.push({url,method,body});return handler(url,method,body)};
 global.wx={navigateTo:o=>nav.push(o.url),navigateBack(){},switchTab:o=>nav.push(o.url),showModal:async()=>answer,showToast(){}};
});
async function editing(){const p=page('profile');await p.load();p.openEditor();p.setData({draft:{realName:'张三',phone:'13800000000'}});return p}
function registration(){const p=page('register');p.setData({id:'activity',loading:false,activity:{enabled:true,available:3,identityRequired:false},participants:[{participantName:'张三',phone:'13800000000',idNumber:''}],consent:true,legal:policy(1)});return p}

test('activity identity is independent from administrator permission and never requires avatar or nickname',()=>{
 assert.equal(profiles.isActivityUser(actor),true);assert.equal(profiles.isActivityUser({...actor,role:'ADMIN'}),true);
 for(const extra of [{role:'ADMIN',accountSource:'PASSWORD'},{role:'ADMIN',accountSource:'WECHAT',wechatVerified:false},{role:'ADMIN',accountSource:'OTHER'}])assert.equal(profiles.isActivityUser({...actor,...extra}),false);
});
test('contact saving requires explicit consent and exact current versions but does not require document opening',async()=>{
 const p=await editing();assert.equal(p.data.consent,false);await p.save();assert.equal(calls.length,0);
 p.consentChange({detail:{value:['yes']}});await p.save();assert.deepEqual(calls[0],{url:'/me/profile',method:'PUT',body:{realName:'张三',phone:'13800000000',privacyVersion:1,termsVersion:1}});assert.equal(nav.length,0);assert.equal(p.data.user.profileCompleted,true);assert.equal(p.data.consent,false);
});
test('invalid personal name and phone never leave the profile page',async()=>{
 const p=await editing();p.setData({consent:true,draft:{realName:'单',phone:'123'}});await p.save();assert.equal(calls.length,0);assert.match(p.data.fieldError,/姓名/);
 p.setData({draft:{realName:'张三',phone:'123'}});await p.save();assert.equal(calls.length,0);assert.match(p.data.fieldError,/手机号/);
});
test('a verified WeChat administrator can maintain personal activity contact information while password accounts cannot',async()=>{
 actor.role='ADMIN';const p=await editing();assert.equal(p.data.editing,true);p.consentChange({detail:{value:['yes']}});await p.save();assert.equal(p.data.user.role,'ADMIN');
 actor.accountSource='PASSWORD';const q=page('profile');await q.load();q.openEditor();assert.equal(q.data.editing,false);
});
test('changed legal versions preserve the draft and require fresh explicit agreement',async()=>{
 const p=await editing();p.setData({consent:true});legal.currentLegal=async()=>policy(2);await p.save();assert.equal(calls.length,0);assert.equal(p.data.consent,false);assert.equal(p.data.legal.privacy.version,2);assert.equal(p.data.draft.realName,'张三');
});
test('server legal-version failure reloads current policy without losing the contact draft',async()=>{
 const p=await editing();p.setData({consent:true});handler=async()=>{throw new api.ApiError('协议已变化',409,'LEGAL_VERSION_CHANGED')};let reads=0;legal.currentLegal=async()=>policy(++reads===1?1:2);await p.save();assert.equal(p.data.consent,false);assert.equal(p.data.legal.privacy.version,2);assert.equal(p.data.draft.phone,'13800000000');
});
test('optional reader round-trip resumes the same-owner draft unchecked and never restores it into another account',async()=>{
 const p=await editing();p.privacy();p.onHide();assert.equal(p.data.user,null);assert.equal(p.data.draft.realName,'');await p.load();assert.equal(p.data.editing,true);assert.equal(p.data.draft.realName,'张三');assert.equal(p.data.consent,false);
 p.terms();p.onHide();session++;actor.id='new-owner';await p.load();assert.equal(p.data.draft.realName,'');assert.equal(p.data.editing,false);
});
test('a changed account before save and a late save response after hiding cannot retain or submit private drafts',async()=>{
 const p=await editing();p.setData({consent:true});session++;await p.save();assert.equal(calls.length,0);assert.equal(p.data.user,null);assert.equal(p.data.draft.phone,'');
 const q=await editing();q.setData({consent:true});let resolve;handler=()=>new Promise(r=>resolve=r);const pending=q.save();await flush();q.onHide();resolve({...actor,realName:'张三',phone:'13800000000',profileCompleted:true});await pending;assert.equal(q.data.user,null);assert.equal(q.data.draft.phone,'');
});
test('profile prefill updates only an untouched first participant and preserves other people and identity fields',()=>{
 const p=registration();p.setData({participants:[{participantName:'',phone:'',idNumber:'existing-id'},{participantName:'同行人',phone:'13900000000',idNumber:'friend-id'}]});p.applyProfile({...actor,realName:'本人',phone:'13800000000',profileCompleted:true});assert.equal(p.data.participants[0].participantName,'本人');assert.equal(p.data.participants[0].idNumber,'existing-id');assert.equal(p.data.participants[1].participantName,'同行人');
 p.data.participants[0].participantName='手动更改';p.applyProfile({...actor,realName:'新本人',phone:'13700000000',profileCompleted:true});assert.equal(p.data.participants[0].participantName,'手动更改');
});
test('missing own profile blocks registration and routes to explicit contact editing without a registration write',async()=>{
 const p=registration();await p.submit();assert.equal(calls.filter(x=>x.method==='POST').length,0);assert.equal(nav[0],'/pages/profile/index?from=register');assert.equal(p.data.submitting,false);
});
test('user list supports server role/source filters and formats dates before native rendering',async()=>{
 const p=page('admin-users');p.setData({role:'ADMIN',accountSource:'WECHAT',query:'张三'});await p.load();assert.match(calls[0].url,/role=ADMIN&accountSource=WECHAT/);assert.equal(p.data.items[0].roleText,'普通用户');await p.openUser(event('target'));assert.ok(p.data.detail.user.createdText);assert.equal(p.data.detail.user.phone,'138****0000');
});
test('role changes need explicit confirmation and submit the original target id and version once',async()=>{
 const p=page('admin-users');await p.load();answer={confirm:false};await p.changeRole(event('target'));assert.equal(calls.filter(x=>x.method==='PUT').length,0);answer={confirm:true};await p.changeRole(event('target'));assert.deepEqual(calls.find(x=>x.method==='PUT'),{url:'/admin/users/target/role',method:'PUT',body:{role:'ADMIN',version:2}});assert.match(p.data.roleNotice,/重新登录/);assert.equal(actor.role,'USER');
});
test('role denial flags prevent source-ineligible and read-only targets from producing a mutation',async()=>{
 target.canChangeRole=false;target.roleChangeBlockReason='ROLE_MANAGEMENT_FORBIDDEN';const p=page('admin-users');await p.load();await p.changeRole(event('target'));assert.equal(calls.filter(x=>x.method==='PUT').length,0);assert.match(p.data.items[0].blockText,/仅可查看/);
});
test('a role write is deduplicated and its late result cannot refill a hidden user page',async()=>{
 const p=page('admin-users');await p.load();let resolve;const old=handler;handler=(url,m,b)=>m==='PUT'?new Promise(r=>resolve=r):old(url,m,b);const pending=p.changeRole(event('target'));await flush();await p.changeRole(event('target'));assert.equal(calls.filter(x=>x.method==='PUT').length,1);p.onHide();resolve({...target,role:'ADMIN',version:3});await pending;assert.deepEqual(p.data.items,[]);assert.equal(p.data.roleNotice,'');
});
test('a stale role version cannot be retried until an explicit successful state refresh',async()=>{
 const p=page('admin-users');await p.load();const old=handler;handler=(url,m,b)=>m==='PUT'?Promise.reject(new api.ApiError('状态已变化',409,'STALE_VERSION')):old(url,m,b);await p.changeRole(event('target'));await p.changeRole(event('target'));assert.equal(calls.filter(x=>x.method==='PUT').length,1);assert.equal(p.data.roleRecoveryNeeded,true);target.version=3;p.refresh();await flush();assert.equal(p.data.roleRecoveryNeeded,false);assert.equal(p.data.items[0].version,3);
});
test('a known read-only role-management actor keeps viewing rights without enabling further role actions',async()=>{
 const p=page('admin-users');await p.load();const old=handler;handler=(url,m,b)=>m==='PUT'?Promise.reject(new api.ApiError('请使用正式管理员账号管理权限',403,'ROLE_MANAGEMENT_FORBIDDEN')):old(url,m,b);await p.changeRole(event('target'));assert.equal(p.data.authorized,true);assert.equal(p.data.items.length,1);assert.equal(p.data.roleReadOnly,true);await p.changeRole(event('target'));assert.equal(calls.filter(x=>x.method==='PUT').length,1);
});
test('revocation clears search and detail drafts and invalidates a separate earlier list response',async()=>{
 const p=page('admin-users');await p.load();let resolve;handler=url=>url.startsWith('/admin/users?')?new Promise(r=>resolve=r):Promise.reject(new api.ApiError('已撤销管理权限',403,'FORBIDDEN'));
 p.setData({query:'13800000000',queryDraft:'私有搜索',filterOpen:true});const pending=p.load();await flush();await p.openUser(event('target'));assert.equal(p.data.authorized,false);assert.equal(p.data.query,'');assert.equal(p.data.queryDraft,'');resolve(result([target]));await pending;assert.deepEqual(p.data.items,[]);assert.equal(p.data.detail,null);assert.equal(p.data.detailId,'');
});
test('My uses the fresh server role even when password login capability is false and clears management access after expiration',async()=>{
 actor.role='ADMIN';const p=page('mine');await p.load();assert.equal(p.data.adminLoginEnabled,false);p.userManage();assert.equal(nav.at(-1),'/pages/admin-users/index');assert.equal(p.data.activityUser,true);
 signed=false;await p.load();const count=nav.length;p.userManage();assert.equal(nav.length,count);assert.equal(p.data.user,null);
});
test('verified WeChat administrators can submit a normal group and identity-free activities send no ID',async()=>{
 actor={...actor,role:'ADMIN',profileCompleted:true,realName:'张三',phone:'13800000000'};const p=registration();p.data.participants[0].idNumber='unused-id';handler=async(url,m,b)=>({id:'registration',activityId:'activity',status:'CONFIRMED',participants:b.participants});global.wx.redirectTo=o=>nav.push(o.url);await p.submit();const write=calls.find(x=>x.method==='POST');assert.ok(write);assert.equal(write.body.participants[0].idNumber,'');assert.equal(p.data.success,true);
});
test('revocation sends the exact current role version and keeps the actor identity unchanged',async()=>{
 target.role='ADMIN';const p=page('admin-users');await p.load();await p.changeRole(event('target'));assert.deepEqual(calls.find(x=>x.method==='PUT').body,{role:'USER',version:2});assert.equal(actor.id,'owner');
});
test('an ordinary actor cannot read the administrative user endpoint',async()=>{
 allowed=false;const p=page('admin-users');await p.load();assert.equal(p.data.authorized,false);assert.deepEqual(p.data.items,[]);assert.equal(calls.length,0);
});
test('session revocation during a role change clears private data and does not retain an enabled action',async()=>{
 const p=page('admin-users');await p.load();const old=handler;handler=(url,m,b)=>{if(m==='PUT'){session++;signed=false;throw new api.ApiError('登录已失效',401,'UNAUTHENTICATED')}return old(url,m,b)};await p.changeRole(event('target'));assert.equal(p.data.authorized,false);assert.deepEqual(p.data.items,[]);assert.equal(p.data.roleBusyId,'');assert.equal(p.data.detail,null);
});
test('a late participant-removal confirmation cannot alter another account or a replacement participant group',async()=>{
 const p=registration(),friend={participantName:'同行人',phone:'13900000000',idNumber:''};p.setData({participants:[...p.data.participants,friend]});let resolve;wx.showModal=()=>new Promise(r=>resolve=r);const pending=p.removeParticipant({currentTarget:{dataset:{index:1}}});session++;p.setData({participants:[{participantName:'新账号',phone:'13700000000',idNumber:''},friend]});resolve({confirm:true});await pending;assert.equal(p.data.participants.length,2);assert.equal(p.data.participants[0].participantName,'新账号');
});
test('profile policy rejection plus a failed immediate reload has an independent retry that preserves the draft unchecked',async()=>{
 for(const code of ['LEGAL_VERSION_CHANGED','LEGAL_NOT_READY']){
  legal.currentLegal=async()=>policy(1);const p=await editing();p.setData({consent:true});handler=async()=>{throw new api.ApiError('当前协议需重取',409,code)};
  let reads=0;legal.currentLegal=async()=>{if(++reads===1)return policy(1);throw Error('协议读取暂时失败')};
  await p.save();assert.equal(p.data.editing,true);assert.equal(p.data.draft.realName,'张三');assert.equal(p.data.draft.phone,'13800000000');assert.equal(p.data.legal,null);assert.equal(p.data.legalLoading,false);assert.match(p.data.legalError,/读取暂时失败/);assert.equal(p.data.consent,false);
  const writes=calls.filter(x=>x.method==='PUT').length;legal.currentLegal=async()=>policy(2);await p.retryLegal();
  assert.equal(p.data.legal.privacy.version,2);assert.equal(p.data.legalError,'');assert.equal(p.data.legalLoading,false);assert.equal(p.data.draft.realName,'张三');assert.equal(p.data.consent,false);assert.equal(calls.filter(x=>x.method==='PUT').length,writes);
  handler=async(_url,_method,body)=>({...actor,...body,profileCompleted:true});p.consentChange({detail:{value:['yes']}});await p.save();assert.equal(p.data.editing,false);assert.equal(calls.at(-1).body.privacyVersion,2);
 }
});
test('independent profile policy retries deduplicate, block queued agreement and preserve typing during recovery',async()=>{
 const p=await editing();p.setData({legal:null,consent:false});let resolve,reads=0;legal.currentLegal=()=>{reads++;return new Promise(r=>resolve=r)};
 const first=p.retryLegal();assert.equal(p.retryLegal(),first);await flush();assert.equal(reads,1);assert.equal(p.data.legalLoading,true);
 p.consentChange({detail:{value:['yes']}});assert.equal(p.data.consent,false);await p.save();assert.equal(calls.length,0);
 p.input({currentTarget:{dataset:{field:'phone'}},detail:{value:'13900000000'}});resolve(policy(3));await first;
 assert.equal(p.data.draft.phone,'13900000000');assert.equal(p.data.legal.terms.version,3);assert.equal(p.data.consent,false);assert.equal(p.data.legalLoading,false);
});
test('late profile policy recovery cannot refill a closed, hidden or changed-account editor',async()=>{
 for(const leave of ['cancel','onHide','session']){
  legal.currentLegal=async()=>policy(1);const p=await editing();p.setData({legal:null,consent:false});let resolve;legal.currentLegal=()=>new Promise(r=>resolve=r);const pending=p.retryLegal();await flush();
  if(leave==='session')session++;else p[leave]();resolve(policy(9));await pending;
  assert.equal(p.data.legal,null,leave);assert.equal(p.data.legalLoading,false,leave);assert.equal(p.data.editing,false,leave);assert.equal(p.data.consent,false,leave);assert.equal(p.data.draft.phone,'',leave);
 }
});
test('an old policy retry cannot overwrite a newly opened same-owner profile editor',async()=>{
 const p=await editing();p.setData({legal:null});let resolve;legal.currentLegal=()=>new Promise(r=>resolve=r);const pending=p.retryLegal();await flush();p.cancel();
 legal.currentLegal=async()=>policy(4);await p.load();p.openEditor();p.setData({draft:{realName:'重新编辑',phone:'13700000000'}});resolve(policy(9));await pending;
 assert.equal(p.data.legal.privacy.version,4);assert.equal(p.data.draft.realName,'重新编辑');assert.equal(p.data.consent,false);assert.equal(p.data.editing,true);
});
