<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login, devLogin, errorMessage } from "../api";
const adminVersion = __ADMIN_VERSION__;
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
      <a class="brand" href="#/login" aria-label="野小子登录页">
        <span class="brand-mark" aria-hidden="true">W</span>
        <span class="brand-copy">WILDBOY<small>OUTDOOR CLUB</small></span>
      </a>
      <div class="login-story-content">
        <p class="login-kicker">OUTDOOR OPERATIONS</p>
        <h1>让每一次出发，<br />都有序抵达。</h1>
        <p>活动、订单、会员与内容，一站式管理。</p>
      </div>
      <p class="login-story-footer">走进山野，也管好山野里的每个细节。</p>
    </section>
    <section class="login-panel">
      <div class="login-form">
        <h2>管理员登录</h2>
        <p class="muted">登录野小子运营管理后台</p>
        <form @submit.prevent="submit(false)">
          <label
            >管理员账号<input
              v-model="username"
              name="username"
              autocomplete="username"
              placeholder="请输入管理员账号"
              required
              maxlength="100"
              :disabled="busy" /></label
          ><label
            >登录密码<input
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入登录密码"
              required
              maxlength="200"
              :disabled="busy"
          /></label>
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
