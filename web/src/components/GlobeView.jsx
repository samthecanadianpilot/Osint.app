import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { useStore, visibleTracks, visibleArcs, selectedTrack } from '../store.js';
import { createTrackRenderer } from '../lib/trackRenderer.js';

// Night-lights keeps the dark ops look; Blue Marble is the photoreal day globe.
const TEX = {
  night: '//unpkg.com/three-globe/example/img/earth-night.jpg',
  day: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
};

export default function GlobeView() {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const rendererRef = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState('night');

  const arcs = useStore(visibleArcs);
  const selected = useStore(selectedTrack);
  const select = useStore(s => s.select);

  // Size the canvas to its container.
  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => setDim({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-rotate + initial framing once the globe instance exists.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.3;
    c.enableDamping = true;
    g.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);
  }, [dim.w]);

  // Set up the custom track renderer once the globe is ready, wire it to the
  // store, and add click-to-select via raycast on the canvas.
  useEffect(() => {
    if (!dim.w) return;
    let cleanup = () => {};
    let tries = 0;
    const init = () => {
      const g = globeRef.current;
      if (!g || !g.scene || !g.scene()) {
        if (tries++ < 60) return void setTimeout(init, 50);
        return;
      }
      let renderer;
      try {
        renderer = createTrackRenderer(g);
      } catch (e) {
        console.error('track renderer init failed:', e);
        return;
      }
      rendererRef.current = renderer;
      if (typeof window !== 'undefined') window.__globe = g; // debug/inspection handle

      const pushUpdate = () => renderer.update(visibleTracks(useStore.getState()));
      pushUpdate();
      const unsub = useStore.subscribe(pushUpdate);

      // click-to-select (ignore drags)
      const dom = g.renderer().domElement;
      let down = null;
      const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = e => {
        if (!down) return;
        const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
        down = null;
        if (moved > 6) return;
        const r = dom.getBoundingClientRect();
        const ndc = {
          x: ((e.clientX - r.left) / r.width) * 2 - 1,
          y: -((e.clientY - r.top) / r.height) * 2 + 1,
        };
        const id = renderer.pick(ndc, g.camera());
        if (id) select(id);
      };
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointerup', onUp);

      cleanup = () => {
        unsub();
        dom.removeEventListener('pointerdown', onDown);
        dom.removeEventListener('pointerup', onUp);
        renderer.dispose();
        rendererRef.current = null;
      };
    };
    init();
    return () => cleanup();
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
      <div className="globe-hint">DRAG TO ROTATE · SCROLL TO ZOOM · CLICK AN ICON</div>

      <button className="globe-toggle" onClick={() => setMode(m => (m === 'night' ? 'day' : 'night'))} title="Toggle Earth texture">
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
