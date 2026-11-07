<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentUser, clearSession } from "./api";
const route = useRoute(),
  router = useRouter();
const pageTitles: Record<string, string> = {
  "/settings/admin-account": "管理员账号",
  "/users": "用户管理",
  "/shop/categories": "商品分类",
  "/settings": "基础配置",
  "/articles": "文章管理",
  "/waitlist": "候补名单",
  "/operations": "运营工作台",
  "/templates": "活动模板",
  "/refunds": "退款售后",
  "/notifications": "消息管理",
  "/shop": "商城管理",
  "/legal": "协议管理",
};
const pageTitle = computed(() => {
  const path = route.path;
  if (pageTitles[path]) return pageTitles[path];
  if (path.endsWith("registrations")) return "报名名单";
  if (path.endsWith("edit")) return "编辑活动";
  if (path.endsWith("new")) return "新建活动";
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
  <div v-else class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/activities"
        >WILDBOY<span>OUTDOOR CLUB</span></RouterLink
      >
      <p class="nav-label">工作空间</p>
      <RouterLink class="nav-link" to="/operations"
        ><span>◫</span>运营工作台</RouterLink
      >
      <RouterLink class="nav-link" to="/templates"
        ><span>◇</span>活动模板</RouterLink
      >
      <RouterLink class="nav-link" to="/refunds"
        ><span>↶</span>退款售后</RouterLink
      >
      <RouterLink class="nav-link" to="/waitlist"
        ><span>◷</span>候补名单</RouterLink
      >
      <RouterLink class="nav-link" to="/notifications"
        ><span>◉</span>消息管理</RouterLink
      >
      <RouterLink class="nav-link" to="/activities"
        ><span>↗</span>活动管理</RouterLink
      >
      <RouterLink class="nav-link" to="/shop"
        ><span>▣</span>商城管理</RouterLink
      >
      <RouterLink class="nav-link" to="/shop/categories"
        ><span>▦</span>商品分类</RouterLink
      >
      <RouterLink class="nav-link" to="/users"
        ><span>◒</span>用户管理</RouterLink
      >
      <RouterLink class="nav-link" to="/articles"
        ><span>▤</span>文章管理</RouterLink
      >
      <RouterLink class="nav-link" to="/legal"
        ><span>≡</span>协议管理</RouterLink
      >
      <RouterLink class="nav-link" to="/settings"
        ><span>⚙</span>基础配置</RouterLink
      >
      <RouterLink class="nav-link" to="/settings/admin-account"
        ><span>✦</span>管理员账号</RouterLink
      >
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <span>户外活动管理 / <strong>{{ pageTitle }}</strong></span>
        <div class="user-tools">
          <span>{{ currentUser?.nickname || "管理员" }}</span
          ><button class="text-button" @click="logout">退出登录</button>
        </div>
      </header>
      <RouterView :key="route.path" />
    </div>
  </div>
</template>
