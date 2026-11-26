import { request, mediaUrl } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId } from "../../utils/domain";
import { priceText, originalPriceText } from "../../utils/product-prices";
import { centeredFilterScroll } from "../../utils/filter-scroll";
import { capsuleHeaderLayout, measureCapsuleHeader } from "../../utils/capsule-header";
import { syncTabBar } from "../../utils/tab-bar";
import { resetTabSwipe, tabSwipeHandlers } from "../../utils/tab-swipe";

/** Server catalog rows; sortOrder keeps the curated order across reloads. */
type ShopCategory = { id: string; name: string; sortOrder: number; version: number };

type CatalogItem = Product & { priceText: string; originalPriceText: string };

type CatalogEntry = { items: CatalogItem[]; at: number };

const CATALOG_TTL = 30000;
const ALL_CATEGORY = "all";

/** A cache is stale only after a full TTL; Date.now stays injectable for tests. */
function expired(entry: { at: number }): boolean {
  return Date.now() - entry.at >= CATALOG_TTL;
}

/** The aggregate "全部" view is the unfiltered product list. */
function catalogPath(id: string): string {
  return id === ALL_CATEGORY ? "/shop/products" : `/shop/products?categoryId=${id}`;
}

function catalogItems(products: Product[]): CatalogItem[] {
  return (Array.isArray(products) ? products : []).map((product) => ({
    ...product,
    imageUrl: mediaUrl(product.imageUrl || ""),
    priceText: priceText(product.priceCents),
    originalPriceText: originalPriceText(
      product.priceCents,
      product.originalPriceCents,
    ),
  }));
}

import { enterPage } from "../../utils/page-motion";

Page({
  ...tabSwipeHandlers,
  data: {
    pageMotionClass: "",
    topInset: 48,
    headerLayout: null as ReturnType<typeof capsuleHeaderLayout> | null,
    items: [] as CatalogItem[],
    searchOpen: false,
    searchInput: "",
    searchTerm: "",
    searchResults: [] as CatalogItem[],
    loading: true,
    loaded: false,
    refreshing: false,
    error: "",
    categories: [] as ShopCategory[],
    categoriesLoaded: false,
    categoriesError: "",
    selectedCategory: "",
    categoryScrollLeft: 0,
  },
  // Per-instance request state: caches and flights are never shared between
  // page instances and only exist once the first request needs them.
  _catalogs: undefined as Record<string, CatalogEntry> | undefined,
  _catalogFlights: undefined as Record<string, Promise<void>> | undefined,
  _categoryCache: undefined as { items: ShopCategory[]; at: number } | undefined,
  _categoryFlight: undefined as Promise<void> | undefined,
  _flight: undefined as Promise<void> | undefined,
  _lastLoadedAt: undefined as number | undefined,
  _categoryTouching: false,
  _visible: undefined as boolean | undefined,
  _unloaded: false,

  onLoad() {
    let info: WechatMiniprogram.WindowInfo | undefined;
    let menu: ReturnType<typeof wx.getMenuButtonBoundingClientRect> | undefined;
    try { info = wx.getWindowInfo(); } catch (_) { /* Bounded fallback below. */ }
    try { menu = wx.getMenuButtonBoundingClientRect(); } catch (_) { /* Real status bar. */ }
    this.setData({
      topInset: (info ? info.statusBarHeight : 47) + 10,
      headerLayout: capsuleHeaderLayout(info, menu),
    });
  },
  onResize() {
    this.setData({ headerLayout: measureCapsuleHeader() });
  },
  onShow() {
    enterPage(this);
    this._visible = true;
    syncTabBar(this);
    this._flight = this.load();
    void this.loadCategories();
  },
  onHide() {
    this.closeSearch();
    resetTabSwipe(this);
    this._visible = false;
  },
  onUnload() {
    resetTabSwipe(this);
    this._visible = false;
    this._unloaded = true;
  },
  onPullDownRefresh(): Promise<void> {
    return Promise.all([this.loadCategories(true), this.load(true)])
      .then(() => undefined)
      .finally(() => wx.stopPullDownRefresh());
  },
  /** Load the catalog of the active selection; force bypasses only the TTL cache. */
  load(force = false): Promise<void> {
    if (this._unloaded) return Promise.resolve();
    const id = this.data.selectedCategory || ALL_CATEGORY;
    const active = this._catalogFlights && this._catalogFlights[id];
    if (active) {
      this._flight = active;
      return active;
    }
    const cache = this._catalogs && this._catalogs[id];
    if (cache && !force && !expired(cache)) {
      // A fresh return keeps the exact rendered rows; only repair stale flags.
      if (this.data.loading || this.data.refreshing || this.data.error || !this.data.loaded)
        this.setData({ loading: false, loaded: true, refreshing: false, error: "" });
      return Promise.resolve();
    }
    const flight = this.fetchCatalog(id);
    this._flight = flight;
    return flight;
  },
  retry(): Promise<void> {
    return this.load(true);
  },
  /** One in-flight request per category; late results are cached but never
   * replace the rows of another selection. */
  fetchCatalog(id: string): Promise<void> {
    const flights = this._catalogFlights || (this._catalogFlights = {});
    const pending = flights[id];
    if (pending) return pending;
    const cache = this._catalogs && this._catalogs[id];
    // Synchronous state: an existing catalog stays visible while revalidating.
    if (cache)
      this.setData({ loading: false, loaded: true, refreshing: true, error: "" });
    else
      this.setData({ items: [], loading: true, loaded: false, refreshing: false, error: "" });
    let flight: Promise<void> | undefined;
    flight = (async () => {
      try {
        const products = await request<Product[]>(catalogPath(id));
        if (this._unloaded || this._visible === false) return;
        const items = catalogItems(products);
        const at = Date.now();
        this._catalogs = { ...(this._catalogs || {}), [id]: { items, at } };
        if ((this.data.selectedCategory || ALL_CATEGORY) === id) {
          this._lastLoadedAt = at;
          this.setData({ items, searchResults: this.matchProducts(items, this.data.searchTerm), loading: false, loaded: true, refreshing: false, error: "" });
        }
      } catch (error) {
        if (this._unloaded || this._visible === false) return;
        if ((this.data.selectedCategory || ALL_CATEGORY) !== id) return;
        this.setData({ loading: false, refreshing: false, error: message(error) });
      } finally {
        if (flights[id] === flight) delete flights[id];
        if (this._flight === flight) this._flight = undefined;
      }
    })();
    flights[id] = flight;
    return flight;
  },
  selectCategory(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id) return;
    this.setData({ searchInput: "", searchTerm: "", searchResults: [] });
    this.selectCategoryId(id);
  },
  selectCategoryId(id: string) {
    if (!id || (id !== ALL_CATEGORY && !this.data.categories.some((c) => c.id === id))) return;
    const changed = this.data.selectedCategory !== id;
    const active = this._catalogFlights && this._catalogFlights[id];
    const cache = this._catalogs && this._catalogs[id];
    if (changed) this.setData({ selectedCategory: id, error: "" });
    if (active) {
      this._flight = active;
      if (changed) {
        if (cache) this.showCachedCategory(cache, expired(cache));
        else this.setData({ items: [], loading: true, loaded: false, refreshing: false, error: "" });
      }
    } else if (cache && !expired(cache)) {
      this._flight = undefined;
      if (changed) this.showCachedCategory(cache, false);
    } else {
      this._flight = this.fetchCatalog(id);
      // Switching to a stale category shows its cached rows while revalidating.
      if (changed && cache)
        this.setData({ items: cache.items, searchResults: this.matchProducts(cache.items, this.data.searchTerm), loading: false, loaded: true, refreshing: true });
    }
    this.centerCategory(id);
  },
  showCachedCategory(entry: CatalogEntry, revalidating: boolean) {
    this.setData({
      items: entry.items,
      searchResults: this.matchProducts(entry.items, this.data.searchTerm),
      loading: false,
      loaded: true,
      refreshing: revalidating,
      error: "",
    });
  },
  loadCategories(force = false): Promise<void> {
    if (this._unloaded) return Promise.resolve();
    if (this._categoryFlight) return this._categoryFlight;
    const cache = this._categoryCache;
    if (cache && !force && !expired(cache)) return Promise.resolve();
    let flight: Promise<void> | undefined;
    flight = (async () => {
      try {
        const list = await request<ShopCategory[]>("/shop/categories");
        if (this._unloaded || this._visible === false) return;
        const categories = (Array.isArray(list) ? list : [])
          .slice()
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        this._categoryCache = { items: categories, at: Date.now() };
        this.setData({ categories, categoriesLoaded: true, categoriesError: "" });
        const selected = this.data.selectedCategory;
        if (selected && selected !== ALL_CATEGORY && !categories.some((category) => category.id === selected))
          this.selectCategoryId(ALL_CATEGORY);
      } catch (error) {
        if (this._unloaded || this._visible === false) return;
        this.setData({ categoriesError: message(error) });
      } finally {
        if (this._categoryFlight === flight) this._categoryFlight = undefined;
      }
    })();
    this._categoryFlight = flight;
    return flight;
  },
  retryCategories(): Promise<void> {
    return this.loadCategories(true);
  },
  centerCategory(id: string) {
    if (typeof wx.createSelectorQuery !== "function") return;
    const query = wx.createSelectorQuery().in(this);
    query.select(".shop-category-viewport").boundingClientRect();
    query.select(`#shop-category-${id}`).boundingClientRect();
    query.select(".shop-category-track").boundingClientRect();
    query.exec((rects) => {
      // Stale selections and an active touch must never move the track.
      if (this._unloaded || this._categoryTouching || this.data.selectedCategory !== id) return;
      const position = centeredFilterScroll(rects && rects[0], rects && rects[1], rects && rects[2]);
      if (!position) return;
      // Reset to the visual position first so a repeated target animates again.
      this.setData({ categoryScrollLeft: position.visualCurrent });
      this.setData({ categoryScrollLeft: position.target });
    });
  },
  revealSelectedCategory() {
    this.centerCategory(this.data.selectedCategory || ALL_CATEGORY);
  },
  openSearch() { this.setData({ searchOpen: true }); },
  closeSearch() { if (this.data.searchOpen) this.setData({ searchOpen: false }); },
  clearSearch() { this.applySearch(""); },
  searchProducts(event: WechatMiniprogram.Input) { this.applySearch(event.detail.value); },
  applySearch(value: string) {
    const searchInput = value.slice(0, 80);
    const searchTerm = searchInput.trim();
    this.setData({ searchInput, searchTerm });
    if (searchTerm && this.data.selectedCategory && this.data.selectedCategory !== ALL_CATEGORY) {
      this.setData({ searchResults: [] });
      this.selectCategoryId(ALL_CATEGORY);
      return;
    }
    this.setData({ searchResults: this.matchProducts(this.data.items, searchTerm) });
  },
  matchProducts(items: CatalogItem[], term: string) {
    if (!term) return [];
    const query = term.toLocaleLowerCase();
    return items.filter((item) => item.name.toLocaleLowerCase().includes(query));
  },
  onCategoryTouchStart() {
    resetTabSwipe(this);
    this._categoryTouching = true;
  },
  onCategoryTouchEnd() {
    this._categoryTouching = false;
  },
  onCategoryTouchCancel() {
    this._categoryTouching = false;
  },
  open(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/product/index?id=${id}` });
  },
});
