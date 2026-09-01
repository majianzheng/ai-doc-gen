import http from 'node:http';
import { URL } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT, importJWK } from 'jose';

const PORT = Number(process.env.MOCK_OIDC_PORT || 9802);
const ISSUER = `http://localhost:${PORT}`;

const { publicKey, privateKey } = await generateKeyPair('RS256');
const publicJwk = await exportJWK(publicKey);
publicJwk.use = 'sig';
publicJwk.alg = 'RS256';
publicJwk.kid = 'mock-idp-1';

const jwks = { keys: [publicJwk] };

// map authorize-code -> { nonce } so the token endpoint can mint a matching id_token
const codeStore = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);

  if (url.pathname === '/.well-known/openid-configuration') {
    return json(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  }

  if (url.pathname === '/jwks') {
    return json(res, 200, jwks);
  }

  if (url.pathname === '/authorize') {
    const params = Object.fromEntries(url.searchParams.entries());
    const state = params.state || 'st';
    codeStore.set('mockcode123', { nonce: params.nonce });
    // echo back a code (the SP will exchange it at /token)
    res.writeHead(302, { Location: `${ISSUER}/cb?code=mockcode123&state=${encodeURIComponent(state)}` });
    return res.end();
  }

  if (url.pathname === '/token') {
    // consume body (client_id, client_secret, code, code_verifier, grant_type)
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = new URLSearchParams(raw); } catch { /* body parse */ }
    // client credentials may arrive via Basic auth header or form fields
    let clientId = body.get('client_id') || '';
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx > 0) clientId = decodeURIComponent(decoded.slice(0, idx));
    }
    const sub = body.get('sub') || 'u_5678';
    const email = body.get('email') || 'zhangsan@example.com';
    const nonce = (codeStore.get(body.get('code') || '') || {}).nonce;
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({
      email,
      preferred_username: 'zhangsan',
      name: 'Alice Zhang',
      email_verified: true,
      nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-idp-1', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setSubject(sub)
      .setAudience(clientId || 'ai-doc')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
    return json(res, 200, {
      access_token: 'mock-access',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
    });
  }

  if (url.pathname === '/userinfo') {
    return json(res, 200, { sub: 'u_5678', email: 'zhangsan@example.com', preferred_username: 'zhangsan' });
  }

  if (url.pathname === '/cb') {
    return json(res, 200, { note: 'authorization code redirect OK (not followed here)' });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-oidc] listening on http://localhost:${PORT}`);
});
