// Bindings and env vars available to every Pages Function via
// EventContext.env. Kept in one place so handlers can't drift.

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_ISSUER: string;
  CF_ACCESS_AUD?: string;
  // Dev-only — never set in production. Middleware bypasses JWT when true.
  DEV_AUTH_BYPASS?: string;
  DEV_USER_EMAIL?: string;
}

// Populated by _middleware.ts after a successful Access JWT verification
// (or dev bypass). Every authenticated handler reads identity from here.
export interface AuthData {
  email: string;
  sub: string;
}

// Pages Functions event context shape we use. Pick this over the full
// EventContext generic so each handler annotates its param the same way.
export type Ctx<Params extends string = string> = EventContext<
  Env,
  Params,
  { auth: AuthData }
>;

// Route params come back as `string | string[]` from the runtime. All our
// routes use single-segment [id], so we normalise here rather than casting
// at every call site.
export function param(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value[0] : value;
}
