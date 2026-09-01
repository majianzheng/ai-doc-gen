import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './users.js';

export interface AuthSession {
  username: string;
  role: UserRole;
  name?: string;
  locale?: string;
}

const COOKIE_NAME = 'aidoc_session';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Load a stable HMAC secret for signing session cookies, generating and
 *  persisting a fresh random one on first boot when none is configured. */
export async function loadSessionSecret(dataDir: string, envSecret?: string): Promise<string> {
  if (envSecret && envSecret.trim()) return envSecret.trim();
  const secretFile = join(dataDir, '.session-secret');
  await mkdir(dataDir, { recursive: true });
  try {
    const existing = (await readFile(secretFile, 'utf8')).trim();
    if (existing) return existing;
  } catch {
    /* none yet */
  }
  const generated = randomBytes(48).toString('hex');
  await writeFile(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export class SessionManager {
  private readonly key: Uint8Array;
  private readonly name = COOKIE_NAME;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(session: AuthSession): Promise<string> {
    return new SignJWT({
      u: session.username,
      r: session.role,
      n: session.name ?? '',
      l: session.locale ?? '',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AuthSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      const username = typeof payload.u === 'string' && payload.u ? payload.u : '';
      if (!username) return null;
      const role: UserRole = payload.r === 'admin' ? 'admin' : 'user';
      return {
        username,
        role,
        name: typeof payload.n === 'string' && payload.n ? payload.n : undefined,
        locale: typeof payload.l === 'string' && payload.l ? payload.l : undefined,
      };
    } catch {
      return null;
    }
  }

  cookieValue(token: string, secure = false): string {
    const secureFlag = secure ? '; Secure' : '';
    return `${this.name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}${secureFlag}`;
  }

  clearCookieValue(secure = false): string {
    const secureFlag = secure ? '; Secure' : '';
    return `${this.name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`;
  }

  cookieName(): string {
    return this.name;
  }
}
