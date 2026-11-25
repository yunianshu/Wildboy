<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string[]> = {
  order: ["M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 8h8M8 12h8"],
  user: ["M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  shield: ["M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z", "m8 12 3 3 5-5"],
  dashboard: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  template: ["M8 3H4v17h13v-4M8 3h9l4 4v9H8zM17 3v5h4"],
  refund: ["M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
  mountain: ["M2 20 9 5l4 8 3-5 6 12H2ZM6.5 10.5 9 13l2.5-2.5"],
  bag: ["M4 7h16l1 14H3L4 7ZM8 8V6a4 4 0 0 1 8 0v2"],
  document: ["M5 3h10l4 4v14H5V3ZM14 3v5h5M8 12h8M8 16h8"],
  calendar: ["M4 5h16v15H4zM4 9h16M8 3v4M16 3v4"],
  plus: ["M12 5v14M5 12h14"],
  grip: ["M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"],
  up: ["m6 14 6-6 6 6"],
  down: ["m6 10 6 6 6-6"],
  copy: ["M8 8h12v13H8zM16 5V3H4v13h2"],
  refresh: ["M20 8a8 8 0 1 0 .5 7M20 3v5h-5"],
  arrow: ["M5 12h14M14 7l5 5-5 5"],
  back: ["M19 12H5M10 7l-5 5 5 5"],
  close: ["M6 6l12 12M18 6 6 18"],
  eye: [
    "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ],
  "eye-off": [
    "M3 3l18 18M10 6.2c.7-.1 1.3-.2 2-.2 6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.5M6 7.8A17 17 0 0 0 2 12s3.6 6 10 6c1.2 0 2.3-.2 3.3-.6M10 10a3 3 0 0 0 4 4",
  ],
  location: [
    "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z",
    "M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  ],
  empty: ["M4 8 7 3h10l3 5v12H4V8ZM4 8h5l1 4h4l1-4h5"],
  error: ["M12 8v5M12 17h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  check: ["m5 12 4 4L19 6"],
  logout: ["M9 4H4v16h5M9 12h12M17 8l4 4-4 4"],
  "chevron-down": ["m6 9 6 6 6-6"],
  image: ["M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6", "M16 8h.01"],
  table: ["M3 4h18v16H3zM3 9h18M3 14.5h18M12 4v16"],
  text: ["M4 5h16M12 5v14M8 19h8"],
  quote: ["M10 7H4v6h5l-2 4M20 7h-6v6h5l-2 4"],
  line: ["M4 12h16"],
  circle: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  square: ["M4 4h16v16H4z"],
  triangle: ["m12 4 9 16H3z"],
  upload: ["M4 15v5h16v-5M12 16V4m-5 5 5-5 5 5"],
};
</script>
<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(d, index) in paths[name] || paths.document"
      :key="index"
      :d="d"
    />
  </svg>
</template>
