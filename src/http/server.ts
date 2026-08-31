import { randomUUID } from 'node:crypto';
import { normalize } from 'node:path';
import express from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DocumentService } from '../core.js';
import type { Config } from '../config.js';
import { LocalStorage } from '../storage/local.js';
import { docxSchema, pdfSchema, xlsxSchema, pptxSchema } from '../docs/index.js';
import type { DocFormat } from '../docs/types.js';

const MAX_BODY = '25mb';

export function createHttpApp(options: { config: Config; service: DocumentService; mcpServer: McpServer; storage: unknown }): express.Express {
  const { config, service, mcpServer, storage } = options;
  const app = express();
  app.use(express.json({ limit: MAX_BODY }));

  // ---- CORS (browser-based MCP discovery/preflight from Dify) ----
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, mcp-protocol-version');
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ---- MCP (Streamable HTTP) ----
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const mcpPath = config.mcpPath;

  app.post(mcpPath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
      const existing = transports.get(sessionId);
      if (existing) {
        await existing.handleRequest(req, res, req.body);
        return;
      }
      res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      return;
    }
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });
    transport.onclose = () => { transports.delete(String(transport.sessionId)); };
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get(mcpPath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (sessionId && !transport) {
      res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      return;
    }
    const t: StreamableHTTPServerTransport = transport ?? new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid) => {
        transports.set(sid, t);
      },
    });
    if (!transport) {
      t.onclose = () => { transports.delete(String(t.sessionId)); };
      await mcpServer.connect(t);
    }
    await t.handleRequest(req, res, req.body);
  });

  app.delete(mcpPath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!sessionId || !transport) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: missing or inactive session' }, id: null });
      return;
    }
    transports.delete(sessionId);
    await transport.close();
    res.status(200).json({ jsonrpc: '2.0', result: { _meta: {} }, id: null });
  });

  // ---- REST API (consumed by the Dify plugin & any HTTP client) ----
  app.post('/api/documents/:format', async (req, res) => {
    const format = req.params.format as DocFormat;
    const schema = ({ docx: docxSchema, pdf: pdfSchema, xlsx: xlsxSchema, pptx: pptxSchema } as const)[format];
    if (!schema) {
      res.status(400).json({ error: `Unsupported format '${format}'. Supported: docx, pdf, xlsx, pptx` });
      return;
    }
    const styleTemplateId = (req.body as { styleTemplateId?: string } | undefined)?.styleTemplateId;
    const filename = (req.body as { filename?: string } | undefined)?.filename;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }
    try {
      const doc = await service.generate(format, parsed.data as never, { styleTemplateId, filename });
      res.status(201).json(doc);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/formats', (_req, res) => {
    res.json(['docx', 'pdf', 'xlsx', 'pptx'].map((f) => ({
      format: f,
      endpoint: `/api/documents/${f}`,
      contentType: ({
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pdf: 'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      } as const)[f as DocFormat],
    })));
  });

  // health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', storage: config.storageMode }));

  // ---- static file serving (only when using local storage) ----
  if (config.storageMode === 'local' && storage instanceof LocalStorage) {
    const root = normalize(storage.rootDir());
    // express.static maps /files/<key> -> <root>/<key> (handles nested paths
    // and percent-encoding correctly). fallthrough lets us send a clean 404.
    app.use('/files', express.static(root, { fallthrough: true, index: false }));
    app.use('/files', (req, res) => {
      const decoded = decodeURIComponent(req.path);
      if (decoded.includes('..')) {
        res.status(403).send('Forbidden');
        return;
      }
      res.status(404).send('Not found');
    });
  }

  return app;
}
