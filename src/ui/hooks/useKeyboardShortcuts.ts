// Phase 9 — global keyboard shortcuts.
//
// Mounted once at TabShell scope. Listens for keydown on the document and
// either:
//   - navigates to a tab (digits 1-7)
//   - emits a document CustomEvent that the relevant tab can subscribe to
//     (engine run, tornado run, clear selection)
//
// Tabs that want to react to a shortcut do so via the named events so the
// dispatcher stays decoupled from tab internals.
//
// Shortcuts are no-ops while the user is typing in an input / textarea /
// contenteditable region, so they don't fight with normal text entry.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const SHORTCUT_RUN_ENGINE_EVENT = 'shortcut:run-engine';
export const SHORTCUT_RUN_TORNADO_EVENT = 'shortcut:run-tornado';
export const SHORTCUT_CLEAR_SELECTION_EVENT = 'shortcut:clear-selection';
export const SHORTCUT_SHOW_HELP_EVENT = 'shortcut:show-help';

/**
 * Skip dispatching tab-level shortcuts (Esc → clear selection, R, T) when
 * a modal dialog is open — the dialog handles its own keys, and we don't
 * want Esc both closing the dialog AND clearing layout selection.
 */
function isModalDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** TabShell's TABS list, mirrored as an array for digit-based navigation. */
const TAB_PATHS: string[] = [
  '/engagements',
  '/inputs',
  '/reference',
  '/design-rules',
  '/scenarios',
  '/outputs',
  '/layout',
];

export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    function isEditing(e: KeyboardEvent): boolean {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave OS / browser shortcuts alone
      if (isEditing(e)) return;

      // Digit keys 1-7 → tab nav.
      if (e.key >= '1' && e.key <= '7') {
        const index = parseInt(e.key, 10) - 1;
        const path = TAB_PATHS[index];
        if (path) {
          e.preventDefault();
          navigate(path);
          return;
        }
      }

      // "?" opens the help dialog. Always allowed even with a dialog open
      // (idempotent), and intentionally before the dialog-open guard so a
      // user can toggle help from anywhere.
      if (e.key === '?') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent(SHORTCUT_SHOW_HELP_EVENT));
        return;
      }

      // When a modal dialog is open, defer Esc / R / T to the dialog so we
      // don't fire layout-level handlers while the user is interacting with
      // a modal.
      if (isModalDialogOpen()) return;

      const k = e.key.toLowerCase();
      if (k === 'r') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent(SHORTCUT_RUN_ENGINE_EVENT));
      } else if (k === 't') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent(SHORTCUT_RUN_TORNADO_EVENT));
      } else if (e.key === 'Escape') {
        document.dispatchEvent(new CustomEvent(SHORTCUT_CLEAR_SELECTION_EVENT));
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
