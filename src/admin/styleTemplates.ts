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
  /** 'system' = platform-defined template (admin-only management); otherwise
   *  the username that owns the template (only that user can see/manage it). */
  owner: string;
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
  owner: string;
}

/** The currently-active style template id per format, scoped to one owner
 *  ('system' or a username). When a document is generated without an explicit
 *  styleTemplateId, the owner's own default is applied; if the user has none,
 *  the 'system' default for the format is applied; otherwise the bundled
 *  seed template. */
export type StyleFormatDefaults = Partial<Record<'pptx' | 'docx' | 'xlsx', string>>;

/** Per-owner defaults map: { owner -> { format -> templateId } } */
export type StyleOwnersDefaults = Record<string, StyleFormatDefaults>;

export type StyleListScope = 'all' | 'system' | string;

/** The platform-owned style templates (admin-managed, visible to everyone). */
export const SYSTEM_OWNER = 'system';

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
        owner: SYSTEM_OWNER,
      }));
      await this.setDefaultFor(seed.format, meta.id, SYSTEM_OWNER);
      activated.push(meta);
    }
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, SEED_MARKER), new Date().toISOString(), 'utf8');
    return activated;
  }

  /** List style templates visible to a scope:
   *   - 'all'            -> every template (admin)
   *   - 'system'         -> platform templates only
   *   - a username       -> system templates + that user's own templates */
  async list(scope: StyleListScope = 'all'): Promise<StyleTemplateMeta[]> {
    const files = await readdir(this.dir, { withFileTypes: true });
    const results: StyleTemplateMeta[] = [];
    for (const f of files) {
      // Only `{uuid}.json` files are template metadata (skip e.g. style-defaults.json).
      if (!f.isFile() || !f.name.endsWith('.json')) continue;
      const stem = f.name.slice(0, -'.json'.length);
      if (!/^[0-9a-fA-F-]{36}$/.test(stem)) continue;
      try {
        const raw = await readFile(join(this.dir, f.name), 'utf8');
        const meta = JSON.parse(raw) as StyleTemplateMeta;
        if (typeof meta.owner !== 'string' || !meta.owner) meta.owner = SYSTEM_OWNER;
        if (scope !== 'all' && scope !== SYSTEM_OWNER && meta.owner !== SYSTEM_OWNER && meta.owner !== scope) continue;
        if (scope === SYSTEM_OWNER && meta.owner !== SYSTEM_OWNER) continue;
        results.push(meta);
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
      if (typeof meta.owner !== 'string' || !meta.owner) meta.owner = SYSTEM_OWNER;
      const buffer = await readFile(join(this.dir, `${id}.bin`));
      return { ...meta, buffer };
    } catch {
      return null;
    }
  }

  /** Whether `actor` is allowed to manage the template: the owner himself, or
   *  an admin for the system templates (admins manage everything else too via
   *  the admin UI, but a normal user can only touch their own). */
  canManage(meta: StyleTemplateMeta, actor: { username: string; role: string }): boolean {
    if (meta.owner === SYSTEM_OWNER) return actor.role === 'admin';
    return meta.owner === actor.username;
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
      owner: input.owner || SYSTEM_OWNER,
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
    // If the deleted template was the active default for its owner / format, clear it.
    const allDefaults = await this.getAllDefaults();
    let changed = false;
    for (const owner of Object.keys(allDefaults)) {
      const fmtDefs = allDefaults[owner] ?? {};
      for (const key of Object.keys(fmtDefs) as ('pptx' | 'docx' | 'xlsx')[]) {
        if (fmtDefs[key] === id) {
          delete fmtDefs[key];
          changed = true;
        }
      }
      if (Object.keys(fmtDefs).length === 0) delete allDefaults[owner];
    }
    if (changed) await this.writeOwnersDefaults(allDefaults);
    return true;
  }

  /** Currently-active 'system' style template id per format (pptx/docx/xlsx). */
  async getDefaults(): Promise<StyleFormatDefaults> {
    return this.getDefaultsFor(SYSTEM_OWNER);
  }

  /** The active default id for one owner ('system' or a username). */
  async getDefaultsFor(owner: string): Promise<StyleFormatDefaults> {
    const all = await this.getAllDefaults();
    return all[owner] ?? {};
  }

  /** Resolve the effective default template id for `owner` when generating:
   *  the owner's own default, else the system default for the format. */
  async resolveDefault(format: DocFormat, owner: string | undefined): Promise<string | undefined> {
    if (!owner) return (await this.getDefaultsFor(SYSTEM_OWNER))[format as 'pptx' | 'docx' | 'xlsx'];
    const own = (await this.getDefaultsFor(owner))[format as 'pptx' | 'docx' | 'xlsx'];
    if (own) return own;
    return (await this.getDefaultsFor(SYSTEM_OWNER))[format as 'pptx' | 'docx' | 'xlsx'];
  }

  /** Effective defaults for every format for one scope: own default, else the
   *  system default. Used by the admin UI to show which template would apply. */
  async resolvedDefaultsFor(scope: string): Promise<StyleFormatDefaults> {
    const own = await this.getDefaultsFor(scope);
    const system = await this.getDefaultsFor(SYSTEM_OWNER);
    const out: StyleFormatDefaults = {};
    for (const f of SUPPORTED) {
      const key = f as 'pptx' | 'docx' | 'xlsx';
      out[key] = own[key] ?? system[key];
    }
    return out;
  }

  /** All owners' defaults: { owner -> { format -> id } } */
  async getAllDefaults(): Promise<StyleOwnersDefaults> {
    try {
      const raw = await readFile(this.defaultsFile(), 'utf8');
      const loaded = JSON.parse(raw) as Record<string, unknown>;
      // Migration from the legacy single-owner file: { format: id } -> system.
      const legacySystem = this.extractFormatDefaults(loaded);
      if (loaded[SYSTEM_OWNER] === undefined && Object.keys(legacySystem).length) {
        loaded[SYSTEM_OWNER] = legacySystem;
      }
      const out: StyleOwnersDefaults = {};
      for (const [owner, value] of Object.entries(loaded)) {
        if (typeof owner !== 'string' || value === null || typeof value !== 'object') continue;
        const filtered = this.extractFormatDefaults(value as Record<string, unknown>);
        if (Object.keys(filtered).length) out[owner] = filtered;
      }
      return out;
    } catch {
      return {};
    }
  }

  private extractFormatDefaults(value: Record<string, unknown>): StyleFormatDefaults {
    const out: StyleFormatDefaults = {};
    for (const f of SUPPORTED) {
      const v = value[f];
      if (typeof v === 'string' && this.isSafeId(v)) out[f as 'pptx' | 'docx' | 'xlsx'] = v;
    }
    return out;
  }

  /** Set (id) or clear (id === '') the active default for a format of `owner`.
   *  Non-system owners may only point at their own templates; system defaults
   *  may only reference system templates (enforced by the caller via canManage,
   *  and here by ownership matching). */
  async setDefaultFor(format: DocFormat, id: string, owner: string): Promise<StyleFormatDefaults> {
    if (!SUPPORTED.includes(format)) {
      throw new Error(`Unsupported style template format '${format}'. Supported: ${SUPPORTED.join(', ')}`);
    }
    const key = format as 'pptx' | 'docx' | 'xlsx';
    const all = await this.getAllDefaults();
    const defaults = all[owner] ?? {};
    if (id) {
      const existing = await this.get(id);
      if (!existing) throw new Error('style template not found');
      if (existing.format !== format) {
        throw new Error(`template format mismatch: expected ${format}, got ${existing.format}`);
      }
      if (owner === SYSTEM_OWNER && existing.owner !== SYSTEM_OWNER) {
        throw new Error('system defaults can only reference system templates');
      }
      if (owner !== SYSTEM_OWNER && existing.owner !== owner) {
        throw new Error('you can only set your own templates as your default');
      }
      defaults[key] = id;
    } else {
      delete defaults[key];
    }
    all[owner] = defaults;
    await this.writeOwnersDefaults(all);
    return defaults;
  }

  /** Set (id) or clear (id === '') the system default for a format (admin). */
  async setDefault(format: DocFormat, id: string): Promise<StyleFormatDefaults> {
    return this.setDefaultFor(format, id, SYSTEM_OWNER);
  }

  private defaultsFile(): string {
    return join(this.dir, 'style-defaults.json');
  }

  private async writeOwnersDefaults(all: StyleOwnersDefaults): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.defaultsFile(), JSON.stringify(all, null, 2), 'utf8');
  }

  private isSafeId(id: string): boolean {
    return /^[0-9a-fA-F-]{36}$/.test(id);
  }
}
