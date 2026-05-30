import React from 'react';
import { useStore, selectedTrack } from '../store.js';
import ActivityFeed from './ActivityFeed.jsx';

const FIELDS = {
  aircraft: t => [
    ['Callsign', t.callsign], ['Registration', t.registration],
    ['Aircraft', t.model], ['Squawk', t.squawk],
    ['Altitude', `${t.altitude.toLocaleString()} ft`], ['Ground Speed', `${Math.round(t.speed)} kt`],
    ['Heading', `${Math.round(t.heading)}°`], ['Route', `${t.from} → ${t.to}`],
  ],
  ship: t => [
    ['Vessel', t.name], ['MMSI', t.mmsi],
    ['Type', t.shipType], ['Destination', t.destination],
    ['Speed', `${t.speed.toFixed(1)} kt`], ['Heading', `${Math.round(t.heading)}°`],
    ['Draught', `${t.draught} m`], ['Source', t.source],
  ],
  satellite: t => [
    ['Object', t.name], ['NORAD ID', t.noradId],
    ['Altitude', `${t.altitude} km`], ['Velocity', `${t.velocity} km/s`],
    ['Inclination', `${t.inclination}°`], ['Period', `${t.period} min`],
    ['Source', t.source], ['Catalog', 'TLE'],
  ],
  cctv: t => [
    ['Camera', t.name], ['Status', t.status],
    ['Resolution', t.resolution], ['Source', t.source],
  ],
};

export default function DetailPanel() {
  const sel = useStore(selectedTrack);

  return (
    <aside className="panel">
      <div className="detail">
        {!sel ? (
          <div className="empty">◎ NO OBJECT SELECTED<br /><br />Select a track from the list<br />or click a blip on the globe.</div>
        ) : (
          <>
            <div className="hd">
              <span className="dot" style={{ background: sel.color, color: sel.color }} />
              <h2>{sel.callsign || sel.name}</h2>
            </div>
            <div className="type">{sel.type} · {sel.source}</div>
            <div className="kv">
              {FIELDS[sel.type](sel).map(([k, v]) => (
                <div key={k}>
                  <div className="k">{k}</div>
                  <div className="v mono">{v}</div>
                </div>
              ))}
              <div>
                <div className="k">Position</div>
                <div className="v mono">{sel.lat.toFixed(3)}, {sel.lng.toFixed(3)}</div>
              </div>
            </div>
          </>
        )}
      </div>
      <ActivityFeed />
    </aside>
  );
}
