// GET /api/engagements/:id/history
// Lists R2 history objects (manifest only — the SPA fetches a specific
// version via POST .../restore which copies it back into current.scc).

import { json, notFound } from '../../../utils/response';
import { historyPrefix, getEngagement } from '../../../utils/engagement';
import { param, type Ctx } from '../../../utils/env';

export const onRequestGet = async (ctx: Ctx<'id'>): Promise<Response> => {
  const id = param(ctx.params.id);
  const row = await getEngagement(ctx.env, id);
  if (!row) return notFound('engagement');

  const listing = await ctx.env.BUCKET.list({
    prefix: historyPrefix(id),
    limit: 100,
  });

  const entries = listing.objects.map((o) => ({
    key: o.key,
    // history key encodes the timestamp — trim prefix + suffix
    timestamp: o.key.slice(historyPrefix(id).length, -'.scc'.length),
    size: o.size,
    etag: o.httpEtag,
    modifiedBy: (o.customMetadata?.modifiedBy as string | undefined) ?? null,
  }));
  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return json({ history: entries });
};
