// /api/engagements/:id
//   GET    — fetch single engagement metadata
//   DELETE — soft-delete (archive). Blob + history retained per audit policy.

import { json, notFound } from '../../../utils/response';
import { writeAudit } from '../../../utils/audit';
import { getEngagement, rowToDto } from '../../../utils/engagement';
import { param, type Ctx } from '../../../utils/env';

export const onRequestGet = async (ctx: Ctx<'id'>): Promise<Response> => {
  const row = await getEngagement(ctx.env, param(ctx.params.id));
  if (!row) return notFound('engagement');
  return json({ engagement: rowToDto(row) });
};

export const onRequestDelete = async (ctx: Ctx<'id'>): Promise<Response> => {
  const id = param(ctx.params.id);
  const row = await getEngagement(ctx.env, id);
  if (!row) return notFound('engagement');

  const email = ctx.data.auth.email;
  await ctx.env.DB
    .prepare(
      "UPDATE engagements SET status = 'archived', last_modified_at = ?, last_modified_by = ? WHERE id = ?"
    )
    .bind(new Date().toISOString(), email, id)
    .run();

  ctx.waitUntil(writeAudit(ctx.env, id, email, 'engagement.archive'));
  return new Response(null, { status: 204 });
};
