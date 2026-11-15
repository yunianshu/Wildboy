import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";
import {
  request,
  requireSession,
  hasSession,
  getCurrentUser,
  ApiError,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
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
import { isActivityUser } from "../../utils/user-profile";
import { User } from "../../utils/models";
import {
  ActivityOrder,
  ActivityQuote,
  activityIntent,
  pendingActivityIntent,
  finishActivityIntent,
  validActivityQuote,
  priceLines,
} from "../../utils/activity-orders";
import { money } from "../../utils/money";
const epoch = new RequestEpoch();
const quoteEpoch = new RequestEpoch();
const emptyParticipant = (): ParticipantInput => ({
  participantName: "", idNumber: "", phone: "",
});
function confirmedRegistration(value: Registration | null, activityId: string): value is Registration {
  return !!value && !!safeId(value.id) && value.activityId === activityId
    && value.status === "CONFIRMED" && Array.isArray(value.participants)
    && value.participants.length > 0 && value.participants.every(participant =>
      typeof participant?.participantName === "string" && !!participant.participantName.trim()
      && typeof participant.phone === "string" && !!participant.phone.trim());
}
import { enterPage } from "../../utils/page-motion";

Page({
  _reloadOnShow: false,
  _profileEpoch: 0,
  data: {
    pageMotionClass: "",
    id: "",
    session: -1,
    quote: null as ActivityQuote | null,
    quoteSession: -1,
    quoteLoading: false,
    quoteError: "",
    quoteTotal: "",
    quoteOriginal: "",
    quoteLines: [] as ReturnType<typeof priceLines>,
    quoteLoginRequired: false,
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
    recoveryNeeded: false,
    recoveredRegistration: null as Registration | null,
    fieldError: "",
  },
  onLoad(o) {
    const id = safeId(o.id);
    this.setData({ id, session: sessionVersion() });
    if (id) void this.load();
    else this.setData({ error: "活动链接无效", loading: false });
  },
  onShow() {
    enterPage(this);
    if (this.data.session !== -1 && this.data.session !== sessionVersion())
      this.resetPrivateForm();
    this.setData({ session: sessionVersion() });
    if (this._reloadOnShow && this.data.id) {
      this._reloadOnShow = false;
      void this.load();
    } else if (!this.data.loading && this.data.activity?.priceCents) {
      void this.refreshQuote();
    }
    if (this.data.recoveryNeeded) void this.recoverRegistration();
    else if (!this.data.success) void this.loadProfile();
  },
  async loadProfile() {
    const n = ++this._profileEpoch, session = sessionVersion();
    if (!hasSession()) return;
    try {
      const user = await getCurrentUser();
      if (n === this._profileEpoch && isSessionCurrent(session)
          && !this.data.submitting && !this.data.recoveryNeeded && !this.data.success)
        this.applyProfile(user);
    } catch (_) {
      // Optional prefill must not block browsing or replace the manual draft.
    }
  },
  resetPrivateForm() {
    this._profileEpoch++;
    this.cancelParticipant();
    this.clearQuote();
    this.setData({
      session: sessionVersion(),
      participants: [emptyParticipant()],
      consent: false,
      privacyRead: false,
      termsRead: false,
      submitting: false,
      success: false,
      recoveryNeeded: false,
      recoveredRegistration: null,
      fieldError: "账号已改变，请重新填写报名信息",
    });
  },
  onHide() {
    this._profileEpoch++;
    this._reloadOnShow = this.data.loading;
    epoch.invalidate();
    this.clearQuote();
    this.cancelParticipant();
    this.setData({ submitting: false });
  },
  onUnload() {
    this._profileEpoch++;
    epoch.invalidate();
    this.clearQuote();
    this.cancelParticipant();
  },
  async load() {
    if (this.data.submitting) return;
    const n = epoch.next();
    const session = sessionVersion();
    this.setData({ loading: true, error: "" });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this.setData({ activity: activityView(a) });
      this.clearQuote();
      if (a.priceCents > 0 && hasSession()) {
        try {
          const user = await getCurrentUser();
          if (!epoch.valid(n) || !isSessionCurrent(session)) return;
          const key = pendingActivityIntent(user.id, a.id);
          if (key) {
            const existing = await this.findActivityOrder(key);
            if (!epoch.valid(n) || !isSessionCurrent(session)) return;
            if (existing) {
              this.openPaidOrder(existing, user.id, key);
              return;
            }
          }
        } catch (error) {
          if (!epoch.valid(n) || !isSessionCurrent(session)) return;
          this.setData({ fieldError: message(error) });
        }
      }
      try {
        const legal = await currentLegal();
        if (epoch.valid(n) && isSessionCurrent(session))
          this.setData({
            legal,
            legalError: "",
            consent: false,
            privacyRead: false,
            termsRead: false,
          });
      } catch (e) {
        if (epoch.valid(n) && isSessionCurrent(session))
          this.setData({ legal: null, legalError: message(e), consent: false });
      }
      if (epoch.valid(n) && isSessionCurrent(session) && a.priceCents > 0)
        void this.refreshQuote();
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    if (this.data.submitting) return;
    void this.load();
  },
  clearQuote() {
    quoteEpoch.invalidate();
    this.setData({
      quote: null, quoteSession: -1, quoteTotal: "", quoteOriginal: "", quoteLines: [],
      quoteLoading: false, quoteError: "", quoteLoginRequired: false,
    });
  },
  async refreshQuote() {
    this.clearQuote();
    const id = this.data.id, count = this.data.participants.length;
    if (!id || !this.data.activity?.priceCents) return;
    if (!hasSession()) {
      this.setData({ quoteLoginRequired: true });
      return;
    }
    const n = quoteEpoch.next(), session = sessionVersion();
    const current = () => quoteEpoch.valid(n) && isSessionCurrent(session) &&
      id === this.data.id && count === this.data.participants.length;
    this.setData({ quoteLoading: true });
    try {
      const quote = await request<ActivityQuote>(`/activities/${id}/quote?participants=${count}`);
      if (!current()) return;
      if (!validActivityQuote(quote, count)) throw new Error("费用报价异常，请重新获取");
      this.setData({ quote, quoteSession: session, quoteTotal: money(quote.totalCents),
        quoteOriginal: money(quote.originalTotalCents), quoteLines: priceLines(quote.quote) });
    } catch (error) {
      if (current()) this.setData({ quoteError: message(error) });
    } finally {
      if (quoteEpoch.valid(n)) this.setData({ quoteLoading: false });
    }
  },
  async findActivityOrder(key: string): Promise<ActivityOrder | null> {
    try {
      return await request<ActivityOrder>(`/activity-orders/by-request/${key}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  openPaidOrder(order: ActivityOrder, userId: string, key: string) {
    const id = safeId(order?.id);
    if (!id || order.activityId !== this.data.id) throw new Error("订单结果未确认，请到活动订单核对");
    this.setData({ participants: [emptyParticipant()], consent: false });
    wx.redirectTo({
      url: `/pages/activity-orders/index?id=${id}`,
      success: () => finishActivityIntent(userId, order.activityId, key),
      fail: () => this.setData({ fieldError: "订单已保留，请在活动订单查看。" }),
    });
  },
  login() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  paidOrders() {
    wx.navigateTo({ url: `/pages/activity-orders/index?activityId=${this.data.id}` });
  },
  inputParticipant(e: WechatMiniprogram.Input) {
    if (this.data.submitting || this.data.recoveryNeeded || this.data.success || this.data.participantModalOpen) return;
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
    if (this.data.submitting || this.data.recoveryNeeded || this.data.success || this.data.participantModalOpen) return;
    if (this.data.participants.length >= (this.data.activity?.available || 0)) {
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
    if (!this.data.activity?.enabled || this.data.participants.length >= this.data.activity!.available) {
      this.setData({ participantError: "当前剩余名额不足，请返回刷新" });
      return;
    }
    this.setData({
      participants: [...this.data.participants, participant],
      fieldError: "",
    });
    this.cancelParticipant();
    if (this.data.activity?.priceCents) void this.refreshQuote();
  },
  async removeParticipant(e: WechatMiniprogram.TouchEvent) {
    if (this.data.submitting || this.data.recoveryNeeded || this.data.success || this.data.participantModalOpen) return;
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.participants.length <= 1 || !this.data.participants[index])
      return;
    const target = this.data.participants[index];
    const session = sessionVersion();
    const answer = await wx.showModal({
      title: "移除参与人",
      content: `将从本次报名中移除「${target.participantName || "未命名参与人"}」。`,
      confirmText: "移除",
    });
    if (
      !answer.confirm ||
      this.data.submitting || this.data.recoveryNeeded || this.data.success ||
      session !== sessionVersion() ||
      this.data.participants.length <= 1 ||
      !this.data.participants[index]
    )
      return;
    this.setData({
      participants: this.data.participants.filter(
        (_, participantIndex) => participantIndex !== index,
      ),
      fieldError: "",
    });
    if (this.data.activity?.priceCents) void this.refreshQuote();
  },
  consentChange(e: WechatMiniprogram.CheckboxGroupChange) {
    if (this.data.submitting || this.data.recoveryNeeded || !this.data.legal) return;
    const wants = e.detail.value.includes("yes");
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
    if (this.data.recoveryNeeded) {
      await this.recoverRegistration();
      return;
    }
    if (!this.data.activity?.enabled) {
      this.setData({ fieldError: "当前活动不可报名，请返回刷新" });
      return;
    }
    if (!this.data.legal) {
      this.setData({
        fieldError: this.data.legalError || "请阅读当前隐私政策和用户协议",
      });
      return;
    }
    const paid = this.data.activity.priceCents > 0;
    const quote = this.data.quote;
    if (paid && (!quote || this.data.quoteLoading || !isSessionCurrent(this.data.quoteSession)
        || !validActivityQuote(quote, this.data.participants.length))) {
      this.setData({ fieldError: "请获取当前账号的最新费用" });
      return;
    }
    this.setData({ submitting: true, fieldError: "" });
    const n = epoch.next();
    const session = sessionVersion();
    try {
      await requireSession();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      // Registration requires a completed activity contact profile; anything else routes
      // to the profile editor first and never reaches a registration write.
      const user = await getCurrentUser();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      // An explicitly incomplete contact profile must be finished before any
      // registration write; an unreported profile stays with the server check.
      if (!isActivityUser(user) || user.profileCompleted === false) {
        wx.navigateTo({ url: "/pages/profile/index?from=register" });
        return;
      }
      this.applyProfile(user);
      const fieldError = validateParticipants(
        this.data.participants, this.data.consent, !!this.data.activity?.identityRequired,
      );
      if (fieldError) throw new Error(fieldError);
      if (this.data.participants.length > this.data.activity!.available)
        throw new Error("报名人数超过剩余名额，请减少参与人");
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
      if (paid && quote) {
        const key = activityIntent(user.id, this.data.id);
        const existing = await this.findActivityOrder(key);
        if (!epoch.valid(n) || !isSessionCurrent(session)) return;
        if (existing) {
          this.openPaidOrder(existing, user.id, key);
          return;
        }
        const order = await request<ActivityOrder>(`/activities/${this.data.id}/orders`, "POST", {
          requestKey: key, expectedTotalCents: quote.totalCents,
          registration: { participants, ...versions },
        });
        if (epoch.valid(n) && isSessionCurrent(session)) this.openPaidOrder(order, user.id, key);
        return;
      }
      // Until the server outcome is known, do not let a retry become a new draft.
      this.setData({ recoveryNeeded: true });
      const result = await request<Registration>(
        `/activities/${this.data.id}/registrations`,
        "POST",
        { participants, ...versions },
      );
      if (!confirmedRegistration(result, this.data.id))
        throw new Error("报名结果未确认，请到我的报名核对，勿重复提交");
      if (epoch.valid(n) && isSessionCurrent(session)) {
        const samePeople = result.participants.length === participants.length
          && result.participants.every((person, index) =>
            person.participantName === participants[index].participantName
            && person.phone === participants[index].phone);
        this.finishRegistration(result, !samePeople);
      }
    } catch (e) {
      if (epoch.valid(n) && isSessionCurrent(session)) {
        if (paid && e instanceof ApiError && e.code === "ACTIVITY_PRICE_CHANGED") {
          await this.refreshQuote();
          if (epoch.valid(n) && isSessionCurrent(session))
            this.setData({ fieldError: "费用已变化，请核对最新费用后重新提交" });
          return;
        }
        if (e instanceof ApiError && ((e.status >= 400 && e.status < 500 && e.status !== 408)
            || e.code === "LEGAL_NOT_READY"))
          this.setData({ recoveryNeeded: false });
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
        this.setData({ fieldError: this.data.recoveryNeeded
          ? `${message(e)}。报名结果尚未确认，请先核对报名结果。` : message(e) });
      }
    } finally {
      if (epoch.valid(n)) {
        if (!isSessionCurrent(session)) this.resetPrivateForm();
        else this.setData({ submitting: false });
      }
    }
  },
  finishRegistration(result: Registration, recovered: boolean) {
    this.setData({ success: true, recoveryNeeded: false, fieldError: "",
      recoveredRegistration: recovered ? result : null, participants: [emptyParticipant()] });
    if (!recovered) wx.redirectTo({
      url: `/pages/signup-success/index?id=${this.data.id}&registrationId=${result.id}`,
    });
  },
  async recoverRegistration() {
    if (!this.data.recoveryNeeded || this.data.submitting || this.data.success) return;
    const n = epoch.next(), session = sessionVersion();
    this.setData({ submitting: true, fieldError: "" });
    try {
      await requireSession();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      const result = await request<Registration | null>(`/activities/${this.data.id}/registrations/me`);
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      if (result === null) {
        this.setData({ recoveryNeeded: false,
          fieldError: "暂未查到有效报名，填写内容已保留，请核对后重新提交。" });
      } else if (confirmedRegistration(result, this.data.id)) {
        this.finishRegistration(result, true);
      } else throw new Error("报名结果未确认，请到我的报名核对");
    } catch (error) {
      if (epoch.valid(n)) this.setData({ fieldError: `${message(error)}。请稍后重新核对，勿重复报名。` });
    } finally {
      if (epoch.valid(n)) {
        if (!isSessionCurrent(session)) this.resetPrivateForm();
        else this.setData({ submitting: false });
      }
    }
  },
  // Prefills the first participant from the saved contact profile; untouched fields only,
  // so manual entries and identity numbers are never overwritten.
  applyProfile(user: User) {
    if (!isActivityUser(user) || user.profileCompleted !== true) return;
    const first = this.data.participants[0];
    if (!first) return;
    this.setData({
      participants: this.data.participants.map((participant, index) =>
        index === 0
          ? {
              participantName:
                first.participantName.trim() === ""
                  ? user.realName || ""
                  : first.participantName,
              idNumber: first.idNumber,
              phone: first.phone.trim() === "" ? user.phone || "" : first.phone,
            }
          : participant,
      ),
    });
  },
  done() {
    wx.redirectTo({ url: `/pages/detail/index?id=${this.data.id}` });
  },
  myActivities() {
    wx.navigateTo({ url: "/pages/registrations/index" });
  },
});
