<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import FormModal from "./FormModal.vue";
import {
  loadNavigationMap,
  readLngLat,
  type Coordinate,
  type MapPlace,
} from "../navigation-map";

const props = defineProps<{ initial?: Coordinate; keyword: string }>();
const emit = defineEmits<{ close: []; select: [place: MapPlace] }>();
const container = ref<HTMLElement>();
const keyword = ref(props.keyword);
const choices = ref<MapPlace[]>([]);
const selected = ref<MapPlace>();
const mapStatus = ref<"loading" | "ready" | "error">("loading");
const searchStatus = ref("");
const addressStatus = ref("");
const lookingUp = ref(false);
const searching = ref(false);
let alive = true;
let searchId = 0;
let selectionId = 0;
let addressTimer: number | undefined;
let searchTimer: number | undefined;
type Sdk = Awaited<ReturnType<typeof loadNavigationMap>>;
let map: InstanceType<Sdk["Map"]> | undefined;
let marker: InstanceType<Sdk["Marker"]> | undefined;
let sdk: Sdk | undefined;

const coordinateText = computed(
  () =>
    selected.value &&
    [selected.value.latitude, selected.value.longitude]
      .map((item) => item.toFixed(6))
      .join(", "),
);

onMounted(async () => {
  try {
    sdk = await loadNavigationMap();
    if (!alive || !container.value) return;
    map = new sdk.Map(container.value, {
      center: props.initial ?? [118.089425, 24.479834],
      zoom: props.initial ? 16 : 12,
    });
    map.on("click", ({ lnglat }) => {
      const point = readLngLat(lnglat);
      if (!point || !alive || !sdk) return;
      showSelection({
        title: "地图标记点",
        address: "",
        latitude: point[1],
        longitude: point[0],
      });
      const id = selectionId;
      lookingUp.value = true;
      addressTimer = window.setTimeout(() => finishAddress(id), 6000);
      try {
        new sdk.Geocoder().getAddress(point, (status, result) =>
          finishAddress(
            id,
            status === "complete"
              ? result?.regeocode?.formattedAddress
              : undefined,
          ),
        );
      } catch {
        finishAddress(id);
      }
    });
    mapStatus.value = "ready";
  } catch {
    if (alive) mapStatus.value = "error";
  }
});

onUnmounted(() => {
  alive = false;
  window.clearTimeout(addressTimer);
  window.clearTimeout(searchTimer);
  map?.destroy();
});

function finishAddress(id: number, address?: string) {
  if (!alive || id !== selectionId || !selected.value || !lookingUp.value)
    return;
  window.clearTimeout(addressTimer);
  lookingUp.value = false;
  const label = address?.trim().slice(0, 300);
  if (label)
    selected.value = {
      ...selected.value,
      title: label.slice(0, 200),
      address: label,
    };
  else addressStatus.value = "没查到详细地址，可以先使用坐标，返回后补填地址。";
}

function showSelection(place: MapPlace, center = false) {
  selectionId++;
  window.clearTimeout(addressTimer);
  lookingUp.value = false;
  addressStatus.value = "";
  selected.value = place;
  if (!sdk || !map) return;
  const position: Coordinate = [place.longitude, place.latitude];
  if (marker) marker.setPosition(position);
  else marker = new sdk.Marker({ map, position });
  if (center) map.setCenter(position);
}

function invalidateSearch() {
  searchId++;
  window.clearTimeout(searchTimer);
  searching.value = false;
  choices.value = [];
  searchStatus.value = "";
}

function search() {
  if (!sdk || !keyword.value.trim() || searching.value) return;
  invalidateSearch();
  const id = searchId;
  searching.value = true;
  const fail = () => {
    if (!alive || id !== searchId || !searching.value) return;
    window.clearTimeout(searchTimer);
    searching.value = false;
    searchStatus.value = "地点搜索失败，请重试或直接在地图上选点。";
  };
  searchTimer = window.setTimeout(fail, 8000);
  try {
    new sdk.PlaceSearch({ pageSize: 6 }).search(
      keyword.value.trim(),
      (status, result) => {
        if (!alive || id !== searchId || !searching.value) return;
        if (status !== "complete" && status !== "no_data") return fail();
        window.clearTimeout(searchTimer);
        searching.value = false;
        choices.value = (result?.poiList?.pois || []).flatMap((row) => {
          const point = readLngLat(row.location);
          if (!point || !row.name?.trim()) return [];
          return [
            {
              title: row.name.trim().slice(0, 200),
              address: row.address?.trim().slice(0, 300) || "",
              latitude: point[1],
              longitude: point[0],
            },
          ];
        });
        if (!choices.value.length)
          searchStatus.value = "没有找到地点，试试加上城市名。";
      },
    );
  } catch {
    fail();
  }
}
</script>

<template>
  <FormModal size="xl" @close="emit('close')">
    <template #title><h2>在地图上选地址</h2></template>
    <p class="field-hint">
      可搜索地点，也可直接点地图标记登山口、停车场等位置。
    </p>
    <div class="map-search">
      <input
        v-model="keyword"
        type="search"
        aria-label="搜索地图地址"
        placeholder="输入城市和地点"
        maxlength="200"
        :disabled="mapStatus !== 'ready'"
        @input="invalidateSearch"
        @keydown.enter.prevent="search"
      />
      <button
        type="button"
        class="secondary"
        :disabled="mapStatus !== 'ready' || searching || !keyword.trim()"
        @click="search"
      >
        {{ searching ? "搜索中…" : "搜索" }}
      </button>
    </div>
    <p v-if="searchStatus" role="status" class="field-hint">
      {{ searchStatus }}
    </p>
    <ul v-if="choices.length" class="map-results" aria-label="地点搜索结果">
      <li v-for="(place, index) in choices" :key="index">
        <button
          type="button"
          class="secondary"
          @click="
            showSelection(place, true);
            choices = [];
          "
        >
          <strong>{{ place.title }}</strong
          ><span v-if="place.address">{{ place.address }}</span>
        </button>
      </li>
    </ul>
    <p v-if="mapStatus === 'loading'" role="status">正在加载高德地图…</p>
    <p v-if="mapStatus === 'error'" class="error-box" role="alert">
      地图未能加载。可关闭后重试，或返回使用已保存地点及手动坐标。
    </p>
    <div
      v-show="mapStatus !== 'error'"
      ref="container"
      class="map-canvas"
      aria-label="高德地图"
    />
    <div v-if="selected" class="map-selection" role="status">
      <strong>{{ selected.address || selected.title }}</strong>
      <span>{{ coordinateText }}</span>
      <small v-if="lookingUp">正在查询地址…</small>
      <small v-else-if="addressStatus">{{ addressStatus }}</small>
    </div>
    <template #footer>
      <button type="button" class="secondary" @click="emit('close')">
        取消选点
      </button>
      <button
        type="button"
        class="primary"
        :disabled="!selected || lookingUp"
        @click="selected && emit('select', selected)"
      >
        使用此地址
      </button>
    </template>
  </FormModal>
</template>

<style scoped>
.map-search {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.map-search input {
  flex: 1;
  min-width: 0;
}
.map-search button {
  flex-shrink: 0;
}
.map-canvas {
  height: clamp(220px, 42dvh, 440px);
  border-radius: 8px;
  background: var(--rf-surface-subtle);
  overflow: hidden;
}
.map-results {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 4px;
  max-height: 150px;
  overflow-y: auto;
}
.map-results button {
  display: grid;
  gap: 2px;
  width: 100%;
  text-align: left;
  white-space: normal;
}
.map-results span,
.map-selection span {
  color: var(--rf-muted);
  font-size: 13px;
}
.map-selection {
  display: grid;
  gap: 2px;
  margin-top: 8px;
}
</style>
