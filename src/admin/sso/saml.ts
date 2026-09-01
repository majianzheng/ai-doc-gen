import { randomBytes } from 'node:crypto';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import type { SamlConfig, SsoIdentity } from './types.js';
import { loginStates } from './state.js';
import { asElements, type XmlNodeLike } from './xmlish.js';

const SAML_NS_PROTO = 'urn:oasis:names:tc:SAML:2.0:protocol';
const SAML_NS_ASSERT = 'urn:oasis:names:tc:SAML:2.0:assertion';
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deflateBase64(data: string): string {
  return deflateRawSync(Buffer.from(data, 'utf8'), { level: 9 }).toString('base64').replace(/\r?\n/g, '');
}

function normalizeCert(cert: string): string {
  const c = (cert ?? '').trim();
  if (!c) return '';
  if (c.includes('BEGIN CERTIFICATE')) return c;
  const b64 = c.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(b64)) {
    const lines = b64.match(/.{1,64}/g) ?? [b64];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  }
  return c;
}

function localText(el: XmlNodeLike | null | undefined): string | undefined {
  if (!el) return undefined;
  const text = el.textContent ?? '';
  return text.trim() || undefined;
}

/** Default SP entity id derived from the callback origin (baseUrl). */
export function defaultSpEntityId(callbackUri: string): string {
  const base = callbackUri.includes('/callback/') ? callbackUri.split('/callback/')[0]! : callbackUri;
  return `${base}/saml/sp`;
}

/** Build an SP-initiated AuthnRequest and return the HTTP-Redirect URL. */
export async function samlStart(cfg: SamlConfig, opts: { redirectUri: string; relay?: string }): Promise<string> {
  if (!cfg.ssoUrl) throw new Error('SAML is not configured (missing IdP SSO URL)');
  const id = `_${randomBytes(16).toString('hex')}`;
  const now = new Date().toISOString();
  const spEntityId = cfg.spEntityId?.trim() || defaultSpEntityId(opts.redirectUri);
  const request =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<samlp:AuthnRequest xmlns:samlp="${SAML_NS_PROTO}" xmlns:saml="${SAML_NS_ASSERT}" Version="2.0" ` +
    `ID="${id}" IssueInstant="${now}" Destination="${escapeXml(cfg.ssoUrl)}" ` +
    `AssertionConsumerServiceURL="${escapeXml(opts.redirectUri)}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">` +
    `<saml:Issuer>${escapeXml(spEntityId)}</saml:Issuer>` +
    `</samlp:AuthnRequest>`;
  const state = loginStates.set({ relay: opts.relay, authnRequestId: id });
  const params = new URLSearchParams({ SAMLRequest: deflateBase64(request), RelayState: state });
  const sep = cfg.ssoUrl.includes('?') ? '&' : '?';
  return `${cfg.ssoUrl}${sep}${params.toString()}`;
}

/** Parse + verify a SAMLResponse (HTTP-POST binding) and extract the identity. */
export async function samlCallback(cfg: SamlConfig, params: Record<string, string>): Promise<SsoIdentity> {
  const samlResponse = params.SAMLResponse;
  if (!samlResponse) throw new Error('SAML callback missing SAMLResponse');

  let decoded: string;
  const raw = Buffer.from(samlResponse, 'base64');
  const asText = raw.toString('utf8');
  if (asText.trimStart().startsWith('<')) {
    decoded = asText;
  } else {
    try {
      decoded = inflateRawSync(raw).toString('utf8');
    } catch {
      decoded = asText; // not deflated despite not starting with '<' - let the parser fail clearly
    }
  }

  const doc = new DOMParser().parseFromString(decoded, 'text/xml');
  if (!doc || !doc.documentElement) throw new Error('SAML callback: could not parse SAMLResponse');

  // xmldom returns its own node types; view them through the minimal shape
  const byNs = (ns: string, name: string): XmlNodeLike[] =>
    Array.from(doc.getElementsByTagNameNS(ns, name)) as unknown as XmlNodeLike[];

  // Optional signature verification when an IdP certificate is configured.
  const signatureEl = byNs(XMLDSIG_NS, 'Signature')[0];
  const cert = normalizeCert(cfg.certificate);
  if (signatureEl && cert) {
    try {
      const sig = new SignedXml({ publicCert: cert });
      sig.loadSignature(signatureEl as unknown as never);
      const valid = sig.checkSignature(decoded);
      if (!valid) throw new Error('signature invalid');
    } catch (err) {
      throw new Error(`SAML response signature verification failed: ${(err as Error).message}`);
    }
  } else if (signatureEl && !cert) {
    // eslint-disable-next-line no-console
    console.warn('[ai-doc] SAML response is signed but no IdP certificate is configured - signature NOT verified');
  }

  const nameIdEl = byNs(SAML_NS_ASSERT, 'NameID')[0];
  const nameId = localText(nameIdEl) ?? '';
  if (!nameId) throw new Error('SAML response has no NameID');

  // Audience constraint (defends against mis-routed responses).
  if (cfg.spEntityId?.trim()) {
    const expected = cfg.spEntityId.trim();
    const audiences = byNs(SAML_NS_ASSERT, 'Audience').map((el) => localText(el) ?? '');
    if (audiences.length && !audiences.includes(expected)) {
      throw new Error('SAML response audience does not match this SP');
    }
  }

  let username = nameId;
  const attrName = cfg.usernameAttribute?.trim() || 'nameid';
  if (attrName.toLowerCase() !== 'nameid') {
    for (const attr of byNs(SAML_NS_ASSERT, 'Attribute')) {
      if (attr.getAttribute('Name') === attrName) {
        const values = byNs(SAML_NS_ASSERT, 'AttributeValue').map((v) => localText(v) ?? '');
        if (values.length) {
          username = values[0]!;
          break;
        }
      }
    }
  }
  if (!username) throw new Error('SAML response username is empty');

  const attributes: Record<string, string> = {};
  for (const attr of byNs(SAML_NS_ASSERT, 'Attribute')) {
    const name = attr.getAttribute('Name');
    const value = localText(byNs(SAML_NS_ASSERT, 'AttributeValue')[0]);
    if (name && value) attributes[name] = value;
  }

  return {
    username,
    displayName: attributes.displayName || attributes.cn || attributes.givenName || username,
    subject: nameId,
    attributes,
  };
}

/** Load an IdP metadata XML document and extract the SSO endpoint + signing cert. */
export async function samlLoadMetadata(metadataUrl: string): Promise<{ idpEntityId: string; ssoUrl: string; certificate: string }> {
  if (!/^https?:\/\//i.test(metadataUrl)) throw new Error('invalid metadata URL (must start with http/https)');
  const res = await fetch(metadataUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error(`metadata HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  if (!root) throw new Error('metadata XML could not be parsed');
  const idpEntityId = root.getAttribute('entityID') ?? '';
  const METADATA_NS = 'urn:oasis:names:tc:SAML:2.0:metadata';
  const byNs = (ns: string, name: string): XmlNodeLike[] =>
    Array.from(doc.getElementsByTagNameNS(ns, name)) as unknown as XmlNodeLike[];
  const ssoList = byNs(METADATA_NS, 'SingleSignOnService');
  const ssoEl = ssoList.find((el) => el.getAttribute('Binding') === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST') ?? ssoList[0];
  const ssoUrl = ssoEl?.getAttribute('Location') ?? '';
  const certEl = byNs(XMLDSIG_NS, 'X509Certificate')[0];
  const certificate = localText(certEl) ?? '';
  if (!ssoUrl) throw new Error('metadata does not contain a SingleSignOnService endpoint');
  return { idpEntityId, ssoUrl, certificate };
}
