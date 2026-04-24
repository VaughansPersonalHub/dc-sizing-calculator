// Runs before every /api/* handler. Verifies the Cloudflare Access JWT and
// attaches the resolved identity to ctx.data for handlers to read.
//
// In production, Access itself blocks unauthenticated requests before they
// ever reach this Worker — but belt-and-braces JWT verification here means
// a misconfigured Access policy can't silently leak the API.

import { verifyAccessJwt } from '../utils/access';
import { error } from '../utils/response';
import type { Env, AuthData } from '../utils/env';

export const onRequest: PagesFunction<Env, string, { auth: AuthData }> = async (ctx) => {
  const result = await verifyAccessJwt(ctx.request, ctx.env);
  if (!result.ok) {
    return error(result.status, 'unauthenticated', result.reason);
  }
  ctx.data.auth = result.auth;
  return ctx.next();
};
