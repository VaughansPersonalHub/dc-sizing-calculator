// Phase 10.7.6 — Reviewer-mode preference tests.

import { beforeEach, describe, it, expect } from 'vitest';
import {
  isReviewerMode,
  setReviewerMode,
  REVIEWER_MODE_STORAGE_KEY,
  REVIEWER_MODE_CHANGED_EVENT,
} from '../../src/utils/reviewer-mode';

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 10.7.6 — reviewer mode storage', () => {
  it('defaults to off', () => {
    expect(isReviewerMode()).toBe(false);
  });

  it('writes 1 to localStorage when enabled', () => {
    setReviewerMode(true);
    expect(localStorage.getItem(REVIEWER_MODE_STORAGE_KEY)).toBe('1');
    expect(isReviewerMode()).toBe(true);
  });

  it('removes the key when disabled', () => {
    setReviewerMode(true);
    setReviewerMode(false);
    expect(localStorage.getItem(REVIEWER_MODE_STORAGE_KEY)).toBeNull();
    expect(isReviewerMode()).toBe(false);
  });

  it('dispatches the change event when toggled', () => {
    let fired = 0;
    const handler = () => {
      fired += 1;
    };
    window.addEventListener(REVIEWER_MODE_CHANGED_EVENT, handler);
    setReviewerMode(true);
    setReviewerMode(false);
    setReviewerMode(true);
    window.removeEventListener(REVIEWER_MODE_CHANGED_EVENT, handler);
    expect(fired).toBe(3);
  });
});
