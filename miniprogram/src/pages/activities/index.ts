import { request, mediaUrl } from "../../utils/api";
import { Activity, PageResult } from "../../utils/models";
import {
  categories,
  validCategory,
  activityView,
  mergeUnique,
  RequestEpoch,
  message,
  safeId,
} from "../../utils/domain";
import { syncTabBar } from "../../utils/tab-bar";
import { resetTabSwipe, tabSwipeHandlers } from "../../utils/tab-swipe";
import { enterPage } from "../../utils/page-motion";
import { measureCapsuleHeader } from "../../utils/capsule-header";
import { centeredFilterScroll } from "../../utils/filter-scroll";

const epoch = new RequestEpoch();
const SEARCH_DEBOUNCE_MS = 250;

/** Sub-pixel slack: an already-framed category must never restart its animation. */
const FILTER_CENTER_TOLERANCE = 0.5;

type FilterRect = { left: number; width: number } | null | undefined;

function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= FILTER_CENTER_TOLERANCE;
}

Page({
  ...tabSwipeHandlers,
  data: {
    pageMotionClass: "",
    topInset: 48,
    categories,
    selected: "",
    searchOpen: false,
    searchInput: "",
    searchTitle: "",
    items: [] as ReturnType<typeof activityView>[],
    loading: false,
    loadingMore: false,
    error: "",
    page: -1,
    hasMore: true,
    filterScrollLeft: 0,
  },
  // Guard for the category strip: one counter invalidates pending native
  // queries, late renderer callbacks and staged animation commits together.
  _loaded: false,
  _searchTimer: null as ReturnType<typeof setTimeout> | null,
  filterEpoch: 0,
  filterActive: true,
  onLoad() {
    const layout = measureCapsuleHeader();
    this.setData({ topInset: layout.top + 10, headerLayout: layout });
  },
  onShow() {
    enterPage(this);
    syncTabBar(this);
    this.filterActive = true;
    const category = wx.getStorageSync("wildboy-category");
    if (category) {
      this._loaded = false;
      wx.removeStorageSync("wildboy-category");
      const selected = validCategory(category) ? category : "";
      this.filterEpoch++;
      // Consume the stored selection before measuring so the strip frames the
      // restored category, not the one rendered before hiding.
      this.setData({ selected, searchInput: "", searchTitle: "" }, () => this.revealSelectedFilter());
    } else {
      this.revealSelectedFilter();
    }
    if (!this._loaded) void this.load(true);
  },
  onHide() {
    this.closeSearch();
    resetTabSwipe(this);
    this.filterActive = false;
    this.filterEpoch++;
  },
  onUnload() {
    this.cancelSearchTimer();
    resetTabSwipe(this);
    this.filterActive = false;
    this.filterEpoch++;
    epoch.invalidate();
  },
  onResize() {
    this.setData({ headerLayout: measureCapsuleHeader() });
    // A rotated viewport invalidates the old geometry: re-frame the strip
    // in place, never reload the listing. The frame only exists on the full
    // page instance, not on bare geometry-only hosts.
    if (typeof this.revealSelectedFilter === "function") this.revealSelectedFilter();
  },
  onPullDownRefresh() {
    void this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    void this.load(false);
  },
  select(e: WechatMiniprogram.TouchEvent) {
    if (!this.filterActive) return;
    const v = (e.currentTarget.dataset.code as string) || "";
    if (v !== "" && !validCategory(v)) return;
    if (v === this.data.selected && !this.data.searchTitle) {
      if (this.data.searchInput) this.setData({ searchInput: "" });
      // Re-tapping the active category only re-frames the strip; no refetch.
      this.revealSelectedFilter();
      return;
    }
    this.filterEpoch++;
    this.setData({ selected: v, searchInput: "", searchTitle: "" }, () => this.revealSelectedFilter());
    void this.load(true);
  },
  onFilterTouchStart() {
    resetTabSwipe(this);
    // A native drag takes over the strip: pending queries and staged
    // animation commits are void so the finger never fights a setData.
    this.filterEpoch++;
  },
  revealSelectedFilter() {
    if (!this.filterActive) return;
    const token = ++this.filterEpoch;
    try {
      // Visual-frame measurement only: the viewport, the selected item and the
      // content track share the animated translation, so their difference is
      // stable even while a native scroll offset still describes an old frame.
      wx.createSelectorQuery()
        .in(this)
        .select("#activity-filters-viewport")
        .boundingClientRect()
        .select("#activity-category-" + (this.data.selected || "all"))
        .boundingClientRect()
        .select("#activity-filters-track")
        .boundingClientRect()
        .exec(results => {
          if (!this.filterActive || token !== this.filterEpoch) return;
          const rects = (Array.isArray(results) ? results : []) as FilterRect[];
          this.applyMeasuredPosition(rects[0], rects[1], rects[2]);
        });
    } catch (e) {
      // A native query outage must never break the page or invent a position.
    }
  },
  applyMeasuredPosition(viewport: FilterRect, item: FilterRect, track: FilterRect) {
    const position = centeredFilterScroll(viewport, item, track);
    if (!position) return;
    const { target, visualCurrent } = position;
    if (withinTolerance(target, visualCurrent)) {
      // The category is already framed on screen; only the recorded offset can
      // lag behind the visual truth, so one commit syncs it without moving.
      if (!withinTolerance(target, this.data.filterScrollLeft)) {
        this.setData({ filterScrollLeft: target });
      }
      return;
    }
    // Two-stage commit: first record the measured visual frame so the bound
    // scroll-left matches reality, then animate from there to the target.
    this.setData({ filterScrollLeft: visualCurrent });
    this.setData({ filterScrollLeft: target });
  },
  openSearch() {
    this.setData({ searchOpen: true });
  },
  closeSearch() {
    if (this.data.searchOpen) this.setData({ searchOpen: false });
  },
  updateSearchInput(event: WechatMiniprogram.Input) {
    this.applySearch(event.detail.value, true);
  },
  search(event: WechatMiniprogram.Input) {
    this.applySearch(event.detail.value);
  },
  clearSearch() {
    this.applySearch("");
  },
  cancelSearchTimer() {
    if (this._searchTimer === null) return;
    clearTimeout(this._searchTimer);
    this._searchTimer = null;
  },
  applySearch(value: string, debounce = false) {
    const searchInput = value.slice(0, 100);
    const searchTitle = searchInput.trim();
    const categoryChanged = Boolean(searchTitle && this.data.selected);
    const changed = searchTitle !== this.data.searchTitle || categoryChanged;
    if (categoryChanged) this.filterEpoch++;
    this.setData({
      searchInput,
      searchTitle,
      ...(categoryChanged ? { selected: "" } : {}),
    }, categoryChanged ? () => this.revealSelectedFilter() : undefined);
    if (!changed) {
      if (!debounce && this._searchTimer !== null) void this.load(true);
      return;
    }
    // A response for the previous input must not update the list during the debounce.
    epoch.invalidate();
    this.cancelSearchTimer();
    if (!debounce || !searchTitle) {
      void this.load(true);
      return;
    }
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null;
      void this.load(true);
    }, SEARCH_DEBOUNCE_MS);
  },
  async load(reset = true) {
    if (
      !reset &&
      (this._searchTimer !== null || this.data.loading || this.data.loadingMore || !this.data.hasMore)
    )
      return;
    if (reset) this.cancelSearchTimer();
    const n = epoch.next();
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: "",
      ...(reset ? { items: [], page: -1, hasMore: true } : {}),
    });
    try {
      const p = await request<PageResult<Activity>>(
        `/activities?page=${reset ? 0 : this.data.page + 1}&size=10${this.data.selected ? "&category=" + this.data.selected : ""}${this.data.searchTitle ? "&title=" + encodeURIComponent(this.data.searchTitle) : ""}`,
      );
      if (epoch.valid(n)) {
        this._loaded = true;
        const items = p.items.map((x) =>
          activityView({ ...x, coverUrl: mediaUrl(x.coverUrl) }),
        );
        this.setData({
          items: reset ? items : mergeUnique(this.data.items, items),
          page: p.page,
          hasMore: p.hasMore,
        });
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false, loadingMore: false });
    }
  },
  retry() {
    void this.load(!this.data.items.length);
  },
  openActivity(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
});
