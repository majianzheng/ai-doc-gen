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
 * - falls back to a random hex id when the result would be empty/invalid.
 */
export function resolveOutputFilename(requested: string | undefined, extension: string): string {
  const fallback = `${randomUUID().slice(0, 8)}.${extension}`;
  if (typeof requested !== 'string' || requested.trim() === '') return fallback;
  const base = requested.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = base
    .replace(/\.[^./\\]+$/, '') // drop any extension the caller passed
    .replace(/[^\p{L}\p{N} _-]/gu, '') // letters, digits, CJK, space, dash, underscore
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  if (cleaned === '') return fallback;
  return `${cleaned}.${extension}`;
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

  async generate<F extends DocFormat>(format: F, rawInput: DocInputs[F], opts: { styleTemplateId?: string; filename?: string } = {}): Promise<GeneratedDocument> {
    const generator = getGenerator(format);

    let styleTemplate: Buffer | undefined;
    if (opts.styleTemplateId) {
      if (!this.styleTemplates) throw new Error('style templates are not configured');
      const tpl = await this.styleTemplates.get(opts.styleTemplateId);
      if (!tpl) throw new Error(`style template '${opts.styleTemplateId}' not found`);
      if (tpl.format !== format) {
        throw new Error(`style template format '${tpl.format}' does not match target format '${format}'`);
      }
      styleTemplate = tpl.buffer;
    } else if (this.styleTemplates) {
      // No explicit template -> fall back to the per-format active default so
      // the admin UI / clients always know which template is being used.
      const defaults = await this.styleTemplates.getDefaults();
      const defaultId = defaults[format as 'pptx' | 'docx' | 'xlsx'];
      if (defaultId) {
        const tpl = await this.styleTemplates.get(defaultId);
        if (tpl && tpl.format === format) styleTemplate = tpl.buffer;
      }
    }

    const buffer = await generator.generate(rawInput, styleTemplate ? { styleTemplate } : undefined);

    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const base = [this.options.basePath, datePath].filter(Boolean).join('/');
    const fileName = resolveOutputFilename(opts.filename, generator.extension);
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
    };
  }
}
