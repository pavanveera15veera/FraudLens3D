import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAllData } from './utils/fetchData';
import { processData }  from './utils/processData';
import Navbar          from './components/Navbar';
import FilterPanel     from './components/FilterPanel';
import StatsPanel      from './components/StatsPanel';
import StatsBar        from './components/StatsBar';
import Scene3D         from './components/Scene3D';
import SearchBar       from './components/SearchBar';
import ClickPanel      from './components/ClickPanel';
import ChainDetector   from './components/ChainDetector';
import PortfolioBuilder from './components/PortfolioBuilder';

const ALL_TYPES = ['housing', 'restaurant', 'construction', 'service311', 'permit', 'property', 'fire'];

function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#050510',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      {/* Hex logo */}
      <svg width="56" height="56" viewBox="0 0 36 36" fill="none" style={{ marginBottom: 4 }}>
        <polygon points="18,2 32,10 32,26 18,34 4,26 4,10"
          fill="rgba(0,245,255,0.08)" stroke="#00f5ff" strokeWidth="1.5" />
        <path d="M9 18 Q18 10 27 18 Q18 26 9 18 Z"
          fill="none" stroke="#00f5ff" strokeWidth="1.2" />
        <circle cx="18" cy="18" r="3.5"
          fill="rgba(0,245,255,0.25)" stroke="#00f5ff" strokeWidth="1" />
        <circle cx="18" cy="18" r="1.4" fill="#00f5ff" />
      </svg>

      <div style={{ fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', color: '#fff' }}>
          FRAUDLENS<span style={{ color: '#00f5ff' }}>3D</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(0,245,255,0.6)', letterSpacing: '0.2em', marginTop: 4 }}>
          NYC RISK INTELLIGENCE
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: 200, height: 2,
        background: 'rgba(0,245,255,0.1)',
        borderRadius: 1, overflow: 'hidden', marginTop: 8,
      }}>
        <div style={{
          width: '45%', height: '100%',
          background: 'linear-gradient(to right, transparent, #00f5ff)',
          animation: 'loadSlide 1.6s ease-in-out infinite',
        }} />
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
        Loading NYC datasets…
      </div>

      <style>{`
        @keyframes loadSlide {
          0%   { transform: translateX(-200px); }
          100% { transform: translateX(450px); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [data,              setData]              = useState([]);
  const [rawDatasets,       setRawDatasets]       = useState({});
  const [loading,           setLoading]           = useState(true);
  const [visibleTypes,      setVisibleTypes]      = useState(ALL_TYPES);
  const [minScore,          setMinScore]          = useState(0);
  const [selectedBorough,   setSelectedBorough]   = useState('all');
  const [mapInstance,       setMapInstance]       = useState(null);
  const [showChainDetector, setShowChainDetector] = useState(false);
  const [portfolioActive,   setPortfolioActive]   = useState(false);
  const [clickedPoint,      setClickedPoint]      = useState(null);
  const [forcedSearch,      setForcedSearch]      = useState('');

  useEffect(() => {
    fetchAllData()
      .then((raw) => {
        setRawDatasets(raw);
        setData(processData(raw));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Data load failed:', err);
        setLoading(false);
      });
  }, []);

  const handleMapReady = useCallback((map) => setMapInstance(map), []);

  // Apply borough filter on top of full dataset
  const displayData = useMemo(
    () => selectedBorough === 'all'
      ? data
      : data.filter((d) => d.borough === selectedBorough),
    [data, selectedBorough]
  );

  // Pre-compute visible subset for panels that need it
  const visible = useMemo(
    () => displayData.filter((d) => visibleTypes.includes(d.type) && d.score >= minScore),
    [displayData, visibleTypes, minScore]
  );

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Navbar
        data={data}
        selectedBorough={selectedBorough}
        setSelectedBorough={setSelectedBorough}
        portfolioActive={portfolioActive}
        onPortfolioToggle={() => setPortfolioActive((v) => !v)}
      />

      <FilterPanel
        data={data}
        visible={visible}
        visibleTypes={visibleTypes}
        setVisibleTypes={setVisibleTypes}
        minScore={minScore}
        setMinScore={setMinScore}
        showChainDetector={showChainDetector}
        setShowChainDetector={setShowChainDetector}
      />

      <StatsPanel
        data={displayData}
        visible={visible}
      />

      <Scene3D
        data={displayData}
        visibleTypes={visibleTypes}
        minScore={minScore}
        onMapReady={handleMapReady}
        onPointClick={(props) => { setClickedPoint(props); }}
        onPointClose={() => setClickedPoint(null)}
      />

      <StatsBar visible={visible} />

      <SearchBar
        data={data}
        rawDatasets={rawDatasets}
        mapInstance={mapInstance}
        externalQuery={forcedSearch}
        onExternalQueryConsumed={() => setForcedSearch('')}
        rightOffset={clickedPoint ? 340 : 260}
      />

      {clickedPoint && (
        <ClickPanel
          point={clickedPoint}
          data={data}
          rawDatasets={rawDatasets}
          mapInstance={mapInstance}
          onClose={() => setClickedPoint(null)}
          onSearchAddress={(addr) => { setForcedSearch(addr); setClickedPoint(null); }}
        />
      )}

      {showChainDetector && (
        <ChainDetector
          data={data}
          rawDatasets={rawDatasets}
          mapInstance={mapInstance}
          onClose={() => setShowChainDetector(false)}
        />
      )}

      <PortfolioBuilder
        data={data}
        rawDatasets={rawDatasets}
        mapInstance={mapInstance}
        active={portfolioActive}
        onToggle={() => setPortfolioActive((v) => !v)}
      />
    </>
  );
}
