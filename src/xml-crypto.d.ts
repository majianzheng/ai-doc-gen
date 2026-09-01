declare module 'xml-crypto' {
  export class SignedXml {
    constructor(options?: { publicCert?: string | Buffer; privateKey?: string | Buffer; signatureAlgorithm?: string; getKeyInfoContent?: () => unknown });
    publicCert?: string | Buffer;
    signingKey?: string | Buffer;
    loadSignature(signature: unknown): void;
    checkSignature(xml: string): boolean;
    getOriginalXmlWithIds(): string;
  }
}
