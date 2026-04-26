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
      {
        accessorKey: 'method',
        header: 'Method',
        meta: {
          kind: 'text',
          tooltip:
            'Operation name (eg pick_pfp_b2b, putaway_reserve). Step 7 looks up the matching cell per task.',
        },
      },
      {
        accessorKey: 'unitType',
        header: 'Unit type',
        meta: {
          kind: 'text',
          tooltip: 'line / case / unit / pallet — what the rate is denominated in.',
        },
      },
      {
        accessorKey: 'slotType',
        header: 'Slot',
        meta: {
          kind: 'text',
          tooltip: 'PFP / CLS / Shelf / VNA / G2P_port — slot type the rate applies to.',
        },
      },
      {
        accessorKey: 'staticTimeSecPerUnit',
        header: 'Static s/unit',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.1,
          tooltip:
            'Static cycle time per unit (sec): pick + scan + label + drop. Excludes travel — that is added by the travel model.',
        },
      },
      {
        accessorKey: 'travelModelType',
        header: 'Travel model',
        meta: {
          kind: 'select',
          options: TRAVEL_MODELS,
          tooltip:
            'sqrt_area (free roam) / sequential_hv (H+V) / shuttle_cycle / crane_cycle / g2p_port (zero) / amr_fleet / zero. Drives the travel-time formula in Step 7.',
        },
      },
      {
        accessorKey: 'travelCoefficient',
        header: 'Travel coef',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.01,
          tooltip:
            'Multiplier applied to the travel formula — region or operator calibration knob (eg ANZ floors slower than benchmark).',
        },
      },
      {
        accessorKey: 'baselineZoneAreaM2',
        header: 'Baseline m²',
        meta: {
          kind: 'number',
          align: 'right',
          tooltip: 'Reference zone area (m²) the rate is calibrated against.',
        },
      },
      {
        accessorKey: 'derivedRateAtBaseline',
        header: 'Rate @ baseline',
        meta: {
          kind: 'number',
          align: 'right',
          step: 0.1,
          tooltip:
            'Output rate (units/hour) when the zone matches the baseline area. Step 7 scales this by the travel model.',
        },
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        meta: {
          kind: 'select',
          options: CONFIDENCE,
          tooltip:
            'heuristic (WERC default) / validated (industry-published) / engagement_calibrated (measured on-site). Drives trust signals in calibration warnings (Phase 10.6).',
        },
      },
      {
        accessorKey: 'source',
        header: 'Source',
        meta: {
          kind: 'text',
          tooltip: 'Reference: WERC, MTM-2, internal calibration, engagement audit.',
        },
      },
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
