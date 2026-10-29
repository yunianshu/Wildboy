import {
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { message, RequestEpoch, safeId, dateLabel } from "../../utils/domain";
import { PageResult } from "../../utils/models";
import {
  WaitlistEntry,
  waitlistStatus,
  subscribeNotifications,
} from "../../utils/notifications";
import {
  currentLegal,
  LegalCurrent,
  legalLink,
  versionsOf,
} from "../../utils/legal";
const epoch = new RequestEpoch();
Page({
  data: {
    items: [] as (WaitlistEntry & { statusText: string; deadline: string })[],
    loggedIn: false,
    session: -1,
    busy: false,
    loading: false,
    error: "",
    page: 0,
    hasMore: false,
    confirmId: "",
    legal: null as LegalCurrent | null,
    privacyRead: false,
    termsRead: false,
    consent: false,
  },
  onShow() {
    if (this.data.session !== sessionVersion()) {
      epoch.invalidate();
      this.setData({
        items: [],
        confirmId: "",
        legal: null,
        privacyRead: false,
        termsRead: false,
        consent: false,
        session: sessionVersion(),
      });
    }
    this.setData({ loggedIn: hasSession() });
    if (hasSession() && !this.data.confirmId) void this.load(true);
    else if (!hasSession())
      this.setData({ items: [], confirmId: "", legal: null });
  },
  onHide() {
    epoch.invalidate();
    this.setData({ busy: false, loading: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async load(reset = true) {
    if (this.data.loading || !hasSession()) return;
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ loading: true, error: "" });
    try {
      const p = await request<PageResult<WaitlistEntry>>(
        `/me/waitlist?page=${reset ? 0 : this.data.page + 1}&size=20`,
      );
      if (epoch.valid(n) && isSessionCurrent(s))
        this.setData({
          items: [
            ...(reset ? [] : this.data.items),
            ...p.items.map((i) => ({
              ...i,
              statusText: waitlistStatus[i.status] || i.status,
              deadline: i.offerExpiresAt ? dateLabel(i.offerExpiresAt) : "",
            })),
          ],
          page: p.page,
          hasMore: p.hasMore,
        });
    } catch (e) {
      if (epoch.valid(n))
        this.setData({
          error: message(e),
          loggedIn: hasSession(),
          ...(!hasSession() ? { items: [], confirmId: "" } : {}),
        });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load(true);
  },
  more() {
    if (this.data.hasMore) void this.load(false);
  },
  async choose(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = safeId(e.currentTarget.dataset.id);
    if (!id) return;
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      const legal = await currentLegal();
      if (epoch.valid(n) && isSessionCurrent(s))
        this.setData({
          confirmId: id,
          legal,
          privacyRead: false,
          termsRead: false,
          consent: false,
        });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
  close() {
    if (!this.data.busy)
      this.setData({ confirmId: "", legal: null, consent: false });
  },
  privacy() {
    this.openDocument("PRIVACY");
  },
  terms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.legal) return;
    const s = sessionVersion(),
      v =
        kind === "PRIVACY"
          ? this.data.legal.privacy?.version
          : this.data.legal.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.legal),
      events: {
        legalDocumentLoaded: (d: { kind: string; version: number }) => {
          if (isSessionCurrent(s) && d.kind === kind && d.version === v)
            this.setData({
              [kind === "PRIVACY" ? "privacyRead" : "termsRead"]: true,
            });
        },
      },
    });
  },
  consentChange(e: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({
      consent:
        e.detail.value.includes("yes") &&
        this.data.privacyRead &&
        this.data.termsRead,
    });
  },
  async confirm() {
    if (this.data.busy || !this.data.confirmId || !this.data.legal) return;
    if (!this.data.consent) {
      this.setData({ error: "请阅读并同意当前协议" });
      return;
    }
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      await request(
        `/waitlist/${this.data.confirmId}/confirm`,
        "POST",
        versionsOf(this.data.legal),
      );
      if (epoch.valid(n) && isSessionCurrent(s)) {
        this.setData({ confirmId: "", legal: null, busy: false });
        await this.load(true);
      }
    } catch (e) {
      if (epoch.valid(n))
        this.setData({ error: message(e), loggedIn: hasSession() });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
  async cancel(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = safeId(e.currentTarget.dataset.id);
    if (!id) return;
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      const answer =
        await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult>(
          (resolve, reject) =>
            wx.showModal({
              title: "取消候补",
              content: "取消后重新加入将排在队尾",
              success: resolve,
              fail: reject,
            }),
        );
      if (!epoch.valid(n) || !isSessionCurrent(s) || !answer.confirm) return;
      await request(`/waitlist/${id}`, "DELETE");
      if (epoch.valid(n) && isSessionCurrent(s)) {
        this.setData({ busy: false });
        await this.load(true);
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
  async subscribe() {
    if (this.data.busy) return;
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ busy: true });
    try {
      await subscribeNotifications();
      if (epoch.valid(n) && isSessionCurrent(s))
        wx.showToast({ title: "已订阅一次提醒", icon: "none" });
    } catch (e) {
      if (epoch.valid(n) && isSessionCurrent(s))
        this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
  messages() {
    wx.navigateTo({ url: "/pages/notifications/index" });
  },
});
