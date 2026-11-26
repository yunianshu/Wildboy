<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import { askConfirm } from "../confirm";
import AppIcon from "../components/AppIcon.vue";
import defaultBrandPreview from "../assets/platform-brand-original-transparent.png";
import ImageUpload from "../components/ImageUpload.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import {
  categories,
  type Activity,
  type HomeActionLink,
  type HomeGallerySlide,
  type HomeLayoutConfig,
  type HomeModuleId,
  type HomeQrImage,
  type HomeShortcutItem,
  type Page,
  type Product,
} from "../types";

const DEFAULT_BRAND = "/assets/platform-brand-original-transparent.png";
function brandPreviewUrl(url: string) {
  return url === DEFAULT_BRAND ? defaultBrandPreview : url;
}
const presetIconImages: Record<string, string> = {
  WEEKLY: "/assets/category-weekly.jpg",
  DOMESTIC: "/assets/category-domestic.jpg",
  QRCODE: "/assets/category-holiday.jpg",
  INTRO: "/assets/category-leisure.jpg",
};
const moduleLabels: Record<HomeModuleId, { title: string; desc: string }> = {
  HERO: { title: "顶部主视觉", desc: "头图、品牌标语与主标题" },
  SHORTCUTS: {
    title: "快捷入口区",
    desc: "首页入口、跳转链接和二维码",
  },
  ACTIVITIES: {
    title: "首页精选活动",
    desc: "选择活动并调整显示顺序",
  },
  SHOP: { title: "装备横幅与商品", desc: "横幅图文与首页精选装备" },
  GALLERY: { title: "山野之间轮播", desc: "自动取文章或自定义轮播图" },
  FOOTER: {
    title: "底部关注码与底图",
    desc: "扫码关注二维码 + 野小子底图及大小",
  },
};
const pageOptions = [
  ["WEEKLY", categories.WEEKLY],
  ["DOMESTIC", categories.DOMESTIC],
  ["HOLIDAY", categories.HOLIDAY],
  ["LEISURE", categories.LEISURE],
  ["ACTIVITIES", "全部活动"],
  ["SHOP", "装备商城"],
  ["PROFILE", "我的主页"],
] as const;
const iconPresets = [
  ["WEEKLY", "山野徒步图"],
  ["DOMESTIC", "远行山河图"],
  ["QRCODE", "露营星空图"],
  ["INTRO", "海岸休闲图"],
] as const;

type ArticleOption = { id: string; title: string; status: string };

const route = useRoute();
const layout = ref<HomeLayoutConfig | null>(null);
const snapshot = ref("");
const activeModule = ref<HomeModuleId>("ACTIVITIES");
const activeShortcutIdx = ref(0);
const loading = ref(false);
const saving = ref(false);
const conflict = ref(false);
const error = ref("");
const success = ref("");

const ACTIVITY_PAGE_SIZE = 50;
const activityCatalog = reactive(new Map<string, Activity>());
const allActivities = computed(() => [...activityCatalog.values()]);
const activityPage = ref<Page<Activity> | null>(null);
const activityLoading = ref(false);
const activityError = ref("");
let activityRequest: AbortController | undefined;
const allProducts = ref<Product[]>([]);
const allArticles = ref<ArticleOption[]>([]);
const activityFilter = ref("");
const dragModuleIdx = ref<number | null>(null);
const dragActivityIdx = ref<number | null>(null);
const dragShortcutIdx = ref<number | null>(null);
const dragQrIdx = ref<number | null>(null);
const dragFollowQrIdx = ref<number | null>(null);

const dirty = computed(
  () => !!layout.value && JSON.stringify(layout.value) !== snapshot.value,
);

function emptyAction(type: HomeActionLink["type"] = "NONE"): HomeActionLink {
  return {
    type,
    page: type === "PAGE" ? "ACTIVITIES" : "",
    activityId: "",
    articleId: type === "ARTICLE" ? "OFFICIAL" : "",
    wechatArticleUrl: "",
    popupTitle: "",
    popupText: "",
    popupImages: [],
  };
}

function normalizeLoaded(raw: HomeLayoutConfig): HomeLayoutConfig {
  const copy = JSON.parse(JSON.stringify(raw)) as HomeLayoutConfig;
  copy.hero.action = copy.hero.action || emptyAction("NONE");
  copy.hero.action.popupImages = copy.hero.action.popupImages || [];
  copy.shortcuts.columns = copy.shortcuts.columns || 4;
  copy.shortcuts.items = (copy.shortcuts.items || []).map((item, idx) => {
    const imgs =
      item.popupImages ??
      (item.popupImageUrl ? [{ url: item.popupImageUrl, label: "" }] : []);
    return {
      ...item,
      id: item.id || `slot-${idx + 1}`,
      imageUrl: item.imageUrl || "",
      activityId: item.activityId || "",
      wechatArticleUrl: item.wechatArticleUrl || "",
      popupImages: imgs,
    };
  });
  copy.activities.featuredActivityIds =
    copy.activities.featuredActivityIds || [];
  copy.shop.featuredProductIds = copy.shop.featuredProductIds || [];
  copy.gallery.slides = (copy.gallery.slides || []).map((s, idx) => ({
    ...s,
    id: s.id || `slide-${idx + 1}`,
    action: s.action || emptyAction("NONE"),
  }));
  copy.footer.followQrcodes = copy.footer.followQrcodes || [];
  copy.footer.brandImageUrl = copy.footer.brandImageUrl || DEFAULT_BRAND;
  copy.footer.brandWidthPx = copy.footer.brandWidthPx || 216;
  return copy;
}

async function load() {
  if (loading.value || saving.value || !currentUser.value) return;
  loading.value = true;
  error.value = "";
  success.value = "";
  conflict.value = false;
  try {
    const data = await request<HomeLayoutConfig>("/admin/home/layout");
    const normalized = normalizeLoaded(data);
    layout.value = normalized;
    snapshot.value = JSON.stringify(normalized);
    if (
      typeof route.query.section === "string" &&
      route.query.section in moduleLabels
    ) {
      activeModule.value = route.query.section as HomeModuleId;
    }
    void loadCatalogs(normalized.activities.featuredActivityIds);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function loadActivityPage(page = 0) {
  activityRequest?.abort();
  const controller = new AbortController();
  activityRequest = controller;
  activityLoading.value = true;
  activityError.value = "";
  const params = new URLSearchParams({
    page: String(page),
    size: String(ACTIVITY_PAGE_SIZE),
    status: "PUBLISHED",
  });
  const keyword = activityFilter.value.trim();
  if (keyword) params.set("keyword", keyword);
  try {
    const result = await request<Page<Activity>>(
      `/admin/activities?${params}`,
      {
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return;
    activityPage.value = result;
    for (const activity of result.items)
      activityCatalog.set(activity.id, activity);
  } catch (e) {
    if (!controller.signal.aborted) activityError.value = errorMessage(e);
  } finally {
    if (!controller.signal.aborted) activityLoading.value = false;
  }
}

watch(activityFilter, (_value, _previous, onCleanup) => {
  activityRequest?.abort();
  activityPage.value = null;
  activityLoading.value = true;
  activityError.value = "";
  const timer = setTimeout(() => void loadActivityPage(), 250);
  onCleanup(() => clearTimeout(timer));
});

async function loadCatalogs(featuredIds: string[]) {
  await Promise.allSettled([
    loadActivityPage().then(() => loadFeaturedActivities(featuredIds)),
    request<Product[]>("/admin/shop/products").then((products) => {
      allProducts.value = products.filter((p) => p.status === "ON_SALE");
    }),
    request<Page<ArticleOption>>("/admin/articles?page=0&size=50").then(
      (page) => {
        allArticles.value = page.items.filter((a) => a.status === "PUBLISHED");
      },
    ),
  ]);
}

async function loadFeaturedActivities(ids: string[]) {
  await Promise.allSettled(
    ids
      .filter((id) => !activityCatalog.has(id))
      .map(async (id) => {
        const activity = await request<Activity>(
          `/admin/activities/${encodeURIComponent(id)}`,
        );
        if (activity.status === "PUBLISHED") activityCatalog.set(id, activity);
      }),
  );
}

const selectedActivities = computed(() => {
  if (!layout.value) return [];
  return layout.value.activities.featuredActivityIds.map((id) => {
    const found = activityCatalog.get(id);
    return (
      found || {
        id,
        title: `活动 (${id.slice(0, 8)})`,
        category: "WEEKLY",
        coverUrl: "",
        location: "已选活动",
        startAt: "",
      }
    );
  });
});

const candidateActivities = computed(() => {
  if (!layout.value || !activityPage.value) return [];
  const chosen = new Set(layout.value.activities.featuredActivityIds);
  return activityPage.value.items.filter((a) => !chosen.has(a.id));
});

const activeShortcut = computed<HomeShortcutItem | null>(() => {
  const items = layout.value?.shortcuts.items;
  if (!items || !items.length) return null;
  return items[activeShortcutIdx.value] || items[0] || null;
});

function moveArrayItem<T>(arr: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= arr.length ||
    to >= arr.length
  )
    return;
  const [item] = arr.splice(from, 1);
  if (item !== undefined) arr.splice(to, 0, item);
}

// Module drag & reorder
function dropModule(toIdx: number) {
  if (!layout.value || dragModuleIdx.value === null) return;
  moveArrayItem(layout.value.modules, dragModuleIdx.value, toIdx);
  dragModuleIdx.value = null;
}

// Featured activities drag & reorder
function addFeaturedActivity(id: string) {
  if (!layout.value) return;
  const list = layout.value.activities.featuredActivityIds;
  if (list.length >= 12 || list.includes(id)) return;
  list.push(id);
}
function removeFeaturedActivity(idx: number) {
  layout.value?.activities.featuredActivityIds.splice(idx, 1);
}
function dropFeaturedActivity(toIdx: number) {
  if (!layout.value || dragActivityIdx.value === null) return;
  moveArrayItem(
    layout.value.activities.featuredActivityIds,
    dragActivityIdx.value,
    toIdx,
  );
  dragActivityIdx.value = null;
}

// Shortcuts add/remove/drag
function addShortcut() {
  if (!layout.value || layout.value.shortcuts.items.length >= 8) return;
  layout.value.shortcuts.items.push({
    id: `slot-${Date.now().toString(36)}`,
    name: "新入口",
    icon: "WEEKLY",
    imageUrl: "",
    type: "PAGE",
    page: "ACTIVITIES",
    activityId: "",
    articleId: "OFFICIAL",
    wechatArticleUrl: "",
    popupTitle: "",
    popupText: "",
    popupImageUrl: "",
    popupImages: [],
  });
  activeShortcutIdx.value = layout.value.shortcuts.items.length - 1;
}
function removeShortcut(idx: number) {
  if (!layout.value || layout.value.shortcuts.items.length <= 1) return;
  layout.value.shortcuts.items.splice(idx, 1);
  if (activeShortcutIdx.value >= layout.value.shortcuts.items.length) {
    activeShortcutIdx.value = Math.max(
      0,
      layout.value.shortcuts.items.length - 1,
    );
  }
}
function dropShortcut(toIdx: number) {
  if (!layout.value || dragShortcutIdx.value === null) return;
  moveArrayItem(layout.value.shortcuts.items, dragShortcutIdx.value, toIdx);
  activeShortcutIdx.value = toIdx;
  dragShortcutIdx.value = null;
}
function addPopupQr(list: HomeQrImage[], url: string) {
  if (list.length >= 8) return;
  list.push({ url, label: "" });
}
function dropPopupQr(list: HomeQrImage[], toIdx: number) {
  if (dragQrIdx.value === null) return;
  moveArrayItem(list, dragQrIdx.value, toIdx);
  dragQrIdx.value = null;
}

// Shop featured products
function toggleFeaturedProduct(id: string) {
  if (!layout.value) return;
  const list = layout.value.shop.featuredProductIds;
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else if (list.length < 8) list.push(id);
}

// Custom gallery slides
function addGallerySlide(url: string) {
  if (!layout.value || layout.value.gallery.slides.length >= 10) return;
  const slide: HomeGallerySlide = {
    id: `slide-${Date.now().toString(36)}`,
    imageUrl: url,
    title: "山野时刻",
    subtitle: "一起走进自然",
    action: emptyAction("NONE"),
  };
  layout.value.gallery.slides.push(slide);
}

// Footer QRs
function addFollowQr(url: string) {
  if (!layout.value || layout.value.footer.followQrcodes.length >= 6) return;
  layout.value.footer.followQrcodes.push({ url, label: "扫码关注" });
}
function dropFollowQr(toIdx: number) {
  if (!layout.value || dragFollowQrIdx.value === null) return;
  moveArrayItem(
    layout.value.footer.followQrcodes,
    dragFollowQrIdx.value,
    toIdx,
  );
  dragFollowQrIdx.value = null;
}

async function save() {
  if (!layout.value || saving.value || conflict.value) return;
  error.value = "";
  success.value = "";
  saving.value = true;
  try {
    const saved = await request<HomeLayoutConfig>("/admin/home/layout", {
      method: "PUT",
      body: JSON.stringify(layout.value),
    });
    const normalized = normalizeLoaded(saved);
    layout.value = normalized;
    snapshot.value = JSON.stringify(normalized);
    success.value = "首页配置已保存，小程序下拉或重新进入首页即刻生效。";
  } catch (e) {
    conflict.value = e instanceof ApiError && e.status === 409;
    error.value = conflict.value
      ? "首页配置已被其他管理员修改，请重新加载后再保存。"
      : errorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function reloadAfterConflict() {
  if (
    !dirty.value ||
    (await askConfirm("重新加载将放弃当前未保存的首页修改，确定继续吗？"))
  ) {
    await load();
  }
}

function protectBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || saving.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onBeforeRouteLeave(
  async (to) =>
    to.path === "/login" ||
    (!saving.value &&
      (!dirty.value || (await askConfirm("首页配置尚未保存，确定离开吗？")))),
);
watch(currentUser, (u) => {
  if (u) void load();
});
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", protectBeforeUnload);
});
onUnmounted(() => {
  activityRequest?.abort();
  window.removeEventListener("beforeunload", protectBeforeUnload);
});
</script>

<template>
  <main class="workspace layout-workspace">
    <header class="page-heading">
      <div>
        <h1>小程序首页配置</h1>
        <p class="muted">
          在这里统一管理小程序首页的快捷入口、精选活动和其他展示板块。
        </p>
      </div>
      <div class="heading-actions">
        <span v-if="dirty && !saving" class="dirty-badge" role="status"
          >有未保存改动</span
        >
        <button
          v-if="conflict"
          type="button"
          class="secondary"
          @click="reloadAfterConflict"
        >
          加载最新版本
        </button>
        <button
          type="button"
          class="primary"
          :disabled="saving || loading || conflict || !layout"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存首页配置" }}
        </button>
      </div>
    </header>

    <p v-if="success" role="status" class="success-box">{{ success }}</p>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>

    <UiState v-if="loading" kind="loading" compact>正在加载首页配置…</UiState>

    <div v-else-if="layout" class="builder-grid">
      <!-- Left: Draggable module rail -->
      <aside class="module-rail" aria-label="首页板块排序与显隐">
        <div class="rail-header">
          <h2>板块顺序与显隐</h2>
          <small>选择板块编辑，也可拖动调整顺序</small>
        </div>
        <ul class="module-list">
          <li
            v-for="(mod, idx) in layout.modules"
            :key="mod.id"
            class="module-card"
            :class="{
              'is-active': activeModule === mod.id,
              'is-disabled': !mod.enabled,
            }"
            draggable="true"
            @dragstart="dragModuleIdx = idx"
            @dragover.prevent
            @drop="dropModule(idx)"
            @click="activeModule = mod.id"
          >
            <div class="module-card-top">
              <button
                type="button"
                class="text-button module-select"
                :aria-pressed="activeModule === mod.id"
                @click.stop="activeModule = mod.id"
              >
                <span aria-hidden="true">{{ idx + 1 }}.</span>
                {{ moduleLabels[mod.id]?.title }}
              </button>
              <label class="switch-inline" @click.stop>
                <input v-model="mod.enabled" type="checkbox" />
                <span>{{ mod.enabled ? "显示" : "隐藏" }}</span>
              </label>
            </div>
            <small>{{ moduleLabels[mod.id]?.desc }}</small>
            <div class="module-move" @click.stop>
              <button
                type="button"
                class="text-button"
                :disabled="idx === 0"
                @click="moveArrayItem(layout.modules, idx, idx - 1)"
              >
                上移
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="idx === layout.modules.length - 1"
                @click="moveArrayItem(layout.modules, idx, idx + 1)"
              >
                下移
              </button>
            </div>
          </li>
        </ul>
      </aside>

      <!-- Center: Active module editor -->
      <section class="module-editor">
        <!-- 1. HERO -->
        <div v-if="activeModule === 'HERO'" class="editor-panel">
          <h2>顶部主视觉（头图与主标题）</h2>
          <div class="image-setting-row">
            <img
              :src="layout.hero.imageUrl"
              alt="顶部主视觉预览"
              class="banner-thumb"
            />
            <div class="image-setting-controls">
              <ImageUpload
                label="上传替换顶部主图"
                @uploaded="layout.hero.imageUrl = $event"
              />
              <button
                v-if="layout.hero.imageUrl !== '/assets/hero-hiking.jpg'"
                type="button"
                class="text-button"
                @click="layout.hero.imageUrl = '/assets/hero-hiking.jpg'"
              >
                恢复默认山野主图
              </button>
            </div>
          </div>
          <div class="field-row">
            <label>
              左上角品牌名
              <input
                v-model="layout.hero.brandName"
                maxlength="24"
                placeholder="野小子"
              />
            </label>
            <label>
              左上角品牌副标
              <input
                v-model="layout.hero.brandCaption"
                maxlength="40"
                placeholder="野一点，自由一点"
              />
            </label>
          </div>
          <label>
            英文眉题 (Kicker)
            <input
              v-model="layout.hero.kicker"
              maxlength="60"
              placeholder="WILDBOY / OUTDOOR CLUB"
            />
          </label>
          <div class="field-row">
            <label>
              主标题
              <input
                v-model="layout.hero.title"
                maxlength="60"
                placeholder="去山野，找回自己。"
              />
            </label>
            <label>
              副标题
              <input
                v-model="layout.hero.subtitle"
                maxlength="80"
                placeholder="把日常留在身后 · 一起走出去"
              />
            </label>
          </div>
          <div class="sub-box">
            <h3>点击头图跳转动作（可选）</h3>
            <label>
              跳转方式
              <select v-model="layout.hero.action.type">
                <option value="NONE">不跳转（纯展示）</option>
                <option value="PAGE">打开小程序页面</option>
                <option value="ACTIVITY">打开指定活动</option>
                <option value="ARTICLE">打开小程序文章</option>
                <option value="WECHAT_ARTICLE">打开微信公众号文章</option>
              </select>
            </label>
            <label v-if="layout.hero.action.type === 'PAGE'">
              目标页面
              <select v-model="layout.hero.action.page">
                <option v-for="[k, label] in pageOptions" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'ACTIVITY'">
              选择活动
              <select v-model="layout.hero.action.activityId">
                <option value="">请选择活动</option>
                <option v-for="a in allActivities" :key="a.id" :value="a.id">
                  {{ a.title }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'ARTICLE'">
              选择文章
              <select v-model="layout.hero.action.articleId">
                <option value="OFFICIAL">官方介绍</option>
                <option
                  v-for="art in allArticles"
                  :key="art.id"
                  :value="art.id"
                >
                  {{ art.title }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'WECHAT_ARTICLE'">
              微信公众号文章链接
              <input
                v-model="layout.hero.action.wechatArticleUrl"
                placeholder="https://mp.weixin.qq.com/s/..."
              />
            </label>
          </div>
        </div>

        <!-- 2. SHORTCUTS -->
        <div v-else-if="activeModule === 'SHORTCUTS'" class="editor-panel">
          <div class="panel-head">
            <div>
              <h2>快捷入口区（支持自由增删、拖动排序、多二维码、跳公众号）</h2>
            </div>
            <div class="inline-controls">
              <label class="compact-select">
                每行列数
                <select v-model.number="layout.shortcuts.columns">
                  <option :value="2">每行 2 个</option>
                  <option :value="3">每行 3 个</option>
                  <option :value="4">每行 4 个</option>
                </select>
              </label>
              <button
                type="button"
                class="secondary"
                :disabled="layout.shortcuts.items.length >= 8"
                @click="addShortcut"
              >
                <AppIcon name="plus" :size="15" /> 新增入口
              </button>
            </div>
          </div>

          <div class="shortcut-chips">
            <div
              v-for="(sc, idx) in layout.shortcuts.items"
              :key="sc.id"
              class="shortcut-chip"
              :class="{ 'is-selected': activeShortcutIdx === idx }"
              draggable="true"
              @dragstart="dragShortcutIdx = idx"
              @dragover.prevent
              @drop="dropShortcut(idx)"
              @click="activeShortcutIdx = idx"
            >
              <img
                :src="
                  sc.imageUrl ||
                  presetIconImages[sc.icon] ||
                  presetIconImages.WEEKLY
                "
                alt=""
              />
              <span>{{ idx + 1 }}. {{ sc.name || "未命名" }}</span>
            </div>
          </div>

          <div v-if="activeShortcut" class="sub-box">
            <div class="panel-head">
              <h3>
                正在编辑第 {{ activeShortcutIdx + 1 }} 个入口：{{
                  activeShortcut.name
                }}
              </h3>
              <div class="inline-controls">
                <button
                  type="button"
                  class="text-button"
                  :disabled="activeShortcutIdx === 0"
                  @click="
                    moveArrayItem(
                      layout.shortcuts.items,
                      activeShortcutIdx,
                      activeShortcutIdx - 1,
                    );
                    activeShortcutIdx--;
                  "
                >
                  左移
                </button>
                <button
                  type="button"
                  class="text-button"
                  :disabled="
                    activeShortcutIdx === layout.shortcuts.items.length - 1
                  "
                  @click="
                    moveArrayItem(
                      layout.shortcuts.items,
                      activeShortcutIdx,
                      activeShortcutIdx + 1,
                    );
                    activeShortcutIdx++;
                  "
                >
                  右移
                </button>
                <button
                  v-if="layout.shortcuts.items.length > 1"
                  type="button"
                  class="text-button danger-text"
                  @click="removeShortcut(activeShortcutIdx)"
                >
                  删除此入口
                </button>
              </div>
            </div>

            <div class="field-row">
              <label>
                入口名称（1–12字）
                <input
                  v-model="activeShortcut.name"
                  maxlength="12"
                  placeholder="如：关于野小子"
                />
              </label>
              <label>
                默认底图风格（未上传自定义图时使用）
                <select v-model="activeShortcut.icon">
                  <option v-for="[k, label] in iconPresets" :key="k" :value="k">
                    {{ label }}
                  </option>
                </select>
              </label>
            </div>

            <div class="image-setting-row">
              <img
                :src="
                  activeShortcut.imageUrl ||
                  presetIconImages[activeShortcut.icon] ||
                  presetIconImages.WEEKLY
                "
                alt="入口背景图"
                class="small-thumb"
              />
              <div class="image-setting-controls">
                <ImageUpload
                  label="上传自定义入口封面图"
                  @uploaded="activeShortcut.imageUrl = $event"
                />
                <button
                  v-if="activeShortcut.imageUrl"
                  type="button"
                  class="text-button"
                  @click="activeShortcut.imageUrl = ''"
                >
                  恢复使用预设底图
                </button>
              </div>
            </div>

            <label>
              点击后执行动作
              <select v-model="activeShortcut.type">
                <option value="PAGE">打开小程序内页面</option>
                <option value="WECHAT_ARTICLE">
                  打开微信公众号文章（推荐用于「关于野小子」）
                </option>
                <option value="POPUP">
                  弹出二维码 / 图文说明（支持上传多个二维码）
                </option>
                <option value="ACTIVITY">打开指定活动详情</option>
                <option value="ARTICLE">打开小程序内置文章</option>
              </select>
            </label>

            <label v-if="activeShortcut.type === 'PAGE'">
              选择小程序页面
              <select v-model="activeShortcut.page">
                <option v-for="[k, label] in pageOptions" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </label>

            <div
              v-else-if="activeShortcut.type === 'WECHAT_ARTICLE'"
              class="wechat-tip-box"
            >
              <label>
                微信公众号文章链接（必须为已发布公开文章）
                <input
                  v-model="activeShortcut.wechatArticleUrl"
                  placeholder="https://mp.weixin.qq.com/s/..."
                />
              </label>
              <small class="field-hint">
                复制公众号后台或微信内「复制链接」得到的
                https://mp.weixin.qq.com/s/...
                地址即可，用户点击将在小程序内直接打开该公众号文章。
              </small>
            </div>

            <label v-else-if="activeShortcut.type === 'ACTIVITY'">
              选择目标活动
              <select v-model="activeShortcut.activityId">
                <option value="">请选择已发布活动</option>
                <option v-for="a in allActivities" :key="a.id" :value="a.id">
                  {{ a.title }}
                </option>
              </select>
            </label>

            <label v-else-if="activeShortcut.type === 'ARTICLE'">
              选择小程序内置文章
              <select v-model="activeShortcut.articleId">
                <option value="OFFICIAL">官方介绍</option>
                <option
                  v-for="art in allArticles"
                  :key="art.id"
                  :value="art.id"
                >
                  {{ art.title }}
                </option>
              </select>
            </label>

            <div
              v-else-if="activeShortcut.type === 'POPUP'"
              class="popup-qr-editor"
            >
              <label>
                弹窗标题
                <input
                  v-model="activeShortcut.popupTitle"
                  maxlength="80"
                  placeholder="如：添加领队 / 扫码进活动群"
                />
              </label>
              <label>
                弹窗文字说明（选填）
                <textarea
                  v-model="activeShortcut.popupText"
                  rows="3"
                  maxlength="2000"
                  placeholder="如：长按二维码即可识别添加客服或关注公众号"
                />
              </label>
              <div class="qr-section-head">
                <strong
                  >二维码 / 图片列表（{{ activeShortcut.popupImages.length }} /
                  8，可拖动排序）</strong
                >
                <ImageUpload
                  v-if="activeShortcut.popupImages.length < 8"
                  :key="`sc-qr-${activeShortcut.popupImages.length}`"
                  label="上传二维码图片"
                  @uploaded="addPopupQr(activeShortcut.popupImages, $event)"
                />
              </div>
              <div
                v-if="activeShortcut.popupImages.length"
                class="qr-cards-grid"
              >
                <div
                  v-for="(qr, qIdx) in activeShortcut.popupImages"
                  :key="qIdx"
                  class="qr-card"
                  draggable="true"
                  @dragstart="dragQrIdx = qIdx"
                  @dragover.prevent
                  @drop="dropPopupQr(activeShortcut.popupImages, qIdx)"
                >
                  <img :src="qr.url" alt="二维码预览" />
                  <input
                    v-model="qr.label"
                    maxlength="40"
                    placeholder="二维码名称（如：客服微信）"
                  />
                  <div class="qr-card-actions">
                    <button
                      type="button"
                      class="text-button"
                      :disabled="qIdx === 0"
                      @click="
                        moveArrayItem(
                          activeShortcut.popupImages,
                          qIdx,
                          qIdx - 1,
                        )
                      "
                    >
                      前移
                    </button>
                    <button
                      type="button"
                      class="text-button"
                      :disabled="qIdx === activeShortcut.popupImages.length - 1"
                      @click="
                        moveArrayItem(
                          activeShortcut.popupImages,
                          qIdx,
                          qIdx + 1,
                        )
                      "
                    >
                      后移
                    </button>
                    <button
                      type="button"
                      class="text-button danger-text"
                      @click="activeShortcut.popupImages.splice(qIdx, 1)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. ACTIVITIES (Drag-sort 6 activities!) -->
        <div v-else-if="activeModule === 'ACTIVITIES'" class="editor-panel">
          <h2>首页精选活动</h2>
          <div class="field-row">
            <label>
              英文眉题
              <input v-model="layout.activities.eyebrow" maxlength="80" />
            </label>
            <label>
              板块主标题
              <input v-model="layout.activities.title" maxlength="40" />
            </label>
            <label>
              最多展示数量
              <input
                v-model.number="layout.activities.maxCount"
                type="number"
                min="1"
                max="12"
              />
            </label>
          </div>
          <div class="inline-controls">
            <label class="field checkbox-field">
              <input v-model="layout.activities.autoFill" type="checkbox" />
              手动精选题数不足
              {{ layout.activities.maxCount }}
              个时，自动按出发时间补齐其他已发布活动
            </label>
            <label class="field checkbox-field">
              <input v-model="layout.activities.showAllLink" type="checkbox" />
              显示右上角「全部」入口
            </label>
          </div>

          <div class="sub-box">
            <h3>
              已排定首页展示顺序（共
              {{ selectedActivities.length }} 场，按住卡片拖动即可调整前后位置）
            </h3>
            <p v-if="!selectedActivities.length" class="muted">
              当前未手动指定置顶活动，小程序将按出发时间自动展示最近
              {{ layout.activities.maxCount }}
              场活动。可从下方列表点击「加入首页」固定位置。
            </p>
            <div v-else class="featured-act-grid">
              <div
                v-for="(act, idx) in selectedActivities"
                :key="act.id"
                class="featured-act-card"
                draggable="true"
                @dragstart="dragActivityIdx = idx"
                @dragover.prevent
                @drop="dropFeaturedActivity(idx)"
              >
                <span class="slot-badge">第 {{ idx + 1 }} 位</span>
                <img v-if="act.coverUrl" :src="act.coverUrl" alt="" />
                <div class="featured-act-info">
                  <strong>{{ act.title }}</strong>
                  <small>{{ act.location }}</small>
                </div>
                <div class="featured-act-actions">
                  <button
                    type="button"
                    class="text-button"
                    :disabled="idx === 0"
                    @click="
                      moveArrayItem(
                        layout.activities.featuredActivityIds,
                        idx,
                        idx - 1,
                      )
                    "
                  >
                    前移
                  </button>
                  <button
                    type="button"
                    class="text-button"
                    :disabled="idx === selectedActivities.length - 1"
                    @click="
                      moveArrayItem(
                        layout.activities.featuredActivityIds,
                        idx,
                        idx + 1,
                      )
                    "
                  >
                    后移
                  </button>
                  <button
                    type="button"
                    class="text-button danger-text"
                    @click="removeFeaturedActivity(idx)"
                  >
                    移出
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="sub-box">
            <div class="panel-head">
              <h3>可选已发布活动</h3>
              <input
                v-model="activityFilter"
                type="search"
                class="compact-search"
                placeholder="搜索活动名称或地点…"
                maxlength="100"
              />
            </div>
            <p v-if="activityLoading" role="status" class="muted">
              正在加载活动…
            </p>
            <p v-else-if="activityError" role="alert" class="error-box">
              {{ activityError }}
              <button
                type="button"
                class="text-button"
                @click="loadActivityPage()"
              >
                重试
              </button>
            </p>
            <ul v-else-if="candidateActivities.length" class="candidate-list">
              <li v-for="act in candidateActivities" :key="act.id">
                <div>
                  <strong>{{ act.title }}</strong>
                  <small class="muted"> · {{ act.location }}</small>
                </div>
                <button
                  type="button"
                  class="secondary"
                  :disabled="layout.activities.featuredActivityIds.length >= 12"
                  @click="addFeaturedActivity(act.id)"
                >
                  加入首页排位
                </button>
              </li>
            </ul>
            <p v-else class="muted">本页没有可添加的已发布活动。</p>
            <PaginationBar
              v-if="activityPage && !activityError"
              :page="activityPage.page"
              :page-size="activityPage.size"
              :total="activityPage.total"
              :has-more="activityPage.hasMore"
              :busy="activityLoading"
              label="可选活动分页"
              @change="loadActivityPage"
            />
          </div>
        </div>

        <!-- 4. SHOP -->
        <div v-else-if="activeModule === 'SHOP'" class="editor-panel">
          <h2>装备横幅与精选商品</h2>
          <label class="field checkbox-field">
            <input v-model="layout.shop.showBanner" type="checkbox" />
            显示通栏装备横幅
          </label>
          <div v-if="layout.shop.showBanner" class="sub-box">
            <div class="image-setting-row">
              <img
                :src="layout.shop.bannerImageUrl"
                alt=""
                class="banner-thumb"
              />
              <div class="image-setting-controls">
                <ImageUpload
                  label="上传替换装备横幅图"
                  @uploaded="layout.shop.bannerImageUrl = $event"
                />
                <button
                  v-if="
                    layout.shop.bannerImageUrl !==
                    '/assets/equipment-banner.jpg'
                  "
                  type="button"
                  class="text-button"
                  @click="
                    layout.shop.bannerImageUrl = '/assets/equipment-banner.jpg'
                  "
                >
                  恢复默认横幅图
                </button>
              </div>
            </div>
            <div class="field-row">
              <label>
                横幅小标签
                <input v-model="layout.shop.bannerTag" maxlength="60" />
              </label>
              <label>
                横幅主标题
                <input v-model="layout.shop.bannerTitle" maxlength="60" />
              </label>
              <label>
                按钮文字
                <input v-model="layout.shop.bannerCta" maxlength="24" />
              </label>
            </div>
          </div>

          <div class="inline-controls">
            <label class="field checkbox-field">
              <input v-model="layout.shop.showProducts" type="checkbox" />
              显示首页商品卡片网格
            </label>
            <label class="compact-select">
              展示件数
              <input
                v-model.number="layout.shop.maxCount"
                type="number"
                min="1"
                max="8"
              />
            </label>
            <label class="field checkbox-field">
              <input v-model="layout.shop.autoFill" type="checkbox" />
              自动补齐在售商品
            </label>
          </div>

          <div
            v-if="layout.shop.showProducts && allProducts.length"
            class="sub-box"
          >
            <h3>选择优先展示的商品（按勾选先后排序）</h3>
            <div class="product-pick-grid">
              <button
                v-for="prod in allProducts"
                :key="prod.id"
                type="button"
                class="product-pick-btn"
                :class="{
                  'is-picked': layout.shop.featuredProductIds.includes(prod.id),
                }"
                @click="toggleFeaturedProduct(prod.id)"
              >
                <img :src="prod.imageUrl" alt="" />
                <span>{{ prod.name }}</span>
                <small v-if="layout.shop.featuredProductIds.includes(prod.id)">
                  第
                  {{ layout.shop.featuredProductIds.indexOf(prod.id) + 1 }} 位
                </small>
              </button>
            </div>
          </div>
        </div>

        <!-- 5. GALLERY -->
        <div v-else-if="activeModule === 'GALLERY'" class="editor-panel">
          <h2>山野之间轮播区</h2>
          <div class="field-row">
            <label>
              英文眉题
              <input v-model="layout.gallery.eyebrow" maxlength="80" />
            </label>
            <label>
              板块标题
              <input v-model="layout.gallery.title" maxlength="40" />
            </label>
            <label>
              数据来源
              <select v-model="layout.gallery.mode">
                <option value="AUTO_ARTICLES">
                  自动展示已发布文章（默认）
                </option>
                <option value="CUSTOM">自定义上传轮播图与跳转</option>
              </select>
            </label>
          </div>

          <div v-if="layout.gallery.mode === 'CUSTOM'" class="sub-box">
            <div class="panel-head">
              <h3>自定义轮播图（{{ layout.gallery.slides.length }} / 10）</h3>
              <ImageUpload
                v-if="layout.gallery.slides.length < 10"
                :key="`slide-up-${layout.gallery.slides.length}`"
                label="上传新增轮播图"
                @uploaded="addGallerySlide"
              />
            </div>
            <div
              v-for="(slide, sIdx) in layout.gallery.slides"
              :key="slide.id"
              class="slide-row"
            >
              <img :src="slide.imageUrl" alt="" class="small-thumb" />
              <div class="slide-fields">
                <div class="field-row">
                  <input
                    v-model="slide.title"
                    maxlength="80"
                    placeholder="轮播主标题"
                  />
                  <input
                    v-model="slide.subtitle"
                    maxlength="160"
                    placeholder="副标题"
                  />
                </div>
                <div class="field-row">
                  <select v-model="slide.action.type">
                    <option value="NONE">点击不跳转</option>
                    <option value="WECHAT_ARTICLE">跳微信公众号文章</option>
                    <option value="ACTIVITY">跳指定活动</option>
                    <option value="ARTICLE">跳小程序文章</option>
                  </select>
                  <input
                    v-if="slide.action.type === 'WECHAT_ARTICLE'"
                    v-model="slide.action.wechatArticleUrl"
                    placeholder="https://mp.weixin.qq.com/s/..."
                  />
                  <select
                    v-else-if="slide.action.type === 'ACTIVITY'"
                    v-model="slide.action.activityId"
                  >
                    <option value="">选择活动</option>
                    <option
                      v-for="a in allActivities"
                      :key="a.id"
                      :value="a.id"
                    >
                      {{ a.title }}
                    </option>
                  </select>
                  <select
                    v-else-if="slide.action.type === 'ARTICLE'"
                    v-model="slide.action.articleId"
                  >
                    <option value="OFFICIAL">官方介绍</option>
                    <option
                      v-for="art in allArticles"
                      :key="art.id"
                      :value="art.id"
                    >
                      {{ art.title }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="slide-actions">
                <button
                  type="button"
                  class="text-button"
                  :disabled="sIdx === 0"
                  @click="moveArrayItem(layout.gallery.slides, sIdx, sIdx - 1)"
                >
                  上移
                </button>
                <button
                  type="button"
                  class="text-button danger-text"
                  @click="layout.gallery.slides.splice(sIdx, 1)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. FOOTER (Scan-to-follow QRs + Wildboy brand image & size!) -->
        <div v-else-if="activeModule === 'FOOTER'" class="editor-panel">
          <h2>底部「扫码关注」二维码 & 「野小子」底图设置</h2>

          <div class="sub-box">
            <label class="field checkbox-field">
              <input v-model="layout.footer.followEnabled" type="checkbox" />
              在小程序首页底部显示「扫码关注」二维码区域（支持长按识别关注公众号/加群）
            </label>
            <template v-if="layout.footer.followEnabled">
              <div class="field-row">
                <label>
                  关注区标题
                  <input
                    v-model="layout.footer.followTitle"
                    maxlength="60"
                    placeholder="关注野小子公众号"
                  />
                </label>
                <label>
                  引导副文案
                  <input
                    v-model="layout.footer.followSubtitle"
                    maxlength="120"
                    placeholder="长按识别二维码 · 获取最新山野路线与活动动态"
                  />
                </label>
              </div>

              <div class="qr-section-head">
                <strong
                  >底部二维码列表（{{ layout.footer.followQrcodes.length }} /
                  6，可上传多个并拖动排序）</strong
                >
                <ImageUpload
                  v-if="layout.footer.followQrcodes.length < 6"
                  :key="`footer-qr-${layout.footer.followQrcodes.length}`"
                  label="上传关注二维码"
                  @uploaded="addFollowQr"
                />
              </div>

              <div
                v-if="layout.footer.followQrcodes.length"
                class="qr-cards-grid"
              >
                <div
                  v-for="(qr, qIdx) in layout.footer.followQrcodes"
                  :key="qIdx"
                  class="qr-card"
                  draggable="true"
                  @dragstart="dragFollowQrIdx = qIdx"
                  @dragover.prevent
                  @drop="dropFollowQr(qIdx)"
                >
                  <img :src="qr.url" alt="底部关注二维码" />
                  <input
                    v-model="qr.label"
                    maxlength="40"
                    placeholder="如：微信公众号 / 客服微信"
                  />
                  <div class="qr-card-actions">
                    <button
                      type="button"
                      class="text-button"
                      :disabled="qIdx === 0"
                      @click="
                        moveArrayItem(
                          layout.footer.followQrcodes,
                          qIdx,
                          qIdx - 1,
                        )
                      "
                    >
                      前移
                    </button>
                    <button
                      type="button"
                      class="text-button danger-text"
                      @click="layout.footer.followQrcodes.splice(qIdx, 1)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="sub-box">
            <label class="field checkbox-field">
              <input v-model="layout.footer.brandEnabled" type="checkbox" />
              显示底部「野小子」品牌标识底图
            </label>
            <template v-if="layout.footer.brandEnabled">
              <div class="image-setting-row">
                <div class="brand-preview-box">
                  <img
                    :src="brandPreviewUrl(layout.footer.brandImageUrl)"
                    alt="野小子底图预览"
                    :style="{
                      width: `${Math.round(layout.footer.brandWidthPx * 0.65)}px`,
                    }"
                  />
                </div>
                <div class="image-setting-controls">
                  <ImageUpload
                    label="上传替换野小子底图"
                    @uploaded="layout.footer.brandImageUrl = $event"
                  />
                  <button
                    v-if="layout.footer.brandImageUrl !== DEFAULT_BRAND"
                    type="button"
                    class="text-button"
                    @click="layout.footer.brandImageUrl = DEFAULT_BRAND"
                  >
                    恢复默认透明野小子底图
                  </button>
                </div>
              </div>

              <div class="size-slider-row">
                <label>
                  底图显示宽度：<strong
                    >{{ layout.footer.brandWidthPx }} px</strong
                  >（小程序内实际显示宽度，范围 80–360px）
                </label>
                <div class="slider-inputs">
                  <input
                    v-model.number="layout.footer.brandWidthPx"
                    type="range"
                    min="80"
                    max="360"
                    step="4"
                  />
                  <input
                    v-model.number="layout.footer.brandWidthPx"
                    type="number"
                    min="80"
                    max="360"
                    class="px-number"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>
      </section>

      <!-- Right: Compact Live Miniprogram Wireframe Preview -->
      <aside class="phone-preview" aria-label="小程序首页结构预览">
        <div class="phone-frame">
          <div class="phone-notch">小程序探索页实时预览</div>
          <div class="phone-body">
            <template v-for="mod in layout.modules" :key="mod.id">
              <div
                v-if="mod.enabled && mod.id === 'HERO'"
                class="pv-hero pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'HERO'"
                aria-label="编辑首屏模块"
                @click="activeModule = 'HERO'"
                @keydown.enter.prevent="activeModule = 'HERO'"
                @keydown.space.prevent="activeModule = 'HERO'"
              >
                <img :src="layout.hero.imageUrl" alt="" />
                <div class="pv-hero-shade">
                  <small>{{ layout.hero.brandName }}</small>
                  <strong>{{ layout.hero.title }}</strong>
                  <span>{{ layout.hero.subtitle }}</span>
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'SHORTCUTS'"
                class="pv-shortcuts pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'SHORTCUTS'"
                aria-label="编辑快捷入口模块"
                :style="{
                  gridTemplateColumns: `repeat(${layout.shortcuts.columns}, minmax(0, 1fr))`,
                }"
                @click="activeModule = 'SHORTCUTS'"
                @keydown.enter.prevent="activeModule = 'SHORTCUTS'"
                @keydown.space.prevent="activeModule = 'SHORTCUTS'"
              >
                <div
                  v-for="sc in layout.shortcuts.items"
                  :key="sc.id"
                  class="pv-shortcut-cell"
                >
                  <img
                    :src="
                      sc.imageUrl ||
                      presetIconImages[sc.icon] ||
                      presetIconImages.WEEKLY
                    "
                    alt=""
                  />
                  <span>{{ sc.name }}</span>
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'ACTIVITIES'"
                class="pv-block pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'ACTIVITIES'"
                aria-label="编辑活动模块"
                @click="activeModule = 'ACTIVITIES'"
                @keydown.enter.prevent="activeModule = 'ACTIVITIES'"
                @keydown.space.prevent="activeModule = 'ACTIVITIES'"
              >
                <div class="pv-block-title">{{ layout.activities.title }}</div>
                <div class="pv-mini-grid">
                  <div
                    v-for="(act, idx) in selectedActivities.slice(
                      0,
                      layout.activities.maxCount,
                    )"
                    :key="act.id"
                    class="pv-mini-card"
                  >
                    <span>#{{ idx + 1 }} {{ act.title }}</span>
                  </div>
                  <div
                    v-if="!selectedActivities.length"
                    class="pv-mini-placeholder"
                  >
                    自动展示最多 {{ layout.activities.maxCount }} 场活动
                  </div>
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'SHOP'"
                class="pv-block pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'SHOP'"
                aria-label="编辑装备商城模块"
                @click="activeModule = 'SHOP'"
                @keydown.enter.prevent="activeModule = 'SHOP'"
                @keydown.space.prevent="activeModule = 'SHOP'"
              >
                <div v-if="layout.shop.showBanner" class="pv-shop-banner">
                  <strong>{{ layout.shop.bannerTitle }}</strong>
                  <small>{{ layout.shop.bannerCta }}</small>
                </div>
                <div
                  v-if="layout.shop.showProducts"
                  class="pv-mini-placeholder"
                >
                  精选装备 × {{ layout.shop.maxCount }}
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'GALLERY'"
                class="pv-block pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'GALLERY'"
                aria-label="编辑图集轮播模块"
                @click="activeModule = 'GALLERY'"
                @keydown.enter.prevent="activeModule = 'GALLERY'"
                @keydown.space.prevent="activeModule = 'GALLERY'"
              >
                <div class="pv-block-title">{{ layout.gallery.title }}</div>
                <div class="pv-mini-placeholder">
                  {{
                    layout.gallery.mode === "CUSTOM"
                      ? `自定义轮播 (${layout.gallery.slides.length} 张)`
                      : "自动山野文章轮播"
                  }}
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'FOOTER'"
                class="pv-footer pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'FOOTER'"
                aria-label="编辑页脚模块"
                @click="activeModule = 'FOOTER'"
                @keydown.enter.prevent="activeModule = 'FOOTER'"
                @keydown.space.prevent="activeModule = 'FOOTER'"
              >
                <div v-if="layout.footer.followEnabled" class="pv-follow-box">
                  <strong>{{ layout.footer.followTitle || "关注我们" }}</strong>
                  <small>{{ layout.footer.followSubtitle }}</small>
                  <div class="pv-qr-row">
                    <div
                      v-for="(qr, idx) in layout.footer.followQrcodes"
                      :key="idx"
                      class="pv-qr-item"
                    >
                      <img :src="qr.url" alt="" />
                      <span>{{ qr.label }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="layout.footer.brandEnabled" class="pv-brand-wrap">
                  <img
                    :src="brandPreviewUrl(layout.footer.brandImageUrl)"
                    alt=""
                    :style="{
                      width: `${Math.round((layout.footer.brandWidthPx / 375) * 240)}px`,
                    }"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>
      </aside>
    </div>

    <div
      v-if="layout && !loading"
      class="layout-save-bar"
      role="region"
      aria-label="首页配置保存操作"
    >
      <span class="layout-save-status">
        {{
          conflict
            ? "首页配置已在别处更新，请先加载最新版本"
            : dirty
              ? "有未保存的首页配置改动"
              : "当前配置已保存"
        }}
      </span>
      <div class="heading-actions">
        <button
          v-if="conflict"
          type="button"
          class="secondary"
          @click="reloadAfterConflict"
        >
          加载最新版本
        </button>
        <button
          type="button"
          class="primary"
          :disabled="saving || loading || conflict || !layout"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存首页配置" }}
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dirty-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 12px;
  font-weight: 600;
}
.layout-save-bar {
  position: sticky;
  bottom: 12px;
  z-index: var(--z-sticky-bar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding: 12px 16px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-surface-glass);
  box-shadow: var(--rf-shadow-floating);
  backdrop-filter: blur(14px);
}
.layout-save-status {
  color: var(--rf-muted);
  font-size: 13px;
}
.builder-grid {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 272px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1180px) {
  .builder-grid {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .phone-preview {
    grid-column: 1 / -1;
  }
}
@media (max-width: 780px) {
  .builder-grid {
    grid-template-columns: 1fr;
  }
}
.module-rail,
.editor-panel,
.phone-frame {
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 12px;
  background: var(--rf-surface, #fff);
}
.module-rail {
  padding: 12px;
}
.rail-header h2 {
  margin: 0;
  font-size: 14px;
}
.rail-header small {
  color: var(--rf-muted);
  font-size: 12px;
}
.module-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.module-card {
  padding: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.module-card.is-active {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
}
.module-card.is-disabled {
  opacity: 0.62;
}
.module-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 13px;
}
.module-select {
  padding: 0;
  text-align: start;
  font-size: inherit;
  font-weight: 600;
}
.switch-inline {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  font-size: 12px;
  margin: 0;
  white-space: nowrap;
}
.module-move {
  display: flex;
  gap: 8px;
}
.editor-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.editor-panel h2 {
  margin: 0;
  font-size: 16px;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-head h2,
.panel-head h3 {
  margin: 0;
}
.inline-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.compact-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  white-space: nowrap;
}
.compact-select select,
.compact-select input {
  width: auto;
}
.sub-box {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sub-box h3 {
  margin: 0;
  font-size: 14px;
}
.image-setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.banner-thumb {
  width: 180px;
  height: 92px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
}
.small-thumb {
  width: 96px;
  height: 68px;
  object-fit: cover;
  border-radius: 8px;
}
.image-setting-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.shortcut-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.shortcut-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  cursor: grab;
  font-size: 13px;
}
.shortcut-chip.is-selected {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
  font-weight: 600;
}
.shortcut-chip img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}
.qr-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.qr-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 10px;
}
.qr-card {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: grab;
}
.qr-card img {
  width: 100%;
  height: 124px;
  object-fit: contain;
  background: #f6f8f3;
  border-radius: 6px;
}
.qr-card-actions {
  display: flex;
  justify-content: space-between;
}
.featured-act-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.featured-act-card {
  position: relative;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.slot-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rf-primary, #247a52);
  color: #fff;
}
.featured-act-card img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
}
.featured-act-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.featured-act-actions {
  display: flex;
  gap: 8px;
}
.compact-search {
  max-width: 220px;
}
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.candidate-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
}
.product-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 8px;
}
.product-pick-btn {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.product-pick-btn.is-picked {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
}
.product-pick-btn img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.slide-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
}
.slide-fields {
  flex: 1 1 280px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.brand-preview-box {
  min-width: 160px;
  min-height: 80px;
  padding: 12px;
  border-radius: 8px;
  background: #f6f8f3;
  border: 1px dashed var(--rf-line, #dce3dd);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-preview-box img {
  max-width: 240px;
  height: auto;
}
.size-slider-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.slider-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
}
.slider-inputs input[type="range"] {
  flex: 1;
}
.slider-inputs .px-number {
  width: 84px;
}
.danger-text {
  color: var(--rf-danger);
}
/* Right Phone Wireframe */
.phone-frame {
  padding: 10px;
  background: #f6f8f3;
}
.phone-notch {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--rf-muted);
  padding-bottom: 8px;
}
.phone-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pv-interactive:focus-visible {
  outline: 2px solid var(--rf-primary);
  outline-offset: 2px;
}
.pv-hero {
  position: relative;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}
.pv-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-hero-shade {
  position: absolute;
  inset: 0;
  padding: 8px;
  background: linear-gradient(transparent, rgba(20, 35, 28, 0.78));
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 11px;
}
.pv-shortcuts {
  display: grid;
  gap: 6px;
  cursor: pointer;
}
.pv-shortcut-cell {
  position: relative;
  height: 46px;
  border-radius: 6px;
  overflow: hidden;
}
.pv-shortcut-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-shortcut-cell span {
  position: absolute;
  inset: auto 2px 3px;
  text-align: center;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.38);
  border-radius: 4px;
}
.pv-block {
  padding: 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
  cursor: pointer;
}
.pv-block-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}
.pv-mini-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.pv-mini-card {
  padding: 6px;
  border-radius: 6px;
  background: #eaf4e7;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-mini-placeholder {
  font-size: 11px;
  color: var(--rf-muted);
  text-align: center;
  padding: 6px;
}
.pv-shop-banner {
  padding: 8px;
  border-radius: 6px;
  background: #eaf4e7;
  color: #1f5c3f;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 4px;
}
.pv-footer {
  padding: 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px dashed var(--rf-line, #dce3dd);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.pv-follow-box {
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}
.pv-qr-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pv-qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
}
.pv-qr-item img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.pv-brand-wrap {
  display: flex;
  justify-content: center;
  width: 100%;
}
.pv-brand-wrap img {
  max-width: 100%;
  height: auto;
}
</style>
