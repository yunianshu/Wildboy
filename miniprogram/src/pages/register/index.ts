import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";
import { request, requireSession, getCurrentUser, hasSession, ApiError, sessionVersion, isSessionCurrent } from "../../utils/api";
import {
  Activity,
  ParticipantInput,
  Registration,
} from "../../utils/models";
import {
  activityView,
  message,
  safeId,
  validateParticipants,
  RequestEpoch,
} from "../../utils/domain";
import { ActivityQuote, ActivityOrder, validActivityQuote, priceLines, activityIntent, pendingActivityIntent, finishActivityIntent } from "../../utils/activity-orders";
import { money } from "../../utils/shop";
const quoteEpoch = new RequestEpoch();
const epoch = new RequestEpoch();
const emptyParticipant = (): ParticipantInput => ({
  participantName: "", idNumber: "", phone: "",
});
Page({
  _reloadOnShow: false,
  data: {
    id: "",
    quote: null as ActivityQuote | null,
    quoteSession: -1,
    quoteLoading: false,
    quoteError: "",
    quoteTotal: "",
    quoteOriginal: "",
    quoteLines: [] as ReturnType<typeof priceLines>,
    session: -1,
    waitlistMode: false,
    activity: null as ReturnType<typeof activityView> | null,
    loading: true,
    error: "",
    participants: [
      { participantName: "", idNumber: "", phone: "" },
    ] as ParticipantInput[],
    participantModalOpen: false,
    participantDraft: emptyParticipant(),
    participantError: "",
    consent: false,
    legal: null as LegalCurrent | null,
    legalError: "",
    privacyRead: false,
    termsRead: false,
    submitting: false,
    success: false,
    fieldError: "",
  },
  onLoad(o) {
    const id = safeId(o.id);
    this.setData({ id, session: sessionVersion(), waitlistMode: o.waitlist === "1" });
    if (id) void this.load();
    else this.setData({ error: "活动链接无效", loading: false });
  },
  onShow() {
    if (this.data.session !== -1 && this.data.session !== sessionVersion())
      this.resetPrivateForm();
    this.setData({ session: sessionVersion() });
    if(this.data.activity?.priceCents) void this.refreshQuote();
    if (this._reloadOnShow && this.data.id) {
      this._reloadOnShow = false;
      void this.load();
    }
  },
  resetPrivateForm() {
    this.cancelParticipant();
    this.setData({
      session: sessionVersion(),
      participants: [emptyParticipant()],
      quote: null, quoteSession: -1, quoteTotal: "", quoteOriginal: "", quoteLines: [],
      consent: false,
      privacyRead: false,
      termsRead: false,
      submitting: false,
      success: false,
      fieldError: "账号已改变，请重新填写报名信息",
    });
  },
  onHide() {
    this._reloadOnShow = this.data.loading;
    epoch.invalidate();
    quoteEpoch.invalidate();
    this.setData({quote:null,quoteSession:-1,quoteTotal:"",quoteOriginal:"",quoteLines:[],quoteLoading:false});
    this.cancelParticipant();
    this.setData({ submitting: false });
  },
  onUnload() {
    epoch.invalidate();
    quoteEpoch.invalidate();
    this.setData({quote:null,quoteSession:-1,quoteTotal:"",quoteOriginal:"",quoteLines:[],quoteLoading:false});
    this.cancelParticipant();
  },
  async load() {
    const n = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (!epoch.valid(n)) return;
      this.setData({ activity: activityView(a), ...(a.priceCents > 0 ? {waitlistMode:false} : {}) });
      if(a.priceCents > 0 && hasSession()) {
        const session = sessionVersion(), user = await getCurrentUser();
        if(!epoch.valid(n) || !isSessionCurrent(session)) return;
        const key = pendingActivityIntent(user.id,this.data.id);
        if(key) {
          try {
            const existing = await request<ActivityOrder>(`/activity-orders/by-request/${key}`);
            if(!epoch.valid(n) || !isSessionCurrent(session)) return;
            this.openPaidOrder(existing,user.id,key); return;
          } catch(e) { if(!(e instanceof ApiError && e.status===404)) throw e; }
        }
      }
      try {
        const legal = await currentLegal();
        if (epoch.valid(n))
          this.setData({
            legal,
            legalError: "",
            consent: false,
            privacyRead: false,
            termsRead: false,
          });
        if(epoch.valid(n) && a.priceCents>0) await this.refreshQuote();
      } catch (e) {
        if (epoch.valid(n))
          this.setData({ legal: null, legalError: message(e), consent: false });
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  async refreshQuote() {
    const n=quoteEpoch.next(),session=sessionVersion(),count=this.data.participants.length;
    this.setData({quote:null,quoteSession:-1,quoteLoading:false,quoteError:"",quoteTotal:"",quoteOriginal:"",quoteLines:[]});
    if(!this.data.activity?.priceCents) return;
    if(!hasSession()){this.setData({quoteError:"登录后确认会员优惠及报名费用"});return;}
    this.setData({quoteLoading:true});
    try {
      const quote=await request<ActivityQuote>(`/activities/${this.data.id}/quote?participants=${count}`);
      if(!validActivityQuote(quote,count)) throw new Error("费用报价异常，请重新获取");
      if(quoteEpoch.valid(n)&&isSessionCurrent(session)&&count===this.data.participants.length) this.setData({quote,quoteSession:session,quoteTotal:money(quote.totalCents),quoteOriginal:money(quote.originalTotalCents),quoteLines:priceLines(quote.quote)});
    } catch(e){if(quoteEpoch.valid(n)&&isSessionCurrent(session))this.setData({quoteError:message(e)});}
    finally{if(quoteEpoch.valid(n))this.setData({quoteLoading:false});}
  },
  login(){wx.navigateTo({url:"/pages/login/index"});},
  openPaidOrder(order:ActivityOrder,userId:string,key:string){
    if(!order?.id || order.activityId!==this.data.id) throw new Error("订单结果未确认，请到活动订单核对");
    finishActivityIntent(userId,this.data.id,key);
    this.setData({participants:[emptyParticipant()],consent:false});
    wx.redirectTo({url:`/pages/activity-orders/index?id=${encodeURIComponent(order.id)}`});
  },
  retry() {
    void this.load();
  },
  inputParticipant(e: WechatMiniprogram.Input) {
    if (this.data.submitting || this.data.success || this.data.participantModalOpen) return;
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    if (
      !Number.isInteger(index) ||
      !this.data.participants[index] ||
      !["participantName", "idNumber", "phone"].includes(field)
    )
      return;
    this.setData({
      [`participants[${index}].${field}`]: e.detail.value,
      fieldError: "",
    });
  },
  addParticipant() {
    if (this.data.submitting || this.data.success || this.data.participantModalOpen) return;
    if (this.data.participants.length >= (this.data.waitlistMode ? Math.min(100,this.data.activity?.capacity || 0) : this.data.activity?.available || 0)) {
      this.setData({ fieldError: "添加人数不能超过当前剩余名额" });
      return;
    }
    this.setData({
      participantModalOpen: true,
      participantDraft: emptyParticipant(),
      participantError: "",
      fieldError: "",
    });
  },
  inputParticipantDraft(e: WechatMiniprogram.Input) {
    if (!this.data.participantModalOpen || this.data.submitting) return;
    const field = e.currentTarget.dataset.field;
    if (!["participantName", "idNumber", "phone"].includes(field)) return;
    this.setData({
      participantDraft: { ...this.data.participantDraft, [field]: e.detail.value },
      participantError: "",
    });
  },
  cancelParticipant() {
    this.setData({
      participantModalOpen: false,
      participantDraft: emptyParticipant(),
      participantError: "",
    });
  },
  stopModalEvent() {},
  confirmParticipant() {
    if (!this.data.participantModalOpen || this.data.submitting || this.data.success) return;
    const participant = {
      participantName: this.data.participantDraft.participantName.trim(),
      idNumber: this.data.activity?.identityRequired
        ? this.data.participantDraft.idNumber.trim().toUpperCase() : "",
      phone: this.data.participantDraft.phone.trim(),
    };
    const error = validateParticipants([participant], true, !!this.data.activity?.identityRequired);
    if (error) {
      this.setData({ participantError: error.replace("第 1 位参与人", "报名人") });
      return;
    }
    if (participant.idNumber && this.data.participants.some(
      (p) => p.idNumber.trim().toUpperCase() === participant.idNumber,
    )) {
      this.setData({ participantError: "该身份证号已在报名名单中" });
      return;
    }
    if (!(this.data.waitlistMode ? this.data.activity?.canCancel : this.data.activity?.enabled) || this.data.participants.length >= (this.data.waitlistMode ? Math.min(100,this.data.activity?.capacity || 0) : this.data.activity!.available)) {
      this.setData({ participantError: "当前剩余名额不足，请返回刷新" });
      return;
    }
    this.setData({
      participants: [...this.data.participants, participant],
      fieldError: "",
    });
    this.cancelParticipant();
    if(this.data.activity?.priceCents) void this.refreshQuote();
  },
  removeParticipant(e: WechatMiniprogram.TouchEvent) {
    if (this.data.submitting || this.data.success || this.data.participantModalOpen) return;
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.participants.length <= 1 || !this.data.participants[index])
      return;
    this.setData({
      participants: this.data.participants.filter(
        (_, participantIndex) => participantIndex !== index,
      ),
      fieldError: "",
    });
    if(this.data.activity?.priceCents) void this.refreshQuote();
  },
  consentChange(e: WechatMiniprogram.CheckboxGroupChange) {
    const wants = e.detail.value.includes("yes");
    if (wants && (!this.data.privacyRead || !this.data.termsRead)) {
      this.setData({
        consent: false,
        fieldError: "请先阅读隐私政策和用户协议",
      });
      return;
    }
    this.setData({ consent: wants, fieldError: "" });
  },
  privacy() {
    this.openDocument("PRIVACY");
  },
  terms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.legal) return;
    const expected =
      kind === "PRIVACY"
        ? this.data.legal.privacy?.version
        : this.data.legal.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.legal),
      events: {
        legalDocumentLoaded: (document: { kind: string; version: number }) => {
          const current =
            kind === "PRIVACY"
              ? this.data.legal?.privacy?.version
              : this.data.legal?.terms?.version;
          if (
            document.kind === kind &&
            document.version === expected &&
            current === expected
          )
            this.setData({
              [kind === "PRIVACY" ? "privacyRead" : "termsRead"]: true,
            });
        },
      },
    });
  },
  async submit() {
    if (this.data.submitting || this.data.success || this.data.participantModalOpen) return;
    const fieldError = validateParticipants(
      this.data.participants,
      this.data.consent,
      !!this.data.activity?.identityRequired,
    );
    if (fieldError) {
      this.setData({ fieldError });
      return;
    }
    if (!(this.data.waitlistMode ? this.data.activity?.canCancel : this.data.activity?.enabled)) {
      this.setData({ fieldError: "当前活动不可报名，请返回刷新" });
      return;
    }
    if (!this.data.waitlistMode && this.data.participants.length > this.data.activity!.available) {
      this.setData({ fieldError: "报名人数超过剩余名额，请减少参与人" });
      return;
    }
    if (!this.data.legal || !this.data.privacyRead || !this.data.termsRead) {
      this.setData({
        fieldError: this.data.legalError || "请阅读当前隐私政策和用户协议",
      });
      return;
    }
    if(this.data.activity?.priceCents && (!this.data.quote || this.data.quoteLoading || !isSessionCurrent(this.data.quoteSession) || this.data.quote.participants!==this.data.participants.length)){this.setData({fieldError:"请先获取当前账号的费用并确认"});return;}
    this.setData({ submitting: true, fieldError: "" });
    const n = epoch.next();
    const session = sessionVersion();
    try {
      await requireSession();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      const versions = versionsOf(this.data.legal!);
      const latest = await currentLegal();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({
          legal: latest,
          consent: false,
          privacyRead: false,
          termsRead: false,
        });
        throw new Error("协议版本已更新，请重新阅读并确认");
      }
      const participants = this.data.participants.map((participant) => ({
        participantName: participant.participantName.trim(),
        idNumber: this.data.activity?.identityRequired ? participant.idNumber.trim().toUpperCase() : "",
        phone: participant.phone.trim(),
      }));
      if(this.data.activity?.priceCents) {
        const expectedTotalCents=this.data.quote!.totalCents, user=await getCurrentUser();
        if(!epoch.valid(n)||!isSessionCurrent(session))return;
        const key=activityIntent(user.id,this.data.id);
        try {
          const existing=await request<ActivityOrder>(`/activity-orders/by-request/${key}`);
          if(epoch.valid(n)&&isSessionCurrent(session))this.openPaidOrder(existing,user.id,key);
          return;
        } catch(e){if(!(e instanceof ApiError&&e.status===404))throw e;}
        if(!epoch.valid(n)||!isSessionCurrent(session))return;
        const order=await request<ActivityOrder>(`/activities/${this.data.id}/orders`,"POST",{requestKey:key,registration:{participants,...versions},expectedTotalCents});
        if(epoch.valid(n)&&isSessionCurrent(session))this.openPaidOrder(order,user.id,key);
        return;
      }
      if (this.data.waitlistMode) {
        const result = await request<{id:string;activityId:string;status:string}>(`/activities/${this.data.id}/waitlist`, "POST", {participants,...versions});
        if (!result?.id || result.activityId !== this.data.id || !["WAITING","OFFERED"].includes(result.status)) throw new Error("候补结果未确认，请到我的候补核对");
        if(epoch.valid(n) && isSessionCurrent(session)){this.setData({participants:[{participantName:"",idNumber:"",phone:""}]});wx.redirectTo({url:"/pages/waitlist/index"});}
        return;
      }
      const result = await request<Registration>(
        `/activities/${this.data.id}/registrations`,
        "POST",
        { participants, ...versions },
      );
      if (
        !result ||
        !safeId(result.id) ||
        result.activityId !== this.data.id ||
        result.status !== "CONFIRMED" ||
        !Array.isArray(result.participants) ||
        result.participants.length !== participants.length
      )
        throw new Error("报名结果未确认，请到我的报名核对，勿重复提交");
      if (epoch.valid(n) && isSessionCurrent(session)) {
        this.setData({
          success: true,
          participants: [{ participantName: "", idNumber: "", phone: "" }],
        });
        wx.redirectTo({
          url: `/pages/signup-success/index?id=${this.data.id}&registrationId=${result.id}`,
        });
      }
    } catch (e) {
      if (epoch.valid(n) && isSessionCurrent(session)) {
        if(e instanceof ApiError && ["PRICE_CHANGED","ACTIVITY_PRICE_CHANGED"].includes(e.code)) {
          await this.refreshQuote();
          if(epoch.valid(n)&&isSessionCurrent(session))this.setData({fieldError:"费用已变化，请核对最新费用后重新提交"});
          return;
        }
        if (
          e instanceof ApiError &&
          ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(e.code)
        ) {
          this.setData({
            consent: false,
            privacyRead: false,
            termsRead: false,
            legal: null,
            legalError: "协议已变化，请重新加载页面阅读",
          });
        }
        this.setData({ fieldError: message(e) });
      }
    } finally {
      if (epoch.valid(n)) {
        if (!isSessionCurrent(session)) this.resetPrivateForm();
        else this.setData({ submitting: false });
      }
    }
  },
  joinWaitlist() { if(!this.data.submitting && this.data.activity?.priceCents === 0 && this.data.activity?.canCancel) this.setData({waitlistMode:true,fieldError:""}); },
  done() {
    wx.redirectTo({ url: `/pages/detail/index?id=${this.data.id}` });
  },
  paidOrders() {wx.navigateTo({url:"/pages/activity-orders/index"});},
  myActivities() {
    wx.navigateTo({ url: "/pages/registrations/index" });
  },
});
