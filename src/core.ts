import { randomUUID } from 'node:crypto';
import type { DocFormat, DocInputs, GeneratedDocument } from './docs/types.js';
import { getGenerator } from './docs/index.js';
import type { Storage } from './storage/storage.js';
import type { StyleTemplateStore } from './admin/styleTemplates.js';

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
  ) {}

  async generate<F extends DocFormat>(
    format: F,
    rawInput: DocInputs[F],
    opts: { styleTemplateId?: string; filename?: string; owner?: string } = {},
  ): Promise<GeneratedDocument> {
    const generator = getGenerator(format);

    // ---- author defaults to the calling user unless the AI specified one ----
    const owner = opts.owner?.trim();
    let input = rawInput;
    if (owner && format !== 'xlsx') {
      const authorField = (rawInput as { author?: string }).author;
      if (!authorField || !authorField.trim()) {
        input = { ...rawInput, author: owner } as DocInputs[F];
      }
    }

    // ---- style template resolution (per-owner fallback chain) ----
    let styleTemplate: Buffer | undefined;
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

    const buffer = await generator.generate(input, styleTemplate ? { styleTemplate } : undefined);

    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const base = [this.options.basePath, owner ? ownerSlug(owner) : undefined, datePath].filter((x): x is string => Boolean(x)).join('/');
    const fallbackTitle = typeof (rawInput as { title?: unknown }).title === 'string'
      ? ((rawInput as { title: string }).title)
      : undefined;
    const fileName = resolveOutputFilename(opts.filename, generator.extension, fallbackTitle);
    const key = `${base}/${fileName}`;
    const keyCleaned = key.split('/').filter(Boolean).join('/');

    const stored = await this.storage.put(buffer, {
      key: keyCleaned,
      mimeType: generator.mimeType,
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
