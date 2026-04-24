// Phase 1.5 gate: the Engagement Setup Wizard must apply halal + Surau +
// Ramadan defaults when the user picks Malaysia. This test isolates the
// pure-function side of the wizard (regional defaults derivation), which
// is the part the gate actually measures. The UI submit flow is covered
// by the Playwright e2e suite once the API is reachable in CI.

import { describe, it, expect } from 'vitest';
import {
  buildDefaultOpsProfile,
  regionalFeatureFlags,
} from '../../src/regional/opsProfileDefaults';
import { REGIONAL_PROFILES } from '../../src/regional/profiles';

describe('Phase 1.5 gate — MY wizard surfaces halal + Surau + Ramadan', () => {
  it('regionalFeatureFlags(MY) enables halal + Surau + Ramadan', () => {
    const f = regionalFeatureFlags('MY');
    expect(f.halalCertifiedRequired).toBe(true);
    expect(f.surauRequired).toBe(true);
    expect(f.ramadanDerate.active).toBe(true);
    expect(f.ramadanDerate.factor).toBeCloseTo(0.82);
    expect(f.ramadanDerate.days).toBe(30);
  });

  it('regionalFeatureFlags(ID) matches MY for halal/Surau/Ramadan', () => {
    const my = regionalFeatureFlags('MY');
    const id = regionalFeatureFlags('ID');
    expect(id.halalCertifiedRequired).toBe(my.halalCertifiedRequired);
    expect(id.surauRequired).toBe(my.surauRequired);
    expect(id.ramadanDerate).toEqual(my.ramadanDerate);
    expect(id.backupGeneratorMandatory).toBe(true); // ID-specific
  });

  it('regionalFeatureFlags(KR) leaves halal/Surau/Ramadan off', () => {
    const f = regionalFeatureFlags('KR');
    expect(f.halalCertifiedRequired).toBe(false);
    expect(f.surauRequired).toBe(false);
    expect(f.ramadanDerate.active).toBe(false);
  });

  it('SG ops profile uses 20m cross-aisle per SCDF', () => {
    const ops = buildDefaultOpsProfile({
      engagementId: 'eng-sg-1',
      region: 'SG',
      halalCertifiedRequired: false,
    });
    expect(ops.crossAisleSpacingM).toBe(20);
    expect(REGIONAL_PROFILES.SG.crossAisleSpacingM).toBe(20);
  });

  it('VN ops profile uses 2x10h shift (20h day) per region defaults', () => {
    const ops = buildDefaultOpsProfile({
      engagementId: 'eng-vn-1',
      region: 'VN',
      halalCertifiedRequired: false,
    });
    expect(ops.shiftsPerDay).toBe(2);
    expect(ops.hoursPerShift).toBe(10);
    // productive hours = 2×10 − (40/60)×2 = 18.67
    expect(ops.productiveHoursPerDay).toBeCloseTo(18.67, 1);
  });

  it('custom region produces a usable ops profile with base defaults', () => {
    const ops = buildDefaultOpsProfile({
      engagementId: 'eng-custom-1',
      region: 'custom',
      halalCertifiedRequired: false,
    });
    expect(ops.operatingDaysPerYear).toBe(300);
    expect(ops.crossAisleSpacingM).toBe(22);
  });
});
