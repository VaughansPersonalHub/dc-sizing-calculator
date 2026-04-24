// Maps a RegionalProfile + engagement id → a fully-populated OpsProfile with
// sensible defaults per SPEC §6.2 and §10. The wizard calls this once,
// presents the result for review, and lets the user override any field
// before persisting.

import type { OpsProfile } from '../schemas/scenario';
import type { RegionId } from '../schemas/regional';
import { REGIONAL_PROFILES, type RegionalProfile } from './profiles';

interface DefaultsContext {
  engagementId: string;
  region: RegionId;
  halalCertifiedRequired: boolean;
}

/**
 * Returns a fresh OpsProfile populated with:
 * - Baseline defaults from SPEC §10
 * - Region-specific overrides per §6.2 (shift pattern, office m²/FTE,
 *   cross-aisle spacing, canopy rules)
 *
 * Ramadan / Surau / halal *uplift* live at the engagement level elsewhere
 * (engagement.halalCertifiedRequired, engagement.surauRequired flags), not
 * in OpsProfile. What lives here are the *operational* knobs that the
 * engine reads: productive hours, FTE density, site coverage, etc.
 */
export function buildDefaultOpsProfile(ctx: DefaultsContext): OpsProfile {
  const region = ctx.region === 'custom' ? null : REGIONAL_PROFILES[ctx.region];
  const shiftsPerDay = region?.shiftsPerDay ?? 2;
  const hoursPerShift = region?.hoursPerShift ?? 10;
  const breakAllowanceMin = 40;
  const productivityFactor = 0.82;
  const productiveHoursPerDay = round2(
    shiftsPerDay * hoursPerShift - (breakAllowanceMin / 60) * shiftsPerDay
  );

  const base: OpsProfile = {
    engagementId: ctx.engagementId,
    regionProfile: ctx.region,

    operatingDaysPerYear: inferOperatingDays(region),
    shiftsPerDay,
    hoursPerShift,
    breakAllowanceMinutesPerDay: breakAllowanceMin,
    productivityFactor,
    absenteeismPct: 0.08,
    leaveFraction: 0.12,
    sickReliefPct: 0.05,
    productiveHoursPerDay,

    peakUplift: 1.35,
    sigmaStorage: 1.0,
    percentileDocks: 0.95,
    percentileStaging: 0.95,

    horizontalHoneycombingFactor: 0.88,
    gridEfficiencyThreshold: 0.88,
    preferredAspectRatio: 1.6,

    skuPeakCorrelationCoefficient: 0.3,
    floorloadPalletisationYield: 0.88,

    dsohDays: 14,
    forwardFaceDsohDays: { A: 1.0, B: 2.5, C: 0, D: 0 },
    discontinuationLagMonths: 3,
    dsohChangeByVelocity: { A: 0, B: 0, C: 0, D: 0 },

    paretoBreakpoints: { A: 0.2, B: 0.5, C: 0.8, D: 1.0 },
    replenTriggerDays: 0.5,
    clsLaneFillFactor: 0.9,

    // Regional: SG is 20m per SCDF; others default to 22m
    crossAisleSpacingM: region?.crossAisleSpacingM ?? 22,
    crossAisleWidthM: region?.crossAisleWidthM ?? 2.4,

    canopyAllowancePct: 0.11,
    canopyType: 'cantilever',
    canopyOverhangM: 1.2,
    canopyCoverageExemptMaxM: 1.2,

    maxSiteCoverage: 0.55,
    phase2HorizontalPct: 0.2,
    phase2VerticalPct: 0.1,

    softSpacePct: 0.2,
    clearHeightMm: 12500,

    ordersPerBatch: 5,
    repackSecPerPallet: 90,
    repackSecPerUnit: 2,

    adminFte: 5,
    supervisorFte: 4,
    totalStaff: 85,

    vasBenches: 4,
    returnsRatePct: 2,
    returnsHandleTimeHours: 0.3,
    qcSampleRate: 0.1,
    qcDwellHours: 8,
    avgDgSkuFootprintM2: 0.5,
    dgMultiplier: 2.5,
    palletFootprintM2: region?.primaryInboundPalletId === 'PAL_1200x1000' ? 1.44 : 1.21,
    packerThroughput: 60,

    amenitiesArea: 80,
    trainingAreaM2: 40,
    firstAidAreaM2: 15,

    tornadoWeights: { footprint: 0.5, fte: 0.5 },
  };

  return base;
}

function inferOperatingDays(region: RegionalProfile | null): number {
  if (!region) return 300;
  const holidays = region.publicHolidaysPerYear;
  const weeksOff = 52 - 52 * region.workDaysPerWeek / 7;
  // Operating days = 365 - weekends-equivalent - holidays, rounded.
  return Math.round(365 - weeksOff * 7 - holidays);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Flags the wizard should show as auto-enabled for a given region, so the
 * user can confirm/override them before the engagement is created.
 */
export function regionalFeatureFlags(region: RegionId): {
  halalCertifiedRequired: boolean;
  surauRequired: boolean;
  ramadanDerate: { active: boolean; factor: number; days: number };
  customsBondedDefault: boolean;
  backupGeneratorMandatory: boolean;
  tempAntechamberRequired: boolean;
} {
  if (region === 'custom') {
    return {
      halalCertifiedRequired: false,
      surauRequired: false,
      ramadanDerate: { active: false, factor: 1, days: 0 },
      customsBondedDefault: false,
      backupGeneratorMandatory: false,
      tempAntechamberRequired: false,
    };
  }
  const r = REGIONAL_PROFILES[region];
  return {
    halalCertifiedRequired: r.halalCertification.startsWith('Yes'),
    surauRequired: r.surauRequired,
    ramadanDerate: { ...r.ramadanDerate },
    customsBondedDefault: r.customsBondedCommon === 'High',
    backupGeneratorMandatory: r.backupGeneratorMandatory,
    tempAntechamberRequired: r.coldChainAntechamberRequired,
  };
}
