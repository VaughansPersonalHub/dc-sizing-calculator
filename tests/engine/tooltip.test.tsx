// Phase 10.1 — Tooltip + InfoTip primitive tests.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../../src/ui/components/Tooltip';
import { InfoTip } from '../../src/ui/components/InfoTip';

describe('Phase 10.1 — Tooltip', () => {
  it('hides the tooltip content by default', () => {
    render(
      <Tooltip content="Help text">
        <button>Trigger</button>
      </Tooltip>
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on mouse enter and hides on mouse leave', () => {
    render(
      <Tooltip content="Halal certification adds 5% area uplift">
        <button>Halal</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole('button', { name: 'Halal' }).parentElement!.parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/halal certification adds 5%/i);
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on focus and hides on blur', () => {
    render(
      <Tooltip content="Run engine on baseline">
        <button>Run</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole('button', { name: 'Run' }).parentElement!.parentElement!;
    fireEvent.focus(wrapper);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/run engine on baseline/i);
    fireEvent.blur(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides on Escape key', () => {
    render(
      <Tooltip content="Tip">
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole('button', { name: 'Trigger' }).parentElement!.parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(wrapper, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('wires aria-describedby from the trigger to the tooltip while open', () => {
    render(
      <Tooltip content="Sample">
        <button>Trigger</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole('button', { name: 'Trigger' }).parentElement!.parentElement!;
    fireEvent.mouseEnter(wrapper);
    const tooltip = screen.getByRole('tooltip');
    // The describedby span is the parent of the trigger button.
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    expect(trigger.parentElement).toHaveAttribute('aria-describedby', tooltip.id);
  });
});

describe('Phase 10.1 — InfoTip', () => {
  it('renders an accessible icon button with default "More info" label', () => {
    render(<InfoTip content="Cycle time formula" />);
    expect(screen.getByRole('button', { name: 'More info' })).toBeInTheDocument();
  });

  it('shows the tooltip content on hover', () => {
    render(<InfoTip content="JAKIM 2018 housing guidance" label="Surau ratio source" />);
    const button = screen.getByRole('button', { name: 'Surau ratio source' });
    fireEvent.mouseEnter(button.parentElement!.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/JAKIM 2018 housing guidance/);
  });
});
