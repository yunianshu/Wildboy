<script setup lang="ts">
import PaginationBar from "../components/PaginationBar.vue";
import { askConfirm } from "../confirm";
import DateTimeField from "../components/DateTimeField.vue";
import { statuses } from "../types";
import { ref, onMounted, onUnmounted, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import type { Activity, ActivityInput, Page } from "../types";
import FormModal from "../components/FormModal.vue";
import UiState from "../components/UiState.vue";
type Template = {
  id: string;
  name: string;
  activity: ActivityInput;
  version: number;
};
const items = ref<Template[]>([]),
  sources = ref<Activity[]>([]),
  error = ref(""),
  success = ref(""),
  busy = ref(false),
  loading = ref(false),
  page = ref(0),
  pageTotal = ref<number>(),
  hasMore = ref(false),
  sourcePage = ref(0),
  sourceMore = ref(false);
const editor = ref(false),
  editing = ref<Template | null>(null),
  name = ref(""),
  sourceId = ref("");
const scheduleErrors = ref<{ date?: string; source?: string; count?: string; interval?: string }>({});
const schedule = ref<Template | null>(null),
  copying = ref(false),
  start = ref(""),
  count = ref(1),
  interval = ref(7),
  generated = ref<Activity[]>([]);
let epoch = 0,
  copyRequest = "";
function clear() {
  epoch++;
  items.value = [];
  sources.value = [];
  editor.value = false;
  schedule.value = null;
  copying.value = false;
  busy.value = false;
  loading.value = false;
  generated.value = [];
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    clear();
    if (u) void load();
  }
});
onUnmounted(clear);
async function load(p = 0) {
  const n = ++epoch,
    actor = currentUser.value;
  if (!actor) return;
  loading.value = true;
  error.value = "";
  try {
    const r = await request<Page<Template>>(
      `/admin/templates?page=${p}&size=20`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = r.items;
    pageTotal.value = r.total;
    page.value = p;
    hasMore.value = r.hasMore;
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
async function loadSources(more = false) {
  const n = epoch,
    actor = currentUser.value;
  try {
    const p = more ? sourcePage.value + 1 : 0;
    const r = await request<Page<Activity>>(
      `/admin/activities?page=${p}&size=50`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    sources.value = more ? [...sources.value, ...r.items] : r.items;
    sourcePage.value = p;
    sourceMore.value = r.hasMore;
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  }
}
function openEditor(t: Template | null = null) {
  if (busy.value) return;
  editing.value = t;
  name.value = t?.name || "";
  sourceId.value = "";
  editor.value = true;
  error.value = "";
  void loadSources();
}
async function close() {
  if (busy.value) return;
  const dirty = editor.value ? name.value !== (editing.value?.name || "") || !!sourceId.value
    : !!start.value || (copying.value && !!sourceId.value) || count.value !== 1 || interval.value !== 7;
  if (dirty && !(await askConfirm("模板操作尚未保存，确定放弃吗？"))) return;
  editor.value = false;
  schedule.value = null;
  copying.value = false;
  error.value = "";
}
async function save() {
  if (busy.value) return;
  const source = sources.value.find((x) => x.id === sourceId.value);
  if (!name.value.trim() || (!source && (!editing.value || sourceId.value))) {
    error.value = "请选择来源活动并填写模板名称";
    return;
  }
  const actor = currentUser.value,
    n = epoch;
  busy.value = true;
  error.value = "";
  try {
    await request(
      `/admin/templates${editing.value ? "/" + editing.value.id : ""}`,
      {
        method: editing.value ? "PUT" : "POST",
        body: JSON.stringify({
          name: name.value.trim(),
          sourceId: source?.id,
          sourceVersion: source?.version,
          version: editing.value?.version,
        }),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    editor.value = false;
    success.value = "模板已保存";
    await load();
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function removeTemplate(template: Template) {
  const actor = currentUser.value, n = epoch;
  if (!actor || loading.value || busy.value || !(await askConfirm({
    title: "删除活动模板？",
    description: "已生成的活动草稿会保留。",
    confirmLabel: "删除模板",
    danger: true,
  })) || actor !== currentUser.value || n !== epoch) return;
  busy.value = true;
  error.value = "";
  try {
    await request("/admin/templates/" + encodeURIComponent(template.id) + "?version=" + template.version, { method: "DELETE" });
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = items.value.filter((item) => item.id !== template.id);
    success.value = "模板已删除";
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function openSchedule(t: Template | null) {
  if (busy.value) return;
  schedule.value = t;
  copying.value = !t;
  start.value = "";
  scheduleErrors.value = {};
  count.value = 1;
  interval.value = 7;
  generated.value = [];
  error.value = "";
  copyRequest =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (!t) {
    sourceId.value = "";
    void loadSources();
  }
}
async function generate() {
  if (busy.value) return;
  scheduleErrors.value = {};
  error.value = "";
  const date = new Date(start.value + "+08:00");
  const source = sources.value.find((x) => x.id === sourceId.value);
  const invalid = scheduleErrors.value;
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
    invalid.date = "请选择未来的开始时间";
  if (!schedule.value && !source) invalid.source = "请选择来源活动";
  if (schedule.value) {
    if (!Number.isInteger(count.value) || count.value < 1 || count.value > 12)
      invalid.count = "请输入 1–12 的整数";
    if (!Number.isInteger(interval.value) || interval.value < 1 || interval.value > 365)
      invalid.interval = "请输入 1–365 的整数";
  }
  if (Object.keys(invalid).length) return;
  const starts = Array.from(
    { length: schedule.value ? count.value : 1 },
    (_, i) => new Date(+date + i * interval.value * 86400000).toISOString(),
  );
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const r = schedule.value
      ? await request<Activity[]>(
          `/admin/templates/${schedule.value.id}/generate`,
          {
            method: "POST",
            body: JSON.stringify({ starts, version: schedule.value.version }),
          },
        )
      : [
          await request<Activity>(`/admin/activities/${source!.id}/copy`, {
            method: "POST",
            body: JSON.stringify({
              startAt: starts[0],
              requestId: copyRequest,
              version: source!.version,
            }),
          }),
        ];
    if (n !== epoch || actor !== currentUser.value) return;
    generated.value = r;
    schedule.value = null;
    copying.value = false;
    success.value = `已生成 ${r.length} 场草稿，请检查后发布`;
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <h1>活动模板</h1>
      <div class="template-actions">
        <button class="secondary" :disabled="busy || loading" @click="load()">刷新</button>
        <button class="secondary" @click="openSchedule(null)">复制活动</button>
        <button class="primary" @click="openEditor()">新建模板</button>
      </div>
    </section>
    <p
      v-if="error && !(editor || schedule || copying)"
      class="error-box"
      role="alert"
    >
      {{ error }} <button class="text-button" :disabled="busy || loading" @click="load()">重试</button>
    </p>
    <p v-if="success" class="success-box" role="status">{{ success }}</p>
    <div v-if="generated.length" class="generated">
      <RouterLink
        v-for="a in generated"
        :key="a.id"
        :to="`/activities/${a.id}/edit`"
        >{{ a.title }} ·
        {{
          new Date(a.startAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })
        }}
        · 编辑</RouterLink
      >
    </div>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在加载模板…</UiState
    >
    <UiState
      v-else-if="!items.length && !error && !loading"
      kind="empty"
      compact
      >暂无模板</UiState
    >
    <section v-for="t in items" :key="t.id" class="template-row">
      <div class="template-summary">
        <h3>{{ t.name }}</h3>
        <p>
          {{ t.activity.title }} · {{ t.activity.capacity }} 人 ·
          {{
            t.activity.priceCents > 0
              ? `¥${(t.activity.priceCents / 100).toFixed(2)} / 人`
              : "免费报名"
          }}
        </p>
      </div>
      <div class="template-actions">
        <button class="text-button" @click="removeTemplate(t)">删除模板</button>
        <button class="text-button" @click="openEditor(t)">更新模板</button
        ><button class="primary" @click="openSchedule(t)">生成草稿</button>
      </div>
    </section>
    <PaginationBar v-if="pageTotal != null || hasMore || page > 0" :page="page" :page-size="20" :total="pageTotal" :has-more="hasMore" :busy="loading" label="模板分页" @change="load" />
    <FormModal :busy="busy" v-if="editor || schedule || copying" @close="close"
      ><template #title
        ><h2 class="modal-heading">
          {{ editor ? "保存模板" : copying ? "复制活动" : "生成草稿" }}
        </h2></template
      >

      <form @submit.prevent="editor ? save() : generate()">
        <label v-if="editor"
          >模板名称<input v-model="name" maxlength="120" :disabled="busy"
        /></label>
        <label v-if="editor || copying"
          >来源活动<select v-model="sourceId" :disabled="busy">
            <option value="">{{ editing ? "保留原活动内容" : "选择活动" }}</option>
            <option v-for="a in sources" :key="a.id" :value="a.id">
              {{ a.title }} · {{ statuses[a.status] }}
            </option>
          </select><small v-if="copying && scheduleErrors.source" class="field-error" role="alert">{{ scheduleErrors.source }}</small></label
        >
        <button
          v-if="(editor || copying) && sourceMore"
          type="button"
          class="text-button"
          @click="loadSources(true)"
        >
          更多来源活动
        </button>
        <template v-if="!editor"
          ><fieldset :disabled="busy">
            <DateTimeField id="template-start" v-model="start" label="开始时间（北京时间）" :error="scheduleErrors.date" required />
          </fieldset><template v-if="schedule"
            ><label
              >生成场次<input
                v-model.number="count"
                type="number"
                min="1"
                max="12"
                :disabled="busy" /><small v-if="scheduleErrors.count" class="field-error" role="alert">{{ scheduleErrors.count }}</small></label
            ><label
              >间隔天数<input
                v-model.number="interval"
                type="number"
                min="1"
                max="365"
                :disabled="busy" /><small v-if="scheduleErrors.interval" class="field-error" role="alert">{{ scheduleErrors.interval }}</small></label
          ></template>
          <p class="muted">
            仅生成草稿，时长和报名提前量沿用来源活动。
          </p></template
        >
        <p v-if="error" class="error-box" role="alert">{{ error }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="close"
          >
            取消</button
          ><button class="primary" :disabled="busy">
            {{ busy ? "处理中…" : editor ? "保存" : "生成草稿" }}
          </button>
        </div>
      </form>
    </FormModal>
  </main>
</template>
<style scoped>
.template-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--admin-surface);
  padding: 10px 14px;
  margin-bottom: 8px;
  border: 1px solid var(--admin-line);
  border-radius: var(--admin-radius);
  gap: 12px;
  overflow-wrap: anywhere;
}
.template-summary {
  min-width: 0;
  flex: 1;
}
.template-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.template-row h3 {
  margin: 0;
}
.template-row p {
  margin: 3px 0 0;
  color: var(--admin-muted);
}
.modal-heading {
  padding-right: 36px;
}
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 14px;
}
.generated {
  display: grid;
  gap: 12px;
  margin-top: 24px;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .template-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
