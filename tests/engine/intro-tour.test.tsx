// Phase 10.4 — IntroTour modal tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntroTour } from '../../src/ui/components/IntroTour';
import {
  TOUR_STEPS,
  hasSeenTour,
  markTourSeen,
  clearTourSeen,
} from '../../src/ui/help/tour-steps';

describe('Phase 10.4 — TOUR_STEPS', () => {
  it('has exactly 7 steps as the SPEC promises', () => {
    expect(TOUR_STEPS.length).toBe(7);
  });

  it('walks the happy path in order: Engagements → Inputs ×2 → Scenarios ×2 → Layout → Outputs', () => {
    const tabs = TOUR_STEPS.map((s) => s.tab);
    expect(tabs).toEqual([
      'engagements',
      'inputs',
      'inputs',
      'scenarios',
      'scenarios',
      'layout',
      'outputs',
    ]);
  });

  it('every step has a meaningful title and body', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.body.length).toBeGreaterThan(50);
    }
  });

  it('step indices are 1..7', () => {
    expect(TOUR_STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('Phase 10.4 — IntroTour persistence helpers', () => {
  beforeEach(() => {
    clearTourSeen();
  });

  it('hasSeenTour returns false when not set', () => {
    expect(hasSeenTour()).toBe(false);
  });

  it('markTourSeen sets the flag and hasSeenTour reflects it', () => {
    markTourSeen('completed');
    expect(hasSeenTour()).toBe(true);
  });

  it('markTourSeen handles "skipped" state too', () => {
    markTourSeen('skipped');
    expect(hasSeenTour()).toBe(true);
  });

  it('clearTourSeen restores the unseen state', () => {
    markTourSeen('completed');
    clearTourSeen();
    expect(hasSeenTour()).toBe(false);
  });
});

describe('Phase 10.4 — IntroTour modal', () => {
  beforeEach(() => {
    clearTourSeen();
  });

  it('renders nothing when closed', () => {
    render(<IntroTour open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a labelled dialog when open with the first step body', () => {
    render(<IntroTour open={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'intro-tour-title');
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('Next advances through steps and the last step shows "Got it"', () => {
    render(<IntroTour open={true} onClose={() => {}} />);
    // Steps 1..7 — click Next 6 times to reach the final step.
    for (let i = 1; i <= 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    }
    expect(screen.getByText(TOUR_STEPS[6].title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
  });

  it('"Got it" calls onClose and marks tour completed', () => {
    const onClose = vi.fn();
    render(<IntroTour open={true} onClose={onClose} />);
    for (let i = 1; i <= 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenTour()).toBe(true);
  });

  it('Skip closes immediately and marks the tour seen', () => {
    const onClose = vi.fn();
    render(<IntroTour open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenTour()).toBe(true);
  });

  it('Back is disabled on first step', () => {
    render(<IntroTour open={true} onClose={() => {}} />);
    const back = screen.getByRole('button', { name: /Back/i });
    expect(back).toBeDisabled();
  });

  it('startAt prop opens the tour at the given step', () => {
    render(<IntroTour open={true} onClose={() => {}} startAt={4} />);
    expect(screen.getByText(TOUR_STEPS[3].title)).toBeInTheDocument();
  });
});
