// Engine runner — main-thread façade. Reads Dexie + Zustand for the
// active engagement, packages the worker payload (skuIds + concatenated
// Float32 demand + JSON-safe inputs), invokes the worker, parses the
// result.
//
// Intentionally narrow: "given an engagement id, run the engine, write
// the result to engine.store, return it." The Scenarios tab UI doesn't
// need to think about pipeline plumbing.

import { db } from '../db/schema';
import { useEngagementStore } from '../stores/engagement.store';
import { useEngineStore } from '../stores/engine.store';
import { useDataStore } from '../stores/data.store';
import { runEngine } from './workerClient';
import { REGIONAL_PROFILES } from '../regional/profiles';
import type {
  EngineSku,
  EngineOpsProfile,
  EngineMheClass,
  EngineProductivityCell,
  EngineRegionalContext,
} from './models';
import type { OpsProfile } from '../schemas/scenario';
import type { SkuRecord } from '../schemas/sku';
import type {
  RackSystem,
  PalletStandard,
  BuildingTemplate,
  MheClass,
  ProductivityCell,
} from '../schemas/libraries';
import type { RegionId } from '../schemas/regional';

export interface RunEngineOptions {
  engagementId: string;
  /** Optional building template id; falls back to the regional default. */
  buildingTemplateId?: string;
  onProgress?: (step: number, total: number, label: string) => void;
}

export interface RunEngineResult {
  outputJson: string;
  outputHash: string;
  elapsedMs: number;
  result: unknown;
}

export async function runEngineForEngagement(
  opts: RunEngineOptions
): Promise<RunEngineResult> {
  const engStore = useEngagementStore.getState();
  const dataStore = useDataStore.getState();
  const engineStore = useEngineStore.getState();

  engineStore.setStatus('running');
  engineStore.setProgress(0, 8);

  try {
    const [engagement, skuRows, opsProfile] = await Promise.all([
      db.engagements.get(opts.engagementId),
      db.skus.where('engagementId').equals(opts.engagementId).toArray(),
      db.opsProfiles.get(opts.engagementId),
    ]);
    if (!engagement) throw new Error(`engagement ${opts.engagementId} not found in Dexie`);
    if (!opsProfile)
      throw new Error(
        `no OpsProfile for engagement ${opts.engagementId}. Re-run the setup wizard.`
      );
    if (skuRows.length === 0)
      throw new Error('no SKUs imported yet. Use the Inputs tab to upload a CSV first.');

    const racks = dataStore.libraries.racks;
    const pallets = dataStore.libraries.pallets;
    const buildings = dataStore.libraries.buildings;
    const mhe = dataStore.libraries.mhe;
    const productivity = dataStore.libraries.productivity;
    if (racks.length === 0) throw new Error('rack library is empty');
    if (pallets.length === 0) throw new Error('pallet library is empty');
    if (mhe.length === 0) throw new Error('MHE library is empty');
    if (productivity.length === 0) throw new Error('productivity library is empty');

    const building =
      buildings.find((b) => b.building_id === opts.buildingTemplateId) ??
      buildings.find((b) => b.regionProfile === engagement.regionProfile) ??
      buildings[0];
    if (!building) throw new Error('building library is empty');

    // Pack demand into a single Float32Array (skus.length × 52). Order is
    // preserved so the worker can split on the same boundaries.
    const skuIds = skuRows.map((s) => s.id);
    const demand = new Float32Array(skuRows.length * 52);
    for (let i = 0; i < skuRows.length; i++) {
      const row = skuRows[i];
      for (let w = 0; w < 52; w++) demand[i * 52 + w] = row.weeklyUnits[w] ?? 0;
    }

    const inputs = {
      skus: skuRows.map(toEngineSkuMeta),
      opsProfile: toEngineOpsProfile(opsProfile),
      pallets: pallets.map(toEnginePallet),
      racks: racks.map(toEngineRack),
      envelope: toEngineEnvelope(building),
      productivity: productivity.map(toEngineProductivityCell),
      mheLibrary: mhe.map(toEngineMheClass),
      regional: toEngineRegionalContext(engagement.regionProfile),
      halalRequired: engagement.halalCertifiedRequired,
      isBonded: engagement.isBonded,
      vnaSelected: false,
    };

    const t0 = performance.now();
    const result = await runEngine(skuIds, demand, inputs, {
      onProgress: (step, total, label) => {
        engineStore.setProgress(step, total);
        opts.onProgress?.(step, total, label);
      },
    });
    const parsed = JSON.parse(result.outputJson);
    engineStore.setResult(parsed, result.outputHash);
    void t0;
    return { ...result, result: parsed };
  } catch (err) {
    engineStore.setStatus('error');
    void engStore;
    throw err;
  }
}

function toEngineSkuMeta(s: SkuRecord): Omit<EngineSku, 'weeklyUnits'> {
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

function toEngineOpsProfile(p: OpsProfile): EngineOpsProfile {
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

function toEngineProductivityCell(c: ProductivityCell): EngineProductivityCell {
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

function toEngineMheClass(m: MheClass): EngineMheClass {
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

function toEngineRegionalContext(regionId: RegionId): EngineRegionalContext {
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

function toEnginePallet(p: PalletStandard) {
  return {
    pallet_id: p.pallet_id,
    dimensionsMm: p.dimensionsMm,
    maxLoadKg: p.maxLoadKg,
  };
}

function toEngineRack(r: RackSystem) {
  return {
    system_id: r.system_id,
    bay: {
      widthMm: r.bay.widthMm,
      depthMm: r.bay.depthMm,
      heightMmDefault: r.bay.heightMmDefault,
    },
    slotsPerBay: r.slotsPerBay,
    levelsDefault: r.levelsDefault,
    load: r.load,
    aisle: {
      widthMmMin: r.aisle.widthMmMin,
      widthMmDefault: r.aisle.widthMmDefault,
      crossAisleMm: r.aisle.crossAisleMm,
    },
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

function toEngineEnvelope(b: BuildingTemplate) {
  return {
    envelope: {
      lengthM: b.envelope.lengthM,
      widthM: b.envelope.widthM,
    },
    clearHeights: {
      usableRackM: b.clearHeights.usableRackM,
      sprinklerClearanceM: b.clearHeights.sprinklerClearanceM,
    },
    floor: {
      slabLoadingTPerM2: b.floor.slabLoadingTPerM2,
      totalFloorAreaM2: b.floor.totalFloorAreaM2,
    },
    seismic: {
      designCategory: b.seismic.designCategory,
      allowableRatio: b.seismic.allowableRatio,
    },
    columnGrid: {
      spacingXM: b.columnGrid.spacingXM,
      spacingYM: b.columnGrid.spacingYM,
    },
    coldChain: {
      ambientZoneM2: b.coldChain.ambientZoneM2,
      chilledZoneM2: b.coldChain.chilledZoneM2,
      frozenZoneM2: b.coldChain.frozenZoneM2,
      antechamberRequired: b.coldChain.antechamberRequired,
      antechamberM2: b.coldChain.antechamberM2,
    },
    customsBonded: {
      required: b.customsBonded.required,
      holdAreaPct: b.customsBonded.holdAreaPct,
      fencedCageM2: b.customsBonded.fencedCageM2,
    },
    mezzanine: {
      available: b.mezzanine.available,
      tiers: b.mezzanine.tiers,
      perTierMaxM2: b.mezzanine.perTierMaxM2,
    },
    power: {
      backupGeneratorKva: b.power.backupGeneratorKva,
      gridReliabilityHoursPerDay: b.power.gridReliabilityHoursPerDay,
    },
  };
}
