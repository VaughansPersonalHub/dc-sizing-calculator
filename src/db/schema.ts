import Dexie, { type Table } from 'dexie';
import type { EngagementMeta } from '../schemas/engagement';
import type { SkuRecord } from '../schemas/sku';
import type {
  RackSystem,
  MheClass,
  ProductivityCell,
  BuildingTemplate,
  PalletStandard,
  AutomationSystem,
} from '../schemas/libraries';
import type { Scenario } from '../schemas/scenario';

export interface CacheEntry {
  hash: string;
  engagementId: string;
  scenarioId: string;
  createdAt: Date;
  // Payload stored as opaque JSON blob to avoid Dexie structured-clone issues
  // with Float32Arrays in deeply nested engine outputs.
  payload: string;
}

export interface AppMeta {
  key: string;
  value: unknown;
  updatedAt: Date;
}

export class DCDatabase extends Dexie {
  engagements!: Table<EngagementMeta, string>;
  skus!: Table<SkuRecord, string>;
  racks!: Table<RackSystem, string>;
  mhe!: Table<MheClass, string>;
  productivity!: Table<ProductivityCell, number>;
  buildings!: Table<BuildingTemplate, string>;
  pallets!: Table<PalletStandard, string>;
  automation!: Table<AutomationSystem, string>;
  scenarios!: Table<Scenario, string>;
  resultsCache!: Table<CacheEntry, string>;
  appMeta!: Table<AppMeta, string>;

  constructor() {
    super('DC_Sizing_Calc');
    this.version(1).stores({
      engagements: 'id, regionProfile, lastModifiedAt, status',
      skus: 'id, engagementId, category, &[engagementId+id]',
      racks: 'system_id, category',
      mhe: 'mhe_id, category',
      productivity: '++id, [method+unitType+slotType]',
      buildings: 'building_id, regionProfile',
      pallets: 'pallet_id',
      automation: 'system_id, category',
      scenarios: 'id, engagementId, isBaseline',
      resultsCache: 'hash, engagementId, scenarioId, createdAt',
      appMeta: 'key',
    });
  }
}

export const db = new DCDatabase();
