import type { SsoConfig, SsoIdentity, SsoProviderType } from './types.js';
import { oidcStart, oidcCallback } from './oidc.js';
import { samlStart, samlCallback, samlLoadMetadata } from './saml.js';
import { casStart, casCallback } from './cas.js';

export * from './types.js';
export * from './state.js';
export { samlLoadMetadata } from './saml.js';

export type SsoCallbackParams = Record<string, string>;

/** Build the initial redirect URL to the identity provider. */
export async function ssoStart(config: SsoConfig, opts: { redirectUri: string; relay?: string }): Promise<string> {
  switch (config.provider) {
    case 'oidc':
      return oidcStart(config.oidc, opts);
    case 'saml':
      return samlStart(config.saml, opts);
    case 'cas':
      return casStart(config.cas, opts);
    default:
      throw new Error('SSO is not enabled / provider not selected');
  }
}

/** Resolve the identity from the provider callback. */
export async function ssoCallback(config: SsoConfig, params: Record<string, string>, opts: { redirectUri: string }): Promise<SsoIdentity> {
  switch (config.provider) {
    case 'oidc':
      return oidcCallback(config.oidc, params, opts);
    case 'saml':
      return samlCallback(config.saml, params);
    case 'cas':
      return casCallback(config.cas, params, opts);
    default:
      throw new Error('SSO is not enabled / provider not selected');
  }
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'checkbox';
  placeholder?: string;
  required: boolean;
  help?: string;
  /** browsers/IdP validate https callback URLs; the "callback URL" hint */
  isCallbackHint?: boolean;
}

/** Field descriptors rendered by the admin UI for each provider. */
export function fieldSchema(provider: SsoProviderType): ConfigField[] {
  switch (provider) {
    case 'oidc':
      return [
        { key: 'issuer', label: 'Issuer / 发行方', type: 'text', required: true, placeholder: 'https://sso.example.com/realms/myrealm', help: 'OpenID 配置的 issuer，用于自动发现认证/令牌/JWKS 端点' },
        { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'ai-doc' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: '••••••••' },
        { key: 'scope', label: 'Scope', type: 'text', required: false, placeholder: 'openid profile email' },
        { key: 'usernameClaim', label: '用户名字段 (claim)', type: 'text', required: false, placeholder: 'preferred_username' },
        { key: 'usePkce', label: '启用 PKCE', type: 'checkbox', required: false, help: '推荐开启；不依赖 client secret 也能防代码重放' },
        { key: 'jwksUrl', label: 'JWKS 地址 (可选覆盖)', type: 'text', required: false, placeholder: 'https://sso.example.com/.../jwks' },
        { key: 'callbackUrl', label: '回调地址 (Callback URL)', type: 'text', required: false, isCallbackHint: true, help: '在身份提供方把此地址登记为授权回调' },
      ];
    case 'saml':
      return [
        { key: 'metadataUrl', label: 'IdP 元数据 URL (自动填充)', type: 'text', required: false, placeholder: 'https://idp.example.com/metadata', help: '填写后点击“获取元数据”自动填充下方 entityId / SSO 地址 / 证书' },
        { key: 'idpEntityId', label: 'IdP Entity ID', type: 'text', required: true, placeholder: 'https://idp.example.com/.../entityid' },
        { key: 'ssoUrl', label: 'SingleSignOn 地址', type: 'text', required: true, placeholder: 'https://idp.example.com/saml2/sso' },
        { key: 'certificate', label: 'IdP 签名证书 (PEM 或 base64)', type: 'textarea', required: false, placeholder: '-----BEGIN CERTIFICATE-----…' },
        { key: 'usernameAttribute', label: '用户名取值', type: 'text', required: false, placeholder: 'nameid' },
        { key: 'spEntityId', label: 'SP Entity ID (可选)', type: 'text', required: false, placeholder: 'https://docs.example.com/saml/sp' },
        { key: 'callbackUrl', label: '断言消费地址 (ACS URL)', type: 'text', required: false, isCallbackHint: true },
      ];
    case 'cas':
      return [
        { key: 'loginUrl', label: 'CAS 登录地址', type: 'text', required: true, placeholder: 'https://cas.example.com/login' },
        { key: 'validateUrl', label: '票证校验地址', type: 'text', required: true, placeholder: 'https://cas.example.com/serviceValidate' },
        { key: 'usernameAttribute', label: '用户名属性', type: 'text', required: false, placeholder: 'user' },
        { key: 'callbackUrl', label: '服务地址 (service)', type: 'text', required: false, isCallbackHint: true },
      ];
    default:
      return [];
  }
}

/** Validate the enabled provider's config; returns a list of human-readable errors. */
export function validateConfig(config: SsoConfig): string[] {
  if (!config.enabled || config.provider === 'none') return [];
  const errors: string[] = [];
  switch (config.provider) {
    case 'oidc': {
      if (!config.oidc.issuer.trim()) errors.push('OIDC: issuer 不能为空');
      if (!config.oidc.clientId.trim()) errors.push('OIDC: client id 不能为空');
      break;
    }
    case 'saml': {
      if (!config.saml.ssoUrl.trim()) errors.push('SAML: SingleSignOn 地址不能为空');
      break;
    }
    case 'cas': {
      if (!config.cas.loginUrl.trim()) errors.push('CAS: 登录地址不能为空');
      if (!config.cas.validateUrl.trim()) errors.push('CAS: 票证校验地址不能为空');
      break;
    }
    default:
      break;
  }
  return errors;
}
