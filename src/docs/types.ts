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

export interface DocxInput {
  title?: string;
  author?: string;
  /** sections of the document body in order */
  paragraphs?: ParagraphItem[];
  tables?: TableData[];
  footer?: string;
}

export interface PdfInput {
  title?: string;
  author?: string;
  subject?: string;
  paragraphs?: ParagraphItem[];
  tables?: TableData[];
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
}

export interface XlsxInput {
  title?: string;
  sheets: SheetData[];
}

export interface SlideData {
  title?: string;
  subtitle?: string;
  bullets?: string[];
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
