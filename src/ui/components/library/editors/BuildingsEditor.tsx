import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { buildingsRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { BuildingTemplate } from '../../../../schemas/libraries';
import type { RegionId } from '../../../../schemas/regional';

const REGIONS: readonly RegionId[] = ['KR', 'TW', 'VN', 'MY', 'SG', 'ID', 'custom'];

export function BuildingsEditor() {
  const rows = useDataStore((s) => s.libraries.buildings);

  // Building templates have ~50 nested fields. Phase 1 surfaces the
  // top-level "shape" — geometry, seismic summary, power — and leaves the
  // deep nested groups for a future drill-down editor.
  const columns = useMemo<EditableColumn<BuildingTemplate>[]>(
    () => [
      {
        accessorKey: 'building_id',
        header: 'ID',
        meta: { kind: 'text', tooltip: 'Stable identifier.' },
      },
      { accessorKey: 'name', header: 'Name', meta: { kind: 'text', tooltip: 'Display name.' } },
      {
        accessorKey: 'regionProfile',
        header: 'Region',
        meta: {
          kind: 'select',
          options: REGIONS as readonly string[],
          tooltip:
            'Regional bucket — drives default seismic / wind / plinth / halal / shift-pattern values when applied to an engagement.',
        },
      },
      {
        id: 'footprint',
        header: 'Footprint m²',
        accessorFn: (r) => r.envelope.totalFootprintM2,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip: 'Total building footprint (m²) — drives Step 11 envelope-fit gate.',
        },
      },
      {
        id: 'eavesM',
        header: 'Eaves m',
        accessorFn: (r) => r.clearHeights.eavesM,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Eaves clear height. Step 4.5 uses it to compute usable rack height (eaves − sprinkler clearance − bottom-beam).',
        },
      },
      {
        id: 'slabT',
        header: 'Slab t/m²',
        accessorFn: (r) => r.floor.slabLoadingTPerM2,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Slab uniform-load capacity (t/m²). Step 11 compares it to peak rack + MHE static load.',
        },
      },
      {
        id: 'seismicCat',
        header: 'Seismic cat',
        accessorFn: (r) => r.seismic.designCategory,
        meta: {
          kind: 'readonly',
          tooltip:
            'Design category (A=lowest, F=highest). Drives Step 4.6 allowable seismic mass and rack anchorage / bracing.',
        },
      },
      {
        id: 'windKmh',
        header: 'Wind km/h',
        accessorFn: (r) => r.typhoon.designWindSpeedKmh,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Design wind speed for cladding & roof. Phase 11 surfaces this as a typhoon-zone flag.',
        },
      },
      {
        id: 'plinthM',
        header: 'Plinth m',
        accessorFn: (r) => r.monsoon.plinthHeightM,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Plinth height above grade — monsoon flood resilience. Critical for VN / MY / ID sites in flood return zones.',
        },
      },
      {
        id: 'genKva',
        header: 'Backup kVA',
        accessorFn: (r) => r.power.backupGeneratorKva,
        meta: {
          kind: 'readonly',
          align: 'right',
          tooltip:
            'Backup-generator capacity. Must cover MHE charging + lighting + WMS + cold-chain. Mandatory in ID; advisory elsewhere.',
        },
      },
    ],
    []
  );

  return (
    <LibraryTable<BuildingTemplate, string>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.building_id}
      onSave={(r) => buildingsRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => buildingsRepo.remove(id)}
      onResetToSeed={() => buildingsRepo.resetToSeed()}
      onAdd={() => newBuildingTemplate(rows)}
      emptyMessage="No building templates — add one or reset to seed."
    />
  );
}

function newBuildingTemplate(rows: BuildingTemplate[]): BuildingTemplate {
  const id = nextId('custom_building', rows.map((r) => r.building_id));
  return {
    building_id: id,
    name: 'New building template',
    regionProfile: 'custom',
    envelope: {
      lengthM: 125,
      widthM: 80,
      totalFootprintM2: 10000,
      polygonVertices: null,
      obstacles: [],
    },
    site: { totalSiteM2: 18000, maxBuildingCoveragePct: 0.55, minYardM2: 3000 },
    clearHeights: { eavesM: 12, apexM: 14, sprinklerClearanceM: 1, usableRackM: 11 },
    columnGrid: { spacingXM: 12, spacingYM: 24, columnWidthMm: 500, pattern: 'regular_grid' },
    floor: {
      slabLoadingTPerM2: 5,
      flatnessClass: 'FM2',
      jointPattern: 'sawcut_6m',
      drainageSlopePct: 0.5,
      totalFloorAreaM2: 10000,
    },
    seismic: { designCategory: 'C', soilClass: 'B', importanceLevel: 2, allowableRatio: 0.8 },
    typhoon: { designWindSpeedKmh: 130, claddingRating: 'C2', roofAnchorageEnhanced: false },
    monsoon: { plinthHeightM: 0.3, floodReturnPeriodYears: 100, drainageCapacityMmPerHr: 100 },
    fire: {
      sprinklerClass: 'ESFR_K25',
      inRackSprinklers: false,
      egressTravelDistanceMaxM: 45,
      compartmentMaxM2: 4000,
    },
    docks: {
      existingDoorsInbound: 0,
      existingDoorsOutbound: 0,
      dockLevelerType: 'hydraulic',
      canopyDepthM: 6,
    },
    mezzanine: {
      available: false,
      tiers: 0,
      perTierSlabLoadKgPerM2: [],
      perTierClearHeightM: [],
      perTierMaxM2: [],
      goodsLiftCapacityKg: 0,
      goodsLiftCount: 0,
    },
    office: { existingM2: 0, mezzanineAvailable: false, mezzanineMaxM2: 0 },
    power: {
      gridReliabilityHoursPerDay: 24,
      backupGeneratorKva: 0,
      backupAutonomyHrs: 0,
      upsForWmsKva: 10,
    },
    coldChain: {
      ambientZoneM2: 10000,
      chilledZoneM2: 0,
      chilledSetpointC: 4,
      frozenZoneM2: 0,
      frozenSetpointC: -22,
      antechamberRequired: false,
      antechamberM2: 0,
      airlockRequired: false,
      dehumidificationAllowancePct: 0,
      insulationPanelMm: 100,
    },
    customsBonded: {
      required: false,
      holdAreaPct: 0,
      fencedCageM2: 0,
      dedicatedDockLane: false,
    },
  };
}

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
