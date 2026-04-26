// Phase 7 chunk 3 — SVG export helpers + infeasibility roll-up tests.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runLayoutSolver } from '../../src/ui/layout-renderer/solver';
import { serialiseSvg } from '../../src/ui/layout-renderer/export';
import {
  OPS,
  PALLETS,
  RACK,
  ENVELOPE,
  PRODUCTIVITY,
  MHE,
  REGIONAL,
  mkSku,
} from './fixtures';
import type { EngineSku, EngineBuildingEnvelope } from '../../src/engine/models';

const baseInputs = {
  opsProfile: OPS,
  pallets: PALLETS,
  racks: [RACK],
  envelope: ENVELOPE,
  productivity: PRODUCTIVITY,
  mheLibrary: MHE,
  regional: REGIONAL,
  halalRequired: false,
};

describe('Phase 7 — Infeasibility roll-up', () => {
  it('exposes shortfall numbers in addition to the boolean flags', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    expect(layout.infeasibility.requiredRackHeightMm).toBeGreaterThan(0);
    expect(layout.infeasibility.usableRackHeightMm).toBeGreaterThan(0);
    expect(layout.infeasibility.staticSlabUdlTPerM2).toBeGreaterThan(0);
    expect(layout.infeasibility.slabCapacityTPerM2).toBe(ENVELOPE.floor.slabLoadingTPerM2);
    expect(layout.infeasibility.seismicMassT).toBeGreaterThanOrEqual(0);
    expect(layout.infeasibility.allowableSeismicMassT).toBeGreaterThan(0);
  });

  it('flips slabFail + envelopeOverflow when an under-spec envelope is used', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 5000));
    const tinyEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      envelope: { lengthM: 30, widthM: 30 },
      floor: { slabLoadingTPerM2: 0.5, totalFloorAreaM2: 900 },
    };
    const result = runPipeline({ skus, ...baseInputs, envelope: tinyEnv });
    const layout = runLayoutSolver({ result, envelope: tinyEnv });
    expect(layout.infeasibility.envelopeOverflow).toBe(true);
    expect(layout.infeasibility.envelopeShortfallM2).toBeGreaterThan(0);
    expect(layout.infeasibility.slabFail).toBe(true);
    expect(layout.infeasibility.staticSlabUdlTPerM2).toBeGreaterThan(
      layout.infeasibility.slabCapacityTPerM2
    );
  });
});

describe('Phase 7 — SVG export helper', () => {
  it('serialises a minimal SVG with xmlns + xml prologue', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '50');
    rect.setAttribute('fill', '#0ea5e9');
    svg.appendChild(rect);
    const out = serialiseSvg(svg);
    expect(out.startsWith('<?xml')).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('<rect');
    expect(out).toContain('fill="#0ea5e9"');
  });

  it('does not mutate the source SVG when adding namespaces', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(svg.getAttribute('xmlns')).toBeNull();
    serialiseSvg(svg);
    // Source SVG should remain free of xmlns — the helper clones first.
    expect(svg.getAttribute('xmlns')).toBeNull();
  });
});
