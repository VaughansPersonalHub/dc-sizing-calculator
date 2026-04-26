// Phase 10.1 — HelpDialog tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpDialog } from '../../src/ui/components/HelpDialog';

describe('Phase 10.1 — HelpDialog', () => {
  it('renders nothing when closed', () => {
    render(<HelpDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog with a labelled title when open', () => {
    render(<HelpDialog open={true} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'help-dialog-title');
    expect(screen.getByText(/Help & Reference/i)).toBeInTheDocument();
  });

  it('renders all three sections (shortcuts, tab map, glossary)', () => {
    render(<HelpDialog open={true} onClose={() => {}} />);
    expect(screen.getByText(/Keyboard shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText(/Tab map/i)).toBeInTheDocument();
    expect(screen.getByText(/Glossary/i)).toBeInTheDocument();

    // Spot-check content from each section.
    expect(screen.getByText(/Run engine on the active scenario/i)).toBeInTheDocument();
    expect(screen.getByText(/^Engagements$/)).toBeInTheDocument();
    expect(screen.getByText(/Pick-from-Pallet/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<HelpDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close help/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<HelpDialog open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<HelpDialog open={true} onClose={onClose} />);
    // The backdrop is the parent presentation div.
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when the dialog body itself is clicked', () => {
    const onClose = vi.fn();
    render(<HelpDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
