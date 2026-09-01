import { DOMParser } from '@xmldom/xmldom';
import type { CasConfig, SsoIdentity } from './types.js';
import { fetchText } from './state.js';
import { asXml, type XmlNodeLike } from './xmlish.js';

function localText(el: XmlNodeLike | null | undefined): string | undefined {
  if (!el) return undefined;
  const text = el.textContent ?? '';
  return text.trim() || undefined;
}

function findLocal(root: XmlNodeLike, localName: string): XmlNodeLike | null {
  const tail = localName.split(':').pop() ?? localName;
  const stack: XmlNodeLike[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    const elName = el.nodeName.split(':').pop() ?? el.nodeName;
    if (elName === tail || el.localName === localName) return el;
    for (const child of el.childNodes ?? []) stack.push(child);
  }
  return null;
}

/** Build the CAS login redirect URL. The `service` parameter is the callback. */
export async function casStart(cfg: CasConfig, opts: { redirectUri: string; relay?: string }): Promise<string> {
  if (!cfg.loginUrl) throw new Error('CAS is not configured (missing login URL)');
  const params = new URLSearchParams({ service: opts.redirectUri });
  const sep = cfg.loginUrl.includes('?') ? '&' : '?';
  return `${cfg.loginUrl}${sep}${params.toString()}`;
}

/** Validate the CAS ticket via the serviceValidate endpoint and extract the user. */
export async function casCallback(cfg: CasConfig, params: Record<string, string>, opts: { redirectUri: string }): Promise<SsoIdentity> {
  const ticket = params.ticket;
  if (!ticket) throw new Error('CAS callback missing ticket');
  if (!cfg.validateUrl) throw new Error('CAS validate URL not configured');
  const query = new URLSearchParams({ service: opts.redirectUri, ticket, format: 'xml' });
  const sep = cfg.validateUrl.includes('?') ? '&' : '?';
  const xml = await fetchText(`${cfg.validateUrl}${sep}${query.toString()}`);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (!doc.documentElement) throw new Error('CAS validation response could not be parsed');
  const root = asXml(doc.documentElement);

  const failure = findLocal(root, 'authenticationFailure');
  if (failure) throw new Error(`CAS authentication failed: ${localText(failure) ?? 'unknown reason'}`);
  const success = findLocal(root, 'authenticationSuccess');
  if (!success) throw new Error('CAS validation did not report success');

  let username = localText(findLocal(success, 'user')) ?? '';
  if (!username) throw new Error('CAS response has no username');

  const attributes: Record<string, string> = {};
  const rawAttrs = findLocal(success, 'attributes');
  if (rawAttrs) {
    for (const n of rawAttrs.childNodes ?? []) {
      if (n.nodeType === 1) {
        const key = n.nodeName.split(':').pop() ?? n.nodeName;
        const value = (n.textContent ?? '').trim();
        if (key && value) attributes[key] = value;
      }
    }
  }
  const attrName = cfg.usernameAttribute?.trim() || 'user';
  if (attrName.toLowerCase() !== 'user' && attributes[attrName]) username = attributes[attrName] ?? username;

  return {
    username,
    displayName: attributes.displayName || attributes.cn || attributes.givenName || username,
    subject: username,
    attributes,
  };
}
