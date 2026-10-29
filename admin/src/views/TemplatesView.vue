<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import type { Activity, ActivityInput, Page } from "../types";
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
  hasMore = ref(false),
  sourcePage = ref(0),
  sourceMore = ref(false);
const editor = ref(false),
  editing = ref<Template | null>(null),
  name = ref(""),
  sourceId = ref("");
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
async function load(more = false) {
  const n = ++epoch,
    actor = currentUser.value;
  if (!actor) return;
  loading.value = true;
  error.value = "";
  try {
    const p = more ? page.value + 1 : 0;
    const r = await request<Page<Template>>(
      `/admin/templates?page=${p}&size=20`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = more ? [...items.value, ...r.items] : r.items;
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
function close() {
  if (busy.value) return;
  editor.value = false;
  schedule.value = null;
  copying.value = false;
  error.value = "";
}
async function save() {
  if (busy.value) return;
  const source = sources.value.find((x) => x.id === sourceId.value);
  if (!name.value.trim() || !source) {
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
          sourceId: source.id,
          sourceVersion: source.version,
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
function openSchedule(t: Template | null) {
  if (busy.value) return;
  schedule.value = t;
  copying.value = !t;
  start.value = "";
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
  const date = new Date(start.value + "+08:00");
  const source = sources.value.find((x) => x.id === sourceId.value);
  if (
    !start.value ||
    !Number.isFinite(date.getTime()) ||
    date.getTime() <= Date.now() ||
    !Number.isInteger(count.value) ||
    count.value < 1 ||
    count.value > 12 ||
    !Number.isInteger(interval.value) ||
    interval.value < 1 ||
    interval.value > 365 ||
    (!schedule.value && !source)
  ) {
    error.value = "请检查来源活动、未来时间及生成数量";
    return;
  }
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
  <section class="page-heading">
    <h1>活动模板</h1>
    <div>
      <button class="secondary-button" @click="openSchedule(null)">
        复制活动
      </button>
      <button class="primary-button" @click="openEditor()">新建模板</button>
    </div>
  </section>
  <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  <p v-if="success" role="status">{{ success }}</p>
  <div v-if="loading" class="empty-state">正在加载…</div>
  <div v-else-if="!items.length" class="empty-state">暂无模板</div>
  <section v-for="t in items" :key="t.id" class="template-row">
    <div>
      <h3>{{ t.name }}</h3>
      <p>{{ t.activity.title }} · {{ t.activity.capacity }} 人</p>
    </div>
    <div>
      <button class="text-button" @click="openEditor(t)">更新模板</button
      ><button class="primary-button" @click="openSchedule(t)">生成草稿</button>
    </div>
  </section>
  <button
    v-if="hasMore"
    class="secondary-button"
    :disabled="loading"
    @click="load(true)"
  >
    加载更多
  </button>
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
      → 编辑</RouterLink
    >
  </div>
  <div
    v-if="editor || schedule || copying"
    class="modal-backdrop"
    @click.self="close"
  >
    <section
      class="template-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="editor ? '保存模板' : '生成活动草稿'"
    >
      <h2>{{ editor ? "保存模板" : copying ? "复制活动" : "生成草稿" }}</h2>
      <form @submit.prevent="editor ? save() : generate()">
        <label v-if="editor"
          >模板名称<input v-model="name" maxlength="120" :disabled="busy"
        /></label>
        <label v-if="editor || copying"
          >来源活动<select v-model="sourceId" :disabled="busy">
            <option value="">选择活动</option>
            <option v-for="a in sources" :key="a.id" :value="a.id">
              {{ a.title }} · {{ a.status }}
            </option>
          </select></label
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
          ><label
            >开始时间（北京时间）<input
              v-model="start"
              type="datetime-local"
              required
              :disabled="busy" /></label
          ><template v-if="schedule"
            ><label
              >生成场次<input
                v-model.number="count"
                type="number"
                min="1"
                max="12"
                :disabled="busy" /></label
            ><label
              >间隔天数<input
                v-model.number="interval"
                type="number"
                min="1"
                max="365"
                :disabled="busy" /></label
          ></template>
          <p class="muted">
            仅生成草稿，时长和报名提前量沿用来源活动。
          </p></template
        >
        <p v-if="error" class="error-box" role="alert">{{ error }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="close"
          >
            取消</button
          ><button class="primary-button" :disabled="busy">
            {{ busy ? "处理中…" : editor ? "保存" : "生成草稿" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
<style scoped>
.template-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 24px;
  margin-bottom: 16px;
  border-radius: 16px;
  gap: 20px;
}
.template-row h3 {
  margin: 0;
}
.template-row p {
  margin-bottom: 0;
  color: #697363;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: #10221880;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.template-modal {
  background: #fafaf6;
  border-radius: 20px;
  padding: 28px;
  width: min(100%, 540px);
  max-height: 90vh;
  overflow: auto;
}
.template-modal label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}
.template-modal input,
.template-modal select {
  padding: 12px;
  width: 100%;
  border: 1px solid #d5dacd;
  border-radius: 8px;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
.generated {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}
@media (max-width: 640px) {
  .template-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
