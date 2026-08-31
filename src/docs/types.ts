/**
 * Shared data models for document generation.
 *
 * Each generator accepts a plain JSON object (described by a JSON Schema so
 * that AI agents can reliably produce valid input) and returns a Buffer.
 */

export type DocFormat = 'docx' | 'pdf' | 'xlsx' | 'pptx';

export interface ParagraphItem {
  text: string;
  /** heading level 1-6, or undefined / 0 for body text */
  level?: number;
  bold?: boolean;
  italic?: boolean;
  bullet?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  fontSize?: number;
  color?: string;
}

/**
 * An image that can be embedded into a generated document. Exactly one source
 * form must be provided:
 *  - `data`: base64-encoded image bytes (optionally a full `data:` URI)
 *  - `url`:   an http(s) URL the service downloads at generation time
 *  - `svg`:   raw SVG (XML) markup
 * Supported image types: PNG, JPEG, GIF, WebP (raster) and SVG.
 * SVG stays vector in DOCX / PPTX; it is rasterized to PNG for PDF / XLSX.
 */
export interface ImageItem {
  /** base64-encoded image bytes, optionally a full `data:` URI (e.g. data:image/png;base64,....) */
  data?: string;
  /** MIME type when `data` has no `data:` URI prefix (defaults to image/png) */
  mimeType?: string;
  /** http(s) URL to download the image from */
  url?: string;
  /** raw SVG (XML) markup */
  svg?: string;
  /** rendered width in px (omit to auto-size from the aspect ratio) */
  width?: number;
  /** rendered height in px (omit to auto-size from the aspect ratio) */
  height?: number;
  /** horizontal placement */
  align?: 'left' | 'center' | 'right';
  /** optional caption / figure text rendered underneath the image */
  caption?: string;
}

export interface DocxInput {
  title?: string;
  author?: string;
  /** sections of the document body in order */
  paragraphs?: ParagraphItem[];
  tables?: TableData[];
  /** images appended after the paragraphs/tables */
  images?: ImageItem[];
  footer?: string;
}

export interface PdfInput {
  title?: string;
  author?: string;
  subject?: string;
  paragraphs?: ParagraphItem[];
  tables?: TableData[];
  /** images appended after the paragraphs/tables */
  images?: ImageItem[];
  footer?: string;
}

export interface TableColumn {
  key: string;
  header: string;
}

export interface TableData {
  /** column definitions (order + headers). If omitted, derived from the first row's keys. */
  columns?: TableColumn[];
  /** array of row objects keyed by column key. */
  rows: Record<string, string | number | boolean | null>[];
}

export interface SheetData {
  name: string;
  columns?: TableColumn[];
  rows: Record<string, string | number | boolean | null>[];
  /** images anchored below the table data in this sheet */
  images?: ImageItem[];
}

export interface XlsxInput {
  title?: string;
  sheets: SheetData[];
}

export interface SlideData {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  /** renders a table below the title/text */
  tables?: TableData[];
  /** images rendered in the lower part of the slide */
  images?: ImageItem[];
  layout?: 'title' | 'title_content';
  author?: string;
  footer?: string;
}

export interface PptxInput {
  title: string;
  author?: string;
  slides: SlideData[];
}

/** Result returned to the caller (MCP tool / REST API). */
export interface GeneratedDocument {
  format: DocFormat;
  filename: string;
  /** public download link */
  url: string;
  /** size in bytes */
  size: number;
  mimeType: string;
  storageKey: string;
  createdAt: string;
}

export const MIME_TYPES: Record<DocFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const FILE_EXTENSIONS: Record<DocFormat, string> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
};

export type DocInputs = {
  docx: DocxInput;
  pdf: PdfInput;
  xlsx: XlsxInput;
  pptx: PptxInput;
};
