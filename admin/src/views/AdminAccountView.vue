<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import {
  ApiError,
  clearSession,
  currentUser,
  getAdminAccountSettings,
  updateAdminAccountSettings,
} from "../api";
import type { AdminAccountSettings } from "../types";
import UiState from "../components/UiState.vue";
import FormModal from "../components/FormModal.vue";
const router = useRouter();
const settings = ref<AdminAccountSettings | null>(null),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  conflict = ref(false),
  editing = ref(false);
const username = ref(""),
  currentPassword = ref(""),
  newPassword = ref(""),
  confirmPassword = ref("");
const dirty = computed(
  () =>
    !!(
      currentPassword.value ||
      newPassword.value ||
      confirmPassword.value ||
      (settings.value && username.value !== settings.value.username)
    ),
);
let epoch = 0;
function clearPasswords() {
  currentPassword.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
}
function clear() {
  epoch++;
  clearPasswords();
  settings.value = null;
  username.value = "";
  loading.value = false;
  busy.value = false;
  error.value = "";
  notice.value = "";
  editing.value = false;
}
function openEditor() {
  if (!settings.value?.canConfigure || busy.value || loading.value) return;
  clearPasswords();
  username.value = settings.value.username || "";
  error.value = "";
  notice.value = "";
  conflict.value = false;
  editing.value = true;
}
function closeEditor() {
  if (busy.value) return;
  if (
    dirty.value &&
    !window.confirm("账号修改尚未保存，确定放弃本次修改并关闭吗？")
  )
    return;
  clearPasswords();
  username.value = settings.value?.username || "";
  conflict.value = false;
  error.value = "";
  editing.value = false;
}
watch(currentUser, clear, { flush: "sync" });
async function load() {
  const actor = currentUser.value,
    n = ++epoch;
  if (actor?.role !== "ADMIN") {
    error.value = "需要管理员身份，请重新登录。";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await getAdminAccountSettings();
    if (n !== epoch || actor !== currentUser.value) return;
    settings.value = result;
    username.value = result.username || "";
    clearPasswords();
    conflict.value = false;
  } catch (e) {
    if (n === epoch && actor === currentUser.value)
      error.value =
        e instanceof Error ? e.message : "账号设置读取失败，请重试。";
  } finally {
    if (n === epoch) loading.value = false;
  }
}
function reload() {
  if (
    !dirty.value ||
    window.confirm("重新读取会清空当前未保存的账号和密码输入，是否继续？")
  )
    void load();
}
async function save() {
  if (
    busy.value ||
    loading.value ||
    conflict.value ||
    !settings.value?.canConfigure ||
    currentUser.value?.role !== "ADMIN"
  )
    return;
  error.value = "";
  notice.value = "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username.value.trim())) {
    error.value =
      "用户名须为 3–64 位英文字母、数字或 . _ -，首位须为字母或数字。";
    return;
  }
  const password = newPassword.value;
  const byteLength = new TextEncoder().encode(password).length;
  if (
    password.length < 12 ||
    password.length > 72 ||
    byteLength > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    error.value =
      "新密码须为 12–72 字符，包含英文字母和数字，UTF-8 最多 72 字节。";
    return;
  }
  if (password !== confirmPassword.value) {
    error.value = "两次新密码输入不一致。";
    return;
  }
  if (!currentPassword.value) {
    error.value = "请输入当前管理员密码以验证身份。";
    return;
  }
  const n = epoch,
    actor = currentUser.value,
    version = settings.value.version;
  busy.value = true;
  try {
    const result = await updateAdminAccountSettings({
      username: username.value.trim(),
      newPassword: password,
      currentPassword: currentPassword.value,
      version,
    });
    if (n !== epoch || actor !== currentUser.value) return;
    settings.value = result;
    username.value = result.username;
    clearPasswords();
    editing.value = false;
    notice.value = "账号已更新，其他管理员登录已退出。所有密码输入已清空。";
  } catch (e) {
    if (n !== epoch || actor !== currentUser.value) return;
    conflict.value = e instanceof ApiError && e.status === 409;
    if (e instanceof ApiError && e.code === "PASSWORD_LOGIN_REQUIRED") {
      clearPasswords();
      settings.value = {
        ...settings.value!,
        canConfigure: false,
        configurationBlockReason: "PASSWORD_LOGIN_REQUIRED",
      };
    }
    error.value = conflict.value
      ? "账号设置已在其他会话更新。当前输入已保留，请重新读取后再核对；不会自动覆盖。"
      : e instanceof ApiError && e.status === 429
        ? "操作过于频繁，请稍后再试。当前输入已保留。"
        : e instanceof Error
          ? e.message
          : "保存失败，请重试。";
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function passwordLogin() {
  clearSession();
  void router.replace("/login");
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onBeforeRouteLeave(
  (to) =>
    to.path === "/login" ||
    !dirty.value ||
    window.confirm("账号修改尚未保存，确定离开？"),
);
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  clear();
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <h1>管理员账号</h1>
      <button
        v-if="settings?.canConfigure"
        class="primary"
        :disabled="busy || loading"
        @click="openEditor"
      >
        修改账号
      </button>
    </section>
    <p v-if="error" class="error-box" role="alert">
      {{ error
      }}<button class="text-button" :disabled="busy || loading" @click="reload">
        重新读取
      </button>
    </p>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <UiState v-if="loading && !settings" kind="loading" compact
      >正在读取账号设置…</UiState
    >
    <template v-if="settings">
      <div class="privacy-note">
        {{
          settings.configured
            ? `已配置管理员账号：${settings.username}。小程序管理员登录入口已启用。`
            : "当前未配置。保存管理员账号后，小程序才会显示管理员登录入口。"
        }}
      </div>
      <section v-if="settings.canConfigure" class="form-section account-form">
        <h2>当前管理员</h2>
        <p>{{ settings.username || "尚未设置用户名" }}</p>
        <p class="muted">账号密码只在修改弹窗中填写，页面不保留密码输入。</p>
        <button class="primary" :disabled="busy || loading" @click="openEditor">
          修改账号
        </button>
      </section>
      <UiState v-else kind="empty" compact
        ><strong>{{
          settings.configurationBlockReason === "PASSWORD_LOGIN_REQUIRED"
            ? "演示身份无法设置管理员账号"
            : "管理员初始密码尚未配置"
        }}</strong>
        <p>
          {{
            settings.configurationBlockReason === "PASSWORD_LOGIN_REQUIRED"
              ? "请使用真实管理员用户名和密码登录后再设置。"
              : "请联系部署人员完成管理员初始密码配置，再刷新重试。"
          }}
        </p>
        <button
          v-if="settings.configurationBlockReason === 'PASSWORD_LOGIN_REQUIRED'"
          class="primary"
          @click="passwordLogin"
        >
          使用密码登录</button
        ><button v-else @click="reload">重新读取</button></UiState
      >
      <p class="privacy-note">
        保存后保留当前会话，其他管理员登录会退出。之后仅使用新用户名和密码登录；成功后清空所有密码输入。
      </p>
    </template>
    <button v-else-if="!loading && !error" @click="load">重新加载</button>
    <FormModal v-if="editing && settings?.canConfigure" @close="closeEditor">
      <h2>修改管理员账号</h2>
      <form
        id="admin-account-form"
        class="form-section account-form"
        @submit.prevent="save"
      >
        <p v-if="error" class="error-box" role="alert">{{ error }}</p>
        <div class="field-row">
          <label
            >新管理员用户名 *<input
              v-model="username"
              name="adminUsername"
              autocomplete="username"
              maxlength="64"
              :disabled="busy || loading"
              placeholder="3–64 位英文字母、数字或 . _ -" /></label
          ><label
            >当前管理员密码 *<input
              v-model="currentPassword"
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              maxlength="200"
              :disabled="busy || loading"
          /></label>
        </div>
        <div class="field-row">
          <label
            >新密码 *<input
              v-model="newPassword"
              name="newPassword"
              type="password"
              autocomplete="new-password"
              maxlength="72"
              :disabled="busy || loading" /></label
          ><label
            >确认新密码 *<input
              v-model="confirmPassword"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              maxlength="72"
              :disabled="busy || loading"
          /></label>
        </div>
        <p class="field-hint">
          新密码须为 12–72 字符，至少包含英文字母与数字，UTF-8 最多 72
          字节。密码不保存在设备。
        </p>
        <div class="dialog-actions">
          <button type="button" :disabled="busy" @click="closeEditor">
            取消
          </button>
          <button class="primary" :disabled="busy || loading || conflict">
            {{ busy ? "正在保存…" : "验证并保存" }}
          </button>
        </div>
      </form>
    </FormModal>
  </main>
</template>
