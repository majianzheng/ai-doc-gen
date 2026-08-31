import { randomUUID } from 'node:crypto';
import { join, normalize } from 'node:path';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import type { DocFormat } from '../docs/types.js';

/**
 * A file-based **style template**: the user uploads a real document file
 * (.pptx / .docx / .xlsx) and generated documents of the same format inherit
 * its theme / master layouts / styling. Unlike content templates (which hold a
 * structured generation input), a style template is the binary document itself.
 *
 * Stored as a metadata JSON (`{id}.json`) plus the raw bytes (`{id}.bin`) inside
 * the configured style-template directory.
 */
export interface StyleTemplateMeta {
  id: string;
  name: string;
  format: DocFormat;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface StyleTemplate extends StyleTemplateMeta {
  buffer: Buffer;
}

export interface StyleTemplateInput {
  name: string;
  format: DocFormat;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/** The currently-active style template id per format. When a document is
 *  generated without an explicit styleTemplateId, the per-format default is
 *  applied automatically, so users can see & choose which template is used. */
export type StyleFormatDefaults = Partial<Record<'pptx' | 'docx' | 'xlsx', string>>;

const SUPPORTED: DocFormat[] = ['docx', 'pptx', 'xlsx'];

/** A bundled file-based style template that is imported once and registered as
 *  the per-format default on startup (see `seedDefaults`), so generated
 *  documents inherit a default visual style without manual upload. */
export interface StyleTemplateSeed {
  format: 'pptx' | 'docx' | 'xlsx';
  name: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/** Marker written after the bundled style templates have been imported once.
 *  While present, `seedDefaults` does nothing, so it never overrides a default
 *  the user configured later (delete it to re-import on next start). */
const SEED_MARKER = '.seed-defaults';

export class StyleTemplateStore {
  private readonly dir: string;

  constructor(styleTemplateDir: string) {
    this.dir = normalize(styleTemplateDir);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** Import bundled style templates and register them as the per-format
   *  default, but only on the first run (marker-gated) and only for formats
   *  that do not already have an active default. Existing templates with the
   *  same name are reused instead of duplicated. Returns the created/activated
   *  templates. */
  async seedDefaults(seeds: StyleTemplateSeed[]): Promise<StyleTemplateMeta[]> {
    if (seeds.length === 0) return [];
    try {
      await readFile(join(this.dir, SEED_MARKER));
      return []; // already seeded - never override later user configuration
    } catch {
      /* no marker yet - first run */
    }
    const defaults = await this.getDefaults();
    const existingTemplates = await this.list();
    const activated: StyleTemplateMeta[] = [];
    for (const seed of seeds) {
      if (!SUPPORTED.includes(seed.format)) continue;
      if (defaults[seed.format]) continue; // a default is already configured
      const existing = existingTemplates.find((t) => t.format === seed.format && t.name === seed.name);
      const meta = existing ?? (await this.create({
        name: seed.name,
        format: seed.format,
        filename: seed.filename,
        mimeType: seed.mimeType,
        buffer: seed.buffer,
      }));
      await this.setDefault(seed.format, meta.id);
      activated.push(meta);
    }
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, SEED_MARKER), new Date().toISOString(), 'utf8');
    return activated;
  }

  async list(): Promise<StyleTemplateMeta[]> {
    const files = await readdir(this.dir, { withFileTypes: true });
    const results: StyleTemplateMeta[] = [];
    for (const f of files) {
      // Only `{uuid}.json` files are template metadata (skip e.g. style-defaults.json).
      if (!f.isFile() || !f.name.endsWith('.json')) continue;
      const stem = f.name.slice(0, -'.json'.length);
      if (!/^[0-9a-fA-F-]{36}$/.test(stem)) continue;
      try {
        const raw = await readFile(join(this.dir, f.name), 'utf8');
        results.push(JSON.parse(raw) as StyleTemplateMeta);
      } catch {
        /* skip unreadable metadata */
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<StyleTemplate | null> {
    if (!this.isSafeId(id)) return null;
    try {
      const meta = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')) as StyleTemplateMeta;
      const buffer = await readFile(join(this.dir, `${id}.bin`));
      return { ...meta, buffer };
    } catch {
      return null;
    }
  }

  async create(input: StyleTemplateInput): Promise<StyleTemplateMeta> {
    if (!SUPPORTED.includes(input.format)) {
      throw new Error(`Unsupported style template format '${input.format}'. Supported: ${SUPPORTED.join(', ')}`);
    }
    const id = randomUUID();
    const meta: StyleTemplateMeta = {
      id,
      name: input.name.trim() || input.filename || `${input.format} template`,
      format: input.format,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.buffer.length,
      createdAt: new Date().toISOString(),
    };
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${id}.json`), JSON.stringify(meta, null, 2), 'utf8');
    await writeFile(join(this.dir, `${id}.bin`), input.buffer);
    return meta;
  }

  async remove(id: string): Promise<boolean> {
    if (!this.isSafeId(id)) return false;
    try {
      await unlink(join(this.dir, `${id}.json`));
    } catch {
      return false; // nothing to delete
    }
    await unlink(join(this.dir, `${id}.bin`)).catch(() => {});
    // If the deleted template was the active default for its format, clear it.
    const defaults = await this.getDefaults();
    let changed = false;
    for (const key of Object.keys(defaults) as ('pptx' | 'docx' | 'xlsx')[]) {
      if (defaults[key] === id) {
        delete defaults[key];
        changed = true;
      }
    }
    if (changed) await this.writeDefaults(defaults);
    return true;
  }

  /** Currently-active style template id per format (pptx/docx/xlsx). */
  async getDefaults(): Promise<StyleFormatDefaults> {
    try {
      const raw = await readFile(this.defaultsFile(), 'utf8');
      const loaded = JSON.parse(raw) as Record<string, unknown>;
      const out: StyleFormatDefaults = {};
      for (const f of SUPPORTED) {
        const v = loaded[f];
        if (typeof v === 'string' && this.isSafeId(v)) out[f as 'pptx' | 'docx' | 'xlsx'] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** Set (id) or clear (id === '') the active default for a format.
   *  Returns the updated defaults map. */
  async setDefault(format: DocFormat, id: string): Promise<StyleFormatDefaults> {
    if (!SUPPORTED.includes(format)) {
      throw new Error(`Unsupported style template format '${format}'. Supported: ${SUPPORTED.join(', ')}`);
    }
    const key = format as 'pptx' | 'docx' | 'xlsx';
    const defaults = await this.getDefaults();
    if (id) {
      const existing = await this.get(id);
      if (!existing) throw new Error('style template not found');
      if (existing.format !== format) {
        throw new Error(`template format mismatch: expected ${format}, got ${existing.format}`);
      }
      defaults[key] = id;
    } else {
      delete defaults[key];
    }
    await this.writeDefaults(defaults);
    return defaults;
  }

  private defaultsFile(): string {
    return join(this.dir, 'style-defaults.json');
  }

  private async writeDefaults(defaults: StyleFormatDefaults): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.defaultsFile(), JSON.stringify(defaults, null, 2), 'utf8');
  }

  private isSafeId(id: string): boolean {
    return /^[0-9a-fA-F-]{36}$/.test(id);
  }
}
