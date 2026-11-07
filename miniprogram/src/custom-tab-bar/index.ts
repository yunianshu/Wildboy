import { TAB_ITEMS, syncTabBar, switchTab } from "../utils/tab-bar";

Component({
  data: { items: TAB_ITEMS, selected: "" },
  lifetimes: {
    attached() { this.syncSelection(); },
  },
  pageLifetimes: {
    show() { this.syncSelection(); },
  },
  methods: {
    syncSelection() {
      const route = syncTabBar();
      if (route) this.setData({ selected: route });
    },
    selectTab(event: WechatMiniprogram.TouchEvent) {
      switchTab(event.currentTarget.dataset.path);
    },
  },
});
