// /api/engagements
//   GET  — list engagements visible to the caller (all for now; ACLs in Phase 1)
//   POST — create a new engagement row (does NOT write the R2 blob — the
//          SPA pushes the initial .scc via PUT /api/engagements/:id/blob)

import { json, badRequest } from '../../utils/response';
import { writeAudit } from '../../utils/audit';
import { rowToDto, type EngagementRow } from '../../utils/engagement';
import type { Ctx } from '../../utils/env';

const VALID_REGIONS = new Set(['KR', 'TW', 'VN', 'MY', 'SG', 'ID', 'custom']);

interface CreateBody {
  id?: string;
  name?: string;
  clientName?: string;
  regionProfile?: string;
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const rows = await ctx.env.DB
    .prepare(
      "SELECT * FROM engagements WHERE status = 'active' ORDER BY last_modified_at DESC LIMIT 500"
    )
    .all<EngagementRow>();
  return json({ engagements: (rows.results ?? []).map(rowToDto) });
};

export const onRequestPost = async (ctx: Ctx): Promise<Response> => {
  let body: CreateBody;
  try {
    body = await ctx.request.json<CreateBody>();
  } catch {
    return badRequest('invalid JSON body');
  }

  const id = body.id?.trim();
  const name = body.name?.trim();
  const region = body.regionProfile?.trim();
  if (!id) return badRequest('id is required');
  if (!name) return badRequest('name is required');
  if (!region || !VALID_REGIONS.has(region)) {
    return badRequest(`regionProfile must be one of ${[...VALID_REGIONS].join(', ')}`);
  }

  const now = new Date().toISOString();
  const email = ctx.data.auth.email;

  try {
    await ctx.env.DB
      .prepare(
        `INSERT INTO engagements
           (id, name, client_name, region_profile,
            created_at, created_by, last_modified_at, last_modified_by,
            etag, status, sku_count, scenario_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'active', 0, 1)`
      )
      .bind(id, name, body.clientName ?? null, region, now, email, now, email)
      .run();
  } catch (err) {
    // D1 surfaces UNIQUE violations via the message string.
    if (String(err).includes('UNIQUE') || String(err).includes('constraint')) {
      return json({ error: { code: 'conflict', message: 'engagement already exists' } }, { status: 409 });
    }
    throw err;
  }

  ctx.waitUntil(writeAudit(ctx.env, id, email, 'engagement.create', { name, region }));

  const row = await ctx.env.DB
    .prepare('SELECT * FROM engagements WHERE id = ?')
    .bind(id)
    .first<EngagementRow>();
  return json({ engagement: rowToDto(row!) }, { status: 201 });
};
