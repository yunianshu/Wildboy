<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
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
const emit = defineEmits<{ close: []; select: [place: MapPlace] }>();
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
  if (place) emit("select", place);
}

onMounted(() => window.addEventListener("message", receiveSelection));
onUnmounted(() => window.removeEventListener("message", receiveSelection));
</script>

<template>
  <FormModal size="lg" :title="title" :busy="busy" @close="emit('close')">
    <p v-if="!url" class="error-box" role="alert">
      地图选址尚未配置，暂时无法选择地址。
    </p>
    <template v-else>
      <p v-if="error" class="field-error picker-error" role="alert">
        {{ error }} 可在地图中重新确认。
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
  height: clamp(290px, 62dvh, 564px);
  border: 0;
}
.picker-error,
.picker-status {
  margin: 0 0 8px;
}
</style>
