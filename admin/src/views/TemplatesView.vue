<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import PaginationBar from "../components/PaginationBar.vue";
import { askConfirm } from "../confirm";
import DateTimeField from "../components/DateTimeField.vue";
import { categories, statuses } from "../types";
import { ref, onMounted, onUnmounted, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import type { Activity, ActivityInput, Page } from "../types";
import FormModal from "../components/FormModal.vue";
import UiState from "../components/UiState.vue";
import AppIcon from "../components/AppIcon.vue";
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
const preview = ref<Template | null>(null);
const editor = ref(false),
  editing = ref<Template | null>(null),
  name = ref(""),
  sourceId = ref("");
const content = ref<ActivityInput | null>(null);
const replaceFromSource = ref(false);
const priceYuan = ref<number | string>(0);
const galleryText = ref("");
const durationMinutes = ref<number | string>(0);
const deadlineLeadMinutes = ref<number | string>(0);
const minutesBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60000);
function timing(a: ActivityInput) {
  return {
    duration: Math.max(1, minutesBetween(a.startAt, a.endAt)),
    lead: Math.max(0, minutesBetween(a.registrationDeadline, a.startAt)),
  };
}
const scheduleErrors = ref<{
  date?: string;
  source?: string;
  count?: string;
  interval?: string;
}>({});
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
  preview.value = null;
  editor.value = false;
  editing.value = null;
  content.value = null;
  replaceFromSource.value = false;
  name.value = "";
  sourceId.value = "";
  galleryText.value = "";
  priceYuan.value = 0;
  durationMinutes.value = 0;
  deadlineLeadMinutes.value = 0;
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
function templatePrice(cents: number) {
  return cents > 0 ? `¥${(cents / 100).toFixed(2)} / 人` : "免费报名";
}
function duration(from: string, to: string) {
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "未设置";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return (
    (hours ? `${hours} 小时` : "") + (rest || !hours ? ` ${rest} 分钟` : "")
  );
}
function openEditor(t: Template | null = null) {
  if (busy.value) return;
  editing.value = t;
  name.value = t?.name || "";
  sourceId.value = "";
  content.value = t ? { ...t.activity } : null;
  replaceFromSource.value = false;
  priceYuan.value = (t?.activity.priceCents || 0) / 100;
  galleryText.value = (t?.activity.galleryUrls || []).join("\n");
  durationMinutes.value = t ? timing(t.activity).duration : 0;
  deadlineLeadMinutes.value = t ? timing(t.activity).lead : 0;
  editor.value = true;
  error.value = "";
  success.value = "";
  if (!t) void loadSources();
}
function toggleSource() {
  replaceFromSource.value = !replaceFromSource.value;
  sourceId.value = "";
  error.value = "";
  if (replaceFromSource.value) void loadSources();
}
function contentChanged() {
  const a = editing.value?.activity;
  if (!a || !content.value) return false;
  return (
    JSON.stringify(a) !== JSON.stringify(content.value) ||
    priceYuan.value !== a.priceCents / 100 ||
    galleryText.value !== (a.galleryUrls || []).join("\n") ||
    durationMinutes.value !== timing(a).duration ||
    deadlineLeadMinutes.value !== timing(a).lead
  );
}
async function close() {
  if (busy.value) return;
  const dirty = editor.value
    ? name.value !== (editing.value?.name || "") ||
      !!sourceId.value ||
      contentChanged()
    : !!start.value ||
      (copying.value && !!sourceId.value) ||
      count.value !== 1 ||
      interval.value !== 7;
  if (dirty && !(await askConfirm("模板操作尚未保存，确定放弃吗？"))) return;
  editor.value = false;
  schedule.value = null;
  copying.value = false;
  error.value = "";
}
async function save() {
  if (busy.value) return;
  const source = sources.value.find((x) => x.id === sourceId.value);
  const target = editing.value;
  const direct = target && content.value && !replaceFromSource.value;
  if (!name.value.trim() || (!direct && !source)) {
    error.value = direct ? "请填写模板名称" : "请选择来源活动并填写模板名称";
    return;
  }
  const a = content.value;
  let payload: Record<string, unknown> = {
    name: name.value.trim(),
    version: target?.version,
    sourceId: source?.id,
    sourceVersion: source?.version,
  };
  if (target && direct && a) {
    if (
      [
        a.title,
        a.summary,
        a.description,
        a.location,
        a.meetingPoint,
        a.coverUrl,
      ].some((v) => !v?.trim())
    ) {
      error.value = "请填写活动标题、摘要、说明、地点、集合地点和封面";
      return;
    }
    const galleryUrls = galleryText.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      galleryUrls.length > 12 ||
      galleryUrls.some((url) => url.length > 2048)
    ) {
      error.value = "最多 12 张图集图片，每条地址最多 2048 字";
      return;
    }
    const previous = timing(target.activity);
    const cents = Math.round(Number(priceYuan.value) * 100);
    if (
      typeof priceYuan.value !== "number" ||
      priceYuan.value < 0 ||
      cents > 100000000 ||
      Math.abs(priceYuan.value * 100 - cents) > 0.000001 ||
      !Number.isInteger(a.capacity) ||
      a.capacity < 1 ||
      a.capacity > 10000 ||
      ![durationMinutes.value, deadlineLeadMinutes.value].every(
        Number.isInteger,
      ) ||
      Number(durationMinutes.value) < 1 ||
      Number(deadlineLeadMinutes.value) < 0 ||
      (durationMinutes.value !== previous.duration &&
        Number(durationMinutes.value) > 1051200) ||
      (deadlineLeadMinutes.value !== previous.lead &&
        Number(deadlineLeadMinutes.value) > 1051200)
    ) {
      error.value = "请检查费用、名额、活动时长和报名提前量";
      return;
    }
    payload = {
      name: name.value.trim(),
      version: target.version,
      title: a.title,
      category: a.category,
      summary: a.summary,
      description: a.description,
      location: a.location,
      meetingPoint: a.meetingPoint,
      coverUrl: a.coverUrl,
      galleryUrls,
      capacity: a.capacity,
      priceCents: cents,
      identityRequired: !!a.identityRequired,
      durationMinutes:
        durationMinutes.value !== previous.duration
          ? durationMinutes.value
          : undefined,
      deadlineLeadMinutes:
        deadlineLeadMinutes.value !== previous.lead
          ? deadlineLeadMinutes.value
          : undefined,
    };
  }
  const actor = currentUser.value,
    n = epoch;
  busy.value = true;
  error.value = "";
  try {
    const saved = await request<Template>(
      `/admin/templates${target ? "/" + encodeURIComponent(target.id) : ""}${direct ? "/content" : ""}`,
      { method: target ? "PUT" : "POST", body: JSON.stringify(payload) },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    editor.value = false;
    success.value = "模板已保存";
    if (target)
      items.value = items.value.map((t) => (t.id === saved.id ? saved : t));
    else void load();
  } catch (e) {
    if (n === epoch && actor === currentUser.value)
      error.value = errorMessage(e);
  } finally {
    if (actor === currentUser.value) busy.value = false;
  }
}
async function removeTemplate(template: Template) {
  const actor = currentUser.value,
    n = epoch;
  if (
    !actor ||
    loading.value ||
    busy.value ||
    !(await askConfirm({
      title: "删除活动模板？",
      description: "已生成的活动草稿会保留。",
      confirmLabel: "删除模板",
      danger: true,
    })) ||
    actor !== currentUser.value ||
    n !== epoch
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    await request(
      "/admin/templates/" +
        encodeURIComponent(template.id) +
        "?version=" +
        template.version,
      { method: "DELETE" },
    );
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
    if (
      !Number.isInteger(interval.value) ||
      interval.value < 1 ||
      interval.value > 365
    )
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
useForegroundRefresh(() => {
  if (
    !busy.value &&
    !loading.value &&
    !editor.value &&
    !preview.value &&
    !copying.value &&
    !schedule.value
  )
    void load(page.value);
});
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>活动模板</h1>
        <p class="template-page-hint">
          复用成熟活动配置，生成草稿后检查并发布，减少重复填写。
        </p>
      </div>
      <div class="template-actions">
        <button type="button" class="secondary" @click="openSchedule(null)">
          <AppIcon name="document" :size="15" />复制活动
        </button>
        <button type="button" class="primary" @click="openEditor()">
          <AppIcon name="plus" :size="16" />新建模板
        </button>
      </div>
    </section>
    <p
      v-if="error && !(editor || schedule || copying)"
      class="error-box"
      role="alert"
    >
      {{ error }}
      <button
        type="button"
        class="text-button"
        :disabled="busy || loading"
        @click="load()"
      >
        重试
      </button>
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
      <div class="template-leading">
        <span class="template-icon"
          ><AppIcon name="template" :size="20"
        /></span>
        <div class="template-summary">
          <h3>{{ t.name }}</h3>
          <p>
            <span>{{ t.activity.title }}</span
            ><span>{{ t.activity.capacity }} 人</span
            ><span>{{ templatePrice(t.activity.priceCents) }}</span>
          </p>
        </div>
      </div>
      <div class="template-actions">
        <button
          type="button"
          class="text-button template-delete"
          :disabled="loading || busy"
          @click="removeTemplate(t)"
        >
          删除模板
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="loading || busy"
          @click="preview = t"
        >
          查看模板
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="loading || busy"
          @click="openEditor(t)"
        >
          编辑模板
        </button>
        <button
          type="button"
          class="primary"
          :disabled="loading || busy"
          @click="openSchedule(t)"
        >
          生成草稿
        </button>
      </div>
    </section>
    <PaginationBar
      v-if="pageTotal != null || hasMore || page > 0"
      :page="page"
      :page-size="20"
      :total="pageTotal"
      :has-more="hasMore"
      :busy="loading"
      label="模板分页"
      @change="load"
    />
    <FormModal v-if="preview" @close="preview = null">
      <template #title
        ><h2 class="modal-heading">模板详情：{{ preview.name }}</h2></template
      >
      <dl class="template-detail">
        <div>
          <dt>活动名称</dt>
          <dd>{{ preview.activity.title }}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{{ categories[preview.activity.category] || "未设置" }}</dd>
        </div>
        <div>
          <dt>活动地点</dt>
          <dd>{{ preview.activity.location || "未填写" }}</dd>
        </div>
        <div>
          <dt>集合地点</dt>
          <dd>{{ preview.activity.meetingPoint || "未填写" }}</dd>
        </div>
        <div>
          <dt>人数上限</dt>
          <dd>{{ preview.activity.capacity }} 人</dd>
        </div>
        <div>
          <dt>报名费用</dt>
          <dd>{{ templatePrice(preview.activity.priceCents) }}</dd>
        </div>
        <div>
          <dt>活动时长</dt>
          <dd>
            {{ duration(preview.activity.startAt, preview.activity.endAt) }}
          </dd>
        </div>
        <div>
          <dt>报名截止</dt>
          <dd>
            开场前
            {{
              duration(
                preview.activity.registrationDeadline,
                preview.activity.startAt,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>身份证核验</dt>
          <dd>{{ preview.activity.identityRequired ? "需要" : "不需要" }}</dd>
        </div>
        <div v-if="preview.activity.boardingPoints?.length">
          <dt>上车地点</dt>
          <dd>{{ preview.activity.boardingPoints.join("、") }}</dd>
        </div>
        <div
          v-if="preview.activity.navigationPoints?.length"
          class="template-detail-wide"
        >
          <dt>导航地点</dt>
          <dd>
            <ul>
              <li
                v-for="point in preview.activity.navigationPoints"
                :key="point.id"
              >
                {{ point.label
                }}{{ point.address ? " · " + point.address : "" }}
              </li>
            </ul>
          </dd>
        </div>
        <div class="template-detail-wide">
          <dt>活动摘要</dt>
          <dd>{{ preview.activity.summary || "未填写" }}</dd>
        </div>
        <div class="template-detail-wide">
          <dt>活动详情</dt>
          <dd>{{ preview.activity.description || "未填写" }}</dd>
        </div>
        <div
          v-if="
            preview.activity.coverUrl || preview.activity.galleryUrls?.length
          "
          class="template-detail-wide"
        >
          <dt>活动图片</dt>
          <dd class="template-detail-images">
            <img
              v-if="preview.activity.coverUrl"
              :src="preview.activity.coverUrl"
              alt="活动封面"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <img
              v-for="(url, i) in preview.activity.galleryUrls"
              :key="i"
              :src="url"
              :alt="`图集图片 ${i + 1}`"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
          </dd>
        </div>
      </dl>
      <div class="dialog-actions">
        <button type="button" class="secondary" @click="preview = null">
          关闭
        </button>
      </div>
    </FormModal>
    <FormModal
      :busy="busy"
      :size="editor && editing ? 'lg' : 'md'"
      v-if="editor || schedule || copying"
      @close="close"
      ><template #title
        ><h2 class="modal-heading">
          {{
            editor
              ? editing
                ? "编辑模板"
                : "新建模板"
              : copying
                ? "复制活动"
                : "生成草稿"
          }}
        </h2></template
      >

      <form @submit.prevent="editor ? save() : generate()">
        <label v-if="editor"
          >模板名称<input v-model="name" maxlength="120" :disabled="busy"
        /></label>
        <template v-if="editor && editing">
          <p class="muted">保存只更新模板，已生成的活动不受影响。</p>
          <button
            type="button"
            class="text-button"
            :disabled="busy"
            @click="toggleSource"
          >
            {{ replaceFromSource ? "返回直接编辑" : "从已有活动替换内容" }}
          </button>
        </template>
        <template v-if="editor && content && !replaceFromSource">
          <fieldset class="template-edit-grid" :disabled="busy">
            <label
              >活动标题<input v-model="content.title" maxlength="120" required
            /></label>
            <label
              >活动分类<select v-model="content.category">
                <option
                  v-for="(label, value) in categories"
                  :key="value"
                  :value="value"
                >
                  {{ label }}
                </option>
              </select></label
            >
            <label
              >活动地点<input
                v-model="content.location"
                maxlength="200"
                required
            /></label>
            <label
              >集合地点<input
                v-model="content.meetingPoint"
                maxlength="200"
                required
            /></label>
            <label
              >报名名额<input
                v-model.number="content.capacity"
                type="number"
                min="1"
                max="10000"
                step="1"
                required
            /></label>
            <label
              >每人费用（元）<input
                v-model.number="priceYuan"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
            /></label>
            <label
              >活动时长（分钟）<input
                v-model.number="durationMinutes"
                type="number"
                min="1"
                step="1"
                required
            /></label>
            <label
              >报名截止提前量（分钟）<input
                v-model.number="deadlineLeadMinutes"
                type="number"
                min="0"
                step="1"
                required
            /></label>
            <label class="template-identity"
              ><input v-model="content.identityRequired" type="checkbox" />
              报名需要身份证</label
            >
            <label class="template-detail-wide"
              >活动摘要<textarea
                v-model="content.summary"
                maxlength="300"
                rows="2"
                required
              />
            </label>
            <label class="template-detail-wide"
              >活动说明<textarea
                v-model="content.description"
                maxlength="20000"
                rows="4"
                required
              />
            </label>
            <details class="template-detail-wide">
              <summary>封面与图集</summary>
              <label
                >封面图片地址<input
                  v-model="content.coverUrl"
                  maxlength="2048"
                  required
              /></label>
              <label
                >图集图片地址（每行一张）<textarea
                  v-model="galleryText"
                  rows="3"
                />
              </label>
            </details>
          </fieldset>
        </template>
        <label v-if="(editor && (!editing || replaceFromSource)) || copying"
          >来源活动<select v-model="sourceId" :disabled="busy">
            <option value="">选择活动</option>
            <option v-for="a in sources" :key="a.id" :value="a.id">
              {{ a.title }} · {{ statuses[a.status] }}
            </option></select
          ><small
            v-if="copying && scheduleErrors.source"
            class="field-error"
            role="alert"
            >{{ scheduleErrors.source }}</small
          ></label
        >
        <button
          v-if="
            ((editor && (!editing || replaceFromSource)) || copying) &&
            sourceMore
          "
          type="button"
          class="text-button"
          @click="loadSources(true)"
        >
          更多来源活动
        </button>
        <template v-if="!editor"
          ><fieldset :disabled="busy">
            <DateTimeField
              id="template-start"
              v-model="start"
              label="开始时间（北京时间）"
              :error="scheduleErrors.date"
              required
            />
          </fieldset>
          <template v-if="schedule"
            ><label
              >生成场次<input
                v-model.number="count"
                type="number"
                min="1"
                max="12"
                :disabled="busy"
              /><small
                v-if="scheduleErrors.count"
                class="field-error"
                role="alert"
                >{{ scheduleErrors.count }}</small
              ></label
            ><label
              >间隔天数<input
                v-model.number="interval"
                type="number"
                min="1"
                max="365"
                :disabled="busy"
              /><small
                v-if="scheduleErrors.interval"
                class="field-error"
                role="alert"
                >{{ scheduleErrors.interval }}</small
              ></label
            ></template
          >
          <p class="muted">
            仅生成草稿，时长和报名提前量沿用来源活动。
          </p></template
        >
        <p v-if="error" class="error-box" role="alert">{{ error }}</p>
        <div class="dialog-actions">
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
.template-page-hint {
  margin: 5px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
}
.template-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 10px;
  padding: 16px 18px;
  overflow-wrap: anywhere;
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  background: var(--admin-surface);
  box-shadow: var(--rf-shadow-sm);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}
.template-row:hover {
  border-color: #cadbd0;
  box-shadow: 0 10px 24px #183c290c;
}
.template-leading {
  display: flex;
  align-items: center;
  gap: 13px;
  flex: 1;
  min-width: 0;
}
.template-icon {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
}
.template-summary {
  min-width: 0;
  flex: 1;
}
.template-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.template-actions .secondary,
.template-actions .primary {
  min-height: 34px;
  padding: 6px 12px;
  font-size: 12px;
}
.template-delete {
  margin-right: 4px;
  color: var(--rf-muted);
}
.template-delete:hover {
  color: var(--rf-danger);
}
.template-row h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}
.template-row p {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 5px 0 0;
  color: var(--admin-muted);
  font-size: 11px;
}
.template-row p span + span {
  position: relative;
}
.template-row p span + span::before {
  position: absolute;
  left: -8px;
  content: "·";
}
.template-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  min-width: 0;
  border: 0;
  margin: 8px 0;
  padding: 0;
}
.template-edit-grid label {
  margin: 0;
}
.template-edit-grid .template-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  grid-column: 1 / -1;
}
.template-edit-grid .template-identity input {
  width: auto;
}
.template-edit-grid details label {
  margin-top: 8px;
}
@media (max-width: 480px) {
  .template-edit-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.template-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  overflow-wrap: anywhere;
  margin: 0;
}
.template-detail dt {
  color: var(--admin-muted);
  font-size: 12px;
}
.template-detail dd {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
.template-detail-wide {
  grid-column: 1 / -1;
}
.template-detail ul {
  margin: 0;
  padding-inline-start: 18px;
}
.template-detail-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.template-detail-images img {
  width: 96px;
  height: 72px;
  object-fit: contain;
}
.modal-heading {
  padding-right: 36px;
}
.generated {
  display: grid;
  gap: 12px;
  margin-top: 24px;
  overflow-wrap: anywhere;
}
.generated a {
  padding: 12px 14px;
  border: 1px solid var(--rf-line);
  border-radius: 10px;
  color: var(--rf-primary-text);
  background: var(--rf-surface);
}
@media (max-width: 640px) {
  .template-row {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
    padding: 15px;
  }
  .template-actions {
    padding-top: 10px;
    border-top: 1px solid var(--rf-line);
  }
  .template-delete {
    margin-right: auto;
  }
}
</style>
