import { randomUUID } from 'node:crypto';
import type { DocFormat, DocInputs, GeneratedDocument } from './docs/types.js';
import { getGenerator } from './docs/index.js';
import type { Storage } from './storage/storage.js';
import type { StyleTemplateStore } from './admin/styleTemplates.js';

/** Minimal audit sink so generation can be recorded without coupling core to
 *  the admin audit store (duck-typed by AuditLogStore). */
export interface AuditSink {
  record(input: { actor?: string; role?: string; action: string; target?: string; detail?: string; ip?: string }): void;
}

/**
 * Turn a user-supplied requested file name into a safe storage basename:
 * - strips directory components (no path traversal),
 * - keeps only letters, digits, CJK and a small safe punctuation set,
 * - normalizes the extension to the target format (.pptx/.docx/...),
 * - falls back to the document title when no file name was requested,
 * - falls back to a random hex id when nothing usable remains.
 */
export function resolveOutputFilename(requested: string | undefined, extension: string, fallbackTitle?: string): string {
  const hexFallback = `${randomUUID().slice(0, 8)}.${extension}`;
  for (const candidate of [requested, fallbackTitle]) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    const base = candidate.replace(/\\/g, '/').split('/').pop() ?? '';
    const cleaned = base
      .replace(/\.[^./\\]+$/, '') // drop any extension the caller passed
      .replace(/[^\p{L}\p{N} _-]/gu, '') // letters, digits, CJK, space, dash, underscore
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    if (cleaned === '') continue;
    return `${cleaned}.${extension}`;
  }
  return hexFallback;
}

/**
 * 纯文本文件的名（txt/html/xml/源码等）：与 resolveOutputFilename 不同，
 * **保留调用者传入的扩展名**（扩展名决定类型），仅清理路径/非法字符；
 * 未提供时回退 note.txt。
 */
export function resolveTextFilename(requested?: string, inputFilename?: string): string {
  for (const candidate of [requested, inputFilename]) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    const base = candidate.replace(/\\/g, '/').split('/').pop() ?? '';
    const cleaned = base
      .replace(/[^\p{L}\p{N} _.-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    if (cleaned === '') continue;
    return /\.[A-Za-z0-9]{1,10}$/.test(cleaned) ? cleaned : `${cleaned}.txt`;
  }
  return 'note.txt';
}

/** 由文本文件扩展名推导 MIME（默认 text/plain）。 */
export function textMimeType(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const map: Record<string, string> = {
    txt: 'text/plain', text: 'text/plain', log: 'text/plain',
    md: 'text/markdown', markdown: 'text/markdown',
    html: 'text/html', htm: 'text/html',
    xml: 'application/xml', json: 'application/json',
    css: 'text/css', csv: 'text/csv',
    js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
    yml: 'text/yaml', yaml: 'text/yaml',
    svg: 'image/svg+xml',
  };
  return map[ext] ?? 'text/plain';
}

/** Deterministically map a username to a filesystem-safe storage path segment
 *  used to scope generated files per user (see DocumentService.generate). */
export function ownerSlug(username: string): string {
  return username.replace(/[^A-Za-z0-9._-]/g, (c) => `_x${c.codePointAt(0)!.toString(16)}_`);
}

/**
 * Orchestrates document generation: validates input, runs the isolated
 * generator to produce a Buffer, uploads it to storage and returns a public
 * download link. Shared by the MCP tools and the REST API / Dify plugin.
 *
 * When `styleTemplateId` is provided, the matching uploaded style template
 * (pptx / docx / xlsx) is loaded so the output inherits its theme / styling.
 */
export class DocumentService {
  constructor(
    private readonly storage: Storage,
    private readonly options: { basePath?: string } = {},
    private readonly styleTemplates?: StyleTemplateStore,
    private readonly audit?: AuditSink,
  ) {}

  async generate<F extends DocFormat>(
    format: F,
    rawInput: DocInputs[F],
    opts: { styleTemplateId?: string; filename?: string; owner?: string; role?: string } = {},
  ): Promise<GeneratedDocument> {
    const generator = getGenerator(format);
    const isText = format === 'text';

    // ---- author defaults to the calling user unless the AI specified one ----
    const owner = opts.owner?.trim();
    let input = rawInput;
    if (owner && format !== 'xlsx' && !isText) {
      const authorField = (rawInput as { author?: string }).author;
      if (!authorField || !authorField.trim()) {
        input = { ...rawInput, author: owner } as DocInputs[F];
      }
    }

    // ---- style template resolution (per-owner fallback chain) ----
    // 纯文本不带格式，不套用任何样式模板。
    let styleTemplate: Buffer | undefined;
    if (!isText) {
      if (opts.styleTemplateId) {
        if (!this.styleTemplates) throw new Error('style templates are not configured');
        const tpl = await this.styleTemplates.get(opts.styleTemplateId);
        if (!tpl) throw new Error(`style template '${opts.styleTemplateId}' not found`);
        if (tpl.format !== format) {
          throw new Error(`style template format '${tpl.format}' does not match target format '${format}'`);
        }
        // A caller identified by username may only use their own or system templates.
        if (owner && tpl.owner !== 'system' && tpl.owner !== owner) {
          throw new Error(`style template '${opts.styleTemplateId}' is not available to '${owner}'`);
        }
        styleTemplate = tpl.buffer;
      } else if (this.styleTemplates) {
        const resolved = await this.styleTemplates.resolveDefault(format, owner);
        if (resolved) {
          const tpl = await this.styleTemplates.get(resolved);
          if (tpl && tpl.format === format) styleTemplate = tpl.buffer;
        }
      }
    }

    const buffer = await generator.generate(input, styleTemplate ? { styleTemplate } : undefined);

    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const base = [this.options.basePath, owner ? ownerSlug(owner) : undefined, datePath].filter((x): x is string => Boolean(x)).join('/');
    const fallbackTitle = typeof (rawInput as { title?: unknown }).title === 'string'
      ? ((rawInput as { title: string }).title)
      : undefined;
    // 纯文本：保留调用者扩展名并按扩展名推导 MIME；其余格式按原逻辑补扩展名。
    const fileName = isText
      ? resolveTextFilename(opts.filename, typeof (rawInput as { filename?: unknown }).filename === 'string' ? (rawInput as { filename: string }).filename : undefined)
      : resolveOutputFilename(opts.filename, generator.extension, fallbackTitle);
    const mimeType = isText ? textMimeType(fileName) : generator.mimeType;
    const key = `${base}/${fileName}`;
    const keyCleaned = key.split('/').filter(Boolean).join('/');

    const stored = await this.storage.put(buffer, {
      key: keyCleaned,
      mimeType,
    });

    this.audit?.record({
      action: 'file.generate',
      actor: owner,
      role: opts.role ?? (owner ? 'user' : 'system'),
      target: keyCleaned,
      detail: `format=${format} filename=${fileName}`,
    });

    return {
      format,
      filename: keyCleaned.split('/').pop() as string,
      url: stored.url,
      size: buffer.length,
      mimeType: generator.mimeType,
      storageKey: stored.key,
      createdAt: new Date().toISOString(),
      owner,
    };
  }
}
