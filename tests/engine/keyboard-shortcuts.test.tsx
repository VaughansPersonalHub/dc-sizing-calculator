// Phase 9 chunk 2 — keyboard shortcut hook tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  useKeyboardShortcuts,
  SHORTCUT_RUN_ENGINE_EVENT,
  SHORTCUT_RUN_TORNADO_EVENT,
  SHORTCUT_CLEAR_SELECTION_EVENT,
} from '../../src/ui/hooks/useKeyboardShortcuts';

function dispatchKey(key: string, target: EventTarget = document.body): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Phase 9 — useKeyboardShortcuts', () => {
  let runEngineSpy: ReturnType<typeof vi.fn>;
  let runTornadoSpy: ReturnType<typeof vi.fn>;
  let clearSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runEngineSpy = vi.fn();
    runTornadoSpy = vi.fn();
    clearSpy = vi.fn();
    document.addEventListener(SHORTCUT_RUN_ENGINE_EVENT, runEngineSpy);
    document.addEventListener(SHORTCUT_RUN_TORNADO_EVENT, runTornadoSpy);
    document.addEventListener(SHORTCUT_CLEAR_SELECTION_EVENT, clearSpy);
  });

  afterEach(() => {
    document.removeEventListener(SHORTCUT_RUN_ENGINE_EVENT, runEngineSpy);
    document.removeEventListener(SHORTCUT_RUN_TORNADO_EVENT, runTornadoSpy);
    document.removeEventListener(SHORTCUT_CLEAR_SELECTION_EVENT, clearSpy);
  });

  it('R key dispatches the run-engine event', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    dispatchKey('r');
    expect(runEngineSpy).toHaveBeenCalledTimes(1);
  });

  it('T key dispatches the run-tornado event', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    dispatchKey('t');
    expect(runTornadoSpy).toHaveBeenCalledTimes(1);
  });

  it('Escape dispatches the clear-selection event', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    dispatchKey('Escape');
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts while typing in an input', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    dispatchKey('r', input);
    expect(runEngineSpy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('ignores shortcuts modified with Ctrl/Meta', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    const event = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true });
    document.body.dispatchEvent(event);
    expect(runEngineSpy).not.toHaveBeenCalled();
  });

  it('ignores digits outside 1-7', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });
    dispatchKey('8');
    dispatchKey('9');
    dispatchKey('0');
    // None of the run/clear handlers should fire for digits, and there's
    // no navigation observer here — just confirm we didn't accidentally
    // dispatch one of the named events for an out-of-range digit.
    expect(runEngineSpy).not.toHaveBeenCalled();
    expect(runTornadoSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
