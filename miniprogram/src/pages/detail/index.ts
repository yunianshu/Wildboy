import { loadContent, ContentBlock } from "../../utils/content";
import {
  request,
  mediaUrl,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Activity, Registration, PageResult } from "../../utils/models";
import { ActivityOrder, activityOrderStatus } from "../../utils/activity-orders";
import {
  activityView,
  dateLabel,
  message,
  safeId,
  RequestEpoch,
} from "../../utils/domain";
const epoch = new RequestEpoch();
import { enterPage } from "../../utils/page-motion";

Page({
  _contentGeneration: 0,
  data: {
    pageMotionClass: "",
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentError: "",
    activity: null as ReturnType<typeof activityView> | null,
    registration: null as Registration | null,
    activeOrder: null as ActivityOrder | null,
    activeOrderText: "",
    loading: true,
    error: "",
    registrationError: "",
    deadline: "",
    endDate: "",
    cancelling: false,
  },
  onLoad(options) {
    const id = safeId(options.id);
    this.setData({ id });
    if (!id) this.setData({ loading: false, error: "活动链接无效" });
  },
  onShow() {
    enterPage(this);
    if (this.data.id) { void this.load(); void this.loadRichContent(); }
  },
  onHide() {
    epoch.invalidate();
    this.setData({ registration: null, activeOrder: null, activeOrderText: "", cancelling: false });
  },
  onUnload() {
    this._contentGeneration++;
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      registrationError: "",
      registration: null,
      activeOrder: null,
      activeOrderText: "",
    });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (!epoch.valid(n)) return;
      this.setData({
        activity: activityView({
          ...a,
          coverUrl: mediaUrl(a.coverUrl),
          galleryUrls: a.galleryUrls.map(mediaUrl),
        }),
        deadline: dateLabel(a.registrationDeadline),
        endDate: dateLabel(a.endAt),
      });
      if (hasSession()) {
        const session = sessionVersion();
        try {
          if (a.priceCents > 0) {
            const orders = await request<PageResult<ActivityOrder>>(
              `/me/activity-orders?page=0&size=20&activityId=${a.id}`,
            );
            if (!epoch.valid(n) || !isSessionCurrent(session)) return;
            const activeOrder = orders.items.find(order => order.activityId === a.id && safeId(order.id) &&
              ["PENDING_PAYMENT", "PAID", "CONFIRMED_FREE", "REFUND_PENDING"].includes(order.status));
            if (activeOrder) this.setData({ activeOrder, activeOrderText: activityOrderStatus(activeOrder.status) });
          } else if (a.priceCents === 0) {
            const registration = await request<Registration | null>(
              `/activities/${a.id}/registrations/me`,
            );
            if (epoch.valid(n) && isSessionCurrent(session)) this.setData({ registration });
          }
        } catch (e) {
          if (epoch.valid(n)) this.setData({ registrationError: message(e) });
        }
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  async loadRichContent() {
    const id = this.data.id, generation = ++this._contentGeneration;
    try { const document = await loadContent(`/activities/${id}/content`);
      if (this.data.id === id && generation === this._contentGeneration) this.setData({contentBlocks: document.blocks, contentError: ""});
    } catch (_) { if (this.data.id === id && generation === this._contentGeneration) this.setData({contentError: "图文暂未加载"}); }
  },
  retry() {
    void this.load();
  },
  activityOrders() {
    if (!this.data.activity?.priceCents || !this.data.id) return;
    const orderId = safeId(this.data.activeOrder?.id);
    wx.navigateTo({ url: `/pages/activity-orders/index?activityId=${this.data.id}${orderId ? "&id=" + orderId : ""}` });
  },
  register() {
    if (this.data.activeOrder) this.activityOrders();
    else if (this.data.activity?.enabled && !this.data.registrationError)
      wx.navigateTo({ url: `/pages/register/index?id=${this.data.id}` });
  },
  async cancel() {
    if (this.data.cancelling || this.data.loading || !this.data.activity?.canCancel) return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({ cancelling: true });
    let answer;
    try {
      answer = await wx.showModal({
        title: "取消这次报名？",
        content: "取消后整单所有参与人的名额都会释放；重新报名取决于剩余名额与截止时间。",
        confirmText: "确认取消",
        confirmColor: "#8A4B31",
      });
    } catch (error) {
      if (epoch.valid(n) && isSessionCurrent(session))
        this.setData({ cancelling: false, registrationError: message(error) });
      return;
    }
    if (!epoch.valid(n) || !isSessionCurrent(session)) return;
    if (!answer.confirm) {
      this.setData({ cancelling: false });
      return;
    }
    try {
      await request(`/activities/${this.data.id}/registrations/me`, "DELETE");
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      wx.showToast({ title: "报名已取消", icon: "success" });
      await this.load();
    } catch (e) {
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      wx.showModal({
        title: "暂未取消",
        content: message(e),
        showCancel: false,
      });
    } finally {
      this.setData({ cancelling: false });
    }
  },
  onShareAppMessage() {
    return {
      title: this.data.activity?.title || "Wildboy · 一起去山野",
      path: `/pages/detail/index?id=${this.data.id}`,
      imageUrl: this.data.activity?.coverUrl,
    };
  },
});
