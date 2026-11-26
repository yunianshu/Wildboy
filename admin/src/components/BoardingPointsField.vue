<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { errorMessage, request } from "../api";
import { boardingName } from "../boarding";
import { maxBoardingPoints } from "../forms";
import type { BoardingPointLocation, NavigationPoint } from "../types";

defineProps<{ disabled: boolean; error?: string }>();
const selected = defineModel<string[]>({ required: true });
const navigation = defineModel<NavigationPoint[]>("navigation", {
  required: true,
});
const catalog = ref<BoardingPointLocation[]>([]);
const loading = ref(true);
const loadError = ref("");
const choices = computed(() => {
  const rows = new Map<string, BoardingPointLocation>();
  for (const row of catalog.value) {
    // Old activities can still reference a stop by its former display name.
    const snapshot = navigation.value.find(
      (p) =>
        p.kind === "BOARDING" &&
        selected.value.includes(p.label) &&
        (p.address || p.label) === (row.address || row.name),
    );
    const name =
      snapshot?.label ||
      boardingName(row.address || row.name, [
        ...selected.value,
        ...rows.keys(),
      ]);
    rows.set(name, { ...row, name });
  }
  for (const name of selected.value) {
    const point = navigation.value.find(
      (p) => p.kind === "BOARDING" && p.label === name,
    );
    rows.set(name, {
      name,
      address: point?.address || rows.get(name)?.address || name,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    });
  }
  return [...rows.values()];
});
async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    catalog.value = await request<BoardingPointLocation[]>(
      "/admin/activity-boarding-point-locations",
    );
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function matches(point: NavigationPoint, row: BoardingPointLocation) {
  return (
    (point.kind === "BOARDING" && point.label === row.name) ||
    (point.kind === "MEETING" &&
      point.label === "示例集合点" &&
      point.address === row.address)
  );
}
function atLimit(row: BoardingPointLocation) {
  return (
    !selected.value.includes(row.name) &&
    (selected.value.length >= maxBoardingPoints ||
      (navigation.value.length >= 30 &&
        !navigation.value.some((p) => matches(p, row))))
  );
}
function toggle(row: BoardingPointLocation) {
  if (selected.value.includes(row.name)) {
    selected.value = selected.value.filter((name) => name !== row.name);
    navigation.value = navigation.value.filter(
      (p) => p.kind !== "BOARDING" || p.label !== row.name,
    );
    return;
  }
  if (atLimit(row)) return;
  const previous = navigation.value.find((p) => matches(p, row));
  selected.value = [...selected.value, row.name];
  navigation.value = [
    ...navigation.value.filter((p) => !matches(p, row)),
    {
      id:
        previous?.id ||
        globalThis.crypto?.randomUUID?.() ||
        `nav-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: "BOARDING",
      label: row.name,
      address: row.address || row.name,
      latitude: row.latitude,
      longitude: row.longitude,
    },
  ];
}
onMounted(load);
</script>

<template>
  <fieldset class="boarding-points" :disabled="disabled">
    <legend>上车地点</legend>
    <div v-if="choices.length" class="point-choices">
      <label v-for="row in choices" :key="row.name" class="point-choice">
        <input
          type="checkbox"
          :checked="selected.includes(row.name)"
          :disabled="atLimit(row)"
          @change="toggle(row)"
        />
        <span>{{ row.address || row.name }}</span>
      </label>
    </div>
    <small v-if="loading" class="field-hint">正在加载上车点…</small>
    <small v-else-if="loadError" class="field-error" role="alert"
      >{{ loadError }}
      <button type="button" class="text-button" @click="load">
        重试
      </button></small
    >
    <small v-else-if="!choices.length" class="field-hint"
      >暂无上车点，请先在「上车点设置」添加地址。</small
    >
    <small v-else class="field-hint">可多选，报名时每人选择一处。</small>
    <small v-if="error" class="field-error" role="alert">{{ error }}</small>
  </fieldset>
</template>

<style scoped>
.boarding-points {
  min-width: 0;
}
.boarding-points legend {
  margin-bottom: 6px;
  font-weight: 600;
}
.point-choices {
  display: grid;
  gap: 4px;
  margin-bottom: 6px;
}
.point-choices .point-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  margin: 0;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.point-choice input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin: 0;
  accent-color: var(--rf-primary);
}
</style>
