// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import JSZip from 'jszip';
import type { ImageItem, TableData, PptxInput } from './types.js';
import type { GenerateContext } from './generator.js';
import { computeSize, intrinsicSize, resolveImage, svgToPng } from './images.js';

/**
 * Template-based PPTX rendering.
 *
 * A style template's design lives in its slide master / layouts / theme (fonts,
 * colors, background art, placeholder geometry). pptxgenjs only renders raw
 * text boxes, so a generated deck never engages those layouts. Instead we build
 * the deck ON the template package: slides carry placeholder shapes (`p:ph`)
 * that PowerPoint resolves against the template's layouts, so the template's
 * styles really show through (fonts, colors, positions, master/layout art).
 */

const EMU = 914400;
const IN = (v: number): number => Math.round(v * EMU);
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string);
const NSP = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NSA = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NSREL = 'http://schemas.openxmlformats.org/package/2006/relationships';

const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';
const SLIDE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const REL_SLIDE_LAYOUT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const REL_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';

interface LayoutPh { type: string; idx?: number }
interface TplLayout { path: string; file: number; type: string; name: string; phs: LayoutPh[] }
type Rel = { id: string; type: string; target: string };

const ZIPCR = { async: (a: string): Promise<never> => { throw new Error('missing zip entry'); } } as never;

async function discoverLayouts(zip: JSZip): Promise<TplLayout[]> {
  const out: TplLayout[] = [];
  const re = /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const m = re.exec(path);
    if (!m) continue;
    const xml = await file.async('string');
    const type = /<p:sldLayout[^>]*?type="([^"]+)"[^>]*>/i.exec(xml)?.[1] ?? '';
    const name = /<p:cSld name="([^"]*)"/i.exec(xml)?.[1] ?? '';
    const phs: LayoutPh[] = [];
    for (const node of xml.matchAll(/<p:ph\b[^>]*\/>/g)) {
      const d = node[0];
      const t = /type="([^"]+)"/.exec(d)?.[1] ?? 'obj';
      const idxRaw = /idx="(\d+)"/.exec(d)?.[1];
      phs.push({ type: t, idx: idxRaw === undefined ? undefined : Number(idxRaw) });
    }
    out.push({ path, file: Number(m[1]), type, name, phs });
  }
  out.sort((a, b) => a.file - b.file);
  return out;
}

function pickLayouts(layouts: TplLayout[]): { title: TplLayout; content: TplLayout } {
  const title = layouts.find((l) => l.type === 'title') ?? layouts[0];
  const hasTitle = (l: TplLayout): boolean => l.phs.some((p) => p.type === 'title' || p.type === 'ctrTitle');
  const hasBody = (l: TplLayout): boolean => l.phs.some((p) => p.type === 'obj' || p.type === 'body');
  const content =
    layouts.find((l) => l.type !== 'title' && hasTitle(l) && hasBody(l)) ??
    layouts.find((l) => (l.type === 'obj' || l.type === 'titleAndBody' || l.type === 'objTx' || l.type === 'picTx' || l.type === 'twoObj') && hasBody(l)) ??
    layouts.find((l) => hasBody(l)) ??
    layouts.find((l) => hasTitle(l)) ??
    layouts[0];
  return { title, content };
}

interface IdGen { next(): number }

function phShape(o: { id: number; name: string; type: string; idx?: number; paras: unknown[] }): string {
  const attr = o.idx === undefined ? `type="${o.type}"` : `type="${o.type}" idx="${o.idx}"`;
  const runs = o.paras
    .map((t) => `<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`)
    .join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${o.id}" name="${esc(o.name)}"/><p:cNvSpPr/><p:nvPr><p:ph ${attr}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr rtlCol="0"/><a:lstStyle/>${runs}</p:txBody></p:sp>`;
}

function textShape(o: {
  id: number;
  text: unknown;
  x: number; y: number; w: number; h: number;
  size: number; color: string; align?: 'l' | 'ctr' | 'r'; italic?: boolean; bold?: boolean;
}): string {
  const algn = o.align === 'ctr' ? ' algn="ctr"' : o.align === 'r' ? ' algn="r"' : '';
  const attrs = `${o.bold ? ' b="1"' : ''}${o.italic ? ' i="1"' : ''}${o.color ? `><a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>` : '>'}`;
  const rPr = `<a:rPr lang="zh-CN" altLang="en-US" sz="${o.size * 100}"${attrs}</a:rPr>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${o.id}" name="${esc(o.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${IN(o.x)}" y="${IN(o.y)}"/><a:ext cx="${IN(o.w)}" cy="${IN(o.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr rtlCol="0"${algn} anchor="ctr"/><a:lstStyle/><a:p><a:r>${rPr}<a:t>${esc(o.text)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${o.size * 100}"/></a:p></p:txBody></p:sp>`;
}

function picShape(o: { id: number; name: string; rId: string; x: number; y: number; w: number; h: number }): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${o.id}" name="${esc(o.name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${o.rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${IN(o.x)}" y="${IN(o.y)}"/><a:ext cx="${IN(o.w)}" cy="${IN(o.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function tableShape(o: { id: number; startY: number; name?: string; columns: { key: string; header: string }[]; rows: Record<string, unknown>[] }): { xml: string; heightIn: number } {
  const cols = o.columns ?? Object.keys(o.rows[0] ?? {}).map((k) => ({ key: k, header: k }));
  const tableW = 12.1;
  const rowH = 0.34;
  const colW = cols.length ? Math.round((tableW / cols.length) * 10000) / 10000 : 0;
  const grid = cols.map(() => `<a:gridCol w="${IN(colW)}"/>`).join('');
  const header = cols
    .map((col) => {
      const content = `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN" altLang="en-US" b="1"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr><a:t>${esc(col.header)}</a:t></a:r></a:p>`;
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${content}</a:txBody><a:tcPr anchor="ctr"/></a:tc>`;
    })
    .join('');
  const bodyRows = o.rows
    .map((row) => {
      const cells = cols
        .map((col) => {
          const v = row[col.key];
          const t = v === null || v === undefined ? '' : String(v);
          const cell = `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN" altLang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
          return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${cell}</a:txBody><a:tcPr anchor="ctr"/></a:tc>`;
        })
        .join('');
      return `<a:tr h="${IN(rowH)}">${cells}</a:tr>`;
    })
    .join('');
  const heightIn = (o.rows.length + 1) * rowH;
  const xml =
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${o.id}" name="${esc(o.name ?? 'Table')}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${IN(0.45)}" y="${IN(o.startY)}"/><a:ext cx="${IN(tableW)}" cy="${IN(heightIn)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${TABLE_URI}"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>` +
    `<a:tr h="${IN(rowH)}">${header}</a:tr>${bodyRows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  return { xml, heightIn };
}

function slideRelsPath(partPath: string): string {
  if (!partPath.includes('/')) return partPath;
  const i = partPath.lastIndexOf('/');
  return partPath.slice(0, i) + '/_rels/' + partPath.slice(i + 1) + '.rels';
}

/**
 * Extract the "background layer" of a template slide: every real placed picture
 * (p:pic) plus decorative non-placeholder shapes, excluding text/body
 * placeholders we will replace. Returned shapes are re-mapped to fresh rIds so
 * they never collide with the caller's ids, and the matching image relationships
 * are returned so callers can attach them to the generated slide.
 */
async function extractBgPics(zip: JSZip, slidePath: string): Promise<{ shapes: string[]; rels: Rel[] }> {
  const shapes: string[] = [];
  const rels: Rel[] = [];
  try {
    const xml = await zip.file(slidePath)!.async('string');
    const relsPath = slideRelsPath(slidePath);
    const relsXmlStr = (await zip.file(relsPath)?.async('string')) ?? '';
    const relOf = new Map<string, { type: string; target: string }>();
    for (const m of relsXmlStr.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"/g)) {
      relOf.set(m[1], { type: m[2], target: m[3] });
    }
    let rid = 1;
    const nextRel = (): string => 'rIdBg' + rid++;
    for (const m of xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)) {
      const pic = m[0];
      const embed = /r:embed="([^"]+)"/.exec(pic)?.[1];
      if (!embed) continue;
      const rel = relOf.get(embed);
      if (!rel) continue;
      const newId = nextRel();
      rels.push({ id: newId, type: rel.type, target: rel.target });
      shapes.push(pic.replace(new RegExp('r:embed="' + embed + '"'), 'r:embed="' + newId + '"'));
    }
  } catch {
    /* no background layer for this slide */
  }
  return { shapes, rels };
}

function slideXml(spTree: string, bg?: string): string {
  const bgXml = bg ? '<p:bg>' + bg + '</p:bg>' : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="' + NSA + '" xmlns:r="' + NSR + '" xmlns:p="' + NSP + '"><p:cSld name="Slide">' + bgXml + '<p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    spTree +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

/** Resolve the effective background fill for a layout by walking the
 *  layout -> slide master chain, starting from the layout itself. Returns
 *  the inner XML of the winning <p:bg>...</p:bg> (without the p:bg tag),
 *  or '' when no explicit background is defined anywhere in the chain. */
async function resolveBackground(zip: JSZip, layoutPath: string): Promise<string> {
  const hasBg = (xml: string): string | null => {
    const m = /<p:bg>([\s\S]*?)<\/p:bg>/.exec(xml);
    if (!m) return null;
    // Only keep real fill content (solidFill / gradFill / blipFill / grpFill / pattFill).
    if (!/<a:(solidFill|gradFill|blipFill|grpFill|pattFill)/.test(m[1])) return null;
    return m[1].trim();
  };
  try {
    const layoutXml = await zip.file(layoutPath)!.async('string');
    const own = hasBg(layoutXml);
    if (own !== null) return own;
    // No background on the layout: walk to its slide master.
    const relsPath = slideRelsPath(layoutPath);
    const relsXmlStr = await zip.file(relsPath)!.async('string');
    const masterRel = /<Relationship[^>]+Type="[^"]*\/slideMaster"[^>]*Target="([^"]+)"/.exec(relsXmlStr);
    if (!masterRel) return '';
    const masterPath = 'ppt/' + masterRel[1].replace(/^\.\.\//, '');
    const masterXml = await zip.file(masterPath)!.async('string');
    const masterBg = hasBg(masterXml);
    if (masterBg !== null) return masterBg;
  } catch {
    /* fall through */
  }
  return '';
}
function relsXml(rels: Rel[]): string {
  const body = rels
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NSREL}">${body}</Relationships>`;
}

function maxImageIndex(zip: JSZip): number {
  let max = 0;
  for (const p of Object.keys(zip.files)) {
    const m = /^ppt\/media\/image(\d+)\.[a-zA-Z0-9]+$/.exec(p);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function extContentType(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    default: return `image/${ext}`;
  }
}

interface ImageRender {
  shapes: string[];
  rels: Rel[];
}

async function renderImages(
  images: ImageItem[],
  startY: number,
  opts: { media: { n: number }; out: JSZip; rIdStart: number; ctExts: Set<string> },
): Promise<ImageRender> {
  const shapes: string[] = [];
  const rels: Rel[] = [];
  const idOf = (base: number, i: number): number => {
    // image ids start at 40 so they never collide with title/body/footer (2..4)
    return base + i;
  };
  let y = startY;
  let rId = opts.rIdStart;
  const maxW = 12.1;
  const safeEnd = 6.7;
  const slot = images.length > 0 ? Math.max(0.5, (safeEnd - startY) / images.length) : 0;
  for (let i = 0; i < images.length; i++) {
    const raw = await resolveImage(images[i]);
    let buffer = raw.buffer;
    let format = raw.format;
    if (raw.kind === 'svg') {
      const { png } = await svgToPng(raw.buffer);
      buffer = png;
      format = 'png';
    }
    const intrinsic = intrinsicSize(buffer, format);
    const px = computeSize({ width: raw.width, height: raw.height }, intrinsic, 320);
    let wIn = px.width / 96;
    let hIn = px.height / 96;
    const slotH = hIn + (raw.caption ? 0.45 : 0.15);
    const scale = Math.min(1, maxW / (wIn || 1), slot > 0 ? slot / (slotH || 1) : 1);
    wIn = Math.max(0.1, wIn * scale);
    hIn = Math.max(0.1, hIn * scale);

    let x = 0.9;
    if (raw.align === 'center') x = (13.33 - wIn) / 2;
    else if (raw.align === 'right') x = 13.33 - 0.9 - wIn;

    const ext = format === 'jpeg' ? 'jpg' : format;
    opts.media.n += 1;
    const mediaName = `image${opts.media.n}.${ext}`;
    opts.out.file(`ppt/media/${mediaName}`, buffer);
    opts.ctExts.add(ext);
    const relId = `rId${rId++}`;
    rels.push({ id: relId, type: REL_IMAGE, target: `../media/${mediaName}` });
    shapes.push(picShape({ id: idOf(40, i), name: 'Image', rId: relId, x, y, w: wIn, h: hIn }));
    if (raw.caption) {
      shapes.push(textShape({ id: idOf(70, i), text: raw.caption, x, y: y + hIn + 0.08, w: wIn, h: 0.3, size: 10, color: '666666', align: 'ctr' }));
    }
    y += slot;
  }
  return { shapes, rels };
}

export async function renderPptxFromTemplate(input: PptxInput, ctx: GenerateContext): Promise<Buffer> {
  const tpl = await JSZip.loadAsync(ctx.styleTemplate as unknown as Buffer);
  const layouts = await discoverLayouts(tpl);
  if (layouts.length === 0) throw new Error('style template contains no slide layouts');
  const { title: titleLayout, content: contentLayout } = pickLayouts(layouts);
  const footerIdx = contentLayout.phs.find((p) => p.type === 'ftr')?.idx;

  // Background art (full-bleed pictures) is layered onto the original template
  // slides, not on layouts/masters, so we lift it from the first (cover) and
  // second (content) source slides and re-emit it on top of every generated
  // slide so the template's design survives deck replacement.
  const coverBg = await extractBgPics(tpl, 'ppt/slides/slide1.xml');
  const contentBg = await extractBgPics(tpl, 'ppt/slides/slide2.xml');

  const out = new JSZip();
  for (const [path, file] of Object.entries(tpl.files)) {
    if (file.dir) continue;
    if (/^ppt\/slides\//.test(path) || /^ppt\/notesSlides\//.test(path)) continue;
    out.file(path, await file.async('uint8array'));
  }

  const ctXml0 = (await tpl.file('[Content_Types].xml')!.async('string')) ?? '';
  const ctExts = new Set<string>();
  for (const ext of ctXml0.matchAll(/<Default Extension="([^"]+)"[^>]*\/>/g)) ctExts.add(ext[1]);

  // next free relationship id within presentation.xml.rels
  const prRelsXml = await tpl.file('ppt/_rels/presentation.xml.rels')!.async('string');
  let maxRid = 0;
  for (const m of prRelsXml.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
  let rIdCounter = maxRid + 1;
  const newPresId = (): string => `rId${rIdCounter++}`;

  const media = { n: maxImageIndex(tpl) };

  interface SlideEnt { file: string; xml: string; relId: string }
  const slides: SlideEnt[] = [];
  const slideRelsByFile = new Map<string, Rel[]>();

  const appendSlide = async (spTree: string, rels: Rel[], layoutPath: string, bg: { shapes: string[]; rels: Rel[] } | undefined = undefined): Promise<void> => {
    const file = `slide${slides.length + 1}.xml`;
    const relId = newPresId();
    const allRels = [{ id: 'rId1', type: REL_SLIDE_LAYOUT, target: `../${layoutPath.replace(/^ppt\//, '')}` }, ...(bg?.rels ?? []), ...rels];
    slideRelsByFile.set(file, allRels);
    const bgShapes = bg?.shapes?.join('') ?? '';
    slides.push({ file, xml: slideXml(bgShapes + spTree, await resolveBackground(tpl, layoutPath)), relId });
  };

  // ---- title slide ----
  let shapes = [phShape({ id: 2, name: 'Title', type: 'ctrTitle', paras: [input.title] })];
  if (input.author) {
    shapes.push(phShape({ id: 3, name: 'Subtitle', type: 'subTitle', idx: 1, paras: [`by ${input.author}`] }));
  }
  await appendSlide(shapes.join(''), [], titleLayout.path, coverBg);

  // ---- content slides ----
  if (input.slides) {
    for (let si = 0; si < input.slides.length; si++) {
      const slide = input.slides[si];
      shapes = [];
      const rels: Rel[] = [];
      const ids = { n: 2 };
      const nextId = (): number => ids.n++;
      const useTitleLayout = slide.layout === 'title';
      const layoutPath = useTitleLayout ? titleLayout.path : contentLayout.path;

      if (useTitleLayout) {
        if (slide.title) shapes.push(phShape({ id: nextId(), name: 'Title', type: 'ctrTitle', paras: [slide.title] }));
        if (slide.subtitle) shapes.push(phShape({ id: nextId(), name: 'Subtitle', type: 'subTitle', idx: 1, paras: [slide.subtitle] }));
      } else {
        if (slide.title) shapes.push(phShape({ id: nextId(), name: 'Title', type: 'title', paras: [slide.title] }));
        let midY = 1.9;
        if (slide.bullets && slide.bullets.length > 0) {
          shapes.push(phShape({ id: nextId(), name: 'Body', type: 'obj', idx: 1, paras: slide.bullets }));
          midY = 5.6;
        }
        if (slide.tables && slide.tables.length > 0) {
          for (const t of slide.tables) {
            const tbl = tableShape({ id: nextId(), name: 'Table', startY: midY, columns: t.columns, rows: t.rows });
            shapes.push(tbl.xml);
            midY += tbl.heightIn + 0.2;
          }
        }
        if (slide.images && slide.images.length > 0) {
          const render = await renderImages(slide.images, midY, {
            media,
            out,
            rIdStart: 40 + (si + 1) * 10,
            ctExts,
          });
          shapes.push(...render.shapes);
          rels.push(...render.rels);
        }
        if (slide.footer) {
          if (footerIdx !== undefined) {
            shapes.push(phShape({ id: nextId(), name: 'Footer', type: 'ftr', idx: footerIdx, paras: [slide.footer] }));
          } else {
            shapes.push(textShape({ id: nextId(), text: slide.footer, x: 0.45, y: 6.78, w: 11, h: 0.3, size: 9, color: '999999' }));
          }
        }
      }
      await appendSlide(shapes.join(''), rels, layoutPath, contentBg);
    }
  }

  // ---- write slide parts ----
  for (const s of slides) {
    out.file(`ppt/slides/${s.file}`, s.xml);
    out.file(`ppt/slides/_rels/${s.file}.rels`, relsXml(slideRelsByFile.get(s.file)!));
  }

  // ---- presentation.xml: swap sldIdLst (numeric slide ids — PowerPoint
  // rejects GUID-form ids here) ----
  const prsXml = await tpl.file('ppt/presentation.xml')!.async('string');
  const sldIdLst =
    `<p:sldIdLst>` +
    slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="${s.relId}"/>`).join('') +
    `</p:sldIdLst>`;
  out.file('ppt/presentation.xml', prsXml.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/s, sldIdLst));

  // ---- presentation rels: keep non-slide, add slides ----
  const kept: Rel[] = [];
  const reg = /<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"/g;
  let mm: RegExpExecArray | null;
  while ((mm = reg.exec(prRelsXml))) {
    if (mm[2] === REL_SLIDE) continue;
    kept.push({ id: mm[1], type: mm[2], target: mm[3] });
  }
  for (const s of slides) kept.push({ id: s.relId, type: REL_SLIDE, target: `slides/${s.file}` });
  out.file('ppt/_rels/presentation.xml.rels', relsXml(kept));

  // ---- [Content_Types].xml ----
  const overrides = slides
    .map((s) => `<Override PartName="/ppt/slides/${s.file}" ContentType="${SLIDE_CONTENT_TYPE}"/>`)
    .join('');
  const ct = ctXml0
    .replace(/<Override[^>]*PartName="\/ppt\/slides\/[^"]*"[^>]*\/>\s*/g, '')
    .replace(/<Override[^>]*PartName="\/ppt\/notesSlides\/[^"]*"[^>]*\/>\s*/g, '')
    .replace('</Types>', overrides + extDefaults(ctXml0, ctExts) + '</Types>');
  out.file('[Content_Types].xml', ct);

  return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function extDefaults(ctXml0: string, exts: Set<string>): string {
  const have = new RegExp('<' + 'Default Extension="([^"]+)"', 'g');
  have.lastIndex = 0;
  const existing = new Set<string>();
  for (const m of ctXml0.matchAll(/<Default Extension="([^"]+)"/g)) existing.add(m[1]);
  return [...exts]
    .filter((e) => !existing.has(e))
    .map((e) => `<Default Extension="${e}" ContentType="${extContentType(e)}"/>`)
    .join('');
}
