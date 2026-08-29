import 'dotenv/config';

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  pathStyle: boolean;
}

export interface LocalConfig {
  dir: string;
  publicBaseUrl: string;
}

export interface HttpConfig {
  port: number;
  host: string;
}

export type StorageMode = 's3' | 'local';

export interface Config {
  storageMode: StorageMode;
  s3: S3Config | null;
  local: LocalConfig;
  http: HttpConfig;
  transport: 'stdio' | 'http';
  mcpPath: string;
  verbose: boolean;
}

function boolEnv(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

export function loadConfig(): Config {
  const storageMode: StorageMode = (process.env.STORAGE_MODE ?? 'local').trim().toLowerCase() === 's3' ? 's3' : 'local';

  const s3: S3Config | null = storageMode === 's3'
    ? {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        bucket: process.env.S3_BUCKET ?? 'ai-doc',
        publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
        pathStyle: boolEnv('S3_PATH_STYLE', true),
      }
    : null;

  const local: LocalConfig = {
    dir: process.env.LOCAL_STORAGE_DIR ?? 'storage',
    publicBaseUrl: (process.env.LOCAL_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  };

  const http: HttpConfig = {
    port: Number(process.env.PORT ?? 9000),
    host: process.env.HOST ?? '0.0.0.0',
  };

  const transport: Config['transport'] = (process.env.DOC_MCP_TRANSPORT ?? 'http').trim().toLowerCase() === 'stdio'
    ? 'stdio'
    : 'http';

  return {
    storageMode,
    s3,
    local,
    http,
    transport,
    mcpPath: (process.env.MCP_PATH ?? '/mcp').replace(/^\/+/, '').replace(/^/, '/'),
    verbose: boolEnv('VERBOSE'),
  };
}
