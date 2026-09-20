import ExcelJS from 'exceljs';
import type { ImageItem, SheetData, XlsxInput } from './types.js';
import type { Generator, GenerateContext } from './generator.js';
import { markdownToXlsx } from './markdown.js';
import { computeSize, intrinsicSize, resolveImage, svgToPng } from './images.js';

/**
 * Anchors images below the table data of a sheet, or at an explicit spot:
 *  - `position` (px) -> floating at an absolute location (editAs=absolute)
 *  - `cell` (0-based col/row) -> anchored to a cell so it moves with it (oneCell)
 *  - otherwise -> stacked below the table rows.
 * Excel stores images as floating objects; SVG input is rasterized to PNG.
 */
async function writeSheetImages(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, images: ImageItem[], dataRows: number): Promise<void> {
  let nextRow = dataRows + 3;
  for (const img of images) {
    const resolved = await resolveImage(img);
    let imgBuffer: Buffer | undefined;
    let ext: 'png' | 'jpeg' = 'png';
    if (resolved.kind === 'svg') {
      const { png } = await svgToPng(resolved.buffer);
      imgBuffer = png;
      ext = 'png';
    } else if (resolved.format === 'png') {
      ext = 'png';
    } else if (resolved.format === 'jpeg') {
      ext = 'jpeg';
    } else {
      throw new Error(`image type '${resolved.format}' is not supported in Excel. Supported: PNG, JPEG, SVG.`);
    }
    const intrinsic = intrinsicSize(imgBuffer ?? resolved.buffer, ext);
    const size = computeSize({ width: resolved.width, height: resolved.height }, intrinsic, 260);
    const imageId = wb.addImage({ buffer: (imgBuffer ?? resolved.buffer) as never, extension: ext } as never);

    if (img.position) {
      // Floating at an absolute pixel location.
      ws.addImage(imageId, {
        tl: { x: img.position.x, y: img.position.y },
        ext: { width: Math.round(img.position.w ?? size.width), height: Math.round(img.position.h ?? size.height) },
        editAs: 'absolute',
      } as never);
      continue;
    }
    if (img.cell) {
      // Anchored to a cell (0-based col/row) so it moves with the cell.
      ws.addImage(imageId, {
        tl: { col: img.cell.col, row: img.cell.row },
        ext: { width: Math.round(size.width), height: Math.round(size.height) },
        editAs: 'oneCell',
      } as never);
      continue;
    }
    // Default: stack below the table rows.
    ws.addImage(imageId, {
      tl: { col: 0, row: nextRow },
      ext: { width: Math.round(size.width), height: Math.round(size.height) },
    } as never);
    nextRow += Math.ceil(size.height / 18) + 2;
  }
}

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
  async generate(input: any, ctx?: GenerateContext): Promise<Buffer> {
    const x = markdownToXlsx(String(input?.content || ''));
    input = x;
    const wb = new ExcelJS.Workbook();
    if (ctx?.styleTemplate) {
      try {
        await wb.xlsx.load(ctx.styleTemplate as never);
        // Drop the template's own worksheets so we keep its theme/styles but
        // avoid sheet-name collisions when we add the requested sheets.
        for (const ws of wb.worksheets.slice()) {
          ws.destroy();
        }
      } catch (err) {
        console.warn('[ai-doc] failed to load xlsx style template, falling back to default styling:', (err as Error).message);
      }
    }
    wb.creator = 'ai-doc';
    wb.created = new Date();

    for (const sheet of input.sheets) {
      const ws = wb.addWorksheet(sheet.name || 'Sheet1');
      writeSheet(ws, sheet);
      if (sheet.images?.length) {
        await writeSheetImages(wb, ws, sheet.images, sheet.rows.length);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  },
};
