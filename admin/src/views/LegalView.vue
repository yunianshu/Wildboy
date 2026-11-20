<script setup lang="ts">
import { displayDate } from "../forms";
import { askConfirm } from "../confirm";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { request, currentUser, ApiError } from "../api";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import UiState from "../components/UiState.vue";
type Kind = "PRIVACY" | "TERMS";
type Document = {
  kind: Kind;
  version: number;
  title: string;
  content: string;
  publishedAt: string;
};
type State = {
  kind: Kind;
  draft: { title: string; content: string; revision: number };
  published: Document | null;
};
const kind = ref<Kind>("PRIVACY"),
  state = ref<State | null>(null),
  title = ref(""),
  content = ref("");
const history = ref<Document[]>([]),
  selected = ref<Document | null>(null),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  conflict = ref(false),
  preview = ref(false),
  confirmPublish = ref(false);
let epoch = 0;
const label = computed(() =>
  kind.value === "PRIVACY" ? "隐私政策" : "用户协议",
);
const dirty = computed(
  () =>
    !!state.value &&
    (title.value !== state.value.draft.title ||
      content.value !== state.value.draft.content),
);
const valid = computed(
  () =>
    title.value.trim().length > 0 &&
    title.value.trim().length <= 120 &&
    content.value.trim().length >= 10 &&
    content.value.trim().length <= 50000 &&
    !/<\/?[a-z][^>]*>/i.test(content.value),
);
function active(n: number, user: typeof currentUser.value) {
  return n === epoch && !!user && user === currentUser.value;
}
function clear() {
  epoch++;
  state.value = null;
  title.value = "";
  content.value = "";
  history.value = [];
  selected.value = null;
  confirmPublish.value = false;
  loading.value = false;
  busy.value = false;
}
watch(currentUser, () => {
  clear();
});
function failure(e: unknown) {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
    clear();
    error.value = "管理身份已失效，请重新登录。";
    return;
  }
  conflict.value = e instanceof ApiError && e.status === 409;
  error.value = conflict.value
    ? "版本已更新。当前输入已保留，请复制需要的内容，再重新加载；不会自动覆盖。"
    : e instanceof Error
      ? e.message
      : "请求失败，请重试";
}
async function load() {
  const n = ++epoch,
    user = currentUser.value;
  loading.value = true;
  error.value = "";
  notice.value = "";
  confirmPublish.value = false;
  try {
    const [next, versions] = await Promise.all([
      request<State>(`/admin/legal/${kind.value}`),
      request<Document[]>(`/admin/legal/${kind.value}/versions`),
    ]);
    if (!active(n, user)) return;
    state.value = next;
    title.value = next.draft.title;
    content.value = next.draft.content;
    history.value = versions;
    selected.value = null;
    conflict.value = false;
  } catch (e) {
    if (active(n, user)) failure(e);
  } finally {
    if (n === epoch) {
      loading.value = false;
      busy.value = false;
    }
  }
}
async function reload() {
  if (
    (dirty.value || conflict.value) &&
    !(await askConfirm("重新加载会丢弃当前未保存输入，是否继续？"))
  )
    return;
  await load();
}
async function changeKind(value: Kind) {
  if (value === kind.value || busy.value || loading.value) return;
  if (dirty.value && !(await askConfirm("当前修改未保存，确定切换协议？")))
    return;
  clear();
  kind.value = value;
  preview.value = false;
  await load();
}
async function save() {
  if (busy.value || loading.value || !state.value || conflict.value) return;
  if (!valid.value) {
    error.value =
      "标题须为 1–120 字，正文须为 10–50000 字纯文本，不支持 HTML。";
    return;
  }
  const n = epoch,
    user = currentUser.value,
    revision = state.value.draft.revision;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await request(`/admin/legal/${kind.value}/draft`, {
      method: "PUT",
      body: JSON.stringify({
        title: title.value.trim(),
        content: content.value.trim(),
        revision,
      }),
    });
    if (!active(n, user)) return;
    await load();
    if (user === currentUser.value)
      notice.value = "草稿已保存，线上协议尚未改变。";
  } catch (e) {
    if (active(n, user)) failure(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function openPublish() {
  if (
    !busy.value &&
    state.value &&
    !dirty.value &&
    !conflict.value &&
    valid.value
  )
    confirmPublish.value = true;
}
async function publish() {
  if (
    busy.value ||
    !state.value ||
    dirty.value ||
    conflict.value ||
    !confirmPublish.value
  )
    return;
  const n = epoch,
    user = currentUser.value,
    revision = state.value.draft.revision;
  busy.value = true;
  error.value = "";
  try {
    await request(`/admin/legal/${kind.value}/publish`, {
      method: "POST",
      body: JSON.stringify({ revision }),
    });
    if (!active(n, user)) return;
    confirmPublish.value = false;
    await load();
    if (user === currentUser.value)
      notice.value = "已发布新版本。用户下次使用相关服务时需重新确认。";
  } catch (e) {
    if (active(n, user)) {
      confirmPublish.value = false;
      failure(e);
    }
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onBeforeRouteLeave(
  async (to) =>
    to.path === "/login" ||
    !dirty.value ||
    (await askConfirm("协议修改尚未保存，确定离开？")),
);
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  epoch++;
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<template>
  <main class="workspace legal-workspace">
    <section class="page-heading">
      <div>
        <h1>协议管理</h1>
        <p v-if="conflict">草稿版本有变更，请重新加载。</p>
        <p v-else-if="dirty">请先保存草稿，再发布。</p>
        <p v-else-if="state && !valid">请填写标题与有效的纯文本正文。</p>
      </div>
      <button
        v-if="state"
        class="primary"
        type="button"
        :disabled="busy || loading || dirty || conflict || !valid"
        @click="openPublish"
      >
        发布新版本
      </button>
    </section>
    <nav class="task-tabs" aria-label="协议类型">
      <button
        :class="kind === 'PRIVACY' ? 'primary' : 'secondary'"
        :aria-pressed="kind === 'PRIVACY'"
        :disabled="busy || loading"
        @click="changeKind('PRIVACY')"
      >
        隐私政策</button
      ><button
        :class="kind === 'TERMS' ? 'primary' : 'secondary'"
        :aria-pressed="kind === 'TERMS'"
        :disabled="busy || loading"
        @click="changeKind('TERMS')"
      >
        用户协议
      </button>
    </nav>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <UiState v-if="loading" kind="loading" compact>正在读取协议…</UiState>
    <section v-if="state" class="legal-editor">
      <div class="legal-toolbar">
        <h2>{{ label }}</h2>
        <span
          >{{
            state.published
              ? `当前发布 v${state.published.version}`
              : "尚未发布"
          }}
          · 草稿修订 {{ state.draft.revision }}</span
        >
      </div>
      <p class="legal-help">发布前须由运营方审核，并另行配置微信隐私声明。</p>
      <form @submit.prevent="save">
        <label
          >协议标题<input
            v-model="title"
            maxlength="120"
            :disabled="busy || loading"
            placeholder="协议标题"
        /></label>
        <label
          >协议正文（纯文本）<textarea
            v-model="content"
            maxlength="50000"
            rows="10"
            :disabled="busy || loading"
            placeholder="经审核的协议正文"
          />
        </label>
        <p class="muted">
          {{ content.length }} / 50000 ·
          {{ dirty ? "有未保存修改" : "草稿已保存" }}
        </p>
        <div class="legal-actions">
          <button
            class="secondary"
            type="submit"
            :disabled="busy || loading || conflict || !dirty"
          >
            保存草稿</button
          ><button class="secondary" type="button" @click="preview = !preview">
            {{ preview ? "收起预览" : "预览草稿" }}</button
          ><button
            class="secondary"
            type="button"
            :disabled="busy || loading"
            @click="reload"
          >
            重新加载
          </button>
        </div>
      </form>
      <section v-if="preview" class="legal-preview">
        <h3>{{ title || "未填写标题" }}</h3>
        <p>{{ content || "未填写正文" }}</p>
      </section>
    </section>
    <button v-else-if="!loading" class="secondary" @click="load">
      重新加载
    </button>
    <section class="legal-history">
      <h2>已发布历史</h2>
      <UiState v-if="!history.length && !loading && !error" compact
        >暂无发布记录</UiState
      >
      <div class="legal-versions">
        <button
          v-for="version in history"
          :key="version.version"
          :class="selected?.version === version.version ? 'primary' : 'secondary'"
          :aria-pressed="selected?.version === version.version"
          @click="selected = selected?.version === version.version ? null : version"
        >
          v{{ version.version }} · {{ version.title }}
        </button>
      </div>
      <article v-if="selected" class="legal-preview">
        <h3>{{ selected.title }} · v{{ selected.version }}</h3>
        <p class="muted">{{ displayDate(selected.publishedAt) }} · 只读历史</p>
        <p>{{ selected.content }}</p>
      </article>
    </section>
    <ConfirmDialog
      v-if="confirmPublish"
      title="确认发布协议新版本？"
      description="发布后将立即成为当前版本，用户需重新确认。旧版本与历史同意记录不会被覆盖。请确认内容已由运营方审核。"
      confirm-label="确认发布"
      :busy="busy"
      @cancel="!busy && (confirmPublish = false)"
      @confirm="publish"
    />
  </main>
</template>
<style scoped>
.legal-actions,
.legal-versions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0 0;
}
.legal-editor,
.legal-history {
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: var(--admin-radius);
  padding: 16px;
  margin: 12px 0;
}
.legal-editor h2,
.legal-history h2 {
  font-size: 16px;
  margin: 0;
}
.legal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.legal-versions button {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}
.legal-help {
  color: var(--admin-muted);
  font-size: 12px;
}
.legal-editor label {
  display: block;
  margin: 12px 0;
  font-weight: 600;
}
.legal-editor input,
.legal-editor textarea {
  display: block;
  width: 100%;
}
.legal-editor textarea {
  line-height: 1.8;
  resize: vertical;
}
.legal-preview {
  border-top: 1px solid var(--rf-line);
  padding: 20px 0;
  overflow-wrap: anywhere;
}
.legal-preview p {
  white-space: pre-wrap;
  line-height: 1.9;
}
.legal-alert {
  background: var(--rf-bg);
  color: var(--rf-danger);
  padding: 16px;
  border-radius: 8px;
}
.legal-toolbar span {
  color: var(--admin-muted);
  font-size: 12px;
}
@media (max-width: 600px) {
  .legal-editor,
  .legal-history {
    padding: 16px;
  }
  .legal-actions button {
    flex: 1 1 45%;
  }
}
</style>
