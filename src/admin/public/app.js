/* global fetch */
'use strict';

const state = {
  meta: null,
  files: [],
  templates: [],
  styleTemplates: [],
  styleDefaults: {},
  currentTemplateId: null,
};

const $ = (sel) => document.querySelector(sel);

const EXAMPLES = {
  docx: {
    title: '工作周报',
    author: '示例用户',
    paragraphs: [
      { text: '本周完成事项', level: 1 },
      { text: '完成 AI 文档生成平台的部署与联调', bullet: true },
      { text: '修复导出 PDF 的排版问题', bullet: true },
      { text: '下周计划', level: 1 },
      { text: '接入 Dify 工作流,并完善模板库', bullet: true },
    ],
    footer: '由 AI-Doc 生成',
  },
  pdf: {
    title: '项目汇报',
    author: '示例用户',
    paragraphs: [
      { text: '项目概述', level: 1 },
      { text: '本项目通过 MCP 协议为 AI Agent 提供文档生成能力。' },
      { text: '交付指标', level: 1 },
    ],
    tables: [
      {
        columns: [
          { key: 'item', header: '指标' },
          { key: 'value', header: '目标' },
        ],
        rows: [
          { item: '文档格式', value: 'docx / pdf / xlsx / pptx' },
          { item: '上线日期', value: '2026-09-01' },
        ],
      },
    ],
  },
  xlsx: {
    title: '月度销售数据',
    sheets: [
      {
        name: '销售明细',
        columns: [
          { key: 'month', header: '月份' },
          { key: 'revenue', header: '收入(元)' },
          { key: 'goal', header: '目标(元)' },
        ],
        rows: [
          { month: '1月', revenue: 120000, goal: 100000 },
          { month: '2月', revenue: 156000, goal: 110000 },
        ],
      },
    ],
  },
  pptx: {
    title: '项目启动会',
    author: '示例用户',
    slides: [
      { title: '项目启动会', subtitle: 'AI-Doc 文档生成平台', layout: 'title' },
      { title: '项目背景', bullets: ['统一文档生成能力', '向 AI Agent 开放能力'], layout: 'title_content' },
      { title: '后续计划', bullets: ['MCP 接入', '模板定制与模板库建设'], layout: 'title_content' },
    ],
  },
};

function fmtBytes(n) {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function formatBadge(format) {
  const f = format || 'other';
  const label = f.toUpperCase();
  return `<span class="format-badge ${f}">${label}</span>`;
}

function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* no json */ }
  if (!res.ok) {
    const msg = (data && (data.error || data.details)) || `请求失败 (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    $('#view-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'files') refreshFiles();
    if (btn.dataset.tab === 'templates') { refreshTemplates(); loadStyleOptions(); }
    if (btn.dataset.tab === 'styles') refreshStyleTemplates();
  });
});

/* ---------------- meta ---------------- */
async function loadMeta() {
  try {
    state.meta = await api('/api/meta');
    const modeName = state.meta.storageMode === 's3' ? 'S3 存储' : '本地存储';
    $('#metaStorage').textContent = `${modeName} · ${(state.meta.formats || []).map((f) => f.format).join(' / ')}`;
  } catch (err) {
    $('#metaStorage').textContent = '后台状态:异常';
    toast('无法连接后台: ' + err.message, 'err');
  }
}

/* ---------------- files ---------------- */
async function refreshFiles() {
  try {
    state.files = await api('/api/files');
    renderFiles();
  } catch (err) {
    toast('加载文件列表失败: ' + err.message, 'err');
  }
}

function renderFiles() {
  const rows = $('#fileRows');
  const q = ($('#fileSearch').value || '').trim().toLowerCase();
  const list = q
    ? state.files.filter((f) => ((f.name || '') + f.format + '').toLowerCase().includes(q))
    : state.files;
  $('#fileEmpty').classList.toggle('hidden', list.length > 0);
  rows.innerHTML = list.map((f) => {
    const encoded = b64urlEncodeUTF8(f.key);
    return `<tr>
      <td title="${escapeHtml(f.key)}">${escapeHtml(f.name)}</td>
      <td>${formatBadge(f.format)}</td>
      <td>${fmtBytes(f.size)}</td>
      <td class="muted">${fmtTime(f.lastModified)}</td>
      <td class="td-right">
        <button class="icon-btn" data-act="preview" data-key="${encoded}">预览</button>
        <button class="icon-btn" data-act="download" data-key="${encoded}">下载</button>
        <button class="icon-btn danger" data-act="delete" data-key="${encoded}">删除</button>
      </td>
    </tr>`;
  }).join('');
}

document.querySelector('#fileTable').addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const key = b64urlDecodeUTF8(btn.dataset.key);
  const file = state.files.find((f) => f.key === key);
  if (btn.dataset.act === 'preview') openPreview(file);
  if (btn.dataset.act === 'download') window.open(file.downloadUrl, '_blank');
  if (btn.dataset.act === 'delete') deleteFile(file);
});

$('#fileRefresh').addEventListener('click', refreshFiles);
$('#fileSearch').addEventListener('input', renderFiles);

async function deleteFile(file) {
  if (!window.confirm(`确定删除文件「${file.name}」吗?\n(${file.key})`)) return;
  try {
    await api('/api/files/' + b64urlEncodeUTF8(file.key), { method: 'DELETE' });
    toast('已删除: ' + file.name, 'ok');
    refreshFiles();
  } catch (err) {
    toast('删除失败: ' + err.message, 'err');
  }
}

/* ---------------- preview modal ---------------- */
function openPreview(file) {
  $('#modalTitle').textContent = file.name || '预览';
  $('#modalMeta').textContent = `${(file.format || 'unknown').toUpperCase()} · ${fmtBytes(file.size)} · ${fmtTime(file.lastModified)} · key: ${file.key}`;
  const frame = $('#modalFrame');
  const info = $('#modalInfo');
  const actions = $('#modalAction');
  actions.innerHTML = `
    <button class="btn btn-primary" data-act="download">下载</button>
    <button class="btn btn-ghost" data-act="open-url">在新标签页打开</button>
  `;
  actions.querySelector('[data-act="download"]').onclick = () => window.open(file.downloadUrl, '_blank');
  actions.querySelector('[data-act="open-url"]').onclick = () => window.open(file.url, '_blank');

  if (file.format === 'pdf') {
    frame.classList.remove('hidden');
    info.classList.add('hidden');
    frame.src = file.previewUrl;
  } else {
    frame.classList.add('hidden');
    frame.src = 'about:blank';
    info.classList.remove('hidden');
    info.innerHTML = `<dl class="info-grid">
      <dt>文件名</dt><dd>${escapeHtml(file.name)}</dd>
      <dt>格式</dt><dd>${escapeHtml((file.format || 'unknown').toUpperCase())}</dd>
      <dt>大小</dt><dd>${fmtBytes(file.size)}</dd>
      <dt>创建时间</dt><dd>${fmtTime(file.lastModified)}</dd>
      <dt>存储 Key</dt><dd>${escapeHtml(file.key)}</dd>
      <dt>公开链接</dt><dd><a href="${escapeAttr(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.url)}</a></dd>
      </dl>
      <p class="muted small">${file.format ? 'Word / Excel / PowerPoint 格式浏览器无法直接内嵌预览,请下载后使用本地 Office 打开。' : '该文件类型不支持在线预览。'}</p>`;
  }
  $('#modal').classList.remove('hidden');
}

$('#modalClose').addEventListener('click', () => {
  const frame = $('#modalFrame');
  frame.src = 'about:blank';
  $('#modal').classList.add('hidden');
});
$('#modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    $('#modalFrame').src = 'about:blank';
    $('#modal').classList.add('hidden');
  }
});

/* ---------------- style templates (uploaded document files) ---------------- */
async function refreshStyleTemplates() {
  try {
    state.styleTemplates = await api('/api/style-templates');
    state.styleDefaults = await api('/api/style-templates/defaults');
    renderStyleTemplates();
  } catch (err) {
    toast('加载样式模板失败: ' + err.message, 'err');
  }
}

function renderStyleTemplates() {
  const rows = $('#styleRows');
  const list = state.styleTemplates || [];
  const currentId = $('#tplStyle').value;
  $('#styleEmpty').classList.toggle('hidden', list.length > 0);
  rows.innerHTML = list.map((t) => `
    <tr>
      <td>${escapeHtml(t.name)}${t.id === currentId ? ' <span class="badge-inuse">编辑中</span>' : ''}</td>
      <td>${formatBadge(t.format)}</td>
      <td>${t.isDefault
        ? `<span class="badge-current">← 当前使用</span>`
        : `<button class="icon-btn" data-act="setdefault" data-id="${t.id}" data-format="${t.format}">设为当前</button>`}</td>
      <td>${escapeHtml(t.filename)}</td>
      <td>${fmtBytes(t.size)}</td>
      <td class="td-right">
        <button class="icon-btn danger" data-act="delete" data-id="${t.id}">删除</button>
      </td>
    </tr>`).join('');
}

async function loadStyleOptions() {
  try {
    state.styleTemplates = await api('/api/style-templates');
    state.styleDefaults = await api('/api/style-templates/defaults');
  } catch { /* ignore */ }
  renderStyleOptions();
}

const STYLE_FORMAT_LABELS = { pptx: 'PowerPoint (.pptx)', docx: 'Word (.docx)', xlsx: 'Excel (.xlsx)' };

function detectStyleFormat(filename) {
  const parts = (filename || '').split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop().toLowerCase();
  return ext === 'pptx' || ext === 'docx' || ext === 'xlsx' ? ext : null;
}

function renderStyleOptions() {
  const sel = $('#tplStyle');
  const fmt = $('#tplFormat').value;
  const list = (state.styleTemplates || []).filter((t) => t.format === fmt);
  const cur = sel.value;
  const defaults = state.styleDefaults || {};
  sel.innerHTML = '<option value="">（不使用）</option>' +
    list.map((t) => {
      let label = t.name;
      if (t.filename !== t.name) label += ' — ' + t.filename;
      if (defaults[t.format] === t.id) label += ' (当前默认)';
      return `<option value="${t.id}">${escapeHtml(label)}</option>`;
    }).join('');
  if (list.some((t) => t.id === cur)) sel.value = cur;
  else sel.value = '';
  updateStyleCurrent();
}

function updateStyleCurrent() {
  const sel = $('#tplStyle');
  const el = $('#tplStyleCurrent');
  const fmt = $('#tplFormat').value;
  const opts = Array.from(sel.options);
  const opt = opts[sel.selectedIndex];
  if (sel.value && opt) {
    el.textContent = '已套用: ' + (opt.value === '' ? '未套用' : opt.text);
    el.className = 'tpl-style-current';
    return;
  }
  const defaults = state.styleDefaults || {};
  const defId = defaults[fmt];
  if (defId) {
    const def = (state.styleTemplates || []).find((t) => t.id === defId);
    if (def) {
      el.textContent = '未单独选择 → 将使用当前默认: ' + def.name;
      el.className = 'tpl-style-current fallback';
      return;
    }
  }
  el.textContent = '未套用样式模板';
  el.className = 'tpl-style-current none';
}

async function uploadStyleTemplate() {
  const fileInput = $('#styleFile');
  const file = fileInput.files && fileInput.files[0];
  if (!file) { setStyleStatus('请选择文件', 'err'); return; }
  const fmt = detectStyleFormat(file.name);
  if (!fmt) {
    setStyleStatus('不支持的文件类型: ' + file.name + '。仅支持 .pptx / .docx / .xlsx', 'err');
    return;
  }
  const data = await fileToBase64(file);
  const body = {
    name: $('#styleName').value.trim() || file.name,
    format: fmt,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
  };
  try {
    await api('/api/style-templates', { method: 'POST', body });
    setStyleStatus('上传成功', 'ok');
    $('#styleName').value = '';
    fileInput.value = '';
    $('#styleFileName').textContent = '选择要上传的文件…';
    $('#styleFileName').classList.remove('has');
    updateStyleDetect(null);
    await refreshStyleTemplates();
    renderStyleOptions();
  } catch (err) {
    setStyleStatus('上传失败: ' + err.message, 'err');
  }
}

function setStyleStatus(text, cls = '') {
  const s = $('#styleStatus');
  s.textContent = text;
  s.className = 'editor-status ' + cls;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

$('#styleUpload').addEventListener('click', uploadStyleTemplate);
$('#styleRefresh').addEventListener('click', refreshStyleTemplates);
$('#styleFile').addEventListener('change', (e) => {
  const hint = $('#styleFileName');
  const file = e.target.files && e.target.files[0];
  if (file) {
    hint.textContent = file.name;
    hint.classList.add('has');
    updateStyleDetect(detectStyleFormat(file.name));
  } else {
    hint.textContent = '选择要上传的文件…';
    hint.classList.remove('has');
    updateStyleDetect(null);
  }
});
$('#tplStyle').addEventListener('change', updateStyleCurrent);

function updateStyleDetect(fmt) {
  const el = $('#styleDetect');
  if (!fmt) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = '识别格式: ' + (STYLE_FORMAT_LABELS[fmt] || fmt);
  el.className = 'style-detect';
}
$('#styleTable').addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  if (btn.dataset.act === 'delete') {
    if (!window.confirm('确定删除该样式模板吗?')) return;
    try {
      await api('/api/style-templates/' + btn.dataset.id, { method: 'DELETE' });
      toast('样式模板已删除', 'ok');
      await refreshStyleTemplates();
      renderStyleOptions();
    } catch (err) {
      toast('删除失败: ' + err.message, 'err');
    }
    return;
  }
  if (btn.dataset.act === 'setdefault') {
    try {
      await api('/api/style-templates/defaults', { method: 'PUT', body: { format: btn.dataset.format, id: btn.dataset.id } });
      toast('已设为当前使用', 'ok');
      await refreshStyleTemplates();
      renderStyleOptions();
    } catch (err) {
      toast('设置失败: ' + err.message, 'err');
    }
  }
});
$('#tplFormat').addEventListener('change', renderStyleOptions);

/* ---------------- templates ---------------- */
async function refreshTemplates() {
  try {
    state.templates = await api('/api/templates');
    renderTemplateList();
    if (state.currentTemplateId) {
      const exists = state.templates.some((t) => t.id === state.currentTemplateId);
      if (exists) selectTemplate(state.currentTemplateId);
    }
  } catch (err) {
    toast('加载模板失败: ' + err.message, 'err');
  }
}

function renderTemplateList() {
  const list = $('#tplList');
  $('#tplEmpty').classList.toggle('hidden', state.templates.length > 0);
  list.innerHTML = state.templates.map((t) => `
    <li class="tpl-item ${t.id === state.currentTemplateId ? 'active' : ''}" data-id="${t.id}">
      <div class="tpl-item-title">${escapeHtml(t.name)}</div>
      <div class="tpl-item-sub"><span>${t.format.toUpperCase()}</span>${t.description ? '· ' + escapeHtml(t.description) : ''}</div>
    </li>`).join('');
}

$('#tplList').addEventListener('click', (e) => {
  const item = e.target.closest('.tpl-item');
  if (item) selectTemplate(item.dataset.id);
});

function selectTemplate(id) {
  state.currentTemplateId = id;
  const tpl = state.templates.find((t) => t.id === id);
  if (!tpl) return;
  $('#tplName').value = tpl.name;
  $('#tplDesc').value = tpl.description || '';
  $('#tplFormat').value = tpl.format;
  $('#tplInput').value = JSON.stringify(tpl.input, null, 2);
  if (tpl.styleTemplateId) {
    $('#tplStyle').value = tpl.styleTemplateId;
  }
  renderStyleOptions();
  setStatus('');
  clearResult();
  renderTemplateList();
}

function newTemplate() {
  state.currentTemplateId = null;
  const fmt = $('#tplFormat').value;
  $('#tplName').value = '';
  $('#tplDesc').value = '';
  $('#tplInput').value = JSON.stringify(EXAMPLES[fmt], null, 2);
  $('#tplStyle').value = '';
  renderStyleOptions();
  setStatus('新模板(未保存)');
  clearResult();
  renderTemplateList();
}

$('#tplNew').addEventListener('click', newTemplate);
$('#tplFormat').addEventListener('change', () => {
  if (!state.currentTemplateId && !$('#tplName').value.trim()) {
    $('#tplInput').value = JSON.stringify(EXAMPLES[$('#tplFormat').value], null, 2);
  }
});

function currentInput() {
  try {
    return { ok: true, value: JSON.parse($('#tplInput').value) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function setStatus(text, cls = '') {
  const s = $('#tplStatus');
  s.textContent = text;
  s.className = 'editor-status ' + cls;
}

function clearResult() {
  const r = $('#tplResult');
  r.classList.add('hidden');
  r.innerHTML = '';
}

$('#tplValidate').addEventListener('click', () => {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus('JSON 语法错误: ' + parsed.error, 'err'); return; }
  setStatus('JSON 语法正确', 'ok');
});

$('#tplFormatJson').addEventListener('click', () => {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus('无法格式化: ' + parsed.error, 'err'); return; }
  $('#tplInput').value = JSON.stringify(parsed.value, null, 2);
  setStatus('已格式化', 'ok');
});

$('#tplExample').addEventListener('click', () => {
  $('#tplInput').value = JSON.stringify(EXAMPLES[$('#tplFormat').value], null, 2);
  setStatus('已载入示例');
});

async function saveTemplate() {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus('JSON 语法错误: ' + parsed.error, 'err'); return; }
  const styleTemplateId = $('#tplStyle').value || undefined;
  const body = {
    name: $('#tplName').value.trim() || '未命名模板',
    format: $('#tplFormat').value,
    description: $('#tplDesc').value.trim() || undefined,
    styleTemplateId,
    input: parsed.value,
  };
  try {
    let tpl;
    if (state.currentTemplateId) {
      tpl = await api('/api/templates/' + state.currentTemplateId, { method: 'PUT', body });
    } else {
      tpl = await api('/api/templates', { method: 'POST', body });
    }
    state.currentTemplateId = tpl.id;
    await refreshTemplates();
    setStatus('已保存 ✓', 'ok');
    toast('模板已保存', 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
    toast('保存失败: ' + err.message, 'err');
  }
}

$('#tplSave').addEventListener('click', saveTemplate);

$('#tplDelete').addEventListener('click', async () => {
  if (!state.currentTemplateId) return;
  if (!window.confirm('确定删除该模板吗?')) return;
  try {
    await api('/api/templates/' + state.currentTemplateId, { method: 'DELETE' });
    state.currentTemplateId = null;
    $('#tplName').value = '';
    $('#tplDesc').value = '';
    $('#tplInput').value = '';
    setStatus('');
    clearResult();
    await refreshTemplates();
    toast('模板已删除', 'ok');
  } catch (err) {
    toast('删除失败: ' + err.message, 'err');
  }
});

$('#tplGenerate').addEventListener('click', async () => {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus('JSON 语法错误: ' + parsed.error, 'err'); return; }
  const format = $('#tplFormat').value;
  const styleTemplateId = $('#tplStyle').value || undefined;
  const btn = $('#tplGenerate');
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    const doc = await api('/api/generate', { method: 'POST', body: { format, input: parsed.value, styleTemplateId } });
    showResult(doc);
    setStatus('生成成功 ✓', 'ok');
    refreshFiles();
  } catch (err) {
    showResult({ error: err.message, ok: false });
    setStatus('生成失败', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

function showResult(doc) {
  const r = $('#tplResult');
  r.classList.remove('hidden');
  if (doc.error) {
    r.className = 'result err';
    r.innerHTML = `<div class="result-title">生成失败</div><div>${escapeHtml(doc.error)}</div>`;
    return;
  }
  r.className = 'result';
  const name = doc.filename || '';
  r.innerHTML = `
    <div class="result-title">生成成功:${doc.format ? ' ' + doc.format.toUpperCase() : ''}</div>
    <div>文件名:${escapeHtml(name)} · 大小:${fmtBytes(doc.size)}</div>
    <div>链接:<a href="${escapeAttr(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.url)}</a></div>
    <div style="margin-top:8px">
      <a class="btn btn-primary" href="${escapeAttr(doc.url)}" target="_blank" rel="noopener" download>下载</a>
    </div>`;
}

/* ---------------- utils ---------------- */
function b64urlEncodeUTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeUTF8(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}

/* ---------------- init ---------------- */
(() => {
  loadMeta();
  loadStyleOptions();
})();
