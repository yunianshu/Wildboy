<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentUser, clearSession } from "./api";
import AppIcon from "./components/AppIcon.vue";
import brandLogo from "./assets/platform-brand-original-transparent.png";
const adminVersion = __ADMIN_VERSION__;
const route = useRoute(),
  router = useRouter();
const pageTitles: Record<string, string> = {
  "/settings/admin-account": "管理员账号",
  "/users": "用户管理",
  "/memberships": "会员管理",
  "/activity-orders": "活动订单",
  "/shop/categories": "商品分类",
  "/settings": "基础配置",
  "/articles": "文章管理",
  "/operations": "运营工作台",
  "/templates": "活动模板",
  "/refunds": "退款售后",
  "/notifications": "消息管理",
  "/shipping-reports": "发货上报",
  "/shop": "商城管理",
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
    label: "商城",
    key: "shop",
    items: [
      { path: "/shop", title: "商城管理", icon: "bag" },
      { path: "/shop/categories", title: "商品分类", icon: "template" },
      { path: "/refunds", title: "退款售后", icon: "refund" },
      { path: "/shipping-reports", title: "发货上报", icon: "order" },
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
// 模块归属保持不变，侧栏直接显示全部有效入口。
const moduleBySection: Record<string, string> = {
  "/operations": "ops",
  "/notifications": "ops",
  "/shop": "shop",
  "/shop/categories": "shop",
  "/refunds": "shop",
  "/shipping-reports": "shop",
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
const pageModule = computed(
  () => moduleBySection[currentSection.value] ?? "activity",
);
const activeGroup = computed(
  () =>
    navigation.find((group) => group.key === pageModule.value) || navigation[1],
);
// 子导航：列表页显示同模块兄弟页；编辑/详情页显示返回入口。
const isEditorRoute = computed(
  () =>
    route.path !== currentSection.value &&
    !navigationByPath.some((item) => item.path === route.path),
);
const siblingPages = computed(() =>
  activeGroup.value.items.filter((item) => item.path !== currentSection.value),
);
const backLink = computed(() => ({
  path: currentSection.value,
  title: navigationByPath.find((item) => item.path === currentSection.value)
    ?.title,
}));
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
  <div v-else class="app-shell morning-shell" :data-module="pageModule">
    <header class="topnav">
      <RouterLink
        class="brand"
        to="/activities"
        aria-label="野小子管理后台首页"
      >
        <img class="brand-logo" :src="brandLogo" alt="" /><span
          class="brand-label"
          >管理后台</span
        >
      </RouterLink>
      <nav class="sidebar-nav" aria-label="管理页面">
        <template v-for="group in navigation" :key="group.key">
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            class="sidebar-link"
            :class="{ 'is-active': currentSection === item.path }"
            :aria-current="currentSection === item.path ? 'page' : undefined"
            :to="item.path"
          >
            <AppIcon :name="item.icon" :size="18" />{{ item.title }}
          </RouterLink>
        </template>
      </nav>
      <div class="topnav-admin">
        <AppIcon name="user" :size="24" />
        <span class="admin-name"
          >{{ currentUser?.nickname || "管理员"
          }}<small>后台版本 {{ adminVersion }}</small></span
        >
        <button class="text-button logout" @click="logout">退出登录</button>
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
    </header>
    <div class="main-shell">
      <div
        v-if="route.path !== '/activities'"
        class="subnav"
        aria-label="当前页面"
      >
        <RouterLink
          v-if="isEditorRoute && backLink.path"
          class="subnav-back"
          :to="backLink.path"
          ><AppIcon name="back" :size="16" />{{ backLink.title }}</RouterLink
        >
        <h1 class="subnav-title">{{ pageTitle }}</h1>
        <RouterLink
          v-for="item in siblingPages"
          :key="item.path"
          class="subnav-link"
          :to="item.path"
          >{{ item.title }}</RouterLink
        >
      </div>
      <RouterView :key="route.path" />
    </div>
  </div>
</template>
