import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from 'docx';
import JSZip from 'jszip';
import type { DocxInput, ImageItem, ParagraphItem, TableData } from './types.js';
import type { Generator, GenerateContext } from './generator.js';
import { computeSize, intrinsicSize, resolveImage, svgToPng } from './images.js';
import { markdownToDocx } from './markdown.js';

/**
 * 内置的中文排版默认样式（无外部模板时的兜底观感）。
 * - 正文：宋体 12pt、首行缩进 2 字符、1.5 倍行距、两端对齐
 * - 标题：黑体 + 逐级递减字号/颜色层级
 * - 标题段落写入 outlineLvl，供 Word 导航窗格/目录（TableOfContents）识别
 * 说明：若应用了外部样式模板（applyStyleTemplate 覆盖 styles.xml），本默认值不生效；
 * 因此模板应用时会做样式 id 映射/补全，确保标题不被退回正文。
 */
const DEFAULT_DOCX_STYLES: ConstructorParameters<typeof Document>[0]['styles'] = {
  default: {
    document: {
      run: { font: '宋体', size: 24 },
      paragraph: {
        spacing: { line: 360 },
        indent: { firstLine: 480 },
      },
    },
    title: {
      run: { font: '黑体', size: 40, bold: true, color: '000000' },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 480 } },
    },
    heading1: {
      run: { font: '黑体', size: 32, bold: true, color: '1F4E79' },
      paragraph: { spacing: { before: 480, after: 240 } },
    },
    heading2: {
      run: { font: '黑体', size: 28, bold: true, color: '2E5A88' },
      paragraph: { spacing: { before: 400, after: 200 } },
    },
    heading3: {
      run: { font: '黑体', size: 24, bold: true, color: '44618A' },
      paragraph: { spacing: { before: 320, after: 160 } },
    },
    heading4: {
      run: { font: '黑体', size: 22, bold: true, color: '44618A' },
      paragraph: { spacing: { before: 240, after: 120 } },
    },
    heading5: {
      run: { font: '黑体', size: 21, bold: true, color: '555555' },
      paragraph: { spacing: { before: 200, after: 100 } },
    },
    heading6: {
      run: { font: '黑体', size: 21, bold: true, color: '666666' },
      paragraph: { spacing: { before: 200, after: 100 } },
    },
  },
};

function docxLevel(level: number | undefined): string | undefined {
  if (!level || level < 1) return undefined;
  switch (level) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    case 4: return HeadingLevel.HEADING_4;
    case 5: return HeadingLevel.HEADING_5;
    default: return HeadingLevel.HEADING_6;
  }
}

function toAlignment(align: ParagraphItem['align']): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (align) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    default: return undefined;
  }
}

function paragraphToDocx(p: ParagraphItem): Paragraph {
  const heading = docxLevel(p.level);
  const align = toAlignment(p.align);
  const children = [
    new TextRun({
      text: p.text,
      bold: p.bold,
      italics: p.italic,
      size: p.fontSize ? p.fontSize * 2 : undefined,
      color: p.color ? p.color.replace('#', '') : undefined,
    }),
  ];
  const options: ConstructorParameters<typeof Paragraph>[0] = {
    ...(heading ? { heading: heading as IParagraphOptions['heading'] } : {}),
    alignment: align,
    numbering: p.bullet ? { reference: 'bullets', level: 0 } : undefined,
    children,
  };
  return new Paragraph(options);
}

async function imageToDocxParagraphs(img: ImageItem): Promise<Paragraph[]> {
  const resolved = await resolveImage(img);
  const intrinsic = intrinsicSize(resolved.buffer, resolved.format);
  const size = computeSize({ width: resolved.width, height: resolved.height }, intrinsic, 400);

  const isSvg = resolved.kind === 'svg';
  const typeContent: 'png' | 'jpg' | 'gif' | 'bmp' | 'svg' = isSvg
    ? 'svg'
    : ({ png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', bmp: 'bmp' } as Record<string, 'png' | 'jpg' | 'gif' | 'bmp'>)[resolved.format] ?? 'png';
  const transformation = { width: Math.round(size.width), height: Math.round(size.height) };

  // Word requires the SVG to come with a raster fallback, so we rasterize it.
  let run: ImageRun;
  if (isSvg) {
    const { png } = await svgToPng(resolved.buffer);
    run = new ImageRun({
      type: 'svg',
      data: resolved.buffer.toString('base64'),
      transformation,
      fallback: { type: 'png', data: png.toString('base64'), transformation },
    } as never);
  } else {
    run = new ImageRun({
      type: typeContent,
      data: resolved.buffer.toString('base64'),
      transformation,
    } as never);
  }

  const alignMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType] | undefined> = {
    left: undefined,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  };
  const paragraphs: Paragraph[] = [
    new Paragraph({ alignment: alignMap[resolved.align ?? 'left'], children: [run] }),
  ];
  if (resolved.caption) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40 },
      children: [new TextRun({ text: resolved.caption, size: 18, italics: true, color: '666666' })],
    }));
  }
  paragraphs.push(new Paragraph({ children: [] }));
  return paragraphs;
}

function tableToDocx(t: TableData): Table {
  const cols = t.columns ?? Object.keys(t.rows[0] ?? {}).map((k) => ({ key: k, header: k }));
  // 统一的三线式/网格边框 + 表头底色，避免默认的"无边框、无底纹"原始观感
  const edges = { style: BorderStyle.SINGLE, size: 6, color: '333333' } as const;
  const inside = { style: BorderStyle.SINGLE, size: 4, color: '999999' } as const;
  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map((c) => new TableCell({
      shading: { type: 'clear' as any, fill: 'D9E2F3' },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.header, bold: true })] })],
    })),
  });
  const bodyRows = t.rows.map((row) => new TableRow({
    children: cols.map((c) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(row[c.key] ?? '') })] })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: edges, bottom: edges, left: edges, right: edges,
      insideHorizontal: inside, insideVertical: inside,
    } as never,
    rows: [headerRow, ...bodyRows],
  });
}

async function buildDocument(input: DocxInput): Promise<Document> {
  const children: (Paragraph | Table)[] = [];

  if (input.title) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: input.title, bold: true })],
    }));
  }

  // 自动目录：正文存在 1-6 级标题时插入，覆盖全部标题层级（TOC 域，WPS/Word 打开自动刷新）
  const hasHeadings = (input.paragraphs ?? []).some((p) => p.level && p.level >= 1 && p.level <= 6);
  if (hasHeadings) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '目录', bold: true })],
    }));
    children.push(new TableOfContents({ caption: '', alignment: AlignmentType.LEFT, hyperlink: true, headingStyleRange: '1-6' } as never));
    children.push(new Paragraph({ children: [] }));
  }

  for (const p of input.paragraphs ?? []) children.push(paragraphToDocx(p));

  for (const t of input.tables ?? []) {
    children.push(new Paragraph({ children: [] }));
    children.push(tableToDocx(t));
  }

  for (const img of input.images ?? []) {
    children.push(...(await imageToDocxParagraphs(img)));
  }

  return new Document({
    creator: input.author,
    title: input.title,
    styles: DEFAULT_DOCX_STYLES,
    // 让 WPS/Word 打开时自动刷新目录域
    features: { updateFields: true },
    numbering: {
      config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT }] }],
    },
    sections: [{
      properties: {},
      children,
      footers: input.footer ? {
        default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: input.footer, size: 18 })] })] }),
      } : undefined,
    }],
  });
}

/**
 * Apply a style template by MERGING its styles/theme/fonts into the freshly
 * generated document, instead of blindly overwriting `styles.xml`.
 *
 * The generated document's `document.xml` references fixed style ids
 * (`Title`, `Heading1`...`Heading6`, `Normal`) that the docx library emits.
 * Many user templates only define numbered ids (`a`, `a0`..`a5`) with no
 * `Heading1` etc., so wholesale-replacing `styles.xml` makes every heading fall
 * back to body text. Here we:
 *   - start from the generated `styles.xml` (guarantees every referenced id exists),
 *   - overlay each template style by the SAME id so a user's custom look wins,
 *   - keep the generated heading/title definitions when the template lacks them,
 *   - theme + fontTable come from the template for its brand fonts.
 * This yields a readable layout that still honors a real template's styling.
 */
async function applyStyleTemplate(generated: Buffer, template: Buffer): Promise<Buffer> {
  const gen = await JSZip.loadAsync(generated);
  const tpl = await JSZip.loadAsync(template);

  const genStyles = await gen.file('word/styles.xml')?.async('string');
  const tplStyles = await tpl.file('word/styles.xml')?.async('string');
  if (genStyles && tplStyles) {
    // collect each <w:style ...>...</w:style> by styleId
    const collect = (xml: string): Map<string, string> => {
      const m = new Map<string, string>();
      const re = /<w:style\b[\s\S]*?<\/w:style>/g;
      let hit: RegExpExecArray | null;
      while ((hit = re.exec(xml))) {
        const id = /w:styleId="([^"]+)"/.exec(hit[0])?.[1];
        if (id) m.set(id, hit[0]);
      }
      return m;
    };
    const genMap = collect(genStyles);
    const tplMap = collect(tplStyles);
    const merged = new Map<string, string>(genMap); // start from generated (all ids exist)
    for (const [id, xml] of tplMap) {
      // If the template has a "real" heading id (Heading1 etc.) it wins; otherwise
      // keep the generated one so title/headings never degrade to body text.
      if (/^(Title|Heading[1-6])$/i.test(id)) merged.set(id, xml);
      else merged.set(id, xml);
    }
    // Preserve generated heading/title styles that the template lacks entirely
    for (const [id, xml] of genMap) {
      if (/^(Title|Heading[1-6])$/i.test(id) && !tplMap.has(id)) merged.set(id, xml);
    }
    // docDefaults: prefer template's (fonts/paragraph defaults), else generated
    const tplDefaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(tplStyles)?.[0];
    const genDefaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(genStyles)?.[0];
    const defaults = tplDefaults || genDefaults || '';
    const styleList = [...merged.values()].join('');
    const nextGen = genStyles.replace(/<w:style\b[\s\S]*?<\/w:style>/g, '').replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/g, '');
    // rebuild: keep everything **before** <w:styles> body (latentStyles etc.) minimal
    const header = /(<w:styles[^>]*>)/.exec(genStyles)?.[1] ?? '<w:styles>';
    const tail = '</w:styles>';
    gen.file('word/styles.xml', `${header}${defaults}${styleList}${tail}`);
  }

  // theme + fontTable from template (brand fonts / colors)
  for (const part of ['word/theme/theme1.xml', 'word/fontTable.xml']) {
    const file = tpl.file(part);
    if (file) gen.file(part, await file.async('string'));
  }

  // ---- 移植模板的页眉/页脚（含其引用的图片等资源）----
  await copyTemplateHeaderFooter(gen, tpl);

  return Buffer.from(await gen.generateAsync({ type: 'nodebuffer' }));
}

/**
 * Copy the template's header / footer Parts (and any resources they reference,
 * e.g. logos in word/media/*) into the freshly generated docx, and wire them up
 * via the document's sectPr (headerReference / footerReference) + rels.
 *
 * IMPORTANT (OOXML validity):
 *  - The header/footer part and its own .rels share an *internal* rId namespace
 *    (e.g. header2.xml references r:embed="rId1" -> header2.xml.rels rId1). We must
 *    copy BOTH verbatim so the pairing stays intact — never rewrite those rIds.
 *  - Only the *document-level* relationship (document.xml.rels -> headerN.xml) and
 *    the sectPr headerReference/footerReference use a NEW rId, allocated here.
 *  - Some templates (esp. WPS) declare headerReference/footerReference with
 *    w:type="first"/"even" but never set `evenAndOddHeaders`/`titlePg`, which Word
 *    treats as corrupt. To stay safe we only wire up the `default` page type and
 *    pick the most content-rich header/footer part (+ its resources).
 */
async function copyTemplateHeaderFooter(gen: JSZip, tpl: JSZip): Promise<void> {
  const genDocRelsName = 'word/_rels/document.xml.rels';
  let genDocRels = (await gen.file(genDocRelsName)?.async('string')) ?? '';
  const used = new Set<string>([...genDocRels.matchAll(/Id="(rId\d+)"/g)].map((m) => m[1]));
  let next = 1;
  const newId = (): string => { let id: string; do { id = 'rId' + next++; } while (used.has(id)); used.add(id); return id; };

  // ---- 1) 读取模板 document.xml.rels：rId -> part path ----
  const tplDocRels = (await tpl.file(genDocRelsName)?.async('string')) ?? '';
  const tplRelMap = new Map<string, string>();
  for (const m of tplDocRels.matchAll(/<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"/g)) {
    const [, rid, type, target] = m;
    if (/header$|footer$/.test(type)) tplRelMap.set(rid, 'word/' + target);
  }

  // ---- 2) 从模板 sectPr 得到一堆 (kind, type, partPath) 引用，只保留 default ----
  const tplDocXml = (await tpl.file('word/document.xml')?.async('string')) ?? '';
  const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(tplDocXml)?.[0] ?? '';
  const candidates: Array<{ kind: 'header' | 'footer'; type: string; part: string }> = [];
  for (const m of sectPr.matchAll(/<w:(headerReference|footerReference) w:type="([^"]+)" r:id="([^"]+)"/g)) {
    const kind = (m[1] as 'headerReference' | 'footerReference') === 'headerReference' ? 'header' : 'footer';
    const part = tplRelMap.get(m[3]);
    if (part) candidates.push({ kind, type: m[2], part });
  }
  if (!candidates.length) return;

  // ---- 3) 选 default 部件；若无 default，选内容最丰富的那个 ----
  const richness = (p: string): number => {
    const f = tpl.file(p);
    return f ? f.async('string').then((x) => x.length).catch(() => 0) as unknown as number : 0;
  };
  const pick = async (kind: 'header' | 'footer'): Promise<string | null> => {
    const list = candidates.filter((c) => c.kind === kind);
    if (!list.length) return null;
    const def = list.find((c) => c.type === 'default');
    if (def) return def.part;
    // fall back to the largest part (most content)
    const sizes: Array<{ part: string; n: number }> = [];
    for (const c of list) sizes.push({ part: c.part, n: await richness(c.part) });
    sizes.sort((a, b) => b.n - a.n);
    return sizes[0]?.part ?? null;
  };

  const headerPart = await pick('header');
  const footerPart = await pick('footer');

  // ---- 4) 拷贝选中的 header/footer 部件 + 它们的 .rels + 引用资源（原样，内部 rId 不动）----
  const copyPart = async (part: string, kind: 'header' | 'footer'): Promise<string> => {
    const base = part.split('/').pop() as string;
    // 部件本身 + 其 .rels 原样拷贝（内部 rId 自洽）
    gen.file(part, await tpl.file(part)!.async('nodebuffer'));
    const relsPath = 'word/_rels/' + base + '.rels';
    const relStr = (await tpl.file(relsPath)?.async('string')) ?? '';
    if (relStr) {
      gen.file(relsPath, relStr);
      // 拷贝其引用的资源（如 media/image1.jpeg、引用文档等），保持相同内部 rId
      for (const rm of relStr.matchAll(/<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"/g)) {
        const [, , rtype, rtarget] = rm;
        if (/^https?:|\/wordmedia\//.test(rtarget)) continue;
        const targetName = 'word/' + rtarget.replace(/^\.\//, '');
        const tf = tpl.file(targetName);
        if (tf) gen.file(targetName, await tf.async('nodebuffer'));
        // 若目标还有自己的 rels（如 header 引用到 image 的 caption 等），一并拷贝
        const rtRels = 'word/_rels/' + targetName.split('/').pop() + '.rels';
        const rf = tpl.file(rtRels);
        if (rf) gen.file(rtRels, await rf.async('string'));
      }
    }
    // document.xml.rels 顶层关联（新 rId 指向该部件）
    const gid = newId();
    const relType = kind === 'header'
      ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
      : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
    genDocRels = genDocRels.replace('</Relationships>', `<Relationship Id="${gid}" Type="${relType}" Target="${base}"/></Relationships>`);
    gen.file(genDocRelsName, genDocRels);
    return gid;
  };

  const hId = headerPart ? await copyPart(headerPart, 'header') : null;
  const fId = footerPart ? await copyPart(footerPart, 'footer') : null;

  // ---- 5) 注册 header/footer 部件的 Content-Type（OOXML 必需，否则 Word 报"无法读取内容"）----
  // docx 库生成的 [Content_Types].xml 不含模板新增的 header/footer 部件声明。
  const ctName = '[Content_Types].xml';
  const ctXml = (await gen.file(ctName)?.async('string')) ?? '';
  let ct = ctXml;
  const addOverride = (partName: string, contentType: string): void => {
    if (ct.includes(`PartName="${partName}"`)) return;
    ct = ct.replace('</Types>', `<Override ContentType="${contentType}" PartName="${partName}"/></Types>`);
  };
  if (headerPart) {
    const base = headerPart.split('/').pop() as string;
    addOverride(`/word/${base}`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
  }
  if (footerPart) {
    const base = footerPart.split('/').pop() as string;
    addOverride(`/word/${base}`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');
  }
  if (ct !== ctXml) gen.file(ctName, ct);

  // ---- 6) 写 sectPr：仅 default 引用 ----
  const genDocXml = (await gen.file('word/document.xml')?.async('string')) ?? '';
  if (genDocXml.includes('<w:sectPr>')) {
    let refs = '';
    if (hId) refs += `<w:headerReference w:type="default" r:id="${hId}"/>`;
    if (fId) refs += `<w:footerReference w:type="default" r:id="${fId}"/>`;
    if (refs) gen.file('word/document.xml', genDocXml.replace('<w:sectPr>', `<w:sectPr>${refs}`));
  }
}

export const docxGenerator: Generator = {
  format: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: 'docx',
  async generate(input: any, ctx?: GenerateContext): Promise<Buffer> {
    const docs = markdownToDocx(String(input?.content || ''));
    docs.title = (input.title as string) || docs.title;
    docs.author = (input.author as string) || docs.author;
    docs.footer = (input.footer as string) || docs.footer;
    const buffer = await Packer.toBuffer(await buildDocument(docs));
    if (ctx?.styleTemplate) {
      try {
        return await applyStyleTemplate(buffer, ctx.styleTemplate);
      } catch (err) {
        console.warn('[ai-doc] failed to apply docx style template, falling back to default styling:', (err as Error).message);
      }
    }
    return buffer;
  },
};
