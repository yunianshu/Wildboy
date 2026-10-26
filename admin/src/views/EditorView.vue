<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from "vue-router";
import { request, ApiError, errorMessage } from "../api";
import {
  categories,
  statuses,
  type Activity,
  type ActivityInput,
} from "../types";
import { fromShanghaiInput, toShanghaiInput, validateActivity } from "../forms";
import ConfirmDialog from "../components/ConfirmDialog.vue";
const route = useRoute(),
  router = useRouter(),
  id = computed(() =>
    typeof route.params.id === "string" ? route.params.id : "",
  ),
  current = ref<Activity | null>(null),
  loading = ref(false),
  saving = ref(false),
  error = ref(""),
  success = ref(""),
  conflict = ref(false),
  dialog = ref<"publish" | "cancel" | null>(null);
const fields = reactive({
    title: "",
    category: "WEEKLY" as ActivityInput["category"],
    coverUrl: "",
    gallery: "",
    summary: "",
    description: "",
    location: "",
    meetingPoint: "",
    startAt: "",
    endAt: "",
    registrationDeadline: "",
    capacity: 20,
  }),
  errors = ref<Record<string, string>>({}),
  baseline = ref(JSON.stringify(fields));
const coverPresets = [
  { name: "山野徒步", file: "hero-hiking" },
  { name: "本周活动", file: "category-weekly" },
  { name: "国内游行", file: "category-domestic" },
  { name: "假期露营", file: "category-holiday" },
  { name: "休闲户外", file: "category-leisure" },
  { name: "户外装备", file: "equipment" },
];
const dirty = computed(() => baseline.value !== JSON.stringify(fields)),
  readonly = computed(() => current.value?.status === "CANCELLED");
let alive = true;
function assign(data: Activity) {
  current.value = data;
  Object.assign(fields, {
    title: data.title,
    category: data.category,
    coverUrl: data.coverUrl,
    gallery: data.galleryUrls.join("\n"),
    summary: data.summary,
    description: data.description,
    location: data.location,
    meetingPoint: data.meetingPoint,
    startAt: toShanghaiInput(data.startAt),
    endAt: toShanghaiInput(data.endAt),
    registrationDeadline: toShanghaiInput(data.registrationDeadline),
    capacity: data.capacity,
  });
  baseline.value = JSON.stringify(fields);
  conflict.value = false;
  errors.value = {};
}
async function load() {
  if (!id.value) return;
  loading.value = true;
  error.value = "";
  try {
    const data = await request<Activity>(
      `/admin/activities/${encodeURIComponent(id.value)}`,
    );
    if (alive) assign(data);
  } catch (e) {
    if (alive) error.value = errorMessage(e);
  } finally {
    if (alive) loading.value = false;
  }
}
function input(): ActivityInput {
  return {
    title: fields.title.trim(),
    category: fields.category,
    coverUrl: fields.coverUrl.trim(),
    galleryUrls: fields.gallery
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    summary: fields.summary.trim(),
    description: fields.description.trim(),
    location: fields.location.trim(),
    meetingPoint: fields.meetingPoint.trim(),
    startAt: fromShanghaiInput(fields.startAt),
    endAt: fromShanghaiInput(fields.endAt),
    registrationDeadline: fromShanghaiInput(fields.registrationDeadline),
    capacity: Number(fields.capacity),
    priceCents: 0,
  };
}
async function save() {
  if (saving.value || readonly.value || conflict.value) return;
  errors.value = validateActivity(input(), current.value?.registeredCount || 0);
  if (Object.keys(errors.value).length) {
    error.value = "请检查标记的内容后再保存。";
    return;
  }
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const data = await request<Activity>(
      id.value
        ? `/admin/activities/${encodeURIComponent(id.value)}`
        : "/admin/activities",
      {
        method: id.value ? "PUT" : "POST",
        body: JSON.stringify({
          ...input(),
          ...(current.value ? { version: current.value.version } : {}),
        }),
      },
    );
    if (!alive) return;
    assign(data);
    success.value = "已保存。未发布的草稿不会展示给用户。";
    if (!id.value) await router.replace(`/activities/${data.id}/edit`);
  } catch (e) {
    if (alive) {
      error.value = errorMessage(e);
      conflict.value = e instanceof ApiError && e.status === 409;
    }
  } finally {
    if (alive) saving.value = false;
  }
}
function requestAction(action: "publish" | "cancel") {
  error.value = "";
  success.value = "";
  if (dirty.value) {
    error.value = "请先保存当前修改，再执行发布或取消。";
    return;
  }
  dialog.value = action;
}
async function confirmAction() {
  if (saving.value || !current.value || !dialog.value) return;
  const action = dialog.value;
  saving.value = true;
  error.value = "";
  try {
    const data = await request<Activity>(
      `/admin/activities/${encodeURIComponent(current.value.id)}/${action}`,
      {
        method: "POST",
        body: JSON.stringify({ version: current.value.version }),
      },
    );
    if (alive) {
      assign(data);
      success.value =
        action === "publish"
          ? "活动已发布，用户现在可以报名。"
          : "活动已取消，停止接受新报名。";
      dialog.value = null;
    }
  } catch (e) {
    if (alive) {
      error.value = errorMessage(e);
      conflict.value = e instanceof ApiError && e.status === 409;
      dialog.value = null;
    }
  } finally {
    if (alive) saving.value = false;
  }
}
function reload() {
  if (!dirty.value || window.confirm("重新加载会丢弃未保存的修改，是否继续？"))
    void load();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(
  (to) =>
    to.path === "/login" ||
    !dirty.value ||
    window.confirm("修改尚未保存，确定离开吗？"),
);
onBeforeRouteUpdate(
  () => !dirty.value || window.confirm("修改尚未保存，确定切换活动吗？"),
);
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  alive = false;
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<template>
  <main class="workspace editor-workspace">
    <RouterLink class="back-link" to="/activities">← 返回活动目录</RouterLink>
    <section class="page-heading">
      <div>
        <p class="eyebrow">MAKE ROOM FOR ADVENTURE</p>
        <h1>{{ id ? "编辑活动" : "筹备一场新活动" }}</h1>
        <p class="muted">
          {{
            current
              ? `当前状态：${statuses[current.status]} · ${current.registeredCount} 人已报名`
              : "先保存草稿，检查无误后再发布。"
          }}
          所有时间均为北京时间。
        </p>
      </div>
      <span
        v-if="current"
        class="status-pill inline"
        :class="current.status.toLowerCase()"
        >{{ statuses[current.status] }}</span
      >
    </section>
    <p v-if="success" role="status" class="success-box">{{ success }}</p>
    <p v-if="error" role="alert" class="error-box">
      {{ error }}
      <button v-if="conflict" class="text-button" @click="reload">
        重新加载最新版本</button
      ><button v-else-if="id && !current" class="text-button" @click="load">
        重试
      </button>
    </p>
    <p v-if="loading" class="empty-state">正在加载活动…</p>
    <form v-else-if="!id || current" @submit.prevent="save">
      <div class="editor-grid">
        <div class="editor-main">
          <section class="form-section">
            <div class="section-title">
              <span>01</span>
              <div>
                <h2>让人想出发的第一眼</h2>
                <p>标题、分类与图片，是活动的第一印象。</p>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <label
                >活动标题 <span>*</span
                ><input
                  v-model="fields.title"
                  maxlength="100"
                  placeholder="例如：走进山海之间 · 周末轻徒步"
                /><small class="field-error">{{ errors.title }}</small></label
              >
              <div class="field-row">
                <label
                  >活动分类 <span>*</span
                  ><select v-model="fields.category">
                    <option
                      v-for="(label, key) in categories"
                      :key="key"
                      :value="key"
                    >
                      {{ label }}
                    </option></select
                  ><small class="field-error">{{
                    errors.category
                  }}</small></label
                ><label
                  >人数上限 <span>*</span
                  ><input
                    v-model.number="fields.capacity"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                  /><small class="field-error">{{
                    errors.capacity
                  }}</small></label
                >
              </div>
              <label
                >活动摘要 <span>*</span
                ><textarea
                  v-model="fields.summary"
                  rows="2"
                  maxlength="300"
                  placeholder="用一两句话描述这次出发。"
                /><small class="field-error">{{ errors.summary }}</small></label
              >
              <div class="preset-heading">
                选择原创封面，或填写自己的图片地址
              </div>
              <div class="cover-presets">
                <button
                  v-for="preset in coverPresets"
                  :key="preset.file"
                  type="button"
                  :class="{
                    selected: fields.coverUrl === `/assets/${preset.file}.jpg`,
                  }"
                  :aria-pressed="
                    fields.coverUrl === `/assets/${preset.file}.jpg`
                  "
                  @click="fields.coverUrl = `/assets/${preset.file}.jpg`"
                >
                  <img
                    :src="`/assets/${preset.file}.jpg`"
                    :alt="preset.name"
                    loading="lazy"
                  /><span>{{ preset.name }}</span>
                </button>
              </div>
              <label
                >封面图片地址 <span>*</span
                ><input
                  v-model="fields.coverUrl"
                  maxlength="2000"
                  placeholder="https://… 或 /assets/hiking.jpg"
                /><small class="field-error">{{ errors.coverUrl }}</small
                ><small class="field-hint"
                  >使用已托管的图片，不会上传本机文件。图片服务须允许小程序访问。</small
                ></label
              ><label
                >更多图片地址<textarea
                  v-model="fields.gallery"
                  rows="3"
                  placeholder="每行一个 HTTPS 图片地址，最多 8 张"
                /><small class="field-error">{{
                  errors.galleryUrls
                }}</small></label
              >
            </fieldset>
          </section>
          <section class="form-section">
            <div class="section-title">
              <span>02</span>
              <div>
                <h2>时间与集合地点</h2>
                <p>出发和返程都要有清晰的安排。</p>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <div class="field-row">
                <label
                  >开始时间 <span>*</span
                  ><input
                    v-model="fields.startAt"
                    type="datetime-local"
                  /><small class="field-error">{{
                    errors.startAt
                  }}</small></label
                ><label
                  >结束时间 <span>*</span
                  ><input v-model="fields.endAt" type="datetime-local" /><small
                    class="field-error"
                    >{{ errors.endAt }}</small
                  ></label
                >
              </div>
              <label
                >报名截止时间 <span>*</span
                ><input
                  v-model="fields.registrationDeadline"
                  type="datetime-local"
                /><small class="field-error">{{
                  errors.registrationDeadline
                }}</small></label
              ><label
                >活动目的地 <span>*</span
                ><input
                  v-model="fields.location"
                  maxlength="200"
                  placeholder="城市 / 路线 / 目的地"
                /><small class="field-error">{{
                  errors.location
                }}</small></label
              ><label
                >具体集合地点 <span>*</span
                ><input
                  v-model="fields.meetingPoint"
                  maxlength="200"
                  placeholder="写明集合位置、交通指引"
                /><small class="field-error">{{
                  errors.meetingPoint
                }}</small></label
              >
            </fieldset>
          </section>
          <section class="form-section">
            <div class="section-title">
              <span>03</span>
              <div>
                <h2>把出发的细节讲清楚</h2>
                <p>建议包含行程、难度、装备建议、注意事项和取消规则。</p>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <label
                >活动完整说明 <span>*</span
                ><textarea
                  v-model="fields.description"
                  rows="13"
                  maxlength="20000"
                  placeholder="【活动行程】\n\n【适合人群与路线难度】\n\n【装备建议】\n\n【天气与安全提示】\n\n【取消与变更说明】"
                /><small class="field-error">{{ errors.description }}</small
                ><small class="field-hint"
                  >以纯文本保存并保留换行，不执行 HTML 或脚本。</small
                ></label
              >
            </fieldset>
          </section>
        </div>
        <aside class="editor-aside">
          <section class="preview-card">
            <div class="preview-image">
              <img
                v-if="fields.coverUrl"
                :src="fields.coverUrl"
                alt="活动封面预览"
                referrerpolicy="no-referrer"
              /><span v-else>封面预览</span>
            </div>
            <div class="preview-copy">
              <p class="card-category">{{ categories[fields.category] }}</p>
              <h3>{{ fields.title || "下一次出发的名字" }}</h3>
              <p>
                {{ fields.summary || "填写活动摘要，让参与者了解你的安排。" }}
              </p>
              <span>⌖ {{ fields.location || "等待填写目的地" }}</span>
            </div>
          </section>
          <div class="editor-tip">
            <strong>发布前，最后检查一次</strong>
            <p>图片是否准确？集合点是否清楚？路线和安全说明是否完整？</p>
            <p>
              本期为免费报名，未接入微信支付。活动发布后仍可编辑；已报名人数不能被缩减。
            </p>
          </div>
        </aside>
      </div>
      <div class="editor-actions">
        <span
          >{{
            readonly
              ? "已取消的活动只读"
              : dirty
                ? "● 有尚未保存的修改"
                : "内容已保存"
          }}{{ current ? ` · 版本 ${current.version}` : "" }}</span
        >
        <div>
          <button
            v-if="current?.status === 'PUBLISHED'"
            type="button"
            class="danger-outline"
            :disabled="saving || conflict"
            @click="requestAction('cancel')"
          >
            取消活动</button
          ><button
            v-if="!readonly"
            class="secondary"
            :disabled="saving || conflict"
          >
            {{
              saving ? "正在保存…" : current ? "保存修改" : "保存草稿"
            }}</button
          ><button
            v-if="current?.status === 'DRAFT'"
            type="button"
            class="primary"
            :disabled="saving || conflict"
            @click="requestAction('publish')"
          >
            发布活动 ↗
          </button>
        </div>
      </div>
    </form>
    <ConfirmDialog
      v-if="dialog"
      :busy="saving"
      :danger="dialog === 'cancel'"
      :title="dialog === 'publish' ? '发布这场活动？' : '确认取消这场活动？'"
      :description="
        dialog === 'publish'
          ? '发布后活动将出现在小程序，微信用户可免费报名。请再次确认时间、地点和人数限制。'
          : '取消后将停止报名。请另行联系已报名成员说明安排，本系统不会自动发送通知。'
      "
      :confirm-label="dialog === 'publish' ? '确认发布' : '确认取消活动'"
      @confirm="confirmAction"
      @cancel="!saving && (dialog = null)"
    />
  </main>
</template>
