// Exercises the Phase 1 write-through flow at the store layer: when a
// repository pushes an updated library list into `data.store`, the
// library hash must change AND `engine.store.invalidate` must fire with
// the new hash. This is what unblocks the engine to recompute after
// reference edits — a silent regression here would make edits look like
// they persisted but produce stale calcs.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDataStore } from '../../src/stores/data.store';
import { useEngineStore } from '../../src/stores/engine.store';
import { RACK_SEEDS } from '../../src/libraries/racks.seed';
import { MHE_SEEDS } from '../../src/libraries/mhe.seed';
import { PRODUCTIVITY_SEEDS } from '../../src/libraries/productivity.seed';
import { BUILDING_SEEDS } from '../../src/libraries/buildings.seed';
import { PALLET_SEEDS } from '../../src/libraries/pallets.seed';
import { AUTOMATION_SEEDS } from '../../src/libraries/automation.seed';

function baseline() {
  return {
    racks: [...RACK_SEEDS],
    mhe: [...MHE_SEEDS],
    productivity: [...PRODUCTIVITY_SEEDS],
    buildings: [...BUILDING_SEEDS],
    pallets: [...PALLET_SEEDS],
    automation: [...AUTOMATION_SEEDS],
  };
}

describe('data.store → engine invalidation on library edit', () => {
  beforeEach(() => {
    useDataStore.setState({
      libraries: { racks: [], mhe: [], productivity: [], buildings: [], pallets: [], automation: [] },
      _libraryHash: '',
    });
  });

  it('computes a stable hash for identical library contents', () => {
    useDataStore.getState().setLibraries(baseline());
    const h1 = useDataStore.getState()._libraryHash;
    useDataStore.getState().setLibraries(baseline());
    const h2 = useDataStore.getState()._libraryHash;
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(0);
  });

  it('changes the hash when a rack is added', () => {
    useDataStore.getState().setLibraries(baseline());
    const before = useDataStore.getState()._libraryHash;
    const libs = baseline();
    libs.racks.push({
      ...RACK_SEEDS[0],
      system_id: 'custom_rack_1',
      name: 'New',
    });
    useDataStore.getState().setLibraries(libs);
    const after = useDataStore.getState()._libraryHash;
    expect(after).not.toBe(before);
  });

  it('fires engine.invalidate with the new hash on library change', () => {
    const seen: string[] = [];
    const engine = useEngineStore.getState();
    const originalInvalidate = engine.invalidate;
    useEngineStore.setState({
      invalidate: (hash: string) => {
        seen.push(hash);
        originalInvalidate(hash);
      },
    });
    try {
      useDataStore.getState().setLibraries(baseline());
      const h1 = useDataStore.getState()._libraryHash;
      const libs = baseline();
      libs.pallets.push({
        ...PALLET_SEEDS[0],
        pallet_id: 'custom_pallet_1',
      });
      useDataStore.getState().setLibraries(libs);
      const h2 = useDataStore.getState()._libraryHash;
      expect(seen).toContain(h1);
      expect(seen).toContain(h2);
      expect(h1).not.toBe(h2);
    } finally {
      useEngineStore.setState({ invalidate: originalInvalidate });
    }
  });
});
