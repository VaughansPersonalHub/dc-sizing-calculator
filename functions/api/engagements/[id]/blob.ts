// /api/engagements/:id/blob
//   GET — stream the current .scc from R2 with its ETag
//   PUT — upload new .scc, optimistic-concurrency gated by If-Match
//
// Concurrency model (SPEC §2.3 & §11): the client sends the last-known
// ETag in If-Match. If R2's current object has a different ETag, we
// reject with 409 and return the current metadata so the client can
// raise the merge dialog.

import { writeAudit } from '../../../utils/audit';
import { badRequest, conflict, notFound, error, json } from '../../../utils/response';
import { blobKey, historyKey, getEngagement } from '../../../utils/engagement';
import { param, type Ctx } from '../../../utils/env';

// Matches SPEC §5.5 soft ceiling: ~10 MB compressed per engagement.
const MAX_BLOB_BYTES = 20 * 1024 * 1024;

export const onRequestGet = async (ctx: Ctx<'id'>): Promise<Response> => {
  const id = param(ctx.params.id);
  const row = await getEngagement(ctx.env, id);
  if (!row) return notFound('engagement');

  const obj = await ctx.env.BUCKET.get(blobKey(id));
  if (!obj) return notFound('blob');

  ctx.waitUntil(
    writeAudit(ctx.env, id, ctx.data.auth.email, 'blob.get', { etag: obj.httpEtag })
  );

  // R2 etags are already quoted strings. Pass them through unchanged so
  // the browser's If-Match round-trips correctly.
  return new Response(obj.body, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      etag: obj.httpEtag,
      'cache-control': 'no-store',
      'x-engagement-id': id,
      'x-last-modified-at': row.last_modified_at,
      'x-last-modified-by': row.last_modified_by,
    },
  });
};

export const onRequestPut = async (ctx: Ctx<'id'>): Promise<Response> => {
  const id = param(ctx.params.id);
  const row = await getEngagement(ctx.env, id);
  if (!row) return notFound('engagement');

  const contentLength = Number(ctx.request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BLOB_BYTES) {
    return error(413, 'payload_too_large', `blob exceeds ${MAX_BLOB_BYTES} bytes`);
  }

  // Optimistic concurrency. Empty string etag in D1 means "first write" and
  // the client MUST send `If-Match: *` to acknowledge it intends to create.
  const ifMatch = ctx.request.headers.get('if-match');
  if (!ifMatch) return badRequest('If-Match header required');

  const currentEtag = row.etag;
  if (currentEtag === '') {
    if (ifMatch !== '*') {
      return conflict('initial write requires If-Match: *', { currentEtag });
    }
  } else if (ifMatch !== currentEtag && ifMatch !== '*') {
    return conflict('etag mismatch — concurrent edit detected', {
      currentEtag,
      lastModifiedBy: row.last_modified_by,
      lastModifiedAt: row.last_modified_at,
    });
  }

  const body = ctx.request.body;
  if (!body) return badRequest('request body required');

  // Buffer into memory so we can both persist the current blob and mirror
  // it into history without the source stream being consumed twice.
  const payload = await new Response(body).arrayBuffer();
  if (payload.byteLength === 0) return badRequest('empty body');
  if (payload.byteLength > MAX_BLOB_BYTES) {
    return error(413, 'payload_too_large', `blob exceeds ${MAX_BLOB_BYTES} bytes`);
  }

  const now = new Date().toISOString();
  const email = ctx.data.auth.email;

  const customMeta = {
    engagementId: id,
    modifiedAt: now,
    modifiedBy: email,
  };

  const put = await ctx.env.BUCKET.put(blobKey(id), payload, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: customMeta,
  });

  // Mirror to history in the background — not on the critical save path.
  ctx.waitUntil(
    ctx.env.BUCKET.put(historyKey(id, now), payload, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: customMeta,
    }).then(() => undefined)
  );

  await ctx.env.DB
    .prepare(
      `UPDATE engagements
         SET etag = ?, last_modified_at = ?, last_modified_by = ?
       WHERE id = ?`
    )
    .bind(put.httpEtag, now, email, id)
    .run();

  ctx.waitUntil(
    writeAudit(ctx.env, id, email, 'blob.put', {
      etag: put.httpEtag,
      bytes: payload.byteLength,
    })
  );

  return json(
    {
      etag: put.httpEtag,
      lastModifiedAt: now,
      lastModifiedBy: email,
      bytes: payload.byteLength,
    },
    { headers: { etag: put.httpEtag } }
  );
};
