import { z } from 'zod';

/**
 * Zod schemas used both for MCP tool input validation and (via z.toJSONSchema
 * / manual conversion) for Dify tool parameter descriptions.
 *
 * Field-level `.describe()` text flows into the MCP JSON Schema so AI agents
 * see exactly what is accepted for each field.
 */

const alignEnum = z.enum(['left', 'center', 'right', 'justify']).optional();

const paragraphItem = z.object({
  text: z.string().describe('the paragraph/line text'),
  level: z.number().int().min(0).max(6).optional().describe('heading level 1-6; omit or 0 for body text'),
  bold: z.boolean().optional().describe('render the text bold'),
  italic: z.boolean().optional().describe('render the text italic'),
  bullet: z.boolean().optional().describe('render as a bullet point'),
  align: alignEnum.describe('horizontal alignment'),
  fontSize: z.number().min(6).max(80).optional().describe('font size in points'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('text color as #RRGGBB'),
});

const tableColumn = z.object({
  key: z.string().describe('column key, must match a field name in each row object'),
  header: z.string().describe('column header text'),
});

const rowData = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const tableData = z.object({
  columns: z.array(tableColumn).optional().describe('column order + headers; if omitted, derived from the first row keys'),
  rows: z.array(rowData).min(1).describe('array of row objects keyed by column key'),
});

/**
 * An image to embed. Exactly one source must be provided:
 *  - `data`: base64-encoded bytes (may include the `data:` URI prefix)
 *  - `url`:  http(s) link fetched at generation time
 *  - `svg`:  raw SVG XML markup
 * Raster formats (PNG/JPEG/GIF/WebP) and SVG are supported. SVG stays vector
 * in DOCX/PPTX and is rasterized to PNG for PDF/XLSX.
 */
const imageItem = z.object({
  data: z.string().optional().describe('base64 image bytes (optionally prefixed with data:image/...;base64,). Preferred form.'),
  mimeType: z.string().optional().describe('MIME type when `data` lacks a data: URI prefix (e.g. image/png, image/svg+xml). Defaults to image/png.'),
  url: z.string().url().optional().describe('http(s) URL of the image, downloaded by the service at generation time'),
  svg: z.string().optional().describe('raw SVG (XML) markup, rendered as vector where the format supports it'),
  width: z.number().positive().max(5000).optional().describe('rendered width in px; omit to auto-size from the aspect ratio'),
  height: z.number().positive().max(5000).optional().describe('rendered height in px; omit to auto-size from the aspect ratio'),
  align: z.enum(['left', 'center', 'right']).optional().describe('horizontal placement of the image'),
  caption: z.string().optional().describe('optional caption/figure text rendered underneath the image'),
}).refine((v) => [v.data, v.url, v.svg].filter((x) => x !== undefined).length <= 1, {
  message: 'an image must be exactly one of: data | url | svg',
}).refine((v) => [v.data, v.url, v.svg].some((x) => x !== undefined), {
  message: 'an image requires one of: data (base64), url, svg',
});

export const docxSchema = z.object({
  title: z.string().optional().describe('document title (rendered as a centered heading)'),
  author: z.string().optional().describe('document author/creator metadata'),
  paragraphs: z.array(paragraphItem).optional().describe('body content: headings, plain or bullet text with formatting'),
  tables: z.array(tableData).optional().describe('data tables rendered in the body'),
  images: z.array(imageItem).optional().describe('images (base64 / url / svg) appended after the body content'),
  footer: z.string().optional().describe('page footer text'),
  styleTemplateId: z.string().optional().describe('uuid of an uploaded .docx style template to inherit fonts/colors/heading styles from'),
  filename: z.string().optional().describe('desired download file name without extension (defaults to a random hex id). The correct format extension is appended automatically.'),
});

export const pdfSchema = z.object({
  title: z.string().optional().describe('document title (rendered as a centered heading)'),
  author: z.string().optional().describe('document author metadata'),
  subject: z.string().optional().describe('document subject metadata'),
  paragraphs: z.array(paragraphItem).optional().describe('body content: headings, plain or bullet text with formatting'),
  tables: z.array(tableData).optional().describe('data tables rendered in the body'),
  images: z.array(imageItem).optional().describe('images (base64 / url / svg) appended after the body content'),
  footer: z.string().optional().describe('page footer text'),
  styleTemplateId: z.string().optional().describe('accepted for interface compatibility; style templates only apply to pptx/docx/xlsx'),
  filename: z.string().optional().describe('desired download file name without extension (defaults to a random hex id). The correct format extension is appended automatically.'),
});

const sheetData = z.object({
  name: z.string().describe('worksheet name'),
  columns: z.array(tableColumn).optional().describe('column order + headers; if omitted, derived from the first row keys'),
  rows: z.array(rowData).min(1).describe('array of row objects keyed by column key'),
  images: z.array(imageItem).optional().describe('images (PNG/JPEG/SVG) anchored below the table data'),
});

export const xlsxSchema = z.object({
  title: z.string().optional().describe('workbook title metadata'),
  sheets: z.array(sheetData).min(1).describe('one or more worksheets'),
  styleTemplateId: z.string().optional().describe('uuid of an uploaded .xlsx style template to inherit theme/colors/fonts from'),
  filename: z.string().optional().describe('desired download file name without extension (defaults to a random hex id). The correct format extension is appended automatically.'),
});

const slideData = z.object({
  title: z.string().optional().describe('slide title'),
  subtitle: z.string().optional().describe('slide subtitle (under the title)'),
  bullets: z.array(z.string()).optional().describe('bullet points for a content slide'),
  tables: z.array(tableData).optional().describe('tables rendered below the title / text'),
  images: z.array(imageItem).optional().describe('images (svg / base64 / url) rendered in the lower part of the slide'),
  layout: z.enum(['title', 'title_content']).optional().describe('title-only slide or title + content layout (default title_content)'),
  author: z.string().optional().describe('presentation author'),
  footer: z.string().optional().describe('footnote text at the bottom of the slide'),
});

export const pptxSchema = z.object({
  title: z.string().describe('presentation title (rendered as the title slide)'),
  author: z.string().optional().describe('presentation author'),
  slides: z.array(slideData).min(1).describe('content slides after the title slide'),
  styleTemplateId: z.string().optional().describe('uuid of an uploaded .pptx style template to inherit theme/colors/layout from'),
  filename: z.string().optional().describe('desired download file name without extension (defaults to a random hex id). The correct format extension is appended automatically.'),
});
