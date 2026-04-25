// Step 10 — Support Areas.
// SPEC §8 Step 10.
//
// Per SPEC the support area roll-up combines:
//   battery        from Step 8 (chemistry-specific) + lithium kVA buffer
//   office         (adminFte + supervisorFte) × regionalOfficeM2PerFte
//   surau          MY/ID ≥40 Muslim staff: 15m² per 50 + 6m² ablution
//   amenities      opsProfile.amenitiesArea
//   training       opsProfile.trainingAreaM2
//   firstAid       opsProfile.firstAidAreaM2
//   customs        bonded engagements: inboundVol × customsHoldPct × footprint
//   vas            benches × 12 + 20 m² staging
//   returns        returnsRatePct × outbound × handle dwell
//   qc             qcSampleRate × inbound × dwellHours × footprint
//   dg             avgDgSkuFootprintM2 × dgMultiplier × ~5 SKUs
//   packBench      packers needed × 6 m²
//   emptyPallet    5 % of operational
//   waste          50 m² fixed
//   tempAntechamber  building.coldChain.antechamberM2 if required
//
// Halal uplift (15 %) is NOT applied here — Step 11 multiplies the
// operational total. Step 10 just emits halalUpliftFactor for downstream.

import type {
  EngineOpsProfile,
  EngineBuildingEnvelope,
  EngineRegionalContext,
} from '../models';
import type { Step05Outputs } from './Step05Footprint';
import type { Step06Outputs } from './Step06Throughput';
import type { Step07Outputs } from './Step07Labour';
import type { Step08Outputs } from './Step08MheFleet';

export interface Step10Inputs {
  step5: Step05Outputs;
  step6: Step06Outputs;
  step7: Step07Outputs;
  step8: Step08Outputs;
  opsProfile: EngineOpsProfile;
  envelope: EngineBuildingEnvelope;
  regional: EngineRegionalContext;
  halalRequired: boolean;
  isBonded: boolean;
}

export interface SupportAreas {
  /** MHE charging footprint (lead-acid swap stations + lithium parking). */
  battery: number;
  /** Floor space for the kVA distribution panels (lithium fleets). */
  lithiumKvaBufferM2: number;
  office: number;
  amenities: number;
  surau: number;
  ablution: number;
  training: number;
  firstAid: number;
  customs: number;
  customsCage: number;
  vas: number;
  returns: number;
  qc: number;
  dg: number;
  packBench: number;
  emptyPallet: number;
  waste: number;
  tempAntechamber: number;
}

export interface Step10Outputs {
  areas: SupportAreas;
  /** Operational sub-total (everything except office/amenities cluster). */
  operationalSupportM2: number;
  /** Office + amenities cluster (Surau + ablution + amenities + training + firstAid). */
  officeAndAmenitiesM2: number;
  /** Total support footprint. */
  totalSupportM2: number;
  halalUpliftFactor: number;
  warnings: string[];
}

const SURAU_M2_PER_50_MUSLIM = 15;
const SURAU_ABLUTION_M2 = 6;
const SURAU_MIN_MUSLIM_STAFF = 40;
const VAS_FIXED_STAGING_M2 = 20;
const VAS_PER_BENCH_M2 = 12;
const PACK_BENCH_M2 = 6;
const WASTE_FIXED_M2 = 50;
const EMPTY_PALLET_PCT_OF_OPERATIONAL = 0.05;
const LITHIUM_KVA_TO_M2 = 0.5; // m² per kVA of distribution panel space
const QC_HOLD_PALLET_FOOTPRINT_MULTIPLIER = 1.3;

export function runStep10SupportAreas(inputs: Step10Inputs): Step10Outputs {
  const ops = inputs.opsProfile;
  const env = inputs.envelope;
  const regional = inputs.regional;
  const warnings: string[] = [];

  // -- Office (regional m² per FTE × admin + supervisor)
  const officeFte = ops.adminFte + ops.supervisorFte;
  const office = officeFte * regional.officeM2PerFte;

  // -- Surau (MY/ID-style worship space, plus 6 m² ablution)
  let surau = 0;
  let ablution = 0;
  const muslimStaff = Math.round(ops.totalStaff * regional.muslimWorkforcePct);
  if (regional.surauRequired && muslimStaff >= SURAU_MIN_MUSLIM_STAFF) {
    surau = Math.ceil(muslimStaff / 50) * SURAU_M2_PER_50_MUSLIM;
    ablution = SURAU_ABLUTION_M2;
  }
  if (regional.surauRequired && muslimStaff < SURAU_MIN_MUSLIM_STAFF) {
    warnings.push('SURAU_REQUIRED_BUT_HEADCOUNT_BELOW_THRESHOLD');
  }

  // -- Customs (bonded zone for VN / MY / ID typical)
  let customs = 0;
  let customsCage = 0;
  if (inputs.isBonded) {
    const inboundPalletsPerDay = inputs.step6.daily.inboundPallets;
    const holdPct = env.customsBonded.holdAreaPct;
    const dwellDays = 3; // typical bonded hold
    const palletFootprint = ops.palletFootprintM2 * 1.3;
    customs = inboundPalletsPerDay * holdPct * dwellDays * palletFootprint;
    customsCage = env.customsBonded.fencedCageM2;
  }

  // -- VAS (benches × 12 + 20 m² staging)
  const vas = ops.vasBenches > 0 ? ops.vasBenches * VAS_PER_BENCH_M2 + VAS_FIXED_STAGING_M2 : 0;

  // -- Returns
  const returnsPalletsPerDay =
    inputs.step6.daily.outboundPallets * (ops.returnsRatePct / 100);
  const returnsDwellDays = 1.5;
  const returns = returnsPalletsPerDay * returnsDwellDays * ops.palletFootprintM2 * 1.4;

  // -- QC
  const qcPalletsPerDay = inputs.step6.daily.inboundPallets * ops.qcSampleRate;
  const qcDwellDays = ops.qcDwellHours / 24;
  const qc = qcPalletsPerDay * qcDwellDays * ops.palletFootprintM2 * QC_HOLD_PALLET_FOOTPRINT_MULTIPLIER;

  // -- DG cage
  const dgSkuCount = 5; // planning default
  const dg = ops.avgDgSkuFootprintM2 * ops.dgMultiplier * dgSkuCount;

  // -- Pack bench (packers ≈ ecom each-pick lines / packerThroughput / hrs)
  const packers = ops.packerThroughput > 0
    ? Math.ceil(
        inputs.step6.daily.pickLinesPerDay /
          (ops.packerThroughput * ops.productiveHoursPerDay)
      )
    : 0;
  const packBench = packers * PACK_BENCH_M2;

  // -- Empty pallet (5 % of operational racked area)
  const operationalRackedM2 = inputs.step5.totalAlignedAreaM2;
  const emptyPallet = operationalRackedM2 * EMPTY_PALLET_PCT_OF_OPERATIONAL;

  // -- Waste
  const waste = WASTE_FIXED_M2;

  // -- Temperature ante-chamber (tropical regions for chilled/frozen rooms)
  const hasColdChain = env.coldChain.chilledZoneM2 + env.coldChain.frozenZoneM2 > 0;
  const tempAntechamber =
    env.coldChain.antechamberRequired && hasColdChain ? env.coldChain.antechamberM2 : 0;

  // -- Battery / charging
  const battery = inputs.step8.totalChargingFootprintM2;
  const lithiumKvaBufferM2 = inputs.step8.totalChargingKva * LITHIUM_KVA_TO_M2;

  const areas: SupportAreas = {
    battery,
    lithiumKvaBufferM2,
    office,
    amenities: ops.amenitiesArea,
    surau,
    ablution,
    training: ops.trainingAreaM2,
    firstAid: ops.firstAidAreaM2,
    customs,
    customsCage,
    vas,
    returns,
    qc,
    dg,
    packBench,
    emptyPallet,
    waste,
    tempAntechamber,
  };

  // Operational support = everything that lives inside the ops floor
  // (battery / lithium / vas / returns / qc / dg / pack / empty / waste /
  //  customs / antechamber). Office cluster is separated.
  const operationalSupport =
    battery +
    lithiumKvaBufferM2 +
    customs +
    customsCage +
    vas +
    returns +
    qc +
    dg +
    packBench +
    emptyPallet +
    waste +
    tempAntechamber;
  const officeAndAmenities = office + surau + ablution + ops.amenitiesArea + ops.trainingAreaM2 + ops.firstAidAreaM2;

  return {
    areas,
    operationalSupportM2: operationalSupport,
    officeAndAmenitiesM2: officeAndAmenities,
    totalSupportM2: operationalSupport + officeAndAmenities,
    halalUpliftFactor: inputs.halalRequired ? 0.15 : 0,
    warnings,
  };
}
