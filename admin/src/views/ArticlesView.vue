<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Activity, Page } from "../types";
import { articleStatusTone } from "../statusTone";
import AppIcon from "../components/AppIcon.vue";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import UiState from "../components/UiState.vue";
type Article = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  activityId: string | null;
  status: "DRAFT" | "PUBLISHED";
  isOfficial: boolean;
  version: number;
};
const items = ref<Article[]>([]),
  page = ref(0),
  more = ref(false),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  success = ref("");
const opened = ref(false),
  selected = ref<Article | null>(null),
  editorPage = ref<"info" | "content">("info"),
  contentKey = ref(0),
  rich = ref<InstanceType<typeof MarkdownEditor> | null>(null);
type ArticleAction = "publish" | "unpublish" | "official";
const confirmation = ref<{
  action: Exclude<ArticleAction, "unpublish">;
  id: string;
  version: number;
} | null>(null);
const form = reactive({ title: "", summary: "", coverUrl: "", activityId: "" });
const snapshot = ref(""),
  sources = ref<Activity[]>([]),
  sourcePage = ref(0),
  sourceMore = ref(false),
  sourceBusy = ref(false);
const dirty = computed(() => JSON.stringify(form) !== snapshot.value);
const locked = computed(
  () => busy.value || selected.value?.status === "PUBLISHED",
);
const contentPending = computed(
  () =>
    !!selected.value &&
    (!rich.value?.loaded || rich.value?.busy || rich.value?.dirty),
);
function articleError(e: unknown) {
  return e instanceof ApiError && e.status === 409
    ? "文章版本或状态已变化，请重新加载后核对；不会自动覆盖。"
    : errorMessage(e);
}
let epoch = 0;
function reset() {
  epoch++;
  opened.value = false;
  selected.value = null;
  confirmation.value = null;
  items.value = [];
  sources.value = [];
  busy.value = false;
  loading.value = false;
  sourceBusy.value = false;
  error.value = "";
  success.value = "";
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load();
  }
});
onUnmounted(reset);
async function load(append = false) {
  if (loading.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value,
    p = append ? page.value + 1 : 0;
  loading.value = true;
  error.value = "";
  try {
    const result = await request<Page<Article>>(
      `/admin/articles?page=${p}&size=20`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = append ? [...items.value, ...result.items] : result.items;
    page.value = p;
    more.value = result.hasMore;
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
async function loadSources(append = false) {
  if (sourceBusy.value) return;
  const n = epoch,
    actor = currentUser.value,
    p = append ? sourcePage.value + 1 : 0;
  sourceBusy.value = true;
  try {
    const r = await request<Page<Activity>>(
      `/admin/activities?page=${p}&size=50`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    sources.value = append ? [...sources.value, ...r.items] : r.items;
    sourcePage.value = p;
    sourceMore.value = r.hasMore;
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) sourceBusy.value = false;
  }
}
function fill(article: Article | null) {
  selected.value = article;
  Object.assign(form, {
    title: article?.title || "",
    summary: article?.summary || "",
    coverUrl: article?.coverUrl || "",
    activityId: article?.activityId || "",
  });
  snapshot.value = JSON.stringify(form);
  contentKey.value++;
}
async function open(article: Article | null) {
  if (busy.value || !currentUser.value) return;
  editorPage.value = "info";
  error.value = "";
  success.value = "";
  if (!article) {
    fill(null);
    opened.value = true;
    void loadSources();
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  try {
    const latest = await request<Article>(`/admin/articles/${article.id}`);
    if (n !== epoch || actor !== currentUser.value) return;
    fill(latest);
    opened.value = true;
    void loadSources();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function canLeave() {
  return (
    (!dirty.value || window.confirm("文章信息尚未保存，确定离开吗？")) &&
    (!rich.value || rich.value.canLeave())
  );
}
function close() {
  if (busy.value || rich.value?.busy || !canLeave()) return;
  opened.value = false;
  selected.value = null;
}
onBeforeRouteLeave(
  (to) =>
    to.path === "/login" ||
    !opened.value ||
    (!busy.value && !rich.value?.busy && canLeave()),
);
async function reload() {
  if (!selected.value || busy.value || rich.value?.busy || !canLeave()) return;
  const id = selected.value.id,
    n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${id}`);
    if (n === epoch && actor === currentUser.value) fill(a);
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function contentSaved(version: number) {
  if (selected.value) {
    selected.value.version = version;
    const row = items.value.find((a) => a.id === selected.value?.id);
    if (row) row.version = version;
  }
}
async function save() {
  if (locked.value || contentPending.value || !currentUser.value) return;
  if (!form.title.trim()) {
    error.value = "请填写文章标题";
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(
      `/admin/articles${selected.value ? "/" + selected.value.id : ""}`,
      {
        method: selected.value ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          activityId: form.activityId || null,
          version: selected.value?.version,
        }),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    fill(a);
    success.value = "文章信息已保存，请编辑并保存图文后发布";
    await load();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function requestConfirmation(action: Exclude<ArticleAction, "unpublish">) {
  if (!selected.value || busy.value || dirty.value || contentPending.value)
    return;
  confirmation.value = {
    action,
    id: selected.value.id,
    version: selected.value.version,
  };
}
function confirmAction() {
  const target = confirmation.value;
  confirmation.value = null;
  if (
    target &&
    selected.value?.id === target.id &&
    selected.value.version === target.version
  )
    void action(target.action);
  else if (target) error.value = "文章版本已变化，请重新加载后再确认。";
}
async function action(kind: ArticleAction) {
  if (
    !selected.value ||
    busy.value ||
    dirty.value ||
    contentPending.value ||
    !currentUser.value
  )
    return;
  if (
    kind === "unpublish" &&
    !window.confirm("确认下架文章？小程序将不再展示此文。")
  )
    return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(
      `/admin/articles/${selected.value.id}/${kind}`,
      {
        method: "POST",
        body: JSON.stringify({ version: selected.value.version }),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    fill(a);
    success.value = "文章设置已更新";
    await load();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <main class="workspace articles-workspace">
    <div class="page-heading">
      <h1>文章管理</h1>
      <div class="article-actions">
        <button class="secondary" :disabled="loading || busy" @click="load()">
          <AppIcon name="refresh" :size="16" />
          {{ loading ? "加载中…" : "刷新文章" }}
        </button>
        <button class="primary" :disabled="busy" @click="open(null)">
          <AppIcon name="plus" :size="16" />
          新建文章
        </button>
      </div>
    </div>
    <p v-if="error && !opened" class="error-box" role="alert">{{ error }}</p>
    <p v-if="success && !opened" role="status">{{ success }}</p>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在读取文章…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact
      >暂无文章，创建草稿并发布后即可展示。</UiState
    >
    <div v-if="items.length" class="table-scroll article-table">
      <table aria-label="文章">
        <thead>
          <tr>
            <th scope="col">标题</th>
            <th scope="col">状态</th>
            <th scope="col">公开入口</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="article in items" :key="article.id">
            <td class="article-title">{{ article.title }}</td>
            <td>
              <span
                class="status-pill inline"
                :class="`tone-${articleStatusTone(article.status)}`"
              >
                {{ article.status === "PUBLISHED" ? "已发布" : "草稿" }}
              </span>
            </td>
            <td>
              {{
                article.status === "DRAFT"
                  ? "—"
                  : article.isOfficial
                    ? "野小子官方介绍"
                    : "探索页文章"
              }}
            </td>
            <td>
              <button
                class="text-button"
                :disabled="busy"
                @click="open(article)"
              >
                {{ article.status === "PUBLISHED" ? "查看文章" : "编辑文章" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="more"
      class="secondary article-more"
      :disabled="loading || busy"
      @click="load(true)"
    >
      加载更多文章
    </button>
    <p class="article-hint">只有已发布文章可以设为官方介绍。</p>
    <FormModal v-if="opened" class="article-editor" size="lg" @close="close">
      <h2>{{ selected ? "编辑文章" : "新建文章" }}</h2>
      <div class="article-tabs" role="group" aria-label="文章编辑区域">
        <button
          class="text-button"
          :aria-pressed="editorPage === 'info'"
          @click="editorPage = 'info'"
        >
          基本资料
        </button>
        <button
          class="text-button"
          :aria-pressed="editorPage === 'content'"
          :disabled="!selected"
          @click="editorPage = 'content'"
        >
          图文正文
        </button>
      </div>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <button
        v-if="selected"
        class="text-button article-reload"
        :disabled="busy || !!rich?.busy"
        @click="reload"
      >
        重新加载文章
      </button>
      <p v-if="selected?.status === 'PUBLISHED'" class="article-hint">
        已发布文章为只读，需先下架再编辑。下架官方介绍后需重新发布并设为官方介绍。
      </p>
      <form
        v-show="editorPage === 'info'"
        id="article-info-form"
        @submit.prevent="save"
      >
        <fieldset :disabled="locked || !!rich?.busy">
          <label class="article-title-field"
            >标题<input
              v-model="form.title"
              required
              maxlength="120"
              aria-label="文章标题"
          /></label>
          <span
            v-if="selected"
            class="status-pill inline article-editor-status"
            :class="`tone-${articleStatusTone(selected.status)}`"
            >{{ selected.status === "PUBLISHED" ? "已发布" : "草稿" }}</span
          >
          <label class="article-summary"
            >摘要<textarea
              v-model="form.summary"
              maxlength="500"
              aria-label="文章摘要"
            />
          </label>
          <label
            >封面图片地址<input
              v-model="form.coverUrl"
              aria-label="文章封面"
              placeholder="HTTPS 或 /assets/ 图片地址"
          /></label>
          <label
            >关联活动（选填）<select
              v-model="form.activityId"
              aria-label="关联活动"
            >
              <option value="">不关联活动</option>
              <option
                v-if="
                  form.activityId &&
                  !sources.some((a) => a.id === form.activityId)
                "
                :value="form.activityId"
              >
                当前关联活动 {{ form.activityId }}
              </option>
              <option v-for="a in sources" :key="a.id" :value="a.id">
                {{ a.title }}
              </option>
            </select></label
          >
          <ImageUpload
            class="article-upload"
            :disabled="locked || !!rich?.busy"
            @uploaded="form.coverUrl = $event"
          />
          <button
            v-if="sourceMore"
            type="button"
            :disabled="sourceBusy"
            @click="loadSources(true)"
          >
            加载更多活动
          </button>
        </fieldset>
      </form>
      <MarkdownEditor
        v-if="selected"
        v-show="editorPage === 'content'"
        :key="contentKey"
        ref="rich"
        managed-navigation
        :active="editorPage === 'content'"
        :path="`/admin/articles/${selected.id}/content`"
        :disabled="locked"
        @saved="contentSaved"
      />
      <p v-if="dirty || rich?.dirty" class="article-hint">
        有未保存修改，请先保存文章信息和图文再发布或设置入口。
      </p>
      <div class="article-actions article-footer">
        <button
          class="secondary"
          :disabled="busy || !!rich?.busy"
          @click="close"
        >
          关闭
        </button>
        <button
          v-if="editorPage === 'info' && selected?.status === 'DRAFT'"
          class="secondary"
          :disabled="busy || dirty || contentPending"
          @click="requestConfirmation('publish')"
        >
          发布文章
        </button>
        <template
          v-if="selected?.status === 'PUBLISHED' && editorPage === 'info'"
          ><button
            class="danger-outline"
            :disabled="busy || contentPending"
            @click="action('unpublish')"
          >
            下架并编辑</button
          ><button
            class="primary"
            :disabled="busy || contentPending || selected.isOfficial"
            @click="requestConfirmation('official')"
          >
            {{ selected.isOfficial ? "当前官方介绍" : "设为官方介绍" }}
          </button></template
        >
        <button
          v-if="editorPage === 'info' && selected?.status !== 'PUBLISHED'"
          class="primary"
          type="submit"
          form="article-info-form"
          :disabled="locked || !!rich?.busy || contentPending"
        >
          保存文章信息
        </button>
      </div>
    </FormModal>
    <FormModal
      v-if="confirmation && selected"
      class="article-confirm"
      @close="confirmation = null"
    >
      <h2>
        {{
          confirmation.action === "publish" ? "发布文章？" : "设为官方介绍？"
        }}
      </h2>
      <dl class="article-confirm-title">
        <dt>所选文章</dt>
        <dd>{{ selected.title }}</dd>
      </dl>
      <p v-if="confirmation.action === 'publish'">
        发布后，这篇文章将在小程序探索页公开展示。
      </p>
      <p v-else>
        探索页「野小子」入口将打开这篇文章，替换原官方介绍。原官方介绍仍是已发布文章，会回到探索页文章轮播。
      </p>
      <div class="article-actions article-footer">
        <button class="secondary" @click="confirmation = null">取消</button>
        <button class="primary" @click="confirmAction">
          {{
            confirmation.action === "publish" ? "确认发布" : "确认设为官方介绍"
          }}
        </button>
      </div>
    </FormModal>
  </main>
</template>
<style scoped>
.article-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.article-table table {
  min-width: 495px;
  table-layout: fixed;
}
.article-table th:nth-child(2) {
  width: 14%;
}
.article-table th:nth-child(3) {
  width: 24%;
}
.article-table th:last-child {
  width: 116px;
}
.article-title {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.article-table .draft,
.article-editor-status.draft {
  color: var(--admin-muted);
  background: var(--admin-paper);
}
.article-hint {
  margin: 10px 0 0;
  color: var(--admin-muted);
  font-size: 13px;
}
.article-more {
  margin-top: 12px;
}
.article-editor :deep(.form-modal) {
  max-width: 820px;
  background: var(--admin-surface);
}
.article-confirm :deep(.form-modal) {
  max-width: 560px;
  background: var(--admin-surface);
}
.article-editor h2,
.article-confirm h2 {
  margin: 0 42px 12px 0;
  font-size: 20px;
}
.article-tabs {
  display: flex;
  gap: 8px;
  width: fit-content;
  margin: 0 0 14px;
}
.article-tabs button {
  border: 1px solid var(--admin-line);
  padding-inline: 12px;
}
.article-tabs button[aria-pressed="true"] {
  color: var(--admin-primary);
  background: var(--admin-tint);
  font-weight: 650;
}
.article-reload {
  margin-bottom: 8px;
}
.article-editor fieldset {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.article-editor fieldset > label {
  margin: 0;
}
.article-summary,
.article-upload {
  grid-column: 1 / -1;
}
.article-summary textarea {
  min-height: 68px;
}
.article-title-field {
  grid-column: 1 / -1;
}
.article-editor-status {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  align-self: start;
}
.article-title-field + .article-editor-status {
  margin-top: -5px;
}
.article-footer {
  justify-content: flex-end;
  margin-top: 16px;
}
.article-confirm-title {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: var(--admin-paper);
  border-radius: var(--admin-radius);
}
.article-confirm-title dt {
  font-size: 12px;
  color: var(--admin-muted);
}
.article-confirm-title dd {
  margin: 2px 0 0;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.article-editor :deep(.rich-editor > h2) {
  font-size: 15px;
  margin: 0;
}
.article-editor :deep(.rich-block) {
  margin: 10px 0;
  padding: 12px;
  border-color: var(--admin-line);
  border-radius: var(--admin-radius);
}
@media (max-width: 720px) {
  .article-editor fieldset {
    grid-template-columns: minmax(0, 1fr);
  }
  .article-editor-status {
    grid-column: 1;
  }
  .article-tabs button {
    min-height: 44px;
  }
}
</style>
