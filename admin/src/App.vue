<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentUser, clearSession } from "./api";
import AppIcon from "./components/AppIcon.vue";
const adminVersion = __ADMIN_VERSION__;
const route = useRoute(),
  router = useRouter();
const pageTitles: Record<string, string> = {
  "/settings/admin-account": "管理员账号",
  "/users": "用户管理",
  "/memberships": "会员管理",
  "/activity-orders": "活动订单",
  "/settings": "基础配置",
  "/articles": "文章管理",
  "/operations": "运营工作台",
  "/templates": "活动模板",
  "/notifications": "消息管理",
  "/legal": "协议管理",
};
const navigation = [
  {
    label: "运营",
    key: "ops",
    items: [
      { path: "/operations", title: "运营工作台", icon: "dashboard" },
      { path: "/notifications", title: "消息管理", icon: "bell" },
    ],
  },
  {
    label: "活动",
    key: "activity",
    items: [
      { path: "/activities", title: "活动管理", icon: "mountain" },
      { path: "/templates", title: "活动模板", icon: "template" },
      { path: "/activity-orders", title: "活动订单", icon: "order" },
    ],
  },
  {
    label: "用户",
    key: "user",
    items: [
      { path: "/users", title: "用户管理", icon: "user" },
      { path: "/memberships", title: "会员管理", icon: "user" },
    ],
  },
  {
    label: "内容与设置",
    key: "content",
    items: [
      { path: "/articles", title: "文章管理", icon: "document" },
      { path: "/legal", title: "协议管理", icon: "document" },
      { path: "/settings", title: "基础配置", icon: "dashboard" },
      { path: "/settings/admin-account", title: "管理员账号", icon: "shield" },
    ],
  },
];
const navigationByPath = navigation
  .flatMap((group) => group.items)
  .sort((a, b) => b.path.length - a.path.length);
const moduleBySection: Record<string, string> = {
  "/operations": "ops",
  "/notifications": "ops",
  "/users": "user",
  "/memberships": "user",
  "/articles": "content",
  "/legal": "content",
  "/settings": "content",
  "/settings/admin-account": "content",
};
const currentSection = computed(
  () =>
    navigationByPath.find(
      (item) =>
        route.path === item.path || route.path.startsWith(`${item.path}/`),
    )?.path || "/activities",
);
const currentGroup = computed(
  () =>
    navigation.find((group) =>
      group.items.some((item) => item.path === currentSection.value),
    )?.label || "活动",
);
const pageModule = computed(
  () => moduleBySection[currentSection.value] ?? "activity",
);
async function switchSection(event: Event) {
  const select = event.target as HTMLSelectElement;
  await router.push(select.value);
  // A page's unsaved-change guard can cancel navigation.
  select.value = currentSection.value;
}
const pageTitle = computed(() => {
  const path = route.path;
  if (pageTitles[path]) return pageTitles[path];
  if (path.endsWith("registrations")) return "报名名单";
  if (path.endsWith("edit"))
    return path.startsWith("/articles/") ? "编辑文章" : "编辑活动";
  if (path.endsWith("new"))
    return path.startsWith("/articles/") ? "新建文章" : "新建活动";
  return "活动工作台";
});
watch(currentUser, (user) => {
  if (!user && route.path !== "/login") void router.replace("/login");
});
function logout() {
  clearSession();
  void router.replace("/login");
}
</script>
<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="app-shell" :data-module="pageModule">
    <aside class="sidebar">
      <RouterLink class="brand" to="/activities" aria-label="野小子后台首页">
        <span class="brand-mark"><AppIcon name="mountain" :size="23" /></span>
        <span class="brand-copy">WILDBOY<small>OUTDOOR CLUB</small></span>
      </RouterLink>
      <nav class="sidebar-nav" aria-label="管理页面">
        <div
          v-for="group in navigation"
          :key="group.label"
          class="nav-group"
          :data-group="group.key"
        >
          <p class="nav-label">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            class="nav-link"
            :class="{ 'is-active': currentSection === item.path }"
            :aria-current="currentSection === item.path ? 'page' : undefined"
            :to="item.path"
            ><AppIcon :name="item.icon" />{{ item.title }}</RouterLink
          >
        </div>
      </nav>
      <div class="sidebar-bottom">
        <span><i class="live-dot"></i>野小子运营管理中心</span>
        <p>后台版本 {{ adminVersion }}</p>
      </div>
      <label class="mobile-nav">
        <span class="sr-only">切换管理页面</span>
        <select :value="currentSection" @change="switchSection">
          <optgroup
            v-for="group in navigation"
            :key="group.label"
            :label="group.label"
          >
            <option
              v-for="item in group.items"
              :key="item.path"
              :value="item.path"
            >
              {{ item.title }}
            </option>
          </optgroup>
        </select>
      </label>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="topbar-context">
          <span class="topbar-title"
            >{{ currentGroup }} <span>/</span>
            <strong>{{ pageTitle }}</strong></span
          >
        </div>
        <div class="user-tools">
          <span class="user-avatar" aria-hidden="true">{{
            (currentUser?.nickname || "管理员").slice(0, 1)
          }}</span>
          <span class="user-name">{{ currentUser?.nickname || "管理员" }}</span>
          <button class="logout-button" @click="logout">
            <AppIcon name="logout" :size="16" />退出登录
          </button>
        </div>
      </header>
      <RouterView :key="route.path" />
    </div>
  </div>
</template>
