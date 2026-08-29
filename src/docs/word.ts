import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
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
import type { DocxInput, ParagraphItem, TableData } from './types.js';
import type { Generator } from './generator.js';

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

export const docxGenerator: Generator = {
  format: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: 'docx',
  async generate(input: DocxInput): Promise<Buffer> {
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

    const doc = new Document({
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

    return Packer.toBuffer(doc);
  },
};
