<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { askConfirm } from "../confirm";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import AppIcon from "../components/AppIcon.vue";
import FormModal from "../components/FormModal.vue";
import PaginationBar from "../components/PaginationBar.vue";
import DateTimeField from "../components/DateTimeField.vue";
import ImageUpload from "../components/ImageUpload.vue";
import UiState from "../components/UiState.vue";
import { categories } from "../types";
// Match ContentService.safeImage: do not preview an image the API will reject.
function imageUrlValid(value: string) {
  return (
    value.length <= 2048 &&
    (/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpg|jpeg|webp)$/.test(
      value,
    ) ||
      (/^https:\/\/[^\s<>"'\\]+$/.test(value) && !value.includes("@")))
  );
}
type Entry = {
  slot: number;
  name: string;
  icon: string;
  type: string;
  page: string;
  articleId: string;
  popupTitle: string;
  popupText: string;
  popupImageUrl: string;
};
type Settings = { version: number; items: Entry[] };
type Article = { id: string; title: string; status: string };
const config = ref<Settings | null>(null),
  articles = ref<Article[]>([]),
  loading = ref(false),
  saving = ref(false),
  uploads = ref<Record<number, boolean>>({}),
  error = ref(""),
  success = ref(""),
  sourceError = ref(""),
  snapshot = ref(""),
  generation = ref(0),
  activeSlot = ref(1),
  conflict = ref(false);
const pages = [
  ["WEEKLY", categories.WEEKLY],
  ["DOMESTIC", categories.DOMESTIC],
  ["ACTIVITIES", "全部活动"],
  ["SHOP", "商城"],
  ["PROFILE", "我的"],
];
const icons = [
  ["WEEKLY", "本周山野"],
  ["DOMESTIC", "远行山野"],
  ["QRCODE", "二维码"],
  ["INTRO", "野小子"],
];
const shortcutActions = [
  { value: "PAGE", label: "打开小程序页面", detail: "活动列表、商城等" },
  { value: "ARTICLE", label: "打开已发布文章", detail: "指定文章或官方介绍" },
  { value: "POPUP", label: "显示弹窗", detail: "文字、图片或二维码" },
];
const entryIcons: Record<string, string> = {
  WEEKLY: "mountain",
  DOMESTIC: "location",
  QRCODE: "dashboard",
  INTRO: "document",
};
const busy = computed(
  () =>
    loading.value || saving.value || Object.values(uploads.value).some(Boolean),
);
const dirty = computed(
  () => !!config.value && JSON.stringify(config.value) !== snapshot.value,
);
function destination(entry: Entry) {
  if (entry.type === "PAGE")
    return `打开页面 · ${pages.find(([key]) => key === entry.page)?.[1] ?? "未选择"}`;
  if (entry.type === "ARTICLE")
    return `打开文章 · ${entry.articleId === "OFFICIAL" ? "当前官方介绍" : (articles.value.find((item) => item.id === entry.articleId)?.title ?? "待核对")}`;
  if (entry.popupImageUrl) return "显示弹窗 · 含图片";
  return entry.popupText.trim()
    ? "显示弹窗 · 文字"
    : "显示弹窗 · 未添加文字或图片";
}
let epoch = 0;
function reset() {
  epoch++;
  generation.value++;
  config.value = null;
  articles.value = [];
  uploads.value = {};
  loading.value = false;
  saving.value = false;
  error.value = "";
  success.value = "";
  sourceError.value = "";
  snapshot.value = "";
  activeSlot.value = 1;
  conflict.value = false;
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load();
  }
});
onUnmounted(reset);
async function canLeave() {
  return (
    !dirty.value || (await askConfirm("首页配置尚未保存，确定放弃修改吗？"))
  );
}
onBeforeRouteLeave(
  async (to) => to.path === "/login" || (!busy.value && (await canLeave())),
);
function fill(value: Settings) {
  config.value = value;
  if (!value.items.some((entry) => entry.slot === activeSlot.value)) {
    activeSlot.value = value.items[0]?.slot ?? 1;
  }
  snapshot.value = JSON.stringify(value);
  generation.value++;
  uploads.value = {};
  conflict.value = false;
}
async function load() {
  if (busy.value || !currentUser.value || !(await canLeave())) return;
  const n = ++epoch,
    actor = currentUser.value;
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    const value = await request<Settings>("/admin/home/shortcuts");
    if (n !== epoch || actor !== currentUser.value) return;
    fill(value);
    void loadArticles(n, actor);
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
async function loadArticles(n: number, actor: typeof currentUser.value) {
  sourceError.value = "";
  const found: Article[] = [];
  let page = 0;
  try {
    while (true) {
      const result = await request<{ items: Article[]; hasMore: boolean }>(
        `/admin/articles?page=${page}&size=100`,
      );
      if (n !== epoch || actor !== currentUser.value) return;
      found.push(...result.items.filter((a) => a.status === "PUBLISHED"));
      if (!result.hasMore) break;
      page++;
    }
    articles.value = found;
  } catch (e) {
    if (n === epoch) sourceError.value = "文章选项加载失败：" + errorMessage(e);
  }
}
const settingsTab = ref<"home" | "paths" | "reconcile">("home");
watch(settingsTab, (tab) => {
  if (tab === "paths" && !ocLoading.value) void loadOrderCenter();
});
const settingsTabs = [
  { key: "home", label: "首页入口" },
  { key: "paths", label: "微信订单路径" },
  { key: "reconcile", label: "微信订单对账" },
] as const;
function protectSettingsDraft(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", protectSettingsDraft));
onUnmounted(() =>
  window.removeEventListener("beforeunload", protectSettingsDraft),
);
function changeType(entry: Entry) {
  if (entry.type === "PAGE" && !entry.page) entry.page = "ACTIVITIES";
  if (entry.type === "ARTICLE" && !entry.articleId)
    entry.articleId = "OFFICIAL";
  success.value = "";
}
function uploaded(entry: Entry, url: string) {
  if (entry.type === "POPUP" && config.value?.items.includes(entry))
    entry.popupImageUrl = url;
}
async function save() {
  if (busy.value || conflict.value || !currentUser.value || !config.value)
    return;
  error.value = "";
  success.value = "";
  const invalidName = config.value.items.find(
    (entry) => !entry.name.trim() || entry.name.trim().length > 12,
  );
  if (invalidName) {
    activeSlot.value = invalidName.slot;
    error.value = `入口 ${invalidName.slot} 的名称请填写 1–12 个字。`;
    return;
  }
  const invalidImage = config.value.items.find(
    (entry) =>
      entry.type === "POPUP" &&
      entry.popupImageUrl &&
      !imageUrlValid(entry.popupImageUrl),
  );
  if (invalidImage) {
    activeSlot.value = invalidImage.slot;
    error.value = `入口 ${invalidImage.slot} 的图片须为上传的图片地址或 HTTPS 地址。`;
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  saving.value = true;
  try {
    const value = await request<Settings>("/admin/home/shortcuts", {
      method: "PUT",
      body: JSON.stringify({
        ...config.value,
        items: config.value.items.map((e) => ({
          ...e,
          name: e.name.trim(),
          page: e.type === "PAGE" ? e.page : "",
          articleId: e.type === "ARTICLE" ? e.articleId : "",
          popupTitle: e.type === "POPUP" ? e.popupTitle : "",
          popupText: e.type === "POPUP" ? e.popupText : "",
          popupImageUrl: e.type === "POPUP" ? e.popupImageUrl : "",
        })),
      }),
    });
    if (n !== epoch || actor !== currentUser.value) return;
    fill(value);
    success.value = "配置已保存，小程序下次刷新首页时生效。";
  } catch (e) {
    if (n === epoch) {
      conflict.value = e instanceof ApiError && e.status === 409;
      error.value = conflict.value
        ? "配置版本或文章状态已变化，当前填写内容已保留，不会自动覆盖。"
        : errorMessage(e);
    }
  } finally {
    if (n === epoch) saving.value = false;
  }
}
onMounted(() => void load());

// 微信电商订单（订单中心）：订单数据由微信支付交易自动同步，此处管理订单详情跳转路径。
type OrderCenterStatus = {
  enabled: boolean;
  orderDetailPathConfigured: boolean;
  orderDetailPath: string;
  savedMsgJumpPath?: string;
  confirmationCompleted: boolean;
  pathErrcode: number;
  confirmationErrcode: number;
};
const DEFAULT_ORDER_PATH = "pages/order-detail/index?no=${商品订单号}";
const orderCenter = ref<OrderCenterStatus | null>(null),
  ocLoading = ref(false),
  ocError = ref(""),
  pathDialog = ref(false),
  pathValue = ref(DEFAULT_ORDER_PATH),
  pathSaving = ref(false),
  pathError = ref(""),
  pathSuccess = ref("");
async function loadOrderCenter() {
  ocLoading.value = true;
  ocError.value = "";
  try {
    orderCenter.value = await request<OrderCenterStatus>(
      "/admin/wechat-order-center/status",
    );
  } catch (e) {
    ocError.value = errorMessage(e);
  } finally {
    ocLoading.value = false;
  }
}
function openPathDialog() {
  pathValue.value = orderCenter.value?.orderDetailPath || DEFAULT_ORDER_PATH;
  pathError.value = "";
  pathSuccess.value = "";
  pathDialog.value = true;
}
async function saveOrderPath() {
  const path = pathValue.value.trim();
  if (!path.includes("${商品订单号}")) {
    pathError.value =
      "路径需包含 ${商品订单号} 占位符，微信跳转时替换为实际订单号。";
    return;
  }
  pathSaving.value = true;
  pathError.value = "";
  try {
    const result = await request<{ attempted: boolean; errcode: number }>(
      "/admin/wechat-order-center/order-detail-path",
      { method: "PUT", body: JSON.stringify({ path }) },
    );
    if (!result.attempted) {
      pathError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      pathError.value = `微信返回错误码 ${result.errcode}；未签署订单中心授权协议时会返回 10060034。`;
      return;
    }
    pathSuccess.value = "订单详情路径已配置。";
    pathDialog.value = false;
    await loadOrderCenter();
  } catch (e) {
    pathError.value = errorMessage(e);
  } finally {
    pathSaving.value = false;
  }
}
onMounted(() => void loadOrderCenter());

// 发货消息跳转路径：用户点微信发货/确认收货消息直达小程序订单页（set_msg_jump_path）。
const DEFAULT_MSG_PATH = "pages/order-detail/index";
const jumpDialog = ref(false),
  jumpValue = ref(DEFAULT_MSG_PATH),
  jumpSaving = ref(false),
  jumpError = ref(""),
  jumpNotice = ref("");
function openJumpDialog() {
  jumpValue.value = orderCenter.value?.savedMsgJumpPath || DEFAULT_MSG_PATH;
  jumpError.value = "";
  jumpDialog.value = true;
}
async function saveJumpPath() {
  const path = jumpValue.value.trim();
  if (!path || path.includes("://")) {
    jumpError.value =
      "请填写小程序页面路径（如 pages/order-detail/index），不能是完整网址。";
    return;
  }
  jumpSaving.value = true;
  jumpError.value = "";
  try {
    const result = await request<{ attempted: boolean; errcode: number }>(
      "/admin/wechat-order-center/msg-jump-path",
      { method: "PUT", body: JSON.stringify({ path }) },
    );
    if (!result.attempted) {
      jumpError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      jumpError.value = `微信返回错误码 ${result.errcode}；需先接入确认收货组件。`;
      return;
    }
    if (orderCenter.value) orderCenter.value.savedMsgJumpPath = path;
    jumpDialog.value = false;
    jumpNotice.value = "消息跳转路径已配置。";
  } catch (e) {
    jumpError.value = errorMessage(e);
  } finally {
    jumpSaving.value = false;
  }
}

// 微信侧订单对账（get_order_list）：按支付时间/状态/openid 查询，lastIndex 翻页。
type WechatOrderRow = {
  transaction_id?: string;
  merchant_trade_no?: string;
  order_state?: number;
  pay_time?: number;
  paid_amount?: number;
  in_complaint?: boolean;
};
const ORDER_STATE_LABELS = [
  "待发货",
  "已发货",
  "确认收货",
  "交易完成",
  "已退款",
  "资金待结算",
];
const wxOrders = ref<WechatOrderRow[]>([]),
  wxQueried = ref(false),
  wxLoading = ref(false),
  wxError = ref(""),
  wxState = ref<"" | number>(""),
  wxOpenid = ref(""),
  wxBegin = ref(""),
  wxEnd = ref(""),
  wxPage = ref(0),
  wxHasMore = ref(false);
let wxCursors = [""];
let wxAppliedParams = "";
function epochOf(local: string): number | null {
  if (!local) return null;
  const ms = Date.parse(local + ":00+08:00");
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
async function queryWechatOrders() {
  if (wxLoading.value) return;
  const begin = epochOf(wxBegin.value);
  const end = epochOf(wxEnd.value);
  if ((wxBegin.value && begin === null) || (wxEnd.value && end === null)) {
    wxError.value = "支付时间格式无效。";
    return;
  }
  if (begin !== null && end !== null && begin > end) {
    wxError.value = "开始时间不能晚于结束时间。";
    return;
  }
  const params = new URLSearchParams({ size: "20" });
  if (begin !== null) params.set("begin", String(begin));
  if (end !== null) params.set("end", String(end));
  if (wxState.value !== "") params.set("orderState", String(wxState.value));
  if (wxOpenid.value.trim()) params.set("openid", wxOpenid.value.trim());
  await loadWechatPage(0, params.toString(), true);
}
async function changeWechatPage(page: number) {
  if (wxCursors[page] === undefined) return;
  await loadWechatPage(page, wxAppliedParams, false);
}
async function loadWechatPage(
  page: number,
  appliedParams: string,
  newQuery: boolean,
) {
  if (wxLoading.value) return;
  const actor = currentUser.value;
  wxLoading.value = true;
  wxError.value = "";
  try {
    const params = new URLSearchParams(appliedParams);
    const cursor = newQuery ? "" : wxCursors[page];
    if (cursor) params.set("lastIndex", cursor);
    const result = await request<{
      attempted: boolean;
      errcode: number;
      error: string;
      lastIndex: string;
      hasMore: boolean;
      orders: WechatOrderRow[];
    }>(`/admin/wechat-order-center/wechat-orders?${params.toString()}`);
    if (actor !== currentUser.value) return;
    if (!result.attempted) {
      wxError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      wxError.value = `微信返回错误码 ${result.errcode}。`;
      return;
    }
    if (newQuery) {
      wxCursors = [""];
      wxAppliedParams = appliedParams;
    }
    const nextCursor = result.lastIndex;
    wxCursors = wxCursors.slice(0, page + 1);
    wxHasMore.value = !!(
      result.hasMore &&
      nextCursor &&
      !wxCursors.includes(nextCursor)
    );
    if (wxHasMore.value) wxCursors.push(nextCursor);
    wxOrders.value = result.orders;
    wxPage.value = page;
    wxQueried.value = true;
  } catch (e) {
    wxError.value = errorMessage(e);
  } finally {
    wxLoading.value = false;
  }
}
function wechatOrderStateLabel(state: number | undefined): string {
  return state && state >= 1 && state <= 6
    ? ORDER_STATE_LABELS[state - 1]
    : `状态${state ?? "?"}`;
}
useForegroundRefresh(() => {
  if (
    settingsTab.value === "home" &&
    !dirty.value &&
    !busy.value &&
    !loading.value
  )
    void load();
  if (
    settingsTab.value === "paths" &&
    !ocLoading.value &&
    !pathDialog.value &&
    !jumpDialog.value
  )
    void loadOrderCenter();
});
</script>
<template>
  <main class="workspace settings-workspace">
    <div class="page-heading">
      <h1>基础配置</h1>
      <RouterLink class="primary button" to="/home-layout?section=SHORTCUTS">
        <AppIcon name="dashboard" :size="16" />打开首页自由装修工作台
      </RouterLink>
    </div>
    <nav class="task-tabs" aria-label="配置类型">
      <button
        v-for="tab in settingsTabs"
        :key="tab.key"
        type="button"
        :class="settingsTab === tab.key ? 'primary' : 'secondary'"
        :aria-pressed="settingsTab === tab.key"
        @click="settingsTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>
    <UiState
      v-if="loading && !config && settingsTab === 'home'"
      kind="loading"
      compact
      >正在读取首页配置…</UiState
    >
    <UiState v-if="error" kind="error" compact>
      {{ error }}
      <button
        v-if="conflict"
        class="text-button"
        :disabled="busy"
        @click="load"
      >
        采用最新配置
      </button>
      <button
        v-else-if="!config"
        class="text-button"
        :disabled="busy"
        @click="load"
      >
        重试
      </button>
    </UiState>
    <p v-if="success" class="settings-notice" role="status">{{ success }}</p>
    <form
      v-if="config"
      v-show="settingsTab === 'home'"
      id="home-shortcut-settings"
      class="settings-form"
      novalidate
      @submit.prevent="save"
    >
      <section
        class="shortcut-card shortcut-index"
        aria-labelledby="shortcut-list-heading"
      >
        <h2 id="shortcut-list-heading">首页前四个入口</h2>
        <p class="shortcut-note">
          完整入口列表、公众号文章和多张二维码可在首页自由装修工作台编辑。
        </p>
        <div class="shortcut-options" aria-label="选择首页入口">
          <button
            v-for="entry in config.items"
            :key="entry.slot"
            type="button"
            class="shortcut-option"
            :data-slot="entry.slot"
            :aria-pressed="entry.slot === activeSlot"
            :aria-controls="`shortcut-editor-${entry.slot}`"
            @click="activeSlot = entry.slot"
          >
            <AppIcon :name="entryIcons[entry.icon] ?? 'document'" :size="17" />
            <span class="shortcut-option-copy">
              <strong
                >{{ entry.slot }}　{{
                  entry.name.trim() || "未填写名称"
                }}</strong
              >
              <small>{{ destination(entry) }}</small>
            </span>
            <AppIcon name="arrow" :size="15" />
          </button>
        </div>
      </section>
      <fieldset :disabled="busy" class="shortcut-editor">
        <section
          v-for="entry in config.items"
          v-show="entry.slot === activeSlot"
          :id="`shortcut-editor-${entry.slot}`"
          :key="entry.slot"
          class="shortcut-card"
        >
          <h2>
            入口 {{ entry.slot }} · {{ entry.name.trim() || "未填写名称" }}
          </h2>
          <div class="shortcut-fields">
            <label
              >名称<input
                v-model="entry.name"
                :aria-label="`入口${entry.slot}名称`"
                maxlength="12"
                required
            /></label>
            <label
              >图标<select
                v-model="entry.icon"
                :aria-label="`入口${entry.slot}图标`"
              >
                <option v-for="icon in icons" :key="icon[0]" :value="icon[0]">
                  {{ icon[1] }}
                </option>
              </select></label
            >
            <fieldset class="shortcut-actions">
              <legend>点击入口后</legend>
              <div class="shortcut-action-options">
                <label
                  v-for="action in shortcutActions"
                  :key="action.value"
                  class="shortcut-action-option"
                >
                  <input
                    v-model="entry.type"
                    type="radio"
                    :name="`shortcut-action-${entry.slot}`"
                    :value="action.value"
                    @change="changeType(entry)"
                  />
                  <span
                    ><strong>{{ action.label }}</strong
                    ><small>{{ action.detail }}</small></span
                  >
                </label>
              </div>
            </fieldset>
            <label v-if="entry.type === 'PAGE'"
              >目标页面<select
                v-model="entry.page"
                :aria-label="`入口${entry.slot}页面`"
              >
                <option v-for="page in pages" :key="page[0]" :value="page[0]">
                  {{ page[1] }}
                </option>
              </select></label
            >
            <label v-if="entry.type === 'ARTICLE'"
              >文章<select
                v-model="entry.articleId"
                :aria-label="`入口${entry.slot}文章`"
              >
                <option value="OFFICIAL">
                  当前官方介绍（随文章管理设置更新）
                </option>
                <option
                  v-if="
                    entry.articleId !== 'OFFICIAL' &&
                    !articles.some((a) => a.id === entry.articleId)
                  "
                  :value="entry.articleId"
                >
                  当前文章未加载或已下架，请核对
                </option>
                <option
                  v-for="article in articles"
                  :key="article.id"
                  :value="article.id"
                >
                  {{ article.title }}
                </option>
              </select></label
            >
          </div>
          <div v-if="entry.type === 'POPUP'" class="shortcut-popup">
            <label
              >弹窗标题<input
                v-model="entry.popupTitle"
                :aria-label="`入口${entry.slot}弹窗标题`"
                maxlength="80"
                placeholder="留空使用入口名称" /></label
            ><label
              >弹窗文字<textarea
                v-model="entry.popupText"
                :aria-label="`入口${entry.slot}弹窗文字`"
                maxlength="2000"
              />
            </label>
            <div class="preset-heading">弹窗二维码 / 图片</div>
            <ImageUpload
              :key="`${generation}-${entry.slot}`"
              label="上传弹窗二维码或图片"
              :preview="
                imageUrlValid(entry.popupImageUrl)
                  ? entry.popupImageUrl
                  : undefined
              "
              preview-alt="弹窗图片预览"
              :disabled="
                loading ||
                saving ||
                Object.entries(uploads).some(
                  ([slot, value]) => Number(slot) !== entry.slot && value,
                )
              "
              @busy="uploads[entry.slot] = $event"
              @uploaded="uploaded(entry, $event)"
            />
            <button
              v-if="entry.popupImageUrl"
              type="button"
              class="text-button"
              :disabled="saving || uploads[entry.slot]"
              @click="entry.popupImageUrl = ''"
            >
              移除图片
            </button>
          </div>
          <UiState
            v-if="entry.type === 'ARTICLE' && sourceError"
            kind="error"
            compact
          >
            <p>{{ sourceError }}</p>
            <button
              type="button"
              class="secondary"
              :disabled="busy"
              @click="loadArticles(epoch, currentUser)"
            >
              重试文章选项
            </button>
          </UiState>
        </section>
      </fieldset>
      <footer class="footer-actions settings-footer">
        <p
          v-if="dirty || Object.values(uploads).some(Boolean)"
          class="settings-notice footer-status"
          role="status"
        >
          {{
            Object.values(uploads).some(Boolean)
              ? "图片上传中，请等待完成后保存。"
              : "首页入口有未保存修改。"
          }}
        </p>
        <button class="primary" type="submit" :disabled="busy || conflict">
          {{ saving ? "保存中…" : "保存首页配置" }}
        </button>
      </footer>
    </form>
    <section
      v-show="settingsTab === 'paths'"
      class="order-center-card"
      aria-labelledby="order-center-heading"
    >
      <h2 id="order-center-heading">微信电商订单</h2>
      <p class="order-center-note">
        订单数据由微信支付交易自动同步；配置订单详情路径后，用户可在微信「小程序购物订单」中跳回小程序订单详情页。需先在小程序后台签署订单中心授权协议。
      </p>
      <UiState v-if="ocLoading && !orderCenter" kind="loading" compact
        >正在读取微信订单状态…</UiState
      >
      <UiState v-else-if="ocError" kind="error" compact
        >{{ ocError }}
        <button class="text-button" @click="loadOrderCenter">
          重试
        </button></UiState
      >
      <ul v-else-if="orderCenter" class="order-center-status">
        <li
          :class="orderCenter.orderDetailPathConfigured ? 'is-ok' : 'is-todo'"
        >
          订单详情路径 ·
          {{ orderCenter.orderDetailPathConfigured ? "已配置" : "未配置" }}
        </li>
        <li :class="orderCenter.confirmationCompleted ? 'is-ok' : 'is-todo'">
          交易结算管理确认 ·
          {{ orderCenter.confirmationCompleted ? "已完成" : "待确认" }}
        </li>
        <li v-if="orderCenter.orderDetailPath" class="is-path">
          {{ orderCenter.orderDetailPath }}
        </li>
      </ul>
      <p class="muted">
        消息跳转路径（后台最近保存）
        {{ orderCenter?.savedMsgJumpPath || "暂无记录" }}
      </p>
      <p v-if="jumpNotice" class="success-box" role="status">
        {{ jumpNotice }}
      </p>
      <p v-if="pathSuccess" class="success-box" role="status">
        {{ pathSuccess }}
      </p>
      <div class="footer-actions">
        <button class="primary" type="button" @click="openPathDialog">
          配置订单路径
        </button>
        <button class="secondary" type="button" @click="openJumpDialog">
          设置消息跳转路径
        </button>
      </div>
    </section>
    <FormModal v-if="pathDialog" :busy="pathSaving" @close="pathDialog = false"
      ><template #title><h2>配置订单详情路径</h2></template>
      <form
        id="order-path-form"
        class="form-section"
        @submit.prevent="saveOrderPath"
      >
        <p v-if="pathError" class="error-box" role="alert">{{ pathError }}</p>
        <label
          >跳转路径（需包含 ${商品订单号} 占位符）
          <input
            v-model="pathValue"
            name="orderPath"
            maxlength="256"
            placeholder="pages/order-detail/index?no=${商品订单号}"
            required
        /></label>
        <p class="order-center-note">
          提交前请先在小程序后台签署订单中心授权协议，否则微信返回 10060034。
        </p>
        <div class="dialog-actions">
          <button
            class="secondary"
            type="button"
            :disabled="pathSaving"
            @click="pathDialog = false"
          >
            取消
          </button>
          <button class="primary" type="submit" :disabled="pathSaving">
            {{ pathSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </form>
    </FormModal>
    <FormModal v-if="jumpDialog" :busy="jumpSaving" @close="jumpDialog = false"
      ><template #title><h2>设置消息跳转路径</h2></template>
      <form
        id="msg-jump-form"
        class="form-section"
        @submit.prevent="saveJumpPath"
      >
        <p v-if="jumpError" class="error-box" role="alert">{{ jumpError }}</p>
        <label
          >小程序页面路径
          <input
            v-model="jumpValue"
            name="msgJumpPath"
            maxlength="256"
            placeholder="pages/order-detail/index"
            required
        /></label>
        <p class="order-center-note">
          用户点击微信发货消息/确认收货消息时直达该页面；微信会自动在路径后追加
          transaction_id、merchant_trade_no
          等参数。路径为空或不存在时仍跳平台默认页。
        </p>
        <div class="dialog-actions">
          <button
            class="secondary"
            type="button"
            :disabled="jumpSaving"
            @click="jumpDialog = false"
          >
            取消
          </button>
          <button class="primary" type="submit" :disabled="jumpSaving">
            {{ jumpSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </form>
    </FormModal>
    <section
      v-show="settingsTab === 'reconcile'"
      class="order-center-card"
      aria-labelledby="wechat-orders-heading"
    >
      <h2 id="wechat-orders-heading">微信订单对账</h2>
      <p class="order-center-note">
        按微信侧发货管理维度查询支付单（get_order_list），用于核对发货/确认收货/结算状态；数据来自微信，仅作对账用途。
      </p>
      <form class="wechat-orders-filters" @submit.prevent="queryWechatOrders()">
        <DateTimeField
          id="wxBegin"
          v-model="wxBegin"
          label="支付开始（北京时间）"
        />
        <DateTimeField
          id="wxEnd"
          v-model="wxEnd"
          label="支付结束（北京时间）"
        />
        <label
          >状态
          <select v-model="wxState" name="wxState">
            <option value="">全部</option>
            <option
              v-for="(label, i) in ORDER_STATE_LABELS"
              :key="label"
              :value="i + 1"
            >
              {{ label }}
            </option>
          </select></label
        >
        <label
          >支付者 openid
          <input
            v-model="wxOpenid"
            name="wxOpenid"
            maxlength="64"
            placeholder="选填"
        /></label>
        <button class="primary" type="submit" :disabled="wxLoading">
          {{ wxLoading ? "查询中…" : "查询" }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="wxLoading"
          @click="
            wxBegin = '';
            wxEnd = '';
            wxState = '';
            wxOpenid = '';
            queryWechatOrders();
          "
        >
          重置
        </button>
      </form>
      <p v-if="wxError" class="error-box" role="alert">{{ wxError }}</p>
      <div v-if="wxOrders.length" class="table-scroll">
        <table class="wechat-orders-table">
          <thead>
            <tr>
              <th>微信交易单号</th>
              <th>商户单号</th>
              <th>状态</th>
              <th>支付时间</th>
              <th>金额</th>
              <th>纠纷</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in wxOrders" :key="row.transaction_id || i">
              <td>{{ row.transaction_id || "—" }}</td>
              <td>
                <RouterLink
                  v-if="row.merchant_trade_no"
                  :to="{
                    path: '/shop',
                    query: { tab: 'orders', orderQuery: row.merchant_trade_no },
                  }"
                  >{{ row.merchant_trade_no }}</RouterLink
                >
                <span v-else>—</span>
              </td>
              <td>{{ wechatOrderStateLabel(row.order_state) }}</td>
              <td>
                {{
                  row.pay_time
                    ? new Date(row.pay_time * 1000).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })
                    : "—"
                }}
              </td>
              <td>
                {{
                  typeof row.paid_amount === "number"
                    ? `¥${(row.paid_amount / 100).toFixed(2)}`
                    : "—"
                }}
              </td>
              <td>{{ row.in_complaint ? "纠纷中" : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiState v-else-if="wxQueried && !wxLoading" kind="empty" compact
        >没有符合条件的微信支付单</UiState
      >
      <PaginationBar
        v-if="wxQueried"
        :page="wxPage"
        :page-size="20"
        :has-more="wxHasMore"
        :busy="wxLoading"
        label="微信订单对账分页"
        @change="changeWechatPage"
      />
    </section>
  </main>
</template>
<style scoped>
.order-center-card {
  margin-top: 20px;
  padding: 20px 24px;
  border: 1px solid var(--admin-line);
  border-radius: 12px;
  background: var(--admin-surface);
}
.order-center-card h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.order-center-note {
  margin: 0 0 12px;
  color: var(--admin-muted);
  font-size: 13px;
  line-height: 1.6;
}
.wechat-orders-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-bottom: 12px;
}
.wechat-orders-filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--admin-muted);
}
.wechat-orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.wechat-orders-table th,
.wechat-orders-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--admin-line);
  word-break: break-all;
}
.order-center-status {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.order-center-status li {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
}
.order-center-status li.is-ok {
  background: var(--tone-success-bg);
  color: var(--tone-success);
}
.order-center-status li.is-todo {
  background: var(--tone-warning-bg);
  color: var(--tone-warning);
}
.order-center-status li.is-path {
  background: var(--tone-neutral-bg);
  color: var(--tone-neutral);
  overflow-wrap: anywhere;
}

.settings-form {
  display: grid;
  grid-template-columns: minmax(0, 288px) minmax(0, 1fr);
  align-items: start;
  gap: 14px 16px;
}
.shortcut-card {
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  padding: 14px;
  border-radius: var(--admin-radius);
  min-width: 0;
}
h2 {
  margin: 0 0 10px;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.shortcut-options {
  display: grid;
  gap: 4px;
}
.shortcut-option {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 15px;
  justify-content: stretch;
  gap: 10px;
  min-height: 54px;
  padding: 6px 9px;
  text-align: left;
  background: var(--admin-surface);
  color: var(--rf-primary-text);
}
.shortcut-option:hover,
.shortcut-option[aria-pressed="true"] {
  background: var(--admin-tint);
}
.shortcut-option-copy {
  display: grid;
  min-width: 0;
}
.shortcut-option-copy > * {
  text-overflow: ellipsis;
  overflow: hidden;
}
.shortcut-option small,
.shortcut-note {
  color: var(--admin-muted);
  font-size: 12px;
}
.shortcut-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.shortcut-actions {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0;
  min-width: 0;
  border: 0;
}
.shortcut-actions legend {
  margin-bottom: 6px;
  padding: 0;
  font-weight: 600;
}
.shortcut-action-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: 8px;
}
label.shortcut-action-option {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--rf-field-line);
  border-radius: var(--rf-control-radius);
  cursor: pointer;
}
.shortcut-action-option input {
  width: auto;
  margin-top: 3px;
  accent-color: var(--rf-primary);
}
.shortcut-action-option small {
  display: block;
  color: var(--rf-muted);
  font-weight: 400;
}
.shortcut-action-option:has(:checked) {
  background: var(--rf-soft);
  border-color: var(--rf-primary);
}
.shortcut-action-option:has(:disabled) {
  cursor: default;
}
.shortcut-popup {
  display: grid;
  justify-items: start;
  gap: 10px;
  margin-top: 12px;
}
.shortcut-popup .preset-heading {
  margin: 0;
}
label {
  display: grid;
  width: 100%;
  gap: 4px;
  margin: 0;
}
label input,
label select,
label textarea {
  margin: 0;
}
.shortcut-note,
.shortcut-card :deep(.ui-state p) {
  margin: 0;
}
.shortcut-card :deep(.ui-state) {
  margin-top: 12px;
}
textarea {
  min-height: 68px;
}
.settings-footer {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  grid-column: 1 / -1;
  padding: 12px 14px;
  border: 1px solid var(--rf-line);
  border-radius: 14px;
  background: #ffffffed;
  box-shadow: 0 14px 36px #183c2914;
  backdrop-filter: blur(14px);
}
.settings-notice {
  grid-column: 1 / -1;
  margin-block: 0;
  border-radius: var(--admin-radius);
  background: var(--admin-tint);
  color: var(--admin-ink);
  padding: 8px 12px;
  font-size: 13px;
}
.settings-workspace > .settings-notice,
.settings-workspace > :deep(.ui-state) {
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .settings-form {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 720px) {
  .settings-footer {
    bottom: 8px;
    padding: 10px;
  }
  .settings-footer .primary {
    width: 100%;
  }
}
@media (max-width: 480px) {
  .shortcut-option {
    min-height: 46px;
  }
  .shortcut-fields input:not([type="radio"]),
  .shortcut-fields select {
    min-height: 44px;
  }
  .shortcut-fields {
    gap: 8px;
  }
}
@media (max-width: 340px) {
  .shortcut-fields {
    grid-template-columns: 1fr;
  }
}
</style>
