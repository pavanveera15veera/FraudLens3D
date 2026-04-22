import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// ── Constants ────────────────────────────────────────────────────────────────

const CENTER = [-74.006, 40.7128];
const HOME   = { center: CENTER, zoom: 13, pitch: 60, bearing: -20 };


// ── Shared button style ───────────────────────────────────────────────────────

function mapBtn(active = false) {
  return {
    display:       'flex',
    alignItems:    'center',
    gap:           6,
    padding:       '7px 12px',
    borderRadius:  8,
    border:        `1px solid ${active ? 'rgba(0,245,255,0.6)' : 'rgba(0,245,255,0.2)'}`,
    background:    active ? 'rgba(0,245,255,0.18)' : 'rgba(10,10,30,0.88)',
    backdropFilter:'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    color:         active ? '#00f5ff' : 'rgba(255,255,255,0.75)',
    fontSize:      12,
    fontFamily:    'Inter, sans-serif',
    fontWeight:    600,
    letterSpacing: '0.04em',
    cursor:        'pointer',
    whiteSpace:    'nowrap',
    boxShadow:     active ? '0 0 14px rgba(0,245,255,0.35)' : '0 2px 8px rgba(0,0,0,0.5)',
    transition:    'all 0.2s',
    userSelect:    'none',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toGeoJSON(data) {
  return {
    type: 'FeatureCollection',
    features: data
      .filter((d) => d.lat && d.lon)
      .map((d) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
        properties: {
          type:       d.type,
          borough:    d.borough    || '',
          address:    d.address    || '',
          score:      d.score,
          scoreLabel: d.scoreLabel || '',
          factor1:    d.factor1    ?? 0,
          factor2:    d.factor2    ?? 0,
          factor3:    d.factor3    ?? 0,
          lat:        d.lat,
          lon:        d.lon,
        },
      })),
  };
}

function buildFilter(visibleTypes, minScore) {
  const typeFilter = visibleTypes.length === 0
    ? ['boolean', false]
    : ['in', ['get', 'type'], ['literal', visibleTypes]];
  return ['all', typeFilter, ['>=', ['get', 'score'], minScore]];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Scene3D({ data, visibleTypes, minScore, onMapReady, onPointClick, onPointClose }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const loadedRef    = useRef(false);

  // Spin state
  const spinningRef  = useRef(false);
  const spinRafRef   = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Pitch state — tracks whether we are in 3D (pitch 60) or top-down (pitch 0)
  const [isPitched, setIsPitched] = useState(true); // fly-in lands at pitch 60

  // Stable refs for latest prop values (used inside event handlers)
  const dataRef           = useRef(data);
  const visibleTypesRef   = useRef(visibleTypes);
  const minScoreRef       = useRef(minScore);
  const onPointClickRef   = useRef(onPointClick);
  const onPointCloseRef   = useRef(onPointClose);

  useEffect(() => { dataRef.current         = data;         }, [data]);
  useEffect(() => { visibleTypesRef.current = visibleTypes; }, [visibleTypes]);
  useEffect(() => { onPointClickRef.current = onPointClick; }, [onPointClick]);
  useEffect(() => { onPointCloseRef.current = onPointClose; }, [onPointClose]);
  useEffect(() => { minScoreRef.current     = minScore;     }, [minScore]);

  // ── Toggle auto-spin ─────────────────────────────────────────────────────
  const toggleSpin = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (spinningRef.current) {
      spinningRef.current = false;
      setIsSpinning(false);
      cancelAnimationFrame(spinRafRef.current);
    } else {
      spinningRef.current = true;
      setIsSpinning(true);
      let lastTs = null;
      const step = (ts) => {
        if (!spinningRef.current) return;
        if (lastTs !== null) {
          // 10 deg/s = 0.01 deg/ms
          map.setBearing((map.getBearing() + (ts - lastTs) * 0.01) % 360);
        }
        lastTs = ts;
        spinRafRef.current = requestAnimationFrame(step);
      };
      spinRafRef.current = requestAnimationFrame(step);
    }
  }, []);

  // ── Toggle pitch (0° ↔ 60°) ──────────────────────────────────────────────
  const togglePitch = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setIsPitched((prev) => {
      const next = !prev;
      map.easeTo({ pitch: next ? 60 : 0, duration: 900 });
      return next;
    });
  }, []);

  // ── Map init (once) ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = new mapboxgl.Map({
      container:       containerRef.current,
      style:           'mapbox://styles/mapbox/dark-v11',
      center:          CENTER,
      zoom:            10,   // fly-in starts here
      pitch:           0,
      bearing:         0,
      antialias:       true,
      // ── Full spatial controls — no bearing limits ──
      scrollZoom:      true,
      dragRotate:      true, // right-click drag = bearing rotation
      dragPan:         true, // left-click drag  = pan
      touchZoomRotate: true,
      touchPitch:      true,
      keyboard:        false, // we handle arrows ourselves
    });

    mapRef.current = map;

    // Compass + zoom buttons (compass click resets to north)
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    // ── Keyboard: arrow keys ─────────────────────────────────────────────
    const onKeyDown = (ev) => {
      // Only fire when map canvas (or its container) is active
      if (!mapRef.current) return;
      const m = mapRef.current;
      switch (ev.key) {
        case 'ArrowLeft':
          ev.preventDefault();
          m.easeTo({ bearing: m.getBearing() - 15, duration: 250 });
          break;
        case 'ArrowRight':
          ev.preventDefault();
          m.easeTo({ bearing: m.getBearing() + 15, duration: 250 });
          break;
        case 'ArrowUp':
          ev.preventDefault();
          m.easeTo({ pitch: Math.min(85, m.getPitch() + 10), duration: 250 });
          break;
        case 'ArrowDown':
          ev.preventDefault();
          m.easeTo({ pitch: Math.max(0,  m.getPitch() - 10), duration: 250 });
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // ── Ctrl + left-drag = tilt pitch ────────────────────────────────────
    // Intercept in capture phase before Mapbox's dragRotate handler sees it
    const canvas = map.getCanvas();
    const tilt   = { active: false, startY: 0, startPitch: 0 };

    const onTiltDown = (ev) => {
      if (!ev.ctrlKey || ev.button !== 0) return;
      tilt.active     = true;
      tilt.startY     = ev.clientY;
      tilt.startPitch = map.getPitch();
      ev.stopImmediatePropagation(); // block Mapbox bearing-rotate for this gesture
      ev.preventDefault();
    };
    const onTiltMove = (ev) => {
      if (!tilt.active) return;
      const delta = (ev.clientY - tilt.startY) * 0.4; // drag-down → tilt forward
      map.setPitch(Math.max(0, Math.min(85, tilt.startPitch + delta)));
    };
    const onTiltUp = (ev) => { if (ev.button === 0) tilt.active = false; };

    canvas.addEventListener('mousedown', onTiltDown,  true); // capture
    window.addEventListener('mousemove',  onTiltMove);
    window.addEventListener('mouseup',    onTiltUp);
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

    // ── Stop spin on manual drag ─────────────────────────────────────────
    map.on('dragstart', () => {
      if (spinningRef.current) {
        spinningRef.current = false;
        setIsSpinning(false);
        cancelAnimationFrame(spinRafRef.current);
      }
    });

    // ── Style loaded ─────────────────────────────────────────────────────
    map.on('load', () => {
      loadedRef.current = true;
      onMapReady?.(map);

      // Fly-in: zoom 10 pitch 0 → zoom 13 pitch 60 bearing -20
      map.flyTo({ ...HOME, duration: 3000, essential: true });

      // ── 3D Buildings ─────────────────────────────────────────────────
      const firstLabelId = map.getStyle().layers
        .find((l) => l.type === 'symbol' && l.layout?.['text-field'])?.id;

      try {
        map.addLayer(
          {
            id:             '3d-buildings',
            source:         'composite',
            'source-layer': 'building',
            filter:         ['==', 'extrude', 'true'],
            type:           'fill-extrusion',
            minzoom:        14,
            paint: {
              // Color shifts from deep navy to near-black as you zoom in past 15
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['zoom'],
                14, '#1a1a3e',
                16, '#0d0d2e',
              ],
              // Height fades in as you pass zoom 14→15 for a cinematic reveal
              'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                14, 0,
                15, ['coalesce', ['get', 'height'],     0],
              ],
              'fill-extrusion-base': [
                'interpolate', ['linear'], ['zoom'],
                14, 0,
                15, ['coalesce', ['get', 'min_height'], 0],
              ],
              // Opacity increases past zoom 15 for dramatic close-up look
              'fill-extrusion-opacity': [
                'interpolate', ['linear'], ['zoom'],
                14, 0.8,
                15, 0.8,
                16, 0.95,
              ],
            },
          },
          firstLabelId          // insert below labels
        );
      } catch (err) {
        console.warn('3D buildings skipped:', err.message);
      }

      // ── Fraud GeoJSON source (seeded with current data) ───────────────
      map.addSource('fraud', {
        type: 'geojson',
        data: toGeoJSON(dataRef.current),
      });

      // ── Circle layer (added AFTER buildings so it renders on top) ─────
      map.addLayer({
        id:     'fraud-circles',
        type:   'circle',
        source: 'fraud',
        filter: buildFilter(visibleTypesRef.current, minScoreRef.current),
        paint: {
          'circle-color': [
            'match', ['get', 'type'],
            'housing',      '#ff3333',
            'restaurant',   '#33aaff',
            'construction', '#33ff80',
            'service311',   '#ffff33',
            'permit',       '#ff9933',
            'property',     '#cc33ff',
            'fire',         '#ff6699',
            '#ffffff',
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'score'],
            0.2, 3,
            1.0, 8,
          ],
          'circle-opacity':        ['get', 'score'],
          'circle-stroke-width':   0.8,
          'circle-stroke-color': [
            'match', ['get', 'type'],
            'housing',      '#ff3333',
            'restaurant',   '#33aaff',
            'construction', '#33ff80',
            'service311',   '#ffff33',
            'permit',       '#ff9933',
            'property',     '#cc33ff',
            'fire',         '#ff6699',
            '#ffffff',
          ],
          'circle-stroke-opacity':  0.55,
          'circle-pitch-alignment': 'map',
        },
      });

      // ── Hover cursor ─────────────────────────────────────────────────
      map.on('mouseenter', 'fraud-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'fraud-circles', () => {
        map.getCanvas().style.cursor = '';
      });

      // ── Click on dot → side panel ────────────────────────────────────
      map.on('click', 'fraud-circles', (ev) => {
        if (!ev.features?.length) return;
        ev.originalEvent._fraudDotClick = true; // mark so background handler ignores it
        const feat  = ev.features[0];
        const props = feat.properties;
        onPointClickRef.current?.(props);
      });

      // ── Click on map background → close panel ────────────────────────
      map.on('click', (ev) => {
        if (ev.originalEvent._fraudDotClick) return; // dot click already handled
        onPointCloseRef.current?.();
      });
    });

    // ── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      loadedRef.current   = false;
      spinningRef.current = false;
      cancelAnimationFrame(spinRafRef.current);
      window.removeEventListener('keydown',    onKeyDown);
      canvas.removeEventListener('mousedown',  onTiltDown,  true);
      window.removeEventListener('mousemove',  onTiltMove);
      window.removeEventListener('mouseup',    onTiltUp);
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync GeoJSON when data changes ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.getSource('fraud')?.setData(toGeoJSON(data));
  }, [data]);

  // ── Sync filter when type toggles or score slider changes ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('fraud-circles', buildFilter(visibleTypes, minScore));
  }, [visibleTypes, minScore]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      top: 56, left: 280, right: 260, bottom: 48,
      zIndex: 1,
    }}>
      {/* Map canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Floating control buttons (top-left of map) ── */}
      <div style={{
        position:   'absolute',
        top:        12,
        left:       12,
        zIndex:     10,
        display:    'flex',
        flexDirection: 'column',
        gap:        8,
        pointerEvents: 'auto',
      }}>
        {/* Auto-spin */}
        <button
          title={isSpinning ? 'Stop auto-rotation' : 'Start auto-rotation'}
          onClick={toggleSpin}
          style={mapBtn(isSpinning)}
        >
          <span style={{
            display: 'inline-block',
            animation: isSpinning ? 'spinIcon 1.2s linear infinite' : 'none',
          }}>
            ↻
          </span>
          {isSpinning ? 'Stop Spin' : 'Auto Spin'}
        </button>

        {/* Pitch toggle */}
        <button
          title={isPitched ? 'Switch to top-down view' : 'Switch to 3D aerial view'}
          onClick={togglePitch}
          style={mapBtn(isPitched)}
        >
          {isPitched ? '⊞' : '⊡'}
          {isPitched ? 'Top-Down' : '3D View'}
        </button>
      </div>

      {/* Spin icon keyframe */}
      <style>{`
        @keyframes spinIcon {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
