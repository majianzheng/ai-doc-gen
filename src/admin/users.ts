import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

export type UserRole = 'admin' | 'user';

/** Where an account comes from: the built-in local accounts vs. an SSO login. */
export interface UserOrigin {
  provider: 'local' | 'sso';
  /** one of oidc | saml | cas when provider === 'sso' */
  ssoProvider?: 'oidc' | 'saml' | 'cas';
}

export interface User {
  username: string;
  /** scrypt hash: "<saltHex>:<hashHex>" (null for SSO-only accounts that never set a local password) */
  passwordHash: string | null;
  role: UserRole;
  displayName?: string;
  origin: UserOrigin;
  /** subject/user-id from the identity provider (for matching SSO logins to local accounts) */
  ssoSubject?: string;
  createdAt: string;
  updatedAt: string;
  /** user-set display language preference (zh-CN / en-US), optional */
  locale?: string;
}

const ROLE_ORDER: Record<UserRole, number> = { admin: 0, user: 1 };

function scryptHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function scryptVerify(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * File-backed user store for the admin UI. Accounts are persisted as JSON
 * inside the admin data directory:
 *   - the built-in super admin is seeded from ADMIN_USERNAME / ADMIN_PASSWORD
 *   - SSO users are auto-created on their first successful login (when SSO
 *     auto-create is enabled) with the 'user' role
 */
export class UserStore {
  private readonly file: string;
  private users: User[] = [];

  constructor(private readonly dataDir: string) {
    this.file = join(normalize(dataDir), 'users.json');
  }

  get dir(): string {
    return this.dataDir;
  }

  async init(seed: { username: string; password: string; ssoAdmins?: string[] }): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    this.users = await this.read();
    // Seed the built-in super admin (never overwrites an existing account).
    const existing = this.users.find((u) => u.username === seed.username && u.origin.provider === 'local');
    if (!existing) {
      const now = new Date().toISOString();
      this.users.push({
        username: seed.username,
        passwordHash: scryptHash(seed.password),
        role: 'admin',
        origin: { provider: 'local' },
        createdAt: now,
        updatedAt: now,
      });
      await this.write();
      // eslint-disable-next-line no-console
      console.log(`[ai-doc] seeded built-in super admin '${seed.username}' (admin)`);
    }
    // Promote any SSO-only usernames listed in ADMIN_SSO_ADMINS (they may not
    // exist as local accounts yet; matching happens on first SSO login).
    if (seed.ssoAdmins?.length) {
      let changed = false;
      for (const u of this.users) {
        if (u.origin.provider === 'local' && seed.ssoAdmins.includes(u.username) && u.role !== 'admin') {
          u.role = 'admin';
          u.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
      if (changed) await this.write();
    }
  }

  list(): User[] {
    return [...this.users].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.username.localeCompare(b.username));
  }

  get(username: string): User | undefined {
    return this.users.find((u) => u.username === username);
  }

  verifyLocal(username: string, password: string): User | null {
    const user = this.get(username);
    if (!user || !user.passwordHash || user.origin.provider !== 'local') return null;
    return scryptVerify(password, user.passwordHash) ? user : null;
  }

  /** Find (or create) the account for an SSO login and return it. */
  async ssoLogin(username: string, opts: { ssoProvider: 'oidc' | 'saml' | 'cas'; ssoSubject?: string; autoCreate?: boolean; ssoAdmins?: string[]; displayName?: string; locale?: string }): Promise<{ user: User; created: boolean } | { user: null; created: false }> {
    let user = this.get(username);
    if (user && user.origin.provider === 'sso') {
      user.ssoSubject = user.ssoSubject ?? opts.ssoSubject;
      user.displayName = user.displayName ?? opts.displayName;
      user.locale = opts.locale ?? user.locale;
      user.updatedAt = new Date().toISOString();
      await this.write();
      return { user, created: false };
    }
    if (user && user.origin.provider === 'local' && opts.autoCreate) {
      // A local account with the same username exists -> accept the SSO login
      // for it (do not shadow local passwords).
      return { user, created: false };
    }
    if (!opts.autoCreate && !opts.ssoAdmins?.includes(username)) return { user: null, created: false };
    const now = new Date().toISOString();
    const role: UserRole = opts.ssoAdmins?.includes(username) ? 'admin' : 'user';
    const createdUser: User = {
      username,
      passwordHash: null,
      role,
      displayName: opts.displayName,
      origin: { provider: 'sso', ssoProvider: opts.ssoProvider },
      ssoSubject: opts.ssoSubject,
      locale: opts.locale,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(createdUser);
    await this.write();
    return { user: createdUser, created: true };
  }

  async create(input: { username: string; password?: string; role: UserRole; displayName?: string; origin?: UserOrigin }): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
    if (this.get(input.username)) return { ok: false, error: `user '${input.username}' already exists` };
    const now = new Date().toISOString();
    const user: User = {
      username: input.username,
      passwordHash: input.password ? scryptHash(input.password) : null,
      role: input.role,
      displayName: input.displayName,
      origin: input.origin ?? { provider: 'local' },
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    await this.write();
    return { ok: true, user };
  }

  async updateRole(username: string, role: UserRole): Promise<{ ok: boolean; error?: string }> {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'user not found' };
    if (role !== 'admin' && role !== 'user') return { ok: false, error: 'invalid role' };
    // Admin accounts are permanent — once an account is an admin it can never be
    // demoted. Admins (and only admins) created via SSO seed are managed here.
    if (role === 'user' && user.role === 'admin') {
      return { ok: false, error: 'admin accounts cannot be demoted' };
    }
    user.role = role;
    user.updatedAt = new Date().toISOString();
    await this.write();
    return { ok: true };
  }

  async setDisplayName(username: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'user not found' };
    user.displayName = displayName.trim() || undefined;
    user.updatedAt = new Date().toISOString();
    await this.write();
    return { ok: true };
  }

  async setPassword(username: string, password: string): Promise<{ ok: boolean; error?: string; invalid?: boolean }> {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'user not found', invalid: true };
    if (!password || password.length < 6) return { ok: false, error: 'password must be at least 6 characters' };
    user.passwordHash = scryptHash(password);
    user.origin = { provider: 'local' };
    user.updatedAt = new Date().toISOString();
    await this.write();
    return { ok: true };
  }

  async remove(username: string): Promise<{ ok: boolean; error?: string }> {
    const user = this.get(username);
    if (!user) return { ok: false, error: 'user not found' };
    if (user.role === 'admin') {
      const admins = this.users.filter((u) => u.role === 'admin' && u.username !== username);
      if (admins.length === 0) {
        return { ok: false, error: 'cannot remove the last admin account' };
      }
    }
    this.users = this.users.filter((u) => u.username !== username);
    await this.write();
    return { ok: true };
  }

  private async read(): Promise<User[]> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as User[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async write(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.users, null, 2), 'utf8');
    await rename(tmp, this.file);
  }
}
