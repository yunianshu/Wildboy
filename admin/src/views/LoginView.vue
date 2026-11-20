<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, devLogin, errorMessage } from "../api";
const adminVersion = __ADMIN_VERSION__;
const route = useRoute();
const router = useRouter(),
  username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
const showPassword = ref(false);
const demoEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
async function submit(demo = false) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (demo) await devLogin();
    else await login(username.value, password.value);
    password.value = "";
    const redirect = route.query.redirect;
    const target = typeof redirect === "string" && redirect.startsWith("/")
      && !redirect.startsWith("//") && !/[\u0000-\u0020\\]/.test(redirect)
      ? router.resolve(redirect)
      : null;
    await router.replace(target && target.path !== "/login" && target.matched.length
      ? target.fullPath : "/activities");
  } catch (e) {
    error.value = errorMessage(e);
    password.value = "";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="login-layout">
    <section class="login-story">
      <a class="brand" href="#/login">WILDBOY<span>OUTDOOR CLUB</span></a>
      <h1>野小子运营后台</h1>
      <p v-if="route.query.reason === 'expired'" class="error-box" role="status">登录已过期，请重新登录。</p>
    </section>
    <section class="login-panel">
      <div class="login-form">
        <h2>管理员登录</h2>
        <form @submit.prevent="submit(false)">
          <label
            >管理员账号<input
              v-model="username"
              name="username"
              autocomplete="username"
              required
              maxlength="100"
              :disabled="busy" /></label
          ><label
            >登录密码<input
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              maxlength="200"
              :disabled="busy"
          /></label>
          <button type="button" class="text-button" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? "隐藏密码" : "显示密码" }}</button>
          <p v-if="error" role="alert" class="error-box">{{ error }}</p>
          <button class="primary full" :disabled="busy">
            {{ busy ? "正在验证…" : "登录" }}
          </button>
        </form>
        <button
          v-if="demoEnabled"
          class="secondary full demo-login"
          :disabled="busy"
          @click="submit(true)"
        >
          开发环境 · 演示登录
        </button>
        <p class="login-note">
          刷新后需重新登录。请勿在公共设备上展示报名名单。
        </p>
        <p class="login-version admin-version">后台版本 {{ adminVersion }}</p>
      </div>
    </section>
  </main>
</template>
