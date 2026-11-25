<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentUser, clearSession, sessionExpired } from "./api";
import { askConfirm } from "./confirm";
import AppIcon from "./components/AppIcon.vue";
const adminVersion = __ADMIN_VERSION__;
const route = useRoute(),
  router = useRouter();
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
      { path: "/home-layout", title: "首页装修", icon: "dashboard" },
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
  "/home-layout": "content",
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
async function switchSection(event: Event) {
  const select = event.target as HTMLSelectElement;
  await router.push(select.value);
  // A page's unsaved-change guard can cancel navigation.
  select.value = currentSection.value;
}
let signingOut = false;
watch(currentUser, (user) => {
  if (!user && route.path !== "/login") {
    const query = signingOut
      ? {}
      : {
          redirect: route.fullPath,
          reason: sessionExpired.value ? "expired" : undefined,
        };
    signingOut = false;
    void router.replace({
      path: "/login",
      query,
    });
  }
});

async function logout() {
  const actor = currentUser.value;
  if (
    !actor ||
    !(await askConfirm({
      title: "退出登录？",
      description: "退出后，当前页面未保存的修改会丢失。",
      confirmLabel: "退出登录",
    })) ||
    actor !== currentUser.value
  )
    return;
  signingOut = true;
  clearSession();
}
</script>
<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="app-shell morning-shell" :data-module="pageModule">
    <aside class="topnav">
      <RouterLink
        class="brand"
        to="/activities"
        aria-label="野小子管理后台首页"
      >
        <span class="brand-mark"><AppIcon name="mountain" :size="25" /></span>
        <span class="brand-copy"
          ><strong>WILDBOY</strong><small>野小子运营中心</small></span
        >
      </RouterLink>
      <div class="sidebar-status">
        <span></span>运营系统在线<small>PRO</small>
      </div>
      <nav class="sidebar-nav" aria-label="管理页面">
        <div
          v-for="(group, groupIndex) in navigation"
          :key="group.key"
          class="sidebar-group"
          role="group"
          :aria-label="group.label"
        >
          <p class="sidebar-group-label">
            <span>{{ group.label }}</span
            ><span>0{{ groupIndex + 1 }}</span>
          </p>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            class="sidebar-link"
            :class="{ 'is-active': currentSection === item.path }"
            :aria-current="currentSection === item.path ? 'page' : undefined"
            :to="item.path"
          >
            <AppIcon :name="item.icon" :size="18" /><span>{{
              item.title
            }}</span>
          </RouterLink>
        </div>
      </nav>
      <div class="topnav-admin">
        <span class="admin-avatar">{{
          (currentUser?.nickname || "管理员").slice(0, 1)
        }}</span>
        <span class="admin-name"
          >{{ currentUser?.nickname || "管理员"
          }}<small>后台版本 {{ adminVersion }}</small></span
        >
        <button class="text-button logout" title="退出登录" @click="logout">
          <AppIcon name="logout" :size="17" /><span>退出登录</span>
        </button>
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
      <RouterView :key="route.path" />
    </div>
  </div>
</template>

<style scoped>
.sidebar-group {
  display: grid;
  gap: 3px;
  margin-bottom: 10px;
}
.sidebar-group-label {
  display: flex;
  justify-content: space-between;
  margin: 6px 0 4px;
  padding-inline: 12px;
  color: #7f998b;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
}
.sidebar-group-label span:last-child {
  color: #526f60;
  font-variant-numeric: tabular-nums;
}
</style>
