import { z } from 'zod';

export const RegionIdSchema = z.enum(['KR', 'TW', 'VN', 'MY', 'SG', 'ID', 'custom']);
export type RegionId = z.infer<typeof RegionIdSchema>;

export const REGION_LABELS: Record<RegionId, string> = {
  KR: 'Korea',
  TW: 'Taiwan',
  VN: 'Vietnam',
  MY: 'Malaysia',
  SG: 'Singapore',
  ID: 'Indonesia',
  custom: 'Custom',
};
