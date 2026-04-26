// Phase 9 — top-level + per-tab error boundary.
//
// React error boundaries must be class components (hooks can't catch
// child render errors). Wraps each tab in TabShell so a worker crash
// or hydration failure doesn't blank the whole app.
//
// On error: shows a panel with the error message + a "Try again" button
// that resets the boundary state. Errors are also forwarded to the
// console for the network tab / sentry attachment in Phase 9 polish.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  /** Friendly label used in the fallback ("the {scope} tab"). Defaults to "this view". */
  scope?: string;
  /** When the value of `resetKey` changes, the boundary resets automatically.
   *  Lets the parent (e.g. router) clear errors on navigation. */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so the user can copy-paste into a bug report. In a
    // future polish pass this becomes a Sentry / Cloudflare Pages Function
    // hook.
    console.error('[ErrorBoundary]', this.props.scope ?? 'view', error, info);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      const scope = this.props.scope ?? 'this view';
      return (
        <div className="p-6 max-w-2xl">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-destructive">
                  Something went wrong in {scope}.
                </h2>
                <p className="text-xs text-destructive/80 mt-1">
                  The error was contained — the rest of the app is still
                  responsive. Try the action again, or reload if it
                  persists.
                </p>
              </div>
            </div>
            <pre className="mt-2 text-[11px] whitespace-pre-wrap break-all font-mono text-destructive/80 bg-destructive/5 rounded-sm p-2 max-h-40 overflow-auto">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={this.reset}
              className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border border-destructive/40 text-destructive hover:bg-destructive/15"
            >
              <RefreshCcw className="h-3 w-3" />
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
