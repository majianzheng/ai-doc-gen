import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createStorage } from './storage/index.js';
import { DocumentService } from './core.js';
import { runMcpStdio } from './mcp/server.js';
import { createHttpApp } from './http/server.js';
import { createAdminApp } from './admin/server.js';
import { StyleTemplateStore, type StyleTemplateSeed } from './admin/styleTemplates.js';
import { UserStore } from './admin/users.js';
import { SessionManager, loadSessionSecret } from './admin/session.js';
import { SsoConfigStore } from './admin/sso/index.js';
import { AuditLogStore } from './admin/audit.js';

/** Register bundled files as per-format default style templates (pptx by
 *  default). Only runs on the first startup per style-template directory, and
 *  only for formats that do not already have an active default, so a default
 *  the user later configures in the admin UI is never overridden. */
async function seedDefaultStyleTemplates(styleTemplates: StyleTemplateStore): Promise<void> {
  const seeds: StyleTemplateSeed[] = [];
  const pptxAsset = new URL('./assets/default-presentation.pptx', import.meta.url);
  try {
    seeds.push({
      format: 'pptx',
      name: 'ai-doc 默认演示模板',
      filename: 'default-presentation.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: await readFile(fileURLToPath(pptxAsset)),
    });
  } catch (err) {
    console.warn('[ai-doc] bundled default pptx style template not found, skipping:', (err as Error).message);
  }
  const activated = await styleTemplates.seedDefaults(seeds);
  for (const meta of activated) {
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] registered bundled style template '${meta.name}' as the ${meta.format} default (id ${meta.id})`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const storage = createStorage(config);
  const styleTemplates = new StyleTemplateStore(config.styleTemplateDir);
  const audit = new AuditLogStore(config.data.dir);
  await styleTemplates.init();
  await audit.init();
  await seedDefaultStyleTemplates(styleTemplates);
  const service = new DocumentService(storage, {}, styleTemplates, audit);

  if (config.transport === 'stdio') {
    await runMcpStdio(service);
    return;
  }

  const app = createHttpApp({ config, service, storage });
  app.listen(config.http.port, config.http.host, () => {
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] MCP server listening on http://${config.http.host}:${config.http.port}${config.mcpPath}`);
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] REST API: http://localhost:${config.http.port}/api/documents/:format`);
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] Storage mode: ${config.storageMode}`);
  });

  if (config.admin.enabled) {
    const users = new UserStore(config.data.dir);
    await users.init({
      username: config.admin.username,
      password: config.admin.password,
      ssoAdmins: config.admin.ssoAdmins,
    });
    if (process.env.ADMIN_PASSWORD === undefined || process.env.ADMIN_PASSWORD === '') {
      // eslint-disable-next-line no-console
      console.warn(`[ai-doc] built-in super admin '${config.admin.username}' is using the DEFAULT password '${config.admin.password}'. Set ADMIN_USERNAME/ADMIN_PASSWORD in .env for production.`);
    }
    const sessionSecret = await loadSessionSecret(config.data.dir, process.env.ADMIN_SESSION_SECRET);
    const accounts = new SessionManager(sessionSecret);
    const ssoConfig = new SsoConfigStore(config.data.dir);
    const adminApp = createAdminApp({ config, service, storage, styleTemplates, users, sessions: accounts, ssoConfigStore: ssoConfig, audit });
    adminApp.listen(config.admin.port, config.admin.host, () => {
      // eslint-disable-next-line no-console
      console.log(`[ai-doc] Admin UI: http://localhost:${config.admin.port}/  (port ${config.admin.port}, separated from the service port ${config.http.port})`);
    });
  }
}

main().catch((err) => {
  console.error('[ai-doc] failed to start:', err);
  process.exit(1);
});
