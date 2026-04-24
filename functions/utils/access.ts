// Cloudflare Access JWT verification via Web Crypto. No third-party JWT lib —
// everything we need is in the Workers runtime.
//
// Access places the signed JWT in the `Cf-Access-Jwt-Assertion` header on
// every request that reaches our origin. The JWKS lives at
//   https://<team_domain>/cdn-cgi/access/certs
// and rotates roughly every 6 weeks. We cache it in module scope for the
// lifetime of the isolate to avoid a JWKS fetch on every request.

import type { Env, AuthData } from './env';

interface Jwk {
  kty: 'RSA';
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

interface Jwks {
  keys: Jwk[];
}

interface AccessPayload {
  aud?: string | string[];
  email?: string;
  sub?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
}

// Module-scope cache. Re-fetched once it goes stale.
let jwksCache: { fetchedAt: number; teamDomain: string; keys: Map<string, CryptoKey> } | null =
  null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour — keys rotate on days, not minutes

// Returns a standalone ArrayBuffer (not SharedArrayBuffer) so Web Crypto
// APIs typed against `BufferSource` accept it without TS 6 + workers-types
// complaining about the buffer variant.
function b64urlToArrayBuffer(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function arrayBufferToString(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

function stringToArrayBuffer(s: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(encoded.length);
  new Uint8Array(buf).set(encoded);
  return buf;
}

async function fetchJwks(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const jwks = (await res.json()) as Jwks;
  const map = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys) {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    map.set(jwk.kid, key);
  }
  return map;
}

async function getKey(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  if (
    !jwksCache ||
    jwksCache.teamDomain !== teamDomain ||
    now - jwksCache.fetchedAt > JWKS_TTL_MS
  ) {
    jwksCache = { fetchedAt: now, teamDomain, keys: await fetchJwks(teamDomain) };
  }
  let key = jwksCache.keys.get(kid);
  if (!key) {
    // kid miss — refetch once in case rotation happened between TTLs
    jwksCache = { fetchedAt: now, teamDomain, keys: await fetchJwks(teamDomain) };
    key = jwksCache.keys.get(kid);
  }
  return key ?? null;
}

export type VerifyResult =
  | { ok: true; auth: AuthData }
  | { ok: false; status: number; reason: string };

export async function verifyAccessJwt(request: Request, env: Env): Promise<VerifyResult> {
  // Dev bypass — only honoured when the binding is literally 'true'.
  if (env.DEV_AUTH_BYPASS === 'true') {
    const email = env.DEV_USER_EMAIL ?? 'dev@scconnect.co.nz';
    return { ok: true, auth: { email, sub: `dev:${email}` } };
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('cf-access-jwt-assertion');
  if (!token) return { ok: false, status: 401, reason: 'missing_access_jwt' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'malformed_jwt' };

  let header: { alg?: string; kid?: string };
  let payload: AccessPayload;
  try {
    header = JSON.parse(arrayBufferToString(b64urlToArrayBuffer(parts[0])));
    payload = JSON.parse(arrayBufferToString(b64urlToArrayBuffer(parts[1])));
  } catch {
    return { ok: false, status: 401, reason: 'malformed_jwt_json' };
  }
  if (header.alg !== 'RS256') return { ok: false, status: 401, reason: 'bad_alg' };
  if (!header.kid) return { ok: false, status: 401, reason: 'missing_kid' };

  const key = await getKey(env.CF_ACCESS_TEAM_DOMAIN, header.kid);
  if (!key) return { ok: false, status: 401, reason: 'unknown_kid' };

  const signed = stringToArrayBuffer(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToArrayBuffer(parts[2]);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sig,
    signed
  );
  if (!verified) return { ok: false, status: 401, reason: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return { ok: false, status: 401, reason: 'expired' };
  if (payload.nbf && payload.nbf > now) return { ok: false, status: 401, reason: 'not_yet_valid' };

  if (payload.iss !== env.CF_ACCESS_ISSUER) {
    return { ok: false, status: 401, reason: 'bad_issuer' };
  }

  // AUD is the app identifier. Fail closed when it's unset so we don't
  // silently accept tokens minted for a different Access application.
  if (!env.CF_ACCESS_AUD) {
    return { ok: false, status: 500, reason: 'aud_not_configured' };
  }
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!auds.includes(env.CF_ACCESS_AUD)) {
    return { ok: false, status: 401, reason: 'bad_audience' };
  }

  if (!payload.email || !payload.sub) {
    return { ok: false, status: 401, reason: 'missing_identity_claims' };
  }

  return { ok: true, auth: { email: payload.email, sub: payload.sub } };
}
