import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';
import InfoTooltip from './InfoTooltip';

export default function ControlPanel() {
  const { t } = useTranslation();
  const { state, doTick, doReset, doOverrideWeather, doFetchWeather, doFetchWeatherLive } =
    useSimulation();
  const { running, weather } = state;

  const [windSpeed, setWindSpeed] = useState(12);
  const [windDir, setWindDir] = useState(135);
  const [humidity, setHumidity] = useState(34);
  const [temp, setTemp] = useState(29);
  const [useLiveData, setUseLiveData] = useState(false);

  useEffect(() => {
    if (weather) {
      setWindSpeed(Math.round(weather.wind_speed));
      setWindDir(Math.round(weather.wind_direction));
      setHumidity(Math.round(weather.humidity));
      setTemp(Math.round(weather.temperature));
    }
  }, [weather]);

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

      <div className="button-row">
        <button className="btn btn-danger" onClick={doReset}>
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
    </div>
  );
}