import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { productivityRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { ProductivityCell } from '../../../../schemas/libraries';

const TRAVEL_MODELS = [
  'sqrt_area',
  'sequential_hv',
  'shuttle_cycle',
  'crane_cycle',
  'g2p_port',
  'amr_fleet',
  'zero',
] as const;

const CONFIDENCE = ['heuristic', 'validated', 'engagement_calibrated'] as const;

export function ProductivityEditor() {
  const rows = useDataStore((s) => s.libraries.productivity);

  const columns = useMemo<EditableColumn<ProductivityCell>[]>(
    () => [
      { accessorKey: 'method', header: 'Method', meta: { kind: 'text' } },
      { accessorKey: 'unitType', header: 'Unit type', meta: { kind: 'text' } },
      { accessorKey: 'slotType', header: 'Slot', meta: { kind: 'text' } },
      {
        accessorKey: 'staticTimeSecPerUnit',
        header: 'Static s/unit',
        meta: { kind: 'number', align: 'right', step: 0.1 },
      },
      {
        accessorKey: 'travelModelType',
        header: 'Travel model',
        meta: { kind: 'select', options: TRAVEL_MODELS },
      },
      {
        accessorKey: 'travelCoefficient',
        header: 'Travel coef',
        meta: { kind: 'number', align: 'right', step: 0.01 },
      },
      {
        accessorKey: 'baselineZoneAreaM2',
        header: 'Baseline m²',
        meta: { kind: 'number', align: 'right' },
      },
      {
        accessorKey: 'derivedRateAtBaseline',
        header: 'Rate @ baseline',
        meta: { kind: 'number', align: 'right', step: 0.1 },
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        meta: { kind: 'select', options: CONFIDENCE },
      },
      { accessorKey: 'source', header: 'Source', meta: { kind: 'text' } },
    ],
    []
  );

  return (
    <LibraryTable<ProductivityCell, number>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id ?? -1}
      onSave={(r) => productivityRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => (id >= 0 ? productivityRepo.remove(id) : Promise.resolve())}
      onResetToSeed={() => productivityRepo.resetToSeed()}
      onAdd={() => newProductivityTemplate()}
      deletable={(r) => typeof r.id === 'number' && r.id >= 0}
    />
  );
}

function newProductivityTemplate(): ProductivityCell {
  return {
    method: 'new_method',
    unitType: 'case',
    slotType: 'PFP',
    staticTimeSecPerUnit: 8,
    travelModelType: 'sqrt_area',
    travelCoefficient: 1.0,
    baselineZoneAreaM2: 2000,
    derivedRateAtBaseline: 120,
    source: 'custom',
    confidence: 'heuristic',
    engagementOverrides: {},
  };
}
