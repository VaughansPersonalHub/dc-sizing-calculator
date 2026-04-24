import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  RackSystem,
  MheClass,
  ProductivityCell,
  BuildingTemplate,
  PalletStandard,
  AutomationSystem,
} from '../schemas/libraries';
import { useEngineStore } from './engine.store';

interface Libraries {
  racks: RackSystem[];
  mhe: MheClass[];
  productivity: ProductivityCell[];
  buildings: BuildingTemplate[];
  pallets: PalletStandard[];
  automation: AutomationSystem[];
}

interface DataState {
  libraries: Libraries;
  skuCount: number;
  lastImportAt: Date | null;
  _libraryHash: string;
  setLibraries: (libs: Libraries) => void;
  setSkuCount: (n: number) => void;
  markImport: () => void;
  _invalidateEngine: () => void;
}

/**
 * djb2 hash over a stable JSON form of the library contents. Used by
 * engine.store to invalidate cached results when reference data changes.
 */
function hashLibraries(libs: Libraries): string {
  const s = JSON.stringify([
    libs.racks.map((r) => r.system_id).sort(),
    libs.mhe.map((r) => r.mhe_id).sort(),
    libs.productivity.length,
    libs.buildings.map((r) => r.building_id).sort(),
    libs.pallets.map((r) => r.pallet_id).sort(),
    libs.automation.map((r) => r.system_id).sort(),
  ]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export const useDataStore = create<DataState>()(
  immer((set, get) => ({
    libraries: { racks: [], mhe: [], productivity: [], buildings: [], pallets: [], automation: [] },
    skuCount: 0,
    lastImportAt: null,
    _libraryHash: '',
    setLibraries: (libs) =>
      set((s) => {
        s.libraries = libs;
        s._libraryHash = hashLibraries(libs);
      }),
    setSkuCount: (n) =>
      set((s) => {
        s.skuCount = n;
      }),
    markImport: () =>
      set((s) => {
        s.lastImportAt = new Date();
      }),
    _invalidateEngine: () => {
      // called by subscribers to flip engine cache
      useEngineStore.getState().invalidate(get()._libraryHash);
    },
  }))
);

// Cross-store: library changes invalidate engine cache.
useDataStore.subscribe((state, prev) => {
  if (state._libraryHash !== prev._libraryHash) {
    useEngineStore.getState().invalidate(state._libraryHash);
  }
});
