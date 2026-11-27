<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { request } from "../api";
import type { HomeGalleryConfig, HomeGallerySlide, Page } from "../types";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ config: HomeGalleryConfig; active: boolean }>();
defineEmits<{ edit: [] }>();

type Slide = Pick<HomeGallerySlide, "id" | "title" | "subtitle" | "imageUrl">;
type Article = {
  id: string;
  title: string;
  coverUrl: string;
  summary: string;
  isOfficial: boolean;
};

// The mini program uses these packaged slides when the public feeds are empty.
const defaultSlides: Slide[] = [
  {
    id: "scenery-mountains",
    title: "把周末还给山野",
    subtitle: "原创山野影像 · 一起向外走",
    imageUrl: "/assets/category-weekly.jpg",
  },
  {
    id: "scenery-camp",
    title: "在星空下，慢下来",
    subtitle: "原创露营影像 · 留一点时间给自己",
    imageUrl: "/assets/category-holiday.jpg",
  },
  {
    id: "scenery-coast",
    title: "沿着海风去出发",
    subtitle: "原创海岸影像 · 一起向外走",
    imageUrl: "/assets/category-leisure.jpg",
  },
];
const customSlides = computed(() =>
  props.config.slides.filter((slide) => slide.imageUrl),
);
const source = computed(() =>
  props.config.mode === "CUSTOM" && customSlides.value.length
    ? "CUSTOM_SLIDES"
    : props.config.mode,
);
const publicSlides = ref<Slide[]>([]);
const publicSourceLabel = ref("");
const loadError = ref(false);
const slides = computed(() =>
  source.value === "CUSTOM_SLIDES" ? customSlides.value : publicSlides.value,
);
const index = ref(0);
const current = computed(() => slides.value[index.value]);
const sourceLabel = computed(() =>
  source.value === "CUSTOM_SLIDES" ? "自定义轮播图" : publicSourceLabel.value,
);

defineExpose({
  slides,
  index,
  sourceLabel,
  selectSlide(next: number) {
    index.value = next;
  },
});

watch(
  source,
  async (mode, _, onCleanup) => {
    index.value = 0;
    if (mode === "CUSTOM_SLIDES") return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const options = { signal: controller.signal };
    publicSlides.value = [];
    publicSourceLabel.value = "";
    loadError.value = false;
    try {
      const { items } = await request<Page<Article>>(
        "/articles?page=0&size=10",
        options,
      );
      if (controller.signal.aborted) return;
      const articles = items.filter((article) => !article.isOfficial);
      if (articles.length) {
        publicSourceLabel.value = "已发布文章";
        publicSlides.value = articles.map(
          ({ id, title, coverUrl, summary }) => ({
            id,
            title,
            imageUrl: coverUrl,
            subtitle: summary,
          }),
        );
        return;
      }
    } catch {
      if (controller.signal.aborted) return;
      loadError.value = mode === "AUTO_ARTICLES";
    }
    if (mode === "AUTO_ARTICLES") {
      try {
        const home = await request<{ banners: Slide[] }>("/home", options);
        if (controller.signal.aborted) return;
        if (home.banners?.length) {
          publicSourceLabel.value = "活动封面（备用内容）";
          publicSlides.value = home.banners;
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    }
    publicSourceLabel.value = "内置风景图（备用内容）";
    publicSlides.value = defaultSlides;
  },
  { immediate: true },
);

watch(
  () => slides.value.length,
  (length) => {
    if (index.value >= length) index.value = Math.max(0, length - 1);
  },
);
</script>

<template>
  <div>
    <button
      type="button"
      class="gallery-edit"
      :aria-pressed="active"
      aria-label="编辑图集轮播模块"
      @click="$emit('edit')"
    >
      <small v-if="config.eyebrow" class="gallery-eyebrow">{{
        config.eyebrow
      }}</small>
      <strong class="gallery-title">{{ config.title }}</strong>
      <small v-if="loadError && source === 'AUTO_ARTICLES'" class="muted"
        >文章加载失败</small
      >
      <span v-if="current" class="gallery-slide">
        <img v-if="current.imageUrl" :src="current.imageUrl" alt="" />
        <span class="gallery-copy">
          <strong v-if="current.title">{{ current.title }}</strong>
          <small v-if="current.subtitle">{{ current.subtitle }}</small>
        </span>
      </span>
      <small v-else class="muted">正在加载轮播内容…</small>
    </button>
    <div v-if="slides.length > 1" class="gallery-controls">
      <button
        type="button"
        aria-label="上一张轮播图"
        @click="index = (index + slides.length - 1) % slides.length"
      >
        <AppIcon name="back" :size="14" />
      </button>
      <span aria-live="polite">{{ index + 1 }} / {{ slides.length }}</span>
      <button
        type="button"
        aria-label="下一张轮播图"
        @click="index = (index + 1) % slides.length"
      >
        <AppIcon name="arrow" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.gallery-edit {
  display: grid;
  width: 100%;
  gap: 3px;
  padding: 0;
  background: transparent;
  color: inherit;
  border: 0;
  text-align: left;
  cursor: pointer;
}
.gallery-eyebrow {
  color: var(--rf-muted);
  font-size: 9px;
}
.gallery-title {
  margin-bottom: 3px;
  font-size: 12px;
}
.gallery-slide {
  position: relative;
  display: grid;
  align-items: end;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1.85;
  background: #3a5241;
  border-radius: 6px;
}
.gallery-slide img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery-copy {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 16px 8px 8px;
  background: linear-gradient(transparent, #102018c9);
  color: white;
  font-size: 12px;
  min-width: 0;
}
.gallery-copy strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.gallery-copy small {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gallery-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.gallery-controls button {
  display: grid;
  place-items: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
}
</style>
