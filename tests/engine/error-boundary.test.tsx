// Phase 9 chunk 1 — ErrorBoundary tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary';

function Crash({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

describe('Phase 9 — ErrorBoundary', () => {
  beforeEach(() => {
    // React logs unhandled-error noise to console.error; keep the test
    // output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary scope="the test view">
        <p>healthy</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('catches a child render error and shows the fallback panel', () => {
    render(
      <ErrorBoundary scope="the test view">
        <Crash message="kaboom" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong in the test view/)).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('clears the error when resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary scope="the test view" resetKey="a">
        <Crash message="first" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    rerender(
      <ErrorBoundary scope="the test view" resetKey="b">
        <p>recovered</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('reset button clears the error in place', () => {
    let shouldCrash = true;
    function Toggle(): JSX.Element {
      if (shouldCrash) throw new Error('try-again-test');
      return <p>healed</p>;
    }
    const { rerender } = render(
      <ErrorBoundary scope="the test view">
        <Toggle />
      </ErrorBoundary>
    );
    expect(screen.getByText(/try-again-test/)).toBeInTheDocument();
    shouldCrash = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    rerender(
      <ErrorBoundary scope="the test view">
        <Toggle />
      </ErrorBoundary>
    );
    expect(screen.getByText('healed')).toBeInTheDocument();
  });
});
