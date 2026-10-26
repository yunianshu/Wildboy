<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentUser, clearSession } from "./api";
const route = useRoute(),
  router = useRouter();
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
      <RouterLink class="nav-link" to="/activities"
        ><span>↗</span>活动管理</RouterLink
      >
      <div class="sidebar-bottom">
        <span class="live-dot"></span> 报名服务已接入后端
        <p>微信支付暂未启用<br />装备小店仅作展示</p>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <span
          >户外活动管理 /
          <strong>{{
            route.path.endsWith("registrations")
              ? "报名名单"
              : route.path.endsWith("edit")
                ? "编辑活动"
                : route.path.endsWith("new")
                  ? "新建活动"
                  : "活动工作台"
          }}</strong></span
        >
        <div class="user-tools">
          <span>{{ currentUser?.nickname || "管理员" }}</span
          ><button class="text-button" @click="logout">退出登录</button>
        </div>
      </header>
      <RouterView />
    </div>
  </div>
</template>
