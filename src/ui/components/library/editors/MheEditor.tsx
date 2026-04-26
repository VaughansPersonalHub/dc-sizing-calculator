import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { mheRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { MheClass } from '../../../../schemas/libraries';

const BATTERY_OPTIONS = ['lead_acid_swap', 'lithium_opportunity', 'fuel_cell', 'none'] as const;

export function MheEditor() {
  const rows = useDataStore((s) => s.libraries.mhe);

  const columns = useMemo<EditableColumn<MheClass>[]>(
    () => [
      {
        accessorKey: 'mhe_id',
        header: 'MHE ID',
        meta: { kind: 'text', tooltip: 'Stable identifier referenced by Step 8 fleet sizing.' },
      },
      { accessorKey: 'name', header: 'Name', meta: { kind: 'text', tooltip: 'Display name.' } },
      {
        accessorKey: 'category',
        header: 'Category',
        meta: {
          kind: 'text',
          tooltip:
            'forklift / reach / VNA turret / order picker / pallet jack / AMR / AGV. Drives travel-model selection in Step 7.',
        },
      },
      {
        accessorKey: 'aisleWidthMmMin',
        header: 'Aisle min (mm)',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip:
            'Minimum operable aisle width. Step 5 will reject zone layouts that violate this against the rack profile.',
        },
      },
      {
        accessorKey: 'aisleWidthMmDefault',
        header: 'Aisle default (mm)',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip: 'Recommended aisle width — Step 5 baseline alignment.',
        },
      },
      {
        accessorKey: 'liftHeightMmMax',
        header: 'Lift max (mm)',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip:
            'Maximum lift height. Caps the rack levels this MHE can serve; combined with Step 4.5 clear height.',
        },
      },
      {
        accessorKey: 'travelSpeedKph',
        header: 'Travel kph',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.1,
          tooltip:
            'Maximum laden travel speed. Drives the horizontal component of the Step 7 travel-time model.',
        },
      },
      {
        accessorKey: 'liftSpeedMpm',
        header: 'Lift m/min',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.1,
          tooltip:
            'Lift speed (laden, m/min). Drives the vertical component of the Step 7 travel-time model.',
        },
      },
      {
        id: 'battery',
        header: 'Battery',
        accessorFn: (r) => r.battery.type,
        meta: {
          kind: 'readonly',
          tooltip:
            'lead-acid swap / lithium opportunity / fuel cell / none. Drives Step 8 charging area & kVA roll-up.',
        },
      },
      {
        accessorKey: 'utilisationTargetDefault',
        header: 'Util target',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.01,
          tooltip:
            'Target utilisation (0-1). Step 8 sizes fleet so peak demand stays under this. Lower = more units, more redundancy.',
        },
      },
    ],
    []
  );

  return (
    <LibraryTable<MheClass, string>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.mhe_id}
      onSave={(r) => mheRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => mheRepo.remove(id)}
      onResetToSeed={() => mheRepo.resetToSeed()}
      onAdd={() => newMheTemplate(rows)}
    />
  );
}

function newMheTemplate(rows: MheClass[]): MheClass {
  const id = nextId('custom_mhe', rows.map((r) => r.mhe_id));
  return {
    mhe_id: id,
    name: 'New MHE class',
    category: 'forklift',
    aisleWidthMmMin: 3000,
    aisleWidthMmDefault: 3500,
    aisleTransferWidthMm: 0,
    endOfAisleTurnaroundMm: 0,
    liftHeightMmMax: 6000,
    travelSpeedKph: 12,
    liftSpeedMpm: 25,
    battery: {
      type: BATTERY_OPTIONS[1],
      chargingFootprintM2PerUnit: 6,
      swapStationM2: 0,
      chargingKva: 8,
    },
    utilisationTargetDefault: 0.72,
    usefulLifeYears: 8,
  };
}

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
