import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import LiveAnalysis from '../LiveAnalysis.jsx';

const TAB_STYLE = (active) => ({
  padding: '9px 22px',
  border: 'none',
  borderBottom: active ? '3px solid #0078D4' : '3px solid transparent',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: active ? 700 : 400,
  color: active ? '#0078D4' : '#555',
  cursor: 'pointer',
  transition: 'all .15s',
  letterSpacing: '.01em',
});

function Root() {
  const [tab, setTab] = useState('estimator');

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh', background: 'var(--color-background-primary,#fff)' }}>
      {/* Top tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '0 16px',
        borderBottom: '1px solid #e5e7eb',
        background: 'white',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#0F2A47', marginRight: 24, padding: '10px 0', letterSpacing: '-0.02em' }}>
          ⚡ AzureCostIQ
        </div>
        <button style={TAB_STYLE(tab === 'estimator')} onClick={() => setTab('estimator')}>
          Cost Estimator
        </button>
        <button style={TAB_STYLE(tab === 'live')} onClick={() => setTab('live')}>
          Live Analyzer
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: '#0078D4', color: 'white', padding: '1px 6px', borderRadius: 10, letterSpacing: '.04em' }}>LIVE</span>
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#999', padding: '0 8px' }}>
          v4.0 · Azure Canada Central · No data leaves your environment
        </span>
      </div>

      {/* Tab content */}
      <div style={{ padding: tab === 'live' ? '0' : '0.75rem 1rem', maxWidth: tab === 'live' ? '100%' : 800, margin: '0 auto' }}>
        {tab === 'estimator' ? <App /> : <LiveAnalysis />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
