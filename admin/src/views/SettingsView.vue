<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import AppIcon from "../components/AppIcon.vue";
import ImageUpload from "../components/ImageUpload.vue";
import UiState from "../components/UiState.vue";
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
  ["WEEKLY", "本周活动"],
  ["DOMESTIC", "国内游行"],
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
    return `已有页面 · ${pages.find(([key]) => key === entry.page)?.[1] ?? "未选择"}`;
  if (entry.type === "ARTICLE")
    return `文章 · ${entry.articleId === "OFFICIAL" ? "当前官方介绍" : (articles.value.find((item) => item.id === entry.articleId)?.title ?? "待核对")}`;
  return entry.popupImageUrl ? "弹窗 · 含图片" : "弹窗 · 尚未配置二维码/图片";
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
function canLeave() {
  return !dirty.value || window.confirm("首页配置尚未保存，确定放弃修改吗？");
}
onBeforeRouteLeave((to) => to.path === "/login" || (!busy.value && canLeave()));
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
  if (busy.value || !currentUser.value || !canLeave()) return;
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
function changeType(entry: Entry) {
  entry.page = entry.type === "PAGE" ? "ACTIVITIES" : "";
  entry.articleId = entry.type === "ARTICLE" ? "OFFICIAL" : "";
  entry.popupTitle = "";
  entry.popupText = "";
  entry.popupImageUrl = "";
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
        ? "配置版本或文章状态已变化，请重新加载后核对；不会自动覆盖。"
        : errorMessage(e);
    }
  } finally {
    if (n === epoch) saving.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <main class="workspace settings-workspace">
    <div class="page-heading">
      <h1>基础配置</h1>
      <div class="settings-actions">
        <button class="secondary" :disabled="busy" @click="load">
          <AppIcon name="refresh" :size="16" />重新加载配置
        </button>
        <button
          v-if="config"
          class="primary"
          form="home-shortcut-settings"
          type="submit"
          :disabled="busy || conflict"
        >
          {{ saving ? "保存中…" : "保存首页配置" }}
        </button>
      </div>
    </div>
    <UiState v-if="loading && !config" kind="loading" compact
      >正在读取首页配置…</UiState
    >
    <UiState v-if="error" kind="error" compact>{{ error }}</UiState>
    <p v-if="success" class="settings-notice" role="status">{{ success }}</p>
    <form
      v-if="config"
      id="home-shortcut-settings"
      class="settings-form"
      novalidate
      @submit.prevent="save"
    >
      <section
        class="shortcut-card shortcut-index"
        aria-labelledby="shortcut-list-heading"
      >
        <h2 id="shortcut-list-heading">首页入口</h2>
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
            <label
              >类型<select
                v-model="entry.type"
                :aria-label="`入口${entry.slot}类型`"
                @change="changeType(entry)"
              >
                <option value="PAGE">已有页面</option>
                <option value="ARTICLE">文章页面</option>
                <option value="POPUP">弹窗</option>
              </select></label
            >
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
              /></label
            ><label class="preset-heading">弹窗二维码 / 图片（上传）</label>
            <ImageUpload
              :key="`${generation}-${entry.slot}`"
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
            <img
              v-if="entry.popupImageUrl && imageUrlValid(entry.popupImageUrl)"
              class="popup-preview"
              :src="entry.popupImageUrl"
              alt="弹窗图片预览"
              referrerpolicy="no-referrer"
            />
            <p v-else class="shortcut-note">
              尚未配置二维码/图片。小程序会显示未配置提示。
            </p>
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
      <p class="settings-notice" role="status">
        {{
          Object.values(uploads).some(Boolean)
            ? "图片上传中，请等待完成后保存。"
            : dirty
              ? "有未保存修改。保存后在小程序下次刷新首页时生效。"
              : "四个入口统一保存，在小程序下次刷新首页时生效。"
        }}
      </p>
    </form>
  </main>
</template>
<style scoped>
.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  color: var(--admin-primary);
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
.shortcut-popup {
  display: grid;
  justify-items: start;
  gap: 10px;
  margin-top: 12px;
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
.popup-preview {
  display: block;
  max-width: min(100%, 200px);
  max-height: 160px;
  object-fit: contain;
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
.settings-notice {
  grid-column: 1 / -1;
  margin: 0;
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
@media (max-width: 480px) {
  .settings-actions {
    width: 100%;
    justify-content: space-between;
  }
  .settings-actions button {
    min-height: 44px;
  }
  .shortcut-option {
    min-height: 46px;
  }
  .shortcut-fields input,
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
