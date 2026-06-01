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
    case 'aircraft': return `FL${Math.round((t.altitude || 0) / 100)} · ${Math.round(t.speed || 0)}kt`;
    case 'ship': return `${t.destination} · ${Number(t.speed).toFixed(1)}kt`;
    case 'satellite': return `${t.altitude}km · ${t.velocity}km/s`;
    case 'cctv': return `${t.status} · ${t.resolution}`;
    default: return '';
  }
}

const ROW_CAP = 150; // keep the DOM light when thousands are tracked

export default function Sidebar() {
  const [tab, setTab] = useState('aircraft');
  const tracks = useStore(s => s.tracks);
  const selectedId = useStore(s => s.selectedId);
  const select = useStore(s => s.select);

  const satCount = useStore(s => s.satCount);
  const counts = tracks.reduce((a, t) => ((a[t.type] = (a[t.type] || 0) + 1), a), {});
  counts.satellite = satCount; // satellites render via worker, not the track list
  const allRows = tracks.filter(t => t.type === tab);
  const rows = allRows.slice(0, ROW_CAP);

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
        {allRows.length > ROW_CAP && (
          <div className="list-more">showing {ROW_CAP} of {allRows.length.toLocaleString()} — zoom the globe to explore the rest</div>
        )}
        {tab === 'satellite' && (
          <div className="list-more">{satCount.toLocaleString()} satellites propagated live (SGP4) — rendered on the globe, too many to list</div>
        )}
        {tab !== 'satellite' && allRows.length === 0 && <div className="list-more">acquiring feed…</div>}
      </div>
    </aside>
  );
}
