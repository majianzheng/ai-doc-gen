import { z } from 'zod';

/**
 * Zod schemas used both for MCP tool input validation and (via z.toJSONSchema
 * / manual conversion) for Dify tool parameter descriptions.
 */

const alignEnum = z.enum(['left', 'center', 'right', 'justify']).optional();

const paragraphItem = z.object({
  text: z.string(),
  level: z.number().int().min(0).max(6).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  bullet: z.boolean().optional(),
  align: alignEnum,
  fontSize: z.number().min(6).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const tableColumn = z.object({
  key: z.string(),
  header: z.string(),
});

const rowData = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const tableData = z.object({
  columns: z.array(tableColumn).optional(),
  rows: z.array(rowData).min(1),
});

export const docxSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  paragraphs: z.array(paragraphItem).optional(),
  tables: z.array(tableData).optional(),
  footer: z.string().optional(),
});

export const pdfSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  paragraphs: z.array(paragraphItem).optional(),
  tables: z.array(tableData).optional(),
  footer: z.string().optional(),
});

const sheetData = z.object({
  name: z.string(),
  columns: z.array(tableColumn).optional(),
  rows: z.array(rowData).min(1),
});

export const xlsxSchema = z.object({
  title: z.string().optional(),
  sheets: z.array(sheetData).min(1),
});

const slideData = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  layout: z.enum(['title', 'title_content']).optional(),
  author: z.string().optional(),
  footer: z.string().optional(),
});

export const pptxSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  slides: z.array(slideData).min(1),
});
