<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import { state, t } from '../store.js';
import PreviewModal from '../components/PreviewModal.vue';

const isAdmin = computed(() => !!(state.user && state.user.role === 'admin'));
const files = ref([]);
const page = ref(1);
const limit = 20;
const total = ref(0);
const pages = ref(1);
const owners = ref([]);
const ownerFilter = ref('');
const q = ref('');
const loading = ref(false);

const preview = ref(null);
const previewVisible = ref(false);

function openPreview(row) { preview.value = row; previewVisible.value = true; }
function downloadFile(row) { window.open(row.downloadUrl, '_blank'); }

const transferVisible = ref(false);
const transferFile = ref(null);
const transferOwner = ref('');
const transferCustom = ref('');
const transferring = ref(false);

function openTransfer(row) { transferFile.value = row; transferOwner.value = ''; transferCustom.value = ''; transferVisible.value = true; }
async function doTransfer() {
  const owner = transferOwner.value || transferCustom.value.trim();
  if (!owner) { ElMessage.warning('owner required'); return; }
  transferring.value = true;
  try {
    await api('/api/files/transfer', { method: 'POST', body: { key: transferFile.value.key, owner } });
    ElMessage.success('OK'); transferVisible.value = false; load();
  } catch (err) { ElMessage.error(err.message); } finally { transferring.value = false; }
}

function fmtBytes(n) { if (n == null) return '-'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1024 / 1024).toFixed(2) + ' MB'; }
function fmtTime(iso) { if (!iso) return '-'; return new Date(iso).toLocaleString(state.lang === 'zh-CN' ? 'zh-CN' : 'en-US', { hour12: false }); }
function formatBadge(f) { const x = f || 'other'; return `<span class="format-badge ${x}">${x.toUpperCase()}</span>`; }

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), limit: String(limit) });
    if (ownerFilter.value) params.set('owner', ownerFilter.value);
    if (q.value) params.set('q', q.value);
    const data = await api('/api/files?' + params.toString());
    files.value = data.items || [];
    total.value = data.total || 0;
    pages.value = data.pages || 1;
    owners.value = data.owners || [];
    if (files.value.length === 0 && page.value > 1 && total.value > 0) { page.value = Math.max(1, pages.value); load(); }
  } catch (err) {
    ElMessage.error(t('common.loadFailed', { msg: err.message }));
  } finally { loading.value = false; }
}

function gotoPage(p) { page.value = Math.min(Math.max(1, p), Math.max(1, pages.value)); load(); }
let timer = null;
watch([q, ownerFilter], () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load(); }, 300); });

async function removeFile(file) {
  try { await ElMessageBox.confirm(t('common.action.delete') + '?', 'AI-Doc', { type: 'warning' }); } catch { return; }
  try {
    await api('/api/files/' + b64url(file.key), { method: 'DELETE' });
    ElMessage.success('OK');
    load();
  } catch (err) { ElMessage.error(err.message); }
}

function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

onMounted(async () => { await load(); });
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t('files.title') }}</h2>
        <p class="page-sub">{{ t('files.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <el-input v-model="q" :placeholder="t('common.searchPlaceholder')" clearable style="width: 220px" />
        <el-select v-if="isAdmin" v-model="ownerFilter" :placeholder="t('files.ownerFilter')" clearable style="width: 160px">
          <el-option v-for="o in owners" :key="o" :label="o" :value="o" />
        </el-select>
        <el-button @click="load" :loading="loading">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <el-card>
      <el-table :data="files" v-loading="loading" empty-text="">
        <el-table-column :label="t('files.col.name')" min-width="300">
          <template #default="{ row }">
            <span class="file-name">{{ row.name }}</span>
            <span class="owner-tag" :class="{ system: row.owner === 'system' }">{{ row.owner || 'system' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('files.col.format')" width="90">
          <template #default="{ row }"><span v-html="formatBadge(row.format)"></span></template>
        </el-table-column>
        <el-table-column :label="t('files.col.size')" width="100">
          <template #default="{ row }">{{ fmtBytes(row.size) }}</template>
        </el-table-column>
        <el-table-column :label="t('files.col.time')" width="170">
          <template #default="{ row }">{{ fmtTime(row.lastModified) }}</template>
        </el-table-column>
        <el-table-column :label="t('files.col.actions')" width="330" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openPreview(row)">{{ t('common.action.preview') }}</el-button>
            <el-button size="small" text type="primary" @click="downloadFile(row)">{{ t('common.action.download') }}</el-button>
            <el-button v-if="isAdmin" size="small" text type="warning" @click="openTransfer(row)">{{ t('common.action.transfer') }}</el-button>
            <el-button size="small" text type="danger" @click="removeFile(row)">{{ t('common.action.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <span class="muted">{{ t('common.pagination', { total }) }}</span>
        <span class="muted">{{ t('common.page', { page, pages }) }}</span>
        <span class="spacer"></span>
        <el-button size="small" :disabled="page <= 1" @click="gotoPage(page - 1)">‹</el-button>
        <el-button size="small" :disabled="page >= pages" @click="gotoPage(page + 1)">›</el-button>
      </div>
    </el-card>

    <PreviewModal v-model="previewVisible" :file="preview" />

    <el-dialog v-model="transferVisible" :title="t('common.action.transfer')" width="420px">
      <p v-if="transferFile" class="muted">{{ transferFile.name }} ({{ transferFile.key }})</p>
      <el-select v-model="transferOwner" :placeholder="t('files.ownerFilter')" clearable style="width:100%">
        <el-option value="system" label="system" />
        <el-option v-for="o in owners" :key="o" :value="o" :label="o" />
      </el-select>
      <el-input v-model="transferCustom" style="margin-top:10px" placeholder="or new username (does not need registration)" />
      <template #footer>
        <el-button @click="transferVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="transferring" @click="doTransfer">OK</el-button>
      </template>
    </el-dialog>
  </div>
</template>
