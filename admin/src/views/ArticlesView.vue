<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Activity, Page } from "../types";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import RichContentEditor from "../components/RichContentEditor.vue";
type Article = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  activityId: string | null;
  status: "DRAFT" | "PUBLISHED";
  isOfficial: boolean;
  version: number;
};
const items = ref<Article[]>([]),
  page = ref(0),
  more = ref(false),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  success = ref("");
const opened = ref(false),
  selected = ref<Article | null>(null),
  contentKey = ref(0),
  rich = ref<InstanceType<typeof RichContentEditor> | null>(null);
const form = reactive({ title: "", summary: "", coverUrl: "", activityId: "" });
const snapshot = ref(""),
  sources = ref<Activity[]>([]),
  sourcePage = ref(0),
  sourceMore = ref(false),
  sourceBusy = ref(false);
const dirty = computed(() => JSON.stringify(form) !== snapshot.value);
const locked = computed(
  () => busy.value || selected.value?.status === "PUBLISHED",
);
const contentPending = computed(
  () =>
    !!selected.value &&
    (!rich.value?.loaded || rich.value?.busy || rich.value?.dirty),
);
function articleError(e: unknown) {
  return e instanceof ApiError && e.status === 409
    ? "文章版本或状态已变化，请重新加载后核对；不会自动覆盖。"
    : errorMessage(e);
}
let epoch = 0;
function reset() {
  epoch++;
  opened.value = false;
  selected.value = null;
  items.value = [];
  sources.value = [];
  busy.value = false;
  loading.value = false;
  sourceBusy.value = false;
  error.value = "";
  success.value = "";
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load();
  }
});
onUnmounted(reset);
async function load(append = false) {
  if (loading.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value,
    p = append ? page.value + 1 : 0;
  loading.value = true;
  error.value = "";
  try {
    const result = await request<Page<Article>>(
      `/admin/articles?page=${p}&size=20`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = append ? [...items.value, ...result.items] : result.items;
    page.value = p;
    more.value = result.hasMore;
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
async function loadSources(append = false) {
  if (sourceBusy.value) return;
  const n = epoch,
    actor = currentUser.value,
    p = append ? sourcePage.value + 1 : 0;
  sourceBusy.value = true;
  try {
    const r = await request<Page<Activity>>(
      `/admin/activities?page=${p}&size=50`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    sources.value = append ? [...sources.value, ...r.items] : r.items;
    sourcePage.value = p;
    sourceMore.value = r.hasMore;
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) sourceBusy.value = false;
  }
}
function fill(article: Article | null) {
  selected.value = article;
  Object.assign(form, {
    title: article?.title || "",
    summary: article?.summary || "",
    coverUrl: article?.coverUrl || "",
    activityId: article?.activityId || "",
  });
  snapshot.value = JSON.stringify(form);
  contentKey.value++;
}
async function open(article: Article | null) {
  if (busy.value || !currentUser.value) return;
  error.value = "";
  success.value = "";
  if (!article) {
    fill(null);
    opened.value = true;
    void loadSources();
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  try {
    const latest = await request<Article>(`/admin/articles/${article.id}`);
    if (n !== epoch || actor !== currentUser.value) return;
    fill(latest);
    opened.value = true;
    void loadSources();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function canLeave() {
  return (
    (!dirty.value || window.confirm("文章信息尚未保存，确定离开吗？")) &&
    (!rich.value || rich.value.canLeave())
  );
}
function close() {
  if (busy.value || rich.value?.busy || !canLeave()) return;
  opened.value = false;
  selected.value = null;
}
onBeforeRouteLeave(
  (to) =>
    to.path === "/login" ||
    !opened.value ||
    (!busy.value && !rich.value?.busy && canLeave()),
);
async function reload() {
  if (!selected.value || busy.value || rich.value?.busy || !canLeave()) return;
  const id = selected.value.id,
    n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(`/admin/articles/${id}`);
    if (n === epoch && actor === currentUser.value) fill(a);
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function contentSaved(version: number) {
  if (selected.value) {
    selected.value.version = version;
    const row = items.value.find((a) => a.id === selected.value?.id);
    if (row) row.version = version;
  }
}
async function save() {
  if (locked.value || contentPending.value || !currentUser.value) return;
  if (!form.title.trim()) {
    error.value = "请填写文章标题";
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(
      `/admin/articles${selected.value ? "/" + selected.value.id : ""}`,
      {
        method: selected.value ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          activityId: form.activityId || null,
          version: selected.value?.version,
        }),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    fill(a);
    success.value = "文章信息已保存，请编辑并保存图文后发布";
    await load();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function action(kind: "publish" | "unpublish" | "official") {
  if (
    !selected.value ||
    busy.value ||
    dirty.value ||
    contentPending.value ||
    !currentUser.value
  )
    return;
  const messages = {
    publish: "确认发布这篇文章？发布后将在小程序公开展示。",
    unpublish: "确认下架文章？小程序将不再展示此文。",
    official: "设为野小子官方介绍？将替换当前官方介绍入口。",
  };
  if (!window.confirm(messages[kind])) return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const a = await request<Article>(
      `/admin/articles/${selected.value.id}/${kind}`,
      {
        method: "POST",
        body: JSON.stringify({ version: selected.value.version }),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    fill(a);
    success.value = "文章设置已更新";
    await load();
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
onMounted(() => void load());
</script>
<template>
  <main class="workspace">
    <div class="page-heading">
      <div>
        <h1>文章管理</h1>
        <p>统一编辑活动回顾与介绍文章；已发布文章可设为野小子官方介绍。</p>
      </div>
      <button class="primary button" :disabled="busy" @click="open(null)">
        新建文章
      </button>
    </div>
    <p v-if="error && !opened" class="error-box" role="alert">{{ error }}</p>
    <p v-if="success && !opened" role="status">{{ success }}</p>
    <button
      class="secondary button"
      :disabled="loading || busy"
      @click="load()"
    >
      {{ loading ? "加载中…" : "刷新文章" }}
    </button>
    <p v-if="!loading && !items.length">暂无文章，创建草稿并发布后即可展示。</p>
    <div class="table-scroll">
      <table v-if="items.length">
        <thead>
          <tr>
            <th>标题</th>
            <th>状态</th>
            <th>入口</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="article in items" :key="article.id">
            <td>{{ article.title }}</td>
            <td>{{ article.status === "PUBLISHED" ? "已发布" : "草稿" }}</td>
            <td>{{ article.isOfficial ? "野小子官方介绍" : "探索页文章" }}</td>
            <td>
              <button
                class="text-button"
                :disabled="busy"
                @click="open(article)"
              >
                查看 / 编辑
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="more" :disabled="loading" @click="load(true)">
      加载更多文章
    </button>
    <FormModal v-if="opened" size="xl" @close="close">
      <h2>{{ selected ? "编辑文章" : "新建文章" }}</h2>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <button v-if="selected" :disabled="busy || !!rich?.busy" @click="reload">
        重新加载文章
      </button>
      <p v-if="selected?.status === 'PUBLISHED'">
        已发布文章为只读，需先下架再编辑。下架官方介绍后需重新发布并设为官方介绍。
      </p>
      <form @submit.prevent="save">
        <fieldset :disabled="locked || !!rich?.busy">
          <label
            >标题<input
              v-model="form.title"
              required
              maxlength="120"
              aria-label="文章标题"
          /></label>
          <label
            >摘要<textarea
              v-model="form.summary"
              maxlength="500"
              aria-label="文章摘要"
            />
          </label>
          <label
            >封面图片<input
              v-model="form.coverUrl"
              aria-label="文章封面"
              placeholder="HTTPS 或 /assets/ 图片地址"
          /></label>
          <ImageUpload
            :disabled="locked || !!rich?.busy"
            @uploaded="form.coverUrl = $event"
          />
          <label
            >关联活动（选填）<select
              v-model="form.activityId"
              aria-label="关联活动"
            >
              <option value="">不关联活动</option>
              <option
                v-if="
                  form.activityId &&
                  !sources.some((a) => a.id === form.activityId)
                "
                :value="form.activityId"
              >
                当前关联活动 {{ form.activityId }}
              </option>
              <option v-for="a in sources" :key="a.id" :value="a.id">
                {{ a.title }}
              </option>
            </select></label
          >
          <button
            v-if="sourceMore"
            type="button"
            :disabled="sourceBusy"
            @click="loadSources(true)"
          >
            加载更多活动
          </button>
          <button
            type="submit"
            class="primary button"
            :disabled="contentPending"
          >
            保存文章信息
          </button>
        </fieldset>
      </form>
      <RichContentEditor
        v-if="selected"
        :key="contentKey"
        ref="rich"
        managed-navigation
        :path="`/admin/articles/${selected.id}/content`"
        :disabled="locked"
        @saved="contentSaved"
      />
      <p v-if="dirty || rich?.dirty">
        有未保存修改，请先保存文章信息和图文再发布或设置入口。
      </p>
      <div v-if="selected" class="article-actions">
        <button
          v-if="selected.status === 'DRAFT'"
          class="primary button"
          :disabled="busy || dirty || contentPending"
          @click="action('publish')"
        >
          发布文章
        </button>
        <template v-else
          ><button
            :disabled="busy || contentPending"
            @click="action('unpublish')"
          >
            下架并编辑</button
          ><button
            :disabled="busy || contentPending || selected.isOfficial"
            @click="action('official')"
          >
            {{ selected.isOfficial ? "当前官方介绍" : "设为官方介绍" }}
          </button></template
        >
      </div>
      <button
        class="secondary button"
        :disabled="busy || !!rich?.busy"
        @click="close"
      >
        关闭
      </button>
    </FormModal>
  </main>
</template>
<style scoped>
fieldset {
  border: 0;
  padding: 0;
  display: grid;
  gap: 16px;
}
label {
  display: grid;
  gap: 8px;
}
.article-actions {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}
</style>
