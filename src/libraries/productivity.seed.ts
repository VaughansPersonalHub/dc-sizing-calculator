import type { ProductivityCell } from '../schemas/libraries';

/**
 * Seed ProductivityCells. Source references are WERC DC Measures 2024 medians
 * where available, else internal heuristics flagged `heuristic`.
 * Per-engagement overrides supported via engagementOverrides map.
 */
export const PRODUCTIVITY_SEEDS: ProductivityCell[] = [
  // Conventional pallet putaway / retrieve (sqrt_area model)
  {
    method: 'reach_truck', unitType: 'pallet', slotType: 'PFP',
    staticTimeSecPerUnit: 45, travelModelType: 'sqrt_area',
    travelCoefficient: 1.0, baselineZoneAreaM2: 2500, derivedRateAtBaseline: 28,
    rateRange: { low_p25: 22, median: 28, high_p75: 34 },
    source: 'WERC DC Measures 2024', wercPercentileReference: 'Median',
    confidence: 'heuristic', engagementOverrides: {},
  },
  // Voice case pick
  {
    method: 'voice', unitType: 'case', slotType: 'PFP',
    staticTimeSecPerUnit: 15, travelModelType: 'sqrt_area',
    travelCoefficient: 1.2, baselineZoneAreaM2: 2000, derivedRateAtBaseline: 180,
    rateRange: { low_p25: 120, median: 180, high_p75: 240 },
    densityAssumption: '60-80% pick density, batch 4-6 orders',
    source: 'WERC DC Measures 2024', wercPercentileReference: 'Median',
    confidence: 'heuristic', engagementOverrides: {},
  },
  // RF case pick
  {
    method: 'rf_scan', unitType: 'case', slotType: 'PFP',
    staticTimeSecPerUnit: 22, travelModelType: 'sqrt_area',
    travelCoefficient: 1.2, baselineZoneAreaM2: 2000, derivedRateAtBaseline: 140,
    rateRange: { low_p25: 100, median: 140, high_p75: 180 },
    source: 'WERC DC Measures 2024', confidence: 'heuristic', engagementOverrides: {},
  },
  // RF each pick (shelf)
  {
    method: 'rf_scan', unitType: 'each', slotType: 'Shelf',
    staticTimeSecPerUnit: 18, travelModelType: 'sqrt_area',
    travelCoefficient: 1.1, baselineZoneAreaM2: 1500, derivedRateAtBaseline: 80,
    rateRange: { low_p25: 55, median: 80, high_p75: 110 },
    source: 'WERC DC Measures 2024', confidence: 'heuristic', engagementOverrides: {},
  },
  // Pick-to-light each (CLS)
  {
    method: 'pick_to_light', unitType: 'each', slotType: 'CLS',
    staticTimeSecPerUnit: 6, travelModelType: 'sqrt_area',
    travelCoefficient: 0.8, baselineZoneAreaM2: 800, derivedRateAtBaseline: 360,
    rateRange: { low_p25: 280, median: 360, high_p75: 450 },
    source: 'WERC DC Measures 2024', confidence: 'heuristic', engagementOverrides: {},
  },
  // VNA sequential_hv
  {
    method: 'vna', unitType: 'pallet', slotType: 'PFP',
    staticTimeSecPerUnit: 35, travelModelType: 'sequential_hv',
    travelCoefficient: 1.0, baselineZoneAreaM2: 3000, derivedRateAtBaseline: 24,
    vnaLiftSpeedMpm: 30,
    source: 'internal heuristic', confidence: 'heuristic', engagementOverrides: {},
  },
  // Pallet shuttle
  {
    method: 'pallet_shuttle', unitType: 'pallet', slotType: 'PFP',
    staticTimeSecPerUnit: 25, travelModelType: 'shuttle_cycle',
    travelCoefficient: 1.0, baselineZoneAreaM2: 1000, derivedRateAtBaseline: 50,
    shuttleTransferSec: 18,
    source: 'internal heuristic', confidence: 'heuristic', engagementOverrides: {},
  },
  // Mini-load ASRS
  {
    method: 'mini_load_asrs', unitType: 'each', slotType: 'Auto',
    staticTimeSecPerUnit: 4, travelModelType: 'crane_cycle',
    travelCoefficient: 1.0, baselineZoneAreaM2: 1500, derivedRateAtBaseline: 100,
    craneHorizontalSpeedMps: 4, craneLiftSpeedMps: 1.5, pickDepositSec: 6,
    source: 'internal heuristic', confidence: 'heuristic', engagementOverrides: {},
  },
  // G2P AutoStore/Exotec port pick
  {
    method: 'g2p_port', unitType: 'each', slotType: 'Auto',
    staticTimeSecPerUnit: 5, travelModelType: 'g2p_port',
    travelCoefficient: 1.0, baselineZoneAreaM2: 400, derivedRateAtBaseline: 600,
    g2pPortWalkDistanceM: 2,
    source: 'vendor spec', confidence: 'heuristic', engagementOverrides: {},
  },
  // AMR fleet pick
  {
    method: 'amr_pick', unitType: 'each', slotType: 'Shelf',
    staticTimeSecPerUnit: 12, travelModelType: 'amr_fleet',
    travelCoefficient: 1.0, baselineZoneAreaM2: 2000, derivedRateAtBaseline: 150,
    source: 'vendor spec', confidence: 'heuristic', engagementOverrides: {},
  },
  // Decant pallet (floor-load decant)
  {
    method: 'decant', unitType: 'pallet', slotType: 'PFP',
    staticTimeSecPerUnit: 300, travelModelType: 'zero',
    travelCoefficient: 0, baselineZoneAreaM2: 0, derivedRateAtBaseline: 12,
    source: 'internal heuristic', confidence: 'heuristic', engagementOverrides: {},
  },
  // VAS bench
  {
    method: 'vas', unitType: 'each', slotType: 'Shelf',
    staticTimeSecPerUnit: 45, travelModelType: 'zero',
    travelCoefficient: 0, baselineZoneAreaM2: 0, derivedRateAtBaseline: 80,
    source: 'internal heuristic', confidence: 'heuristic', engagementOverrides: {},
  },
];
