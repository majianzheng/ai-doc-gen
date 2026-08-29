import ExcelJS from 'exceljs';
import type { SheetData, XlsxInput } from './types.js';
import type { Generator } from './generator.js';

function writeSheet(ws: ExcelJS.Worksheet, sheet: SheetData) {
  const cols = sheet.columns ?? Object.keys(sheet.rows[0] ?? {}).map((k) => ({ key: k, header: k }));

  ws.getRow(1).values = cols.map((c) => c.header);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle' };

  sheet.rows.forEach((row, i) => {
    const r = ws.getRow(i + 2);
    cols.forEach((c, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = row[c.key] ?? null;
      if (typeof row[c.key] === 'number') cell.numFmt = '#,##0.00';
    });
  });

  cols.forEach((c, ci) => {
    const column = ws.getColumn(ci + 1);
    const longest = Math.max(c.header.length, ...sheet.rows.map((r) => String(r[c.key] ?? '').length));
    column.width = Math.max(12, Math.min(longest + 2, 40));
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rows.length + 1), column: cols.length },
  };
}

export const xlsxGenerator: Generator = {
  format: 'xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extension: 'xlsx',
  async generate(input: XlsxInput): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ai-doc';
    wb.created = new Date();

    for (const sheet of input.sheets) {
      const ws = wb.addWorksheet(sheet.name || 'Sheet1');
      writeSheet(ws, sheet);
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  },
};
