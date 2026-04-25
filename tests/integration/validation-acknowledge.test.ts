// Phase 2.5 gate: validation acknowledgement state machine. The
// dashboard hash-locks an acknowledgement to the SKU set at the moment
// the user clicked through. Any subsequent CSV import / auto-fix /
// regional-flag flip must invalidate it so the engine re-blocks until
// the user looks at the new state.

import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../../src/stores/engine.store';
import type { ValidationSummary } from '../../src/stores/engine.store';

function summary(inputHash: string, fatalCount = 0, warningCount = 0): ValidationSummary {
  return {
    fatalErrors: Array.from({ length: fatalCount }, (_, i) => ({
      skuId: `F${i}`,
      code: 'NEGATIVE_DEMAND',
      message: 'fatal',
      severity: 'fatal',
    })),
    warnings: Array.from({ length: warningCount }, (_, i) => ({
      skuId: `W${i}`,
      code: 'PARTIAL_HISTORY',
      message: 'warning',
      severity: 'warning',
    })),
    suppressedSkus: [],
    stats: {
      totalSkus: 100,
      cleanSkus: 100 - fatalCount - warningCount,
      warningSkus: warningCount,
      fatalSkus: fatalCount,
      suppressedSkus: 0,
      codesByCount: {},
    },
    ranAt: '2026-04-25T00:00:00Z',
    inputHash,
  };
}

describe('Phase 2.5 — validation acknowledgement gate', () => {
  beforeEach(() => {
    useEngineStore.setState({
      lastValidation: null,
      validationAcknowledgedHash: null,
      lastResult: null,
      lastResultHash: null,
    });
  });

  it('starts unacknowledged with no validation', () => {
    expect(useEngineStore.getState().validationAcknowledgedHash).toBeNull();
  });

  it('acknowledgeValidation snapshots the current input hash', () => {
    useEngineStore.getState().setValidation(summary('hash-A'));
    useEngineStore.getState().acknowledgeValidation();
    expect(useEngineStore.getState().validationAcknowledgedHash).toBe('hash-A');
  });

  it('drops the acknowledgement when a fresh validation arrives with a different hash', () => {
    useEngineStore.getState().setValidation(summary('hash-A'));
    useEngineStore.getState().acknowledgeValidation();
    expect(useEngineStore.getState().validationAcknowledgedHash).toBe('hash-A');

    // Simulate a CSV import → new hash
    useEngineStore.getState().setValidation(summary('hash-B'));
    expect(useEngineStore.getState().validationAcknowledgedHash).toBeNull();
  });

  it('re-running validation with the same hash keeps the acknowledgement', () => {
    useEngineStore.getState().setValidation(summary('hash-A'));
    useEngineStore.getState().acknowledgeValidation();
    useEngineStore.getState().setValidation(summary('hash-A')); // Re-run, same set
    expect(useEngineStore.getState().validationAcknowledgedHash).toBe('hash-A');
  });

  it('invalidate() clears both validation and acknowledgement', () => {
    useEngineStore.getState().setValidation(summary('hash-A'));
    useEngineStore.getState().acknowledgeValidation();
    useEngineStore.getState().invalidate('new-input-hash');
    expect(useEngineStore.getState().lastValidation).toBeNull();
    expect(useEngineStore.getState().validationAcknowledgedHash).toBeNull();
  });
});
