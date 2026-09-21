/**
 * Shared data models for document generation.
 *
 * Each generator accepts a plain JSON object (described by a JSON Schema so
 * that AI agents can reliably produce valid input) and returns a Buffer.
 */

export type DocFormat = 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'text';

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
  /** horizontal placement (left / center / right) when auto-laying out */
  align?: 'left' | 'center' | 'right';
  /** optional caption / figure text rendered underneath the image */
  caption?: string;
  /**
   * Excel only — anchor the image's top-left corner to a cell so it moves with
   * that cell (插入到单元格, editAs=oneCell). `col`/`row` are 0-based. Ignored
   * when `position` is provided.
   */
  cell?: { col: number; row: number };
  /**
   * Place the image at an absolute position (任意位置), in pixels from the
   * top-left of the sheet / slide (96px = 1 inch). `w`/`h` override the size;
   * when omitted the size is derived from `width`/`height` or the intrinsic
   * ratio. Used by Excel (floating) and PPT (exact spot + size).
   */
  position?: { x: number; y: number; w?: number; h?: number };
}

/** 文档正文流：按 Markdown 中出现顺序混排的段落/表格/图片（docx/pdf 按此渲染，
 *  保证图片位置与其在正文中的位置一致，而不是全部堆到末尾）。 */
export type DocxFlowItem =
  | { type: 'paragraph'; value: ParagraphItem }
  | { type: 'table'; value: TableData }
  | { type: 'image'; value: ImageItem };

export interface DocxInput {
  title?: string;
  author?: string;
  /** sections of the document body in order */
  paragraphs?: ParagraphItem[];
  tables?: TableData[];
  /** images appended after the paragraphs/tables */
  images?: ImageItem[];
  /** 按内容顺序混排的正文流；提供时 word/pdf 优先按它渲染（图片随位置） */
  items?: DocxFlowItem[];
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
  /** 按内容顺序混排的正文流；提供时 word/pdf 优先按它渲染（图片随位置） */
  items?: DocxFlowItem[];
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

/**
 * Plain-text document (txt / html / xml / json / 源码等)：无格式、不需要样式模板。
 * `filename` 应包含扩展名（如 test.cpp、readme.md、note.txt）；扩展名决定下载的
 * 文件名与 Content-Type。`encoding` 默认 utf-8；`lineEnding` 默认 lf。
 */
export interface TextInput {
  /** 文件名（含扩展名，如 test.cpp / note.txt / index.html；缺省 .txt） */
  filename?: string;
  /** 纯文本内容 */
  content: string;
  /** 编码（默认 utf-8 不带 BOM）：utf-8/utf8（无 BOM）、utf-8-bom/utf8-bom（带 BOM）、ascii/latin1/utf-16le/utf16le/ucs2/base64/hex */
  encoding?: string;
  /** 行尾序列（默认 lf）：lf 或 crlf */
  lineEnding?: string;
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
  /** username the file belongs to (undefined for legacy/global files) */
  owner?: string;
}

export const MIME_TYPES: Record<DocFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  text: 'text/plain',
};

export const FILE_EXTENSIONS: Record<DocFormat, string> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
  text: 'txt',
};

export type DocInputs = {
  docx: DocxInput;
  pdf: PdfInput;
  xlsx: XlsxInput;
  pptx: PptxInput;
  text: TextInput;
};
