<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { askConfirm } from "../confirm";
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from "vue";
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from "vue-router";
import { request, ApiError, errorMessage, currentUser } from "../api";
import {
  categories,
  statuses,
  type Activity,
  type ActivityInput,
  type NavigationPoint,
} from "../types";
import { fromShanghaiInput, toShanghaiInput, validateActivity } from "../forms";
import { activityStatusTone } from "../statusTone";
import ActivityReopenModal from "../components/ActivityReopenModal.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import ImageUpload from "../components/ImageUpload.vue";
import NavigationPointsField from "../components/NavigationPointsField.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import AppIcon from "../components/AppIcon.vue";
import BoardingPointsField from "../components/BoardingPointsField.vue";
import UiState from "../components/UiState.vue";
import DateTimeField from "../components/DateTimeField.vue";
const savedContentVersion = ref<number | null>(null);
const contentVisible = ref(false);
const reopenOpen = ref(false);
const contentEditor = ref<InstanceType<typeof MarkdownEditor>>();
async function jumpToContent() {
  editSection.value = "rich";
  contentVisible.value = true;
  await nextTick();
  const heading = document.getElementById("activity-rich-heading");
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView?.({ block: "start" });
}
async function canLeaveContent() {
  return (
    !contentEditor.value?.writeBusy &&
    ((await contentEditor.value?.canLeave()) ?? true)
  );
}
async function reloadContent() {
  const editor = contentEditor.value;
  if (editor && (await canLeaveContent()) && editor === contentEditor.value) {
    savedContentVersion.value = null;
    await editor.load();
  }
}
const route = useRoute(),
  router = useRouter(),
  id = computed(() =>
    typeof route.params.id === "string" ? route.params.id : "",
  ),
  current = ref<Activity | null>(null),
  loading = ref(false),
  refreshing = ref(false),
  saving = ref(false),
  error = ref(""),
  success = ref(""),
  conflict = ref(false),
  uncertainCreate = ref(false),
  addingBoardingPoint = ref(false),
  addingNavigationPoint = ref(false),
  identityLockedByServer = ref(false),
  dialog = ref<"publish" | "cancel" | null>(null);
watch(id, () => {
  editSection.value = "basic";
  contentVisible.value = false;
  savedContentVersion.value = null;
});
const fields = reactive({
    title: "",
    category: "WEEKLY" as ActivityInput["category"],
    coverUrl: "",
    galleryUrls: [] as string[],
    summary: "",
    description: "",
    location: "",
    meetingPoint: "",
    boardingPoints: [] as string[],
    navigationPoints: [] as NavigationPoint[],
    startAt: "",
    endAt: "",
    registrationDeadline: "",
    identityRequired: true,
    capacity: 20,
  }),
  errors = ref<Record<string, string>>({}),
  baseline = ref(JSON.stringify(fields));
// 封面与更多图片一律通过上传获得，不再提供 /assets/ 预设选图
const priceYuan = ref("0.00");
const showMedia = ref(false);
const showAdvanced = ref(false);
const editSection = ref<"basic" | "schedule" | "detail" | "rich">("basic");
const sections = [
  { id: "basic", label: "基本信息" },
  { id: "schedule", label: "时间与地点" },
  { id: "detail", label: "活动详情" },
] as const;
const sectionFields = {
  basic: [
    "title",
    "category",
    "coverUrl",
    "galleryUrls",
    "summary",
    "capacity",
  ],
  schedule: [
    "startAt",
    "endAt",
    "registrationDeadline",
    "location",
    "meetingPoint",
    "boardingPoints",
  ],
  detail: ["description"],
} as const;
function sectionErrorCount(section: (typeof sections)[number]["id"]) {
  return sectionFields[section].filter((field) => errors.value[field]).length;
}
function moveGalleryImage(index: number, direction: -1 | 1) {
  const target = index + direction;
  const pictures = fields.galleryUrls;
  if (target < 0 || target >= pictures.length) return;
  [pictures[index], pictures[target]] = [pictures[target], pictures[index]];
}
const metadataDirty = computed(() => baseline.value !== JSON.stringify(fields));
const priceEditable = computed(
  () =>
    !current.value ||
    current.value.status === "DRAFT" ||
    current.value.registeredCount === 0 ||
    current.value.priceCents > 0,
);
const priceDirty = computed(
  () =>
    priceEditable.value &&
    (!/^\d+(\.\d{1,2})?$/.test(priceYuan.value) ||
      Math.round(Number(priceYuan.value) * 100) !==
        (current.value?.priceCents ?? 0)),
);
const metadataDraftDirty = computed(
  () =>
    metadataDirty.value ||
    addingBoardingPoint.value ||
    addingNavigationPoint.value,
);
const dirty = computed(() => metadataDraftDirty.value || priceDirty.value),
  readonly = computed(() => false);
const identityLocked = computed(
  () =>
    identityLockedByServer.value || (current.value?.registeredCount ?? 0) > 0,
);
let alive = true;
function assign(data: Activity) {
  current.value = data;
  priceYuan.value = (data.priceCents / 100).toFixed(2);
  Object.assign(fields, {
    title: data.title,
    category: data.category,
    coverUrl: data.coverUrl,
    galleryUrls: [...(data.galleryUrls || [])],
    summary: data.summary,
    description: data.description,
    location: data.location,
    meetingPoint: data.meetingPoint,
    boardingPoints: [...(data.boardingPoints ?? [])],
    navigationPoints: (data.navigationPoints ?? []).map((p) => ({ ...p })),
    startAt: toShanghaiInput(data.startAt),
    endAt: toShanghaiInput(data.endAt),
    registrationDeadline: toShanghaiInput(data.registrationDeadline),
    identityRequired: !!data.identityRequired,
    capacity: data.capacity,
  });
  baseline.value = JSON.stringify(fields);
  addingBoardingPoint.value = false;
  addingNavigationPoint.value = false;
  conflict.value = false;
  identityLockedByServer.value = false;
  errors.value = {};
}
function canRefresh() {
  return (
    !!id.value &&
    !dirty.value &&
    !saving.value &&
    !loading.value &&
    !conflict.value &&
    !reopenOpen.value &&
    !dialog.value
  );
}
async function load(background = false) {
  const activityId = id.value || current.value?.id;
  if (!activityId) return;
  const actor = currentUser.value;
  const beforeRefresh = current.value;
  if (background) refreshing.value = true;
  else {
    loading.value = true;
    error.value = "";
  }
  try {
    const data = await request<Activity>(
      `/admin/activities/${encodeURIComponent(activityId)}`,
    );
    if (
      alive &&
      actor === currentUser.value &&
      (!background || (canRefresh() && current.value === beforeRefresh))
    )
      assign(data);
  } catch (e) {
    if (alive && !background) error.value = errorMessage(e);
  } finally {
    if (background) refreshing.value = false;
    else if (alive) loading.value = false;
  }
}
function activityDateInput(value: string, original?: string) {
  return original && toShanghaiInput(original) === value
    ? original
    : fromShanghaiInput(value);
}
function input(): ActivityInput {
  return {
    title: fields.title.trim(),
    category: fields.category,
    coverUrl: fields.coverUrl.trim(),
    galleryUrls: [...fields.galleryUrls],
    summary: fields.summary.trim(),
    description: fields.description.trim(),
    location: fields.location.trim(),
    meetingPoint: fields.meetingPoint.trim(),
    boardingPoints: [...fields.boardingPoints],
    ...(fields.navigationPoints.length ||
    current.value?.navigationPoints?.length
      ? { navigationPoints: fields.navigationPoints.map((p) => ({ ...p })) }
      : {}),
    startAt: activityDateInput(fields.startAt, current.value?.startAt),
    endAt: activityDateInput(fields.endAt, current.value?.endAt),
    registrationDeadline: activityDateInput(
      fields.registrationDeadline,
      current.value?.registrationDeadline,
    ),
    identityRequired: fields.identityRequired,
    capacity: Number(fields.capacity),
    priceCents: 0,
  };
}
function writeError(e: unknown) {
  if (e instanceof ApiError && e.code === "ACTIVITY_IDENTITY_LOCKED") {
    identityLockedByServer.value = true;
    fields.identityRequired = !!current.value?.identityRequired;
    error.value = e.message;
    return;
  }
  conflict.value =
    e instanceof ApiError &&
    e.status === 409 &&
    ["STALE_VERSION", "VERSION_CONFLICT", "REQUEST_FAILED"].includes(e.code);
  error.value =
    e instanceof ApiError && e.status === 409 && !conflict.value
      ? e.message
      : errorMessage(e);
}
async function save() {
  if (editSection.value === "rich") return;
  if (saving.value || readonly.value || conflict.value || uncertainCreate.value)
    return;
  if (addingBoardingPoint.value) {
    showAdvanced.value = true;
    editSection.value = "schedule";
    error.value = "请先保存或取消新增的上车地点。";
    return;
  }
  if (addingNavigationPoint.value) {
    showAdvanced.value = true;
    editSection.value = "schedule";
    error.value = "请先添加或取消当前导航点。";
    return;
  }
  errors.value = validateActivity(input(), current.value?.registeredCount || 0);
  if (Object.keys(errors.value).length) {
    if (errors.value.coverUrl || errors.value.galleryUrls)
      showMedia.value = true;
    if (errors.value.boardingPoints) showAdvanced.value = true;
    editSection.value =
      sections.find(({ id }) => sectionErrorCount(id))?.id ?? "basic";
    error.value = "请检查标记的内容后再保存。";
    return;
  }
  const pendingPrice = priceDirty.value ? priceYuan.value : null;
  const activityId = id.value || current.value?.id;
  if (pendingPrice !== null && parseDraftPrice(pendingPrice) === null) {
    error.value = "价格需为 0–1000000 元，最多两位小数。";
    return;
  }
  const actor = currentUser.value;
  let started = false;
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const body = JSON.stringify({
      ...input(),
      ...(current.value ? { version: current.value.version } : {}),
    });
    started = true;
    const data =
      activityId && !metadataDirty.value && current.value
        ? current.value
        : await request<Activity>(
            activityId
              ? `/admin/activities/${encodeURIComponent(activityId)}`
              : "/admin/activities",
            {
              method: activityId ? "PUT" : "POST",
              body,
            },
          );
    if (!alive || actor !== currentUser.value) return;
    assign(data);
    if (pendingPrice !== null) {
      priceYuan.value = pendingPrice;
      if (priceEditable.value) {
        try {
          const updated = await putDraftPrice(
            data,
            parseDraftPrice(pendingPrice)!,
          );
          if (!alive || actor !== currentUser.value) return;
          assign(updated);
        } catch (cause) {
          if (!alive || actor !== currentUser.value) return;
          writeError(cause);
          if (
            !(cause instanceof ApiError) ||
            cause.status === 0 ||
            cause.status >= 500
          ) {
            conflict.value = true;
            error.value = "活动资料已保存。价格结果待核对，请重新加载后确认。";
          } else {
            error.value = "活动资料已保存，报名价格未确认。 " + error.value;
          }
          return;
        }
      }
    }
    success.value =
      data.status === "DRAFT"
        ? "已保存。未发布的草稿不会展示给用户。"
        : "活动修改已保存。";
    if (!id.value) {
      saving.value = false;
      await router.replace(`/activities/${data.id}/edit`);
    }
  } catch (e) {
    if (!alive || actor !== currentUser.value) return;
    if (
      !activityId &&
      !current.value?.id &&
      started &&
      (!(e instanceof ApiError) || e.status === 0 || e.status >= 500)
    ) {
      uncertainCreate.value = true;
      error.value =
        "创建结果待核对。输入已保留，请先返回活动列表确认是否已生成草稿。";
    } else writeError(e);
  } finally {
    if (alive) saving.value = false;
  }
}
function parseDraftPrice(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents >= 0 && cents <= 100000000 ? cents : null;
}
function putDraftPrice(activity: Activity, priceCents: number) {
  return request<Activity>(
    "/admin/activities/" + encodeURIComponent(activity.id) + "/price",
    {
      method: "POST",
      body: JSON.stringify({ priceCents, version: activity.version }),
    },
  );
}
async function savePrice() {
  if (saving.value || conflict.value || !current.value || !priceEditable.value)
    return;
  if (metadataDraftDirty.value) {
    error.value = "请先保存活动信息，再设置报名价格。";
    return;
  }
  const amount = Number(priceYuan.value) * 100;
  if (
    !/^\d+(\.\d{1,2})?$/.test(priceYuan.value) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100000000
  ) {
    error.value = "价格需为 0–1000000 元，最多两位小数。";
    return;
  }
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const updated = await request<Activity>(
      `/admin/activities/${encodeURIComponent(current.value.id)}/price`,
      {
        method: "POST",
        body: JSON.stringify({
          priceCents: Math.round(amount),
          version: current.value.version,
        }),
      },
    );
    if (!alive) return;
    assign(updated);
    success.value =
      updated.status === "DRAFT"
        ? "报名价格已保存，活动尚未发布。"
        : "报名价格已更新。";
  } catch (e) {
    if (alive) writeError(e);
  } finally {
    if (alive) saving.value = false;
  }
}
async function reopenAsDraft() {
  if (saving.value || conflict.value || !current.value) return;
  if (dirty.value) {
    error.value = "请先保存当前修改，再转回草稿。";
    return;
  }
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const updated = await request<Activity>(
      `/admin/activities/${encodeURIComponent(current.value.id)}/reopen`,
      {
        method: "POST",
        body: JSON.stringify({ version: current.value.version }),
      },
    );
    if (!alive) return;
    assign(updated);
    success.value = "已转回草稿，修改日期后即可重新发布。";
  } catch (e) {
    if (alive) writeError(e);
  } finally {
    if (alive) saving.value = false;
  }
}
async function handleReopened(created: Activity) {
  reopenOpen.value = false;
  success.value = `已为您生成新一期活动（${statuses[created.status]}），已跳转打开。`;
  await router.push(`/activities/${created.id}/edit`);
}
function requestAction(action: "publish" | "cancel") {
  error.value = "";
  success.value = "";
  if (dirty.value || saving.value) {
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
      writeError(e);
      dialog.value = null;
    }
  } finally {
    if (alive) saving.value = false;
  }
}
async function reload() {
  if (
    !dirty.value ||
    (await askConfirm("重新加载会丢弃未保存的修改，是否继续？"))
  )
    void load();
}
function closeEditor() {
  const list = route.query.list;
  void router.push(
    typeof list === "string" && list.startsWith("/activities?")
      ? list
      : "/activities",
  );
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || contentEditor.value?.dirty || contentEditor.value?.busy) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(
  async (to) =>
    to.path === "/login" ||
    (!saving.value &&
      (await canLeaveContent()) &&
      (!dirty.value || (await askConfirm("修改尚未保存，确定离开吗？")))),
);
onBeforeRouteUpdate(
  async () =>
    !saving.value &&
    (await canLeaveContent()) &&
    (!dirty.value || (await askConfirm("修改尚未保存，确定切换活动吗？"))),
);
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  alive = false;
  window.removeEventListener("beforeunload", beforeUnload);
});
useForegroundRefresh(() => {
  if (canRefresh() && !refreshing.value) void load(true);
});
</script>
<template>
  <main class="workspace editor-workspace">
    <section class="page-heading">
      <div>
        <h1>{{ id ? "编辑活动" : "新建活动" }}</h1>
        <p class="muted">
          <template v-if="current && current.priceCents > 0">
            名额占用 {{ current.registeredCount }} / {{ current.capacity }}
            <template
              v-if="
                current.confirmedCount != null &&
                current.pendingPaymentCount != null
              "
            >
              · 已确认 {{ current.confirmedCount }} · 待支付
              {{ current.pendingPaymentCount }}
            </template>
            ·
          </template>
          <template v-else-if="current"
            >{{ current.registeredCount }} 人已报名 ·</template
          >
          时间均为北京时间
        </p>
      </div>
      <div class="action-row">
        <span
          v-if="current"
          class="status-pill inline"
          :class="`tone-${activityStatusTone(current.status)}`"
          >{{ statuses[current.status] }}</span
        >
        <button
          v-if="current"
          type="button"
          class="secondary"
          :disabled="saving"
          @click="reopenOpen = true"
        >
          换时间重开一期
        </button>
        <button type="button" class="secondary" @click="closeEditor">
          <AppIcon name="back" :size="16" /> 活动列表
        </button>
      </div>
    </section>
    <p v-if="success" role="status" class="success-box">{{ success }}</p>
    <p v-if="error" role="alert" class="error-box">
      {{ error }}
      <button v-if="conflict" class="text-button" @click="reload">
        采用最新版本</button
      ><button v-else-if="id && !current" class="text-button" @click="load()">
        重试
      </button>
      <button
        v-else-if="uncertainCreate"
        class="text-button"
        @click="closeEditor"
      >
        返回活动列表核对
      </button>
    </p>
    <UiState v-if="loading" kind="loading" compact>正在加载活动…</UiState>
    <form v-else-if="!id || current" @submit.prevent="save">
      <nav v-if="!id" class="task-tabs" aria-label="编辑活动章节">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="editSection === section.id ? 'primary' : 'secondary'"
          :aria-pressed="editSection === section.id"
          @click="editSection = section.id"
        >
          {{ section.label }}
          <span
            v-if="sectionErrorCount(section.id)"
            class="status-pill tone-danger"
          >
            {{ sectionErrorCount(section.id) }} 处待修正
          </span>
        </button>
      </nav>
      <div class="editor-grid" :class="{ 'existing-activity': id }">
        <nav v-if="id" class="activity-section-nav" aria-label="活动编辑板块">
          <h2>编辑板块</h2>
          <div class="activity-section-list">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              class="secondary"
              :aria-pressed="editSection === section.id"
              @click="editSection = section.id"
            >
              {{ section.label }}
              <span
                v-if="sectionErrorCount(section.id)"
                class="status-pill tone-danger"
              >
                {{ sectionErrorCount(section.id) }} 处待修正
              </span>
            </button>
            <button
              type="button"
              class="secondary"
              :aria-pressed="editSection === 'rich'"
              @click="jumpToContent"
            >
              图文详情
              <span v-if="contentEditor?.dirty" class="status-pill tone-warning"
                >未保存</span
              >
            </button>
          </div>
        </nav>

        <div class="editor-main">
          <section v-show="editSection === 'basic'" class="form-section">
            <div class="section-title">
              <div>
                <h2>{{ id ? "活动信息" : "基本信息" }}</h2>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <label
                >活动标题 <span>*</span
                ><input
                  v-model="fields.title"
                  maxlength="100"
                  placeholder="活动名称"
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
                ><label v-if="!id" class="field checkbox-field"
                  ><input
                    v-model="fields.identityRequired"
                    type="checkbox"
                    :disabled="identityLocked"
                  />
                  {{
                    identityLocked
                      ? "核验身份证（已有名额占用，设置已锁定）"
                      : "核验身份证（仅必要时开启，须说明用途）"
                  }}</label
                >
                <label
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
                  placeholder="活动简介"
                /><small class="field-error">{{ errors.summary }}</small></label
              >
              <button
                v-if="id"
                type="button"
                class="secondary section-disclosure"
                aria-controls="activity-media-options"
                :aria-expanded="showMedia"
                @click="showMedia = !showMedia"
              >
                <AppIcon name="chevron-down" :size="16" /> 封面与图片
                <span
                  v-if="errors.coverUrl || errors.galleryUrls"
                  class="status-pill tone-danger"
                  >待修正</span
                >
              </button>
              <div v-show="!id || showMedia" id="activity-media-options">
                <div class="preset-heading">活动封面（上传）</div>
                <ImageUpload
                  label="上传活动封面"
                  :disabled="saving || readonly"
                  @uploaded="fields.coverUrl = $event"
                />
                <img
                  v-if="fields.coverUrl"
                  class="cover-preview"
                  :src="fields.coverUrl"
                  alt="封面预览"
                />
                <button
                  v-if="fields.coverUrl"
                  type="button"
                  class="text-button"
                  @click="fields.coverUrl = ''"
                >
                  移除封面
                </button>
                <small class="field-error">{{ errors.coverUrl }}</small>
                <div class="preset-heading">更多图片（可选，最多 8 张）</div>
                <div class="gallery-grid">
                  <div
                    v-for="(url, i) in fields.galleryUrls"
                    :key="i"
                    class="gallery-item"
                  >
                    <img :src="url" alt="更多图片" loading="lazy" />
                    <div class="action-row">
                      <button
                        type="button"
                        class="text-button"
                        :disabled="i === 0"
                        @click="moveGalleryImage(i, -1)"
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        class="text-button"
                        :disabled="i === fields.galleryUrls.length - 1"
                        @click="moveGalleryImage(i, 1)"
                      >
                        下移
                      </button>
                    </div>
                    <button
                      type="button"
                      class="gallery-remove"
                      :disabled="saving || readonly"
                      @click="fields.galleryUrls.splice(i, 1)"
                    >
                      移除
                    </button>
                  </div>
                  <ImageUpload
                    v-if="fields.galleryUrls.length < 8"
                    :key="`gallery-${fields.galleryUrls.length}`"
                    label="上传更多活动图片"
                    :disabled="saving || readonly"
                    @uploaded="fields.galleryUrls.push($event)"
                  />
                </div>
                <small class="field-error">{{ errors.galleryUrls }}</small>
              </div>
            </fieldset>
          </section>
          <section v-show="editSection === 'schedule'" class="form-section">
            <div class="section-title">
              <div>
                <h2>时间与地点</h2>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <div class="field-row">
                <DateTimeField
                  id="activity-start"
                  v-model="fields.startAt"
                  label="开始时间"
                  :presets="['09:00', '14:00', '19:00']"
                  :error="errors.startAt"
                  required
                />
                <DateTimeField
                  id="activity-end"
                  v-model="fields.endAt"
                  label="结束时间"
                  :presets="['12:00', '17:00', '21:00']"
                  :error="errors.endAt"
                  required
                />
              </div>
              <DateTimeField
                id="activity-deadline"
                v-model="fields.registrationDeadline"
                label="报名截止时间"
                :presets="['18:00', '20:00', '22:00']"
                :error="errors.registrationDeadline"
                required
              />
              <label
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
              <button
                v-if="id"
                type="button"
                class="secondary section-disclosure"
                aria-controls="activity-advanced-options"
                :aria-expanded="showAdvanced"
                @click="showAdvanced = !showAdvanced"
              >
                <AppIcon name="chevron-down" :size="16" /> 上车、导航与证件设置
                <span
                  v-if="errors.boardingPoints"
                  class="status-pill tone-danger"
                  >待修正</span
                >
              </button>
              <div v-show="!id || showAdvanced" id="activity-advanced-options">
                <label v-if="id" class="field checkbox-field"
                  ><input
                    v-model="fields.identityRequired"
                    type="checkbox"
                    :disabled="identityLocked"
                  />
                  {{
                    identityLocked
                      ? "核验身份证（已有名额占用，设置已锁定）"
                      : "核验身份证（仅必要时开启，须说明用途）"
                  }}</label
                >
                <BoardingPointsField
                  v-if="
                    (id ? showAdvanced : editSection === 'schedule') ||
                    addingBoardingPoint
                  "
                  v-model="fields.boardingPoints"
                  v-model:adding="addingBoardingPoint"
                  :disabled="saving"
                  :readonly="readonly"
                  :error="errors.boardingPoints"
                />
                <NavigationPointsField
                  v-if="
                    (id ? showAdvanced : editSection === 'schedule') ||
                    addingNavigationPoint
                  "
                  v-model="fields.navigationPoints"
                  v-model:adding="addingNavigationPoint"
                  :disabled="saving"
                  :location="fields.location"
                  :meeting-point="fields.meetingPoint"
                  :boarding-points="fields.boardingPoints"
                  @sync-boarding-points="fields.boardingPoints = $event"
                />
              </div>
            </fieldset>
          </section>
          <section v-show="editSection === 'detail'" class="form-section">
            <div class="section-title">
              <div>
                <h2>活动详情</h2>
              </div>
            </div>
            <fieldset :disabled="saving || readonly">
              <label
                >活动说明（纯文本） <span>*</span
                ><textarea
                  v-model="fields.description"
                  :rows="id ? 6 : 13"
                  maxlength="20000"
                  placeholder="填写行程、路线难度、装备及安全提示"
                /><small class="field-error">{{
                  errors.description
                }}</small></label
              >
            </fieldset>
            <div class="activity-content-entry">
              <div>
                <strong>图文详情</strong>
                <p>
                  {{
                    id
                      ? "编排行程文字、路线图片和表格。"
                      : "保存活动后，可添加图片和表格。"
                  }}
                </p>
              </div>
              <button
                v-if="id"
                type="button"
                class="secondary"
                :disabled="saving"
                @click="jumpToContent"
              >
                <AppIcon name="document" :size="16" />编辑图文详情
              </button>
            </div>
          </section>
          <section
            v-if="contentVisible && id && current && current.id === id"
            v-show="editSection === 'rich'"
            class="activity-rich-card"
            aria-labelledby="activity-rich-heading"
          >
            <header>
              <div>
                <h2 id="activity-rich-heading" tabindex="-1">图文详情</h2>
                <p>在页面内编辑行程、插入图片和表格，也可粘贴公众号排版。</p>
              </div>
              <button
                type="button"
                class="secondary"
                :disabled="
                  saving ||
                  readonly ||
                  !contentEditor?.ready ||
                  contentEditor.busy
                "
                @click="contentEditor?.openWechatPaste()"
              >
                <AppIcon name="document" :size="16" />粘贴公众号
              </button>
            </header>
            <MarkdownEditor
              :key="id"
              ref="contentEditor"
              :path="`/admin/activities/${encodeURIComponent(id)}/content/markdown`"
              :disabled="saving || readonly"
              :components="false"
              :height="620"
              placeholder="输入行程、路线和注意事项，可直接粘贴图片…"
              managed-navigation
              @saved="savedContentVersion = $event"
            />
            <footer class="activity-rich-footer">
              <span role="status">{{
                contentEditor?.dirty
                  ? "图文有未保存修改"
                  : savedContentVersion !== null
                    ? "图文已保存 · 版本 " + savedContentVersion
                    : "活动信息与图文分别保存"
              }}</span>
              <div class="footer-actions">
                <button
                  v-if="contentEditor?.versionConflict"
                  type="button"
                  class="secondary"
                  :disabled="contentEditor.busy"
                  @click="reloadContent"
                >
                  读取最新版本
                </button>
                <button
                  type="button"
                  class="primary"
                  :disabled="
                    saving ||
                    readonly ||
                    !contentEditor?.ready ||
                    !contentEditor.loaded ||
                    !contentEditor.dirty ||
                    contentEditor.busy ||
                    contentEditor.versionConflict
                  "
                  @click="contentEditor?.save()"
                >
                  保存图文
                </button>
              </div>
            </footer>
          </section>
        </div>
        <aside class="editor-aside">
          <section class="preview-card">
            <h2 v-if="id" class="preview-label">小程序活动卡片预览</h2>
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
              <h3>{{ fields.title || "活动名称" }}</h3>
              <p>
                {{ fields.summary || "活动简介" }}
              </p>
              <span
                ><AppIcon name="location" :size="14" />
                {{ fields.location || "目的地" }}</span
              >
            </div>
          </section>
          <div v-show="editSection !== 'rich'" class="editor-tip">
            <h2>报名价格</h2>
            <label
              >报名原价（元 / 人）<input
                v-model="priceYuan"
                aria-label="活动报名原价"
                inputmode="decimal"
                maxlength="10"
                :disabled="saving || conflict || !priceEditable"
            /></label>
            <p v-if="current">
              0
              元为免费活动。无报名记录时可自由切换免费/收费，收费活动可随时微调后续新报名价格；会员优惠按等级多人范围计算。
            </p>
            <button
              v-if="current && priceEditable"
              type="button"
              class="secondary"
              :disabled="saving || conflict || metadataDraftDirty"
              @click="savePrice"
            >
              保存报名价格
            </button>
            <p v-if="!current">0 元为免费报名。价格随草稿保存。</p>
            <RouterLink
              v-if="current && current.priceCents > 0"
              :to="{
                path: '/activity-orders',
                query: { activityId: current.id },
              }"
              >查看此活动订单</RouterLink
            >
            <RouterLink
              v-else-if="current"
              :to="'/activities/' + current.id + '/registrations'"
            >
              查看报名名单
            </RouterLink>
          </div>
        </aside>
      </div>
      <div v-show="editSection !== 'rich'" class="editor-actions">
        <span class="footer-status"
          >{{
            readonly
              ? "已取消的活动只读"
              : dirty
                ? "● 有尚未保存的修改"
                : "内容已保存"
          }}{{ current ? ` · 版本 ${current.version}` : "" }}</span
        >
        <div class="footer-actions">
          <button
            v-if="
              current?.status === 'CANCELLED' && current.registeredCount === 0
            "
            type="button"
            class="secondary"
            :disabled="saving || conflict"
            @click="reopenAsDraft"
          >
            转回草稿</button
          ><button
            v-if="current?.status === 'PUBLISHED'"
            type="button"
            class="danger-outline"
            :disabled="saving || conflict"
            @click="requestAction('cancel')"
          >
            取消活动</button
          ><button
            v-if="!readonly"
            :class="current?.status === 'DRAFT' ? 'secondary' : 'primary'"
            :disabled="saving || conflict || uncertainCreate"
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
            发布活动
          </button>
        </div>
      </div>
    </form>
  </main>
  <ActivityReopenModal
    :activity="reopenOpen ? current : null"
    @close="reopenOpen = false"
    @created="handleReopened"
  />
  <ConfirmDialog
    v-if="dialog"
    :busy="saving"
    :danger="dialog === 'cancel'"
    :title="dialog === 'publish' ? '发布这场活动？' : '确认取消这场活动？'"
    :description="
      dialog === 'publish'
        ? '发布后活动将出现在小程序，请再次确认报名价格、时间、地点和人数限制。'
        : '取消后将停止报名并生成活动取消消息，实际送达取决于订阅授权与服务。收费活动须先处理完待支付、已确认和退款中的订单。'
    "
    :confirm-label="dialog === 'publish' ? '确认发布' : '确认取消活动'"
    @confirm="confirmAction"
    @cancel="!saving && (dialog = null)"
  />
</template>
<style scoped>
.existing-activity {
  grid-template-columns: 166px minmax(0, 1fr) 236px;
  gap: 16px;
  align-items: start;
}
.existing-activity .editor-main,
.existing-activity .editor-aside {
  min-width: 0;
}
.existing-activity .editor-aside {
  display: grid;
  gap: 12px;
}
.existing-activity .editor-aside .editor-tip {
  margin-top: 0;
}
.activity-section-nav {
  position: sticky;
  top: 16px;
  padding: 12px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-surface);
}
.activity-section-nav h2 {
  margin: 0 0 10px;
  padding-inline: 8px;
  color: var(--rf-muted);
  font-size: 13px;
}
.activity-section-list {
  display: grid;
  gap: 4px;
}
.activity-section-list button {
  --button-border: transparent;
  --button-background: transparent;
  width: 100%;
  justify-content: flex-start;
  gap: 6px;
  padding-inline: 8px;
  white-space: normal;
  text-align: start;
}
.activity-section-list button[aria-pressed="true"] {
  --button-background: var(--rf-soft);
  --button-hover: var(--rf-soft);
  --button-color: var(--rf-primary-text);
  font-weight: 680;
}
.existing-activity .preview-card {
  display: block;
}
.preview-label {
  margin: 0;
  padding: 10px 12px;
  color: var(--rf-muted);
  font-size: 13px;
  font-weight: 600;
}
.existing-activity .activity-rich-card {
  margin: 0;
  padding: 16px;
}
@media (max-width: 1250px) {
  .existing-activity {
    grid-template-columns: 158px minmax(0, 1fr);
  }
  .existing-activity .editor-aside {
    grid-column: 2;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
    align-items: start;
  }
}
@media (max-width: 820px) {
  .existing-activity {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .existing-activity .editor-aside {
    grid-column: 1;
  }
  .activity-section-nav {
    position: static;
  }
  .activity-section-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .activity-section-list button {
    min-height: 40px;
  }
}

.section-disclosure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.section-disclosure[aria-expanded="true"] :deep(svg) {
  transform: rotate(180deg);
}

.activity-content-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--rf-line);
  border-radius: 8px;
  background: var(--rf-bg);
}
.activity-content-entry strong {
  font-size: 15px;
}
.activity-content-entry p {
  margin: 4px 0 0;
  color: var(--rf-muted);
  font-size: 13px;
}
.activity-content-entry button {
  display: flex;
  gap: 7px;
  align-items: center;
}
.activity-rich-card {
  min-width: 0;
  margin: 24px 0;
  padding: 24px;
  border-radius: 14px;
  background: var(--rf-surface);
  box-shadow: var(--rf-shadow-sm);
}
.activity-rich-card header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.activity-rich-card h2 {
  margin: 0;
  scroll-margin-block: 24px;
}
.activity-rich-card header p {
  margin: 6px 0 0;
  color: var(--rf-muted);
  font-size: 13px;
}
.activity-rich-footer {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  padding: 12px 14px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: #fffffff2;
  box-shadow: 0 10px 28px #183c2914;
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  color: var(--rf-muted);
  font-size: 13px;
}
.activity-rich-footer .footer-actions {
  margin: 0 0 0 auto;
}
@media (max-width: 720px) {
  .activity-rich-card {
    padding: 16px;
  }
  .activity-rich-footer {
    position: static;
  }
}
</style>
