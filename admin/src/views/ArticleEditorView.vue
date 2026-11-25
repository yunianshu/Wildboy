<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { askConfirm } from "../confirm";
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Activity, Page } from "../types";
import { articleStatusTone } from "../statusTone";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import ImageUpload from "../components/ImageUpload.vue";
import UiState from "../components/UiState.vue";

// 文章信息、正文和发布状态在同一页面连续完成。
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
const route = useRoute(),
  router = useRouter(),
  id = computed(() =>
    typeof route.params.id === "string" ? route.params.id : "",
  ),
  current = ref<Article | null>(null),
  loading = ref(false),
  saving = ref(false),
  error = ref(""),
  success = ref(""),
  dialog = ref<"publish" | "official" | null>(null);
const rich = ref<InstanceType<typeof MarkdownEditor> | null>(null);
const sources = ref<Activity[]>([]),
  sourcePage = ref(0),
  sourceMore = ref(false),
  sourceBusy = ref(false);
const form = reactive({
  title: "",
  summary: "",
  coverUrl: "",
  activityId: "",
});
const baseline = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
const isPublished = computed(
  () => !!current.value && current.value.status === "PUBLISHED",
);
const contentPending = computed(
  () =>
    !!id.value &&
    (!rich.value?.loaded || rich.value?.busy || rich.value?.dirty),
);
const actionBlocked = computed(
  () => saving.value || coverBusy.value || dirty.value || contentPending.value,
);
const unpublishBusy = computed(
  () => saving.value || coverBusy.value || !!rich.value?.busy,
);
function fill(article: Article, previousVersion?: number) {
  if (previousVersion !== undefined) {
    rich.value?.markSaved({ version: article.version }, previousVersion);
  }
  current.value = article;
  Object.assign(form, {
    title: article.title,
    summary: article.summary,
    coverUrl: article.coverUrl,
    activityId: article.activityId || "",
  });
  baseline.value = JSON.stringify(form);
  error.value = "";
}
function articleError(e: unknown) {
  return e instanceof ApiError && e.status === 409
    ? "文章版本或状态已变化，请重新加载后核对；不会自动覆盖。"
    : errorMessage(e);
}
let epoch = 0;
let alive = true;
onUnmounted(() => {
  alive = false;
  epoch++;
});
async function load() {
  if (!id.value || !currentUser.value) return;
  const n = ++epoch,
    actor = currentUser.value;
  loading.value = true;
  error.value = "";
  try {
    const a = await request<Article>(
      `/admin/articles/${encodeURIComponent(id.value)}`,
    );
    if (n === epoch && actor === currentUser.value && alive) fill(a);
  } catch (e) {
    if (n === epoch && alive) error.value = articleError(e);
  } finally {
    if (n === epoch && alive) loading.value = false;
  }
}
watch(
  () => id.value,
  () => {
    rich.value = null;
    if (id.value) void load();
  },
  { immediate: true },
);
watch(
  () => [id.value, form.activityId] as const,
  ([articleId, activityId]) => {
    // 已关联活动时提前拉取列表，让 chip 展示活动标题而非 ID
    if (articleId && activityId && !sources.value.length && !sourceBusy.value)
      void loadSources();
  },
  { immediate: true },
);
watch(currentUser, (user) => {
  // 登出即丢弃本地编辑状态，防止迟到响应把数据写回界面。
  if (!user) {
    epoch++;
    current.value = null;
    loading.value = false;
    saving.value = false;
    error.value = "";
    success.value = "";
  }
});
async function loadSources(append = false) {
  if (sourceBusy.value || !currentUser.value) return;
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
const titleInput = ref<HTMLTextAreaElement | null>(null);
watch(
  () => form.title,
  () =>
    void nextTick(() => {
      const el = titleInput.value;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }),
  { flush: "post" },
);
function contentSaved(version: number) {
  // 图文与资料共用文章版本号，正文保存成功后同步本地版本。
  if (current.value) current.value.version = version;
}
function validateTitle() {
  if (!form.title.trim()) {
    error.value = "请填写文章标题";
    titleInput.value?.focus();
    return false;
  }
  return true;
}
function articleFields() {
  return {
    title: form.title.trim(),
    summary: form.summary,
    coverUrl: form.coverUrl,
    activityId: form.activityId || null,
  };
}
async function saveMetaRequest(): Promise<boolean> {
  if (!validateTitle()) return false;
  const previousVersion = current.value?.version;
  const n = epoch,
    actor = currentUser.value;
  error.value = "";
  try {
    const a = await request<Article>(
      id.value
        ? `/admin/articles/${encodeURIComponent(id.value)}`
        : "/admin/articles",
      {
        method: id.value ? "PUT" : "POST",
        body: JSON.stringify({
          ...articleFields(),
          version: previousVersion,
        }),
      },
    );
    if (n !== epoch || actor !== currentUser.value || !alive) return false;
    fill(a, previousVersion);
    success.value = "已保存。";
    if (!id.value) await router.replace(`/articles/${a.id}/edit`);
    return true;
  } catch (e) {
    if (alive) error.value = articleError(e);
    return false;
  }
}
async function savePublished() {
  if (!validateTitle()) return;
  const target = current.value;
  const editor = rich.value;
  const content = editor?.readContent();
  if (!target || !editor || !content) {
    error.value = "正文尚未加载完成，请稍候再发布更新。";
    return;
  }
  if (content.version !== target.version) {
    error.value = "正文和文章信息的版本已变化，请重新加载后核对。";
    return;
  }
  const n = epoch;
  const actor = currentUser.value;
  error.value = "";
  try {
    const article = await request<Article>(
      `/admin/articles/${encodeURIComponent(target.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...articleFields(), ...content }),
      },
    );
    if (n !== epoch || actor !== currentUser.value || !alive) return;
    editor.markSaved(
      { markdown: content.markdown, version: article.version },
      content.version,
    );
    fill(article);
    success.value = "更新已发布，小程序将展示新版。";
  } catch (e) {
    if (n === epoch && actor === currentUser.value && alive)
      error.value = articleError(e);
  }
}

async function save() {
  if (saving.value || coverBusy.value || rich.value?.busy || !currentUser.value)
    return;
  if (!id.value) {
    saving.value = true;
    try {
      await saveMetaRequest();
    } finally {
      if (alive) saving.value = false;
    }
    return;
  }
  if (!dirty.value && !rich.value?.dirty) return;
  saving.value = true;
  try {
    if (isPublished.value) {
      await savePublished();
      return;
    }
    if (rich.value?.dirty) {
      if (!rich.value.loaded) {
        error.value = "图文尚未加载完成，请稍候再保存。";
        return;
      }
      await rich.value.save();
      if (rich.value.dirty) return; // 图文保存失败，编辑器内已展示错误
    }
    if (dirty.value) await saveMetaRequest();
    else success.value = "正文已保存。";
  } finally {
    if (alive) saving.value = false;
  }
}
async function reload() {
  if (!id.value || saving.value || rich.value?.busy) return;
  if (
    (dirty.value || rich.value?.dirty) &&
    !(await askConfirm("重新加载会丢弃未保存的修改，是否继续？"))
  )
    return;
  await load();
  if (current.value) await rich.value?.load?.();
}
const coverBusy = ref(false);
function requestAction(action: "publish" | "official") {
  if (!current.value || actionBlocked.value) return;
  if (action === "official" && current.value.isOfficial) return;
  error.value = "";
  success.value = "";
  dialog.value = action;
}
async function confirmAction() {
  const target = current.value;
  if (saving.value || !target || !dialog.value) return;
  const action = dialog.value;
  const n = epoch;
  const actor = currentUser.value;
  saving.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${target.id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ version: target.version }),
    });
    if (n === epoch && actor === currentUser.value && alive) {
      fill(a, target.version);
      success.value =
        action === "publish"
          ? "文章已发布，将在小程序探索页展示。"
          : "已设为官方介绍，探索页「野小子」入口将打开此文。";
      dialog.value = null;
    }
  } catch (e) {
    if (n === epoch && actor === currentUser.value && alive) {
      error.value = articleError(e);
      dialog.value = null;
    }
  } finally {
    if (n === epoch && actor === currentUser.value && alive)
      saving.value = false;
  }
}
async function unpublish() {
  const target = current.value;
  if (unpublishBusy.value || !target) return;
  const n = epoch,
    actor = currentUser.value;
  if (!(await askConfirm("确认下架文章？小程序将不再展示此文。"))) return;
  if (
    n !== epoch ||
    actor !== currentUser.value ||
    !alive ||
    unpublishBusy.value
  )
    return;
  saving.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${target.id}/unpublish`, {
      method: "POST",
      body: JSON.stringify({ version: target.version }),
    });
    if (n === epoch && actor === currentUser.value && alive) {
      rich.value?.markSaved({ version: a.version }, target.version);
      current.value = a;
      success.value = "文章已下架。";
    }
  } catch (e) {
    if (n === epoch && alive) error.value = articleError(e);
  } finally {
    if (alive) saving.value = false;
  }
}
async function canLeave() {
  return (
    (!dirty.value || (await askConfirm("文章信息尚未保存，确定离开吗？"))) &&
    (!rich.value || (await rich.value.canLeave()))
  );
}
onBeforeRouteLeave(async (to) => to.path === "/login" || (await canLeave()));
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || rich.value?.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onUnmounted(() => window.removeEventListener("beforeunload", beforeUnload));
useForegroundRefresh(() => {
  if (
    id.value &&
    !coverBusy.value &&
    !dirty.value &&
    !rich.value?.dirty &&
    !rich.value?.busy &&
    !saving.value &&
    !loading.value
  )
    void reload();
});
</script>
<template>
  <main class="workspace article-editor">
    <header class="page-heading article-topbar">
      <RouterLink class="article-back" to="/articles">
        <AppIcon name="back" :size="17" />返回文章列表
      </RouterLink>
      <div class="article-title-line">
        <h1>{{ id ? "编辑文章" : "新建文章" }}</h1>
        <div v-if="current" class="article-badges">
          <span
            class="status-pill inline"
            :class="`tone-${articleStatusTone(current.status)}`"
          >
            {{ current.status === "PUBLISHED" ? "已发布" : "草稿" }}
          </span>
          <span
            v-if="current.isOfficial"
            class="status-pill inline tone-info"
            title="探索页「野小子」入口当前打开此文"
            >官方介绍</span
          >
        </div>
      </div>
    </header>

    <p v-if="error" role="alert" class="error-box">
      {{ error }}
      <button v-if="id && current" class="text-button" @click="reload">
        {{ dirty || rich?.dirty ? "采用最新版本" : "重试" }}
      </button>
    </p>
    <UiState v-if="loading" kind="loading" compact>正在加载文章…</UiState>

    <template v-else>
      <div class="article-layout">
        <section class="article-writing-panel" aria-label="文章写作区">
          <div class="article-title-field">
            <div class="article-field-meta">
              <label for="article-title">文章标题 <span>*</span></label>
              <small>{{ form.title.length }} / 120</small>
            </div>
            <textarea
              id="article-title"
              ref="titleInput"
              v-model="form.title"
              class="article-title-input"
              rows="1"
              maxlength="120"
              placeholder="请输入文章标题"
              aria-label="文章标题"
              :disabled="saving"
            ></textarea>
          </div>
          <div class="article-summary-field">
            <div class="article-field-meta">
              <label for="article-summary">
                文章摘要 <small>用于文章列表与分享卡片</small>
              </label>
              <small class="field-counter"
                >{{ form.summary.length }} / 500</small
              >
            </div>
            <textarea
              id="article-summary"
              v-model="form.summary"
              class="article-summary-input"
              rows="2"
              maxlength="500"
              placeholder="用简短文字介绍文章内容，让读者快速了解主题…"
              aria-label="文章摘要"
              :disabled="saving"
            ></textarea>
          </div>
          <div class="article-body-heading">
            <h2>正文</h2>
            <small v-if="id">支持粘贴图片与 Markdown 格式</small>
          </div>
          <div v-if="!id" class="article-body-empty">
            <AppIcon name="document" :size="26" />
            <div>
              <strong>保存草稿后，继续撰写正文</strong>
              <p>已填写的标题、摘要与发布设置会自动保留。</p>
            </div>
          </div>
          <MarkdownEditor
            v-else
            ref="rich"
            :key="id"
            class="article-body-editor"
            managed-navigation
            :components="false"
            :height="620"
            placeholder="从这里开始撰写正文，可粘贴图片或输入 / 插入格式…"
            :path="`/admin/articles/${id}/content`"
            :disabled="saving"
            @saved="contentSaved"
          />
        </section>

        <aside class="article-settings">
          <section class="article-settings-card">
            <header class="article-settings-heading">
              <h2>发布设置</h2>
              <p>完善封面与关联信息</p>
            </header>
            <div class="setting-group cover-setting">
              <div class="setting-label">
                <strong>文章封面</strong><small>列表与分享时展示</small>
              </div>
              <ImageUpload
                label="上传文章封面"
                :preview="form.coverUrl"
                preview-alt="文章封面"
                :disabled="saving || (!!id && !current)"
                @busy="coverBusy = $event"
                @uploaded="form.coverUrl = $event"
              />
              <button
                v-if="form.coverUrl"
                type="button"
                class="text-button remove-cover"
                :disabled="saving || coverBusy"
                @click="form.coverUrl = ''"
              >
                移除封面
              </button>
            </div>
            <div class="setting-group">
              <label for="article-activity">关联活动 <small>选填</small></label>
              <select
                id="article-activity"
                v-model="form.activityId"
                aria-label="关联活动"
                :disabled="saving"
                @focus="!sources.length && loadSources()"
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
              </select>
              <p v-if="form.activityId" class="selected-activity">
                <AppIcon name="mountain" :size="15" />{{
                  sources.find((a) => a.id === form.activityId)?.title ||
                  `活动 ${form.activityId}`
                }}
              </p>
              <button
                v-if="!form.activityId && sourceMore"
                type="button"
                class="text-button"
                :disabled="saving || sourceBusy"
                @click="loadSources(true)"
              >
                {{ sourceBusy ? "正在加载…" : "加载更多活动" }}
              </button>
              <small class="setting-hint"
                >便于读者从文章进一步了解相关活动。</small
              >
            </div>
          </section>
          <section class="article-publish-card">
            <div class="article-publish-heading">
              <span
                :class="{ 'is-published': isPublished }"
                aria-hidden="true"
              ></span>
              <h2>{{ isPublished ? "内容已公开" : "发布说明" }}</h2>
            </div>
            <p>
              {{
                isPublished
                  ? "修改与正文一起发布；保存前，小程序仍展示线上版本。"
                  : id
                    ? "发布前请确认标题、摘要、封面和正文完整。"
                    : "先保存草稿，再撰写正文并发布。"
              }}
            </p>
            <div class="article-publish-meta">
              <span>内容版本</span
              ><strong>{{ current?.version ?? "—" }}</strong>
            </div>
            <small>保存与发布均进行版本校验，不会自动覆盖他人修改。</small>
          </section>
        </aside>
      </div>
    </template>

    <footer v-if="!loading && (!id || current)" class="article-footer">
      <span
        v-if="dirty || rich?.dirty"
        class="footer-status article-save-hint is-dirty"
        role="status"
        >{{
          isPublished ? "修改待发布 · 小程序仍展示线上版本" : "有未保存修改"
        }}</span
      >
      <span
        v-else-if="current || success"
        class="footer-status article-save-hint"
        role="status"
        >{{ success || `内容已保存 · 版本 ${current?.version}` }}</span
      >
      <span v-else class="footer-status article-save-hint" role="status">
        填写标题后保存草稿，继续撰写正文
      </span>
      <div class="footer-actions">
        <template v-if="current?.status === 'PUBLISHED'">
          <button
            class="danger-outline"
            :disabled="unpublishBusy"
            @click="unpublish"
          >
            下架
          </button>
          <button
            class="secondary"
            :disabled="actionBlocked || current.isOfficial"
            @click="requestAction('official')"
          >
            {{ current.isOfficial ? "当前官方介绍" : "设为官方介绍" }}
          </button>
          <button
            class="primary"
            :disabled="
              saving ||
              coverBusy ||
              !!rich?.busy ||
              !rich?.loaded ||
              !rich?.ready ||
              (!dirty && !rich?.dirty)
            "
            @click="save"
          >
            {{ saving ? "正在发布…" : "发布更新" }}
          </button>
        </template>
        <template v-else-if="current">
          <button
            class="secondary"
            :disabled="
              saving || coverBusy || !!rich?.busy || (!dirty && !rich?.dirty)
            "
            @click="save"
          >
            {{ saving ? "正在保存…" : "保存" }}
          </button>
          <button
            class="primary"
            :disabled="actionBlocked"
            @click="requestAction('publish')"
          >
            发布
          </button>
        </template>
        <button
          v-else-if="!id"
          class="primary"
          :disabled="saving || coverBusy"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存草稿" }}
        </button>
      </div>
    </footer>
    <ConfirmDialog
      v-if="dialog && current"
      :busy="saving"
      :title="dialog === 'publish' ? '发布文章？' : '设为官方介绍？'"
      :description="
        dialog === 'publish'
          ? `「${current.title}」发布后将在小程序探索页公开展示。`
          : `「野小子」入口将改为「${current.title}」。原介绍保留在文章轮播。`
      "
      :confirm-label="dialog === 'publish' ? '确认发布' : '确认设为官方介绍'"
      @confirm="confirmAction"
      @cancel="!saving && (dialog = null)"
    />
  </main>
</template>
<style scoped>
.article-editor {
  max-width: 1320px;
}
.article-topbar {
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
  margin-bottom: 22px;
}
.article-back {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 40px;
  padding-right: 20px;
  border-right: 1px solid var(--rf-line);
  color: var(--rf-muted);
  font-size: 13px;
}
.article-back:hover {
  color: var(--rf-primary-text);
}
.article-title-line,
.article-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.article-title-line h1 {
  font-size: 22px;
  font-weight: 650;
}
.article-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 304px;
  gap: 24px;
  align-items: start;
}
.article-writing-panel,
.article-settings-card {
  min-width: 0;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-surface);
  box-shadow: var(--rf-shadow-sm);
}
.article-writing-panel {
  padding: 36px 42px 30px;
}
.article-field-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.article-field-meta label,
.setting-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--rf-ink);
  font-size: 13px;
  font-weight: 500;
}
.article-field-meta label > span {
  color: var(--rf-danger);
}
.article-field-meta > small,
.article-field-meta label small,
.setting-group label small {
  color: var(--rf-muted);
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.article-title-input,
.article-summary-input {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.article-title-input {
  min-height: 66px;
  padding: 9px 0 18px;
  overflow: hidden;
  border-bottom: 1px solid var(--rf-line);
  resize: none;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: -0.4px;
}
.article-title-input:focus,
.article-summary-input:focus {
  outline: 0;
}
.article-title-input:focus {
  border-bottom-color: var(--rf-primary);
  box-shadow: 0 1px 0 var(--rf-primary);
}
.article-title-input::placeholder,
.article-summary-input::placeholder {
  color: #97a79c;
}
.article-summary-field {
  margin-top: 24px;
  padding: 15px 18px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #f6f9f7;
}
.article-summary-field:focus-within {
  border-color: var(--rf-line);
  background: var(--rf-soft);
}
.article-summary-input {
  min-height: 72px;
  padding: 9px 0 0;
  font-size: 13px;
  line-height: 1.8;
  resize: vertical;
}
.article-body-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 28px 0 14px;
  padding-top: 22px;
  border-top: 1px solid var(--rf-line);
}
.article-body-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.article-body-heading > small {
  color: var(--rf-muted);
  font-size: 12px;
}
.article-body-empty {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-radius: 10px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
}
.article-body-empty > .app-icon {
  flex-shrink: 0;
}
.article-body-empty strong {
  color: var(--rf-ink);
  font-size: 14px;
  font-weight: 600;
}
.article-body-empty p {
  margin: 5px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.8;
}
.article-body-editor {
  margin-top: 0;
}
.article-body-editor :deep(.vditor) {
  border: 1px solid var(--rf-line);
  border-radius: 10px;
  box-shadow: none;
}
.article-body-editor :deep(.vditor-toolbar) {
  padding: 6px 8px;
  border-radius: 10px 10px 0 0;
}
.article-body-editor :deep(.vditor-wysiwyg) {
  padding: 26px 20px;
  line-height: 1.9;
}
.article-settings {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 16px;
  min-width: 0;
}
.article-settings-card {
  padding: 22px;
}
.article-settings-heading {
  margin-bottom: 20px;
}
.article-settings-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.article-settings-heading p {
  margin: 4px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
}
.setting-group {
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid var(--rf-line);
}
.setting-group.cover-setting {
  padding-top: 0;
  margin-top: 0;
  border-top: 0;
}
.setting-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.setting-label strong {
  font-size: 13px;
  font-weight: 600;
}
.setting-label small,
.setting-hint {
  color: var(--rf-muted);
  font-size: 11px;
}
.setting-group select {
  margin: 0;
}
.setting-hint {
  display: block;
  margin-top: 9px;
  line-height: 1.7;
}
.remove-cover {
  display: flex;
  margin: 7px 0 0 auto;
}
.selected-activity {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 9px 0 0;
  color: var(--rf-primary-text);
  font-size: 12px;
  line-height: 1.6;
}
.selected-activity .app-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
.article-publish-card {
  padding: 20px 22px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-soft);
}
.article-publish-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.article-publish-heading > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rf-warning);
}
.article-publish-heading > span.is-published {
  background: var(--rf-success);
}
.article-publish-card h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}
.article-publish-card > p {
  margin: 10px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.8;
}
.article-publish-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 12px;
  padding-block: 10px;
  border-block: 1px solid var(--rf-line);
  color: var(--rf-muted);
  font-size: 12px;
}
.article-publish-meta strong {
  color: var(--rf-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.article-publish-card > small {
  display: block;
  color: var(--rf-muted);
  font-size: 11px;
  line-height: 1.7;
}
.article-footer {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 22px;
  padding: 12px 14px 12px 18px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: #fffffff2;
  box-shadow: 0 10px 28px #183c2914;
  backdrop-filter: blur(14px);
}
.article-footer .footer-actions {
  margin-left: auto;
}
.article-save-hint {
  color: var(--rf-muted);
  font-size: 12px;
}
.article-save-hint.is-dirty {
  color: var(--rf-warning);
}
@media (max-width: 1100px) {
  .article-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .article-settings {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .article-topbar {
    gap: 12px;
    margin-bottom: 18px;
  }
  .article-back {
    gap: 4px;
    padding-right: 12px;
    font-size: 12px;
  }
  .article-title-line {
    gap: 8px;
  }
  .article-title-line h1 {
    font-size: 20px;
  }
  .article-writing-panel {
    padding: 24px 18px;
  }
  .article-field-meta label {
    font-size: 12px;
  }
  .article-title-input {
    min-height: 58px;
    padding-bottom: 14px;
    font-size: 24px;
  }
  .article-summary-field {
    margin-top: 20px;
    padding: 14px;
  }
  .article-field-meta label small {
    font-size: 10px;
  }
  .article-body-heading {
    margin-top: 24px;
    padding-top: 18px;
  }
  .article-body-heading > small {
    font-size: 11px;
  }
  .article-body-editor :deep(.vditor-wysiwyg) {
    padding: 20px 12px;
  }
  .article-settings {
    grid-template-columns: minmax(0, 1fr);
  }
  .article-settings-card {
    padding: 20px;
  }
  .article-footer {
    position: static;
    padding: 12px;
  }
  .article-footer .footer-status {
    flex-basis: 100%;
    margin: 0;
  }
  .article-footer .footer-actions {
    width: 100%;
  }
  .article-footer .footer-actions button {
    flex: 1;
  }
}
</style>
