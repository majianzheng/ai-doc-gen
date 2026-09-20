<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import enUs from 'element-plus/es/locale/lang/en';
import { api } from './api.js';
import { state, t, setLang, setTheme } from './store.js';

const route = useRoute();
const elLocale = computed(() => (state.lang === 'zh-CN' ? zhCn : enUs));

const loginUser = ref('');
const loginPass = ref('');
const loginError = ref('');
const loggingIn = ref(false);
const ssoEnabled = ref(false);
const ssoError = ref('');

function goSso() { window.location.href = '/login/sso'; }

const isAdmin = computed(() => !!(state.user && state.user.role === 'admin'));

const nav = computed(() => [
  { path: '/files', label: t('nav.files'), icon: 'Document' },
  { path: '/generate', label: t('nav.generate'), icon: 'MagicStick' },
  { path: '/styles', label: t('nav.styles'), icon: 'Brush', admin: false },
  { path: '/users', label: t('nav.users'), icon: 'User', admin: true },
  { path: '/sso', label: t('nav.sso'), icon: 'Key', admin: true },
  { path: '/audit', label: t('nav.audit'), icon: 'Clock', admin: true },
]);

const pageTitle = computed(() => {
  const map = { '/files': 'nav.files', '/generate': 'nav.generate', '/styles': 'nav.styles', '/users': 'nav.users', '/sso': 'nav.sso', '/audit': 'nav.audit' };
  const key = map[route.path] || 'nav.files';
  return t(key);
});

async function loadMeta() {
  try { state.meta = await api('/api/meta'); } catch { /* ignore */ }
}

async function bootstrap() {
  setTheme(state.theme);
  // Read any failure reason from the /login?ssoerror=... redirect.
  const q = new URLSearchParams(window.location.search);
  const e = q.get('ssoerror');
  if (e) ssoError.value = decodeURIComponent(e);
  try {
    const r = await api('/api/auth/status');
    if (r && r.user) { state.user = r.user; loadMeta(); return; }
  } catch { /* not logged in */ }
  try { const s = await api('/api/auth/sso-status'); ssoEnabled.value = !!(s && s.enabled); } catch { /* ignore */ }
}

async function doLogin() {
  loginError.value = '';
  if (!loginUser.value || !loginPass.value) { loginError.value = t('login.error', { msg: 'missing input' }); return; }
  loggingIn.value = true;
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: { username: loginUser.value, password: loginPass.value } });
    state.user = r.user || { username: loginUser.value, role: 'user', displayName: loginUser.value };
    loadMeta();
  } catch (err) {
    loginError.value = t('login.error', { msg: err.message });
  } finally { loggingIn.value = false; }
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.user = null;
}

function onTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

onMounted(bootstrap);
</script>

<template>
  <el-config-provider :locale="elLocale">
    <!-- ===== login ===== -->
    <div v-if="!state.user" class="login-wrap">
      <div class="login-card">
        <div class="login-logo"><el-icon :size="26" color="#fff"><Document /></el-icon></div>
        <div class="login-title">{{ t('login.title') }}</div>
        <div class="login-sub">{{ t('login.subtitle') }}</div>
        <el-form @submit.prevent="doLogin" class="login-form">
          <el-form-item>
            <el-input v-model="loginUser" size="large" :placeholder="t('login.username')" autocomplete="username">
              <template #prefix><el-icon><Message /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-input v-model="loginPass" size="large" type="password" :placeholder="t('login.password')" autocomplete="current-password" show-password>
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <p v-if="loginError" class="login-error">{{ loginError }}</p>
          <p v-if="ssoError" class="login-error">{{ ssoError }}</p>
          <el-button type="primary" class="btn-block login-btn" size="large" :loading="loggingIn" native-type="submit">
            <span>{{ t('login.submit') }}</span>
            <el-icon v-if="!loggingIn" class="login-send"><Promotion /></el-icon>
          </el-button>
        </el-form>
        <template v-if="ssoEnabled">
          <el-divider class="login-divider"><span class="muted">{{ t('login.orSso') }}</span></el-divider>
          <el-button class="btn-block sso-btn-login" size="large" @click="goSso">
            <el-icon><Key /></el-icon>
            <span>{{ t('login.sso') }}</span>
          </el-button>
        </template>
      </div>
    </div>

    <!-- ===== app ===== -->
    <el-container v-else class="app-layout">
      <el-aside width="220px" class="app-aside">
        <div class="sidebar-brand">
          <div class="logo-mark">AI</div>
          <div class="brand-text">
            <div class="brand-name">AI-Doc</div>
            <div class="brand-sub">{{ t('brand.sub') }}</div>
          </div>
        </div>
        <el-menu :default-active="route.path" router class="side-menu" @select="(i) => $router.push(i)">
          <el-menu-item v-for="item in nav.filter((n) => !n.admin || isAdmin)" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container>
        <el-header class="app-header">
          <div class="header-title">{{ pageTitle }}</div>
          <div class="header-actions">
            <el-tooltip :content="state.theme === 'dark' ? t('theme.light') : t('theme.dark')">
              <el-button circle text @click="onTheme"><el-icon><component :is="state.theme === 'dark' ? 'Sunny' : 'Moon'" /></el-icon></el-button>
            </el-tooltip>
            <el-select :model-value="state.lang" size="small" class="lang-select" @change="setLang">
              <el-option value="zh-CN" label="简体中文" />
              <el-option value="en-US" label="English" />
            </el-select>
            <el-dropdown v-if="state.user">
              <span class="user-chip">
                <el-avatar :size="24">{{ (state.user.displayName || state.user.username || 'A').charAt(0).toUpperCase() }}</el-avatar>
                <span class="user-name">{{ state.user.displayName || state.user.username }}</span>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="doLogout">{{ t('account.logout') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        <el-main class="app-main"><router-view /></el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>
