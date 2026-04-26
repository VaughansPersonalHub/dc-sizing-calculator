// Phase 10.2 — StepExplainer + step-explainers.ts content tests.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { STEP_EXPLAINERS } from '../../src/ui/help/step-explainers';
import { StepExplainerCard } from '../../src/ui/components/StepExplainer';

describe('Phase 10.2 — STEP_EXPLAINERS dataset', () => {
  it('covers every engine step that ships output to the user', () => {
    const ids = STEP_EXPLAINERS.map((s) => s.id);
    // Steps that have a result Card on Scenarios or are mandatory gates.
    const required = [
      'step-0-validation',
      'step-1-profiling',
      'step-2-growth',
      'step-3-slot-sizing',
      'step-4-bays',
      'step-4-5-clear-height',
      'step-4-6-seismic',
      'step-5-footprint',
      'step-6-throughput',
      'step-7-labour',
      'step-8-mhe',
      'step-9-docks',
      'step-10-support',
      'step-11-rollup',
      'step-12-automation',
      'step-14-tornado',
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it('each entry has every required field populated', () => {
    for (const s of STEP_EXPLAINERS) {
      expect(s.id).toMatch(/^step-/);
      expect(s.title).toBeTruthy();
      expect(s.number).toBeTruthy();
      expect(s.what.length).toBeGreaterThan(20);
      expect(s.formula.length).toBeGreaterThan(10);
      expect(s.inputs.length).toBeGreaterThan(0);
      expect(s.outputs.length).toBeGreaterThan(0);
      expect(s.assumptions.length).toBeGreaterThan(0);
      expect(s.sensitivity.length).toBeGreaterThan(10);
    }
  });

  it('ids are unique', () => {
    const ids = STEP_EXPLAINERS.map((s) => s.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });
});

describe('Phase 10.2 — StepExplainerCard', () => {
  const sample = STEP_EXPLAINERS.find((s) => s.id === 'step-7-labour')!;

  it('renders the title in the header', () => {
    render(<StepExplainerCard data={sample} />);
    expect(screen.getByText(/Step 7 · Labour/)).toBeInTheDocument();
  });

  it('starts collapsed by default — body content is hidden', () => {
    render(<StepExplainerCard data={sample} />);
    expect(screen.queryByText(/What it computes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(sample.what)).not.toBeInTheDocument();
  });

  it('expands when the toggle is clicked, revealing all sections', () => {
    render(<StepExplainerCard data={sample} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    expect(screen.getByText(/What it computes/i)).toBeInTheDocument();
    expect(screen.getByText(sample.what)).toBeInTheDocument();
    expect(screen.getByText(/Inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/Outputs/i)).toBeInTheDocument();
    expect(screen.getByText(/Assumptions baked in/i)).toBeInTheDocument();
    expect(screen.getByText(/Sensitivity/i)).toBeInTheDocument();
  });

  it('respects defaultOpen=true', () => {
    render(<StepExplainerCard data={sample} defaultOpen />);
    expect(screen.getByText(/What it computes/i)).toBeInTheDocument();
  });

  it('renders an anchor id for #step-X URL fragments', () => {
    const { container } = render(<StepExplainerCard data={sample} />);
    expect(container.querySelector('#step-7-labour')).toBeTruthy();
  });

  it('renders aria-expanded on the toggle button', () => {
    render(<StepExplainerCard data={sample} />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
