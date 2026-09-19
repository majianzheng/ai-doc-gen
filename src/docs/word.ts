import {
  AlignmentType,
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
  TextRun,
  WidthType,
  type IParagraphOptions,
} from 'docx';
import JSZip from 'jszip';
import type { DocxInput, ImageItem, ParagraphItem, TableData } from './types.js';
import type { Generator, GenerateContext } from './generator.js';
import { computeSize, intrinsicSize, resolveImage, svgToPng } from './images.js';
import { markdownToDocx } from './markdown.js';

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
  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map((c) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: c.header, bold: true })] })],
    })),
  });
  const bodyRows = t.rows.map((row) => new TableRow({
    children: cols.map((c) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(row[c.key] ?? '') })] })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
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
 * Apply a style template: copy the template's styles, theme and font table into
 * the freshly generated document so the output inherits the template's visual
 * design (fonts / colors / heading styles) instead of the default look.
 */
async function applyStyleTemplate(generated: Buffer, template: Buffer): Promise<Buffer> {
  const gen = await JSZip.loadAsync(generated);
  const tpl = await JSZip.loadAsync(template);
  const parts = ['word/styles.xml', 'word/theme/theme1.xml', 'word/fontTable.xml'];
  for (const part of parts) {
    const file = tpl.file(part);
    if (file) {
      gen.file(part, await file.async('string'));
    }
  }
  return Buffer.from(await gen.generateAsync({ type: 'nodebuffer' }));
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
