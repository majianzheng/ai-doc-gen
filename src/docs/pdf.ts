import PDFDocument from 'pdfkit';
import type { ParagraphItem, PdfInput } from './types.js';
import type { Generator } from './generator.js';

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

export const pdfGenerator: Generator = {
  format: 'pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',
  generate(input: PdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const info: Record<string, string | Date> = { Creator: 'ai-doc', CreationDate: new Date(), ModDate: new Date() };
      if (input.title) info.Title = input.title;
      if (input.author) info.Author = input.author;
      if (input.subject) info.Subject = input.subject;
      const doc = new PDFDocument({ size: 'A4', margin: 50, info });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.on('pageAdded', () => {
        if (!input.footer) return;
        doc.save();
        doc.fontSize(8).fillColor('#888888');
        doc.text(input.footer, 50, doc.page.height - 40, { align: 'center', width: doc.page.width - 100 });
        doc.restore();
      });

      if (input.title) {
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#131313').text(input.title, { align: 'center' });
        doc.moveDown();
      }

      for (const p of input.paragraphs ?? []) {
        const style = fontStyle(p);
        const font = style.bold ? 'Helvetica-Bold' : style.italics ? 'Helvetica-Oblique' : 'Helvetica';
        doc.font(font).fontSize(style.size).fillColor(p.color ?? '#131313');
        const opts = p.align ? { align: p.align } : undefined;
        if (p.bullet) {
          doc.text('•  ', Object.assign({ continued: true }, opts));
          doc.text(p.text, opts);
        } else {
          doc.text(p.text, opts);
        }
        doc.moveDown(0.4);
      }

      for (const t of input.tables ?? []) {
        doc.moveDown();
        const cols = t.columns ?? Object.keys(t.rows[0] ?? {}).map((k) => ({ key: k, header: k }));
        const available = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colW = available / cols.length;

        const drawRow = (cells: string[], header: boolean) => {
          const rowH = Math.max(...cells.map((c) => doc.heightOfString(c, { width: colW - 8 })), 18) + 8;
          if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) doc.addPage();

          const y = doc.y;
          cells.forEach((c, i) => {
            const x = doc.page.margins.left + i * colW;
            doc.rect(x, y, colW, rowH).strokeColor('#cccccc').lineWidth(0.5).stroke();
            if (header) doc.rect(x, y, colW, rowH).fillColor('#f2f2f2').fill();
            doc.fillColor('#131313').font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
            doc.text(c, x + 4, y + 4, { width: colW - 8 });
          });
          doc.y = y + rowH;
        };

        drawRow(cols.map((c) => c.header), true);
        for (const row of t.rows) drawRow(cols.map((c) => String(row[c.key] ?? '')), false);
        doc.moveDown(0.6);
      }

      doc.end();
    });
  },
};
