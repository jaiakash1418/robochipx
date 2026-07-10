import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, MousePointer2, Square, Move, Flame, Crosshair, Globe, X, Crop } from 'lucide-react';
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
import type { LiveFire, FirmsFire, BBoxRequest, EvacuationZonesResponse } from '../api/types';
import { getLiveFires, getGlobalFires, fetchEvacuationZones } from '../api/endpoints';
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
  const [mapMode, setMapMode] = useState<'world' | 'simulation'>('simulation');

  const handleGridCenterChange = useCallback((center: [number, number]) => {
    setGridCenter(center);
    if (igniteMode === 'move') {
      setCustomLocation(center[0], center[1]);
    }
  }, [igniteMode, setCustomLocation]);
  const [showLiveFires, setShowLiveFires] = useState(false);
  const [liveFires, setLiveFires] = useState<LiveFire[]>([]);
  const [globalFires, setGlobalFires] = useState<FirmsFire[]>([]);
  const [flyToFire, setFlyToFire] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [landcoverMode, setLandcoverMode] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [evacuationZones, setEvacuationZones] = useState<EvacuationZonesResponse | null>(null);
  const [showEvacuation, setShowEvacuation] = useState(false);
  const onFlyDone = useCallback(() => setFlyToFire(null), []);
  const [worldViewport, setWorldViewport] = useState<BBoxRequest>({ west: -180, south: -90, east: 180, north: 90 });
  const worldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectFireLocation = useCallback(async (lat: number, lon: number) => {
    setGridCenter([lat, lon]);
    setMapMode('simulation');
    setCustomLocation(lat, lon);
    setFlyToFire([lat, lon]);
  }, [setCustomLocation]);

  const handleViewportChange = useCallback((bbox: BBoxRequest) => {
    // Debounce viewport updates to avoid rapid re-fetches
    if (worldTimerRef.current) clearTimeout(worldTimerRef.current);
    worldTimerRef.current = setTimeout(() => setWorldViewport(bbox), 300);
  }, []);

  // Fetch global fires when world viewport changes
  useEffect(() => {
    if (mapMode !== 'world') return;
    const fetch = async () => {
      try {
        const data = await getGlobalFires(worldViewport);
        if (data.fires.length > 0) setGlobalFires(data.fires);
      } catch {}
    };
    fetch();
    const id = setInterval(() => {
      fetch();
    }, 30000);
    return () => clearInterval(id);
  }, [mapMode, worldViewport]);

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

  useEffect(() => {
    if (!showEvacuation || mapMode !== 'simulation') { setEvacuationZones(null); return; }
    const fetch = async () => {
      try { setEvacuationZones(await fetchEvacuationZones()); } catch {}
    };
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, [showEvacuation, mapMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'l': if (mapMode === 'simulation') { setLandcoverMode(v => !v); setHeatmapMode(false); } break;
        case 'h': if (mapMode === 'simulation') { setHeatmapMode(v => !v); setLandcoverMode(false); } break;
        case 'e': if (mapMode === 'simulation') setShowEvacuation(v => !v); break;
        case 'r': doReset(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mapMode, doReset]);

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
            {mapMode === 'simulation' && (
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
            )}
            {igniteMode === 'move' && mapMode === 'simulation' && (
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
            {mapMode === 'simulation' && (
              <>
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
              </>
            )}
            {mapMode === 'simulation' && (
              <>
                <button
                  className={`btn map-control-btn${landcoverMode ? ' active' : ''}`}
                  onClick={() => { setLandcoverMode(v => !v); if (!landcoverMode) setHeatmapMode(false); }}
                  title="Show landcover overlay [L]"
                  style={landcoverMode ? { background: 'var(--accent-blue)', color: 'white' } : undefined}
                >
                  <Crop size={14} /> Land
                </button>
                <button
                  className={`btn map-control-btn${heatmapMode ? ' active' : ''}`}
                  onClick={() => { setHeatmapMode(v => !v); if (!heatmapMode) setLandcoverMode(false); }}
                  title="Show fuel risk heatmap [H]"
                  style={heatmapMode ? { background: 'var(--accent-fire)', color: 'white' } : undefined}
                >
                  <Flame size={14} /> Risk
                </button>
                <button
                  className={`btn map-control-btn${showEvacuation ? ' active' : ''}`}
                  onClick={() => setShowEvacuation(v => !v)}
                  title="Show evacuation zones [E]"
                  style={showEvacuation ? { background: 'var(--accent-red)', color: 'white' } : undefined}
                >
                  <Crosshair size={14} /> Evac
                </button>
              </>
            )}
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
            <button
              className={`btn map-control-btn${mapMode === 'world' ? ' active' : ''}`}
              onClick={() => setMapMode(mapMode === 'world' ? 'simulation' : 'world')}
              title="Browse world wildfires"
              style={mapMode === 'world' ? { background: 'var(--accent-fire)', color: 'white' } : undefined}
            >
              <Globe size={14} /> {mapMode === 'world' ? 'World' : 'Global'}
            </button>
            {running && (
              <span className="map-live-badge">
                <span className="live-dot" /> LIVE
              </span>
            )}
          </div>
          <MapView
            mode={mapMode}
            igniteMode={igniteMode}
            gridCenter={gridCenter}
            onGridCenterChange={handleGridCenterChange}
            liveFires={liveFires}
            globalFires={globalFires}
            flyToFire={flyToFire}
            onFlyDone={onFlyDone}
            userLocation={userLocation}
            onSelectFireLocation={handleSelectFireLocation}
            onViewportChange={handleViewportChange}
            landcoverMode={landcoverMode}
            heatmapMode={heatmapMode}
          />
          {mapMode === 'simulation' && <Legend />}
        </div>
        {mapMode === 'simulation' && showLiveFires && liveFires.length > 0 && (
          <LiveFiresPanel fires={liveFires} onSelectFire={(lat, lng) => setFlyToFire([lat, lng])} />
        )}
        {showEvacuation && evacuationZones && (
          <div className="evacuation-panel">
            <div className="evacuation-panel-header">
              <span>Evacuation Zones</span>
              <button className="btn btn-sm" onClick={() => setShowEvacuation(false)}><X size={12} /></button>
            </div>
            {evacuationZones.towns_affected.length === 0 ? (
              <p className="evacuation-panel-safe">No towns currently in danger.</p>
            ) : (
              <ul className="evacuation-panel-list">
                {evacuationZones.zones.map((z, i) => (
                  <li key={i} className="evacuation-panel-item">
                    <span className="evacuation-panel-town">{z.name}</span>
                    <span className="evacuation-panel-coords">({z.lat.toFixed(2)}, {z.lon.toFixed(2)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {mapMode === 'world' && (
          <div className="world-mode-hint">
            <p>🌍 Browse the world and click on a fire hotspot (<span style={{fontSize: 18}}>🔥</span>) to run a simulation there</p>
          </div>
        )}
        {mapMode === 'simulation' && <TimeScrubber />}
      </div>
      <aside className="dashboard-sidebar">
        {mapMode === 'simulation' ? (
          <>
            <ControlPanel />
            <StatsPanel />
            <AlertPanel />
            <ScenarioPanel />
          </>
        ) : (
          <div className="world-sidebar-info">
            <h3>🌍 World Fire Browser</h3>
            <p>Pan and zoom the map to explore live wildfire hotspots detected by NASA FIRMS satellites.</p>
            <p>Click any fire icon (<span style={{fontSize:18}}>🔥</span>) to load a simulation at that location.</p>
            <hr />
            <p><small>Data source: NASA FIRMS (VIIRS + MODIS)</small></p>
          </div>
        )}
      </aside>
      <LLMChat />
    </div>
  );
}
