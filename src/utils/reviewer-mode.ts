// Phase 10.7.6 — Reviewer mode preference.
//
// Operator default = reviewer mode OFF: tabs render compact step
// explainers and tooltip-only provenance, suited to running an
// engagement quickly. Reviewer mode ON expands everything by default
// so a sceptical reviewer can read the math without a single click.
//
// Persisted to localStorage so the preference rides through tab
// reloads and per-tab navigation. Mirrors the intro-tour flag pattern.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dc-sizing-reviewer-mode';
const CHANGED_EVENT = 'dc-sizing:reviewer-mode-changed';

function safeLocalStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    // Storage blocked (privacy mode, sandbox).
  }
  return null;
}

export function isReviewerMode(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  return ls.getItem(STORAGE_KEY) === '1';
}

export function setReviewerMode(value: boolean): void {
  const ls = safeLocalStorage();
  if (ls) {
    if (value) ls.setItem(STORAGE_KEY, '1');
    else ls.removeItem(STORAGE_KEY);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }
}

/**
 * React hook returning the current reviewer-mode flag and a setter.
 * Subscribes to the dispatched change event so toggles in one
 * component propagate to every consumer.
 */
export function useReviewerMode(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => isReviewerMode());

  useEffect(() => {
    function onChange() {
      setValue(isReviewerMode());
    }
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  return [value, setReviewerMode];
}

export const REVIEWER_MODE_STORAGE_KEY = STORAGE_KEY;
export const REVIEWER_MODE_CHANGED_EVENT = CHANGED_EVENT;
