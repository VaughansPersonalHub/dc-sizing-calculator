// Shared helper that turns an engagement id (+ Dexie + Zustand state) into
// a PipelineInputs payload + skuIds + demand Float32Array. Used by the
// single-shot engine runner and the tornado runner.
//
// Everything in this module is JSON-clone-safe so it can be posted to
// engine workers directly.

import { db } from '../db/schema';
import { useDataStore } from '../stores/data.store';
import { REGIONAL_PROFILES } from '../regional/profiles';
import type {
  EngineSku,
  EngineOpsProfile,
  EngineMheClass,
  EngineProductivityCell,
  EngineRegionalContext,
  EngineAutomationSystem,
} from './models';
import type { PipelineInputs } from './pipeline';
import type { OpsProfile } from '../schemas/scenario';
import type { SkuRecord } from '../schemas/sku';
import type {
  RackSystem,
  PalletStandard,
  BuildingTemplate,
  MheClass,
  ProductivityCell,
  AutomationSystem,
} from '../schemas/libraries';
import type { RegionId } from '../schemas/regional';

export interface BuildEngineInputsResult {
  inputs: PipelineInputs;
  skuIds: string[];
  demand: Float32Array;
}

export interface BuildEngineInputsOptions {
  engagementId: string;
  buildingTemplateId?: string;
}

export async function buildEngineInputs(
  opts: BuildEngineInputsOptions
): Promise<BuildEngineInputsResult> {
  const dataStore = useDataStore.getState();

  const [engagement, skuRows, opsProfile] = await Promise.all([
    db.engagements.get(opts.engagementId),
    db.skus.where('engagementId').equals(opts.engagementId).toArray(),
    db.opsProfiles.get(opts.engagementId),
  ]);
  if (!engagement) throw new Error(`engagement ${opts.engagementId} not found in Dexie`);
  if (!opsProfile)
    throw new Error(`no OpsProfile for engagement ${opts.engagementId}. Re-run the setup wizard.`);
  if (skuRows.length === 0)
    throw new Error('no SKUs imported yet. Use the Inputs tab to upload a CSV first.');

  const racks = dataStore.libraries.racks;
  const pallets = dataStore.libraries.pallets;
  const buildings = dataStore.libraries.buildings;
  const mhe = dataStore.libraries.mhe;
  const productivity = dataStore.libraries.productivity;
  const automation = dataStore.libraries.automation;
  if (racks.length === 0) throw new Error('rack library is empty');
  if (pallets.length === 0) throw new Error('pallet library is empty');
  if (mhe.length === 0) throw new Error('MHE library is empty');
  if (productivity.length === 0) throw new Error('productivity library is empty');

  const building =
    buildings.find((b) => b.building_id === opts.buildingTemplateId) ??
    buildings.find((b) => b.regionProfile === engagement.regionProfile) ??
    buildings[0];
  if (!building) throw new Error('building library is empty');

  const skuIds = skuRows.map((s) => s.id);
  const demand = new Float32Array(skuRows.length * 52);
  for (let i = 0; i < skuRows.length; i++) {
    const row = skuRows[i];
    for (let w = 0; w < 52; w++) demand[i * 52 + w] = row.weeklyUnits[w] ?? 0;
  }

  const inputs: PipelineInputs = {
    skus: skuRows.map((s) => ({
      ...toEngineSkuMeta(s),
      // PipelineInputs needs weeklyUnits, but the worker payload reads them
      // from the demandBuffer instead. The single-shot runner posts the
      // skus array stripped of weeklyUnits via JSON; the tornado runner
      // calls runPipeline locally with the live Float32Array.
      weeklyUnits: new Float32Array(s.weeklyUnits ?? new Array(52).fill(0)),
    })),
    opsProfile: toEngineOpsProfile(opsProfile),
    pallets: pallets.map(toEnginePallet),
    racks: racks.map(toEngineRack),
    envelope: toEngineEnvelope(building),
    productivity: productivity.map(toEngineProductivityCell),
    mheLibrary: mhe.map(toEngineMheClass),
    automationLibrary: automation.map(toEngineAutomationSystem),
    regional: toEngineRegionalContext(engagement.regionProfile),
    halalRequired: engagement.halalCertifiedRequired,
    isBonded: engagement.isBonded,
    vnaSelected: false,
  };

  return { inputs, skuIds, demand };
}

// ===========================================================================
// Schema → Engine adapters. These are pure and idempotent — the only
// callers should be buildEngineInputs() and the tornado runner. Kept here
// (not in runner.ts) so they survive an eventual runner refactor.
// ===========================================================================

export function toEngineSkuMeta(s: SkuRecord): Omit<EngineSku, 'weeklyUnits'> {
  return {
    id: s.id,
    category: s.category,
    subCategory: s.subCategory,
    weeksOnFile: s.weeksOnFile,
    unitCubeCm3: s.unitCubeCm3,
    unitWeightKg: s.unitWeightKg,
    caseQty: s.caseQty,
    inboundPalletId: s.inboundPalletId,
    outboundPalletId: s.outboundPalletId,
    palletTi: s.palletTi,
    palletHi: s.palletHi,
    stackable: s.stackable,
    tempClass: s.tempClass,
    halalStatus: s.halalStatus,
    channelMix: s.channelMix,
    slotTypeOverride: s.slotTypeOverride,
    velocityOverride: s.velocityOverride,
  };
}

export function toEngineOpsProfile(p: OpsProfile): EngineOpsProfile {
  return {
    operatingDaysPerYear: p.operatingDaysPerYear,
    productivityFactor: p.productivityFactor,
    productiveHoursPerDay: p.productiveHoursPerDay ?? 18,
    shiftsPerDay: p.shiftsPerDay,
    hoursPerShift: p.hoursPerShift,
    peakUplift: p.peakUplift,
    sigmaStorage: p.sigmaStorage,
    percentileDocks: p.percentileDocks,
    percentileStaging: p.percentileStaging,
    absenteeismPct: p.absenteeismPct,
    leaveFraction: p.leaveFraction,
    sickReliefPct: p.sickReliefPct,
    horizontalHoneycombingFactor: p.horizontalHoneycombingFactor,
    gridEfficiencyThreshold: p.gridEfficiencyThreshold,
    preferredAspectRatio: p.preferredAspectRatio,
    skuPeakCorrelationCoefficient: p.skuPeakCorrelationCoefficient,
    floorloadPalletisationYield: p.floorloadPalletisationYield,
    dsohDays: p.dsohDays,
    forwardFaceDsohDays: p.forwardFaceDsohDays,
    dsohChangeByVelocity: p.dsohChangeByVelocity,
    paretoBreakpoints: p.paretoBreakpoints,
    replenTriggerDays: p.replenTriggerDays,
    clsLaneFillFactor: p.clsLaneFillFactor,
    crossAisleSpacingM: p.crossAisleSpacingM,
    crossAisleWidthM: p.crossAisleWidthM,
    canopyAllowancePct: p.canopyAllowancePct,
    canopyType: p.canopyType,
    canopyOverhangM: p.canopyOverhangM,
    canopyCoverageExemptMaxM: p.canopyCoverageExemptMaxM,
    maxSiteCoverage: p.maxSiteCoverage,
    phase2HorizontalPct: p.phase2HorizontalPct,
    phase2VerticalPct: p.phase2VerticalPct,
    softSpacePct: p.softSpacePct,
    clearHeightMm: p.clearHeightMm,
    ordersPerBatch: p.ordersPerBatch,
    repackSecPerPallet: p.repackSecPerPallet,
    repackSecPerUnit: p.repackSecPerUnit,
    adminFte: p.adminFte,
    supervisorFte: p.supervisorFte,
    totalStaff: p.totalStaff,
    vasBenches: p.vasBenches,
    returnsRatePct: p.returnsRatePct,
    returnsHandleTimeHours: p.returnsHandleTimeHours,
    qcSampleRate: p.qcSampleRate,
    qcDwellHours: p.qcDwellHours,
    avgDgSkuFootprintM2: p.avgDgSkuFootprintM2,
    dgMultiplier: p.dgMultiplier,
    packerThroughput: p.packerThroughput,
    amenitiesArea: p.amenitiesArea,
    trainingAreaM2: p.trainingAreaM2,
    firstAidAreaM2: p.firstAidAreaM2,
    palletFootprintM2: p.palletFootprintM2,
  };
}

export function toEnginePallet(p: PalletStandard) {
  return { pallet_id: p.pallet_id, dimensionsMm: p.dimensionsMm, maxLoadKg: p.maxLoadKg };
}

export function toEngineRack(r: RackSystem) {
  return {
    system_id: r.system_id,
    bay: { widthMm: r.bay.widthMm, depthMm: r.bay.depthMm, heightMmDefault: r.bay.heightMmDefault },
    slotsPerBay: r.slotsPerBay,
    levelsDefault: r.levelsDefault,
    load: r.load,
    aisle: { widthMmMin: r.aisle.widthMmMin, widthMmDefault: r.aisle.widthMmDefault, crossAisleMm: r.aisle.crossAisleMm },
    flueSpace: r.flueSpace,
    bottomBeamClearanceMm: r.bottomBeamClearanceMm,
    beamThicknessMm: r.beamThicknessMm,
    honeycombing: r.honeycombing,
    fillFactor: r.fillFactor,
    slotTypeCompat: r.slotTypeCompat,
    densityRating: r.densityRating,
    structuralBayBlock: r.structuralBayBlock,
    rackMassKgPerPosition: r.rackMassKgPerPosition,
  };
}

export function toEngineEnvelope(b: BuildingTemplate) {
  return {
    envelope: { lengthM: b.envelope.lengthM, widthM: b.envelope.widthM },
    clearHeights: { usableRackM: b.clearHeights.usableRackM, sprinklerClearanceM: b.clearHeights.sprinklerClearanceM },
    floor: { slabLoadingTPerM2: b.floor.slabLoadingTPerM2, totalFloorAreaM2: b.floor.totalFloorAreaM2 },
    seismic: { designCategory: b.seismic.designCategory, allowableRatio: b.seismic.allowableRatio },
    columnGrid: { spacingXM: b.columnGrid.spacingXM, spacingYM: b.columnGrid.spacingYM },
    coldChain: {
      ambientZoneM2: b.coldChain.ambientZoneM2,
      chilledZoneM2: b.coldChain.chilledZoneM2,
      frozenZoneM2: b.coldChain.frozenZoneM2,
      antechamberRequired: b.coldChain.antechamberRequired,
      antechamberM2: b.coldChain.antechamberM2,
    },
    customsBonded: { required: b.customsBonded.required, holdAreaPct: b.customsBonded.holdAreaPct, fencedCageM2: b.customsBonded.fencedCageM2 },
    mezzanine: { available: b.mezzanine.available, tiers: b.mezzanine.tiers, perTierMaxM2: b.mezzanine.perTierMaxM2 },
    power: { backupGeneratorKva: b.power.backupGeneratorKva, gridReliabilityHoursPerDay: b.power.gridReliabilityHoursPerDay },
  };
}

export function toEngineProductivityCell(c: ProductivityCell): EngineProductivityCell {
  return {
    method: c.method,
    unitType: c.unitType,
    slotType: c.slotType,
    staticTimeSecPerUnit: c.staticTimeSecPerUnit,
    travelModelType: c.travelModelType,
    travelCoefficient: c.travelCoefficient,
    baselineZoneAreaM2: c.baselineZoneAreaM2,
    derivedRateAtBaseline: c.derivedRateAtBaseline,
    vnaLiftSpeedMpm: c.vnaLiftSpeedMpm,
    shuttleTransferSec: c.shuttleTransferSec,
    craneHorizontalSpeedMps: c.craneHorizontalSpeedMps,
    craneLiftSpeedMps: c.craneLiftSpeedMps,
    pickDepositSec: c.pickDepositSec,
    g2pPortWalkDistanceM: c.g2pPortWalkDistanceM,
  };
}

export function toEngineMheClass(m: MheClass): EngineMheClass {
  return {
    mhe_id: m.mhe_id,
    category: m.category,
    travelSpeedKph: m.travelSpeedKph,
    liftSpeedMpm: m.liftSpeedMpm,
    liftHeightMmMax: m.liftHeightMmMax,
    battery: m.battery,
    utilisationTargetDefault: m.utilisationTargetDefault,
    ratePerTaskPerHour: m.ratePerTaskPerHour,
  };
}

export function toEngineAutomationSystem(a: AutomationSystem): EngineAutomationSystem {
  return {
    system_id: a.system_id,
    category: a.category,
    densityUnit: a.typicalDensity.unit,
    densityValue: a.typicalDensity.value,
    throughputPerRobotPerHour: a.throughputPerRobotPerHour,
    throughputPerAislePerHour: a.throughputPerAislePerHour,
    throughputPerHour: a.throughputPerHour,
    defaultPackingEfficiency: a.defaultPackingEfficiency,
  };
}

export function toEngineRegionalContext(regionId: RegionId): EngineRegionalContext {
  if (regionId === 'custom') {
    return {
      regionId,
      officeM2PerFte: 9,
      surauRequired: false,
      muslimWorkforcePct: 0,
      ramadanDerate: { active: false, factor: 1, days: 0 },
      backupGeneratorMandatory: false,
    };
  }
  const r = REGIONAL_PROFILES[regionId];
  return {
    regionId,
    officeM2PerFte: r.officeM2PerFte,
    surauRequired: r.surauRequired,
    muslimWorkforcePct: r.muslimWorkforcePct,
    ramadanDerate: { ...r.ramadanDerate },
    backupGeneratorMandatory: r.backupGeneratorMandatory,
  };
}
