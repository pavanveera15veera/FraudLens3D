import { useState, useMemo } from 'react';

function normalizeChainName(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export default function ChainDetector({ data, rawDatasets, mapInstance, onClose }) {
  const [query, setQuery] = useState('');

  // Build chain groups: { chainName → [{ address, score, borough, lat, lon, source }] }
  const chainGroups = useMemo(() => {
    if (!query || query.length < 3) return [];
    const q = normalizeChainName(query);

    const groups = {};

    // From restaurant inspections (dba field in raw data — use data array with type=restaurant)
    const restaurantRaw = rawDatasets?.restaurantInspections ?? [];
    for (const r of restaurantRaw) {
      const name = normalizeChainName(r.dba);
      if (!name.includes(q)) continue;
      const chain = name;
      if (!groups[chain]) groups[chain] = [];
      const addr = [r.building, r.street].filter(Boolean).join(' ');
      const scored = data.find(
        (d) => d.type === 'restaurant' && normalizeChainName(d.address) === normalizeChainName(addr)
      );
      groups[chain].push({
        address: addr,
        borough: r.boro,
        lat: parseFloat(r.latitude) || null,
        lon: parseFloat(r.longitude) || null,
        score: scored?.score ?? 0,
        source: 'Restaurant',
      });
    }

    // From active businesses
    const activeRaw = rawDatasets?.activeBusinesses ?? [];
    for (const r of activeRaw) {
      const bizName  = normalizeChainName(r.business_name);
      const dbaName  = normalizeChainName(r.dba_trade_name);
      const matched  = bizName.includes(q) ? bizName : dbaName.includes(q) ? dbaName : null;
      if (!matched) continue;
      if (!groups[matched]) groups[matched] = [];
      const addr = [r.address_building, r.address_street_name].filter(Boolean).join(' ');
      const scored = data.find((d) => normalizeChainName(d.address) === normalizeChainName(addr));
      groups[matched].push({
        address: addr,
        borough: r.address_borough,
        lat: parseFloat(r.latitude) || null,
        lon: parseFloat(r.longitude) || null,
        score: scored?.score ?? 0,
        source: r.business_category || 'Business',
      });
    }

    // Sort each group by score desc, deduplicate by address
    const result = [];
    for (const [chain, locs] of Object.entries(groups)) {
      const seen = new Set();
      const unique = locs.filter((l) => {
        if (seen.has(l.address)) return false;
        seen.add(l.address);
        return true;
      });
      unique.sort((a, b) => b.score - a.score);
      result.push({ chain, locs: unique });
    }

    // Sort groups by highest score
    result.sort((a, b) => (b.locs[0]?.score ?? 0) - (a.locs[0]?.score ?? 0));
    return result;
  }, [query, data, rawDatasets]);

  const flyTo = (loc) => {
    if (!mapInstance || !loc.lat || !loc.lon) return;
    mapInstance.flyTo({ center: [loc.lon, loc.lat], zoom: 16, pitch: 60, speed: 1.4 });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 56,
      left: 280,
      bottom: 48,
      width: 320,
      background: 'rgba(5,5,20,0.96)',
      borderRight: '1px solid rgba(0,245,255,0.15)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
      zIndex: 900,
      backdropFilter: 'blur(20px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(0,245,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(0,245,255,0.6)', letterSpacing: '0.15em', fontWeight: 700 }}>
            CHAIN DETECTOR
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            Business chain risk analysis
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px',
        }}>×</button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(0,245,255,0.2)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chain name, e.g. Subway, McDonald's…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#fff', fontSize: 12, padding: '9px 12px',
              fontFamily: 'Inter, sans-serif',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', padding: '0 10px', fontSize: 16,
            }}>×</button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {query.length < 3 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            Type a chain or business name to find all NYC locations
          </div>
        )}

        {query.length >= 3 && chainGroups.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            No chains found matching "{query}"
          </div>
        )}

        {chainGroups.map(({ chain, locs }) => (
          <div key={chain} style={{ marginBottom: 2 }}>
            {/* Chain header */}
            <div style={{
              padding: '8px 16px',
              background: 'rgba(0,245,255,0.04)',
              borderLeft: '2px solid rgba(0,245,255,0.4)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {chain}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  {locs.length} location{locs.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(0,245,255,0.5)', marginTop: 2 }}>
                Avg score: {(locs.reduce((s, l) => s + l.score, 0) / locs.length).toFixed(2)}
              </div>
            </div>

            {/* Locations */}
            {locs.map((loc, i) => {
              const scoreColor = loc.score >= 0.75 ? '#ff3366' : loc.score >= 0.5 ? '#ffaa00' : '#00f5ff';
              return (
                <button
                  key={i}
                  onClick={() => flyTo(loc)}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    padding: '8px 16px 8px 22px',
                    cursor: loc.lat ? 'pointer' : 'default',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', lineHeight: 1.3 }}>
                        {loc.address || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                        {loc.borough} · {loc.source}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: scoreColor,
                      background: `${scoreColor}15`, borderRadius: 4,
                      padding: '2px 6px', flexShrink: 0,
                    }}>
                      {loc.score.toFixed(2)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
