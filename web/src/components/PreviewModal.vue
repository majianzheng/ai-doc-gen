<script setup>
import { onMounted, ref, watch } from 'vue';
import { t } from '../store.js';

const props = defineProps({
  modelValue: Boolean,
  file: { type: Object, default: null }, // { name, format, size, previewUrl, downloadUrl, url, lastModified, key }
});
const emit = defineEmits(['update:modelValue']);

const loading = ref(false);
const error = ref('');
const contentEl = ref(null);
const sheets = ref([]);
const activeSheet = ref('');
let buf = null;

function close() {
  emit('update:modelValue', false);
}
function fmtBytes(n) { if (n == null) return '-'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1024 / 1024).toFixed(2) + ' MB'; }

function viewerName(format) {
  return format ? 'render' + format.charAt(0).toUpperCase() + format.slice(1) : '';
}

async function render(raw, sheet) {
  const el = contentEl.value;
  if (!el || !props.file) return;
  const format = props.file.format;
  el.innerHTML = '';
  const V = window.AIDocViewers;
  if (!V || !V[viewerName(format)]) {
    if (format === 'pdf') {
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = 'none';
      iframe.src = props.file.previewUrl;
      el.appendChild(iframe);
      return;
    }
    throw new Error('no viewer for ' + format);
  }
  if (format === 'docx') return V.renderDocx(raw, el, {});
  if (format === 'pdf') return V.renderPdf(raw, el, {});
  if (format === 'xlsx') return V.renderXlsx(raw, el, { sheet });
  if (format === 'pptx') return V.renderPptx(raw, el, {});
}

async function loadPreview() {
  const f = props.file;
  if (!f) return;
  loading.value = true; error.value = ''; sheets.value = []; activeSheet.value = '';
  try {
    const res = await fetch(f.previewUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    buf = await res.arrayBuffer();
    const r = await render(buf, '');
    if (f.format === 'xlsx' && r && r.sheets) {
      sheets.value = r.sheets;
      activeSheet.value = r.active || (r.sheets[0] || '');
    }
    loading.value = false;
  } catch (err) {
    loading.value = false; error.value = err.message;
  }
}

function switchSheet(name) {
  if (!buf) return;
  render(buf, name).then(() => { activeSheet.value = name; }).catch((e) => { error.value = e.message; });
}

function download() { if (props.file) window.open(props.file.downloadUrl || props.file.url, '_blank'); }

watch(() => [props.modelValue, props.file], () => { if (props.modelValue && props.file) loadPreview(); });
onMounted(() => { if (props.modelValue && props.file) loadPreview(); });
</script>

<template>
  <el-dialog :model-value="modelValue" @update:model-value="close" width="82%" top="4vh" destroy-on-close append-to-body>
    <template #header>
      <div>
        <div class="preview-title">{{ file ? file.name : '' }}</div>
        <div class="preview-meta" v-if="file">{{ (file.format || '').toUpperCase() }} · {{ fmtBytes(file.size) }}</div>
      </div>
      <div class="preview-actions">
        <el-button text type="primary" @click="loadPreview">⟳</el-button>
        <el-button text type="primary" @click="download">{{ t('gen.genDownload') }}</el-button>
      </div>
    </template>
    <div v-loading="loading" class="preview-body">
      <div ref="contentEl" class="preview-content"></div>
      <p v-if="error" class="preview-error">{{ error }}</p>
      <div v-if="sheets.length" class="sheet-tabs">
        <el-tag v-for="s in sheets" :key="s" :effect="s === activeSheet ? 'dark' : 'plain'" class="sheet-tab" @click="switchSheet(s)">{{ s }}</el-tag>
      </div>
    </div>
  </el-dialog>
</template>
