import { z } from 'zod';
import { RegionIdSchema } from './regional';

export const EngagementStatusSchema = z.enum(['active', 'archived']);
export type EngagementStatus = z.infer<typeof EngagementStatusSchema>;

export const EngagementMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  clientName: z.string().optional(),
  regionProfile: RegionIdSchema,
  createdAt: z.coerce.date(),
  createdBy: z.string(),
  lastModifiedAt: z.coerce.date(),
  lastModifiedBy: z.string(),
  etag: z.string().default(''),
  status: EngagementStatusSchema.default('active'),
  skuCount: z.number().int().nonnegative().default(0),
  scenarioCount: z.number().int().nonnegative().default(1),
  halalCertifiedRequired: z.boolean().default(false),
  isBonded: z.boolean().default(false),
  buildingLibRef: z.string().optional(),
});
export type EngagementMeta = z.infer<typeof EngagementMetaSchema>;

export const SyncStatusSchema = z.enum([
  'synced',
  'dirty',
  'pushing',
  'pulling',
  'conflict',
  'offline',
]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
