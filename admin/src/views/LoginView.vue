<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, devLogin, errorMessage } from "../api";
import AppIcon from "../components/AppIcon.vue";
import TerrainScene from "../components/TerrainScene.vue";
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
    const target =
      typeof redirect === "string" &&
      redirect.startsWith("/") &&
      !redirect.startsWith("//") &&
      !/[\u0000-\u0020\\]/.test(redirect)
        ? router.resolve(redirect)
        : null;
    await router.replace(
      target && target.path !== "/login" && target.matched.length
        ? target.fullPath
        : "/activities",
    );
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
      <div class="login-brand-row">
        <a class="brand" href="#/login">WILDBOY<span>OUTDOOR CLUB</span></a>
        <span class="login-edition">ADMIN CONSOLE</span>
      </div>
      <div class="login-story-content">
        <p class="login-kicker">OUTDOOR BUSINESS, IN CONTROL</p>
        <h1>野小子运营后台</h1>
        <p class="login-lead">
          从山野活动到装备商城，让每一次出发、每一笔订单和每一位伙伴，都被妥善经营。
        </p>
      </div>
      <TerrainScene class="login-terrain" />
      <div class="login-features">
        <span><AppIcon name="shield" :size="16" />安全权限管理</span>
        <span><AppIcon name="dashboard" :size="16" />实时运营洞察</span>
        <span><AppIcon name="mountain" :size="16" />专注户外业务</span>
      </div>
      <p
        v-if="route.query.reason === 'expired'"
        class="error-box"
        role="status"
      >
        登录已过期，请重新登录。
      </p>
    </section>
    <section class="login-panel">
      <div class="login-form">
        <div class="login-form-heading">
          <span class="login-form-icon"
            ><AppIcon name="shield" :size="21"
          /></span>
          <div>
            <h2>管理员登录</h2>
            <p>欢迎回来，请使用管理员账号继续。</p>
          </div>
        </div>
        <form @submit.prevent="submit(false)">
          <label
            >管理员账号<input
              v-model="username"
              name="username"
              autocomplete="username"
              required
              maxlength="100"
              :disabled="busy"
          /></label>
          <label class="login-password-label" for="login-password"
            >登录密码</label
          >
          <div class="login-password-field">
            <input
              id="login-password"
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              maxlength="200"
              :disabled="busy"
            />
            <button
              type="button"
              class="login-password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              aria-controls="login-password"
              :disabled="busy"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" />
            </button>
          </div>
          <p v-if="error" role="alert" class="error-box">{{ error }}</p>
          <div class="footer-actions">
            <button class="primary" type="submit" :disabled="busy">
              {{ busy ? "正在验证…" : "登录" }}
            </button>
            <button
              v-if="demoEnabled"
              class="secondary"
              type="button"
              :disabled="busy"
              @click="submit(true)"
            >
              开发环境 · 演示登录
            </button>
          </div>
        </form>
        <p class="login-note">
          刷新后需重新登录。请勿在公共设备上展示报名名单。
        </p>
        <p class="login-version admin-version">后台版本 {{ adminVersion }}</p>
      </div>
    </section>
  </main>
</template>
