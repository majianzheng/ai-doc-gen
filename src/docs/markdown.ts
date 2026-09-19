/**
 * 轻量 Markdown → 文档结构解析器。
 *
 * 让 AI 用一段标准 Markdown 即可生成 Word/PDF/Excel/PPT，无需再构造深度嵌套的参数。
 *
 * - 标题：# / ## / ### ... → 标题段落（level 1-6）
 * - 列表：- / * / 1. → 要点（bullet）
 * - 表格：| a | b |（首行表头）→ TableData
 * - 图片：![alt](url 或 data:) → ImageItem
 * - 加粗 **x**、斜体 *x*（整行/整段包裹）
 *
 * 各格式映射：
 * - docx/pdf：标题/列表/表格/图片按顺序渲染；title 取首个 # 标题（未提供时）。
 * - xlsx：每个 `##` 标题 = 一个工作表名，该块下的第一个 `| 表格 |` 作为该表数据；无 `##` 时每个表格 = 一个工作表（SheetN）。
 * - pptx：每个 `##`/`#` 标题 = 一页标题，其下的 `-` 列表 = 要点、第一个表格 = 表格页。
 */
import type {
  DocxInput,
  PdfInput,
  XlsxInput,
  PptxInput,
  ParagraphItem,
  TableData,
  ImageItem,
  SheetData,
  SlideData,
} from './types.js';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'image'; alt: string; url: string }
  | { kind: 'para'; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // heading
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ kind: 'heading', level: h[1].length, text: cleanInline(h[2]) }); i++; continue; }

    // image
    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) { blocks.push({ kind: 'image', alt: img[1], url: img[2] }); i++; continue; }

    // list (consecutive)
    if (/^([-*]|\d+\.)\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = t.match(/^([-*]|\d+\.)\s+(.*)$/);
        if (m) { items.push(cleanInline(m[2])); i++; }
        else if (t === '') { i++; break; }
        else break;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    // table (consecutive | rows)
    if (/^\|/.test(trimmed)) {
      const rows: string[][] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith('|') && t.endsWith('|')) {
          const cells = t.slice(1, -1).split('|').map((c) => cleanInline(c.trim()));
          // skip separator row like | --- | --- |
          if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
          i++;
        } else break;
      }
      if (rows.length) blocks.push({ kind: 'table', rows });
      continue;
    }

    // paragraph (merge until blank/heading/list/table)
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) { i++; break; }
      if (/^(#{1,6})\s+/.test(t) || /^([-*]|\d+\.)\s+/.test(t) || /^\|/.test(t) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(t)) break;
      para.push(cleanInline(t));
      i++;
    }
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
  }
  return blocks;
}

/** Strip inline markers for plain text: remove ** bold / * italic wrappers around text spans. */
function cleanInline(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

function isBold(s: string): boolean { return /^\*\*.*\*\*$/.test(s.trim()); }
function isItalic(s: string): boolean { return /^\*[^*]+\*$/.test(s.trim()); }

function paraItem(text: string): ParagraphItem {
  const t = text.trim();
  return { text: cleanInline(t), bold: isBold(t) || undefined, italic: isItalic(t) || undefined };
}

function tableToData(rows: string[][]): TableData {
  if (!rows.length) return { rows: [] };
  const header = rows[0];
  const body = rows.slice(1);
  return {
    columns: header.map((h, idx) => ({ key: 'c' + idx, header: h })),
    rows: body.map((r) => {
      const o: Record<string, string | number | boolean | null> = {};
      header.forEach((_, idx) => { o['c' + idx] = r[idx] ?? ''; });
      return o;
    }),
  };
}

function firstHeading(md: string): string | undefined {
  const m = md.match(/^#{1,6}\s+(.+)$/m);
  return m ? cleanInline(m[1].trim()) : undefined;
}

export function markdownToDocx(md: string): DocxInput {
  const blocks = parseBlocks(md);
  const out: DocxInput = { paragraphs: [], tables: [], images: [] };
  for (const b of blocks) {
    if (b.kind === 'heading') out.paragraphs!.push({ text: cleanInline(b.text), level: b.level });
    else if (b.kind === 'list') b.items.forEach((it) => out.paragraphs!.push({ text: cleanInline(it), bullet: true }));
    else if (b.kind === 'para') { const p = paraItem(b.text); if (p.text) out.paragraphs!.push(p); }
    else if (b.kind === 'table') out.tables!.push(tableToData(b.rows));
    else if (b.kind === 'image') out.images!.push(imageItem(b.url, b.alt));
  }
  if (!out.title) out.title = firstHeading(md);
  return out;
}

export function markdownToPdf(md: string): PdfInput {
  const d = markdownToDocx(md);
  return { ...d } as PdfInput;
}

export function markdownToXlsx(md: string): XlsxInput {
  const blocks = parseBlocks(md);
  const sheets: SheetData[] = [];
  let currentName = 'Sheet1';
  let pendingRows: string[][] | null = null;
  const flushSheet = () => {
    if (pendingRows && pendingRows.length) {
      sheets.push({ name: currentName, rows: tableToData(pendingRows).rows.map((row) => row) });
    }
    pendingRows = null;
  };
  for (const b of blocks) {
    if (b.kind === 'heading') { flushSheet(); currentName = cleanInline(b.text) || currentName; }
    else if (b.kind === 'table') { pendingRows = b.rows; }
    else if (b.kind === 'list' || b.kind === 'para' || b.kind === 'image') { flushSheet(); }
  }
  flushSheet();
  if (!sheets.length && parseBlocks(md).some((b) => b.kind === 'table')) {
    // 无 ## 标题时，每个表格各自成为一个 sheet（兜底）
    const tblocks = parseBlocks(md).filter((b) => b.kind === 'table');
    return { sheets: tblocks.map((b, idx) => ({ name: 'Sheet' + (idx + 1), rows: tableToData((b as any).rows).rows })) };
  }
  return { sheets };
}

export function markdownToPptx(md: string): PptxInput {
  const blocks = parseBlocks(md);
  const slides: SlideData[] = [];
  let cur: SlideData | null = null;
  const flush = () => { if (cur) slides.push(cur); cur = null; };
  for (const b of blocks) {
    if (b.kind === 'heading') { flush(); cur = { title: cleanInline(b.text), bullets: [], tables: [], layout: 'title_content' }; }
    else if (b.kind === 'list') { if (cur) (cur.bullets! = cur.bullets!.concat(b.items.map((it) => cleanInline(it)))); else { cur = { bullets: [], layout: 'title_content' }; cur.bullets!.push(...b.items); } }
    else if (b.kind === 'table') { if (cur) cur.tables!.push(tableToData(b.rows)); }
    else if (b.kind === 'para' || b.kind === 'image') { /* 正文段落相对降级：跳过或并入 */ }
  }
  flush();
  if (!slides.length) slides.push({ title: firstHeading(md), bullets: [], layout: 'title_content' });
  return { title: firstHeading(md) || '', slides };
}

function imageItem(url: string, alt: string): ImageItem {
  const u = url.trim();
  const isData = /^data:/i.test(u);
  return isData ? { data: u, caption: alt || undefined } : { url: u, caption: alt || undefined };
}

export function inlineRender(s: string): { text: string; bold?: boolean; italic?: boolean } {
  return paraItem(s);
}
