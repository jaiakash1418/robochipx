import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, MousePointer2, Square, Move, Flame, Crosshair, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MapView from '../components/MapView';
import ControlPanel from '../components/ControlPanel';
import StatsPanel from '../components/StatsPanel';
import AlertPanel from '../components/AlertPanel';
import LLMChat from '../components/LLMChat';
import Legend from '../components/Legend';
import TimeScrubber from '../components/TimeScrubber';
import ScenarioPanel from '../components/ScenarioPanel';
import InfoTooltip from '../components/InfoTooltip';
import { useSimulation } from '../context/SimulationContext';
import type { LiveFire } from '../api/types';
import { getLiveFires } from '../api/endpoints';
import LiveFiresPanel from '../components/LiveFiresPanel';

const TICK_INTERVAL = 2000;

const GRID_LOCATIONS = [
  { label: 'San Francisco', center: [38, -121.5] },
  { label: 'Los Angeles', center: [34.2, -118.5] },
  { label: 'Seattle', center: [47.6, -122.3] },
  { label: 'Denver', center: [39.7, -104.9] },
  { label: 'Austin', center: [30.3, -97.7] },
] as const;

export default function DashboardPage() {
  const { t } = useTranslation();
  const { state, doTick, doReset, doFetchWeather, dismissError, setCustomLocation } = useSimulation();
  const { running, loading, error } = state;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [igniteMode, setIgniteMode] = useState<'point' | 'area' | 'move'>('point');
  const [gridCenter, setGridCenter] = useState<[number, number]>([38, -121.5]);

  const handleGridCenterChange = useCallback((center: [number, number]) => {
    setGridCenter(center);
    if (igniteMode === 'move') {
      setCustomLocation(center[0], center[1]);
    }
  }, [igniteMode, setCustomLocation]);
  const [showLiveFires, setShowLiveFires] = useState(false);
  const [liveFires, setLiveFires] = useState<LiveFire[]>([]);
  const [flyToFire, setFlyToFire] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const onFlyDone = useCallback(() => setFlyToFire(null), []);

  useEffect(() => {
    if (!showLiveFires) { setLiveFires([]); return; }
    const fetch = async () => {
      try { const d = await getLiveFires(); setLiveFires(d.fires); } catch {}
    };
    fetch();
    const id = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [showLiveFires]);

  useEffect(() => {
    if (running) {
      doTick();
      intervalRef.current = setInterval(() => {
        doTick();
      }, TICK_INTERVAL);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, doTick]);

  useEffect(() => {
    doFetchWeather(gridCenter[0], gridCenter[1]);
  }, [gridCenter, doFetchWeather]);

  return (
    <div className="dashboard-page">
      {loading && (
        <div className="dashboard-loading-overlay">
          <div className="dashboard-loading-spinner" />
          <span> Processing...</span>
        </div>
      )}
      {error && (
        <div className="dashboard-error-banner">
          <span>{error}</span>
          <button className="dashboard-error-dismiss" onClick={dismissError}><X size={14} /></button>
        </div>
      )}
      <div className="dashboard-map-area">
        <div className="dashboard-map">
          <div className="map-overlay-controls">
            <div className="ignite-mode-toggle">
              <button
                className={`btn ignite-mode-btn${igniteMode === 'point' ? ' active' : ''}`}
                onClick={() => setIgniteMode('point')}
                title="Click to ignite single cell"
              >
                <MousePointer2 size={14} /> Point
              </button>
              <button
                className={`btn ignite-mode-btn${igniteMode === 'area' ? ' active' : ''}`}
                onClick={() => setIgniteMode('area')}
                title="Drag to ignite area"
              >
                <Square size={14} /> Area
              </button>
              <button
                className={`btn ignite-mode-btn${igniteMode === 'move' ? ' active' : ''}`}
                onClick={() => setIgniteMode('move')}
                title="Click map to reposition grid"
              >
                <Move size={14} /> Move
              </button>
            </div>
            {igniteMode === 'move' && (
              <div className="grid-location-presets">
                {GRID_LOCATIONS.map((loc) => (
                  <button
                    key={loc.label}
                    className={`btn btn-sm${gridCenter[0] === loc.center[0] && gridCenter[1] === loc.center[1] ? ' active' : ''}`}
                    onClick={() => handleGridCenterChange(loc.center as [number, number])}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
            )}
            <button
              className="btn btn-primary map-control-btn"
              onClick={() => doTick()}
              disabled={!running}
              title="Manual step"
            >
              <Play size={14} /> Step
            </button>
            <InfoTooltip text={t('tooltips.stepBtn')} />
            <button
              className="btn map-control-btn"
              onClick={doReset}
              title="Clear map & reset"
            >
              <RotateCcw size={14} /> Clear
            </button>
            <button
              className={`btn map-control-btn${showLiveFires ? ' active' : ''}`}
              onClick={() => setShowLiveFires((v) => !v)}
              title="Show real active wildfires from NASA"
              style={showLiveFires ? { background: 'var(--accent-fire)', color: 'white' } : undefined}
            >
              <Flame size={14} /> Live
            </button>
            <button
              className={`btn map-control-btn${userLocation ? ' active' : ''}`}
              onClick={() => {
                if (!navigator.geolocation) { return; }
                if (userLocation) { setUserLocation(null); return; }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                    setUserLocation(coords);
                    setFlyToFire(coords);
                  },
                  () => { /* prefererence denied or unavailable */ },
                  { enableHighAccuracy: false, timeout: 10000 },
                );
              }}
              title={userLocation ? 'Clear location' : 'Show my location'}
              style={userLocation ? { background: 'var(--accent-fire)', color: 'white' } : undefined}
            >
              <Crosshair size={14} /> {userLocation ? 'Located' : 'Locate'}
            </button>
            {running && (
              <span className="map-live-badge">
                <span className="live-dot" /> LIVE
              </span>
            )}
          </div>
          <MapView igniteMode={igniteMode} gridCenter={gridCenter} onGridCenterChange={handleGridCenterChange} liveFires={liveFires} flyToFire={flyToFire} onFlyDone={onFlyDone} userLocation={userLocation} />
          <Legend />
        </div>
        {showLiveFires && liveFires.length > 0 && (
          <LiveFiresPanel fires={liveFires} onSelectFire={(lat, lng) => setFlyToFire([lat, lng])} />
        )}
        <TimeScrubber />
      </div>
      <aside className="dashboard-sidebar">
        <ControlPanel />
        <StatsPanel />
        <AlertPanel />
        <ScenarioPanel />
      </aside>
      <LLMChat />
    </div>
  );
}
