import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort crash screen: a rendering error shows a friendly page with the
 * details and a restart button instead of a blank window. Backend panics are
 * separately captured to the diagnostic log by the Rust panic hook.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot-screen">
        <h1>Something went wrong</h1>
        <p>Sentinel hit an unexpected error while drawing this screen.</p>
        <pre className="crash-details">{String(this.state.error)}</pre>
        <p>
          Restarting usually fixes it. If it keeps happening, use About → Export diagnostics
          and check the log.
        </p>
        <button className="refresh-btn" onClick={() => window.location.reload()}>
          Restart Sentinel
        </button>
      </div>
    );
  }
}
