/**
 * Browser entry for the admin preview pane.
 * Bundled by scripts/build-viewers.mjs into a single IIFE exposed as
 * window.AIDocViewers. Each renderer takes raw bytes and draws into a DOM
 * container, so the front end never needs to download-and-open a file.
 */
import { renderAsync as renderDocxAsync } from 'docx-preview';
import * as XLSX from 'xlsx';
import { getDocument as getPdfDocument, GlobalWorkerOptions as PdfWorker } from 'pdfjs-dist';
import { init as initPptx } from 'pptx-preview';

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

export function mimeOf(format) {
  return MIME[format] ?? null;
}

// ---- docx ----
export async function renderDocx(bytes, container, opts = {}) {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  await renderDocxAsync(data, container, container, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false,
    // breakPages 让 docx-preview 在每节(sectPr)/显式分页符处分页；renderHeaders 让每页尝试渲染页眉页脚
    //（仅对含多个节或显式分页符的文档生效；Word 的"内容超页自动分页"docx-preview 无法模拟）
    breakPages: true,
    renderHeaders: true,
    ...opts,
  });
  return { ok: true };
}

// ---- xlsx ----
export async function renderXlsx(bytes, container, opts = {}) {
  const data = bytes instanceof ArrayBuffer ? bytes : bytes.buffer ? bytes.buffer : bytes;
  const wb = XLSX.read(data, { type: 'array' });
  const sheetNames = wb.SheetNames;
  let active = sheetNames[0];
  if (opts.sheet) active = sheetNames.includes(opts.sheet) ? opts.sheet : active;
  const sheet = wb.Sheets[active];
  const html = XLSX.utils.sheet_to_html(sheet, { id: 'sheet-' + active, editable: false, ...opts.sheetToHtml });
  container.innerHTML = html;
  return { ok: true, sheets: sheetNames, active };
}

// ---- pdf ----
let pdfWorkerSet = false;
export async function renderPdf(bytes, container, opts = {}) {
  if (!pdfWorkerSet) {
    const base = document.querySelector('meta[name="pdf-worker"]')?.content;
    if (base) {
      PdfWorker.workerSrc = base;
      pdfWorkerSet = true;
    }
  }
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = await getPdfDocument({ data, ...(pdfWorkerSet ? {} : { disableWorker: true }) }).promise;
  const numPages = doc.numPages;
  container.innerHTML = '';
  const canvasHost = document.createElement('div');
  canvasHost.className = 'pdf-canvas-host';
  container.appendChild(canvasHost);

  const renderPage = async (n) => {
    const page = await doc.getPage(n);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min((container.clientWidth || 794) / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = 'pdf-page';
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page-wrap';
    wrap.appendChild(canvas);
    canvasHost.appendChild(wrap);
  };
  for (let i = 1; i <= numPages; i++) await renderPage(i);
  return { ok: true, numPages };
}

// ---- pptx ----
export async function renderPptx(bytes, container, opts = {}) {
  const data = bytes instanceof ArrayBuffer ? bytes : bytes.buffer ? bytes.buffer : bytes;
  const previewer = initPptx(container, {
    mode: 'list',
    width: Math.round((container.clientWidth || 960) * 0.95),
    ...opts,
  });
  await previewer.preview(data);
  return { ok: true, previewer };
}

export const _internal = { XLSX, initPptx };
