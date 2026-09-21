import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { ImageItem, ParagraphItem, PdfInput, DocxFlowItem } from './types.js';
import type { Generator, GenerateContext } from './generator.js';
import { markdownToPdf } from './markdown.js';
import { computeSize, resolveImage, resolveImageCached, svgToPng } from './images.js';

/**
 * Bundled CJK-capable fonts (Source Han Sans SC). PDFKit's built-in Helvetica
 * family only encodes the WinAnsi subset, so any CJK text rendered through it
 * comes out garbled. These OpenType fonts are embedded (pdfkit subsets them per
 * document) and are used for body/heading/table text. Latin italics still map to
 * Helvetica-Oblique so all-Latin documents keep their italic styling.
 */
const ASSET_DIR = new URL('../assets/fonts/', import.meta.url);
const FONT_REG = 'scsR'; // SourceHanSansSC-Regular
const FONT_BOLD = 'scsB'; // SourceHanSansSC-Bold

function registerFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(FONT_REG, fileURLToPath(new URL('SourceHanSansSC-Regular.otf', ASSET_DIR)));
  doc.registerFont(FONT_BOLD, fileURLToPath(new URL('SourceHanSansSC-Bold.otf', ASSET_DIR)));
}

const CJK_RE = /[\u2e80-\u2fff\u3000-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

function sizeFor(level: number | undefined): number {
  if (!level) return 11;
  if (level === 1) return 20;
  if (level === 2) return 16;
  if (level === 3) return 13;
  return 11;
}

function fontStyle(p: ParagraphItem): { bold?: boolean; italics?: boolean; size: number } {
  const heading = (p.level ?? 0) >= 1 && (p.level ?? 0) <= 3;
  return {
    bold: p.bold ?? heading,
    italics: p.italic,
    size: sizeFor(p.level),
  };
}

/** Choose a PDFKit font name for a text run.
 *  - Bold -> CJK bold font (robust for mixed CJK/Latin)
 *  - Italic without CJK -> Helvetica-Oblique (keeps italic styling)
 *  - everything else -> CJK regular */
function fontName(style: { bold?: boolean; italics?: boolean }, text: string): string {
  if (style.bold) return FONT_BOLD;
  if (style.italics && !hasCjk(text)) return 'Helvetica-Oblique';
  return FONT_REG;
}

/**
 * Normalize an image for PDF rendering. PDFKit supports PNG / JPEG natively;
 * SVG input is rasterized to PNG, everything else is rejected with a clear
 * message so the agent knows what to send instead.
 */
async function imageForPdf(resolved: Awaited<ReturnType<typeof resolveImage>>): Promise<{ buffer: Buffer; kind: 'png' | 'jpeg' }> {
  if (resolved.kind === 'svg') {
    const { png } = await svgToPng(resolved.buffer);
    return { buffer: png, kind: 'png' };
  }
  if (resolved.format === 'png') return { buffer: resolved.buffer, kind: 'png' };
  if (resolved.format === 'jpeg') return { buffer: resolved.buffer, kind: 'jpeg' };
  throw new Error(
    `image type '${resolved.format}' is not supported in PDF. Supported: PNG, JPEG, SVG. Convert the image to PNG/JPEG or send SVG markup.`,
  );
}

async function renderOneImage(
  doc: PDFKit.PDFDocument,
  img: ImageItem,
  imgCache?: Awaited<ReturnType<typeof resolveImageCached>>,
): Promise<void> {
  const resolved = imgCache ? await imgCache.get(img) : await resolveImage(img);
  const renderable = await imageForPdf(resolved);

  let intrinsic: { width: number; height: number } | null = null;
  if (resolved.kind !== 'svg') {
    try {
      const opened = (doc as PDFKit.PDFDocument & { openImage: (src: Buffer) => { width: number; height: number } }).openImage(renderable.buffer);
      intrinsic = { width: opened.width, height: opened.height };
    } catch {
      intrinsic = null;
    }
  }
  const availW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const size = computeSize({ width: resolved.width, height: resolved.height }, intrinsic, Math.min(400, availW));
  const dw = Math.min(size.width, availW);
  const dh = size.height * (dw / size.width);

  if (doc.y + dh > doc.page.height - doc.page.margins.bottom) doc.addPage();
  let x = doc.page.margins.left;
  if (resolved.align === 'center') x = (doc.page.width - dw) / 2;
  else if (resolved.align === 'right') x = doc.page.width - doc.page.margins.right - dw;

  doc.image(renderable.buffer, x, doc.y, { width: dw, height: dh });
  doc.y += dh;
  if (resolved.caption) {
    doc.moveDown(0.2);
    doc.font(FONT_REG).fontSize(9).fillColor('#666666')
      .text(resolved.caption, { align: 'center' });
  }
  doc.moveDown(0.6);
}

function renderImages(
  doc: PDFKit.PDFDocument,
  images: ImageItem[],
  imgCache?: Awaited<ReturnType<typeof resolveImageCached>>,
): Promise<void> {
  const tasks = images.map((img) => renderOneImage(doc, img, imgCache));
  return Promise.all(tasks).then(() => undefined);
}

export const pdfGenerator: Generator = {
  format: 'pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',
  generate(input: any, _ctx?: GenerateContext): Promise<Buffer> {
    const pdfInput = markdownToPdf(String(input?.content || ''));
    pdfInput.title = (input.title as string) || pdfInput.title;
    pdfInput.author = (input.author as string) || pdfInput.author;
    pdfInput.subject = (input.subject as string) || pdfInput.subject;
    pdfInput.footer = (input.footer as string) || pdfInput.footer;
    const docInput = pdfInput;

    interface TocEntry { id: string; level: number; text: string; }
    const toc: TocEntry[] = [];
    for (const p of docInput.paragraphs ?? []) {
      const lv = p.level ?? 0;
      if (lv >= 1 && lv <= 6) toc.push({ id: 'toc-' + toc.length, level: lv, text: p.text });
    }
    const hasToc = toc.length > 0;

    return (async () => {
      const imgCache = await resolveImageCached(docInput.images ?? []);
      try {
        if (!hasToc) {
          return await renderPdf(docInput, { images: imgCache }) as Buffer;
        }
        // 第一遍：渲染正文（无目录页），为每个标题打 named destination 并记录其所在页码
        const pageOf = await renderPdf(docInput, { images: imgCache, toc, collectPages: true });
        const pageMap = pageOf instanceof Map ? pageOf : new Map<string, number>();
        // 第二遍：先写目录页（点击跳转），再渲染正文（打锚点）
        return await renderPdf(docInput, { images: imgCache, toc, prependToc: true, pageOf: pageMap }) as Buffer;
      } finally {
        imgCache.clear();
      }
    })();
  },
};

interface PdfRenderOptions {
  images?: Awaited<ReturnType<typeof resolveImageCached>>;
  collectPages?: boolean;
  prependToc?: boolean;
  toc?: Array<{ id: string; level: number; text: string }>;
  pageOf?: Map<string, number>;
}

/** Render the whole PDF body. When `collectPages` is true it returns a map of
 *  toc entry id -> page number and emits named destinations for each heading; a
 *  later `prependToc` pass writes a clickable TOC page first, then re-renders
 *  the body so the TOC links jump to the anchored headings. */
function tocIdFor(entries: Array<{ id: string }>, index: number): string {
  const e = entries[index];
  return e ? e.id : 'toc-' + index;
}

function renderPdf(input: PdfInput, opts: PdfRenderOptions): Promise<Buffer | Map<string, number>> {
  return new Promise((resolve, reject) => {
    const info: Record<string, string | Date> = { Creator: 'ai-doc', CreationDate: new Date(), ModDate: new Date() };
    if (input.title) info.Title = input.title;
    if (input.author) info.Author = input.author;
    if (input.subject) info.Subject = input.subject;
    const doc = new PDFDocument({ size: 'A4', margin: 50, info });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      if (collect) resolve(pageOf);
      else resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    let pageCounter = 1;
    const collect = !!opts.collectPages;
    const prepend = !!opts.prependToc;
    const toc = opts.toc ?? [];
    const pageOf = opts.pageOf ?? new Map<string, number>();
    // sequential index of the next heading we encounter in the body
    let headIdx = 0;

    doc.on('pageAdded', () => {
      if (collect) pageCounter++;
      if (!input.footer) return;
      doc.save();
      doc.font(FONT_REG).fontSize(8).fillColor('#888888');
      doc.text(input.footer, 50, doc.page.height - 40, { align: 'center', width: doc.page.width - 100 });
      doc.restore();
    });

    // ---- clickable TOC page (prependToc mode) ----
    if (prepend && toc.length > 0) {
      doc.font(FONT_BOLD).fontSize(18).fillColor('#131313').text('目 录', { align: 'center' });
      doc.moveDown();
      for (const e of toc) {
        const pg = pageOf.get(e.id);
        const display = pg != null ? `          ${pg}` : '';
        const text = (e.level === 1 ? '' : '     '.repeat(e.level - 1)) + e.text + display;
        doc.font(e.level === 1 ? FONT_BOLD : FONT_REG).fontSize(e.level === 1 ? 13 : 11).fillColor('#131313');
        // goTo 生成内部命名目的地跳转(/Dest)；link 会把字符串当外部 URL 导致跳到文件下载地址
        doc.text(text, { indent: 0, goTo: e.id });
        doc.moveDown(0.3);
      }
      doc.addPage();
      if (collect) pageCounter++;
    } else if (collect && toc.length > 0) {
      // 第一遍（collect）只确定页码：前置一个空"目录页"占位，使页码与最终
      // 带目录的 PDF 对齐（目录页占第 1 页，正文从第 2 页计起）
      doc.addPage();
      pageCounter++;
    }

    // ---- title ----
    if (input.title) {
      doc.fontSize(24).font(FONT_BOLD).fillColor('#131313').text(input.title, { align: 'center' });
      doc.moveDown();
    }

    // ---- body: 按内容顺序混排段落/表格/图片（图片在 Markdown 原位置渲染）----
    const flow: DocxFlowItem[] = input.items ?? [
      ...(input.paragraphs ?? []).map((p) => ({ type: 'paragraph' as const, value: p })),
      ...(input.tables ?? []).map((t) => ({ type: 'table' as const, value: t })),
      ...(input.images ?? []).map((img) => ({ type: 'image' as const, value: img })),
    ];

    const renderFlow = async (): Promise<void> => {
      for (const it of flow) {
        if (it.type === 'paragraph') {
          const p = it.value;
          const style = fontStyle(p);
          doc.font(fontName(style, p.text)).fontSize(style.size).fillColor(p.color ?? '#131313');
          const pOpts = p.align ? { align: p.align } : undefined;
          const lv = p.level ?? 0;
          const isHeading = lv >= 1 && lv <= 6;
          const indentOpt = (!isHeading && !p.bullet) ? { indent: 24 } : {};
          if (isHeading) {
            const id = tocIdFor(toc, headIdx++);
            if (collect) pageOf.set(id, pageCounter);
            // addNamedDestination 不在 @types/pdfkit 中，但 PDFKit 0.15 运行时支持该 API
            (doc as unknown as { addNamedDestination: (name: string) => void }).addNamedDestination(id);
            doc.outline.addItem(p.text, { expanded: false });
          }
          if (p.bullet) {
            doc.text('•  ', Object.assign({ continued: true }, pOpts));
            doc.text(p.text, Object.assign({}, pOpts, indentOpt));
          } else {
            doc.text(p.text, Object.assign({}, pOpts, indentOpt));
          }
          doc.moveDown(0.4);
        } else if (it.type === 'table') {
          const t = it.value;
          doc.moveDown();
          const cols = t.columns ?? Object.keys(t.rows[0] ?? {}).map((k) => ({ key: k, header: k }));
          const available = doc.page.width - doc.page.margins.left - doc.page.margins.right;
          const colW = available / cols.length;
          const drawRow = (cells: string[], header: boolean) => {
            doc.font(header ? FONT_BOLD : FONT_REG).fontSize(9);
            const rowH = Math.max(...cells.map((c) => doc.heightOfString(c, { width: colW - 8 })), 18) + 8;
            if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); if (collect) pageCounter++; }
            const y = doc.y;
            cells.forEach((c, i) => {
              const x = doc.page.margins.left + i * colW;
              doc.rect(x, y, colW, rowH).strokeColor('#cccccc').lineWidth(0.5).stroke();
              if (header) doc.rect(x, y, colW, rowH).fillColor('#f2f2f2').fill();
              doc.fillColor('#131313').fontSize(9);
              doc.text(c, x + 4, y + 4, { width: colW - 8 });
            });
            doc.y = y + rowH;
          };
          drawRow(cols.map((c: { header: string }) => c.header), true);
          for (const row of t.rows) drawRow(cols.map((c: { key: string }) => String(row[c.key] ?? '')), false);
          doc.moveDown(0.6);
        } else {
          await renderOneImage(doc, it.value, opts.images);
        }
      }
    };

    renderFlow().then(() => doc.end()).catch((err) => doc.emit('error', err));
  });
}
