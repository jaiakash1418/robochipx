import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, Flame, Target, Eraser, Play, MapPin } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import InfoTooltip from './InfoTooltip';
import LocationPicker from './LocationPicker';

export default function ControlPanel() {
  const { t } = useTranslation();
  const {
    state,
    doTick,
    doReset,
    doOverrideWeather,
    doFetchWeather,
    doFetchWeatherLive,
    setSelectActive,
    setSelectedArea,
    setInitialZone,
    doIgniteBatch,
    doClearBatch,
    doDemoRun,
    doRegenerateTerrain,
    doSetLandcoverEnabled,
  } = useSimulation();
  const { running, weather, selectActive, selectedArea, initialZone, landcoverEnabled: stateLandcoverEnabled } = state;

  const [windSpeed, setWindSpeed] = useState(12);
  const [windDir, setWindDir] = useState(135);
  const [humidity, setHumidity] = useState(34);
  const [temp, setTemp] = useState(29);
  const [useLiveData, setUseLiveData] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [usingRealTerrain, setUsingRealTerrain] = useState(true);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [landcoverEnabled, setLandcoverEnabledState] = useState(state.landcoverEnabled);

  useEffect(() => {
    if (weather) {
      setWindSpeed(Math.round(weather.wind_speed));
      setWindDir(Math.round(weather.wind_direction));
      setHumidity(Math.round(weather.humidity));
      setTemp(Math.round(weather.temperature));
    }
  }, [weather]);

  useEffect(() => {
    setLandcoverEnabledState(stateLandcoverEnabled);
  }, [stateLandcoverEnabled]);

  const handleOverride = () => {
    doOverrideWeather({
      wind_speed: windSpeed,
      wind_direction: windDir,
      humidity,
      temperature: temp,
    });
  };

  const handleToggleLive = () => {
    setUseLiveData((prev) => {
      const next = !prev;
      if (next) doFetchWeatherLive();
      else doFetchWeather();
      return next;
    });
  };

  return (
    <div className="panel control-panel">
      <h3>{t('controls.title')}</h3>

      <LocationPicker />

      <div className="control-group">
        <label>
          {t('controls.dataSource')}
          <InfoTooltip text={t('tooltips.dataSource')} />
        </label>
        <button
          onClick={handleToggleLive}
          className={`btn ${useLiveData ? 'btn-primary' : ''}`}
          style={{ width: '100%' }}
        >
          {useLiveData ? t('controls.live') : t('controls.demo')}
        </button>
      </div>

      <div className="control-group">
        <label>
          <MapPin size={14} style={{ marginRight: 4 }} />
          Terrain Source
        </label>
        <button
          onClick={async () => {
            setTerrainLoading(true);
            try {
              await doRegenerateTerrain(!usingRealTerrain);
              setUsingRealTerrain(!usingRealTerrain);
            } finally {
              setTerrainLoading(false);
            }
          }}
          disabled={terrainLoading}
          className="btn"
          style={{ width: '100%', fontSize: '0.75rem' }}
        >
          {terrainLoading ? 'Regenerating...' : (usingRealTerrain ? '🌍 Real (OSM)' : '🗺️ Synthetic')}
        </button>
      </div>

      <div className="control-group">
        <label>
          Landcover ONNX
        </label>
        <button
          onClick={async () => {
            const next = !landcoverEnabled;
            setLandcoverEnabledState(next);
            await doSetLandcoverEnabled(next);
          }}
          className={`btn ${landcoverEnabled ? 'btn-primary' : ''}`}
          style={{ width: '100%', fontSize: '0.75rem' }}
        >
          {landcoverEnabled ? '✅ Landcover ON' : '❌ Landcover OFF'}
        </button>
      </div>

      <div className="control-group">
        <label>
          <span>
            {t('controls.windSpeed')}
            <InfoTooltip text={t('tooltips.windSpeed')} />
          </span>
          <span>{windSpeed} km/h</span>
        </label>
        <input
          type="range"
          min={0}
          max={120}
          value={windSpeed}
          onChange={(e) => setWindSpeed(Number(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          <span>
            {t('controls.windDir')}
            <InfoTooltip text={t('tooltips.windDir')} />
          </span>
          <span>{windDir}°</span>
        </label>
        <div className="compass" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range"
            min={0}
            max={360}
            value={windDir}
            onChange={(e) => setWindDir(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div
            className="compass-arrow"
            style={{
              transform: `rotate(${windDir}deg)`,
              fontSize: '1.3rem',
              color: 'var(--accent-fire)',
              transition: 'transform 0.2s',
              flexShrink: 0,
            }}
          >
            ↑
          </div>
        </div>
      </div>

      <div className="control-group">
        <label>
          <span>
            {t('controls.humidity')}
            <InfoTooltip text={t('tooltips.humidity')} />
          </span>
          <span>{humidity}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={humidity}
          onChange={(e) => setHumidity(Number(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          <span>
            {t('controls.temp')}
            <InfoTooltip text={t('tooltips.temp')} />
          </span>
          <span>{temp}°C</span>
        </label>
        <input
          type="range"
          min={-10}
          max={50}
          value={temp}
          onChange={(e) => setTemp(Number(e.target.value))}
        />
      </div>

      <div className="button-row">
        <button className="btn" onClick={handleOverride} disabled={!running}>
          {t('controls.apply')}
        </button>
        <InfoTooltip text={t('tooltips.apply')} />
        <button className="btn btn-primary" onClick={() => doTick()} disabled={!running}>
          {t('controls.tick')}
        </button>
        <InfoTooltip text={t('tooltips.tick')} />
      </div>

      <div className="control-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 6 }}>
        <label style={{ marginBottom: 6 }}>
          <Crop size={14} style={{ marginRight: 4 }} />
          Area Selection
          <InfoTooltip text="Click 'Select' then drag on the map to draw a selection rectangle. After selecting, use the buttons below to ignite, clear, or mark zone." />
        </label>
        <button
          className={`btn ${selectActive ? 'btn-primary' : ''}`}
          onClick={() => setSelectActive(!selectActive)}
          style={{ width: '100%', marginBottom: 4, fontSize: '0.78rem' }}
        >
          {selectActive ? '✕ Done Selecting' : '✧ Select Area'}
        </button>
        {selectActive && (
          <div style={{ fontSize: '0.68rem', color: 'var(--accent-fire)', marginBottom: 4 }}>
            Drag on the map to select an area
          </div>
        )}
        {selectedArea && (
          <>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent-blue)', marginBottom: 4 }}>
              Selected: ({selectedArea.x1},{selectedArea.y1}) → ({selectedArea.x2},{selectedArea.y2})
            </div>
            <div className="button-row" style={{ gap: 4 }}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  const cells: { x: number; y: number }[] = [];
                  for (let r = selectedArea.y1; r <= selectedArea.y2; r++)
                    for (let c = selectedArea.x1; c <= selectedArea.x2; c++)
                      cells.push({ x: c, y: r });
                  doIgniteBatch(cells);
                }}
                style={{ flex: 1, fontSize: '0.72rem' }}
              >
                <Flame size={12} /> Ignite
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  const cells: { x: number; y: number }[] = [];
                  for (let r = selectedArea.y1; r <= selectedArea.y2; r++)
                    for (let c = selectedArea.x1; c <= selectedArea.x2; c++)
                      cells.push({ x: c, y: r });
                  doClearBatch(cells);
                }}
                style={{ flex: 1, fontSize: '0.72rem' }}
              >
                <Eraser size={12} /> Clear
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setInitialZone(selectedArea)}
                style={{ flex: 1, fontSize: '0.72rem' }}
              >
                <Target size={12} /> Zone
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => setSelectedArea(null)}
                style={{ flex: 1, fontSize: '0.72rem' }}
              >
                ✕
              </button>
            </div>
          </>
        )}
        {initialZone && (
          <div style={{ fontSize: '0.68rem', color: 'var(--accent-blue)', marginTop: 4 }}>
            Zone: ({initialZone.x1},{initialZone.y1}) to ({initialZone.x2},{initialZone.y2}) — fires on next tick
          </div>
        )}
      </div>

      <div className="button-row" style={{ gap: 4 }}>
        <button
          className="btn btn-primary"
          onClick={async () => {
            setDemoLoading(true);
            try {
              await doDemoRun(10);
            } finally {
              setDemoLoading(false);
            }
          }}
          disabled={demoLoading}
          style={{ flex: 1, fontSize: '0.75rem' }}
        >
          <Play size={12} /> {demoLoading ? 'Running...' : 'Run Demo'}
        </button>
        <button className="btn btn-danger" onClick={doReset} style={{ flex: 1 }}>
          {t('controls.reset')}
        </button>
        <InfoTooltip text={t('tooltips.reset')} />
      </div>

      {weather && (
        <div className="weather-info" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
          <p><strong>Source:</strong> {weather.source}</p>
          <p><strong>Timestamp:</strong> {new Date(weather.timestamp).toLocaleString()}</p>
        </div>
      )}

      <div className="control-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 6 }}>
        <label style={{ marginBottom: 6 }}>Share / Export</label>
        <button
          className="btn"
          onClick={() => {
            const url = `${window.location.origin}${window.location.pathname}?lat=${state.customLat ?? ''}&lon=${state.customLon ?? ''}`;
            navigator.clipboard.writeText(url).then(() => alert('Scenario URL copied!'));
          }}
          style={{ width: '100%', fontSize: '0.75rem' }}
        >
          Copy scenario link
        </button>
      </div>
    </div>
  );
}