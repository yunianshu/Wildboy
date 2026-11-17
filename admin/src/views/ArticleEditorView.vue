<script setup lang="ts">
import { askConfirm } from "../confirm";
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Activity, Page } from "../types";
import { articleStatusTone } from "../statusTone";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import UiState from "../components/UiState.vue";

// Medium 式文档画布：标题、摘要、封面与图文正文都是文档流的一部分，
// 基本资料以 Notion 式属性行内嵌在文档顶部，不再使用弹窗。
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
// 双编辑布局：工作台（左侧资料栏 + 右侧画布）与文档（Medium 式画布）。
// 编辑器经 Teleport 在两套布局的挂载点间搬移，切换不重挂、未保存正文不丢。
type EditorLayout = "workbench" | "canvas";
const LAYOUT_KEY = "wildboy-admin-article-layout";
function initialLayout(): EditorLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored === "workbench" || stored === "canvas") return stored;
  } catch {
    // localStorage 不可用（隐私模式等）时使用默认布局
  }
  return "workbench";
}
const layout = ref<EditorLayout>(initialLayout());
watch(layout, (value) => {
  try {
    localStorage.setItem(LAYOUT_KEY, value);
  } catch {
    // 忽略持久化失败
  }
});
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
const locked = computed(
  () => !!current.value && current.value.status === "PUBLISHED",
);
const contentPending = computed(
  () =>
    !!id.value &&
    (!rich.value?.loaded || rich.value?.busy || rich.value?.dirty),
);
const actionBlocked = computed(
  () => saving.value || dirty.value || contentPending.value,
);
function fill(article: Article) {
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
function autosize(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
const titleInput = ref<HTMLTextAreaElement | null>(null);
function contentSaved(version: number) {
  // 图文与资料共用文章版本号，正文保存成功后同步本地版本。
  if (current.value) current.value.version = version;
}
async function saveMetaRequest(): Promise<boolean> {
  if (!form.title.trim()) {
    error.value = "请填写文章标题";
    titleInput.value?.focus();
    return false;
  }
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
          title: form.title.trim(),
          summary: form.summary,
          coverUrl: form.coverUrl,
          activityId: form.activityId || null,
          version: current.value?.version,
        }),
      },
    );
    if (n !== epoch || actor !== currentUser.value || !alive) return false;
    fill(a);
    success.value = "已保存。";
    if (!id.value) await router.replace(`/articles/${a.id}/edit`);
    return true;
  } catch (e) {
    if (alive) error.value = articleError(e);
    return false;
  }
}
// 统一保存：先存图文（保证版本号推进），再存基本资料；失败即中断，不覆盖。
async function save() {
  if (saving.value || locked.value || !currentUser.value) return;
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
    if (rich.value?.dirty) {
      if (!rich.value.loaded) {
        error.value = "图文尚未加载完成，请稍候再保存。";
        return;
      }
      await rich.value.save();
      if (rich.value.dirty) return; // 图文保存失败，编辑器内已展示错误
    }
    if (dirty.value) await saveMetaRequest();
  } finally {
    if (alive) saving.value = false;
  }
}
async function reload() {
  if (!id.value || saving.value || rich.value?.busy) return;
  if (
    dirty.value &&
    !(await askConfirm("重新加载会丢弃未保存的修改，是否继续？"))
  )
    return;
  await load();
}
// 封面与正文图片一律上传到 /admin/media，与 ImageUpload / MarkdownEditor 同源。
const coverInput = ref<HTMLInputElement | null>(null),
  coverBusy = ref(false);
async function pickCover(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || coverBusy.value || locked.value || saving.value) return;
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 4 * 1024 * 1024
  ) {
    error.value = "请选择 4MB 内 JPG/PNG 图片";
    return;
  }
  const actor = currentUser.value;
  coverBusy.value = true;
  error.value = "";
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
    if (!alive || currentUser.value !== actor) return;
    const result = await request<{ url: string }>("/admin/media", {
      method: "POST",
      body: JSON.stringify({ dataBase64: data }),
    });
    if (alive && currentUser.value === actor) form.coverUrl = result.url;
  } catch (e) {
    if (alive && currentUser.value === actor) error.value = articleError(e);
  } finally {
    if (alive) coverBusy.value = false;
  }
}
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
  saving.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${target.id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ version: target.version }),
    });
    if (alive) {
      fill(a);
      success.value =
        action === "publish"
          ? "文章已发布，将在小程序探索页展示。"
          : "已设为官方介绍，探索页「野小子」入口将打开此文。";
      dialog.value = null;
    }
  } catch (e) {
    if (alive) {
      error.value = articleError(e);
      dialog.value = null;
    }
  } finally {
    if (alive) saving.value = false;
  }
}
async function unpublish() {
  const target = current.value;
  if (saving.value || !target) return;
  if (!(await askConfirm("确认下架文章？小程序将不再展示此文。"))) return;
  const n = epoch,
    actor = currentUser.value;
  saving.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${target.id}/unpublish`, {
      method: "POST",
      body: JSON.stringify({ version: target.version }),
    });
    if (n === epoch && actor === currentUser.value && alive) {
      fill(a);
      success.value = "文章已下架，可编辑后重新发布。";
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
</script>
<template>
  <main class="workspace article-editor">
    <div class="article-topbar">
      <div class="article-topbar-left">
        <RouterLink class="article-back" to="/articles">
          <AppIcon name="back" :size="16" />
          文章
        </RouterLink>
        <span
          v-if="current"
          class="status-pill inline"
          :class="`tone-${articleStatusTone(current.status)}`"
          >{{ current.status === "PUBLISHED" ? "已发布" : "草稿" }}</span
        >
        <span
          v-if="current?.isOfficial"
          class="status-pill inline tone-info"
          title="探索页「野小子」入口当前打开此文"
          >官方介绍</span
        >
        <nav class="layout-switch" aria-label="编辑布局">
          <button
            type="button"
            :aria-pressed="layout === 'workbench'"
            title="左侧资料栏 + 右侧编辑画布，条理清晰"
            @click="layout = 'workbench'"
          >
            工作台
          </button>
          <button
            type="button"
            :aria-pressed="layout === 'canvas'"
            title="资料内嵌文档流，像写文章一样沉浸"
            @click="layout = 'canvas'"
          >
            文档
          </button>
        </nav>
      </div>
      <div class="article-topbar-actions">
        <span
          v-if="dirty || rich?.dirty"
          class="article-save-hint is-dirty"
          role="status"
          >● 有尚未保存的修改</span
        >
        <span v-else-if="current" class="article-save-hint" role="status"
          >内容已保存 · 版本 {{ current.version }}</span
        >
        <button
          v-if="current"
          class="text-button"
          :disabled="saving || !!rich?.busy"
          @click="reload"
        >
          重新加载
        </button>
        <template v-if="current?.status === 'PUBLISHED'">
          <button
            class="danger-outline"
            :disabled="saving || !!rich?.busy"
            @click="unpublish"
          >
            下架并编辑
          </button>
          <button
            class="primary"
            :disabled="saving || !!rich?.busy || current.isOfficial"
            @click="requestAction('official')"
          >
            {{ current.isOfficial ? "当前官方介绍" : "设为官方介绍" }}
          </button>
        </template>
        <template v-else-if="current">
          <button
            class="primary"
            :disabled="saving || (!dirty && !rich?.dirty)"
            @click="save"
          >
            {{ saving ? "正在保存…" : "保存" }}
          </button>
          <button
            class="article-publish"
            :disabled="actionBlocked"
            @click="requestAction('publish')"
          >
            发布
          </button>
        </template>
        <button
          v-else-if="!id"
          class="primary"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存草稿" }}
        </button>
      </div>
    </div>
    <p v-if="error" role="alert" class="error-box">
      {{ error }}
      <button v-if="id && current" class="text-button" @click="reload">
        重新加载最新版本
      </button>
    </p>
    <p v-if="success" role="status" class="success-box">{{ success }}</p>
    <UiState v-if="loading" kind="loading" compact>正在加载文章…</UiState>
    <template v-else>
      <!-- 工作台模式（Linear 式）：左侧文章资料栏 + 右侧编辑画布 -->
      <div v-show="layout === 'workbench'" class="workbench">
        <aside class="workbench-side">
          <template v-if="layout === 'workbench'">
            <section>
              <p class="wb-label">封面</p>
              <div class="wb-card wb-cover">
                <img
                  v-if="form.coverUrl"
                  :src="form.coverUrl"
                  alt="文章封面"
                  referrerpolicy="no-referrer"
                />
                <button
                  v-else
                  type="button"
                  class="wb-cover-upload"
                  :disabled="locked || saving || coverBusy"
                  @click="coverInput?.click()"
                >
                  <AppIcon name="plus" :size="14" />
                  上传封面
                </button>
                <div v-if="form.coverUrl" class="wb-cover-actions">
                  <button
                    type="button"
                    class="text-button"
                    :disabled="locked || saving || coverBusy"
                    @click="coverInput?.click()"
                  >
                    更换
                  </button>
                  <button
                    type="button"
                    class="text-button"
                    :disabled="locked || saving"
                    @click="form.coverUrl = ''"
                  >
                    移除
                  </button>
                </div>
              </div>
              <span v-if="coverBusy" class="wb-cover-busy">封面上传中…</span>
            </section>
            <section>
              <p class="wb-label">摘要</p>
              <div class="wb-card">
                <textarea
                  v-model="form.summary"
                  class="wb-summary"
                  rows="4"
                  maxlength="500"
                  placeholder="写一句摘要，会展示在文章列表与分享卡片…"
                  aria-label="文章摘要"
                  :disabled="locked || saving"
                ></textarea>
              </div>
            </section>
            <section>
              <p class="wb-label">关联活动</p>
              <div class="wb-card wb-activity">
                <span v-if="form.activityId" class="doc-chip">
                  {{
                    sources.find((a) => a.id === form.activityId)?.title ||
                    `活动 ${form.activityId}`
                  }}
                  <button
                    type="button"
                    class="doc-chip-clear"
                    aria-label="取消关联活动"
                    :disabled="locked || saving"
                    @click="form.activityId = ''"
                  >
                    <AppIcon name="close" :size="11" />
                  </button>
                </span>
                <select
                  v-else
                  v-model="form.activityId"
                  class="doc-chip-select is-block"
                  aria-label="关联活动"
                  :disabled="locked || saving"
                  @focus="!sources.length && loadSources()"
                >
                  <option value="">＋ 关联活动（选填）</option>
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
              </div>
            </section>
          </template>
        </aside>
        <section class="workbench-main">
          <div class="workbench-main-inner">
            <template v-if="layout === 'workbench'">
              <textarea
                ref="titleInput"
                v-model="form.title"
                class="wb-title"
                rows="1"
                maxlength="120"
                placeholder="输入标题…"
                aria-label="文章标题"
                :disabled="locked || saving"
                @input="autosize"
              ></textarea>
              <p v-if="!id" class="doc-body-empty">先保存草稿，再编辑正文。</p>
            </template>
            <div
              class="article-editor-host article-editor-host--workbench"
            ></div>
            <template v-if="layout === 'workbench'">
              <p class="doc-foot">支持 Markdown 与图片上传</p>
            </template>
          </div>
        </section>
      </div>
      <!-- 文档模式（Medium 式）：资料内嵌文档流，整页即文章 -->
      <div v-show="layout === 'canvas'" class="doc-canvas">
        <template v-if="layout === 'canvas'">
          <div class="doc-props">
            <div class="doc-prop">
              <span class="doc-prop-key">状态</span>
              <span class="doc-prop-value">
                <span
                  v-if="current"
                  class="status-pill inline"
                  :class="`tone-${articleStatusTone(current.status)}`"
                  >{{
                    current.status === "PUBLISHED"
                      ? "已发布 · 小程序可见"
                      : "草稿 · 未发布"
                  }}</span
                >
                <span v-else class="doc-prop-empty"
                  >新建文章，保存后可发布</span
                >
              </span>
            </div>
            <div class="doc-prop">
              <span class="doc-prop-key">关联活动</span>
              <span class="doc-prop-value">
                <span v-if="form.activityId" class="doc-chip">
                  {{
                    sources.find((a) => a.id === form.activityId)?.title ||
                    `活动 ${form.activityId}`
                  }}
                  <button
                    type="button"
                    class="doc-chip-clear"
                    aria-label="取消关联活动"
                    :disabled="locked || saving"
                    @click="form.activityId = ''"
                  >
                    <AppIcon name="close" :size="11" />
                  </button>
                </span>
                <select
                  v-else
                  v-model="form.activityId"
                  class="doc-chip-select"
                  aria-label="关联活动"
                  :disabled="locked || saving"
                  @focus="!sources.length && loadSources()"
                >
                  <option value="">＋ 关联活动（选填）</option>
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
              </span>
            </div>
          </div>
          <textarea
            ref="titleInput"
            v-model="form.title"
            class="doc-title"
            rows="1"
            maxlength="120"
            placeholder="输入标题…"
            aria-label="文章标题"
            :disabled="locked || saving"
            @input="autosize"
          ></textarea>
          <textarea
            v-model="form.summary"
            class="doc-summary"
            rows="1"
            maxlength="500"
            placeholder="写一句摘要，会展示在文章列表与分享卡片…"
            aria-label="文章摘要"
            :disabled="locked || saving"
            @input="autosize"
          ></textarea>
          <div class="doc-cover" :class="{ 'is-empty': !form.coverUrl }">
            <img
              v-if="form.coverUrl"
              :src="form.coverUrl"
              alt="文章封面"
              referrerpolicy="no-referrer"
            />
            <button
              type="button"
              class="doc-cover-swap"
              :class="{ 'is-empty': !form.coverUrl }"
              :disabled="locked || saving || coverBusy"
              @click="coverInput?.click()"
            >
              <AppIcon name="plus" :size="14" />
              {{ form.coverUrl ? "更换封面" : "上传封面（16:9 效果最佳）" }}
            </button>
            <button
              v-if="form.coverUrl"
              type="button"
              class="text-button doc-cover-clear"
              :disabled="locked || saving"
              @click="form.coverUrl = ''"
            >
              移除封面
            </button>
            <span v-if="coverBusy" class="doc-cover-busy">封面上传中…</span>
          </div>
          <p v-if="!id" class="doc-body-empty">先保存草稿，再编辑正文。</p>
        </template>
        <div class="article-editor-host article-editor-host--canvas"></div>
        <template v-if="layout === 'canvas'">
          <p class="doc-foot">支持 Markdown 与图片上传</p>
        </template>
      </div>
      <!-- 共享的封面上传入口：两种布局的「上传 / 更换」按钮都触发它 -->
      <input
        ref="coverInput"
        type="file"
        accept="image/png,image/jpeg"
        class="article-cover-input"
        aria-label="文章封面"
        :disabled="locked || saving || coverBusy"
        @change="pickCover"
      />
      <!-- 编辑器只实例化一次，随布局切换在两个挂载点间搬移。
           defer：目标挂载点由本组件渲染，需等整个应用渲染完成后再解析。 -->
      <Teleport
        defer
        :to="
          layout === 'workbench'
            ? '.article-editor-host--workbench'
            : '.article-editor-host--canvas'
        "
      >
        <MarkdownEditor
          v-if="id"
          ref="rich"
          :key="id"
          class="doc-body"
          managed-navigation
          :path="`/admin/articles/${id}/content`"
          :disabled="locked || saving"
          @saved="contentSaved"
        />
      </Teleport>
    </template>
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
  max-width: 1100px;
}
.article-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex-wrap: wrap;
  margin: -16px calc(var(--admin-inset) * -1) 0;
  padding: 10px var(--admin-inset);
  background: rgba(246, 247, 249, 0.94);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--admin-hairline);
}
.article-topbar-left,
.article-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.article-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--admin-muted);
  font-size: 13px;
}
.article-back:hover {
  color: var(--admin-ink);
}
.article-save-hint {
  font-size: 12px;
  color: var(--admin-muted);
}
.article-save-hint.is-dirty {
  color: var(--tone-warning);
}
.article-publish {
  background: var(--admin-tint);
  color: var(--rf-primary-text);
}
.doc-canvas {
  max-width: 720px;
  margin: 26px auto 0;
  padding-bottom: 60px;
}
.doc-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 22px;
}
.doc-prop {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  min-height: 28px;
}
.doc-prop-key {
  width: 64px;
  flex: none;
  color: var(--admin-muted);
}
.doc-prop-value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.doc-prop-empty {
  color: var(--admin-muted);
  font-size: 12.5px;
}
.doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--acc-content-soft);
  border: 1px solid var(--acc-content-border);
  color: var(--acc-content-strong);
  font-size: 12.5px;
  font-weight: 550;
  max-width: 320px;
}
.doc-chip-clear {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.55;
  padding: 2px;
  cursor: pointer;
}
.doc-chip-clear:hover {
  opacity: 1;
}
.doc-chip-select {
  height: 26px;
  border: 1px dashed var(--admin-line);
  border-radius: 999px;
  background: transparent;
  color: var(--admin-muted);
  font-size: 12.5px;
  padding: 0 10px;
  max-width: 320px;
  cursor: pointer;
}
.doc-title {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  font-family: inherit;
  font-size: 31px;
  line-height: 1.35;
  font-weight: 800;
  color: var(--admin-ink);
  letter-spacing: -0.015em;
  margin-bottom: 8px;
}
.doc-title::placeholder,
.doc-summary::placeholder {
  color: var(--rf-line);
}
.doc-summary {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.7;
  color: var(--admin-muted);
  margin-bottom: 18px;
}
.doc-cover {
  position: relative;
  margin-bottom: 18px;
}
.doc-cover img {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 340px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
}
.doc-cover-swap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--admin-body);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  padding: 6px 11px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.06);
}
.doc-cover-swap input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.doc-cover .doc-cover-swap {
  position: absolute;
  right: 12px;
  bottom: 12px;
}
.doc-cover.is-empty .doc-cover-swap {
  position: static;
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 26px 12px;
  border-style: dashed;
  border-radius: 12px;
  color: var(--admin-muted);
  background: var(--admin-paper);
  box-shadow: none;
}
.doc-cover.is-empty .doc-cover-swap:hover {
  color: var(--rf-primary-text);
  border-color: var(--admin-primary);
}
.doc-cover-clear {
  position: absolute;
  right: 12px;
  top: 12px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  padding: 4px 9px;
  font-size: 12px;
}
.doc-cover-busy {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--admin-muted);
}
.doc-body {
  margin-top: 4px;
}
.doc-body-empty {
  margin: 12px 0 0;
  padding: 28px 20px;
  text-align: center;
  color: var(--admin-muted);
  font-size: 13.5px;
  border: 1px dashed var(--admin-line);
  border-radius: 12px;
  background: var(--admin-paper);
}
.doc-foot {
  margin: 18px 0 0;
  font-size: 11.5px;
  color: var(--rf-line);
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-foot-sep {
  color: var(--admin-hairline);
}
/* ---------- 布局切换器 ---------- */
.layout-switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  background: var(--admin-surface);
  margin-left: 2px;
}
.layout-switch button {
  border: 0;
  background: transparent;
  color: var(--admin-muted);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  min-height: 0;
}
.layout-switch button[aria-pressed="true"] {
  background: var(--admin-tint);
  color: var(--rf-primary-text);
  font-weight: 650;
}
/* ---------- 工作台模式（Linear 式） ---------- */
.workbench {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  margin: 0 calc(var(--admin-inset) * -1) -28px;
  min-height: calc(100vh - 118px);
  background: var(--admin-surface);
  animation: workspace-enter 170ms ease-out;
}
.workbench-side {
  background: var(--admin-paper);
  border-right: 1px solid var(--admin-line);
  padding: 22px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.wb-label {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  color: var(--admin-muted);
  margin: 0 0 8px;
}
.wb-card {
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  padding: 8px;
}
.wb-cover img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 5px;
  display: block;
}
.wb-cover-upload {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 10px;
  border: 1px dashed var(--admin-line);
  border-radius: 6px;
  background: transparent;
  color: var(--admin-muted);
  font-size: 12.5px;
}
.wb-cover-upload:hover:not(:disabled) {
  color: var(--rf-primary-text);
  border-color: var(--admin-primary);
}
.wb-cover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 6px 4px 2px;
}
.wb-cover-busy {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--admin-muted);
}
.wb-summary {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: vertical;
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--admin-body);
  min-height: 68px;
  padding: 4px;
}
.wb-activity {
  padding: 10px;
}
.doc-chip-select.is-block {
  width: 100%;
  height: 28px;
}
.wb-title {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  background: transparent;
  font-family: inherit;
  font-size: 26px;
  line-height: 1.35;
  font-weight: 800;
  color: var(--admin-ink);
  letter-spacing: -0.01em;
  margin: 2px 0 18px;
}
.wb-title::placeholder {
  color: var(--rf-line);
}
.workbench-main {
  min-width: 0;
  padding: 30px 40px 40px;
}
.workbench-main-inner {
  max-width: 780px;
  margin: 0 auto;
}
/* 共享封面上传入口（视觉隐藏） */
.article-cover-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
@media (max-width: 720px) {
  .doc-canvas {
    margin-top: 18px;
  }
  .doc-title {
    font-size: 25px;
  }
  .article-topbar {
    margin-inline: calc(var(--admin-inset) * -1);
    padding-inline: var(--admin-inset);
  }
  .workbench {
    grid-template-columns: minmax(0, 1fr);
    margin-inline: calc(var(--admin-inset) * -1);
  }
  .workbench-side {
    border-right: 0;
    border-bottom: 1px solid var(--admin-line);
  }
  .workbench-main {
    padding: 20px 16px 32px;
  }
}
</style>
