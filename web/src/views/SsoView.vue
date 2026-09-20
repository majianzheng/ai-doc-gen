<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import { t } from '../store.js';

const cfg = ref(null);
const adminCsv = ref('');
const loading = ref(false);
const saving = ref(false);

const providerLabel = (p) => ({ none: 'None', oidc: 'OIDC / OAuth2', saml: 'SAML 2.0', cas: 'CAS' }[p] || p);

async function load() {
  loading.value = true;
  try {
    const data = await api('/api/auth/sso-config');
    cfg.value = (data && data.config) || null;
    adminCsv.value = ((cfg.value && cfg.value.adminUsernames) || []).join(', ');
  } catch (err) { ElMessage.error(t('common.loadFailed', { msg: err.message })); }
  finally { loading.value = false; }
}

function save() {
  if (!cfg.value) return;
  cfg.value.adminUsernames = adminCsv.value.split(',').map((s) => s.trim()).filter(Boolean);
}

async function doSave() {
  if (!cfg.value) return;
  save();
  saving.value = true;
  try { await api('/api/auth/sso-config', { method: 'PUT', body: { config: cfg.value } }); ElMessage.success('OK'); }
  catch (err) { ElMessage.error(err.message); } finally { saving.value = false; }
}

async function doTest() {
  try { const r = await api('/api/auth/sso-config/test', { method: 'POST', body: {} }); ElMessage[ r && r.ok ? 'success' : 'error'](r && r.ok ? 'OK' : (r && r.error)); }
  catch (err) { ElMessage.error(err.message); }
}

async function loadMetadata() {
  const url = cfg.value && cfg.value.saml && cfg.value.saml.metadataUrl;
  if (!url) { ElMessage.warning('metadataUrl required'); return; }
  try {
    const r = await api('/api/auth/sso-config/load-metadata', { method: 'POST', body: { metadataUrl: url } });
    if (r && r.config) { Object.assign(cfg.value.saml, r.config.saml || {}); ElMessage.success('OK'); }
  } catch (err) { ElMessage.error(err.message); }
}

onMounted(load);
</script>

<template>
  <div v-if="cfg">
    <div class="page-head">
      <div>
        <h2>{{ t('nav.sso') }}</h2>
        <p class="page-sub">{{ t('sso.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <el-button @click="doTest">{{ t('sso.test') }}</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">{{ t('sso.save') }}</el-button>
      </div>
    </div>

    <el-card>
      <el-form :model="cfg" label-position="top">
        <el-form-item :label="t('sso.enabled')">
          <el-switch v-model="cfg.enabled" />
        </el-form-item>
        <el-form-item :label="t('sso.provider')">
          <el-select v-model="cfg.provider">
            <el-option value="none" :label="providerLabel('none')" />
            <el-option value="oidc" :label="providerLabel('oidc')" />
            <el-option value="saml" :label="providerLabel('saml')" />
            <el-option value="cas" :label="providerLabel('cas')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('sso.autoCreate')"><el-switch v-model="cfg.autoCreate" /></el-form-item>
        <el-form-item :label="t('sso.baseUrl')"><el-input v-model="cfg.baseUrl" /></el-form-item>
        <el-form-item :label="t('sso.adminUsernames')"><el-input v-model="adminCsv" /></el-form-item>

        <template v-if="cfg.provider === 'oidc'">
          <el-divider>OIDC</el-divider>
          <el-form-item label="Issuer"><el-input v-model="cfg.oidc.issuer" /></el-form-item>
          <el-form-item label="Client ID"><el-input v-model="cfg.oidc.clientId" /></el-form-item>
          <el-form-item label="Client Secret"><el-input v-model="cfg.oidc.clientSecret" type="password" show-password /></el-form-item>
          <el-form-item label="Scope"><el-input v-model="cfg.oidc.scope" /></el-form-item>
          <el-form-item label="Username Claim"><el-input v-model="cfg.oidc.usernameClaim" /></el-form-item>
          <el-form-item label="PKCE"><el-switch v-model="cfg.oidc.usePkce" /></el-form-item>
        </template>

        <template v-if="cfg.provider === 'saml'">
          <el-divider>SAML</el-divider>
          <el-form-item label="IdP Entity ID"><el-input v-model="cfg.saml.idpEntityId" /></el-form-item>
          <el-form-item label="SSO URL"><el-input v-model="cfg.saml.ssoUrl" /></el-form-item>
          <el-form-item label="Metadata URL">
            <el-input v-model="cfg.saml.metadataUrl" />
            <el-button style="margin-left:8px" @click="loadMetadata">{{ t('sso.loadMetadata') }}</el-button>
          </el-form-item>
          <el-form-item label="Certificate"><el-input v-model="cfg.saml.certificate" type="textarea" :rows="3" /></el-form-item>
          <el-form-item label="Username Attribute"><el-input v-model="cfg.saml.usernameAttribute" /></el-form-item>
        </template>

        <template v-if="cfg.provider === 'cas'">
          <el-divider>CAS</el-divider>
          <el-form-item label="Login URL"><el-input v-model="cfg.cas.loginUrl" /></el-form-item>
          <el-form-item label="Validate URL"><el-input v-model="cfg.cas.validateUrl" /></el-form-item>
          <el-form-item label="Username Attribute"><el-input v-model="cfg.cas.usernameAttribute" /></el-form-item>
        </template>
      </el-form>
    </el-card>
  </div>
</template>
