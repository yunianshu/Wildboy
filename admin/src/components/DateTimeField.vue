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
const picker = ref<"date" | "time" | null>(null);
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
const minuteOptions = computed(() => {
  const values = ["00", "15", "30", "45"];
  if (!values.includes(draftMinute.value)) values.push(draftMinute.value);
  return values.sort();
});
const draftTime = computed(() => `${draftHour.value}:${draftMinute.value}`);
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
function openDate() {
  visibleMonth.value = (datePart.value || today).slice(0, 7);
  picker.value = "date";
}
function openTime() {
  const current = timePart.value || props.presets[0] || "09:00";
  [draftHour.value, draftMinute.value] = current.split(":");
  picker.value = "time";
}
function changeMonth(offset: number) {
  const [year, month] = visibleMonth.value.split("-").map(Number);
  visibleMonth.value = new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
function selectDate(value: string) {
  datePart.value = value;
  picker.value = null;
}
function selectTime(value: string) {
  timePart.value = value;
  picker.value = null;
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
        @click.prevent="openDate"
        @keydown.enter.prevent="openDate"
        @keydown.space.prevent="openDate"
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
        @click.prevent="openTime"
        @keydown.enter.prevent="openTime"
        @keydown.space.prevent="openTime"
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
    <FormModal v-if="picker" :label="`${label}选择弹窗`" @close="picker = null">
      <header class="picker-heading">
        <p>{{ label }} · 北京时间</p>
        <h2>{{ picker === "date" ? "选择日期" : "选择时间" }}</h2>
      </header>
      <div v-if="picker === 'date'" class="calendar-picker">
        <div class="calendar-toolbar">
          <button
            type="button"
            class="secondary month-button"
            aria-label="上个月"
            @click="changeMonth(-1)"
          >
            <AppIcon name="back" :size="16" />
          </button>
          <strong aria-live="polite">{{ monthLabel }}</strong>
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
              'is-selected': datePart === day.value,
              'is-today': today === day.value,
            }"
            :aria-label="day.value"
            :aria-pressed="datePart === day.value"
            @click="selectDate(day.value)"
          >
            {{ day.day }}
          </button>
        </div>
        <div class="calendar-footer">
          <button
            type="button"
            class="text-button"
            @click="visibleMonth = today.slice(0, 7)"
          >
            回到本月
          </button>
          <span>点击日期即可选中</span>
        </div>
      </div>
      <div v-else class="time-picker">
        <p class="picker-section-label">常用时间</p>
        <div class="time-choice-grid">
          <button
            v-for="preset in presets"
            :key="preset"
            type="button"
            class="time-choice"
            :class="{ 'is-active': timePart === preset }"
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
          <button
            type="button"
            class="primary full confirm-time"
            @click="selectTime(draftTime)"
          >
            确定 {{ draftTime }}
          </button>
        </div>
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
  background: #fff;
  cursor: pointer;
}
.datetime-inputs input:hover {
  border-color: #a9c8b7;
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
  background: #fff;
  box-shadow: none;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.time-preset:hover:not(:disabled) {
  color: var(--admin-primary);
  border-color: #a9c8b7;
  background: var(--admin-tint);
}
.time-preset.is-active {
  color: var(--admin-primary);
  border-color: #a9c8b7;
  background: var(--admin-tint);
  font-weight: 650;
}
.datetime-field .field-error {
  margin-top: 6px;
}
.picker-heading {
  padding-right: 38px;
  margin-bottom: 22px;
}
.picker-heading p {
  margin: 0 0 4px;
  color: var(--admin-muted);
  font-size: 11px;
}
.picker-heading h2 {
  margin: 0;
  color: var(--admin-ink);
  font-size: 21px;
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
  color: var(--admin-primary);
  background: var(--admin-tint);
}
.calendar-day.is-outside {
  color: #b0bab4;
}
.calendar-day.is-today {
  box-shadow: inset 0 0 0 1px #9bc4ad;
}
.calendar-day.is-selected {
  color: #fff;
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
  background: #fff;
  box-shadow: none;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
.time-choice:hover,
.time-choice.is-active {
  color: var(--admin-primary);
  border-color: #9bc4ad;
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
  .calendar-day {
    font-size: 11px;
  }
  .time-choice-grid {
    gap: 8px;
  }
  .time-choice {
    min-height: 48px;
    font-size: 15px;
  }
}
</style>
