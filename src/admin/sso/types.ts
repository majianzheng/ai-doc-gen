import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

export type SsoProviderType = 'oidc' | 'saml' | 'cas';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  /** claim to use as the local username (default preferred_username) */
  usernameClaim: string;
  /** use Proof Key for Code Exchange (recommended) */
  usePkce: boolean;
  /** optional override for the JWKS URI (defaults to OIDC discovery) */
  jwksUrl?: string;
}

export interface SamlConfig {
  idpEntityId: string;
  /** IdP SingleSignOnService (HTTP-POST / HTTP-Redirect) URL */
  ssoUrl: string;
  /** IdP signing X.509 certificate (PEM or base64 DER). Optional but strongly
   *  recommended; without it the assertion signature is not verified. */
  certificate: string;
  /** optional IdP metadata URL to auto-fill ssoUrl / entityId / certificate */
  metadataUrl?: string;
  /** 'nameid' or the name of an <Attribute> whose value becomes the username */
  usernameAttribute: string;
  /** SP entity id used in the AuthnRequest (defaults to <baseUrl>/saml/sp) */
  spEntityId?: string;
}

export interface CasConfig {
  loginUrl: string;
  /** serviceValidate endpoint (e.g. https://cas.example.com/serviceValidate) */
  validateUrl: string;
  /** typically 'user' (CAS protocol 2.0) */
  usernameAttribute: string;
}

export interface SsoConfig {
  enabled: boolean;
  provider: SsoProviderType | 'none';
  /** auto-create a local account on the first SSO login (otherwise only
   *  admins allow-listed below, or pre-created users, can sign in) */
  autoCreate: boolean;
  /** optional external base URL used to build callback URLs (e.g.
   *  https://ai-doc.example.com); defaults to the request's own URL */
  baseUrl: string;
  /** SSO usernames granted the admin role (merged with ADMIN_SSO_ADMINS) */
  adminUsernames: string[];
  oidc: OidcConfig;
  saml: SamlConfig;
  cas: CasConfig;
}

export const defaultSsoConfig = (): SsoConfig => ({
  enabled: false,
  provider: 'none',
  autoCreate: true,
  baseUrl: '',
  adminUsernames: [],
  oidc: { issuer: '', clientId: '', clientSecret: '', scope: 'openid profile email', usernameClaim: 'preferred_username', usePkce: true },
  saml: { idpEntityId: '', ssoUrl: '', certificate: '', metadataUrl: '', usernameAttribute: 'nameid' },
  cas: { loginUrl: '', validateUrl: '', usernameAttribute: 'user' },
});

/** Identity resolved after a successful SSO callback. */
export interface SsoIdentity {
  username: string;
  displayName?: string;
  subject?: string;
  attributes?: Record<string, string>;
}

/**
 * Persisted SSO configuration (<dataDir>/sso-config.json). The admin UI reads
 * and writes it through this store; all settings (protocol, endpoints, certs,
 * field mapping) are configurable without restarting.
 */
export class SsoConfigStore {
  constructor(private readonly dataDir: string) {}

  private file(): string {
    return join(normalize(this.dataDir), 'sso-config.json');
  }

  async get(): Promise<SsoConfig> {
    try {
      const raw = JSON.parse(await readFile(this.file(), 'utf8')) as Partial<SsoConfig>;
      return {
        ...defaultSsoConfig(),
        ...raw,
        oidc: { ...defaultSsoConfig().oidc, ...(raw.oidc ?? {}) },
        saml: { ...defaultSsoConfig().saml, ...(raw.saml ?? {}) },
        cas: { ...defaultSsoConfig().cas, ...(raw.cas ?? {}) },
      } as SsoConfig;
    } catch {
      return defaultSsoConfig();
    }
  }

  async save(config: SsoConfig): Promise<void> {
    const file = this.file();
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2), 'utf8');
    await rename(tmp, file);
  }

  /** Merge a partial update from the UI into the stored config (keeps the
   *  other providers' settings intact). */
  async update(patch: Partial<SsoConfig>): Promise<SsoConfig> {
    const current = await this.get();
    const next: SsoConfig = {
      ...current,
      ...patch,
      oidc: { ...current.oidc, ...(patch.oidc ?? {}) },
      saml: { ...current.saml, ...(patch.saml ?? {}) },
      cas: { ...current.cas, ...(patch.cas ?? {}) },
      adminUsernames: Array.isArray(patch.adminUsernames) ? patch.adminUsernames : current.adminUsernames,
    };
    await this.save(next);
    return next;
  }
}
