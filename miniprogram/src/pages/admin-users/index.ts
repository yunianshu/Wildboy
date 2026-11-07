import { enterPage } from "../../utils/page-motion";
import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { AdminUser, AdminUserDetail, PageResult, RegistrationStatus } from "../../utils/models";
import { dateLabel, mergeUnique, message, safeId } from "../../utils/domain";
import { requireAdmin } from "../admin-editor/shared";

type UserRow = AdminUser & { roleText: string; sourceText: string; blockText: string; createdText: string; profileUpdatedText: string };
type Detail = Omit<AdminUserDetail, "user" | "registrations"> & { user: UserRow; registrations: Omit<AdminUserDetail["registrations"], "items"> & { items: (AdminUserDetail["registrations"]["items"][number] & { createdText: string })[] } };
const reasons: Record<string,string> = { SELF_ROLE_CHANGE_FORBIDDEN: "不能修改自己的管理员权限", ROLE_TARGET_NOT_ELIGIBLE: "仅已验证的微信账号可调整权限", LAST_ADMIN_REQUIRED: "至少保留一位管理员", ROLE_MANAGEMENT_FORBIDDEN: "当前管理员仅可查看，请使用正式管理员账号调整权限" };
function row(user: AdminUser): UserRow {
  return { ...user, canChangeRole: user.canChangeRole === true && user.accountSource === "WECHAT" && user.wechatVerified === true && ["USER","ADMIN"].includes(user.role) && Number.isInteger(user.version) && user.version >= 0,
    roleText: user.role === "ADMIN" ? "管理员" : "普通用户", sourceText: ({WECHAT:"微信账号",PASSWORD:"密码管理账号",DEMO:"演示账号",OTHER:"其他账号"})[user.accountSource] || "来源待核对",
    blockText: user.canChangeRole ? "" : reasons[user.roleChangeBlockReason || ""] || "当前账号不可调整此用户权限", createdText: dateLabel(user.createdAt), profileUpdatedText: user.profileUpdatedAt ? dateLabel(user.profileUpdatedAt) : "尚未完善" };
}
function detailView(value: AdminUserDetail): Detail { return { ...value, user: row(value.user), registrations: { ...value.registrations, items: value.registrations.items.map(r=>({...r,createdText:dateLabel(r.createdAt)})) } }; }
Page({
  epoch:0, detailEpoch:0, roleEpoch:0, session:-1,
  data:{pageMotionClass:"",authorized:false,loading:false,loadingMore:false,error:"",items:[] as UserRow[],page:0,total:0,hasMore:false,
    query:"",profile:"",role:"",accountSource:"",filterOpen:false,queryDraft:"",profileDraft:"",roleDraft:"",sourceDraft:"",
    detailId:"",detail:null as Detail|null,detailLoading:false,detailError:"",detailStatus:"" as RegistrationStatus|"",
    roleBusyId:"",roleError:"",roleNotice:"",roleRecoveryNeeded:false,roleReadOnly:false },
  onShow(){enterPage(this);void this.load(true);}, onHide(){this.clear();},onUnload(){this.clear();},onReachBottom(){void this.load(false);},
  clear(){this.epoch++;this.detailEpoch++;this.roleEpoch++;this.session=-1;this.setData({authorized:false,items:[],loading:false,loadingMore:false,total:0,hasMore:false,detail:null,detailId:"",detailLoading:false,detailError:"",detailStatus:"",filterOpen:false,query:"",profile:"",role:"",accountSource:"",queryDraft:"",profileDraft:"",roleDraft:"",sourceDraft:"",roleBusyId:"",roleError:"",roleNotice:"",roleRecoveryNeeded:false,roleReadOnly:false});},
  fail(error:unknown){const denied=!isSessionCurrent(this.session)||(error instanceof ApiError&&[401,403].includes(error.status));if(denied)this.clear();this.setData({error:message(error)});},
  async load(reset=true){if(this.data.roleBusyId||(!reset&&(this.data.loading||this.data.loadingMore||!this.data.hasMore)))return;
    const n=++this.epoch;this.setData({loading:reset,loadingMore:!reset,error:"",...(reset?{items:[],page:0,total:0,hasMore:false}:{})});
    try{const session=await requireAdmin();if(n!==this.epoch)return;this.session=session;this.setData({authorized:true});
      const p=await request<PageResult<AdminUser>>(`/admin/users?page=${reset?0:this.data.page+1}&size=20&query=${encodeURIComponent(this.data.query)}&profile=${this.data.profile}&role=${this.data.role}&accountSource=${this.data.accountSource}`);
      if(n!==this.epoch||!isSessionCurrent(session))return;const items=p.items.map(row);this.setData({items:reset?items:mergeUnique(this.data.items,items),page:p.page,total:p.total,hasMore:p.hasMore,roleRecoveryNeeded:false});
    }catch(e){if(n===this.epoch)this.fail(e);}finally{if(n===this.epoch)this.setData({loading:false,loadingMore:false});}},
  retry(){void this.load(!this.data.items.length);},refresh(){this.closeUser();void this.load(true);},login(){wx.navigateTo({url:"/pages/admin-login/index"});},
  openFilters(){if(!this.data.authorized||this.data.loading||this.data.loadingMore||this.data.roleBusyId)return;this.setData({filterOpen:true,queryDraft:this.data.query,profileDraft:this.data.profile,roleDraft:this.data.role,sourceDraft:this.data.accountSource});},
  closeFilters(){if(this.data.roleBusyId)return;this.setData({filterOpen:false,queryDraft:"",profileDraft:"",roleDraft:"",sourceDraft:""});},
  filterInput(e:WechatMiniprogram.Input){if(this.data.filterOpen&&!this.data.roleBusyId)this.setData({queryDraft:e.detail.value});},
  profileChange(e:WechatMiniprogram.PickerChange){const v=["","COMPLETE","INCOMPLETE"][Number(e.detail.value)];if(v!==undefined&&this.data.filterOpen)this.setData({profileDraft:v});},
  roleFilterChange(e:WechatMiniprogram.PickerChange){const v=["","USER","ADMIN"][Number(e.detail.value)];if(v!==undefined&&this.data.filterOpen)this.setData({roleDraft:v});},
  sourceChange(e:WechatMiniprogram.PickerChange){const v=["","WECHAT","PASSWORD","DEMO","OTHER"][Number(e.detail.value)];if(v!==undefined&&this.data.filterOpen)this.setData({sourceDraft:v});},
  applyFilters(){if(!this.data.authorized||!this.data.filterOpen||this.data.roleBusyId)return;this.setData({query:this.data.queryDraft.trim(),profile:this.data.profileDraft,role:this.data.roleDraft,accountSource:this.data.sourceDraft,filterOpen:false});void this.load(true);},
  resetFilters(){if(this.data.filterOpen)this.setData({queryDraft:"",profileDraft:"",roleDraft:"",sourceDraft:""});},
  async openUser(e:WechatMiniprogram.TouchEvent){const id=safeId(e.currentTarget.dataset.id);if(!id||!this.data.authorized||this.data.detailLoading||this.data.roleBusyId)return;this.setData({detailId:id,detail:null,detailStatus:"",detailError:""});await this.loadDetail();},
  closeUser(){if(this.data.roleBusyId)return;this.detailEpoch++;this.setData({detailId:"",detail:null,detailLoading:false,detailError:""});},stopModalEvent(){},
  detailStatusChange(e:WechatMiniprogram.PickerChange){const status=(["","CONFIRMED","CANCELLED"] as const)[Number(e.detail.value)];if(status===undefined||this.data.detailLoading||this.data.roleBusyId)return;this.setData({detailStatus:status});void this.loadDetail();},
  async loadDetail(next=0){const id=this.data.detailId;if(!id||this.data.detailLoading||this.data.roleBusyId||!Number.isInteger(next)||next<0||!isSessionCurrent(this.session))return;const n=++this.detailEpoch;this.setData({detailLoading:true,detailError:""});
    try{const session=await requireAdmin();if(n!==this.detailEpoch)return;this.session=session;const d=await request<AdminUserDetail>(`/admin/users/${id}?page=${next}&size=20&status=${this.data.detailStatus}`);if(n!==this.detailEpoch||!isSessionCurrent(session)||this.data.detailId!==id)return;if(d.user.id!==id)throw Error("用户详情未确认，请重新读取");this.setData({detail:detailView(d)});
    }catch(e){if(n===this.detailEpoch){this.setData({detailError:message(e)});this.fail(e);}}finally{if(n===this.detailEpoch)this.setData({detailLoading:false});}},
  retryDetail(){void this.loadDetail(this.data.detail?.registrations.page||0);},previousDetail(){if(this.data.detail&&this.data.detail.registrations.page>0)void this.loadDetail(this.data.detail.registrations.page-1);},nextDetail(){if(this.data.detail?.registrations.hasMore)void this.loadDetail(this.data.detail.registrations.page+1);},
  async changeRole(e:WechatMiniprogram.TouchEvent){const id=safeId(e.currentTarget.dataset.id),user=this.data.items.find(x=>x.id===id)||this.data.detail?.user;
    if(!user||user.id!==id||!user.canChangeRole||!this.data.authorized||this.data.loading||this.data.loadingMore||this.data.detailLoading||this.data.roleBusyId||this.data.roleRecoveryNeeded||this.data.roleReadOnly||!isSessionCurrent(this.session))return;
    const n=++this.roleEpoch,session=this.session,target=user.role==="ADMIN"?"USER":"ADMIN";this.setData({roleBusyId:id,roleError:"",roleNotice:""});
    try{const answer=await wx.showModal({title:target==="ADMIN"?"授予管理员权限？":"撤销管理员权限？",content:`${user.nickname}（${id}）。${target==="ADMIN"?"此账号将可管理活动、商品、订单和用户。":"此账号将失去管理权限。"} 资料和报名历史保留，目标需重新微信登录。`,confirmText:target==="ADMIN"?"确认授予":"确认撤销"});
      if(!answer.confirm||n!==this.roleEpoch||!isSessionCurrent(session))return;await requireAdmin();if(n!==this.roleEpoch||!isSessionCurrent(session))return;
      const result=await request<AdminUser>(`/admin/users/${id}/role`,"PUT",{role:target,version:user.version});if(n!==this.roleEpoch||!isSessionCurrent(session))return;
      if(result.id!==id||result.role!==target||!Number.isInteger(result.version)||result.version<=user.version)throw Error("权限变更结果未确认，请刷新用户后核对");
      const updated=row(result);this.setData({items:this.data.items.map(x=>x.id===id?updated:x),...(this.data.detail?.user.id===id?{detail:{...this.data.detail,user:updated}}:{}),roleNotice:"权限已更新。该微信用户需重新登录，资料和报名历史保留。",roleBusyId:""});await this.load(true);
    }catch(error){if(n!==this.roleEpoch)return;if(error instanceof ApiError&&error.code==="ROLE_MANAGEMENT_FORBIDDEN"){this.setData({roleReadOnly:true,roleError:message(error)});}else if(error instanceof ApiError&&[401,403].includes(error.status)){this.fail(error);}else{this.setData({roleError:message(error),roleRecoveryNeeded:true});}}
    finally{if(n===this.roleEpoch)this.setData({roleBusyId:""});}},
  roster(e:WechatMiniprogram.TouchEvent){const id=safeId(e.currentTarget.dataset.id);if(id&&this.data.authorized&&!this.data.roleBusyId&&isSessionCurrent(this.session))wx.navigateTo({url:`/pages/admin-roster/index?id=${id}`});},
});
