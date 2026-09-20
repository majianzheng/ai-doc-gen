import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { DocumentService, AuditSink } from '../core.js';
import { ownerSlug } from '../core.js';
import type { Config } from '../config.js';
import type { Storage, StorageObjectInfo } from '../storage/storage.js';
import { MIME_TYPES, type DocFormat } from '../docs/types.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, listGenerators } from '../docs/index.js';
import { StyleTemplateStore, SYSTEM_OWNER } from './styleTemplates.js';
import { AuditLogStore } from './audit.js';
import { UserStore } from './users.js';
import { SessionManager } from './session.js';
import { SsoConfigStore } from './sso/index.js';
import { createAuth, type AuthContext } from './auth.js';
import {
  buildOnlyOfficeConfig, signFileUrl, verifyFileUrl, parseOnlyOfficeCallback,
  type OnlyOfficeConfig,
} from './onlyoffice.js';

// Admin flows provide the caller identity from the logged-in session and the
// file name separately, so they use the relaxed (admin) input schemas.
const FORMAT_SCHEMAS = { docx: docxSchema, pdf: pdfSchema, xlsx: xlsxSchema, pptx: pptxSchema } as const;
const SUPPORTED_FORMATS: DocFormat[] = ['docx', 'pdf', 'xlsx', 'pptx'];
const STYLE_FORMATS: ('pptx' | 'docx' | 'xlsx')[] = ['pptx', 'docx', 'xlsx'];

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function fromB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function formatFromKey(key: string): DocFormat | null {
  const ext = key.split('.').pop()?.toLowerCase();
  if (!ext || !SUPPORTED_FORMATS.includes(ext as DocFormat)) return null;
  return ext as DocFormat;
}

/** Style templates are file-based; their format is determined by the uploaded
 *  file's extension (.pptx / .docx / .xlsx). */
function styleFormatFromFilename(filename: string): DocFormat | null {
  const parts = filename.split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop()?.toLowerCase();
  if (ext === 'pptx' || ext === 'docx' || ext === 'xlsx') return ext;
  return null;
}

/** Owner path segment of a storage key (the segment just before the YYYY date
 *  directory), or null when the file has no owner (i.e. it belongs to system).
 *  Key form: [base/][owner/]YYYY/MM/DD/file */
function ownerSegmentOf(key: string): string | null {
  const parts = key.split('/').filter(Boolean);
  const dateIdx = parts.findIndex((p) => /^\d{4}$/.test(p));
  if (dateIdx < 0) return null;
  const ownerIdx = dateIdx > 0 ? dateIdx - 1 : -1;
  return ownerIdx >= 0 ? parts[ownerIdx] : null;
}

/** Best-effort reversal of `ownerSlug()`: plain ASCII is the identity, and every
 *  `_x<hex>_` token is decoded back to its code point (so CJK / non-ASCII
 *  usernames of callers that are not registered in the admin user store still
 *  display as their real name). */
function decodeSlug(slug: string): string {
  let out = '';
  let i = 0;
  const n = slug.length;
  while (i < n) {
    if (slug[i] === '_' && slug[i + 1] === 'x') {
      let j = i + 2;
      while (j < n && /[0-9a-fA-F]/.test(slug[j])) j++;
      if (j > i + 2 && slug[j] === '_') {
        const cp = parseInt(slug.slice(i + 2, j), 16);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          try { out += String.fromCodePoint(cp); } catch { out += slug.slice(i, j + 1); }
          i = j + 1;
          continue;
        }
      }
    }
    out += slug[i];
    i++;
  }
  return out || 'system';
}

/** Rebuild a storage key with a different owner (filesystem-safe via ownerSlug).
 *  `targetOwner === 'system'` removes the owner segment. Base-path segments that
 *  precede the owner (when present) are preserved. */
function rewriteKeyOwner(key: string, targetOwner: string): string {
  const parts = key.split('/').filter(Boolean);
  const dateIdx = parts.findIndex((p) => /^\d{4}$/.test(p));
  if (dateIdx < 0) throw new Error(`unrecognized file key: ${key}`);
  const head = parts.slice(0, dateIdx);
  const base = head.length > 1 ? head.slice(0, head.length - 1) : [];
  const ownerPart = targetOwner === 'system' ? [] : [ownerSlug(targetOwner)];
  return [...base, ...ownerPart, ...parts.slice(dateIdx)].join('/');
}

/** Infer the owner username from a storage key. Legacy keys (no owner segment)
 *  are 'system'. Files created by an identity that is not registered in the
 *  admin user store (e.g. MCP / REST callers, even before their first SSO
 *  login) keep their username: the raw slug is the identity for ASCII names and
 *  is best-effort decoded for encoded (non-ASCII) names. */
function inferOwner(key: string, users: UserStore): string {
  const candidate = ownerSegmentOf(key);
  if (candidate === null) return 'system';
  const known = users.list().find((u) => ownerSlug(u.username) === candidate);
  return known ? known.username : decodeSlug(candidate);
}

function fileBelongsToUser(key: string, username: string): boolean {
  return key.split('/').filter(Boolean).includes(ownerSlug(username));
}

function resolvePublicDir(): string {
  const candidates = [
    fileURLToPath(new URL('./public', import.meta.url)),
    join(process.cwd(), 'src', 'admin', 'public'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

function resolveError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface AdminAppOptions {
  config: Config;
  service: DocumentService;
  storage: Storage;
  styleTemplates: StyleTemplateStore;
  users: UserStore;
  sessions: SessionManager;
  ssoConfigStore: SsoConfigStore;
  /** optional audit logger (wired at startup; admin-only visibility) */
  audit?: AuditSink;
}

/**
 * Admin web UI server. Runs on its own port (default 9800) so it never
 * interferes with the MCP / REST / static-file port (default 9000). Requires
 * login: the built-in super admin (ADMIN_USERNAME/ADMIN_PASSWORD) or, when
 * enabled, an SSO account. Every generated file is scoped to its owner and
 * normal users only ever see their own files (+ system style templates).
 */
export function createAdminApp(options: AdminAppOptions): express.Express {
  const { config, service, storage, styleTemplates, users, sessions, ssoConfigStore } = options;
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '25mb' }));

  const auth: AuthContext = createAuth({ config, users, sessions, ssoConfigStore, audit: options.audit });
  app.use(auth.sessionMiddleware);
  app.use(auth.router);

  /** Record an audit event attributed to the current (or service) actor. */
  const logAudit = (req: express.Request, input: { action: string; target?: string; detail?: string }): void => {
    options.audit?.record({
      actor: req.user?.username ?? 'system',
      role: req.user?.role ?? 'system',
      ip: req.ip,
      ...input,
    });
  };

  const isAdmin = (req: express.Request) => req.user?.role === 'admin';

  const onlyOffice: OnlyOfficeConfig | null = config.onlyoffice.enabled && config.onlyoffice.serverUrl && config.onlyoffice.secret
    ? {
        enabled: true,
        serverUrl: config.onlyoffice.serverUrl,
        secret: config.onlyoffice.secret,
        publicBaseUrl: config.onlyoffice.publicBaseUrl || config.local.publicBaseUrl,
      }
    : null;

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir));
  app.get('/', (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  // ---- meta (public) ----
  app.get('/api/meta', (_req, res) => {
    res.json({
      storageMode: config.storageMode,
      formats: listGenerators().map((g) => ({ format: g.format, mimeType: g.mimeType, extension: g.extension })),
      publicBaseUrl: config.storageMode === 'local' ? config.local.publicBaseUrl : (config.s3?.publicBaseUrl ?? null),
      onlyoffice: onlyOffice ? { enabled: true, serverUrl: onlyOffice.serverUrl } : { enabled: false, serverUrl: '' },
      time: new Date().toISOString(),
    });
  });

  // ---- generated files (scoped to the authenticated user) ----
  // Supports pagination (page/limit) and server-side filtering by owner user
  // (`owner`) and by name/format/owner (`q`). Returns the distinct list of file
  // owners so the admin UI can offer an owner picker.
  app.get('/api/files', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const admin = isAdmin(req);
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const ownerFilter = typeof req.query.owner === 'string' ? req.query.owner.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

      const all = await storage.list();
      const visible = admin ? all : all.filter((o) => fileBelongsToUser(o.key, req.user!.username));

      const rows = visible.map((o) => ({ info: o, owner: inferOwner(o.key, users) }));
      const owners = [...new Set(rows.map((r) => r.owner))].sort((a, b) => {
        if (a === 'system') return -1;
        if (b === 'system') return 1;
        return a.localeCompare(b);
      });

      let filtered = rows;
      if (ownerFilter) {
        filtered = filtered.filter((r) => r.owner.toLowerCase() === ownerFilter.toLowerCase());
      }
      if (q) {
        filtered = filtered.filter((r) => {
          const name = (r.info.key.split('/').pop() ?? '').toLowerCase();
          const fmt = formatFromKey(r.info.key) ?? '';
          return name.includes(q) || fmt.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q);
        });
      }

      const total = filtered.length;
      const start = (page - 1) * limit;
      const pageRows = filtered.slice(start, start + limit);

      res.json({
        items: pageRows.map((r) => toFileDto(r.info, r.owner)),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        owners,
      });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  function toFileDto(o: StorageObjectInfo & { listedAt?: never }, owner?: string) {
    return {
      key: o.key,
      name: o.key.split('/').pop(),
      format: formatFromKey(o.key),
      size: o.size,
      lastModified: o.lastModified ? o.lastModified.toISOString() : null,
      url: storage.url(o.key),
      owner: owner ?? inferOwner(o.key, users),
      previewUrl: `/api/files/content?key=${b64url(o.key)}&disposition=inline`,
      downloadUrl: `/api/files/content?key=${b64url(o.key)}&disposition=attachment`,
    };
  }

  app.get('/api/files/content', auth.requireAuth, async (req, res) => {
    const key = req.query.key ? fromB64url(String(req.query.key)) : '';
    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    if (!key) {
      res.status(400).json({ error: 'missing key' });
      return;
    }
    if (!req.user || (!isAdmin(req) && !fileBelongsToUser(key, req.user.username))) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      const buffer = await storage.get(key);
      if (!buffer) {
        res.status(404).json({ error: 'file not found' });
        return;
      }
      if (disposition === 'attachment') {
        logAudit(req, { action: 'file.download', target: key });
      }
      const fmt = formatFromKey(key);
      const name = key.split('/').pop() ?? key;
      res.setHeader('Content-Type', fmt ? MIME_TYPES[fmt] : 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.delete('/api/files/:b64key', auth.requireAuth, async (req, res) => {
    const key = fromB64url(req.params.b64key);
    if (!req.user || (!isAdmin(req) && !fileBelongsToUser(key, req.user.username))) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      await storage.delete(key);
      logAudit(req, { action: 'file.delete', target: key });
      res.json({ ok: true, key });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- reassign a file to another owner (admin-only) ----
  // Moves the stored object under the target user's path. The target username
  // does NOT need to exist in the local user store (the caller may not have
  // logged in via SSO yet); it is always honored as the file's owner.
  app.post('/api/files/transfer', auth.requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as { key?: unknown; owner?: unknown };
    const key = typeof b.key === 'string' ? b.key.trim() : '';
    const owner = typeof b.owner === 'string' ? b.owner.trim() : '';
    if (!key) { res.status(400).json({ error: 'file key is required' }); return; }
    if (owner !== 'system' && !owner) { res.status(400).json({ error: 'target owner is required' }); return; }
    if (owner.length > 200) { res.status(400).json({ error: 'owner is too long (max 200 chars)' }); return; }
    try {
      const buffer = await storage.get(key);
      if (!buffer) { res.status(404).json({ error: 'file not found' }); return; }
      const newKey = rewriteKeyOwner(key, owner);
      if (newKey === key) { res.status(400).json({ error: 'the file already belongs to this owner' }); return; }
      const fmt = formatFromKey(key);
      const mimeType = fmt ? MIME_TYPES[fmt] : 'application/octet-stream';
      // Write the new copy first, then remove the old one (safe if put fails).
      await storage.put(buffer, { key: newKey, mimeType });
      await storage.delete(key);
      logAudit(req, { action: 'file.transfer', target: key, detail: `${key} -> ${newKey}` });
      res.json(toFileDto({ key: newKey, size: buffer.length, lastModified: new Date() }, owner === 'system' ? 'system' : owner));
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- OnlyOffice Document Server (optional) ----
  if (onlyOffice) {
    // OnlyOffice downloads the document bytes itself (no browser session cookie),
    // so this endpoint is unauthenticated but requires a valid HMAC-signed URL.
    app.get('/api/files/onlyoffice/file', async (req, res) => {
      const k = String(req.query.k ?? '');
      const exp = String(req.query.exp ?? '');
      const sig = String(req.query.sig ?? '');
      const key = verifyFileUrl(onlyOffice, k, exp, sig);
      if (!key) { res.status(403).json({ error: 'invalid or expired URL' }); return; }
      try {
        const buffer = await storage.get(key);
        if (!buffer) { res.status(404).json({ error: 'file not found' }); return; }
        const fmt = formatFromKey(key);
        res.setHeader('Content-Type', fmt ? MIME_TYPES[fmt] : 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(key.split('/').pop() ?? 'file')}`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
      } catch (err) { res.status(500).json({ error: resolveError(err) }); }
    });

    // OnlyOffice callback: acknowledges save/status changes. We don't persist
    // edits from the viewer by default, so just return { error: 0 }.
    app.post('/api/files/onlyoffice/callback', (req, res) => {
      const c = parseOnlyOfficeCallback(req.body);
      // status: 2 = document ready to download (i.e. saved). Since we are
      // view-only this is harmless; log it for traceability.
      logAudit(req, { action: 'onlyoffice.callback', detail: `status=${c.status} key=${c.key ?? ''}` });
      res.json({ error: 0 });
    });

    // Generate the OnlyOffice editor config for a stored file (requires login).
    app.post('/api/onlyoffice/config', auth.requireAuth, async (req, res) => {
      const b = (req.body ?? {}) as { key?: unknown; title?: unknown; mode?: unknown };
      const key = typeof b.key === 'string' ? b.key.trim() : '';
      const title = typeof b.title === 'string' ? b.title.trim() : (key.split('/').pop() ?? '文档');
      const mode = b.mode === 'edit' ? 'edit' : 'view';
      if (!key) { res.status(400).json({ error: 'file key is required' }); return; }
      if (!req.user || (!isAdmin(req) && !fileBelongsToUser(key, req.user.username))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const fmt = formatFromKey(key);
      if (!fmt || fmt === 'pdf') { res.status(400).json({ error: 'OnlyOffice preview supports docx/xlsx/pptx' }); return; }
      const fileType = (key.split('.').pop() ?? '').toLowerCase();
      const base = onlyOffice.publicBaseUrl;
      const docUrl = base + signFileUrl(onlyOffice, key);
      const cbUrl = base + `/api/files/onlyoffice/callback?k=${encodeURIComponent(key)}`;
      const cfg = await buildOnlyOfficeConfig(onlyOffice, {
        fileKey: Buffer.from(key).toString('base64url').slice(0, 120), // onlyoffice key: max 128 chars
        fileType,
        title,
        documentUrl: docUrl,
        callbackUrl: cbUrl,
        mode,
        user: { id: req.user.username, name: req.user.name ?? req.user.username },
      });
      res.json({ ...cfg, serverUrl: onlyOffice.serverUrl });
    });
  }

  // ---- style templates (per-user: system templates are read-only for users) ----
  app.get('/api/style-templates', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const admin = isAdmin(req);
      const viewScope = admin ? 'all' : req.user.username;
      const list = await styleTemplates.list(viewScope);
      const systemDefaults = (await styleTemplates.getDefaults()) as Record<string, string | undefined>;
      const ownDefaults = admin ? {} : ((await styleTemplates.getDefaultsFor(req.user.username)) as Record<string, string | undefined>);
      const active = await Promise.all(
        STYLE_FORMATS.map(async (f) => ({ format: f, id: await styleTemplates.resolveDefault(f, admin ? SYSTEM_OWNER : req.user!.username) })),
      );
      const effectiveDefaults = Object.fromEntries(active.map((a) => [a.format, a.id]));
      res.json({
        items: list.map((t) => ({
          ...t,
          owner: t.owner,
          system: t.owner === SYSTEM_OWNER,
          manageable: admin ? true : styleTemplates.canManage(t, { username: req.user!.username, role: req.user!.role }),
          isSystemDefault: systemDefaults[t.format as 'pptx' | 'docx' | 'xlsx'] === t.id,
          isUserDefault: (ownDefaults as Record<string, string | undefined>)[t.format] === t.id,
        })),
        defaults: effectiveDefaults,
        systemDefaults,
        ownDefaults,
      });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.get('/api/style-templates/defaults', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const admin = isAdmin(req);
      const scope = admin ? SYSTEM_OWNER : req.user.username;
      res.json(await styleTemplates.resolvedDefaultsFor(scope));
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.put('/api/style-templates/defaults', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const format = (req.body ?? {}).format as DocFormat | undefined;
      const id = typeof (req.body ?? {}).id === 'string' ? (req.body ?? {}).id : '';
      if (!STYLE_FORMATS.includes(format as 'pptx')) {
        res.status(422).json({ error: 'unsupported style template format. Supported: pptx, docx, xlsx' });
        return;
      }
      const target = isAdmin(req) ? SYSTEM_OWNER : req.user!.username;
      // When an admin sets a system default on a non-system template (e.g. one
      // they just uploaded), promote it to 'system' first so the default can
      // legally reference it (system defaults may only reference system
      // templates — this also makes it visible to every user).
      if (target === SYSTEM_OWNER && id) {
        const meta = await styleTemplates.get(id);
        if (meta && meta.owner !== SYSTEM_OWNER) {
          await styleTemplates.setOwner(id, SYSTEM_OWNER);
          logAudit(req, { action: 'styletemplate.promote', target: id, detail: `${meta.name} (${meta.format}) -> system` });
        }
      }
      const updated = await styleTemplates.setDefaultFor(format as 'pptx' | 'docx' | 'xlsx', id, target);
      logAudit(req, { action: 'styletemplate.default', target: `format:${format}`, detail: `template=${id || '(none)'} scope=${target}` });
      res.json({ defaults: updated, effective: await styleTemplates.resolveDefault(format as 'pptx' | 'docx' | 'xlsx', target) });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.post('/api/style-templates', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name : '';
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
      const data = typeof body.data === 'string' ? body.data : '';
      const owner = isAdmin(req) && body.owner === SYSTEM_OWNER ? SYSTEM_OWNER : req.user!.username;
      const format = styleFormatFromFilename(filename);
      if (!format) {
        res.status(422).json({ error: `无法从文件名识别格式: '${filename}'. 仅支持 .pptx / .docx / .xlsx` });
        return;
      }
      const declaredFormat = body.format;
      if (declaredFormat && declaredFormat !== format) {
        res.status(422).json({ error: `文件名扩展名与声明格式不一致 ('${filename}' -> ${format}, 声明 ${declaredFormat})` });
        return;
      }
      if (!data) {
        res.status(422).json({ error: 'missing file data (base64)' });
        return;
      }
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length === 0) {
        res.status(422).json({ error: 'empty file' });
        return;
      }
      const meta = await styleTemplates.create({ name, format, filename, mimeType, buffer, owner });
      logAudit(req, { action: 'styletemplate.upload', target: meta.id ?? filename, detail: `${meta.name} (${meta.format}) owner=${owner}` });
      res.status(201).json(meta);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.delete('/api/style-templates/:id', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const meta = await styleTemplates.get(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'style template not found' });
        return;
      }
      if (!styleTemplates.canManage(meta, { username: req.user.username, role: req.user.role })) {
        res.status(403).json({ error: 'you can only delete your own templates (system templates are admin-managed)' });
        return;
      }
      await styleTemplates.remove(meta.id);
      logAudit(req, { action: 'styletemplate.delete', target: meta.id, detail: meta.name });
      res.json({ ok: true, id: meta.id });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- serve a style template's raw file (preview inline / download) ----
  // Visibility mirrors list(scope): admins see every template; a normal user
  // sees the system templates plus their own.
  app.get('/api/style-templates/:id/content', auth.requireAuth, async (req, res) => {
    try {
      if (!req.user) return;
      const meta = await styleTemplates.get(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'style template not found' });
        return;
      }
      if (!isAdmin(req) && meta.owner !== SYSTEM_OWNER && meta.owner !== req.user.username) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
      if (disposition === 'attachment') {
        logAudit(req, { action: 'styletemplate.download', target: meta.id, detail: meta.name });
      }
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.filename || meta.name)}`);
      res.setHeader('Content-Length', meta.buffer.length);
      res.send(meta.buffer);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- generation (results always owned by the logged-in user) ----
  app.post('/api/generate', auth.requireAuth, async (req, res) => {
    if (!req.user) return;
    const b = (req.body ?? {}) as { format?: DocFormat; filename?: string; title?: string; content?: string; author?: string; subject?: string; footer?: string; styleTemplateId?: string };
    if (!b.format || !SUPPORTED_FORMATS.includes(b.format)) {
      res.status(400).json({ error: `unsupported format '${b.format}'. Supported: ${SUPPORTED_FORMATS.join(', ')}` });
      return;
    }
    const format = b.format;
    // The caller identity comes from the session; the rest maps onto the same
    // Markdown-driven schema the public REST / MCP endpoints use, so the admin
    // UI generates documents with exactly the same inputs as AI agents.
    const input: Record<string, unknown> = { username: req.user.username, filename: b.filename };
    if (b.title !== undefined) input.title = b.title;
    if (b.content !== undefined) input.content = b.content;
    if (b.author !== undefined) input.author = b.author;
    if (b.subject !== undefined) input.subject = b.subject;
    if (b.footer !== undefined) input.footer = b.footer;
    if (b.styleTemplateId) input.styleTemplateId = b.styleTemplateId;
    const parsed = FORMAT_SCHEMAS[format].safeParse(input);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data as Record<string, unknown>;
    try {
      const doc = await service.generate(format, data as never, {
        styleTemplateId: typeof data.styleTemplateId === 'string' ? data.styleTemplateId : undefined,
        filename: typeof data.filename === 'string' ? data.filename : undefined,
        owner: req.user.username,
        role: req.user.role,
      });
      res.status(201).json(doc);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- audit log (admin-only) ----
  app.get('/api/audit', auth.requireAdmin, async (req, res) => {
    if (!req.user) return;
    try {
      if (!(options.audit instanceof AuditLogStore)) {
        res.status(501).json({ error: 'audit log is not configured' });
        return;
      }
      const page = await options.audit.list({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        actor: typeof req.query.actor === 'string' ? req.query.actor : undefined,
        action: typeof req.query.action === 'string' ? req.query.action : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
      });
      res.json(page);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.delete('/api/audit', auth.requireAdmin, async (req, res) => {
    if (!req.user) return;
    try {
      if (!(options.audit instanceof AuditLogStore)) {
        res.status(501).json({ error: 'audit log is not configured' });
        return;
      }
      await options.audit.clear();
      logAudit(req, { action: 'audit.clear' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- health ----
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: config.storageMode }));

  // ---- SPA fallback (client-side routing: /login, /callback, etc.) ----
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(publicDir, 'index.html'));
  });

  return app;
}
