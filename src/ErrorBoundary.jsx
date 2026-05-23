import { Component } from 'react';

/**
 * React error boundary — catches render-time errors in child components and
 * displays a fallback UI instead of a blank/crashed screen.
 *
 * Usage: wrap any subtree that may throw:
 *   <ErrorBoundary label="Live Analyzer"><LiveAnalysis /></ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, { componentStack }) {
    console.error('[ErrorBoundary]', error.message, componentStack);
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const label = this.props.label || 'This section';

    return (
      <div style={{
        padding: '48px 24px',
        textAlign: 'center',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        color: '#333',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', color: '#b91c1c', fontSize: 18 }}>
          {label} encountered an error
        </h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: 14 }}>
          {this.state.error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => this.reset()}
          style={{
            padding: '8px 20px',
            background: '#0078D4',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
