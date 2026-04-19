import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// ─────────────────────────────────────────────────────────────
// Top-level error boundary
//
// Catches two failure modes that produce a blank/cryptic screen:
//  1. window.ledger undefined — preload failed to run (wrong filename,
//     packaged without preload.cjs, Electron version mismatch)
//  2. Any other render-time throw before TanStack Router is mounted
// ─────────────────────────────────────────────────────────────

interface EBState {
  error: Error | null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isBridgeMissing =
      typeof window.ledger === 'undefined' ||
      error.message.toLowerCase().includes("cannot read properties of undefined") ||
      error.message.toLowerCase().includes("window.ledger");

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a0a',
          color: '#f5f5f5',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: '2rem' }}>⚠</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
          {isBridgeMissing ? 'IPC Bridge Not Available' : 'Something went wrong'}
        </h1>
        <p style={{ color: '#888', maxWidth: '480px', margin: 0, lineHeight: 1.6 }}>
          {isBridgeMissing
            ? 'The FXLedger preload script did not load. This usually means the app was packaged incorrectly. Please reinstall using the latest installer.'
            : error.message}
        </p>
        <pre
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            fontSize: '0.7rem',
            color: '#666',
            maxWidth: '600px',
            overflowX: 'auto',
            textAlign: 'left',
          }}
        >
          {error.stack ?? error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.5rem',
            background: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

// Guard: if window.ledger is not available at boot time (preload never ran),
// fail immediately with a clear message rather than letting the app start and
// crash on the first IPC call.
if (typeof window !== 'undefined' && typeof (window as Window & { ledger?: unknown }).ledger === 'undefined') {
  console.error(
    '[FXLedger] window.ledger is undefined — preload script did not execute. ' +
    'Check that preload.cjs is present in the dist-electron directory.',
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
