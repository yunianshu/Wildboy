<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import FormModal from "./FormModal.vue";
import {
  mapKey,
  pickerOrigin,
  pickerUrl,
  readSelection,
  type Coordinate,
  type MapPlace,
} from "../navigation-map";

const props = defineProps<{
  title: string;
  initial?: Coordinate;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; confirm: [place: MapPlace]; reselect: [] }>();
const pending = ref<MapPlace>();
const confirmButton = ref<HTMLButtonElement>();
const frame = ref<HTMLIFrameElement>();
const url = mapKey() ? pickerUrl(props.initial) : null;

function receiveSelection(event: MessageEvent<unknown>) {
  // The provider posts after the user confirms a location inside the map.
  if (
    props.busy ||
    (event.origin !== pickerOrigin &&
      event.origin !== "https://mapapi.qq.com") ||
    !frame.value?.contentWindow ||
    event.source !== frame.value.contentWindow
  )
    return;
  const place = readSelection(event.data);
  if (!place || (!place.title && !place.address)) return;
  emit("reselect");
  pending.value = place;
  void nextTick(() => confirmButton.value?.focus({ preventScroll: true }));
}

function confirmSelection() {
  if (!props.busy && pending.value) emit("confirm", pending.value);
}

function reselect() {
  if (props.busy) return;
  pending.value = undefined;
  emit("reselect");
  void nextTick(() => frame.value?.focus({ preventScroll: true }));
}

onMounted(() => window.addEventListener("message", receiveSelection));
onUnmounted(() => window.removeEventListener("message", receiveSelection));
</script>

<template>
  <FormModal
    class="map-picker-backdrop"
    size="lg"
    :title="title"
    :busy="busy"
    @close="emit('close')"
  >
    <p v-if="!url" class="error-box" role="alert">
      地图选址尚未配置，暂时无法选择地址。
    </p>
    <template v-else>
      <p v-if="error" class="field-error picker-error" role="alert">
        {{ error }}
      </p>
      <p v-if="busy" class="picker-status" role="status">正在保存上车点…</p>
      <div class="picker-surface" :inert="busy">
        <iframe
          ref="frame"
          title="选择上车地址"
          class="map-picker-frame"
          :src="url"
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div class="picker-footer">
        <div v-if="pending" class="picker-selection" aria-label="已选上车点">
          <strong>{{ pending.title || pending.address }}</strong>
          <p v-if="pending.address && pending.address !== pending.title">{{ pending.address }}</p>
        </div>
        <div class="picker-actions">
          <button v-if="pending" type="button" class="secondary" :disabled="busy" @click="reselect">取消选中</button>
          <button ref="confirmButton" type="button" class="primary" :disabled="busy || !pending" @click="confirmSelection">
            保存
          </button>
        </div>
      </div>
    </template>
  </FormModal>
</template>

<style scoped>
.picker-surface {
  overflow: hidden;
  border-radius: var(--rf-control-radius);
  background: var(--rf-soft);
}
.map-picker-frame {
  display: block;
  width: 100%;
  height: clamp(260px, 56dvh, 520px);
  border: 0;
}
.picker-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px 16px;
  padding-top: 12px;
}
.picker-selection {
  display: grid;
  flex: 1 1 200px;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.picker-selection p {
  margin: 0;
  color: var(--rf-muted);
}
.picker-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-inline-start: auto;
}
.picker-error,
.picker-status {
  margin: 0 0 8px;
}
</style>
