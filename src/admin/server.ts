import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { DocumentService } from '../core.js';
import type { Config } from '../config.js';
import type { Storage } from '../storage/storage.js';
import { MIME_TYPES, type DocFormat } from '../docs/types.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema, listGenerators } from '../docs/index.js';
import { TemplateStore, type TemplateInput } from './templates.js';
import { StyleTemplateStore } from './styleTemplates.js';

const FORMAT_SCHEMAS = { docx: docxSchema, pdf: pdfSchema, xlsx: xlsxSchema, pptx: pptxSchema } as const;
const SUPPORTED_FORMATS: DocFormat[] = ['docx', 'pdf', 'xlsx', 'pptx'];

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

/**
 * Admin web UI server. Runs on its own port (default 9001) so it never
 * interferes with the MCP / REST / static-file port (default 9000). Offers:
 *  - file management (list / download / inline preview / delete)
 *  - document template customization (persisted as JSON files)
 *  - document generation from a template or arbitrary input
 */
export function createAdminApp(options: { config: Config; service: DocumentService; storage: Storage; templates: TemplateStore; styleTemplates: StyleTemplateStore }): express.Express {
  const { config, service, storage, templates, styleTemplates } = options;
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir));
  app.get('/', (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  // ---- meta ----
  app.get('/api/meta', (_req, res) => {
    res.json({
      storageMode: config.storageMode,
      formats: listGenerators().map((g) => ({ format: g.format, mimeType: g.mimeType, extension: g.extension })),
      publicBaseUrl: config.storageMode === 'local' ? config.local.publicBaseUrl : (config.s3?.publicBaseUrl ?? null),
      time: new Date().toISOString(),
    });
  });

  // ---- generated files ----
  app.get('/api/files', async (_req, res) => {
    try {
      const items = await storage.list();
      res.json(items.map((o) => ({
        key: o.key,
        name: o.key.split('/').pop(),
        format: formatFromKey(o.key),
        size: o.size,
        lastModified: o.lastModified ? o.lastModified.toISOString() : null,
        url: storage.url(o.key),
        previewUrl: `/api/files/content?key=${b64url(o.key)}&disposition=inline`,
        downloadUrl: `/api/files/content?key=${b64url(o.key)}&disposition=attachment`,
      })));
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.get('/api/files/content', async (req, res) => {
    const key = req.query.key ? fromB64url(String(req.query.key)) : '';
    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    if (!key) {
      res.status(400).json({ error: 'missing key' });
      return;
    }
    try {
      const buffer = await storage.get(key);
      if (!buffer) {
        res.status(404).json({ error: 'file not found' });
        return;
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

  app.delete('/api/files/:b64key', async (req, res) => {
    const key = fromB64url(req.params.b64key);
    try {
      await storage.delete(key);
      res.json({ ok: true, key });
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- templates ----
  app.get('/api/templates', async (_req, res) => {
    try {
      res.json(await templates.list());
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.get('/api/templates/:id', async (req, res) => {
    const tpl = await templates.get(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: 'template not found' });
      return;
    }
    res.json(tpl);
  });

  const validateTemplateInput = (body: unknown): { ok: true; value: TemplateInput } | { ok: false; error: string } => {
    const b = (body ?? {}) as Partial<TemplateInput>;
    if (typeof b.name !== 'string' || !b.name.trim()) return { ok: false, error: 'name is required' };
    const fmt = b.format;
    if (!fmt || !SUPPORTED_FORMATS.includes(fmt)) {
      return { ok: false, error: `unsupported format '${fmt}'. Supported: ${SUPPORTED_FORMATS.join(', ')}` };
    }
    const schema = FORMAT_SCHEMAS[fmt];
    const parsed = schema.safeParse(b.input ?? {});
    if (!parsed.success) {
      return { ok: false, error: `input is invalid: ${formatIssueSummary(parsed.error)}` };
    }
    return {
      ok: true,
      value: {
        name: b.name.trim(),
        format: fmt,
        description: typeof b.description === 'string' ? b.description : undefined,
        styleTemplateId: typeof b.styleTemplateId === 'string' && b.styleTemplateId ? b.styleTemplateId : undefined,
        input: parsed.data as TemplateInput['input'],
      },
    };
  };

  app.post('/api/templates', async (req, res) => {
    const check = validateTemplateInput(req.body);
    if (!check.ok) {
      res.status(422).json({ error: check.error });
      return;
    }
    try {
      const tpl = await templates.create(check.value);
      res.status(201).json(tpl);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.put('/api/templates/:id', async (req, res) => {
    const existing = await templates.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'template not found' });
      return;
    }
    const check = validateTemplateInput({ ...existing, ...(req.body ?? {}) });
    if (!check.ok) {
      res.status(422).json({ error: check.error });
      return;
    }
    try {
      const tpl = await templates.update(req.params.id, check.value);
      res.json(tpl);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.delete('/api/templates/:id', async (req, res) => {
    const ok = await templates.remove(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'template not found' });
      return;
    }
    res.json({ ok: true, id: req.params.id });
  });

  // ---- style templates (uploaded document files used as visual templates) ----
  app.get('/api/style-templates', async (_req, res) => {
    try {
      const defaults = await styleTemplates.getDefaults();
      const list = await styleTemplates.list();
      res.json(list.map((t) => ({ ...t, isDefault: defaults[t.format as 'pptx' | 'docx' | 'xlsx'] === t.id })));
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.get('/api/style-templates/defaults', async (_req, res) => {
    try {
      res.json(await styleTemplates.getDefaults());
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.put('/api/style-templates/defaults', async (req, res) => {
    try {
      const format = (req.body ?? {}).format as DocFormat | undefined;
      const id = typeof (req.body ?? {}).id === 'string' ? (req.body ?? {}).id : '';
      if (format !== 'pptx' && format !== 'docx' && format !== 'xlsx') {
        res.status(422).json({ error: 'unsupported style template format. Supported: pptx, docx, xlsx' });
        return;
      }
      res.json(await styleTemplates.setDefault(format, id));
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.post('/api/style-templates', async (req, res) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name : '';
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
      const data = typeof body.data === 'string' ? body.data : '';
      // The format is derived from the file extension (single source of truth),
      // so the user doesn't have to pick it manually.
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
      const meta = await styleTemplates.create({ name, format, filename, mimeType, buffer });
      res.status(201).json(meta);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  app.delete('/api/style-templates/:id', async (req, res) => {
    const ok = await styleTemplates.remove(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'style template not found' });
      return;
    }
    res.json({ ok: true, id: req.params.id });
  });

  // ---- generation ----
  app.post('/api/generate', async (req, res) => {
    const b = (req.body ?? {}) as { templateId?: string; styleTemplateId?: string; filename?: string; format?: DocFormat; input?: unknown };
    let format: DocFormat;
    let input: unknown;
    let styleTemplateId: string | undefined;
    if (b.templateId) {
      const tpl = await templates.get(b.templateId);
      if (!tpl) {
        res.status(404).json({ error: 'template not found' });
        return;
      }
      format = tpl.format;
      input = tpl.input;
      styleTemplateId = b.styleTemplateId;
    } else {
      if (!b.format || !SUPPORTED_FORMATS.includes(b.format)) {
        res.status(400).json({ error: `unsupported format '${b.format}'. Supported: ${SUPPORTED_FORMATS.join(', ')}` });
        return;
      }
      format = b.format;
      input = b.input;
      styleTemplateId = b.styleTemplateId;
    }
    const parsed = FORMAT_SCHEMAS[format].safeParse(input);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    try {
      const doc = await service.generate(format, parsed.data as never, { styleTemplateId, filename: b.filename });
      res.status(201).json(doc);
    } catch (err) {
      res.status(500).json({ error: resolveError(err) });
    }
  });

  // ---- health ----
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: config.storageMode }));

  return app;
}

function formatIssueSummary(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).slice(0, 5).join('; ');
}
