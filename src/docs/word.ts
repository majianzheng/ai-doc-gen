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
 * 以模板为基座应用样式模板（"完全复用"）：
 * - 模板包里的**全部部件**（页眉/页脚、样式、主题、settings/webSettings、版面、
 *   字体表、media、自定义 XML/属性等）原样保留；
 * - 只把生成文档的正文（标题/目录/段落/表格/图片）替换进模板 `<w:body>`，
 *   并保留模板自己的 sectPr（页眉页脚引用、页面尺寸/边距/文档网格）——
 *   等价于"在 Word 里打开模板、只替换正文内容"，与模板完全一致。
 * - 正文用到的样式按模板同名样式（w:name）映射；模板缺少的样式定义补进模板
 *   styles.xml；列表编号(numbering)、内嵌图片(media + rels)合并时避开资源冲突。
 */
function collectStyles(xml: string): Map<string, { name: string; xml: string }> {
  const m = new Map<string, { name: string; xml: string }>();
  const re = /<w:style\b[\s\S]*?<\/w:style>/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(xml))) {
    const id = /w:styleId="([^"]+)"/.exec(hit[0])?.[1];
    const name = /<w:name w:val="([^"]*)"/.exec(hit[0])?.[1] ?? '';
    if (id) m.set(id, { name, xml: hit[0] });
  }
  return m;
}

/** word/media/imageN.ext 的最大序号（避免与模板已有图片资源冲突） */
function maxDocMediaIndex(zip: JSZip): number {
  let max = 0;
  for (const p of Object.keys(zip.files)) {
    const m = /^word\/media\/image(\d+)\.[a-zA-Z0-9]+$/.exec(p);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

async function applyStyleTemplate(generated: Buffer, template: Buffer): Promise<Buffer> {
  const gen = await JSZip.loadAsync(generated);
  const tpl = await JSZip.loadAsync(template);
  const out = new JSZip();

  // ---- 1) 模板全部部件原样复制（完全复用）----
  for (const [path, file] of Object.entries(tpl.files)) {
    if (file.dir) continue;
    out.file(path, await file.async('uint8array'));
  }

  // ---- 2) 提取生成文档的正文（body 内、sectPr 之前）----
  const genDoc = (await gen.file('word/document.xml')?.async('string')) ?? '';
  let children = /<w:body>([\s\S]*?)<\/w:body>/.exec(genDoc)?.[1] ?? '';
  children = children.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '');

  // ---- 3) 样式映射 + 补全：正文使用的样式优先映射到模板同名样式（w:name），
  //        模板没有的（如某些自定标题样式）则把生成样式定义补进模板 styles.xml ----
  const genStyles = (await gen.file('word/styles.xml')?.async('string')) ?? '';
  const genStyleMap = collectStyles(genStyles);
  const tplStyles = (await out.file('word/styles.xml')?.async('string')) ?? '<w:styles/>';
  const tplStyleMap = collectStyles(tplStyles);
  const nameToTplId = new Map<string, string>();
  for (const [id, s] of tplStyleMap) if (s.name) nameToTplId.set(s.name.toLowerCase(), id);

  const needed = new Set<string>();
  for (const m of children.matchAll(/w:(?:pStyle|rStyle) w:val="([^"]+)"/g)) needed.add(m[1]);

  let stylesXml = tplStyles;
  const styleRemap = new Map<string, string>();
  for (const id of needed) {
    const gs = genStyleMap.get(id);
    if (!gs) continue;
    const tplId = nameToTplId.get(gs.name.toLowerCase());
    if (tplId) { styleRemap.set(id, tplId); continue; }
    if (!tplStyleMap.has(id) && !stylesXml.includes(`w:styleId="${id}"`)) {
      stylesXml = stylesXml.replace('</w:styles>', `${gs.xml}</w:styles>`);
    }
  }
  for (const [id, mapped] of styleRemap) {
    children = children.replace(new RegExp(`w:(pStyle|rStyle) w:val="${id}"`, 'g'), `w:$1 w:val="${mapped}"`);
  }
  if (stylesXml !== tplStyles) out.file('word/styles.xml', stylesXml);

  // ---- 4) 列表编号（项目符号）：合并/复制模板 numbering.xml，并重映射正文 numId ----
  const genNumbering = (await gen.file('word/numbering.xml')?.async('string')) ?? '';
  if (/<w:numId\b/.test(children) && genNumbering) {
    const tplNumbering = (await out.file('word/numbering.xml')?.async('string')) ?? '';
    const maxNum = tplNumbering ? Math.max(0, ...[...tplNumbering.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => Number(m[1]))) : 0;
    const maxAbs = tplNumbering ? Math.max(0, ...[...tplNumbering.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"/g)].map((m) => Number(m[1]))) : 0;
    const absMap = new Map<number, number>();
    const numMap = new Map<number, number>();
    let nextAbs = maxAbs + 1;
    let nextNum = maxNum + 1;

    const absBlocks = [...genNumbering.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)].map((m) => m[0]);
    const numBlocks = [...genNumbering.matchAll(/<w:num\b[\s\S]*?<\/w:num>/g)].map((m) => m[0]);

    const rebuiltAbs = absBlocks.map((b) => b.replace(/<w:abstractNum w:abstractNumId="(\d+)"/, (mm, n: string) => {
      const nn = nextAbs++;
      absMap.set(Number(n), nn);
      return `<w:abstractNum w:abstractNumId="${nn}"`;
    }));

    const rebuiltNums = numBlocks.map((b) => {
      const oldNum = Number(/<w:num w:numId="(\d+)"/.exec(b)?.[1]);
      const nn = nextNum++;
      numMap.set(oldNum, nn);
      return b
        .replace(/<w:num w:numId="(\d+)"/, `<w:num w:numId="${nn}"`)
        .replace(/<w:abstractNumId w:val="(\d+)"\s*\/>/, (mm, a: string) => `<w:abstractNumId w:val="${absMap.get(Number(a)) ?? a}"/>`);
    });

    const genNumRe = rebuiltAbs.join('') + rebuiltNums.join('');
    // docx 库的 numbering 可能引用 w14/w15 等命名空间，重建时必须保留完整的
    // 根元素命名空间声明，否则 XML 命名空间未声明、文档无效。
    const genNumRoot = /<w:numbering[^>]*>/.exec(genNumbering)?.[0]
      ?? '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';
    if (tplNumbering) {
      let tplNum = tplNumbering;
      for (const a of genNumRoot.matchAll(/xmlns:[a-zA-Z0-9]+="[^"]*"/g)) {
        const name = a[0].slice(0, a[0].indexOf('='));
        if (!tplNum.includes(name + '=')) tplNum = tplNum.replace(/<w:numbering/, `<w:numbering ${a[0]}`);
      }
      out.file('word/numbering.xml', tplNum.replace('</w:numbering>', `${genNumRe}</w:numbering>`));
    } else {
      out.file('word/numbering.xml', genNumRoot + genNumRe + '</w:numbering>');
      // 接线：document.xml.rels + Content-Type
      const relsPath = 'word/_rels/document.xml.rels';
      const rels = (await out.file(relsPath)?.async('string')) ?? '';
      let rid = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1;
      let newRid: string;
      do { newRid = 'rId' + rid++; } while (rels.includes(`Id="${newRid}"`));
      out.file(relsPath, rels.replace('</Relationships>',
        `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`));
      const ctPath = '[Content_Types].xml';
      const ct = (await out.file(ctPath)?.async('string')) ?? '';
      if (!ct.includes('PartName="/word/numbering.xml"')) {
        out.file(ctPath, ct.replace('</Types>', '<Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml" PartName="/word/numbering.xml"/></Types>'));
      }
    }
    for (const [oldN, newN] of numMap) {
      children = children.split(`w:numId w:val="${oldN}"`).join(`w:numId w:val="${newN}"`);
    }
  }

  // ---- 5) 内嵌图片：复制生成文档 media 到模板包（不冲突命名），并重映射 r:embed ----
  const IMG_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const genRels = (await gen.file('word/_rels/document.xml.rels')?.async('string')) ?? '';
  const tplRelsPath = 'word/_rels/document.xml.rels';
  const tplRels = (await out.file(tplRelsPath)?.async('string')) ?? '';
  let mediaIdx = maxDocMediaIndex(out);
  let ridNext = Math.max(0, ...[...tplRels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1;
  let tplRelsNew = tplRels;
  const embedMap = new Map<string, string>();
  const newExts = new Set<string>();
  for (const m of genRels.matchAll(/<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"/g)) {
    if (m[2] !== IMG_REL) continue;
    const target = m[3].replace(/^\.\.\//, '');
    const gf = gen.file('word/' + target);
    if (!gf) continue;
    const ext = /\.([a-zA-Z0-9]+)$/.exec(target)?.[1] ?? 'png';
    mediaIdx += 1;
    const newName = `media/image${mediaIdx}.${ext}`;
    out.file('word/' + newName, await gf.async('uint8array'));
    let newRid: string;
    do { newRid = 'rId' + ridNext++; } while (tplRelsNew.includes(`Id="${newRid}"`));
    tplRelsNew = tplRelsNew.replace('</Relationships>', `<Relationship Id="${newRid}" Type="${IMG_REL}" Target="${newName}"/></Relationships>`);
    embedMap.set(m[1], newRid);
    newExts.add(ext);
  }
  if (tplRelsNew !== tplRels) out.file(tplRelsPath, tplRelsNew);
  // 新增图片扩展名需注册 Content-Type（如模板只有 jpeg 而正文带 png），否则包无效。
  // 注意 OOXML 要求所有 <Default> 位于所有 <Override> 之前，必须按序插入。
  if (newExts.size) {
    const ctPath = '[Content_Types].xml';
    const ct = (await out.file(ctPath)?.async('string')) ?? '';
    const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };
    const insertDefault = (xml: string, def: string): string => {
      const m = /(<Default\b[^>]*\/>\s*)+/.exec(xml);
      if (m) {
        const idx = m.index + m[0].length;
        return xml.slice(0, idx) + def + xml.slice(idx);
      }
      return xml.replace(/^([\s\S]*?<[^>]*Types[^>]*>)/, `$1${def}`);
    };
    let ctNew = ct;
    for (const e of newExts) {
      if (ctNew.includes(`Extension="${e}"`)) continue;
      const mt = MIME[e];
      if (!mt) continue;
      ctNew = insertDefault(ctNew, `<Default Extension="${e}" ContentType="${mt}"/>`);
    }
    if (ctNew !== ct) out.file(ctPath, ctNew);
  }
  for (const [oldRid, newRid] of embedMap) {
    children = children.split(`r:embed="${oldRid}"`).join(`r:embed="${newRid}"`);
  }

  // ---- 6) 替换模板 body：保留模板自身的 sectPr（页眉页脚引用/页面设置/网格）----
  const tplDoc = (await out.file('word/document.xml')?.async('string')) ?? '';
  const tplSect = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(tplDoc)?.[0] ?? '';
  const newBody = `<w:body>${children}${tplSect}</w:body>`;
  out.file('word/document.xml', tplDoc.replace(/<w:body>[\s\S]*?<\/w:body>/, newBody));

  // ---- 7) settings.xml 补 updateFields（目录域自动刷新）----
  const settings = (await out.file('word/settings.xml')?.async('string')) ?? '';
  if (settings && !settings.includes('<w:updateFields')) {
    out.file('word/settings.xml', settings.replace('</w:settings>', '<w:updateFields/></w:settings>'));
  }

  return Buffer.from(await out.generateAsync({ type: 'nodebuffer' }));
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
