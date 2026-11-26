<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { displayDate } from "../forms";
import { askConfirm } from "../confirm";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { request, currentUser, ApiError } from "../api";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FormModal from "../components/FormModal.vue";
import UiState from "../components/UiState.vue";
type Kind = "PRIVACY" | "TERMS";
type Document = {
  kind: Kind;
  version: number;
  title: string;
  content: string;
  contact?: string;
  publishedAt: string;
};
type State = {
  kind: Kind;
  draft: { title: string; content: string; contact?: string; revision: number };
  published: Document | null;
};
const kind = ref<Kind>("PRIVACY"),
  state = ref<State | null>(null),
  title = ref(""),
  content = ref(""),
  contact = ref("");
const history = ref<Document[]>([]),
  selected = ref<Document | null>(null),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  conflict = ref(false),
  preview = ref(false),
  focusMode = ref(false),
  confirmPublish = ref(false);
let epoch = 0;
const label = computed(() =>
  kind.value === "PRIVACY" ? "隐私政策" : "用户协议",
);
const dirty = computed(
  () =>
    !!state.value &&
    (title.value !== state.value.draft.title ||
      content.value !== state.value.draft.content ||
      contact.value !== (state.value.draft.contact ?? "")),
);
const valid = computed(
  () =>
    title.value.trim().length > 0 &&
    title.value.trim().length <= 120 &&
    content.value.trim().length >= 10 &&
    content.value.trim().length <= 50000 &&
    !/<\s*\/?\s*[a-z][^>]*>/i.test(content.value) &&
    contact.value.length <= 500 &&
    !/<\s*\/?\s*[a-z][^>]*>/i.test(contact.value),
);
function active(n: number, user: typeof currentUser.value) {
  return n === epoch && !!user && user === currentUser.value;
}
function clear() {
  epoch++;
  state.value = null;
  title.value = "";
  content.value = "";
  contact.value = "";
  history.value = [];
  selected.value = null;
  preview.value = false;
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
    contact.value = next.draft.contact ?? "";
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
      "标题须为 1–120 字，正文须为 10–50000 字，联系方式最多 500 字。仅支持纯文本。";
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
        contact: contact.value.trim(),
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
useForegroundRefresh(() => {
  if (
    !dirty.value &&
    !busy.value &&
    !loading.value &&
    !preview.value &&
    !selected.value &&
    !confirmPublish.value
  )
    void load();
});
</script>
<template>
  <main class="workspace legal-workspace">
    <header class="page-heading legal-head">
      <h1>协议管理</h1>
      <nav class="task-tabs" aria-label="协议类型">
        <button
          type="button"
          :class="kind === 'PRIVACY' ? 'primary' : 'secondary'"
          :aria-pressed="kind === 'PRIVACY'"
          :disabled="busy || loading"
          @click="changeKind('PRIVACY')"
        >
          隐私政策
        </button>
        <button
          type="button"
          :class="kind === 'TERMS' ? 'primary' : 'secondary'"
          :aria-pressed="kind === 'TERMS'"
          :disabled="busy || loading"
          @click="changeKind('TERMS')"
        >
          用户协议
        </button>
      </nav>
    </header>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <UiState v-if="loading && !state" kind="loading" compact
      >正在读取协议…</UiState
    >
    <div v-if="state" class="legal-layout" :class="{ 'is-focused': focusMode }">
      <form
        class="legal-editor"
        aria-label="编辑协议草稿"
        @submit.prevent="save"
      >
        <label class="legal-field">
          协议标题
          <input
            v-model="title"
            maxlength="120"
            :disabled="busy || loading"
            placeholder="协议标题"
          />
        </label>
        <label class="legal-field">
          协议正文（纯文本）
          <textarea
            v-model="content"
            maxlength="50000"
            :disabled="busy || loading"
            placeholder="经审核的协议正文"
          />
        </label>
        <label class="legal-field legal-contact-field">
          联系方式（选填）
          <textarea
            v-model="contact"
            rows="2"
            maxlength="500"
            :disabled="busy || loading"
            placeholder="填写对外公开的客服电话、邮箱或其他联系方式"
          />
        </label>
        <footer class="legal-footer">
          <p class="footer-status">
            <span aria-live="polite">{{
              dirty ? "有未保存修改" : notice || "草稿已保存"
            }}</span>
            <span>{{ content.length }} / 50000</span>
          </p>
          <div class="legal-actions footer-actions">
            <button
              type="button"
              class="secondary focus-toggle"
              :aria-pressed="focusMode"
              @click="focusMode = !focusMode"
            >
              {{ focusMode ? "退出专注" : "专注编辑" }}
            </button>
            <button type="button" class="secondary" @click="preview = true">
              预览草稿
            </button>
            <button
              type="submit"
              class="primary"
              :disabled="busy || loading || conflict || !dirty"
            >
              保存草稿
            </button>
            <button
              v-if="conflict"
              type="button"
              class="secondary"
              :disabled="busy || loading"
              @click="reload"
            >
              采用最新草稿
            </button>
          </div>
        </footer>
      </form>
      <aside v-show="!focusMode" class="legal-sidebar" aria-label="版本与发布">
        <section>
          <h2>版本与发布</h2>
          <p class="legal-version">
            {{
              state.published
                ? `当前发布 v${state.published.version}`
                : "尚未发布"
            }}
          </p>
          <p class="muted">草稿修订 {{ state.draft.revision }}</p>
          <button
            class="secondary"
            type="button"
            :disabled="busy || loading || dirty || conflict || !valid"
            @click="openPublish"
          >
            发布新版本
          </button>
          <p v-if="conflict" class="legal-help">请先处理版本冲突。</p>
          <p v-else-if="dirty" class="legal-help">保存草稿后可发布。</p>
          <p v-else-if="!valid" class="legal-help">请填写标题与纯文本正文。</p>
          <p v-else-if="kind === 'PRIVACY'" class="legal-help">
            发布前请审核内容，并配置微信隐私声明。
          </p>
        </section>
        <section class="legal-history">
          <h2>已发布历史</h2>
          <p v-if="!history.length" class="muted">暂无发布记录</p>
          <ul v-else class="legal-versions">
            <li v-for="version in history" :key="version.version">
              <button
                type="button"
                class="text-button"
                @click="selected = version"
              >
                v{{ version.version }} · {{ version.title }}
              </button>
            </li>
          </ul>
        </section>
      </aside>
    </div>
    <button v-else-if="!loading" class="secondary" type="button" @click="load">
      重试
    </button>
    <FormModal
      v-if="preview || selected"
      size="lg"
      @close="
        preview = false;
        selected = null;
      "
    >
      <template #title>
        <h2>
          {{
            selected ? `v${selected.version} · ${selected.title}` : "草稿预览"
          }}
        </h2>
      </template>
      <article class="legal-preview">
        <p v-if="selected" class="muted">
          {{ displayDate(selected.publishedAt) }} · 只读历史
        </p>
        <h3 v-else>{{ title || "未填写标题" }}</h3>
        <p class="legal-preview-text">
          {{ selected ? selected.content : content || "未填写正文" }}
        </p>
        <section
          v-if="selected ? selected.contact : contact.trim()"
          class="legal-contact-preview"
        >
          <h3>联系方式</h3>
          <p class="legal-preview-text">
            {{ selected ? selected.contact : contact.trim() }}
          </p>
        </section>
      </article>
    </FormModal>
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
.legal-workspace {
  padding-block-end: max(32px, env(safe-area-inset-bottom));
}
.legal-head {
  justify-content: flex-start;
  gap: 8px 24px;
  margin-bottom: 16px;
}
.legal-head .task-tabs {
  margin: 0;
}
.legal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 15rem;
  align-items: start;
  gap: 24px;
}
.legal-layout.is-focused {
  grid-template-columns: minmax(0, 1fr);
}
.legal-editor {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.legal-field {
  display: grid;
  gap: 4px;
  margin: 0;
  font-weight: 600;
}
.legal-field input,
.legal-field textarea {
  margin: 0;
}
.legal-field textarea {
  min-height: max(22rem, calc(100dvh - 246px));
  padding: 14px 16px;
  resize: vertical;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.8;
}
.legal-footer {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  justify-content: flex-end;
  padding: 12px 14px;
  border: 1px solid var(--rf-line);
  border-radius: 14px;
  background: #ffffffed;
  box-shadow: 0 14px 36px #183c2914;
  backdrop-filter: blur(14px);
}
.legal-footer p {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-block: 0;
  color: var(--rf-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.focus-toggle[aria-pressed="true"] {
  --button-border: var(--rf-primary);
}
.legal-sidebar {
  display: grid;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-bg);
}
.legal-sidebar h2 {
  margin: 0 0 8px;
  font-size: 14px;
}
.legal-sidebar p {
  margin: 0 0 8px;
}
.legal-version {
  font-weight: 600;
}
.legal-sidebar .legal-help {
  margin: 8px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.5;
}
.legal-history {
  padding-top: 14px;
  border-top: 1px solid var(--rf-line);
}
.legal-versions {
  margin: 0;
  padding: 0;
  list-style: none;
}
.legal-versions button {
  max-width: 100%;
  padding: 4px 0;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.legal-preview {
  overflow-wrap: anywhere;
}
.legal-preview-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.8;
}
@media (min-width: 1200px) {
  .legal-workspace {
    display: flex;
    flex-direction: column;
    min-block-size: 100dvh;
  }
  .legal-layout {
    flex: 1;
    align-items: stretch;
  }
  .legal-editor {
    grid-template-rows: auto 1fr auto auto;
  }
  .legal-field {
    grid-template-rows: auto 1fr;
  }
  .legal-field textarea {
    min-height: 22rem;
  }
  .legal-sidebar {
    align-self: start;
    max-block-size: max(18rem, calc(100dvh - 120px));
    overflow-y: auto;
  }
}
@media (max-width: 1199px) {
  .legal-field textarea {
    min-height: max(22rem, calc(100dvh - 360px));
  }
}
.legal-contact-field textarea {
  min-height: 5rem;
}
.legal-contact-preview {
  margin-top: 20px;
}
.legal-contact-preview h3 {
  margin-bottom: 4px;
}
@media (max-width: 760px) {
  .legal-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .legal-footer {
    bottom: 8px;
    padding: 10px;
  }
  .legal-footer .footer-status {
    flex-basis: 100%;
  }
  .legal-footer .footer-actions {
    width: 100%;
  }
  .legal-footer .footer-actions button {
    flex: 1 1 calc(50% - 8px);
  }
}
</style>
