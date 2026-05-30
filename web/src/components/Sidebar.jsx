import React, { useState } from 'react';
import { useStore } from '../store.js';

const TABS = [
  { type: 'aircraft', label: 'Planes' },
  { type: 'ship', label: 'Ships' },
  { type: 'satellite', label: 'Sats' },
  { type: 'cctv', label: 'CCTV' },
];

function subtitle(t) {
  switch (t.type) {
    case 'aircraft': return `${t.from}→${t.to} · FL${Math.round(t.altitude / 100)}`;
    case 'ship': return `${t.destination} · ${t.speed.toFixed(1)}kt`;
    case 'satellite': return `${t.altitude}km · ${t.velocity}km/s`;
    case 'cctv': return `${t.status} · ${t.resolution}`;
    default: return '';
  }
}

export default function Sidebar() {
  const [tab, setTab] = useState('aircraft');
  const tracks = useStore(s => s.tracks);
  const selectedId = useStore(s => s.selectedId);
  const select = useStore(s => s.select);

  const counts = tracks.reduce((a, t) => ((a[t.type] = (a[t.type] || 0) + 1), a), {});
  const rows = tracks.filter(t => t.type === tab);

  return (
    <aside className="sidebar">
      <div className="tabs">
        {TABS.map(t => (
          <div
            key={t.type}
            className={`tab${tab === t.type ? ' active' : ''}`}
            onClick={() => setTab(t.type)}
          >
            {t.label}<span className="ct">{counts[t.type] || 0}</span>
          </div>
        ))}
      </div>

      <div className="list">
        {rows.map(t => (
          <div
            key={t.id}
            className={`row${selectedId === t.id ? ' sel' : ''}`}
            onClick={() => select(t.id)}
          >
            <span className="dot" style={{ background: t.color, color: t.color }} />
            <div className="main-l">
              <div className="nm">{t.callsign || t.name}</div>
              <div className="sub">{subtitle(t)}</div>
            </div>
            <span className="src">{t.source}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
