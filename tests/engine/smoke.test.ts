import { describe, it, expect } from 'vitest';
import { REGIONAL_PROFILES, getRegionalProfile } from '../../src/regional/profiles';
import { RACK_SEEDS } from '../../src/libraries/racks.seed';
import { MHE_SEEDS } from '../../src/libraries/mhe.seed';
import { PRODUCTIVITY_SEEDS } from '../../src/libraries/productivity.seed';
import { BUILDING_SEEDS } from '../../src/libraries/buildings.seed';
import { PALLET_SEEDS } from '../../src/libraries/pallets.seed';
import { AUTOMATION_SEEDS } from '../../src/libraries/automation.seed';
import { SkuCsvRowSchema, ChannelMixSchema } from '../../src/schemas/sku';

describe('Phase 0 smoke — reference data integrity', () => {
  it('exports all six primary Asian markets', () => {
    expect(Object.keys(REGIONAL_PROFILES).sort()).toEqual(['ID', 'KR', 'MY', 'SG', 'TW', 'VN']);
  });

  it('Malaysia profile has halal + surau + Ramadan active', () => {
    const my = getRegionalProfile('MY')!;
    expect(my.halalCertification).toBe('Yes (JAKIM)');
    expect(my.surauRequired).toBe(true);
    expect(my.ramadanDerate.active).toBe(true);
    expect(my.ramadanDerate.factor).toBeCloseTo(0.82);
  });

  it('Singapore uses the SCDF 20m cross-aisle', () => {
    expect(getRegionalProfile('SG')!.crossAisleSpacingM).toBe(20);
  });

  it('Indonesia is seismic D-E with mandatory backup generator', () => {
    const id = getRegionalProfile('ID')!;
    expect(id.seismicDesignCategory).toBe('D-E');
    expect(id.backupGeneratorMandatory).toBe(true);
  });

  it('rack library includes Chinese vendor refs for shuttle systems', () => {
    const shuttle = RACK_SEEDS.find((r) => r.system_id === 'pallet_shuttle_single')!;
    expect(shuttle.supplier_refs).toContain('HAI Radio Shuttle');
  });

  it('automation library includes all four Chinese vendors as first-class', () => {
    const ids = AUTOMATION_SEEDS.map((a) => a.system_id);
    expect(ids).toContain('geekplus_p_series');
    expect(ids).toContain('hai_haipick_acr');
    expect(ids).toContain('quicktron_multi_tier');
    expect(ids).toContain('libiao_cross_belt_sorter');
  });

  it('MHE library covers the 13 classes from the spec', () => {
    expect(MHE_SEEDS.length).toBeGreaterThanOrEqual(13);
  });

  it('productivity matrix uses all seven travel model types', () => {
    const types = new Set(PRODUCTIVITY_SEEDS.map((p) => p.travelModelType));
    for (const t of ['sqrt_area', 'sequential_hv', 'shuttle_cycle', 'crane_cycle', 'g2p_port', 'amr_fleet', 'zero']) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  it('building templates exist per region with regional seismic pass-through', () => {
    expect(BUILDING_SEEDS).toHaveLength(6);
    const idBld = BUILDING_SEEDS.find((b) => b.regionProfile === 'ID')!;
    expect(idBld.seismic.designCategory).toBe('D-E');
    expect(idBld.power.backupGeneratorKva).toBeGreaterThanOrEqual(750);
  });

  it('pallet library has T11 and 1200×1000 at minimum', () => {
    const ids = PALLET_SEEDS.map((p) => p.pallet_id);
    expect(ids).toContain('T11_1100x1100');
    expect(ids).toContain('PAL_1200x1000');
  });
});

describe('Phase 0 smoke — Zod boundary validation', () => {
  it('rejects channel mix that does not sum to 1.0', () => {
    const result = ChannelMixSchema.safeParse({
      retailB2bPct: 0.3, ecomDtcPct: 0.3, marketplacePct: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it('accepts well-formed CSV row', () => {
    const row = {
      id: 'SKU-001', name: 'Test Widget', category: 'FMCG',
      unitCubeCm3: 1000, unitWeightKg: 1.2, caseQty: 24,
      inboundPalletId: 'T11_1100x1100', outboundPalletId: 'T11_1100x1100',
      palletTi: 8, palletHi: 6, stackable: true,
      tempClass: 'ambient' as const, dgClass: 'none',
      halalStatus: 'halal' as const,
      channelMix: { retailB2bPct: 0.6, ecomDtcPct: 0.3, marketplacePct: 0.1 },
      isEventDrivenSeasonal: false,
    };
    const result = SkuCsvRowSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});
