// Step 11 — Footprint Roll-up & Structural Checks.
// SPEC §8 Step 11.
//
//   operational         = Σ zoneArea + VAS + returns + QC + DG +
//                         packBench + emptyPallet + battery + customs + tempZones
//   operational        ×= (1 + halalUpliftFactor)
//
//   officeAndAmenities  = office + Surau + amenities + training + firstAid
//
//   canopyArea          = operational × canopyAllowancePct
//   buildingFootprintGfa= operational + officeAndAmenities      (canopy separate)
//
//   Canopy in coverage if columned OR cantilever > exemptMaxM
//   siteCoverageArea    = buildingFootprintGfa
//                         + (canopyCountedInCoverage ? canopyArea : 0)
//   siteArea            = siteCoverageArea / maxSiteCoverage
//
//   Soft space:
//     phase2HorizontalM2= operational × phase2HorizontalPct
//     phase2VerticalM2  = operational × phase2VerticalPct
//
//   Structural gates:
//     staticSlabUdl > slabLoading       → slabFailure
//     seismicFailure                    ← Step 4.6 (relayed)
//     overEnvelope (vs envelope GFA)    → envelopeShortfallM2
//     clearHeightFailure                ← Step 4.5 (relayed)
//
//   feasibilityFlags = { slab, seismic, envelope, clearHeight }
//   infeasible       = any FAIL

import type { EngineOpsProfile, EngineBuildingEnvelope } from '../models';
import type { Step03Outputs } from './Step03SlotSizing';
import type { Step04Outputs } from './Step04Bays';
import type { ClearHeightResult, SeismicMassResult } from './Step04Bays';
import type { Step05Outputs } from './Step05Footprint';
import type { Step10Outputs } from './Step10SupportAreas';
import type { Step12Outputs } from './Step12Automation';

export interface Step11Inputs {
  step3: Step03Outputs;
  step4: Step04Outputs;
  step4_5: ClearHeightResult;
  step4_6: SeismicMassResult;
  step5: Step05Outputs;
  step10: Step10Outputs;
  /** Optional automation override. When present, Step 11 swaps the
   *  conventional storage zones the automation system replaces (the same
   *  ones Step 12 charged a delta against) for the automated zone +
   *  frontEnd area. The result is reflected in operationalM2 and GFA. */
  step12?: Step12Outputs | null;
  opsProfile: EngineOpsProfile;
  envelope: EngineBuildingEnvelope;
}

export interface FootprintRollup {
  /** Σ racked-zone + operational support areas, post-halal-uplift.
   *  When automation is present, this reflects the swapped storage path. */
  operationalM2: number;
  /** Office cluster (office + amenities + Surau + training + firstAid). */
  officeAndAmenitiesM2: number;
  canopyAreaM2: number;
  canopyCountedInCoverage: boolean;
  /** Operational + officeAndAmenities. Canopy separate per SPEC. */
  buildingFootprintGfaM2: number;
  /** Footprint count toward site coverage limit. */
  siteCoverageM2: number;
  /** Total land area required at the maxSiteCoverage limit. */
  siteAreaM2: number;
  softSpace: {
    phase2HorizontalM2: number;
    phase2VerticalM2: number;
    totalM2: number;
  };
  /** Conventional racked area before any automation swap (m²). Useful for
   *  side-by-side comparisons in the UI. */
  conventionalRackedM2: number;
  /** True when automation swap was applied (step12 was non-null). */
  automationSwapped: boolean;
  /** Net m² saved by the automation swap (positive = automation saves area). */
  automationSavingsM2: number;
}

export interface StructuralResult {
  /** Static UDL imposed on the slab by the heaviest stack of pallets (t/m²). */
  staticSlabUdlTPerM2: number;
  /** Slab capacity (t/m²) from the building envelope. */
  slabLoadingTPerM2: number;
  slabFailure: boolean;
  /** True when GFA exceeds the building envelope. */
  overEnvelope: boolean;
  envelopeShortfallM2: number;
}

export interface FeasibilityFlags {
  slab: boolean;
  seismic: boolean;
  envelope: boolean;
  clearHeight: boolean;
}

export interface Step11Outputs {
  rollup: FootprintRollup;
  structural: StructuralResult;
  feasibilityFlags: FeasibilityFlags;
  infeasible: boolean;
}

export function runStep11FootprintRollup(inputs: Step11Inputs): Step11Outputs {
  const ops = inputs.opsProfile;
  const env = inputs.envelope;
  const halalFactor = inputs.step10.halalUpliftFactor;

  // --- Operational total: racked zones + operational support areas
  const conventionalRacked = inputs.step5.totalAlignedAreaM2;
  let rackedAfterAutomation = conventionalRacked;
  let automationSwapped = false;
  let automationSavings = 0;
  if (inputs.step12) {
    // Step 12 already reports replacedFootprintDelta (= conventional zone -
    // automated zone). Apply it here, then add the front-end induction
    // area for the automation system.
    rackedAfterAutomation =
      conventionalRacked - inputs.step12.replacedFootprintDelta + inputs.step12.frontEndAreaM2;
    rackedAfterAutomation = Math.max(0, rackedAfterAutomation);
    automationSavings = conventionalRacked - rackedAfterAutomation;
    automationSwapped = true;
  }
  const opSupport = inputs.step10.operationalSupportM2;
  const operationalRaw = rackedAfterAutomation + opSupport;
  const operationalM2 = operationalRaw * (1 + halalFactor);

  const officeAndAmenitiesM2 = inputs.step10.officeAndAmenitiesM2;
  const buildingFootprintGfaM2 = operationalM2 + officeAndAmenitiesM2;

  // --- Canopy
  const canopyAreaM2 = operationalM2 * ops.canopyAllowancePct;
  const canopyCountedInCoverage =
    ops.canopyType === 'columned' ||
    (ops.canopyType === 'cantilever' && ops.canopyOverhangM > ops.canopyCoverageExemptMaxM);

  const siteCoverageM2 =
    buildingFootprintGfaM2 + (canopyCountedInCoverage ? canopyAreaM2 : 0);
  const siteAreaM2 = ops.maxSiteCoverage > 0 ? siteCoverageM2 / ops.maxSiteCoverage : siteCoverageM2;

  // --- Soft-space split (separate %, not stacked)
  const phase2HorizontalM2 = operationalM2 * ops.phase2HorizontalPct;
  const phase2VerticalM2 = operationalM2 * ops.phase2VerticalPct;

  // --- Static slab UDL
  // The worst case is a fully loaded selective rack with N levels of the
  // heaviest pallet, divided by the pallet footprint. We approximate it
  // from the bay weight check: maxSinglePalletKg × levelsDefault per
  // palletFootprintM2.
  const heaviestPalletKg = maxFromStep3(inputs.step3);
  const levels = Math.max(1, levelsFromStep4(inputs.step4));
  const palletFootprintM2 = Math.max(0.5, ops.palletFootprintM2);
  const staticSlabUdlTPerM2 = (heaviestPalletKg * levels) / palletFootprintM2 / 1000;
  const slabFailure = staticSlabUdlTPerM2 > env.floor.slabLoadingTPerM2;

  // --- Envelope fit
  const envelopeFloorAreaM2 = env.floor.totalFloorAreaM2;
  const overEnvelope = buildingFootprintGfaM2 > envelopeFloorAreaM2 && envelopeFloorAreaM2 > 0;
  const envelopeShortfallM2 = overEnvelope ? buildingFootprintGfaM2 - envelopeFloorAreaM2 : 0;

  const feasibilityFlags: FeasibilityFlags = {
    slab: !slabFailure,
    seismic: inputs.step4_6.ok,
    envelope: !overEnvelope,
    clearHeight: inputs.step4_5.ok,
  };
  const infeasible =
    !feasibilityFlags.slab ||
    !feasibilityFlags.seismic ||
    !feasibilityFlags.envelope ||
    !feasibilityFlags.clearHeight;

  return {
    rollup: {
      operationalM2,
      officeAndAmenitiesM2,
      canopyAreaM2,
      canopyCountedInCoverage,
      buildingFootprintGfaM2,
      siteCoverageM2,
      siteAreaM2,
      softSpace: {
        phase2HorizontalM2,
        phase2VerticalM2,
        totalM2: phase2HorizontalM2 + phase2VerticalM2,
      },
      conventionalRackedM2: conventionalRacked,
      automationSwapped,
      automationSavingsM2: automationSavings,
    },
    structural: {
      staticSlabUdlTPerM2,
      slabLoadingTPerM2: env.floor.slabLoadingTPerM2,
      slabFailure,
      overEnvelope,
      envelopeShortfallM2,
    },
    feasibilityFlags,
    infeasible,
  };
}

function maxFromStep3(step3: Step03Outputs): number {
  let max = 0;
  for (const row of step3.rows) {
    if (row.palletWeightKg > max) max = row.palletWeightKg;
  }
  // Default to the rack's max single-pallet limit when no PFP rows exist
  // (CLS / shelf only). 1000 kg is a reasonable planning assumption.
  return max > 0 ? max : 1000;
}

function levelsFromStep4(step4: Step04Outputs): number {
  // Use the PFP rack levels as the slab UDL driver. Other zones don't
  // stack as heavily.
  return step4.pfp.alignedBays > 0 ? 5 : 1;
}
