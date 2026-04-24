// Repository layer over Dexie. The UI calls these to mutate reference
// libraries; engine/workers never import Dexie directly. Each repository
// knows three things: how to read, how to upsert by primary key, and how
// to reset the whole table back to its seed.

import { db } from '../schema';
import {
  RACK_SEEDS,
  MHE_SEEDS,
  PRODUCTIVITY_SEEDS,
  BUILDING_SEEDS,
  PALLET_SEEDS,
  AUTOMATION_SEEDS,
} from '../../libraries';
import type {
  RackSystem,
  MheClass,
  ProductivityCell,
  BuildingTemplate,
  PalletStandard,
  AutomationSystem,
} from '../../schemas/libraries';
import { useDataStore } from '../../stores/data.store';

export interface Repository<T, K extends string | number> {
  list(): Promise<T[]>;
  upsert(row: T): Promise<K>;
  remove(id: K): Promise<void>;
  resetToSeed(): Promise<void>;
}

/**
 * After any write, pull the full library from Dexie and push it into
 * data.store. The store's library hash subscriber invalidates the engine
 * cache for free when hashes change.
 */
async function refreshDataStore(): Promise<void> {
  const [racks, mhe, productivity, buildings, pallets, automation] = await Promise.all([
    db.racks.toArray(),
    db.mhe.toArray(),
    db.productivity.toArray(),
    db.buildings.toArray(),
    db.pallets.toArray(),
    db.automation.toArray(),
  ]);
  useDataStore.getState().setLibraries({ racks, mhe, productivity, buildings, pallets, automation });
}

export const racksRepo: Repository<RackSystem, string> = {
  async list() {
    return db.racks.toArray();
  },
  async upsert(row) {
    const id = (await db.racks.put(row)) as string;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.racks.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.racks, async () => {
      await db.racks.clear();
      await db.racks.bulkPut(RACK_SEEDS);
    });
    await refreshDataStore();
  },
};

export const mheRepo: Repository<MheClass, string> = {
  async list() {
    return db.mhe.toArray();
  },
  async upsert(row) {
    const id = (await db.mhe.put(row)) as string;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.mhe.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.mhe, async () => {
      await db.mhe.clear();
      await db.mhe.bulkPut(MHE_SEEDS);
    });
    await refreshDataStore();
  },
};

export const productivityRepo: Repository<ProductivityCell, number> = {
  async list() {
    return db.productivity.toArray();
  },
  async upsert(row) {
    // ++id primary key — omitting id inserts a new row, providing one updates.
    const id = (await db.productivity.put(row)) as number;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.productivity.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.productivity, async () => {
      await db.productivity.clear();
      await db.productivity.bulkPut(PRODUCTIVITY_SEEDS);
    });
    await refreshDataStore();
  },
};

export const buildingsRepo: Repository<BuildingTemplate, string> = {
  async list() {
    return db.buildings.toArray();
  },
  async upsert(row) {
    const id = (await db.buildings.put(row)) as string;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.buildings.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.buildings, async () => {
      await db.buildings.clear();
      await db.buildings.bulkPut(BUILDING_SEEDS);
    });
    await refreshDataStore();
  },
};

export const palletsRepo: Repository<PalletStandard, string> = {
  async list() {
    return db.pallets.toArray();
  },
  async upsert(row) {
    const id = (await db.pallets.put(row)) as string;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.pallets.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.pallets, async () => {
      await db.pallets.clear();
      await db.pallets.bulkPut(PALLET_SEEDS);
    });
    await refreshDataStore();
  },
};

export const automationRepo: Repository<AutomationSystem, string> = {
  async list() {
    return db.automation.toArray();
  },
  async upsert(row) {
    const id = (await db.automation.put(row)) as string;
    await refreshDataStore();
    return id;
  },
  async remove(id) {
    await db.automation.delete(id);
    await refreshDataStore();
  },
  async resetToSeed() {
    await db.transaction('rw', db.automation, async () => {
      await db.automation.clear();
      await db.automation.bulkPut(AUTOMATION_SEEDS);
    });
    await refreshDataStore();
  },
};
