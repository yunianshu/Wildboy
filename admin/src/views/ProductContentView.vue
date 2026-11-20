<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router";
import { currentUser, errorMessage, request } from "../api";
import AppIcon from "../components/AppIcon.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import UiState from "../components/UiState.vue";
import type { Product } from "../types";

const route = useRoute();
const productId = computed(() => String(route.params.id));
const productPath = computed(() => `/admin/shop/products/${encodeURIComponent(productId.value)}`);
const backTarget = computed(() => ({ path: "/shop", query: route.query }));
const product = ref<Product | null>(null);
const loading = ref(false);
const error = ref("");
const layout = ref<"workbench" | "document">("workbench");
const editor = ref<InstanceType<typeof MarkdownEditor>>();
const savedVersion = ref<number | null>(null);
let controller: AbortController | undefined;

async function loadProduct() {
  controller?.abort();
  product.value = null;
  savedVersion.value = null;
  error.value = "";
  if (!currentUser.value) return;
  const attempt = new AbortController();
  controller = attempt;
  loading.value = true;
  try {
    const result = await request<Product>(productPath.value, { signal: attempt.signal });
    if (!attempt.signal.aborted) product.value = result;
  } catch (e) {
    if (!attempt.signal.aborted) error.value = errorMessage(e);
  } finally {
    if (!attempt.signal.aborted) loading.value = false;
  }
}

async function canLeave() {
  return !editor.value?.busy && (await editor.value?.canLeave() ?? true);
}

async function loadLatest() {
  const current = editor.value;
  if (current && await canLeave() && current === editor.value) {
    savedVersion.value = null;
    await current.load();
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!editor.value?.dirty && !editor.value?.busy) return;
  event.preventDefault();
  event.returnValue = "";
}

watch([productId, currentUser], () => void loadProduct(), { immediate: true });
onBeforeRouteLeave((to) => to.path === "/login" || canLeave());
onBeforeRouteUpdate((to, from) => to.params.id === from.params.id || canLeave());
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onUnmounted(() => {
  controller?.abort();
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<template>
  <main class="workspace product-content">
    <header class="page-heading">
      <h1>编辑商品图文</h1>
      <div class="action-row">
        <RouterLink class="secondary button" :to="backTarget">
          <AppIcon name="back" :size="16" /> 返回商品
        </RouterLink>
      </div>
    </header>
    <UiState v-if="loading" kind="loading" compact>正在读取商品…</UiState>
    <UiState v-else-if="error" kind="error" compact>
      {{ error }} <button type="button" class="secondary" @click="loadProduct">重试</button>
    </UiState>
    <template v-else-if="product">
      <section class="product-document" :class="{ 'is-document': layout === 'document' }">
        <div class="product-document-header">
          <h2>{{ product.name }}</h2>
          <nav class="layout-switch" aria-label="编辑布局">
            <button type="button" :aria-pressed="layout === 'workbench'" @click="layout = 'workbench'">工作台</button>
            <button type="button" :aria-pressed="layout === 'document'" @click="layout = 'document'">文档</button>
          </nav>
        </div>
        <MarkdownEditor
          :key="productId"
          ref="editor"
          :path="`${productPath}/content/markdown`"
          :components="layout === 'workbench'"
          managed-navigation
          @saved="savedVersion = $event"
        />
      </section>
      <footer class="product-content-footer">
        <span class="muted" role="status">
          {{ editor?.dirty ? "有未保存修改" : savedVersion !== null ? `图文已保存 · 版本 ${savedVersion}` : "" }}
        </span>
        <div class="footer-actions">
          <button v-if="editor?.versionConflict" type="button" class="secondary" :disabled="editor.busy" @click="loadLatest">
            读取最新版本
          </button>
          <button
            type="button"
            class="primary"
            :disabled="!editor?.ready || !editor.loaded || !editor.dirty || editor.busy || editor.versionConflict"
            @click="editor?.save()"
          >
            保存图文
          </button>
        </div>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.product-document {
  min-width: 0;
}
.product-document.is-document {
  max-width: 900px;
  margin-inline: auto;
}
.product-document-header,
.product-content-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.product-document-header {
  margin-bottom: 12px;
}
.product-document-header h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
.layout-switch {
  display: flex;
  gap: 4px;
}
.layout-switch button[aria-pressed="true"] {
  color: var(--rf-primary-text);
  background: var(--rf-nav-active);
  border-color: var(--rf-primary);
}
.product-content-footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-top: 16px;
  padding-block: 12px;
  border-top: 1px solid var(--rf-line);
  background: var(--rf-surface);
}
.product-content-footer .footer-actions {
  margin: 0 0 0 auto;
}
</style>
