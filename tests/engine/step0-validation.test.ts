import { describe, it, expect } from 'vitest';
import {
  runValidationLayer,
  applyAutoFixes,
} from '../../src/engine/validators/Step0ValidationLayer';
import type { EngineSku, EnginePallet } from '../../src/engine/models';

const PALLETS: EnginePallet[] = [
  { pallet_id: 'T11_1100x1100', dimensionsMm: { length: 1100, width: 1100, height: 150 }, maxLoadKg: 1000 },
  { pallet_id: 'PAL_1200x1000', dimensionsMm: { length: 1200, width: 1000, height: 150 }, maxLoadKg: 1500 },
];

function cleanSku(overrides: Partial<EngineSku> = {}): EngineSku {
  const weekly = new Float32Array(52).fill(100);
  return {
    id: 'SKU-1',
    category: 'FMCG',
    weeklyUnits: weekly,
    weeksOnFile: 52,
    unitCubeCm3: 1000,
    // Ti(4) × Hi(5) × caseQty(24) × unitWeightKg(0.2) = 96 kg, well below
    // any pallet maxLoadKg in the library. Prevents the clean baseline
    // from silently emitting a PALLET_WEIGHT_EXCEEDS_RACK warning.
    unitWeightKg: 0.2,
    caseQty: 24,
    inboundPalletId: 'T11_1100x1100',
    outboundPalletId: 'T11_1100x1100',
    palletTi: 4,
    palletHi: 5,
    stackable: true,
    tempClass: 'ambient',
    halalStatus: 'halal',
    channelMix: { retailB2bPct: 0.6, ecomDtcPct: 0.3, marketplacePct: 0.1 },
    ...overrides,
  };
}

describe('Step 0 — ValidationLayer', () => {
  it('marks a perfectly clean SKU as clean with no issues', () => {
    const r = runValidationLayer([cleanSku()], { pallets: PALLETS, halalRequired: false });
    expect(r.fatalErrors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.stats.cleanSkus).toBe(1);
    expect(r.suppressedSkus.size).toBe(0);
  });

  it('detects NEGATIVE_DEMAND as a fatal error', () => {
    const w = new Float32Array(52).fill(100);
    w[5] = -10;
    const r = runValidationLayer([cleanSku({ weeklyUnits: w })], {
      pallets: PALLETS,
      halalRequired: false,
    });
    expect(r.fatalErrors.some((e) => e.code === 'NEGATIVE_DEMAND')).toBe(true);
    expect(r.stats.fatalSkus).toBe(1);
    expect(r.suppressedSkus.has('SKU-1')).toBe(true);
  });

  it('marks zero-demand SKUs as warnings and suppresses them', () => {
    const zero = new Float32Array(52);
    const r = runValidationLayer([cleanSku({ weeklyUnits: zero, weeksOnFile: 0 })], {
      pallets: PALLETS,
      halalRequired: false,
    });
    expect(r.fatalErrors).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'ZERO_DEMAND')).toBe(true);
    expect(r.suppressedSkus.has('SKU-1')).toBe(true);
  });

  it('flags PALLET_WEIGHT_EXCEEDS_RACK when Ti×Hi×unit exceeds pallet max', () => {
    const r = runValidationLayer(
      [cleanSku({ unitWeightKg: 5, caseQty: 24, palletTi: 10, palletHi: 5 })],
      { pallets: PALLETS, halalRequired: false }
    );
    expect(r.warnings.some((w) => w.code === 'PALLET_WEIGHT_EXCEEDS_RACK')).toBe(true);
  });

  it('flags IMPOSSIBLE_PALLET_CONFIG when pallet id is unknown', () => {
    const r = runValidationLayer(
      [cleanSku({ inboundPalletId: 'NOT_A_PALLET' })],
      { pallets: PALLETS, halalRequired: false }
    );
    expect(r.fatalErrors.some((e) => e.code === 'IMPOSSIBLE_PALLET_CONFIG')).toBe(true);
  });

  it('flags INBOUND_OUTBOUND_MISMATCH as a warning', () => {
    const r = runValidationLayer(
      [cleanSku({ inboundPalletId: 'PAL_1200x1000' })],
      { pallets: PALLETS, halalRequired: false }
    );
    expect(r.warnings.some((w) => w.code === 'INBOUND_OUTBOUND_MISMATCH')).toBe(true);
  });

  it('fires MISSING_HALAL_STATUS only when engagement.halalRequired = true', () => {
    const sku = cleanSku({ halalStatus: 'unclassified' });
    const withoutFlag = runValidationLayer([sku], { pallets: PALLETS, halalRequired: false });
    const withFlag = runValidationLayer([sku], { pallets: PALLETS, halalRequired: true });
    expect(withoutFlag.warnings.some((w) => w.code === 'MISSING_HALAL_STATUS')).toBe(false);
    expect(withFlag.warnings.some((w) => w.code === 'MISSING_HALAL_STATUS')).toBe(true);
  });

  it('surfaces CV_OUTLIER when weekly demand is extremely spiky', () => {
    const w = new Float32Array(52);
    w[0] = 10000; // one huge spike, rest zero → very high CV
    const r = runValidationLayer(
      [cleanSku({ weeklyUnits: w, weeksOnFile: 52 })],
      { pallets: PALLETS, halalRequired: false }
    );
    expect(r.warnings.some((w) => w.code === 'CV_OUTLIER')).toBe(true);
  });

  it('flags PARTIAL_HISTORY when weeksOnFile below 26', () => {
    const r = runValidationLayer(
      [cleanSku({ weeksOnFile: 10 })],
      { pallets: PALLETS, halalRequired: false }
    );
    expect(r.warnings.some((w) => w.code === 'PARTIAL_HISTORY')).toBe(true);
  });
});

describe('Step 0 — applyAutoFixes', () => {
  it('clampNegativeDemand replaces negatives with zero without touching the input', () => {
    const w = new Float32Array(52).fill(100);
    w[3] = -5;
    const input = [cleanSku({ weeklyUnits: w })];
    const out = applyAutoFixes(input, { clampNegativeDemand: true });
    expect(out[0].weeklyUnits[3]).toBe(0);
    expect(input[0].weeklyUnits[3]).toBe(-5); // input untouched
  });

  it('suppressZeroDemand drops SKUs whose weekly sum is 0', () => {
    const zero = new Float32Array(52);
    const input = [cleanSku(), cleanSku({ id: 'Z', weeklyUnits: zero })];
    const out = applyAutoFixes(input, { suppressZeroDemand: true });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('SKU-1');
  });

  it('capCv winsorises the peak week for spiky SKUs', () => {
    const w = new Float32Array(52);
    w[0] = 10000;
    const input = [cleanSku({ weeklyUnits: w })];
    const out = applyAutoFixes(input, { capCv: true });
    // Post-fix peak should be << 10000 (cap = mean + 3×mean ≈ 769)
    expect(out[0].weeklyUnits[0]).toBeLessThan(1000);
  });

  it('normaliseChannelMix rescales so sum === 1', () => {
    const input = [
      cleanSku({
        channelMix: { retailB2bPct: 0.4, ecomDtcPct: 0.4, marketplacePct: 0.4 },
      }),
    ];
    const out = applyAutoFixes(input, { normaliseChannelMix: true });
    const s =
      out[0].channelMix.retailB2bPct +
      out[0].channelMix.ecomDtcPct +
      out[0].channelMix.marketplacePct;
    expect(s).toBeCloseTo(1, 5);
  });
});
