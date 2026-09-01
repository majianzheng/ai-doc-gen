/**
 * Minimal structural view of an XML node as returned by @xmldom/xmldom, so the
 * SSO providers don't have to depend on the DOM lib or xmldom's internal types.
 */
export interface XmlNodeLike {
  nodeType: number;
  nodeName: string;
  localName?: string | null;
  textContent: string;
  childNodes: XmlNodeLike[];
  getAttribute(name: string): string;
}

export interface XmlDocLike {
  documentElement: XmlNodeLike | null;
  getElementsByTagNameNS(namespaceURI: string, localName: string): unknown[];
  getElementsByTagName(localName: string): unknown[];
}

export function asXml<T>(node: T): XmlNodeLike {
  return node as unknown as XmlNodeLike;
}

export function asElements(list: unknown[]): XmlNodeLike[] {
  return list.map((n) => n as XmlNodeLike);
}
