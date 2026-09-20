<script setup>
import { onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import { t, state } from '../store.js';

const items = ref([]);
const page = ref(1);
const limit = 20;
const total = ref(0);
const pages = ref(1);
const actions = ref([]);
const q = ref('');
const actor = ref('');
const action = ref('');
const loading = ref(false);

function fmtTime(iso) { if (!iso) return '-'; return new Date(iso).toLocaleString(state.lang === 'zh-CN' ? 'zh-CN' : 'en-US', { hour12: false }); }

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), limit: String(limit) });
    if (actor.value) params.set('actor', actor.value);
    if (action.value) params.set('action', action.value);
    if (q.value) params.set('q', q.value);
    const data = await api('/api/audit?' + params.toString());
    items.value = data.items || [];
    total.value = data.total || 0;
    pages.value = data.pages || 1;
    actions.value = data.actions || [];
    if (items.value.length === 0 && page.value > 1 && total.value > 0) { page.value = Math.max(1, pages.value); load(); }
  } catch (err) { ElMessage.error(t('common.loadFailed', { msg: err.message })); }
  finally { loading.value = false; }
}

function gotoPage(p) { page.value = Math.min(Math.max(1, p), Math.max(1, pages.value)); load(); }
function onFilter() { page.value = 1; load(); }
let timer = null;
watch(() => [q, actor], () => { clearTimeout(timer); timer = setTimeout(onFilter, 300); });
watch(action, onFilter);

async function clearAll() {
  try { await ElMessageBox.confirm(t('audit.clearConfirm'), 'AI-Doc', { type: 'warning' }); } catch { return; }
  try { await api('/api/audit', { method: 'DELETE' }); ElMessage.success('OK'); onFilter(); }
  catch (err) { ElMessage.error(err.message); }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t('nav.audit') }}</h2>
        <p class="page-sub">{{ t('audit.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <el-input v-model="q" :placeholder="t('audit.search')" clearable style="width: 180px" />
        <el-input v-model="actor" :placeholder="t('audit.actor')" clearable style="width: 150px" />
        <el-select v-model="action" clearable :placeholder="t('audit.allActions')" style="width: 170px">
          <el-option v-for="a in actions" :key="a" :value="a" :label="a" />
        </el-select>
        <el-button @click="load" :loading="loading">{{ t('common.refresh') }}</el-button>
        <el-button type="danger" @click="clearAll">{{ t('audit.clear') }}</el-button>
      </div>
    </div>

    <el-card>
      <el-table :data="items" v-loading="loading" empty-text="">
        <el-table-column :label="t('audit.col.time')" width="170"><template #default="{ row }">{{ fmtTime(row.time) }}</template></el-table-column>
        <el-table-column :label="t('audit.col.actor')" width="160"><template #default="{ row }">{{ row.actor || '-' }} <el-tag size="small" :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role || '' }}</el-tag></template></el-table-column>
        <el-table-column :label="t('audit.col.action')" width="170"><template #default="{ row }">{{ row.action }}</template></el-table-column>
        <el-table-column :label="t('audit.col.target')" min-width="220"><template #default="{ row }">{{ row.target || '-' }}</template></el-table-column>
        <el-table-column :label="t('audit.col.detail')" min-width="300"><template #default="{ row }">{{ row.detail || '' }} <span v-if="row.ip" class="muted">· {{ row.ip }}</span></template></el-table-column>
      </el-table>
      <div class="table-footer">
        <span class="muted">{{ t('common.pagination', { total }) }}</span>
        <span class="muted">{{ t('common.page', { page, pages }) }}</span>
        <span class="spacer"></span>
        <el-button size="small" :disabled="page <= 1" @click="gotoPage(page - 1)">‹</el-button>
        <el-button size="small" :disabled="page >= pages" @click="gotoPage(page + 1)">›</el-button>
      </div>
    </el-card>
  </div>
</template>
