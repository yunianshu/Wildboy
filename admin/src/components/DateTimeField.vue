<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import FormModal from "./FormModal.vue";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    id: string;
    label: string;
    presets?: string[];
    error?: string;
    required?: boolean;
  }>(),
  { presets: () => [], error: "", required: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const datePart = computed({
  get: () =>
    /^\d{4}-\d{2}-\d{2}/.test(props.modelValue)
      ? props.modelValue.slice(0, 10)
      : "",
  set: (value: string) => {
    emit(
      "update:modelValue",
      value || timePart.value ? `${value}T${timePart.value}` : "",
    );
  },
});
const timePart = computed({
  get: () =>
    /T\d{2}:\d{2}$/.test(props.modelValue) ? props.modelValue.slice(-5) : "",
  set: (value: string) => {
    emit(
      "update:modelValue",
      datePart.value || value ? `${datePart.value}T${value}` : "",
    );
  },
});
const picker = ref(false);
const draftDate = ref("");
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const visibleMonth = ref(today.slice(0, 7));
const draftHour = ref("09");
const draftMinute = ref("00");
const hours = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const minuteOptions = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);
const draftTime = computed(() => `${draftHour.value}:${draftMinute.value}`);
const years = computed(() => {
  const current = Number(today.slice(0, 4)), chosen = Number(visibleMonth.value.slice(0, 4));
  return [...new Set([...Array.from({ length: 11 }, (_, i) => current - 5 + i), chosen])].sort((a, b) => a - b);
});
function jumpMonth(event: Event, unit: "year" | "month") {
  const value = (event.target as HTMLSelectElement).value;
  visibleMonth.value = unit === "year" ? value + visibleMonth.value.slice(4)
    : visibleMonth.value.slice(0, 5) + value;
}
const monthLabel = computed(() => {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  return `${year} 年 ${month} 月`;
});
const calendarDays = computed(() => {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  if (!year || !month) return [];
  const first = Date.UTC(year, month - 1, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first + (index - offset) * 86400000);
    const value = day.toISOString().slice(0, 10);
    return {
      value,
      day: day.getUTCDate(),
      inMonth: day.getUTCMonth() === month - 1,
    };
  });
});
function openPicker() {
  draftDate.value = datePart.value;
  visibleMonth.value = (draftDate.value || today).slice(0, 7);
  const current = timePart.value || props.presets[0] || "09:00";
  [draftHour.value, draftMinute.value] = current.split(":");
  picker.value = true;
}
function changeMonth(offset: number) {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  visibleMonth.value = new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
function selectDate(value: string) {
  draftDate.value = value;
  visibleMonth.value = value.slice(0, 7);
}
function selectTime(value: string) {
  [draftHour.value, draftMinute.value] = value.split(":");
}
function apply() {
  if (!draftDate.value) return;
  emit("update:modelValue", `${draftDate.value}T${draftTime.value}`);
  picker.value = false;
}
</script>
<template>
  <div class="datetime-field">
    <label class="datetime-label" :for="id">
      <AppIcon name="calendar" :size="16" />
      <span
        >{{ label }} <span v-if="required" class="required-mark">*</span></span
      >
    </label>
    <div class="datetime-inputs">
      <input
        :id="id"
        v-model="datePart"
        class="datetime-date"
        type="date"
        readonly
        placeholder="选择日期"
        aria-haspopup="dialog"
        :aria-required="required ? 'true' : undefined"
        @mousedown.prevent
        @click.prevent="openPicker"
        @keydown.enter.prevent="openPicker"
        @keydown.space.prevent="openPicker"
      />
      <input
        :id="`${id}-time`"
        v-model="timePart"
        class="datetime-time"
        type="time"
        readonly
        placeholder="选择时间"
        aria-haspopup="dialog"
        :aria-label="`${label}的具体时间`"
        :aria-required="required ? 'true' : undefined"
        @mousedown.prevent
        @click.prevent="openPicker"
        @keydown.enter.prevent="openPicker"
        @keydown.space.prevent="openPicker"
      />
    </div>
    <div v-if="presets.length" class="time-presets" aria-label="常用时间">
      <span>快捷选择</span>
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        class="time-preset"
        :class="{ 'is-active': timePart === preset }"
        :aria-pressed="timePart === preset"
        @click="timePart = preset"
      >
        {{ preset }}
      </button>
    </div>
    <small class="field-error">{{ error }}</small>
    <FormModal v-if="picker" size="lg" @close="picker = false">
      <template #title><h2>选择日期和时间</h2></template>
      <p class="muted">{{ label.includes("北京时间") ? label : label + "（北京时间）" }}</p>
      <div class="date-time-picker">
      <div class="calendar-picker">
        <div class="calendar-toolbar">
          <button
            type="button"
            class="secondary month-button"
            aria-label="上个月"
            @click="changeMonth(-1)"
          >
            <AppIcon name="back" :size="16" />
          </button>
          <div class="action-row" :aria-label="monthLabel">
            <select aria-label="年份" :value="visibleMonth.slice(0, 4)" @change="jumpMonth($event, 'year')">
              <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option>
            </select>
            <select aria-label="月份" :value="visibleMonth.slice(5)" @change="jumpMonth($event, 'month')">
              <option v-for="month in 12" :key="month" :value="String(month).padStart(2, '0')">{{ month }} 月</option>
            </select>
          </div>
          <button
            type="button"
            class="secondary month-button"
            aria-label="下个月"
            @click="changeMonth(1)"
          >
            <AppIcon name="arrow" :size="16" />
          </button>
        </div>
        <div class="calendar-weekdays" aria-hidden="true">
          <span
            v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']"
            :key="weekday"
          >
            {{ weekday }}
          </span>
        </div>
        <div class="calendar-grid">
          <button
            v-for="day in calendarDays"
            :key="day.value"
            type="button"
            class="calendar-day"
            :class="{
              'is-outside': !day.inMonth,
              'is-selected': draftDate === day.value,
              'is-today': today === day.value,
            }"
            :aria-label="day.value"
            :aria-pressed="draftDate === day.value"
            @click="selectDate(day.value)"
          >
            {{ day.day }}
          </button>
        </div>
        <div class="calendar-footer">
          <button
            type="button"
            class="text-button"
            @click="selectDate(today)"
          >
            今天
          </button>
        </div>
      </div>
      <div class="time-picker">
        <p v-if="presets.length" class="picker-section-label">常用时间</p>
        <div v-if="presets.length" class="time-choice-grid">
          <button
            v-for="preset in presets"
            :key="preset"
            type="button"
            class="time-choice"
            :class="{ 'is-active': draftTime === preset }"
            @click="selectTime(preset)"
          >
            {{ preset }}
          </button>
        </div>
        <div class="custom-time">
          <p class="picker-section-label">自定义时间</p>
          <div class="custom-time-selects">
            <label>
              小时
              <select v-model="draftHour" aria-label="选择小时">
                <option v-for="hour in hours" :key="hour" :value="hour">
                  {{ hour }} 时
                </option>
              </select>
            </label>
            <span>:</span>
            <label>
              分钟
              <select v-model="draftMinute" aria-label="选择分钟">
                <option
                  v-for="minute in minuteOptions"
                  :key="minute"
                  :value="minute"
                >
                  {{ minute }} 分
                </option>
              </select>
            </label>
          </div>
        </div>
      </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="secondary" @click="picker = false">取消</button>
        <button type="button" class="primary" :disabled="!draftDate" @click="apply">应用</button>
      </div>
    </FormModal>
  </div>
</template>
<style scoped>
.datetime-field {
  margin-bottom: 18px;
}
.datetime-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--admin-body);
  font-size: 13px;
}
.datetime-label .app-icon {
  color: var(--admin-muted);
}
.datetime-label > span {
  color: var(--admin-body);
}
.required-mark {
  color: var(--admin-muted);
}
.datetime-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(118px, 0.65fr);
  gap: 10px;
}
.datetime-inputs input {
  min-height: 44px;
  margin: 0;
  background: #ffffff;
  cursor: pointer;
}
.datetime-inputs input:hover {
  border-color: var(--rf-line);
}
.datetime-date,
.datetime-time {
  min-width: 0;
}
.datetime-time {
  font-variant-numeric: tabular-nums;
}
.time-presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 9px;
}
.time-presets > span {
  margin-right: 2px;
  color: var(--admin-muted);
  font-size: 11px;
}
.time-preset {
  min-height: 30px;
  padding: 3px 10px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  color: var(--admin-muted);
  background: #ffffff;
  box-shadow: none;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.time-preset:hover:not(:disabled) {
  color: var(--rf-primary-text);
  border-color: var(--rf-line);
  background: var(--admin-tint);
}
.time-preset.is-active {
  color: var(--rf-primary-text);
  border-color: var(--rf-line);
  background: var(--admin-tint);
  font-weight: 650;
}
.datetime-field .field-error {
  margin-top: 6px;
}
.date-time-picker {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 24px;
}
@media (max-width: 700px) {
  .date-time-picker { grid-template-columns: minmax(0, 1fr); gap: 16px; }
}
.calendar-toolbar {
  display: grid;
  grid-template-columns: 36px 1fr 36px;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  text-align: center;
}
.calendar-toolbar strong {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.month-button {
  width: 36px;
  min-height: 36px;
  padding: 0;
}
.calendar-weekdays,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
}
.calendar-weekdays {
  margin-bottom: 6px;
  color: var(--admin-muted);
  font-size: 11px;
  text-align: center;
}
.calendar-day {
  min-width: 0;
  min-height: 38px;
  padding: 0;
  border-radius: 9px;
  color: var(--admin-body);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  box-shadow: none;
}
.calendar-day:hover {
  color: var(--rf-primary-text);
  background: var(--admin-tint);
}
.calendar-day.is-outside {
  color: var(--rf-line);
}
.calendar-day.is-today {
  box-shadow: inset 0 0 0 1px var(--rf-muted);
}
.calendar-day.is-selected {
  color: #ffffff;
  background: var(--admin-primary);
  box-shadow: none;
}
.calendar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  margin-top: 12px;
  border-top: 1px solid var(--admin-hairline);
}
.calendar-footer > span {
  color: var(--admin-muted);
  font-size: 11px;
}
.picker-section-label {
  margin: 0 0 10px;
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 600;
}
.time-choice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.time-choice {
  min-height: 52px;
  border: 1px solid var(--admin-line);
  color: var(--admin-ink);
  background: #ffffff;
  box-shadow: none;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
.time-choice:hover,
.time-choice.is-active {
  color: var(--rf-primary-text);
  border-color: var(--rf-muted);
  background: var(--admin-tint);
}
.custom-time {
  padding-top: 20px;
  margin-top: 22px;
  border-top: 1px solid var(--admin-hairline);
}
.custom-time-selects {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 12px;
}
.custom-time-selects > span {
  padding-bottom: 10px;
  color: var(--admin-muted);
  font-size: 20px;
}
.custom-time-selects label {
  margin: 0;
  font-size: 12px;
}
.custom-time-selects select {
  margin-top: 6px;
}
.confirm-time {
  margin-top: 18px;
}
@media (max-width: 720px) {
  .calendar-day {
    min-height: 42px;
  }
}
@media (max-width: 420px) {
  .datetime-inputs {
    grid-template-columns: minmax(0, 1.2fr) minmax(104px, 0.8fr);
    gap: 8px;
  }
  .datetime-inputs input {
    padding-inline: 9px;
    font-size: 12px;
  }
  .calendar-weekdays,
  .calendar-grid {
    gap: 3px;
  }
  .calendar-toolbar { gap: 8px; margin-bottom: 8px; }
  .calendar-toolbar .action-row select { margin-bottom: 0; }
  .calendar-day { min-height: 37px; font-size: 11px; }
  .calendar-footer { padding-top: 4px; margin-top: 6px; }
  .date-time-picker { gap: 10px; }
  .custom-time { padding-top: 8px; margin-top: 8px; }
  .time-choice-grid {
    gap: 8px;
  }
  .time-choice {
    min-height: 48px;
    font-size: 15px;
  }
}
</style>
