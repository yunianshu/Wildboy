<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { errorMessage, request } from "../api";
import { fromShanghaiInput, toShanghaiInput } from "../forms";
import type { Activity } from "../types";
import DateTimeField from "./DateTimeField.vue";
import FormModal from "./FormModal.vue";

const props = defineProps<{
  activity: Activity | null;
}>();

const emit = defineEmits<{
  close: [];
  created: [activity: Activity];
}>();

const nextStart = ref("");
const publishImmediately = ref(false);
const saving = ref(false);
const error = ref("");
const pendingRequests = new Map<string, string>();

watch(
  () => props.activity,
  (act) => {
    if (!act) return;
    error.value = "";
    saving.value = false;
    publishImmediately.value = false;
    // Keep the original weekday and allow enough time before registration closes.
    const origMs = Date.parse(act.startAt);
    const nowMs = Date.now();
    const week = 7 * 86400_000;
    const lead =
      Math.max(0, origMs - Date.parse(act.registrationDeadline)) || 0;
    let candidate = Number.isFinite(origMs) ? origMs : nowMs + week;
    while (candidate <= nowMs + Math.max(lead, 3600_000)) {
      candidate += week;
    }
    nextStart.value = toShanghaiInput(new Date(candidate).toISOString());
  },
  { immediate: true },
);

const previewSchedule = computed(() => {
  if (!props.activity || !nextStart.value) return null;
  const iso = fromShanghaiInput(nextStart.value);
  if (!iso) return null;
  const startMs = Date.parse(iso);
  const origStart = Date.parse(props.activity.startAt);
  const origEnd = Date.parse(props.activity.endAt);
  const origDeadline = Date.parse(props.activity.registrationDeadline);
  const durationMs = origEnd - origStart;
  const leadMs = Math.max(0, origStart - origDeadline);
  if (!Number.isFinite(durationMs) || !Number.isFinite(leadMs)) return null;
  return {
    endText: toShanghaiInput(
      new Date(startMs + durationMs).toISOString(),
    ).replace("T", " "),
    deadlineText: toShanghaiInput(
      new Date(startMs - leadMs).toISOString(),
    ).replace("T", " "),
  };
});

async function submit() {
  const activity = props.activity;
  if (!activity || saving.value) return;
  const iso = fromShanghaiInput(nextStart.value);
  const publish = publishImmediately.value;
  const intent = JSON.stringify([activity.id, iso, publish]);
  const pendingRequestId = pendingRequests.get(intent);
  if (!iso || (!pendingRequestId && Date.parse(iso) <= Date.now())) {
    error.value = "请选择未来的新出发时间";
    return;
  }
  saving.value = true;
  error.value = "";
  const requestId =
    pendingRequestId ??
    globalThis.crypto?.randomUUID?.() ??
    `reopen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pendingRequests.set(intent, requestId);
  try {
    const created = await request<Activity>(
      `/admin/activities/${encodeURIComponent(activity.id)}/copy`,
      {
        method: "POST",
        body: JSON.stringify({
          startAt: iso,
          requestId,
          version: activity.version,
          publishImmediately: publish,
        }),
      },
    );
    pendingRequests.delete(intent);
    emit("created", created);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <FormModal v-if="activity" :busy="saving" @close="!saving && emit('close')">
    <div class="reopen-modal">
      <h2>复制活动</h2>
      <p class="muted">
        沿用「{{ activity.title }}」的图文、地点和价格。新一期单独接收报名。
      </p>
      <p v-if="error" role="alert" class="error-box">{{ error }}</p>
      <fieldset class="copy-schedule-field" :disabled="saving">
        <DateTimeField
          id="reopen-start-at"
          v-model="nextStart"
          label="新一期开始时间"
          :presets="['08:00', '09:00', '14:00']"
          required
        />
      </fieldset>
      <div v-if="previewSchedule" class="schedule-preview">
        <span>自动推算结束时间：{{ previewSchedule.endText }}</span>
        <span>自动推算报名截止：{{ previewSchedule.deadlineText }}</span>
      </div>
      <label class="field checkbox-field">
        <input
          v-model="publishImmediately"
          type="checkbox"
          :disabled="saving"
        />
        立即发布新一期
      </label>
      <div class="dialog-actions">
        <button
          type="button"
          class="secondary"
          :disabled="saving"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="primary"
          :disabled="saving"
          @click="submit"
        >
          {{
            saving
              ? "正在生成…"
              : publishImmediately
                ? "重开并立即发布"
                : "保存草稿并编辑"
          }}
        </button>
      </div>
    </div>
  </FormModal>
</template>

<style scoped>
.reopen-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.reopen-modal h2 {
  margin: 0;
  font-size: 18px;
}
.copy-schedule-field {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.schedule-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--rf-soft, #eaf4e7);
  color: var(--rf-primary-text, #1f5c3f);
  font-size: 12px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
</style>
