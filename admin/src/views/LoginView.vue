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
        <p class="eyebrow">LESS SCROLL. MORE SOUL.</p>
        <h1>把下一场<br />山野之约，<br /><em>认真安排好。</em></h1>
        <p>
          活动管理 · 路线编辑 · 报名名单<br />让出发之前的每一步，都井然有序。
        </p>
      </div>
      <small>WILDBOY / 活动管理工作台</small>
    </section>
    <section class="login-panel">
      <div class="login-form">
        <p class="eyebrow">WELCOME BACK</p>
        <h2>开始筹备下一次出发</h2>
        <p class="muted">使用管理员账号登录。报名用户不能进入管理后台。</p>
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
          本地开发环境 · 演示管理员登录
        </button>
        <p class="login-note">
          安全提示：会话仅保存在内存中，刷新页面后需重新登录。请勿在公共设备上展示报名名单。
        </p>
      </div>
    </section>
  </main>
</template>
