<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import { t, state } from '../store.js';

const users = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const form = ref({ username: '', password: '', role: 'user', displayName: '' });
const saving = ref(false);

function fmtTime(iso) { if (!iso) return '-'; return new Date(iso).toLocaleString(state.lang === 'zh-CN' ? 'zh-CN' : 'en-US', { hour12: false }); }

async function load() {
  loading.value = true;
  try { const data = await api('/api/users'); users.value = (data && data.users) || []; } catch (err) { ElMessage.error(t('common.loadFailed', { msg: err.message })); }
  finally { loading.value = false; }
}

function openCreate() { form.value = { username: '', password: '', role: 'user', displayName: '' }; dialogVisible.value = true; }

async function create() {
  if (!form.value.username || !form.value.password) { ElMessage.warning('missing'); return; }
  saving.value = true;
  try {
    await api('/api/users', { method: 'POST', body: { username: form.value.username.trim(), password: form.value.password, role: form.value.role, displayName: form.value.displayName.trim() || undefined } });
    ElMessage.success('OK'); dialogVisible.value = false; await load();
  } catch (err) { ElMessage.error(err.message); } finally { saving.value = false; }
}

async function setRole(u, r) {
  try { await api('/api/users/' + encodeURIComponent(u.username) + '/role', { method: 'PUT', body: { role: r } }); ElMessage.success('OK'); await load(); }
  catch (err) { ElMessage.error(err.message); }
}
async function rename(u, dn) {
  let v = dn;
  try { v = await ElMessageBox.prompt(t('users.rename'), u.username, { inputValue: u.displayName || '' }); } catch { return; }
  try { await api('/api/users/' + encodeURIComponent(u.username) + '/display-name', { method: 'PUT', body: { displayName: v.trim() || undefined } }); ElMessage.success('OK'); await load(); }
  catch (err) { ElMessage.error(err.message); }
}
async function resetPwd(u) {
  let v;
  try { v = await ElMessageBox.prompt(t('users.resetPwd'), u.username, { inputType: 'password' }); } catch { return; }
  try { await api('/api/users/' + encodeURIComponent(u.username) + '/password', { method: 'PUT', body: { password: v } }); ElMessage.success('OK'); }
  catch (err) { ElMessage.error(err.message); }
}
async function remove(u) {
  try { await ElMessageBox.confirm(t('users.deleteConfirm', { name: u.username }), 'AI-Doc', { type: 'warning' }); } catch { return; }
  try { await api('/api/users/' + encodeURIComponent(u.username), { method: 'DELETE' }); ElMessage.success('OK'); await load(); }
  catch (err) { ElMessage.error(err.message); }
}

const originLabel = (u) => (u.origin && u.origin.provider ? u.origin.provider : 'local');

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t('nav.users') }}</h2>
        <p class="page-sub">{{ t('users.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <el-button @click="load" :loading="loading">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" @click="openCreate">{{ t('users.add') }}</el-button>
      </div>
    </div>

    <el-card>
      <el-table :data="users" v-loading="loading" empty-text="">
        <el-table-column :label="t('users.col.username')" min-width="140"><template #default="{ row }">{{ row.username }}</template></el-table-column>
        <el-table-column :label="t('users.col.displayName')" min-width="140"><template #default="{ row }">{{ row.displayName || '-' }}</template></el-table-column>
        <el-table-column :label="t('users.col.role')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role === 'admin' ? t('users.role.admin') : t('users.role.user') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('users.col.origin')" width="110"><template #default="{ row }">{{ originLabel(row) }}</template></el-table-column>
        <el-table-column :label="t('users.col.createdAt')" min-width="160"><template #default="{ row }">{{ fmtTime(row.createdAt) }}</template></el-table-column>
        <el-table-column :label="t('files.col.actions')" width="380" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="rename(row)">{{ t('users.rename') }}</el-button>
            <el-button v-if="row.role !== 'admin'" size="small" text type="warning" @click="setRole(row, 'admin')">{{ t('users.promote') }}</el-button>
            <el-button size="small" text type="warning" @click="resetPwd(row)">{{ t('users.resetPwd') }}</el-button>
            <el-button size="small" text type="danger" @click="remove(row)">{{ t('common.action.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="t('users.add')" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('users.col.username')"><el-input v-model="form.username" /></el-form-item>
        <el-form-item :label="t('login.password')"><el-input v-model="form.password" type="password" show-password /></el-form-item>
        <el-form-item :label="t('users.col.displayName')"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item :label="t('users.col.role')">
          <el-select v-model="form.role"><el-option value="user" :label="t('users.role.user')" /><el-option value="admin" :label="t('users.role.admin')" /></el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="create">OK</el-button>
      </template>
    </el-dialog>
  </div>
</template>
