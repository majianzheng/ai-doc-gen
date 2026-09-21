<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';
import { t, state } from '../store.js';
import PreviewModal from '../components/PreviewModal.vue';

const IMG_B64 = 'PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0MDAnIGhlaWdodD0nMTIwJyB2aWV3Qm94PScwIDAgNDAwIDEyMCc+PHJlY3Qgd2lkdGg9JzQwMCcgaGVpZ2h0PScxMjAnIHJ4PScxMicgZmlsbD0nIzJiM2E4ZicvPjx0ZXh0IHg9JzIwMCcgeT0nNzInIGZvbnQtZmFtaWx5PSdBcmlhbCcgZm9udC1zaXplPSczNCcgZmlsbD0nI2ZmZmZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+QUktRG9jPC90ZXh0Pjwvc3ZnPg==';
const IMG_MD = (alt) => `![${alt}](data:image/svg+xml;base64,${IMG_B64})`;

const EXAMPLES = {
  docx: `# 工作周报

本周完成了 AI 文档生成平台的部署与联调，核心聚焦在稳定性与使用体验的优化上。

## 本周完成事项

- 完成 AI 文档生成平台的部署与联调
- 修复导出 PDF 的排版问题
- 新增多格式模板与样式套用
- 梳理并完善开放接口文档

## 数据统计

| 指标 | 本周 | 上周 |
| --- | --- | --- |
| 生成文档数 | 128 | 96 |
| 平均耗时(秒) | 3.2 | 4.8 |

${IMG_MD('数据与走势示意')}

## 下周计划

- 进一步优化生成速度
- 增加更多行业模板
- 完善在线生成界面
`,
  pdf: `# 项目汇报

## 项目概述

本项目为 AI Agent 提供统一的文档生成能力，覆盖 Word / PDF / Excel / PPT 四种格式。

## 交付指标

| 指标 | 目标 |
| --- | --- |
| 文档格式 | docx / pdf / xlsx / pptx |
| 上线日期 | 2026-09-01 |

${IMG_MD('整体架构示意')}

## 风险与应对

- 模板兼容性风险：已建立回归测试保障
- 资源限制：采用按需加载与缓存
`,
  xlsx: `# 月度销售数据

## 销售明细

| 月份 | 收入(元) | 目标(元) |
| --- | --- | --- |
| 1月 | 120000 | 100000 |
| 2月 | 156000 | 110000 |

## 区域汇总

| 区域 | 订单数 | 回款(元) |
| --- | --- | --- |
| 华东 | 240 | 480000 |
| 华南 | 180 | 360000 |

![销售趋势](data:image/svg+xml;base64,${IMG_B64}){cell:0,6}
`,
  pptx: `# 项目启动会

## 项目背景

- 统一文档生成能力
- 向 AI Agent 开放能力

## 关键数据

| 指标 | 现状 |
| --- | --- |
| 格式支持 | 4 种 |
| 平均耗时 | 3 秒 |

![图示](data:image/svg+xml;base64,${IMG_B64}){x:120,y:60,w:220,h:60}

## 后续计划

- 完善在线生成界面
- 模板定制与模板库建设
`,
  text: `#include <iostream>

int main() {
    // 纯文本文件：原样保存，不做任何排版
    std::cout << "Hello, ai-doc!" << std::endl;
    return 0;
}
`,
};

const TEXT_ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8（无 BOM）' },
  { value: 'utf-8-bom', label: 'UTF-8（带 BOM）' },
  { value: 'ascii', label: 'ASCII' },
  { value: 'latin1', label: 'Latin-1' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
];

const format = ref('docx');
const title = ref('');
const filename = ref('');
const content = ref('');
const encoding = ref('utf-8');
const lineEnding = ref('lf');
const styleOptions = ref([]);
const styleTemplateId = ref('');
const generating = ref(false);
const result = ref(null);

const isText = computed(() => format.value === 'text');
const currentDefault = computed(() => (state.styleDefaults || {})[format.value]);

async function loadStyles() {
  try {
    const data = await api('/api/style-templates');
    state.styleTemplates = data.items || [];
    state.styleDefaults = data.defaults || {};
    styleOptions.value = (data.items || []).filter((s) => s.format === format.value);
  } catch { /* ignore */ }
}

function onFormat() {
  styleOptions.value = (state.styleTemplates || []).filter((s) => s.format === format.value);
  styleTemplateId.value = '';
}

function loadExample() { content.value = EXAMPLES[format.value] || ''; }
function clearAll() { content.value = ''; result.value = null; }
function fmtBytes(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1024 / 1024).toFixed(2) + ' MB'; }
function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fileContentUrl(doc, disp) { return doc && doc.storageKey ? '/api/files/content?key=' + b64url(doc.storageKey) + '&disposition=' + disp : (doc ? doc.url : ''); }
function downloadResult() { window.open(fileContentUrl(result.value, 'attachment'), '_blank'); }
const previewVisible = ref(false);
const previewFile = ref(null);
function previewResult() {
  previewFile.value = { name: result.value.filename, format: result.value.format, size: result.value.size, lastModified: result.value.createdAt, url: result.value.url, previewUrl: fileContentUrl(result.value, 'inline'), downloadUrl: fileContentUrl(result.value, 'attachment') };
  previewVisible.value = true;
}

async function generate() {
  if (!content.value.trim()) { ElMessage.warning(t('gen.contentRequired')); return; }
  if (!filename.value.trim()) { ElMessage.warning(t('gen.filenameRequired')); return; }
  generating.value = true;
  result.value = null;
  try {
    result.value = await api('/api/generate', {
      method: 'POST',
      body: {
        format: format.value,
        title: isText.value ? undefined : title.value.trim(),
        filename: filename.value.trim(),
        content: content.value,
        encoding: isText.value ? encoding.value : undefined,
        lineEnding: isText.value ? lineEnding.value : undefined,
        styleTemplateId: isText.value ? undefined : (styleTemplateId.value || undefined),
      },
    });
    ElMessage.success(t('gen.genOk'));
  } catch (err) {
    ElMessage.error(t('gen.genFailed') + ': ' + err.message);
  } finally { generating.value = false; }
}

onMounted(async () => { await loadStyles(); if (state.meta && state.meta.formats) { /* meta available */ } });
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t('gen.title') }}</h2>
        <p class="page-sub">{{ t('gen.subtitle') }}</p>
      </div>
    </div>

    <el-card class="gen-card">
      <el-form :model="{}" label-position="top" class="gen-grid">
        <el-form-item :label="t('gen.format')">
          <el-select v-model="format" @change="onFormat">
            <el-option value="docx" label="Word (.docx)" />
            <el-option value="pdf" label="PDF" />
            <el-option value="xlsx" label="Excel (.xlsx)" />
            <el-option value="pptx" label="PowerPoint (.pptx)" />
            <el-option value="text" :label="t('gen.textOption')" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isText" :label="t('gen.title')">
          <el-input v-model="title" :placeholder="t('gen.titlePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('gen.filename')">
          <el-input v-model="filename" :placeholder="isText ? t('gen.filenameTextPlaceholder') : t('gen.filenamePlaceholder')" />
        </el-form-item>
        <el-form-item v-if="isText" :label="t('gen.encoding')">
          <el-select v-model="encoding">
            <el-option v-for="e in TEXT_ENCODINGS" :key="e.value" :value="e.value" :label="e.label" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isText" :label="t('gen.lineEnding')">
          <el-select v-model="lineEnding">
            <el-option value="lf" label="LF (\n)" />
            <el-option value="crlf" label="CRLF (\r\n)" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isText" :label="t('gen.style')">
          <el-select v-model="styleTemplateId" clearable>
            <el-option :value="''" :label="t('gen.styleNone')" />
            <el-option v-for="s in styleOptions" :key="s.id" :value="s.id" :label="s.name + (s.system ? ' (system)' : '')" />
          </el-select>
        </el-form-item>
      </el-form>

      <div v-if="isText" class="editor-label">{{ t('gen.textContentLabel') }}</div>
      <div class="editor-toolbar">
        <el-button @click="loadExample">{{ t('gen.example') }}</el-button>
        <el-button @click="clearAll">{{ t('gen.clear') }}</el-button>
      </div>

      <div class="editor-label">{{ t('gen.contentLabel') }}</div>
      <el-input v-model="content" type="textarea" :rows="14" spellcheck="false" class="gen-content" />

      <div v-if="result" class="result">
        <div class="result-title">{{ t('gen.genOk') }}: {{ (result.format || '').toUpperCase() }}</div>
        <div>{{ t('gen.filename') }}: {{ result.filename }} ｜ {{ fmtBytes(result.size) }}</div>
        <div><a :href="result.url" target="_blank" rel="noopener">{{ result.url }}</a></div>
        <div class="result-links">
          <el-button type="primary" @click="downloadResult">{{ t('gen.genDownload') }}</el-button>
          <el-button @click="previewResult">{{ t('gen.preview') }}</el-button>
        </div>
      </div>

      <div class="gen-actions">
        <el-button type="primary" :loading="generating" @click="generate">{{ t('gen.generate') }}</el-button>
      </div>

      <PreviewModal v-model="previewVisible" :file="previewFile" />
    </el-card>
  </div>
</template>
