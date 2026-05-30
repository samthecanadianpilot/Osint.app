import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { useStore, visibleTracks, visibleArcs, selectedTrack } from '../store.js';

// Globe altitude (fraction of radius) per layer — keeps planes above the
// surface, satellites higher still, ships/cctv on the deck.
function altOf(t) {
  switch (t.type) {
    case 'satellite': return 0.16;
    case 'aircraft': return 0.045;
    default: return 0.008;
  }
}
function radiusOf(t) {
  return t.type === 'satellite' ? 0.32 : t.type === 'aircraft' ? 0.28 : 0.24;
}

// Public-domain Earth textures (shipped with three-globe). Night-lights keeps
// the dark ops look; Blue Marble is the photoreal "Google Earth" daytime globe.
const TEX = {
  night: '//unpkg.com/three-globe/example/img/earth-night.jpg',
  day: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
};

export default function GlobeView() {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState('night'); // 'night' | 'day'

  const tracks = useStore(visibleTracks);
  const arcs = useStore(visibleArcs);
  const selected = useStore(selectedTrack);
  const select = useStore(s => s.select);

  // Size the canvas to its container.
  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) =>
      setDim({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-rotate + initial framing once the globe instance exists.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.35;
    c.enableDamping = true;
    g.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);
  }, [dim.w]);

  // Fly to a selection.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selected) return;
    g.controls().autoRotate = false;
    g.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: 1.7 }, 1000);
  }, [selected?.id]);

  return (
    <div className="globe-wrap" ref={wrapRef}>
      {selected && (
        <div className="globe-coords">
          {selected.callsign || selected.name}<br />
          {selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}
        </div>
      )}
      <div className="globe-hint">DRAG TO ROTATE · SCROLL TO ZOOM · CLICK A BLIP</div>

      <button
        className="globe-toggle"
        onClick={() => setMode(m => (m === 'night' ? 'day' : 'night'))}
        title="Toggle Earth texture"
      >
        {mode === 'night' ? '◐ DAY' : '◑ NIGHT'}
      </button>

      {dim.w > 0 && (
        <Globe
          ref={globeRef}
          width={dim.w}
          height={dim.h}
          backgroundColor="#000000"
          globeImageUrl={TEX[mode]}
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere
          atmosphereColor="#0a84ff"
          atmosphereAltitude={0.18}

          pointsData={tracks}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude={altOf}
          pointRadius={radiusOf}
          pointsMerge={false}
          pointLabel={t => `${t.callsign || t.name} · ${t.source}`}
          onPointClick={t => select(t.id)}

          arcsData={arcs}
          arcColor={a => [`${a.color}00`, a.color, `${a.color}00`]}
          arcStroke={0.4}
          arcDashLength={0.45}
          arcDashGap={0.18}
          arcDashAnimateTime={2600}
          arcsTransitionDuration={0}

          ringsData={selected ? [selected] : []}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => t => `rgba(10,132,255,${1 - t})`}
          ringMaxRadius={4}
          ringPropagationSpeed={2}
          ringRepeatPeriod={900}
        />
      )}
    </div>
  );
}
