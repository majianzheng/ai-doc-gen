<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';
import { state, t } from '../store.js';
import PreviewModal from '../components/PreviewModal.vue';

const isAdmin = computed(() => !!(state.user && state.user.role === 'admin'));
const items = ref([]);
const defaults = ref({});
const name = ref('');
const file = ref(null);
const asSystem = ref(false);
const uploading = ref(false);
const previewVisible = ref(false);
const previewFile = ref(null);

function fmtBytes(n) { if (n == null) return '-'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1024 / 1024).toFixed(2) + ' MB'; }
function formatBadge(f) { const x = f || 'other'; return `<span class="format-badge ${x}">${x.toUpperCase()}</span>`; }

const ownerLabel = (o) => (o === 'system' ? 'system' : (o === (state.user && state.user.username) ? 'me' : (o || '')));

async function load() {
  try {
    const data = await api('/api/style-templates');
    items.value = data.items || [];
    defaults.value = data.defaults || {};
  } catch (err) { ElMessage.error(t('common.loadFailed', { msg: err.message })); }
}

function onFile(uploadFile) { file.value = (uploadFile && uploadFile.raw) || null; }

function fileToBase64(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(f);
  });
}

async function upload() {
  const f = file.value;
  if (!f) { ElMessage.warning(t('gen.filenameRequired')); return; }
  uploading.value = true;
  try {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pptx', 'docx', 'xlsx'].includes(ext)) { ElMessage.warning(t('styles.unsupported')); return; }
    const data = await fileToBase64(f);
    const body = { name: name.value.trim() || f.name, filename: f.name, mimeType: f.type || 'application/octet-stream', data };
    if (isAdmin.value && asSystem.value) body.owner = 'system';
    await api('/api/style-templates', { method: 'POST', body });
    ElMessage.success('OK');
    name.value = ''; file.value = null;
    await load();
  } catch (err) { ElMessage.error(err.message); }
  finally { uploading.value = false; }
}

async function setDefault(row) {
  try {
    await api('/api/style-templates/defaults', { method: 'PUT', body: { format: row.format, id: row.id } });
    ElMessage.success('OK');
    await load();
  } catch (err) { ElMessage.error(err.message); }
}

async function remove(row) {
  try { await ElMessageBox.confirm(t('styles.deleteConfirm'), 'AI-Doc', { type: 'warning' }); } catch { return; }
  try { await api('/api/style-templates/' + row.id, { method: 'DELETE' }); ElMessage.success('OK'); await load(); }
  catch (err) { ElMessage.error(err.message); }
}

function openPreview(row) {
  const url = '/api/style-templates/' + encodeURIComponent(row.id) + '/content?disposition=';
  previewFile.value = { name: row.name, format: row.format, size: row.size, lastModified: row.createdAt, url: url + 'attachment', previewUrl: url + 'inline', downloadUrl: url + 'attachment' };
  previewVisible.value = true;
}
function download(row) { window.open('/api/style-templates/' + encodeURIComponent(row.id) + '/content?disposition=attachment', '_blank'); }

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t('nav.styles') }}</h2>
        <p class="page-sub">{{ t('styles.subtitle') }}</p>
      </div>
      <el-button @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <el-card class="style-upload">
      <div class="style-upload-row">
        <el-input v-model="name" :placeholder="t('styles.namePlaceholder')" style="width: 200px" />
        <el-upload :show-file-list="false" :auto-upload="false" accept=".pptx,.docx,.xlsx" :on-change="onFile">
          <el-button>{{ t('styles.chooseFile') }}</el-button>
        </el-upload>
        <span v-if="file" class="muted">{{ file.name }}</span>
        <el-checkbox v-if="isAdmin" v-model="asSystem">{{ t('styles.asSystem') }}</el-checkbox>
        <el-button type="primary" :loading="uploading" @click="upload">{{ t('styles.upload') }}</el-button>
      </div>
    </el-card>

    <el-card style="margin-top: 16px">
      <el-table :data="items" empty-text="">
        <el-table-column :label="t('styles.col.name')" min-width="180">
          <template #default="{ row }">{{ row.name }} <span v-if="row.owner === 'system'" class="owner-badge system">system</span></template>
        </el-table-column>
        <el-table-column :label="t('styles.col.format')" width="90">
          <template #default="{ row }"><span v-html="formatBadge(row.format)"></span></template>
        </el-table-column>
        <el-table-column :label="t('styles.col.current')" width="150">
          <template #default="{ row }">
            <el-tag v-if="defaults[row.format] === row.id" type="success">{{ t('styles.current') }}</el-tag>
            <el-button v-else-if="row.manageable" size="small" text type="primary" @click="setDefault(row)">{{ isAdmin ? t('styles.setSystemDefault') : t('styles.setMyDefault') }}</el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('styles.col.filename')" min-width="200">
          <template #default="{ row }">{{ row.filename }}</template>
        </el-table-column>
        <el-table-column :label="t('styles.col.size')" width="110">
          <template #default="{ row }">{{ fmtBytes(row.size) }}</template>
        </el-table-column>
        <el-table-column :label="t('files.col.actions')" width="280" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openPreview(row)">{{ t('gen.preview') }}</el-button>
            <el-button size="small" text type="primary" @click="download(row)">{{ t('gen.genDownload') }}</el-button>
            <el-button v-if="row.manageable" size="small" text type="danger" @click="remove(row)">{{ t('common.action.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <PreviewModal v-model="previewVisible" :file="previewFile" />
  </div>
</template>
