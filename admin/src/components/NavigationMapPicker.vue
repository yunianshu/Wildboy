<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import FormModal from "./FormModal.vue";
import {
  pickerOrigin,
  pickerUrl,
  readSelection,
  type Coordinate,
  type MapPlace,
} from "../navigation-map";

const props = defineProps<{ initial?: Coordinate }>();
const emit = defineEmits<{ close: []; manual: []; select: [place: MapPlace] }>();
const frame = ref<HTMLIFrameElement>();
const url = pickerUrl(props.initial);

function receiveSelection(event: MessageEvent<unknown>) {
  // Tencent can serve the picker directly or redirect it to mapapi.qq.com.
  if (
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
  <FormModal size="xl" title="腾讯地图选点" @close="emit('close')">
    <p class="field-hint map-picker-hint">
      如果提示配额用完、查询失败或地图无法加载，请改用手工输入，填写地点名称、地址和经纬度。
    </p>
    <iframe
      ref="frame"
      class="map-picker-frame"
      title="腾讯地图地点搜索与选点"
      :src="url"
      referrerpolicy="strict-origin-when-cross-origin"
    />
    <template #footer>
      <button type="button" class="secondary" @click="emit('manual')">
        手工输入
      </button>
    </template>
  </FormModal>
</template>

<style scoped>
.map-picker-hint {
  margin: 0 0 8px;
}

.map-picker-frame {
  display: block;
  width: 100%;
  height: clamp(235px, 57dvh, 550px);
  border: 0;
}
</style>
