// POST /api/engagements/:id/restore
// Body: { timestamp: string }  (an entry returned by /history)
// Copies that historical .scc back into current.scc and bumps the D1 row.

import { json, notFound, badRequest } from '../../../utils/response';
import { writeAudit } from '../../../utils/audit';
import { blobKey, historyKey, getEngagement } from '../../../utils/engagement';
import { param, type Ctx } from '../../../utils/env';

interface Body {
  timestamp?: string;
}

export const onRequestPost = async (ctx: Ctx<'id'>): Promise<Response> => {
  const id = param(ctx.params.id);
  const row = await getEngagement(ctx.env, id);
  if (!row) return notFound('engagement');

  let body: Body;
  try {
    body = await ctx.request.json<Body>();
  } catch {
    return badRequest('invalid JSON body');
  }
  const ts = body.timestamp?.trim();
  if (!ts) return badRequest('timestamp required');

  const src = await ctx.env.BUCKET.get(historyKey(id, ts));
  if (!src) return notFound('history entry');

  const payload = await src.arrayBuffer();
  const now = new Date().toISOString();
  const email = ctx.data.auth.email;

  const put = await ctx.env.BUCKET.put(blobKey(id), payload, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      engagementId: id,
      modifiedAt: now,
      modifiedBy: email,
      restoredFrom: ts,
    },
  });

  await ctx.env.DB
    .prepare(
      `UPDATE engagements
         SET etag = ?, last_modified_at = ?, last_modified_by = ?
       WHERE id = ?`
    )
    .bind(put.httpEtag, now, email, id)
    .run();

  ctx.waitUntil(
    writeAudit(ctx.env, id, email, 'blob.restore', {
      restoredFrom: ts,
      etag: put.httpEtag,
    })
  );

  return json({ etag: put.httpEtag, lastModifiedAt: now, restoredFrom: ts });
};
