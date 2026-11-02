<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import ImageUpload from "../components/ImageUpload.vue";
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
  generation = ref(0);
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
const busy = computed(
  () =>
    loading.value || saving.value || Object.values(uploads.value).some(Boolean),
);
const dirty = computed(
  () => !!config.value && JSON.stringify(config.value) !== snapshot.value,
);
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
  snapshot.value = JSON.stringify(value);
  generation.value++;
  uploads.value = {};
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
  if (busy.value || !currentUser.value || !config.value) return;
  error.value = "";
  success.value = "";
  if (
    config.value.items.some((e) => !e.name.trim() || e.name.trim().length > 12)
  ) {
    error.value = "入口名称请填写 1–12 个字";
    return;
  }
  if (
    config.value.items.some(
      (e) =>
        e.type === "POPUP" &&
        e.popupImageUrl &&
        !imageUrlValid(e.popupImageUrl),
    )
  ) {
    error.value = "图片须为 HTTPS 或 /assets/ 地址";
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
    if (n === epoch)
      error.value =
        e instanceof ApiError && e.status === 409
          ? "配置版本或文章状态已变化，请重新加载后核对；不会自动覆盖。"
          : errorMessage(e);
  } finally {
    if (n === epoch) saving.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <main class="workspace">
    <div class="page-heading">
      <div>
        <h1>基础配置</h1>
        <p>首页固定四个横向入口；保存后公开生效，不修改活动分类。</p>
      </div>
      <button class="secondary button" :disabled="busy" @click="load">
        重新加载配置
      </button>
    </div>
    <p v-if="loading">正在加载配置…</p>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="sourceError" class="error-box" role="alert">
      {{ sourceError }}
      <button :disabled="busy" @click="loadArticles(epoch, currentUser)">
        重试文章选项
      </button>
    </p>
    <form v-if="config" @submit.prevent="save">
      <fieldset :disabled="busy">
        <section
          v-for="entry in config.items"
          :key="entry.slot"
          :data-slot="entry.slot"
          class="shortcut-card"
        >
          <h2>入口 {{ entry.slot }}</h2>
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
          <template v-if="entry.type === 'POPUP'"
            ><label
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
            ><label
              >二维码 / 图片地址<input
                v-model="entry.popupImageUrl"
                :aria-label="`入口${entry.slot}弹窗图片`"
                maxlength="2048"
                placeholder="上传真实二维码图片，或填写 HTTPS /assets/ 地址"
            /></label>
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
            <p v-else>
              尚未配置二维码/图片；小程序会显示明确的未配置提示，不生成示例二维码。
            </p>
          </template>
        </section>
      </fieldset>
      <button class="primary button" type="submit" :disabled="busy">
        {{ saving ? "保存中…" : "保存首页配置" }}
      </button>
      <p v-if="Object.values(uploads).some(Boolean)">
        图片上传中，请等待完成后保存。
      </p>
      <p v-if="dirty">有未保存修改。</p>
    </form>
  </main>
</template>
<style scoped>
fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.shortcut-card {
  background: white;
  border: 1px solid #ddd;
  padding: 24px;
  margin: 16px 0;
  border-radius: 12px;
}
.shortcut-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
label {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}
.popup-preview {
  display: block;
  max-width: 240px;
  max-height: 280px;
  object-fit: contain;
  margin-top: 12px;
}
textarea {
  min-height: 100px;
}
@media (max-width: 650px) {
  .shortcut-fields {
    grid-template-columns: 1fr;
  }
}
</style>
