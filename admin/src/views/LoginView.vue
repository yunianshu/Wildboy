<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login, devLogin, errorMessage } from "../api";
const router = useRouter(),
  username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
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
    await router.replace("/activities");
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
      <div>
        <h1>把下一场<br />山野之约，<br /><em>认真安排好。</em></h1>
      </div>
      <small>WILDBOY / 活动管理工作台</small>
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
              type="password"
              autocomplete="current-password"
              required
              maxlength="200"
              :disabled="busy"
          /></label>
          <p v-if="error" role="alert" class="error-box">{{ error }}</p>
          <button class="primary full" :disabled="busy">
            {{ busy ? "正在验证…" : "进入工作台 →" }}
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
      </div>
    </section>
  </main>
</template>
