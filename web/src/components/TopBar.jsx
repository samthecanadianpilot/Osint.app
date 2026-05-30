import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { LAYER_COLORS } from '../data/seed.js';

const LAYERS = [
  { type: 'aircraft', label: 'PLANES' },
  { type: 'ship', label: 'SHIPS' },
  { type: 'satellite', label: 'SATS' },
  { type: 'cctv', label: 'CCTV' },
];

function useUTC() {
  const [t, setT] = useState('--:--:--');
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export default function TopBar() {
  const filters = useStore(s => s.filters);
  const toggleFilter = useStore(s => s.toggleFilter);
  const mode = useStore(s => s.mode);
  const connected = useStore(s => s.connected);
  const utc = useUTC();

  const live = mode === 'live' && connected;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="glyph" />
        <h1>OSINT Central <span className="ver">v0.1</span></h1>
      </div>

      <div className="filters">
        {LAYERS.map(l => {
          const on = filters[l.type];
          return (
            <button
              key={l.type}
              className={`filt${on ? '' : ' off'}`}
              onClick={() => toggleFilter(l.type)}
            >
              <span className="sw" style={{ background: LAYER_COLORS[l.type], boxShadow: `0 0 7px ${LAYER_COLORS[l.type]}` }} />
              {l.label}
            </button>
          );
        })}
      </div>

      <div className="status">
        <span className={`conn${live ? '' : ' sim'}`}>
          <span className="d" />
          {live ? 'LIVE FEED' : 'LOCAL SIM'}
        </span>
        <span>UTC <span className="clock">{utc}</span></span>
      </div>
    </header>
  );
}
