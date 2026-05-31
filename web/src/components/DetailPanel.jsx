import React, { useEffect, useState } from 'react';
import { useStore, selectedTrack } from '../store.js';
import ActivityFeed from './ActivityFeed.jsx';

// Aircraft photo via Planespotters (by ICAO hex, then registration).
function AircraftPhoto({ hex, reg }) {
  const [photo, setPhoto] = useState(undefined); // undefined=loading, null=none
  useEffect(() => {
    let alive = true;
    setPhoto(undefined);
    const qs = new URLSearchParams();
    if (hex) qs.set('hex', hex);
    if (reg && reg !== 'N/A') qs.set('reg', reg);
    fetch(`/api/photo?${qs}`)
      .then(r => r.json())
      .then(j => { if (alive) setPhoto(j.photo || null); })
      .catch(() => { if (alive) setPhoto(null); });
    return () => { alive = false; };
  }, [hex, reg]);

  if (photo === undefined) return <div className="acphoto loading">loading photo…</div>;
  if (!photo) return null;
  return (
    <a className="acphoto" href={photo.link} target="_blank" rel="noreferrer">
      <img src={photo.thumb} alt="aircraft" loading="lazy" />
      <span className="cred">© {photo.photographer} · Planespotters</span>
    </a>
  );
}

const FIELDS = {
  aircraft: t => [
    ['Callsign', t.callsign], ['Registration', t.registration],
    ['Aircraft', t.model], ['Squawk', t.squawk],
    ['Altitude', `${Math.round(t.altitude || 0).toLocaleString()} ft`], ['Ground Speed', `${Math.round(t.speed || 0)} kt`],
    ['Heading', `${Math.round(t.heading || 0)}°`], ['ICAO', (t.hex || '').toUpperCase()],
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
            {sel.type === 'aircraft' && <AircraftPhoto hex={sel.hex} reg={sel.registration} />}
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
