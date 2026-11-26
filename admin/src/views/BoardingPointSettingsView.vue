<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { request, errorMessage } from "../api";
import { boardingName } from "../boarding";
import { askConfirm } from "../confirm";
import AppIcon from "../components/AppIcon.vue";
import NavigationMapPicker from "../components/NavigationMapPicker.vue";
import {
  coordinate,
  mapKey,
  parseLocalCoordinate,
  type MapPlace,
} from "../navigation-map";
import type { BoardingPointLocation } from "../types";

const path = "/admin/activity-boarding-point-locations";
const points = ref<BoardingPointLocation[]>([]);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const editing = ref(false);
const original = ref<BoardingPointLocation>();
const address = ref("");
const latitude = ref("");
const longitude = ref("");
const formError = ref("");
const addressInput = ref<HTMLInputElement>();
const pickerOpen = ref(false);
const pickerAvailable = Boolean(mapKey());
const coords = computed(() =>
  latitude.value.trim() && longitude.value.trim()
    ? coordinate(Number(longitude.value), Number(latitude.value))
    : null,
);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    points.value = await request<BoardingPointLocation[]>(path);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function open(row?: BoardingPointLocation) {
  original.value = row;
  address.value = row?.address || row?.name || "";
  latitude.value = row?.latitude?.toString() || "";
  longitude.value = row?.longitude?.toString() || "";
  formError.value = "";
  notice.value = "";
  editing.value = true;
  nextTick(() => addressInput.value?.focus());
}
function acceptPlace(place: MapPlace) {
  address.value = place.address || place.title;
  latitude.value = place.latitude.toFixed(6);
  longitude.value = place.longitude.toFixed(6);
  formError.value = "";
  pickerOpen.value = false;
}
async function manual() {
  pickerOpen.value = false;
  await nextTick();
  await nextTick();
  addressInput.value?.focus();
}
function paste(event: Event) {
  const field = event.target as HTMLInputElement;
  const pair = parseLocalCoordinate(field.value);
  if (!pair) {
    formError.value = "未识别到经纬度，请检查后重试或分别填写。";
    return;
  }
  latitude.value = pair.lat.toFixed(6);
  longitude.value = pair.lng.toFixed(6);
  formError.value = "";
  field.value = "";
}
async function save() {
  if (busy.value) return;
  const value = address.value.trim();
  if (!value) {
    formError.value = "请填写上车地址";
    return;
  }
  if (value.length > 300) {
    formError.value = "上车地址过长，请缩短后保存";
    return;
  }
  if (
    points.value.some(
      (row) =>
        row.name !== original.value?.name &&
        ((row.address || row.name) === value ||
          (!original.value && row.name === value)),
    )
  ) {
    formError.value = "该上车地址已存在";
    return;
  }
  if ((latitude.value.trim() || longitude.value.trim()) && !coords.value) {
    formError.value = "请填写有效的纬度和经度，或同时留空";
    return;
  }
  const body: BoardingPointLocation = {
    name:
      original.value?.name ||
      boardingName(
        value,
        points.value.map((p) => p.name),
      ),
    address: value,
    latitude: coords.value?.latitude ?? null,
    longitude: coords.value?.longitude ?? null,
  };
  busy.value = true;
  formError.value = "";
  try {
    const saved = await request<BoardingPointLocation>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    points.value = [
      ...points.value.filter((row) => row.name !== saved.name),
      saved,
    ].sort((a, b) =>
      (a.address || a.name).localeCompare(b.address || b.name, "zh-CN"),
    );
    editing.value = false;
    notice.value = "上车点已保存";
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove(row: BoardingPointLocation) {
  if (
    busy.value ||
    !(await askConfirm({
      title: "删除上车点",
      description:
        "删除「" +
        (row.address || row.name) +
        "」后，新活动将无法选用该地址。已保存的活动保留原上车安排。",
      confirmLabel: "删除",
      danger: true,
    }))
  )
    return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await request(path + "?name=" + encodeURIComponent(row.name), {
      method: "DELETE",
    });
    points.value = points.value.filter((item) => item.name !== row.name);
    notice.value = "上车点已删除";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <main class="workspace">
    <header class="page-heading">
      <h1>上车点设置</h1>
      <button
        class="primary"
        :disabled="editing || loading || busy || !!error"
        @click="open()"
      >
        <AppIcon name="plus" />新增上车点
      </button>
    </header>
    <p v-if="notice" role="status" class="success-box">{{ notice }}</p>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <form v-if="editing" class="panel stop-editor" @submit.prevent="save">
      <h2>{{ original ? "编辑上车点" : "新增上车点" }}</h2>
      <label
        >上车地址<input
          ref="addressInput"
          v-model="address"
          maxlength="300"
          placeholder="填写详细上车地址"
          :disabled="busy"
      /></label>
      <div class="map-entry">
        <button
          type="button"
          class="secondary"
          :disabled="!pickerAvailable || busy"
          @click="pickerOpen = true"
        >
          <AppIcon name="location" :size="16" />地图选点
        </button>
        <small class="field-hint" v-if="pickerAvailable"
          >地点搜索每天 200 次，关键词提示和地址反查各每天 6,000
          次，每项每秒最多 5 次。配额用完后可手工输入。</small
        >
        <small class="field-hint" v-else
          >后台地图尚未配置，可手工填写地址和经纬度。</small
        >
      </div>
      <label
        >粘贴经纬度<input
          placeholder="例如 24.5011, 118.1266"
          :disabled="busy"
          @change="paste"
      /></label>
      <div class="field-row">
        <label
          >纬度（GCJ-02）<input
            v-model="latitude"
            inputmode="decimal"
            placeholder="如 24.501111"
            :disabled="busy"
        /></label>
        <label
          >经度（GCJ-02）<input
            v-model="longitude"
            inputmode="decimal"
            placeholder="如 118.126666"
            :disabled="busy"
        /></label>
      </div>
      <small class="field-hint"
        >填写坐标后可直接导航，只填写地址时可复制地址。</small
      >
      <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      <div class="action-row">
        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="editing = false"
        >
          取消
        </button>
        <button class="primary" :disabled="busy">
          {{ busy ? "正在保存…" : "保存上车点" }}
        </button>
      </div>
    </form>
    <NavigationMapPicker
      v-if="pickerOpen"
      :initial="coords ?? undefined"
      @close="pickerOpen = false"
      @manual="manual"
      @select="acceptPlace"
    />
    <p v-if="loading" role="status">正在加载上车点…</p>
    <p v-else-if="!points.length && !editing && !error" class="field-hint">
      暂无上车点，添加后即可在活动中选用。
    </p>
    <ul v-if="points.length" class="stop-list" aria-label="已设置的上车地址">
      <li v-for="row in points" :key="row.name">
        <span>{{ row.address || row.name }}</span>
        <div class="action-row">
          <button
            class="text-button"
            :disabled="busy || editing"
            @click="open(row)"
          >
            编辑
          </button>
          <button
            class="text-button danger-text"
            :disabled="busy || editing"
            @click="remove(row)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
  </main>
</template>
<style scoped>
.stop-editor {
  display: grid;
  gap: 12px;
  padding: 20px;
  max-width: 760px;
}
.stop-editor h2 {
  margin: 0;
  font-size: 18px;
}
.stop-editor label {
  margin: 0;
}
.map-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.stop-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.stop-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--rf-line);
  overflow-wrap: anywhere;
}
.stop-list .action-row {
  flex-shrink: 0;
}
.danger-text {
  color: var(--rf-danger);
}
</style>
