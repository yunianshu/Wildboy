<script setup lang="ts">
import { onMounted, ref } from "vue";
import { request, errorMessage } from "../api";
import { boardingName } from "../boarding";
import { askConfirm } from "../confirm";
import AppIcon from "../components/AppIcon.vue";
import NavigationMapPicker from "../components/NavigationMapPicker.vue";
import { coordinate, type MapPlace } from "../navigation-map";
import type { BoardingPointLocation } from "../types";

const path = "/admin/activity-boarding-point-locations";
const points = ref<BoardingPointLocation[]>([]);
const loading = ref(true);
const busy = ref(false);
const loadError = ref("");
const actionError = ref("");
const notice = ref("");
const pickerOpen = ref(false);
const original = ref<BoardingPointLocation>();

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    points.value = await request<BoardingPointLocation[]>(path);
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function open(row?: BoardingPointLocation) {
  original.value = row;
  actionError.value = notice.value = "";
  pickerOpen.value = true;
}
function displayName(row: BoardingPointLocation) {
  return row.displayName?.trim() || row.address || row.name;
}
function close() {
  if (!busy.value) {
    pickerOpen.value = false;
    actionError.value = "";
  }
}

async function save(place: MapPlace) {
  if (busy.value || !pickerOpen.value) return;
  const address = place.address || place.title;
  if (!address) {
    actionError.value = "未获取到上车地址。";
    return;
  }
  const name =
    original.value?.name ||
    boardingName(
      address,
      points.value.map((row) => row.name),
    );
  if (
    points.value.some(
      (row) =>
        row.name !== original.value?.name &&
        (row.name === name || (row.address || row.name) === address),
    )
  ) {
    actionError.value = "这个上车地址已存在。";
    return;
  }
  busy.value = true;
  actionError.value = "";
  try {
    const saved = await request<BoardingPointLocation>(path, {
      method: "POST",
      body: JSON.stringify({
        name,
        displayName: place.title === address ? "" : place.title,
        address,
        latitude: place.latitude,
        longitude: place.longitude,
      } satisfies BoardingPointLocation),
    });
    points.value = [
      ...points.value.filter((row) => row.name !== saved.name),
      saved,
    ].sort((a, b) =>
      (a.address || a.name).localeCompare(b.address || b.name, "zh-CN"),
    );
    pickerOpen.value = false;
    notice.value = "上车点已保存";
  } catch (e) {
    actionError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove(row: BoardingPointLocation) {
  if (
    busy.value ||
    !(await askConfirm({
      title: "删除上车点",
      description: "删除后，新活动将无法选用该地址，已保存的活动保留原上车点。",
      confirmLabel: "删除",
      danger: true,
    }))
  )
    return;
  busy.value = true;
  actionError.value = notice.value = "";
  try {
    await request(path + "?name=" + encodeURIComponent(row.name), {
      method: "DELETE",
    });
    points.value = points.value.filter((item) => item.name !== row.name);
    notice.value = "上车点已删除";
  } catch (e) {
    actionError.value = errorMessage(e);
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
        type="button"
        class="primary"
        :disabled="pickerOpen || loading || busy || !!loadError"
        @click="open()"
      >
        <AppIcon name="plus" :size="16" />新增上车点
      </button>
    </header>
    <p v-if="notice" role="status" class="success-box">{{ notice }}</p>
    <p v-if="loadError" role="alert" class="error-box">
      {{ loadError }}
      <button type="button" class="text-button" @click="load">重试</button>
    </p>
    <p v-if="actionError && !pickerOpen" role="alert" class="error-box">
      {{ actionError }}
    </p>
    <p v-if="loading" role="status">正在加载上车点…</p>
    <p v-else-if="!points.length && !loadError" class="stop-empty">
      暂无上车点
    </p>
    <ul v-if="points.length" class="stop-list" aria-label="上车点">
      <li v-for="row in points" :key="row.name">
        <div class="stop-address">
          <AppIcon name="location" :size="18" />
          <div class="stop-label">
            <span class="stop-name">{{ displayName(row) }}</span>
            <span v-if="row.address && row.address !== displayName(row)" class="stop-detail">
              {{ row.address }}
            </span>
          </div>
        </div>
        <div class="stop-actions">
          <button
            type="button"
            class="text-button"
            :disabled="busy || pickerOpen || loading || !!loadError"
            @click="open(row)"
          >
            编辑
          </button>
          <button
            type="button"
            class="text-button danger-text"
            :disabled="busy || pickerOpen || loading || !!loadError"
            @click="remove(row)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
    <NavigationMapPicker
      v-if="pickerOpen"
      :title="original ? '编辑上车点' : '新增上车点'"
      :initial="
        coordinate(original?.longitude, original?.latitude) ?? undefined
      "
      :busy="busy"
      :error="actionError"
      @close="close"
      @confirm="save"
      @reselect="actionError = ''"
    />
  </main>
</template>

<style scoped>
.stop-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.stop-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--rf-line);
}
.stop-address {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: min(180px, 100%);
  flex: 1;
  padding-block: 8px;
  overflow-wrap: anywhere;
}
.stop-address :deep(svg) {
  flex-shrink: 0;
  color: var(--rf-muted);
}
.stop-label {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.stop-name {
  font-weight: 600;
}
.stop-detail {
  color: var(--rf-muted);
  font-size: 0.875em;
}
.stop-actions {
  display: flex;
  gap: 4px;
  margin-inline-start: auto;
}
.stop-actions .text-button {
  min-height: 44px;
}
.stop-empty {
  padding-block: 20px;
  color: var(--rf-muted);
}
.danger-text {
  color: var(--rf-danger);
}
</style>
