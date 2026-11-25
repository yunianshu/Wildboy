<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { currentUser, errorMessage, request } from "../api";
import { maxBoardingPointLength, maxBoardingPoints } from "../forms";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  disabled: boolean;
  readonly: boolean;
  error?: string;
}>();
const selected = defineModel<string[]>({ required: true });
const adding = defineModel<boolean>("adding", { required: true });
const path = "/admin/activity-boarding-points";
const options = ref<string[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const saving = ref(false);
const saveError = ref("");
const name = ref("");
const nameInput = ref<HTMLInputElement>();
const addButton = ref<HTMLButtonElement>();
const trimmedName = computed(() => name.value.trim());
const full = computed(() => selected.value.length >= maxBoardingPoints);
const disabled = computed(
  () => props.disabled || props.readonly || saving.value,
);
const available = computed(() =>
  options.value.filter((point) => !selected.value.includes(point)),
);
const placeholder = computed(() => {
  if (full.value) return `已选满 ${maxBoardingPoints} 个上车地点`;
  if (loading.value) return "正在加载已有地点…";
  if (available.value.length) return "选择已有地点";
  if (loadFailed.value) return "已有地点加载失败";
  return options.value.length ? "已选完已有地点" : "暂无已保存的地点";
});
const lookup = new AbortController();
let alive = true;

async function load() {
  const actor = currentUser.value;
  loading.value = true;
  loadFailed.value = false;
  try {
    const names = await request<string[]>(path, { signal: lookup.signal });
    if (alive && actor === currentUser.value) {
      options.value = [...new Set([...names, ...options.value])];
    }
  } catch {
    if (alive && actor === currentUser.value) loadFailed.value = true;
  } finally {
    if (alive) loading.value = false;
  }
}

function selectPoint(point: string) {
  if (point && !full.value && !selected.value.includes(point)) {
    selected.value = [...selected.value, point];
  }
}
function choose(event: Event) {
  const select = event.target as HTMLSelectElement;
  selectPoint(select.value);
  select.value = "";
}
function openAdd() {
  adding.value = true;
  void nextTick(() => nameInput.value?.focus());
}
function closeAdd() {
  adding.value = false;
  name.value = "";
  saveError.value = "";
  void nextTick(() => addButton.value?.focus());
}
async function savePoint() {
  if (disabled.value || full.value || !trimmedName.value) return;
  const actor = currentUser.value;
  saving.value = true;
  saveError.value = "";
  try {
    const point = await request<{ name: string }>(path, {
      method: "POST",
      body: JSON.stringify({ name: trimmedName.value }),
    });
    if (!alive || actor !== currentUser.value) return;
    if (!options.value.includes(point.name)) options.value.push(point.name);
    selectPoint(point.name);
    closeAdd();
  } catch (error) {
    if (alive && actor === currentUser.value)
      saveError.value = errorMessage(error);
  } finally {
    if (alive) saving.value = false;
  }
}
function handleEnter(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  void savePoint();
}

onMounted(() => {
  if (!props.readonly) void load();
});
onUnmounted(() => {
  alive = false;
  lookup.abort();
  if (adding.value) adding.value = false;
});
</script>

<template>
  <fieldset class="boarding-points">
    <legend>上车地点</legend>
    <ul
      v-if="selected.length"
      class="selected-points"
      aria-label="已选上车地点"
    >
      <li v-for="point in selected" :key="point">
        <span>{{ point }}</span>
        <button
          v-if="!readonly"
          class="text-button"
          type="button"
          :aria-label="`移除上车地点 ${point}`"
          :disabled="disabled"
          @click="selected = selected.filter((name) => name !== point)"
        >
          <AppIcon name="close" :size="16" />
        </button>
      </li>
    </ul>
    <small v-else-if="readonly" class="field-hint">未设置上车地点</small>
    <template v-if="!readonly">
      <div class="point-controls">
        <select
          aria-label="选择已有上车地点"
          :disabled="disabled || adding || full || loading || !available.length"
          @change="choose"
        >
          <option value="" selected disabled>{{ placeholder }}</option>
          <option v-for="point in available" :key="point" :value="point">
            {{ point }}
          </option>
        </select>
        <button
          ref="addButton"
          type="button"
          class="secondary"
          :aria-expanded="adding"
          :disabled="disabled || adding || full"
          @click="openAdd"
        >
          新增地点
        </button>
      </div>
      <div v-if="loadFailed" class="point-load-error">
        <small class="field-error" role="alert">无法加载地点列表。</small>
        <button class="text-button" type="button" @click="load">重试</button>
      </div>
      <div v-if="adding" class="new-point">
        <label>
          新地点名称
          <input
            ref="nameInput"
            v-model="name"
            type="text"
            :maxlength="maxBoardingPointLength"
            :disabled="disabled"
            @keydown.enter="handleEnter"
          />
        </label>
        <p v-if="saveError" class="field-error" role="alert">{{ saveError }}</p>
        <small class="field-hint">保存后可在其他活动中选用。</small>
        <div class="point-actions">
          <button
            class="secondary"
            type="button"
            :disabled="disabled"
            @click="closeAdd"
          >
            取消
          </button>
          <button
            class="primary"
            type="button"
            :disabled="disabled || full || !trimmedName"
            @click="savePoint"
          >
            {{ saving ? "正在保存…" : "保存地点" }}
          </button>
        </div>
      </div>
      <small class="field-hint"
        >可选择多个地点，报名时每位参与人选择一处。</small
      >
    </template>
    <small v-if="error" class="field-error" role="alert">{{ error }}</small>
  </fieldset>
</template>

<style scoped>
.boarding-points {
  min-width: 0;
}
.boarding-points legend {
  margin-bottom: 6px;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
}
.selected-points {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.selected-points li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px 2px 10px;
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
  background: var(--rf-neutral-bg);
  overflow-wrap: anywhere;
  font-size: 13px;
}
.selected-points button {
  flex-shrink: 0;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
}
.point-controls,
.point-load-error,
.point-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.point-controls select {
  min-width: 0;
}
.point-controls button {
  flex-shrink: 0;
}
.new-point {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
}
.new-point label {
  margin: 0;
}
.boarding-points .field-hint {
  font-size: 12px;
}
.point-actions {
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
