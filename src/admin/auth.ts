import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Config } from '../config.js';
import type { AuditSink } from '../core.js';
import { UserStore, type User } from './users.js';
import { SessionManager } from './session.js';
import { SsoConfigStore, validateConfig, ssoStart, ssoCallback, samlLoadMetadata, fieldSchema, type SsoConfig } from './sso/index.js';

const MASK = '*'.repeat(32);

function publicUser(u: User) {
  return {
    username: u.username,
    role: u.role,
    displayName: u.displayName ?? u.username,
    origin: u.origin.provider,
    ssoProvider: u.origin.ssoProvider,
    createdAt: u.createdAt,
  };
}

/** Read a cookie value from the request "Cookie" header. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function setCookie(res: Response, cookie: string): void {
  res.append('Set-Cookie', cookie);
}

function maskConfig(config: SsoConfig): SsoConfig {
  const copy: SsoConfig = JSON.parse(JSON.stringify(config));
  const secret = config.oidc.clientSecret;
  copy.oidc.clientSecret = secret ? MASK : '';
  return { ...copy, oidc: { ...copy.oidc, hasClientSecret: Boolean(secret) } as never };
}

function buildBaseUrl(req: Request, config: SsoConfig, adminConfig: Config['admin']): string {
  if (config.baseUrl.trim()) return config.baseUrl.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host') ?? `localhost:${adminConfig.port}`}`;
}

function relayCookie(req: Request): string {
  return readCookie(req, 'aidoc_sso_relay') ?? '/';
}

export interface AuthDeps {
  config: Config;
  users: UserStore;
  sessions: SessionManager;
  ssoConfigStore: SsoConfigStore;
  audit?: AuditSink;
}

export interface AuthContext {
  router: Router;
  /** mounts first so every route (including non-auth ones) gets req.user */
  sessionMiddleware: (req: Request, _res: Response, next: NextFunction) => void;
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
}

export function createAuth(deps: AuthDeps): AuthContext {
  const { config, users, sessions, ssoConfigStore } = deps;
  const router = Router();

  /** Record an audit event titled to the current actor (or an explicit one). */
  const logAudit = (req: Request, input: { action: string; target?: string; detail?: string }, actor?: { username: string; role: string }): void => {
    deps.audit?.record({
      actor: actor?.username ?? req.user?.username ?? 'system',
      role: actor?.role ?? req.user?.role ?? 'system',
      ip: req.ip,
      ...input,
    });
  };

  /** resolve session from cookie into req.user (never blocks) */
  const sessionMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readCookie(req, sessions.cookieName());
      if (token) req.user = (await sessions.verify(token)) ?? undefined;
    } catch {
      req.user = undefined;
    }
    next();
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'forbidden: admin required' });
      return;
    }
    next();
  };

  const secureFlag = (req: Request) => req.protocol === 'https';

  // ---------- local login ----------
  router.post('/api/auth/login', async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    const user = users.verifyLocal(String(username ?? ''), String(password ?? ''));
    if (!user) {
      res.status(401).json({ error: 'invalid username or password' });
      return;
    }
    const token = await sessions.sign({
      username: user.username,
      role: user.role,
      name: user.displayName ?? user.username,
      locale: user.locale,
    });
    setCookie(res, sessions.cookieValue(token, secureFlag(req)));
    logAudit(req, { action: 'login' }, { username: user.username, role: user.role });
    res.json({ user: publicUser(user) });
  });

  router.get('/api/auth/status', (req, res) => {
    if (!req.user) {
      res.status(401).json({ user: null });
      return;
    }
    const user = users.get(req.user.username);
    res.json({ user: user ? publicUser(user) : { username: req.user.username, role: req.user.role, displayName: req.user.name } });
  });

  router.post('/api/auth/logout', (req, res) => {
    logAudit(req, { action: 'logout' });
    setCookie(res, sessions.clearCookieValue(secureFlag(req)));
    res.json({ ok: true });
  });

  /** change own password (self-service) */
  router.post('/api/auth/password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    if (!req.user) return;
    const verified = users.verifyLocal(req.user.username, String(oldPassword ?? ''));
    if (!verified) {
      res.status(400).json({ error: 'current password is incorrect' });
      return;
    }
    const result = await users.setPassword(req.user.username, String(newPassword ?? ''));
    if (!result.ok) {
      res.status(422).json({ error: result.error ?? 'failed to update password' });
      return;
    }
    logAudit(req, { action: 'auth.password' });
    res.json({ ok: true });
  });

  // ---------- SSO ----------
  router.get('/api/auth/sso-status', async (_req, res) => {
    const cfg = await ssoConfigStore.get();
    const errors = validateConfig(cfg);
    res.json({
      enabled: cfg.enabled && cfg.provider !== 'none',
      provider: cfg.enabled ? cfg.provider : 'none',
      configured: errors.length === 0,
      errors,
      baseUrl: cfg.baseUrl,
    });
  });

  router.get('/api/auth/sso-config', requireAdmin, async (_req, res) => {
    const cfg = await ssoConfigStore.get();
    res.json({ config: maskConfig(cfg), fields: buildFields(cfg) });
  });

  router.put('/api/auth/sso-config', requireAdmin, async (req, res) => {
    try {
      const patch = (req.body ?? {}).config as Partial<SsoConfig>;
      const incoming = await ssoConfigStore.get();
      if (patch.oidc?.clientSecret === MASK) patch.oidc = { ...patch.oidc, clientSecret: incoming.oidc.clientSecret };
      const saved = await ssoConfigStore.update(patch);
      logAudit(req, { action: 'sso.update', target: 'sso-config', detail: `provider=${saved.provider} enabled=${saved.enabled}` });
      res.json({ config: maskConfig(saved), errors: validateConfig(saved) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /** lightweight connectivity check: build the provider start URL / discovery */
  router.post('/api/auth/sso-config/test', requireAdmin, async (req, res) => {
    const cfg = await ssoConfigStore.get();
    if (!cfg.enabled || cfg.provider === 'none') {
      res.status(400).json({ error: 'SSO is not enabled' });
      return;
    }
    try {
      const baseUrl = cfg.baseUrl.trim() || `http://localhost:${config.admin.port}`;
      const redirectUri = `${baseUrl}/callback/${cfg.provider}`;
      const url = await ssoStart(cfg, { redirectUri });
      res.json({ ok: true, provider: cfg.provider, redirectUri, startUrl: url });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  router.post('/api/auth/sso-config/load-metadata', requireAdmin, async (req, res) => {
    const metadataUrl = String((req.body ?? {}).metadataUrl ?? '').trim();
    if (!metadataUrl) {
      res.status(400).json({ error: 'metadata URL is required' });
      return;
    }
    try {
      res.json({ ok: true, ...(await samlLoadMetadata(metadataUrl)) });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  /** provider start redirect (clicked on the login screen) */
  router.get('/login/sso', async (req, res) => {
    const cfg = await ssoConfigStore.get();
    if (!cfg.enabled || cfg.provider === 'none') {
      res.redirect('/login?ssoerror=' + encodeURIComponent('SSO is not configured'));
      return;
    }
    const relay = typeof req.query.relay === 'string' && req.query.relay.startsWith('/') ? req.query.relay : '/';
    setCookie(res, `aidoc_sso_relay=${encodeURIComponent(relay)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; ${secureFlag(req) ? 'Secure; ' : ''}`);
    const redirectUri = `${buildBaseUrl(req, cfg, config.admin)}/callback/${cfg.provider}`;
    try {
      const startUrl = await ssoStart(cfg, { redirectUri });
      res.redirect(startUrl);
    } catch (err) {
      res.redirect('/login?ssoerror=' + encodeURIComponent((err as Error).message));
    }
  });

  /** provider callback: complete the login and set the session */
  const handleCallback = async (req: Request, res: Response): Promise<void> => {
    const cfg = await ssoConfigStore.get();
    const provider = req.params.provider as string;
    if (!cfg.enabled || cfg.provider !== provider) {
      res.redirect('/login?ssoerror=' + encodeURIComponent('SSO is not enabled for this provider'));
      return;
    }
    const redirectUri = `${buildBaseUrl(req, cfg, config.admin)}/callback/${cfg.provider}`;
    const relay = relayCookie(req);
    if (cfg.provider === 'none') {
      res.redirect('/login?ssoerror=' + encodeURIComponent('SSO is not enabled'));
      return;
    }
    const providerType: 'oidc' | 'saml' | 'cas' = cfg.provider;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') params[k] = v;
    }
    for (const [k, v] of Object.entries(req.body ?? {})) {
      if (typeof v === 'string') params[k] = v;
    }
    try {
      const identity = await ssoCallback(cfg, params, { redirectUri });
      const ssoAdmins = Array.from(new Set([...(config.admin.ssoAdmins ?? []), ...(cfg.adminUsernames ?? [])]));
      const result = await users.ssoLogin(identity.username, {
        ssoProvider: providerType,
        ssoSubject: identity.subject,
        autoCreate: cfg.autoCreate,
        ssoAdmins,
        displayName: identity.displayName,
        locale: 'zh-CN',
      });
      if (!result.user) {
        res.redirect('/login?ssoerror=' + encodeURIComponent(`user '${identity.username}' is not allowed (auto-create disabled)`));
        return;
      }
      const token = await sessions.sign({
        username: result.user.username,
        role: result.user.role,
        name: result.user.displayName ?? result.user.username,
        locale: result.user.locale,
      });
      setCookie(res, sessions.cookieValue(token, secureFlag(req)));
      setCookie(res, `aidoc_sso_relay=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      logAudit(req, { action: 'login', detail: 'sso:' + providerType }, { username: result.user.username, role: result.user.role });
      res.redirect(relay);
    } catch (err) {
      res.redirect('/login?ssoerror=' + encodeURIComponent((err as Error).message));
    }
  };
  router.get('/callback/:provider', handleCallback);
  router.post('/callback/:provider', handleCallback);

  // ---------- user management (admin) ----------
  router.get('/api/users', requireAdmin, (_req, res) => {
    res.json({ users: users.list().map(publicUser) });
  });

  router.post('/api/users', requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as { username?: string; password?: string; role?: string; displayName?: string };
    const username = String(b.username ?? '').trim();
    if (!username) {
      res.status(422).json({ error: 'username is required' });
      return;
    }
    const result = await users.create({
      username,
      password: b.password ? String(b.password) : undefined,
      role: b.role === 'admin' ? 'admin' : 'user',
      displayName: b.displayName ? String(b.displayName) : undefined,
    });
    if (!result.ok) {
      res.status(422).json({ error: result.error });
      return;
    }
    logAudit(req, { action: 'user.create', target: username, detail: `role=${b.role === 'admin' ? 'admin' : 'user'}` });
    res.status(201).json({ user: publicUser(result.user) });
  });

  router.put('/api/users/:username/role', requireAdmin, async (req, res) => {
    const role = String((req.body ?? {}).role ?? '');
    if (role !== 'admin' && role !== 'user') {
      res.status(422).json({ error: 'invalid role' });
      return;
    }
    const result = await users.updateRole(req.params.username, role);
    if (!result.ok) {
      res.status(result.error === 'user not found' ? 404 : 400).json({ error: result.error ?? 'failed' });
      return;
    }
    logAudit(req, { action: 'user.role', target: req.params.username, detail: `role=${role}` });
    res.json({ ok: true });
  });

  router.put('/api/users/:username/display-name', requireAdmin, async (req, res) => {
    const name = String((req.body ?? {}).displayName ?? '');
    const result = await users.setDisplayName(req.params.username, name);
    if (!result.ok) {
      res.status(404).json({ error: result.error ?? 'user not found' });
      return;
    }
    logAudit(req, { action: 'user.rename', target: req.params.username, detail: `displayName=${name}` });
    res.json({ ok: true });
  });

  router.put('/api/users/:username/password', requireAdmin, async (req, res) => {
    const password = String((req.body ?? {}).password ?? '');
    const result = await users.setPassword(req.params.username, password);
    if (!result.ok) {
      res.status(result.invalid ? 404 : 422).json({ error: result.error ?? 'failed' });
      return;
    }
    logAudit(req, { action: 'user.password', target: req.params.username });
    res.json({ ok: true });
  });

  router.delete('/api/users/:username', requireAdmin, async (req, res) => {
    const result = await users.remove(req.params.username);
    if (!result.ok) {
      res.status(result.error === 'user not found' ? 404 : 400).json({ error: result.error ?? 'user not found' });
      return;
    }
    logAudit(req, { action: 'user.delete', target: req.params.username });
    res.json({ ok: true });
  });

  return { router, sessionMiddleware, requireAuth, requireAdmin };
}

function buildFields(_cfg: SsoConfig): Record<string, unknown> {
  return {
    oidc: fieldSchema('oidc'),
    saml: fieldSchema('saml'),
    cas: fieldSchema('cas'),
  };
}
