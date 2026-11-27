<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <div class="mp-preview-wrap">
    <p v-if="subtitle" class="mp-preview-caption">{{ subtitle }}</p>
    <div class="mp-phone" role="region" :aria-label="`小程序${title}预览`">
      <header class="mp-nav">
        <div class="mp-status-bar" aria-hidden="true">
          <span class="mp-time">9:41</span>
          <span class="mp-signal">
            <i></i><i></i><i></i>
          </span>
        </div>
        <div class="mp-nav-bar">
          <span class="mp-nav-back" aria-hidden="true">
            <AppIcon name="back" :size="15" />
          </span>
          <span class="mp-nav-title">{{ title }}</span>
          <span class="mp-capsule" aria-hidden="true">
            <span class="mp-capsule-dots">•••</span>
            <span class="mp-capsule-divider"></span>
            <span class="mp-capsule-ring"></span>
          </span>
        </div>
      </header>
      <div class="mp-viewport">
        <div class="mp-scroll">
          <slot />
        </div>
        <div v-if="$slots.footer" class="mp-sticky-footer">
          <slot name="footer" />
        </div>
      </div>
      <div class="mp-home-bar" aria-hidden="true"><span></span></div>
    </div>
  </div>
</template>

<style scoped>
.mp-preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 4px 0 12px;
}

.mp-preview-caption {
  margin: 0;
  font-size: 13px;
  color: var(--rf-muted);
  text-align: center;
  line-height: 1.5;
}

.mp-phone {
  width: min(100%, 382px);
  border-radius: 30px;
  border: 6px solid #16261f;
  background: var(--rf-bg);
  box-shadow: 0 18px 42px rgba(16, 37, 29, 0.16);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mp-nav {
  background: var(--rf-surface);
  border-bottom: 1px solid var(--rf-line);
  flex-shrink: 0;
  user-select: none;
}

.mp-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 18px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--rf-ink);
}

.mp-signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
}

.mp-signal i {
  display: block;
  width: 3px;
  border-radius: 1px;
  background: var(--rf-ink);
}

.mp-signal i:nth-child(1) {
  height: 5px;
}
.mp-signal i:nth-child(2) {
  height: 7px;
}
.mp-signal i:nth-child(3) {
  height: 10px;
}

.mp-nav-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 12px;
}

.mp-nav-back {
  position: absolute;
  left: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--rf-ink);
}

.mp-nav-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--rf-ink);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-capsule {
  position: absolute;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--rf-line);
  background: rgba(255, 255, 255, 0.9);
}

.mp-capsule-dots {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--rf-ink);
  line-height: 1;
}

.mp-capsule-divider {
  width: 1px;
  height: 12px;
  background: var(--rf-line);
}

.mp-capsule-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.8px solid var(--rf-ink);
  position: relative;
}

.mp-capsule-ring::after {
  content: "";
  position: absolute;
  inset: 2.5px;
  border-radius: 50%;
  background: var(--rf-ink);
}

.mp-viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  height: min(68vh, 640px);
  min-height: 440px;
  background: var(--rf-bg);
}

.mp-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.mp-sticky-footer {
  flex-shrink: 0;
  padding: 10px 14px;
  background: var(--rf-surface);
  border-top: 1px solid var(--rf-line);
  box-shadow: 0 -4px 14px rgba(16, 37, 29, 0.05);
}

.mp-home-bar {
  display: flex;
  justify-content: center;
  padding: 6px 0 8px;
  background: var(--rf-surface);
}

.mp-home-bar span {
  width: 112px;
  height: 4px;
  border-radius: 999px;
  background: #c5d1ca;
}
</style>
