import { loadContent, ContentBlock } from "../../utils/content";
import {
  request,
  mediaUrl,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import {
  Activity,
  AttendeeSummary,
  NavigationPoint,
  Registration,
  PageResult,
} from "../../utils/models";
import { ActivityOrder, activityOrderStatus } from "../../utils/activity-orders";
import {
  activityView,
  dateLabel,
  message,
  safeId,
  RequestEpoch,
} from "../../utils/domain";
import { enterPage } from "../../utils/page-motion";

const epoch = new RequestEpoch();

type NavDisplayItem = {
  id: string;
  kind: "DESTINATION" | "MEETING" | "BOARDING";
  kindLabel: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

type BoardingStopItem = {
  label: string;
  address: string;
  hasCoord: boolean;
  latitude: number;
  longitude: number;
};

type AttendeeChip = {
  key: string;
  nickname: string;
  initial: string;
  avatarUrl: string;
  partySize: number;
};

const kindTextMap: Record<NavDisplayItem["kind"], string> = {
  DESTINATION: "目的地",
  MEETING: "集合点",
  BOARDING: "上车点",
};

function extractNavItems(points?: NavigationPoint[]): NavDisplayItem[] {
  if (!Array.isArray(points)) return [];
  const out: NavDisplayItem[] = [];
  points.forEach((p, idx) => {
    if (
      p &&
      typeof p.latitude === "number" &&
      typeof p.longitude === "number" &&
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      typeof p.label === "string" &&
      p.label.trim()
    ) {
      const kind =
        p.kind === "DESTINATION" || p.kind === "MEETING" || p.kind === "BOARDING"
          ? p.kind
          : "MEETING";
      out.push({
        id: p.id || `nav-${idx}`,
        kind,
        kindLabel: kindTextMap[kind],
        label: p.label.trim(),
        address: (p.address || p.label).trim(),
        latitude: p.latitude,
        longitude: p.longitude,
      });
    }
  });
  return out;
}

function buildBoardingStops(
  boardingPoints?: string[],
  navPoints?: NavigationPoint[],
): BoardingStopItem[] {
  const result: BoardingStopItem[] = [];
  const seen = new Set<string>();
  const navBoarding = Array.isArray(navPoints)
    ? navPoints.filter((n) => n && n.kind === "BOARDING" && n.label?.trim())
    : [];
  for (const name of boardingPoints || []) {
    const clean = (name || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const matched = navBoarding.find((n) => n.label.trim() === clean);
    const hasCoord =
      matched != null &&
      typeof matched.latitude === "number" &&
      typeof matched.longitude === "number" &&
      Number.isFinite(matched.latitude) &&
      Number.isFinite(matched.longitude);
    result.push({
      label: clean,
      address: (matched?.address || clean).trim(),
      hasCoord,
      latitude: hasCoord ? (matched!.latitude as number) : 0,
      longitude: hasCoord ? (matched!.longitude as number) : 0,
    });
  }
  for (const nav of navBoarding) {
    const clean = nav.label.trim();
    if (seen.has(clean)) continue;
    seen.add(clean);
    const hasCoord =
      typeof nav.latitude === "number" &&
      typeof nav.longitude === "number" &&
      Number.isFinite(nav.latitude) &&
      Number.isFinite(nav.longitude);
    result.push({
      label: clean,
      address: (nav.address || clean).trim(),
      hasCoord,
      latitude: hasCoord ? (nav.latitude as number) : 0,
      longitude: hasCoord ? (nav.longitude as number) : 0,
    });
  }
  return result;
}

Page({
  _contentGeneration: 0,
  _attendeeGeneration: 0,
  data: {
    pageMotionClass: "",
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentError: "",
    activity: null as ReturnType<typeof activityView> | null,
    navPoints: [] as NavDisplayItem[],
    destHasCoord: false,
    meetHasCoord: false,
    boardingStops: [] as BoardingStopItem[],
    navPickerOpen: false,
    navPickerTitle: "选择导航地点",
    navPickerItems: [] as NavDisplayItem[],
    attendees: [] as AttendeeChip[],
    visibleAttendees: [] as AttendeeChip[],
    attendeeTotalParticipants: 0,
    attendeesExpanded: false,
    registration: null as Registration | null,
    activeOrder: null as ActivityOrder | null,
    activeOrderText: "",
    loading: true,
    error: "",
    registrationError: "",
    registrationSyncing: false,
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
    if (this.data.id) {
      void this.load();
      void this.loadAttendees();
      if (!this.data.contentBlocks.length) void this.loadRichContent();
    }
  },
  onHide() {
    epoch.invalidate();
    this._attendeeGeneration++;
    this.setData({
      registration: null,
      activeOrder: null,
      activeOrderText: "",
      cancelling: false,
      navPickerOpen: false,
      registrationSyncing: false,
    });
  },
  onUnload() {
    this._contentGeneration++;
    this._attendeeGeneration++;
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void Promise.all([this.load(), this.loadAttendees(), this.loadRichContent()]).finally(() =>
      wx.stopPullDownRefresh(),
    );
  },
  async load() {
    const n = epoch.next();
    this.setData({
      loading: !this.data.activity,
      registrationSyncing: hasSession(),
      error: "",
      registrationError: "",
      registration: null,
      activeOrder: null,
      activeOrderText: "",
    });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (!epoch.valid(n)) return;
      const navPoints = extractNavItems(a.navigationPoints);
      const boardingStops = buildBoardingStops(
        a.boardingPoints,
        a.navigationPoints,
      );
      this.setData({
        activity: activityView({
          ...a,
          coverUrl: mediaUrl(a.coverUrl),
          galleryUrls: a.galleryUrls.map(mediaUrl),
        }),
        navPoints,
        destHasCoord: navPoints.some((p) => p.kind === "DESTINATION"),
        meetHasCoord: navPoints.some((p) => p.kind === "MEETING"),
        boardingStops,
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
            const activeOrder = orders.items.find(
              (order) =>
                order.activityId === a.id &&
                safeId(order.id) &&
                [
                  "PENDING_PAYMENT",
                  "PAID",
                  "CONFIRMED_FREE",
                  "REFUND_PENDING",
                ].includes(order.status),
            );
            if (activeOrder)
              this.setData({
                activeOrder,
                activeOrderText: activityOrderStatus(activeOrder.status),
              });
          } else if (a.priceCents === 0) {
            const registration = await request<Registration | null>(
              `/activities/${a.id}/registrations/me`,
            );
            if (epoch.valid(n) && isSessionCurrent(session))
              this.setData({ registration });
          }
        } catch (e) {
          if (epoch.valid(n)) this.setData({ registrationError: message(e) });
        }
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false, registrationSyncing: false });
    }
  },
  async loadAttendees() {
    const id = this.data.id;
    if (!id) return;
    const gen = ++this._attendeeGeneration;
    try {
      const res = await request<AttendeeSummary>(`/activities/${id}/attendees`);
      if (this.data.id !== id || gen !== this._attendeeGeneration) return;
      if (!res || !Array.isArray(res.items)) return;
      const chips: AttendeeChip[] = res.items.map((item, idx) => {
        const nick = (item.nickname || "山野同行者").trim() || "山野同行者";
        const chars = Array.from(nick);
        return {
          key: `att-${idx}`,
          nickname: nick,
          initial: chars[0] || "野",
          avatarUrl: item.avatarUrl ? mediaUrl(item.avatarUrl) : "",
          partySize: Number(item.partySize) > 1 ? Number(item.partySize) : 1,
        };
      });
      const expanded = this.data.attendeesExpanded;
      this.setData({
        attendees: chips,
        visibleAttendees: expanded ? chips : chips.slice(0, 12),
        attendeeTotalParticipants: Number(res.totalParticipants) || chips.length,
      });
    } catch {
      // Non-blocking: keep detail page usable if attendees endpoint is unavailable
    }
  },
  toggleAttendeesExpand() {
    const next = !this.data.attendeesExpanded;
    this.setData({
      attendeesExpanded: next,
      visibleAttendees: next
        ? this.data.attendees
        : this.data.attendees.slice(0, 12),
    });
  },
  attendeeAvatarFailed(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx) || !this.data.attendees[idx]) return;
    const updated = this.data.attendees.map((item, i) =>
      i === idx ? { ...item, avatarUrl: "" } : item,
    );
    this.setData({
      attendees: updated,
      visibleAttendees: this.data.attendeesExpanded
        ? updated
        : updated.slice(0, 12),
    });
  },
  openWxMap(item: {
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  }) {
    if (typeof wx.openLocation === "function") {
      wx.openLocation({
        latitude: item.latitude,
        longitude: item.longitude,
        name: item.label,
        address: item.address || item.label,
        scale: 16,
      });
    }
  },
  copyPlainAddress(text: string) {
    const clean = (text || "").trim();
    if (!clean) return;
    if (typeof wx.setClipboardData === "function") {
      wx.setClipboardData({
        data: clean,
        success: () => {
          if (typeof wx.showToast === "function") {
            wx.showToast({ title: "已复制地址，可粘贴导航", icon: "none" });
          }
        },
      });
    }
  },
  tapDestinationNav() {
    const dests = this.data.navPoints.filter((p) => p.kind === "DESTINATION");
    if (dests.length === 1) {
      this.openWxMap(dests[0]);
      return;
    }
    if (dests.length > 1) {
      this.setData({
        navPickerOpen: true,
        navPickerTitle: "选择目的地导航",
        navPickerItems: dests,
      });
      return;
    }
    this.copyPlainAddress(this.data.activity?.location || "");
  },
  tapMeetingNav() {
    const meets = this.data.navPoints.filter((p) => p.kind === "MEETING");
    if (meets.length === 1) {
      this.openWxMap(meets[0]);
      return;
    }
    if (meets.length > 1) {
      this.setData({
        navPickerOpen: true,
        navPickerTitle: "选择集合地点导航",
        navPickerItems: meets,
      });
      return;
    }
    this.copyPlainAddress(this.data.activity?.meetingPoint || "");
  },
  tapBoardingStop(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index);
    const stop = this.data.boardingStops[idx];
    if (!stop) return;
    if (stop.hasCoord) {
      this.openWxMap(stop);
      return;
    }
    this.copyPlainAddress(stop.label);
  },
  openAllNavPicker() {
    if (!this.data.navPoints.length) return;
    if (this.data.navPoints.length === 1) {
      this.openWxMap(this.data.navPoints[0]);
      return;
    }
    this.setData({
      navPickerOpen: true,
      navPickerTitle: "选择导航地点",
      navPickerItems: this.data.navPoints,
    });
  },
  selectNavItem(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index);
    const item = this.data.navPickerItems[idx];
    this.setData({ navPickerOpen: false });
    if (item) this.openWxMap(item);
  },
  closeNavPicker() {
    this.setData({ navPickerOpen: false });
  },
  keepNavPicker() {},
  async loadRichContent() {
    const id = this.data.id,
      generation = ++this._contentGeneration;
    try {
      const document = await loadContent(`/activities/${id}/content`);
      if (this.data.id === id && generation === this._contentGeneration)
        this.setData({ contentBlocks: document.blocks, contentError: "" });
    } catch (_) {
      if (this.data.id === id && generation === this._contentGeneration)
        this.setData({ contentError: "图文暂未加载" });
    }
  },
  retry() {
    void this.load();
    void this.loadAttendees();
  },
  activityOrders() {
    if (!this.data.activity?.priceCents || !this.data.id) return;
    const orderId = safeId(this.data.activeOrder?.id);
    wx.navigateTo({
      url: `/pages/activity-orders/index?activityId=${this.data.id}${orderId ? "&id=" + orderId : ""}`,
    });
  },
  register() {
    if (this.data.registrationSyncing) return;
    if (this.data.activeOrder) this.activityOrders();
    else if (this.data.activity?.enabled && !this.data.registrationError)
      wx.navigateTo({ url: `/pages/register/index?id=${this.data.id}` });
  },
  async cancel() {
    if (
      this.data.cancelling ||
      this.data.loading ||
      !this.data.activity?.canCancel
    )
      return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({ cancelling: true });
    let answer;
    try {
      answer = await wx.showModal({
        title: "取消这次报名？",
        content:
          "取消后整单所有参与人的名额都会释放；重新报名取决于剩余名额与截止时间。",
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
      await Promise.all([this.load(), this.loadAttendees()]);
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
  previewPhoto(event: WechatMiniprogram.TouchEvent) {
    const activity = this.data.activity;
    if (!activity) return;
    const urls = [activity.coverUrl, ...activity.galleryUrls].filter(Boolean);
    const current = event.currentTarget.dataset.url;
    if (urls.includes(current)) wx.previewImage({ current, urls });
  },
  onShareAppMessage() {
    return {
      title: this.data.activity?.title || "Wildboy · 一起去山野",
      path: `/pages/detail/index?id=${this.data.id}`,
      imageUrl: this.data.activity?.coverUrl,
    };
  },
});
