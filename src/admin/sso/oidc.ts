import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OidcConfig, SsoIdentity } from './types.js';
import { fetchText, loginStates } from './state.js';

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  issuer: string;
}

async function discover(issuer: string): Promise<OidcDiscovery> {
  const wellKnown = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  const raw = await fetchText(wellKnown);
  const d = JSON.parse(raw) as OidcDiscovery;
  if (!d.authorization_endpoint || !d.token_endpoint) {
    throw new Error('OIDC discovery did not return authorization/token endpoints');
  }
  return d;
}

function sha256Base64url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function pickClaim(claims: Record<string, unknown>, key: string): string | undefined {
  const v = claims[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v.find((x) => typeof x === 'string');
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

async function tokenRequest(
  disc: OidcDiscovery,
  cfg: OidcConfig,
  opts: { code: string; redirectUri: string; codeVerifier?: string },
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: cfg.clientId,
  });
  if (opts.codeVerifier) body.set('code_verifier', opts.codeVerifier);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cfg.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString('base64')}`;
  }
  const res = await fetch(disc.token_endpoint, { method: 'POST', headers, body });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OIDC token response is not JSON (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(`OIDC token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  return json;
}

async function validateIdToken(idToken: string, cfg: OidcConfig, disc: OidcDiscovery, expectedNonce?: string): Promise<Record<string, unknown>> {
  const jwksUri = cfg.jwksUrl || disc.jwks_uri;
  if (!jwksUri) throw new Error('OIDC: no JWKS URI available');
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(idToken, JWKS, {
    algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256', 'PS384', 'PS512', 'HS256', 'HS384', 'HS512'],
    issuer: disc.issuer,
    audience: cfg.clientId,
    ...(expectedNonce ? { nonce: expectedNonce } : {}),
  });
  return payload as Record<string, unknown>;
}

/** Build the IdP authorization URL for an OIDC authorization-code login. */
export async function oidcStart(cfg: OidcConfig, opts: { redirectUri: string; relay?: string }): Promise<string> {
  if (!cfg.issuer || !cfg.clientId) throw new Error('OIDC is not configured (missing issuer / client id)');
  const disc = await discover(cfg.issuer);
  const state = loginStates.set({ relay: opts.relay });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: opts.redirectUri,
    scope: cfg.scope || 'openid',
    state,
  });
  let codeVerifier: string | undefined;
  if (cfg.usePkce) {
    codeVerifier = randomBytes(32).toString('base64url');
    params.set('code_challenge', sha256Base64url(codeVerifier));
    params.set('code_challenge_method', 'S256');
  }
  const nonce = randomBytes(16).toString('hex');
  params.set('nonce', nonce);
  const entry = loginStates.get(state);
  if (entry) {
    entry.nonce = nonce;
    entry.codeVerifier = codeVerifier;
  }
  const sep = disc.authorization_endpoint.includes('?') ? '&' : '?';
  return `${disc.authorization_endpoint}${sep}${params.toString()}`;
}

/** Complete an OIDC callback (code -> tokens -> validated id token / userinfo). */
export async function oidcCallback(cfg: OidcConfig, params: Record<string, string>, opts: { redirectUri: string }): Promise<SsoIdentity> {
  const disc = await discover(cfg.issuer);
  if (params.error) throw new Error(`OIDC authorization error: ${params.error}: ${params.error_description ?? ''}`);
  const code = params.code;
  if (!code) throw new Error('OIDC callback missing authorization code');
  const stateEntry = loginStates.take(params.state ?? '');
  if (stateEntry && params.state !== stateEntry.state) throw new Error('OIDC state mismatch');

  const tokens = await tokenRequest(disc, cfg, { code, redirectUri: opts.redirectUri, codeVerifier: stateEntry?.codeVerifier });

  let claims: Record<string, unknown> | undefined;
  const idToken = tokens.id_token;
  if (typeof idToken === 'string') {
    claims = await validateIdToken(idToken, cfg, disc, stateEntry?.nonce);
  }
  const accessToken = tokens.access_token;
  if (!claims && accessToken && disc.userinfo_endpoint) {
    const res = await fetch(disc.userinfo_endpoint, { headers: { Authorization: `Bearer ${String(accessToken)}` } });
    if (res.ok) claims = (await res.json()) as Record<string, unknown>;
  }
  if (!claims || typeof claims !== 'object') throw new Error('OIDC login failed: could not obtain user claims');

  const username = pickClaim(claims, cfg.usernameClaim) ?? pickClaim(claims, 'email') ?? (claims.sub as string);
  if (typeof username !== 'string' || !username) throw new Error('OIDC login failed: no username claim found');
  const subject = typeof claims.sub === 'string' ? claims.sub : username;
  const displayName = pickClaim(claims, 'name') ?? pickClaim(claims, 'preferred_username') ?? username;
  return { username, displayName, subject };
}
