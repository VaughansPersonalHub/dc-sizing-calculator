import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { racksRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { RackSystem } from '../../../../schemas/libraries';

const DENSITY_OPTIONS = ['low', 'medium', 'high', 'very_high'] as const;

export function RacksEditor() {
  const rows = useDataStore((s) => s.libraries.racks);

  const columns = useMemo<EditableColumn<RackSystem>[]>(
    () => [
      {
        accessorKey: 'system_id',
        header: 'System ID',
        meta: {
          kind: 'text',
          tooltip: 'Stable identifier — referenced by SKU rack assignments and Step 4 bay calc.',
        },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { kind: 'text', tooltip: 'Display name shown across the engine output and exports.' },
      },
      {
        accessorKey: 'storageType',
        header: 'Storage',
        meta: {
          kind: 'text',
          tooltip:
            'Selective / drive-in / drive-thru / push-back / pallet-flow / VNA. Drives Step 4 alignment math and Step 5 zone density.',
        },
      },
      {
        accessorKey: 'densityRating',
        header: 'Density',
        meta: {
          kind: 'select',
          options: DENSITY_OPTIONS,
          tooltip:
            'Heuristic density class: low (selective) → very_high (VNA, pallet-flow). Ranks options when multiple racks could serve a zone.',
        },
      },
      {
        id: 'bay',
        header: 'Bay W×D×H (mm)',
        accessorFn: (r) => `${r.bay.widthMm}×${r.bay.depthMm}×${r.bay.heightMmDefault}`,
        meta: {
          kind: 'readonly',
          tooltip:
            'Bay outer dimensions. Width drives slots/bay; depth = single- vs double-deep; height defines the structural rack envelope.',
        },
      },
      {
        accessorKey: 'slotsPerBay',
        header: 'Slots/bay',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip:
            'Pallet positions per bay. Selective = 2; deep-lane = 1; pallet-flow = lane-depth.',
        },
      },
      {
        accessorKey: 'levelsDefault',
        header: 'Levels',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip:
            'Default vertical rack levels. Step 4.5 may shrink this if usable clear height is insufficient.',
        },
      },
      {
        id: 'perLevelKg',
        header: 'Load/level kg',
        accessorFn: (r) => r.load.perLevelKg,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Maximum uniform load per beam pair (kg). Combined with rack count, feeds Step 4.6 seismic-mass check.',
        },
      },
      {
        accessorKey: 'structuralBayBlock',
        header: 'Bay block',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip:
            'Structural sub-block size — bays before a structural break. Used in Step 5 layout alignment.',
        },
      },
      {
        accessorKey: 'costPerPalletPositionUsd',
        header: '$ / position',
        meta: {
          kind: 'number',
          align: 'right',
          step: 1,
          tooltip:
            'Indicative installed cost per pallet position (USD). Informational — wired into the X.1 costing module when that scope is unlocked.',
        },
      },
    ],
    []
  );

  return (
    <LibraryTable<RackSystem, string>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.system_id}
      onSave={(r) => racksRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => racksRepo.remove(id)}
      onResetToSeed={() => racksRepo.resetToSeed()}
      onAdd={() => newRackTemplate(rows)}
    />
  );
}

function newRackTemplate(rows: RackSystem[]): RackSystem {
  const id = nextId('custom_rack', rows.map((r) => r.system_id));
  return {
    system_id: id,
    name: 'New rack system',
    category: 'pallet_racking',
    supplier_refs: [],
    bay: {
      widthMm: 2400,
      depthMm: 1100,
      heightMmDefault: 9000,
      heightMmRange: [3000, 12000],
    },
    slotsPerBay: 2,
    levelsDefault: 5,
    load: { perLevelKg: 2000, maxLoadPerBeamPairKg: 3000, maxSinglePalletKg: 1500 },
    aisle: { widthMmMin: 2800, widthMmDefault: 3000, crossAisleMm: 3500 },
    flueSpace: { transverseMm: 150, longitudinalMm: 300 },
    bottomBeamClearanceMm: 150,
    beamThicknessMm: 100,
    minPresentationPallets: 2,
    honeycombing: { verticalFactor: 0.92, horizontalDefault: 0.88 },
    fillFactor: 0.95,
    slotVolumeM3: 1.32,
    slotTypeCompat: ['PFP'],
    storageType: 'selective',
    densityRating: 'low',
    seismic: {
      designCategory: 'C',
      soilClassRating: 'B',
      importanceLevel: 2,
      anchorageRequired: true,
      bracingPattern: '2-bay',
    },
    structuralBayBlock: 3,
    rackMassKgPerPosition: 45,
    costPerPalletPositionUsd: 80,
  };
}

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
