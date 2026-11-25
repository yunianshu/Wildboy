<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <div
    class="terrain-scene"
    :class="{ 'is-compact': compact }"
    aria-hidden="true"
  >
    <div class="scene-aura"></div>
    <div class="scene-grid"></div>
    <div class="scene-object">
      <svg viewBox="0 0 480 340" fill="none" focusable="false">
        <defs>
          <linearGradient
            id="terrain-base"
            x1="112"
            y1="146"
            x2="350"
            y2="310"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#376c50" />
            <stop offset="1" stop-color="#173f2f" />
          </linearGradient>
          <linearGradient
            id="terrain-front"
            x1="222"
            y1="91"
            x2="274"
            y2="257"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#d3f6a5" />
            <stop offset="0.48" stop-color="#75bd70" />
            <stop offset="1" stop-color="#347b50" />
          </linearGradient>
          <linearGradient
            id="terrain-side"
            x1="271"
            y1="97"
            x2="339"
            y2="235"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#8ed384" />
            <stop offset="1" stop-color="#1d583e" />
          </linearGradient>
          <linearGradient
            id="terrain-back"
            x1="145"
            y1="123"
            x2="196"
            y2="224"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#80c99a" />
            <stop offset="1" stop-color="#2e6e50" />
          </linearGradient>
          <filter
            id="terrain-blur"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <ellipse
          cx="246"
          cy="291"
          rx="150"
          ry="24"
          fill="#061710"
          opacity=".36"
          filter="url(#terrain-blur)"
        />
        <path
          d="M48 221 239 111 430 207 238 323 48 221Z"
          fill="url(#terrain-base)"
          stroke="#7eb693"
          stroke-opacity=".3"
        />
        <path d="m48 221 190 102v14L48 235v-14Z" fill="#153a2b" />
        <path d="m238 323 192-116v14L238 337v-14Z" fill="#0c2b20" />
        <g opacity=".16" stroke="#d8f3df" stroke-width="1">
          <path
            d="m84 205 191 102M124 183l191 102M164 161l191 102M204 139l191 102M85 250l192-116M129 274l192-116M174 299l192-116"
          />
        </g>
        <path
          d="m103 221 72-102 72 105-54 33-90-36Z"
          fill="url(#terrain-back)"
        />
        <path d="m175 119 12 78 60 27-72-105Z" fill="#245e45" />
        <path
          d="m175 119-22 39 22-10 12 10-12-39Z"
          fill="#d7eee0"
          opacity=".85"
        />
        <path
          d="m134 243 113-166 119 151-68 45-164-30Z"
          fill="url(#terrain-front)"
        />
        <path d="m247 77 22 124 97 27-119-151Z" fill="url(#terrain-side)" />
        <path d="m247 77-39 58 35-17 26 17 22 7-44-65Z" fill="#efffe8" />
        <path
          d="m247 77-20 88-27 66 69-30-22-124Z"
          fill="#a5dd8d"
          opacity=".36"
        />
        <path
          d="m134 243 64 13 71-55 29 2 68 25-68 45-164-30Z"
          fill="#276c47"
          opacity=".42"
        />
        <path d="m298 256 43-68 54 42-38 24-59 2Z" fill="#4e9661" />
        <path d="m341 188 7 40 47 2-54-42Z" fill="#276144" />
        <g stroke="#d5f3b0" stroke-linecap="round" opacity=".46">
          <path d="m153 245 49 9 52-42" />
          <path d="m164 259 43 7 41-32" />
          <path d="m283 218 25 8 29-4" />
        </g>
        <g transform="translate(324 111)">
          <ellipse
            cx="0"
            cy="47"
            rx="24"
            ry="10"
            fill="#b8e986"
            opacity=".16"
          />
          <ellipse cx="0" cy="47" rx="12" ry="5" fill="#b8e986" opacity=".28" />
          <path
            d="M0 0c-10 0-18 8-18 18 0 14 18 31 18 31s18-17 18-31C18 8 10 0 0 0Z"
            fill="#c9f89a"
          />
          <circle cy="18" r="6" fill="#244e35" />
        </g>
        <g fill="#d7ffa9">
          <circle cx="97" cy="191" r="3" />
          <circle cx="375" cy="246" r="3" />
          <circle cx="200" cy="284" r="2.5" />
        </g>
      </svg>
    </div>
    <div class="scene-chip scene-chip-top">
      <span class="scene-live-dot"></span>
      <small>LIVE</small>
      <strong>运营在线</strong>
    </div>
    <div class="scene-chip scene-chip-bottom">
      <small>OUTDOOR</small>
      <strong>探索无界</strong>
      <span>↗</span>
    </div>
  </div>
</template>

<style scoped>
.terrain-scene {
  position: relative;
  width: 100%;
  min-height: 300px;
  perspective: 1000px;
  isolation: isolate;
}
.scene-aura {
  position: absolute;
  inset: 16% 8% 4%;
  border-radius: 50%;
  background: radial-gradient(circle, #a8e78a24, transparent 68%);
  filter: blur(12px);
}
.scene-grid {
  position: absolute;
  inset: 42% 2% -8%;
  opacity: 0.16;
  background-image:
    linear-gradient(#b5dac31f 1px, transparent 1px),
    linear-gradient(90deg, #b5dac31f 1px, transparent 1px);
  background-size: 28px 28px;
  transform: rotateX(64deg) rotateZ(-10deg);
  mask-image: radial-gradient(ellipse, #000 20%, transparent 70%);
}
.scene-object {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: terrain-float 7s ease-in-out infinite;
}
.scene-object svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 24px 24px #06171045);
  transform: rotateX(2deg) rotateY(-5deg);
  transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.terrain-scene:hover .scene-object svg {
  transform: rotateX(-2deg) rotateY(4deg) translateY(-5px);
}
.scene-chip {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 13px;
  border: 1px solid #d7f8e326;
  border-radius: 12px;
  color: #f3fff7;
  background: #17392dd6;
  box-shadow: 0 12px 30px #071a1360;
  backdrop-filter: blur(12px);
  animation: chip-float 6s ease-in-out infinite;
}
.scene-chip small {
  color: #a9c6b6;
  font-size: 9px;
  letter-spacing: 1.4px;
}
.scene-chip strong {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.scene-chip-top {
  top: 16%;
  right: 2%;
}
.scene-chip-bottom {
  bottom: 10%;
  left: 1%;
  animation-delay: -3s;
}
.scene-chip-bottom > span {
  color: #c9f89a;
  font-size: 17px;
}
.scene-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c9f89a;
  box-shadow: 0 0 0 4px #c9f89a14;
}
.is-compact {
  min-height: 190px;
}
.is-compact .scene-chip {
  padding: 7px 10px;
  border-radius: 10px;
}
.is-compact .scene-chip-top {
  top: 7%;
  right: 0;
}
.is-compact .scene-chip-bottom {
  bottom: 3%;
}
@keyframes terrain-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
@keyframes chip-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .scene-object,
  .scene-chip {
    animation: none;
  }
  .scene-object svg {
    transition: none;
  }
}
</style>
