import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { automationRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { AutomationSystem } from '../../../../schemas/libraries';

const CATEGORIES = [
  'g2p_cubic',
  'g2p_shelf',
  'acr_case',
  'case_picking',
  'pallet_shuttle',
  'mini_load_asrs',
  'pallet_agv',
  'sortation',
] as const;

export function AutomationEditor() {
  const rows = useDataStore((s) => s.libraries.automation);

  const columns = useMemo<EditableColumn<AutomationSystem>[]>(
    () => [
      {
        accessorKey: 'system_id',
        header: 'System ID',
        meta: {
          kind: 'text',
          tooltip:
            'Stable identifier — referenced by Step 12 when an engagement picks an automation override.',
        },
      },
      { accessorKey: 'name', header: 'Name', meta: { kind: 'text', tooltip: 'Display name.' } },
      {
        accessorKey: 'category',
        header: 'Category',
        meta: {
          kind: 'select',
          options: CATEGORIES as readonly string[],
          tooltip:
            'g2p_cubic (AutoStore) / g2p_shelf (Geek+) / acr_case (HaiPick) / case_picking / pallet_shuttle / mini_load_asrs / pallet_agv / sortation. Drives Step 12 density math.',
        },
      },
      {
        id: 'supplier_refs',
        header: 'Suppliers',
        accessorFn: (r) => r.supplier_refs.join(', '),
        meta: {
          kind: 'readonly',
          tooltip:
            'Vendors offering this category. Chinese vendors (Geek+, HAI, Quicktron, Libiao) are first-class per the architecture decision.',
        },
      },
      {
        id: 'densityUnit',
        header: 'Density unit',
        accessorFn: (r) => r.typicalDensity.unit,
        meta: {
          kind: 'readonly',
          tooltip: 'Unit the density is denominated in: bins/m², pallets/m², totes/m², etc.',
        },
      },
      {
        id: 'densityValue',
        header: 'Density',
        accessorFn: (r) => r.typicalDensity.value,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Density value at the unit above. Step 12 multiplies this by zone area to size storage capacity.',
        },
      },
      {
        accessorKey: 'throughputPerRobotPerHour',
        header: 'Robot/hr',
        meta: {
          kind: 'number',
          align: 'right',
          step: 1,
          tooltip:
            'Throughput per robot per hour (lines / picks / cases). Drives Step 12 robot count to meet peak.',
        },
      },
      {
        accessorKey: 'throughputPerAislePerHour',
        header: 'Aisle/hr',
        meta: {
          kind: 'number',
          align: 'right',
          step: 1,
          tooltip:
            'Throughput per aisle per hour for aisle-bound systems (mini-load, pallet shuttle).',
        },
      },
      {
        accessorKey: 'throughputPerHour',
        header: 'Total/hr',
        meta: {
          kind: 'number',
          align: 'right',
          step: 1,
          tooltip:
            'System-level throughput cap (overrides robot/aisle when set — e.g. Libiao sorter).',
        },
      },
      {
        accessorKey: 'defaultPackingEfficiency',
        header: 'Pack eff',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.01,
          tooltip:
            'Packing efficiency (0-1) — utilisation of the theoretical density capacity. Conservative default 0.82.',
        },
      },
    ],
    []
  );

  return (
    <LibraryTable<AutomationSystem, string>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.system_id}
      onSave={(r) => automationRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => automationRepo.remove(id)}
      onResetToSeed={() => automationRepo.resetToSeed()}
      onAdd={() => newAutomationTemplate(rows)}
    />
  );
}

function newAutomationTemplate(rows: AutomationSystem[]): AutomationSystem {
  const id = nextId('custom_automation', rows.map((r) => r.system_id));
  return {
    system_id: id,
    name: 'New automation system',
    category: 'g2p_cubic',
    supplier_refs: [],
    typicalDensity: { unit: 'bins/m²', value: 100 },
    throughputPerRobotPerHour: 300,
    defaultPackingEfficiency: 0.82,
  };
}

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
