import { db } from './schema';
import {
  RACK_SEEDS,
  MHE_SEEDS,
  PRODUCTIVITY_SEEDS,
  BUILDING_SEEDS,
  PALLET_SEEDS,
  AUTOMATION_SEEDS,
} from '../libraries';

/**
 * Seed the six reference libraries on first load. Idempotent — only writes
 * when the table is empty, so user edits are never clobbered. Version bumps
 * use a per-library _seedVersion key in appMeta for forced migration.
 */
export async function seedReferenceLibrariesIfEmpty(): Promise<void> {
  await db.transaction(
    'rw',
    [db.racks, db.mhe, db.productivity, db.buildings, db.pallets, db.automation, db.appMeta],
    async () => {
      const [rackCount, mheCount, prodCount, bldCount, palCount, autoCount] = await Promise.all([
        db.racks.count(),
        db.mhe.count(),
        db.productivity.count(),
        db.buildings.count(),
        db.pallets.count(),
        db.automation.count(),
      ]);

      if (rackCount === 0) await db.racks.bulkPut(RACK_SEEDS);
      if (mheCount === 0) await db.mhe.bulkPut(MHE_SEEDS);
      if (prodCount === 0) await db.productivity.bulkPut(PRODUCTIVITY_SEEDS);
      if (bldCount === 0) await db.buildings.bulkPut(BUILDING_SEEDS);
      if (palCount === 0) await db.pallets.bulkPut(PALLET_SEEDS);
      if (autoCount === 0) await db.automation.bulkPut(AUTOMATION_SEEDS);

      await db.appMeta.put({
        key: 'seed_version',
        value: { schema: 1, libraries: 'v0.1.0-seed', seededAt: new Date().toISOString() },
        updatedAt: new Date(),
      });
    }
  );
}

export async function isStorageAvailable(): Promise<boolean> {
  try {
    await db.open();
    await db.appMeta.put({ key: '__probe__', value: true, updatedAt: new Date() });
    await db.appMeta.delete('__probe__');
    return true;
  } catch {
    return false;
  }
}
