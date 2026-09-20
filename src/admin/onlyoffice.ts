import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** OnlyOffice Document Server integration helpers.
 *
 *  OnlyOffice (documentserver) is a standalone service that renders docx/xlsx/pptx
 *  in a true office engine (real pagination, headers/footers, page numbers, etc.).
 *  The admin web UI opens it with a `Config` object; OnlyOffice then fetches the
 *  document bytes itself (a plain HTTP GET — no browser session cookie), so we
 *  provide a signed, short-lived download URL plus a signed callback URL the
 *  server can validate.
 */

export interface OnlyOfficeConfig {
  enabled: boolean;
  /** base URL of the OnlyOffice Document Server, e.g. http://10.88.8.201:8082 */
  serverUrl: string;
  /** shared JWT secret used to sign the config and validate callbacks / signed URLs */
  secret: string;
  /** public base URL of *this* admin service (where OnlyOffice downloads / calls back) */
  publicBaseUrl: string;
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

/** HMAC-SHA256 over a payload, hex-encoded (used to sign the once-only download URL). */
function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function constTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Sign a short-lived download URL for a storage key. */
export function signFileUrl(cfg: OnlyOfficeConfig, key: string, ttlSeconds = 300): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${key}|${expires}`;
  const sig = hmacHex(cfg.secret, payload);
  const keyB64 = base64url(key);
  return `/api/files/onlyoffice/file?k=${keyB64}&exp=${expires}&sig=${sig}`;
}

export interface SignFileUrlResult {
  url: string;
  expires: number;
}

/** Validate a signed download URL query string. */
export function verifyFileUrl(cfg: OnlyOfficeConfig, k: string, exp: string, sig: string): string | null {
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
  const key = Buffer.from(String(k), 'base64url').toString('utf8');
  const expected = hmacHex(cfg.secret, `${key}|${expires}`);
  if (!constTimeEquals(expected, String(sig))) return null;
  return key;
}

/**
 * Build the OnlyOffice `Config` for a document and sign it (OnlyOffice requires
 * the whole config to be JWT-signed with the shared secret when JWT is enabled).
 */
export async function buildOnlyOfficeConfig(cfg: OnlyOfficeConfig, opts: {
  fileKey: string;              // unique, stable per document instance
  fileType: string;             // docx | xlsx | pptx
  title: string;
  documentUrl: string;          // absolute URL OnlyOffice downloads from
  callbackUrl: string;          // absolute URL OnlyOffice calls back to (status changes)
  mode?: 'view' | 'edit';
  user?: { id: string; name: string };
}): Promise<{ config: Record<string, unknown>; token: string }> {
  const config: Record<string, unknown> = {
    document: {
      fileType: opts.fileType,
      key: opts.fileKey,
      title: opts.title,
      url: opts.documentUrl,
      permissions: { edit: (opts.mode ?? 'view') === 'edit', download: true, print: true },
    },
    documentType: opts.fileType === 'pptx' ? 'slide' : opts.fileType === 'xlsx' ? 'cell' : 'word',
    editorConfig: {
      mode: opts.mode ?? 'view',
      callbackUrl: opts.callbackUrl,
      user: opts.user ?? { id: 'admin', name: '管理员' },
      lang: 'zh-CN',
    },
  };
  const token = await new SignJWT({ config })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('6h')
    .sign(new TextEncoder().encode(cfg.secret));
  return { config, token };
}

/** Validate a callback / download JWT (OnlyOffice signs server->client requests with the same secret). */
export async function verifyOnlyOfficeJwt(cfg: OnlyOfficeConfig, token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(cfg.secret), { algorithms: ['HS256'] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse the `x-status`-style callback payload sent by OnlyOffice. */
export function parseOnlyOfficeCallback(body: unknown): { status: number; key?: string; url?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    status: Number(b.status ?? 0),
    key: typeof b.key === 'string' ? b.key : undefined,
    url: typeof b.url === 'string' ? b.url : undefined,
  };
}
