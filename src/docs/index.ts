import type { DocFormat } from './types.js';
import type { Generator } from './generator.js';
import { docxGenerator } from './word.js';
import { pdfGenerator } from './pdf.js';
import { xlsxGenerator } from './excel.js';
import { pptxGenerator } from './ppt.js';
import { textGenerator } from './text.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, textSchema, docxAdminSchema, pdfAdminSchema, xlsxAdminSchema, pptxAdminSchema, textAdminSchema } from './schemas.js';

docxGenerator.inputSchema = docxSchema;
pdfGenerator.inputSchema = pdfSchema;
xlsxGenerator.inputSchema = xlsxSchema;
pptxGenerator.inputSchema = pptxSchema;
textGenerator.inputSchema = textSchema;

const registry = new Map<DocFormat, Generator>([
  ['docx', docxGenerator],
  ['pdf', pdfGenerator],
  ['xlsx', xlsxGenerator],
  ['pptx', pptxGenerator],
  ['text', textGenerator],
]);

export function getGenerator(format: DocFormat): Generator {
  const g = registry.get(format);
  if (!g) throw new Error(`Unsupported document format: ${format}`);
  return g;
}

export function listGenerators(): Generator[] {
  return Array.from(registry.values());
}

export { docxSchema, pdfSchema, xlsxSchema, pptxSchema, textSchema, docxAdminSchema, pdfAdminSchema, xlsxAdminSchema, pptxAdminSchema, textAdminSchema };
