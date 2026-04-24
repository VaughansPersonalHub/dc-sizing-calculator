import type { BuildingTemplate } from '../schemas/libraries';
import { REGIONAL_PROFILES } from '../regional/profiles';
import type { RegionId } from '../schemas/regional';

/**
 * One representative template per region. Users can duplicate + tune, or
 * upload a real envelope in the Reference tab.
 */
function makeTemplate(region: Exclude<RegionId, 'custom'>, name: string, overrides: Partial<BuildingTemplate> = {}): BuildingTemplate {
  const r = REGIONAL_PROFILES[region];
  return {
    building_id: `standard_shed_10k_${region.toLowerCase()}`,
    name,
    regionProfile: region,
    envelope: { lengthM: 125, widthM: 80, totalFootprintM2: 10000, polygonVertices: null, obstacles: [] },
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
    seismic: {
      designCategory: r.seismicDesignCategory,
      soilClass: r.seismicSoilClass,
      importanceLevel: 2,
      allowableRatio: 0.8,
    },
    typhoon: {
      designWindSpeedKmh: r.typhoonDesignWindKmh,
      claddingRating: r.typhoonDesignWindKmh >= 200 ? 'C3' : 'C2',
      roofAnchorageEnhanced: r.typhoonDesignWindKmh >= 200,
    },
    monsoon: {
      plinthHeightM: r.floodPlinthHeightM,
      floodReturnPeriodYears: 100,
      drainageCapacityMmPerHr: r.monsoonDrainageMmPerHr,
    },
    fire: {
      sprinklerClass: 'ESFR_K25',
      inRackSprinklers: false,
      egressTravelDistanceMaxM: 45,
      compartmentMaxM2: 4000,
    },
    docks: { existingDoorsInbound: 0, existingDoorsOutbound: 0, dockLevelerType: 'hydraulic', canopyDepthM: 6 },
    mezzanine: {
      available: true,
      tiers: r.tieredMezzanineCommon === 'Yes (3-tier)' ? 3 : 2,
      perTierSlabLoadKgPerM2: [500, 350, 250],
      perTierClearHeightM: [4.0, 3.5, 3.0],
      perTierMaxM2: [1200, 900, 600],
      goodsLiftCapacityKg: 2000,
      goodsLiftCount: 2,
    },
    office: { existingM2: 0, mezzanineAvailable: true, mezzanineMaxM2: 1200 },
    power: {
      gridReliabilityHoursPerDay: r.gridReliabilityHoursPerDay,
      backupGeneratorKva: r.backupGeneratorMandatory ? 750 : 500,
      backupAutonomyHrs: r.backupGeneratorMandatory ? 12 : 8,
      upsForWmsKva: 20,
    },
    coldChain: {
      ambientZoneM2: 8000, chilledZoneM2: 600, chilledSetpointC: 2,
      frozenZoneM2: 200, frozenSetpointC: -22,
      antechamberRequired: r.coldChainAntechamberRequired,
      antechamberM2: r.coldChainAntechamberRequired ? 30 : 0,
      airlockRequired: r.coldChainAntechamberRequired,
      dehumidificationAllowancePct: r.dehumidificationAllowancePct,
      insulationPanelMm: 150,
    },
    customsBonded: {
      required: r.customsBondedCommon === 'High',
      holdAreaPct: 0.03,
      fencedCageM2: 0,
      dedicatedDockLane: false,
    },
    notes: `Default ${r.label} greenfield template — concept sizing.`,
    ...overrides,
  };
}

export const BUILDING_SEEDS: BuildingTemplate[] = [
  makeTemplate('KR', 'Korea — 10k m² greenfield'),
  makeTemplate('TW', 'Taiwan — 10k m² greenfield (high seismic)'),
  makeTemplate('VN', 'Vietnam — 10k m² greenfield (bonded-capable)'),
  makeTemplate('MY', 'Malaysia — 10k m² greenfield (halal-capable)'),
  makeTemplate('SG', 'Singapore — 10k m² (SCDF compliant, 20m cross-aisle)', {
    clearHeights: { eavesM: 13, apexM: 15, sprinklerClearanceM: 1, usableRackM: 12 },
  }),
  makeTemplate('ID', 'Indonesia — 10k m² greenfield (seismic D-E)'),
];
