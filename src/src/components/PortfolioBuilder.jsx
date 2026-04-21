import { useState, useEffect, useRef, useCallback } from 'react';

// Haversine distance in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TYPE_LABELS = {
  housing: 'Housing', restaurant: 'Restaurant', construction: 'Construction',
  service311: '311 Service', permit: 'Permit', property: 'Property', fire: 'Fire',
};

export default function PortfolioBuilder({ data, rawDatasets, mapInstance, active, onToggle }) {
  const [drawing,      setDrawing]      = useState(false);
  const [center,       setCenter]       = useState(null);   // [lon, lat]
  const [radiusMeters, setRadiusMeters] = useState(null);
  const [portfolio,    setPortfolio]    = useState(null);

  const drawingRef = useRef(false);
  const clickCountRef = useRef(0);
  const firstClickRef = useRef(null);

  // Sync drawingRef with state
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);

  // Start drawing mode
  const startDraw = useCallback(() => {
    if (!mapInstance) return;
    clickCountRef.current = 0;
    firstClickRef.current = null;
    setCenter(null);
    setRadiusMeters(null);
    setPortfolio(null);
    setDrawing(true);
    mapInstance.getCanvas().style.cursor = 'crosshair';
  }, [mapInstance]);

  // Clear drawing
  const clearDraw = useCallback(() => {
    setDrawing(false);
    setCenter(null);
    setRadiusMeters(null);
    setPortfolio(null);
    clickCountRef.current = 0;
    firstClickRef.current = null;
    if (mapInstance) {
      mapInstance.getCanvas().style.cursor = '';
      if (mapInstance.getSource('portfolio-circle')) {
        mapInstance.getSource('portfolio-circle').setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [mapInstance]);

  // Build portfolio from circle
  const computePortfolio = useCallback((cLon, cLat, radM) => {
    const inCircle = data.filter(
      (d) => d.lat && d.lon && haversine(cLat, cLon, d.lat, d.lon) <= radM
    );

    const byType = {};
    for (const d of inCircle) {
      byType[d.type] = (byType[d.type] ?? 0) + 1;
    }

    const avgScore = inCircle.length
      ? inCircle.reduce((s, d) => s + d.score, 0) / inCircle.length
      : 0;

    const highRisk = inCircle.filter((d) => d.score >= 0.75).length;
    const critical = inCircle.filter((d) => d.score >= 0.9).length;

    // ECB fines total
    const ecbTotal = (rawDatasets?.ecbViolations ?? [])
      .filter((r) => {
        const lat = parseFloat(r.latitude);
        const lon = parseFloat(r.longitude);
        if (!isNaN(lat) && !isNaN(lon)) return haversine(cLat, cLon, lat, lon) <= radM;
        return false;
      })
      .reduce((s, r) => s + (parseFloat(r.penality_imposed) || 0), 0);

    setPortfolio({ inCircle, byType, avgScore, highRisk, critical, ecbTotal });
  }, [data, rawDatasets]);

  // Mapbox click handler
  useEffect(() => {
    if (!mapInstance) return;

    // Add circle source/layer if not present
    if (!mapInstance.getSource('portfolio-circle')) {
      mapInstance.addSource('portfolio-circle', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      mapInstance.addLayer({
        id: 'portfolio-circle-fill',
        type: 'fill',
        source: 'portfolio-circle',
        paint: {
          'fill-color': '#7b2fff',
          'fill-opacity': 0.12,
        },
      });
      mapInstance.addLayer({
        id: 'portfolio-circle-outline',
        type: 'line',
        source: 'portfolio-circle',
        paint: {
          'line-color': '#7b2fff',
          'line-width': 2,
          'line-dasharray': [4, 2],
          'line-opacity': 0.8,
        },
      });
    }

    const handleClick = (e) => {
      if (!drawingRef.current) return;

      const { lng, lat } = e.lngLat;
      clickCountRef.current++;

      if (clickCountRef.current === 1) {
        // First click = center
        firstClickRef.current = [lng, lat];
      } else if (clickCountRef.current === 2 && firstClickRef.current) {
        // Second click = radius
        const [cLon, cLat] = firstClickRef.current;
        const radM = haversine(cLat, cLon, lat, lng);

        setCenter([cLon, cLat]);
        setRadiusMeters(radM);
        setDrawing(false);
        mapInstance.getCanvas().style.cursor = '';

        // Draw circle on map
        const circle = makeCircleGeoJSON(cLon, cLat, radM);
        mapInstance.getSource('portfolio-circle').setData(circle);

        computePortfolio(cLon, cLat, radM);
        clickCountRef.current = 0;
        firstClickRef.current = null;
      }
    };

    mapInstance.on('click', handleClick);
    return () => mapInstance.off('click', handleClick);
  }, [mapInstance, computePortfolio]);

  // Export portfolio summary
  const exportSummary = () => {
    if (!portfolio) return;
    const lines = [
      'FraudLens3D Portfolio Report',
      '============================',
      `Date: ${new Date().toLocaleString()}`,
      `Circle center: ${center?.[1]?.toFixed(5)}, ${center?.[0]?.toFixed(5)}`,
      `Radius: ${Math.round(radiusMeters)}m`,
      '',
      `Total records in area: ${portfolio.inCircle.length}`,
      `Average risk score: ${portfolio.avgScore.toFixed(3)}`,
      `High risk (≥0.75): ${portfolio.highRisk}`,
      `Critical (≥0.90): ${portfolio.critical}`,
      `ECB fines total: $${portfolio.ecbTotal.toFixed(2)}`,
      '',
      'Records by type:',
      ...Object.entries(portfolio.byType).map(([t, n]) => `  ${TYPE_LABELS[t] ?? t}: ${n}`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'fraudlens3d_portfolio.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!active) return null;

  const avgColor = portfolio
    ? portfolio.avgScore >= 0.75 ? '#ff3366' : portfolio.avgScore >= 0.5 ? '#ffaa00' : '#00f5ff'
    : '#00f5ff';

  return (
    <>
      {/* Overlay instructions when drawing */}
      {drawing && (
        <div style={{
          position: 'fixed',
          bottom: 68, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(5,5,20,0.92)',
          border: '1px solid rgba(123,47,255,0.5)',
          borderRadius: 10, padding: '10px 20px',
          color: '#fff', fontSize: 13,
          fontFamily: 'Inter, sans-serif',
          zIndex: 1500,
          backdropFilter: 'blur(12px)',
          pointerEvents: 'none',
          letterSpacing: '0.04em',
        }}>
          {clickCountRef.current === 0
            ? 'Click to set circle center'
            : 'Click again to set radius'}
        </div>
      )}

      {/* Portfolio panel */}
      <div style={{
        position: 'fixed',
        top: 68,
        right: 270,
        width: 280,
        background: 'rgba(5,5,20,0.95)',
        border: '1px solid rgba(123,47,255,0.3)',
        borderRadius: 12,
        fontFamily: 'Inter, sans-serif',
        zIndex: 1100,
        backdropFilter: 'blur(20px)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(123,47,255,0.08)',
          borderBottom: '1px solid rgba(123,47,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(123,47,255,0.8)', letterSpacing: '0.15em', fontWeight: 700 }}>
              PORTFOLIO BUILDER
            </div>
            {center && radiusMeters && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                r = {Math.round(radiusMeters)}m
              </div>
            )}
          </div>
          <button onClick={onToggle} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px',
          }}>×</button>
        </div>

        <div style={{ padding: 14 }}>
          {/* Draw / clear buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              onClick={drawing ? clearDraw : startDraw}
              style={{
                flex: 1,
                padding: '8px 0',
                background: drawing ? 'rgba(123,47,255,0.25)' : 'rgba(123,47,255,0.12)',
                border: `1px solid rgba(123,47,255,${drawing ? 0.7 : 0.3})`,
                borderRadius: 7,
                color: '#7b2fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {drawing ? 'CANCEL' : 'DRAW CIRCLE'}
            </button>
            {portfolio && (
              <button
                onClick={clearDraw}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7,
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                CLEAR
              </button>
            )}
          </div>

          {!portfolio && !drawing && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '12px 0' }}>
              Draw a circle on the map to analyze a portfolio area
            </div>
          )}

          {portfolio && (
            <>
              {/* Summary stats */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Total',    value: portfolio.inCircle.length, color: '#7b2fff' },
                  { label: 'High Risk',value: portfolio.highRisk,        color: '#ff3366' },
                  { label: 'Critical', value: portfolio.critical,        color: '#ff0040' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{
                    flex: 1, textAlign: 'center', padding: '8px 4px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Avg score */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px',
                background: `${avgColor}12`,
                border: `1px solid ${avgColor}33`,
                borderRadius: 7, marginBottom: 12,
              }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Avg Risk Score</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: avgColor }}>
                  {portfolio.avgScore.toFixed(3)}
                </span>
              </div>

              {/* ECB fines */}
              {portfolio.ecbTotal > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px',
                  background: 'rgba(255,51,102,0.06)',
                  border: '1px solid rgba(255,51,102,0.2)',
                  borderRadius: 6, marginBottom: 12,
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ECB Fines Total</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ff3366' }}>
                    ${portfolio.ecbTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}

              {/* By type */}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 6 }}>
                BY TYPE
              </div>
              {Object.entries(portfolio.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                <div key={type} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                    {TYPE_LABELS[type] ?? type}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{count}</span>
                </div>
              ))}

              {/* Export */}
              <button
                onClick={exportSummary}
                style={{
                  width: '100%', marginTop: 14,
                  padding: '9px 0',
                  background: 'rgba(0,245,255,0.08)',
                  border: '1px solid rgba(0,245,255,0.25)',
                  borderRadius: 7,
                  color: '#00f5ff',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >
                EXPORT REPORT
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Generate a GeoJSON polygon approximating a circle
function makeCircleGeoJSON(centerLon, centerLat, radiusM, steps = 64) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat  = (radiusM / 111320) * Math.cos(angle);
    const dLon  = (radiusM / (111320 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
    coords.push([centerLon + dLon, centerLat + dLat]);
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {},
    }],
  };
}
