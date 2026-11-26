<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { request } from "../api";
import AppIcon from "./AppIcon.vue";
import NavigationMapPicker from "./NavigationMapPicker.vue";
import {
  coordinate,
  mapKey,
  type Coordinate,
  type MapPlace,
} from "../navigation-map";
import type {
  BoardingPointLocation,
  NavigationPoint,
  NavigationPointKind,
} from "../types";

const props = defineProps<{
  disabled?: boolean;
  location?: string;
  meetingPoint?: string;
  boardingPoints?: string[];
}>();

const points = defineModel<NavigationPoint[]>({ required: true });
const emit = defineEmits<{
  syncBoardingPoints: [names: string[]];
}>();

const kindLabels: Record<NavigationPointKind, string> = {
  DESTINATION: "活动目的地",
  MEETING: "集合地点",
  BOARDING: "上车地点",
};

const adding = defineModel<boolean>("adding", { default: false });
const draftKind = ref<NavigationPointKind>("MEETING");
const draftLabel = ref("");
const draftAddress = ref("");
const draftLat = ref("");
const draftLng = ref("");
const draftError = ref("");
const savedLocations = ref<BoardingPointLocation[]>([]);
const loadedCatalog = ref(false);
const dragIndex = ref<number | null>(null);
const pickerAvailable = Boolean(mapKey());
const pickerOpen = ref(false);
const pickerInitial = ref<Coordinate>();
const draftNameInput = ref<HTMLInputElement>();

function openMapPicker(event: MouseEvent) {
  if (!adding.value || props.disabled || !pickerAvailable) return;
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  pickerInitial.value =
    (draftLat.value.trim() && draftLng.value.trim()
      ? coordinate(Number(draftLng.value), Number(draftLat.value))
      : null) ?? undefined;
  pickerOpen.value = true;
}

function acceptMapPlace(place: MapPlace) {
  if (!pickerOpen.value || !adding.value || props.disabled) return;
  if (!draftLabel.value.trim()) draftLabel.value = place.title;
  draftAddress.value = place.address;
  draftLat.value = place.latitude.toFixed(6);
  draftLng.value = place.longitude.toFixed(6);
  draftError.value = "";
  pickerOpen.value = false;
}

async function enterManually() {
  pickerOpen.value = false;
  await nextTick();
  // Let FormModal restore focus before moving it to the draft.
  await nextTick();
  draftNameInput.value?.focus();
}

function pasteCoordinates(event: Event) {
  const parsed = parseLocalCoordinate((event.target as HTMLInputElement).value);
  if (!parsed) {
    draftError.value = "未识别到经纬度，请检查后重试或分别填写。";
    return;
  }
  draftLat.value = parsed.lat.toFixed(6);
  draftLng.value = parsed.lng.toFixed(6);
  draftError.value = "";
  (event.target as HTMLInputElement).value = "";
}

function parseLocalCoordinate(
  raw: string,
): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;
  const latParam = text.match(/(?:lat|latitude)=?(-?\d{1,3}\.\d{3,10})/i);
  const lngParam = text.match(/(?:lng|lon|longitude)=?(-?\d{1,3}\.\d{3,10})/i);
  if (latParam && lngParam) {
    const lat = Number(latParam[1]);
    const lng = Number(lngParam[1]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  const pair = text.match(
    /(-?\d{1,3}\.\d{3,10})\s*[,，\s]\s*(-?\d{1,3}\.\d{3,10})/,
  );
  if (pair) {
    const a = Number(pair[1]);
    const b = Number(pair[2]);
    if (Math.abs(a) > 90 && Math.abs(b) <= 90 && Math.abs(a) <= 180)
      return { lat: b, lng: a };
    if (a >= 70 && a <= 138 && b >= 3 && b <= 55) return { lat: b, lng: a };
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  }
  return null;
}

async function ensureCatalog() {
  if (loadedCatalog.value) return;
  loadedCatalog.value = true;
  try {
    savedLocations.value = await request<BoardingPointLocation[]>(
      "/admin/activity-boarding-point-locations",
    );
  } catch {
    // Non-fatal fallback
  }
}

function openAdd(kind: NavigationPointKind = "MEETING") {
  adding.value = true;
  draftKind.value = kind;
  draftLabel.value =
    kind === "DESTINATION"
      ? props.location?.trim() || ""
      : kind === "MEETING"
        ? props.meetingPoint?.trim() || ""
        : "";
  draftAddress.value = "";
  draftLat.value = "";
  draftLng.value = "";
  draftError.value = "";
  void ensureCatalog();
}

function closeAdd() {
  pickerOpen.value = false;
  adding.value = false;
  draftError.value = "";
}

function applySavedLocation(event: Event) {
  const select = event.target as HTMLSelectElement;
  const found = savedLocations.value.find((item) => item.name === select.value);
  select.value = "";
  if (!found) return;
  draftKind.value = "BOARDING";
  draftLabel.value = found.name;
  draftAddress.value = found.address || "";
  draftLat.value = found.latitude != null ? String(found.latitude) : "";
  draftLng.value = found.longitude != null ? String(found.longitude) : "";
}

const formError = computed(() => {
  if (!draftLabel.value.trim()) return "请填写导航点名称";
  const hasLat = draftLat.value.trim() !== "";
  const hasLng = draftLng.value.trim() !== "";
  if (hasLat !== hasLng) return "纬度与经度请同时填写或同时留空";
  if (hasLat) {
    const lat = Number(draftLat.value);
    const lng = Number(draftLng.value);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return "纬度需在 -90 到 90 之间";
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      return "经度需在 -180 到 180 之间";
  }
  return "";
});

function commitDraft() {
  if (formError.value) {
    draftError.value = formError.value;
    return;
  }
  const lat = draftLat.value.trim() ? Number(draftLat.value) : null;
  const lng = draftLng.value.trim() ? Number(draftLng.value) : null;
  const entry: NavigationPoint = {
    id: `nav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: draftKind.value,
    label: draftLabel.value.trim(),
    address: draftAddress.value.trim(),
    latitude: lat,
    longitude: lng,
  };
  const next = [...points.value, entry];
  points.value = next;
  if (entry.kind === "BOARDING") {
    const currentBoarding = props.boardingPoints ?? [];
    if (!currentBoarding.includes(entry.label)) {
      emit("syncBoardingPoints", [...currentBoarding, entry.label]);
    }
  }
  closeAdd();
}

async function importFromFields() {
  await ensureCatalog();
  const next = [...points.value];
  const exists = (kind: NavigationPointKind, label: string) =>
    next.some((p) => p.kind === kind && p.label === label);
  const dest = props.location?.trim();
  if (dest && !exists("DESTINATION", dest)) {
    next.push({
      id: `nav-dest-${Date.now()}`,
      kind: "DESTINATION",
      label: dest,
      address: dest,
      latitude: null,
      longitude: null,
    });
  }
  const meet = props.meetingPoint?.trim();
  if (meet && !exists("MEETING", meet)) {
    next.push({
      id: `nav-meet-${Date.now()}`,
      kind: "MEETING",
      label: meet,
      address: meet,
      latitude: null,
      longitude: null,
    });
  }
  for (const bp of props.boardingPoints ?? []) {
    const clean = bp.trim();
    if (clean && !exists("BOARDING", clean)) {
      const saved = savedLocations.value.find((s) => s.name === clean);
      next.push({
        id: `nav-bp-${Math.random().toString(36).slice(2, 8)}`,
        kind: "BOARDING",
        label: clean,
        address: saved?.address || clean,
        latitude: saved?.latitude ?? null,
        longitude: saved?.longitude ?? null,
      });
    }
  }
  points.value = next;
}

function movePoint(index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= points.value.length) return;
  const copy = [...points.value];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  points.value = copy;
}

function removePoint(index: number) {
  const copy = [...points.value];
  copy.splice(index, 1);
  points.value = copy;
}

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDrop(targetIndex: number) {
  if (dragIndex.value === null || dragIndex.value === targetIndex) {
    dragIndex.value = null;
    return;
  }
  const copy = [...points.value];
  const [moved] = copy.splice(dragIndex.value, 1);
  if (moved) copy.splice(targetIndex, 0, moved);
  points.value = copy;
  dragIndex.value = null;
}

function quickFillCoord(index: number, raw: string) {
  const parsed = parseLocalCoordinate(raw);
  if (!parsed) return;
  const copy = [...points.value];
  const current = copy[index];
  if (!current) return;
  copy[index] = {
    ...current,
    latitude: Number(parsed.lat.toFixed(6)),
    longitude: Number(parsed.lng.toFixed(6)),
  };
  points.value = copy;
}
</script>

<template>
  <fieldset class="nav-points-box" :disabled="disabled">
    <legend>地图导航</legend>
    <div class="nav-toolbar">
      <button type="button" class="secondary" @click="openAdd('MEETING')">
        <AppIcon name="location" :size="15" /> 添加导航点
      </button>
      <button type="button" class="secondary" @click="importFromFields">
        从上方地点一键导入
      </button>
      <small class="field-hint">
        配置经纬度后，小程序可直接打开地图。多个导航点可排序和切换。
      </small>
    </div>

    <ul v-if="points.length" class="nav-list" aria-label="已配置导航地点">
      <li
        v-for="(pt, idx) in points"
        :key="pt.id || idx"
        class="nav-item"
        draggable="true"
        @dragstart="onDragStart(idx)"
        @dragover.prevent
        @drop="onDrop(idx)"
      >
        <div class="nav-item-main">
          <span class="nav-badge" :data-kind="pt.kind">{{
            kindLabels[pt.kind]
          }}</span>
          <input
            v-model="pt.label"
            class="nav-inline-label"
            maxlength="200"
            placeholder="地点名称"
            :aria-label="`导航点${idx + 1}名称`"
          />
          <input
            v-model="pt.address"
            class="nav-inline-addr"
            maxlength="300"
            placeholder="详细地址说明（选填）"
            :aria-label="`导航点${idx + 1}地址`"
          />
        </div>
        <div class="nav-item-coords">
          <span
            v-if="pt.latitude != null && pt.longitude != null"
            class="coord-ok"
          >
            已配坐标：{{ pt.latitude.toFixed(5) }},
            {{ pt.longitude.toFixed(5) }}
          </span>
          <input
            v-else
            type="text"
            class="coord-quick-input"
            placeholder="粘贴经纬度或地图链接快速定位（如 24.4798, 118.0894）"
            @change="
              quickFillCoord(idx, ($event.target as HTMLInputElement).value)
            "
          />
          <div class="nav-item-actions">
            <button
              type="button"
              class="text-button"
              :disabled="idx === 0"
              @click="movePoint(idx, -1)"
            >
              上移
            </button>
            <button
              type="button"
              class="text-button"
              :disabled="idx === points.length - 1"
              @click="movePoint(idx, 1)"
            >
              下移
            </button>
            <button
              v-if="pt.latitude != null"
              type="button"
              class="text-button"
              @click="
                pt.latitude = null;
                pt.longitude = null;
              "
            >
              重设坐标
            </button>
            <button
              type="button"
              class="text-button danger-text"
              @click="removePoint(idx)"
            >
              移除
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="adding" class="nav-add-panel">
      <div class="field-row">
        <label>
          地址类型
          <select v-model="draftKind">
            <option value="DESTINATION">活动目的地</option>
            <option value="MEETING">集合地点</option>
            <option value="BOARDING">上车地点（同步加入上车选项）</option>
          </select>
        </label>
        <label v-if="savedLocations.length">
          选用历史常用坐标点
          <select @change="applySavedLocation">
            <option value="">选择已保存坐标的地点…</option>
            <option
              v-for="loc in savedLocations"
              :key="loc.name"
              :value="loc.name"
            >
              {{ loc.name }}{{ loc.latitude != null ? "（含坐标）" : "" }}
            </option>
          </select>
        </label>
      </div>

      <div class="map-picker-entry">
        <button
          type="button"
          class="secondary"
          :disabled="disabled || !pickerAvailable"
          @click="openMapPicker"
        >
          <AppIcon name="location" :size="16" /> 地图选点
        </button>
        <small v-if="!pickerAvailable" class="field-hint">
          后台地图尚未配置。可使用已保存地点，或手动填写坐标。
        </small>
        <small v-else class="field-hint">
          WildBoy 共用腾讯地图配额：地点搜索每天 200 次，关键词提示和地址反查各每天 6,000 次，每项每秒最多 5 次。配额用完时可手工填写下方的地址和经纬度。
        </small>
      </div>

      <NavigationMapPicker
        v-if="pickerOpen && !disabled"
        :initial="pickerInitial"
        @close="pickerOpen = false"
        @manual="enterManually"
        @select="acceptMapPlace"
      />

      <label>
        粘贴经纬度
        <input
          type="text"
          maxlength="200"
          placeholder="例如 24.5011, 118.1266"
          @change="pasteCoordinates"
        />
      </label>
      <p v-if="draftError" class="field-hint" role="alert">{{ draftError }}</p>

      <div class="field-row">
        <label>
          显示名称 <span>*</span>
          <input
            ref="draftNameInput"
            v-model="draftLabel"
            maxlength="200"
            placeholder="如：岛内SM一期北门"
          />
        </label>
        <label>
          详细地址
          <input
            v-model="draftAddress"
            maxlength="300"
            placeholder="导航面板展示的详细地址"
          />
        </label>
      </div>
      <div class="field-row">
        <label>
          纬度 (GCJ-02)
          <input
            v-model="draftLat"
            inputmode="decimal"
            placeholder="如 24.501111"
          />
        </label>
        <label>
          经度 (GCJ-02)
          <input
            v-model="draftLng"
            inputmode="decimal"
            placeholder="如 118.126666"
          />
        </label>
      </div>

      <div class="action-row">
        <button type="button" class="secondary" @click="closeAdd">取消</button>
        <button type="button" class="primary" @click="commitDraft">
          确认添加导航点
        </button>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.map-picker-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.nav-points-box {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 12px;
  background: var(--rf-surface-subtle, #f9fbf9);
}
.nav-points-box legend {
  padding: 0 6px;
  font-weight: 600;
  font-size: 13px;
}
.nav-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.nav-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nav-item {
  padding: 10px 12px;
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 10px;
  background: var(--rf-surface, #fff);
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nav-item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.nav-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rf-soft, #eaf4e7);
  color: var(--rf-primary-text, #1f5c3f);
  white-space: nowrap;
}
.nav-inline-label {
  flex: 1 1 160px;
}
.nav-inline-addr {
  flex: 2 1 220px;
}
.nav-item-coords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.coord-ok {
  font-size: 12px;
  color: var(--rf-primary-text, #1f5c3f);
}
.coord-quick-input {
  flex: 1 1 240px;
  font-size: 12px;
}
.nav-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.danger-text {
  color: var(--rf-danger);
}
.nav-add-panel {
  margin-top: 12px;
  padding: 14px;
  border-radius: 10px;
  border: 1px dashed var(--rf-primary);
  background: var(--rf-surface, #fff);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
