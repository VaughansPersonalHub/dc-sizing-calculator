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
import type { EngineSku, EngineOpsProfile } from './models';
import type { OpsProfile } from '../schemas/scenario';
import type { SkuRecord } from '../schemas/sku';
import type {
  RackSystem,
  PalletStandard,
  BuildingTemplate,
} from '../schemas/libraries';

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
    if (racks.length === 0) throw new Error('rack library is empty');
    if (pallets.length === 0) throw new Error('pallet library is empty');

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
      halalRequired: engagement.halalCertifiedRequired,
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
    peakUplift: p.peakUplift,
    sigmaStorage: p.sigmaStorage,
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
    maxSiteCoverage: p.maxSiteCoverage,
    phase2HorizontalPct: p.phase2HorizontalPct,
    phase2VerticalPct: p.phase2VerticalPct,
    softSpacePct: p.softSpacePct,
    clearHeightMm: p.clearHeightMm,
    ordersPerBatch: p.ordersPerBatch,
    repackSecPerPallet: p.repackSecPerPallet,
    palletFootprintM2: p.palletFootprintM2,
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
  };
}
