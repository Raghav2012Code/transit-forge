import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearSavedData, describeFailure } from './failure.ts';

interface State {
  failed: boolean;
  error: unknown;
}

/** Last line of defence: a plain message instead of a blank page. Errors thrown in effects (such as WebGL start-up) reach it too. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('TransitForge stopped', error, info.componentStack);
  }

  private reload = () => location.reload();

  private reset = () => {
    try {
      clearSavedData(localStorage);
    } catch {
      // Storage can be blocked; reloading is still worth doing.
    }
    location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const f = describeFailure(this.state.error);
    return (
      <div className="tf-fatal" role="alert">
        <h1>{f.title}</h1>
        <p>{f.detail}</p>
        <div className="tf-fatal-actions">
          <button type="button" className="tf-btn" onClick={this.reload}>Reload</button>
          {f.kind === 'crash' && (
            <button type="button" className="tf-btn" onClick={this.reset}>Reset saved data and reload</button>
          )}
        </div>
      </div>
    );
  }
}
