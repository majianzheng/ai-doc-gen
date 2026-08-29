import { loadConfig } from './config.js';
import { createStorage } from './storage/index.js';
import { DocumentService } from './core.js';
import { createMcpServer, runMcpStdio } from './mcp/server.js';
import { createHttpApp } from './http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const storage = createStorage(config);
  const service = new DocumentService(storage);
  const server = createMcpServer(service);

  if (config.transport === 'stdio') {
    await runMcpStdio(service);
    return;
  }

  const app = createHttpApp({ config, service, mcpServer: server, storage });
  app.listen(config.http.port, config.http.host, () => {
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] MCP server listening on http://${config.http.host}:${config.http.port}${config.mcpPath}`);
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] REST API: http://localhost:${config.http.port}/api/documents/:format`);
    // eslint-disable-next-line no-console
    console.log(`[ai-doc] Storage mode: ${config.storageMode}`);
  });
}

main().catch((err) => {
  console.error('[ai-doc] failed to start:', err);
  process.exit(1);
});
