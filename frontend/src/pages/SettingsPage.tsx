import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { state, doReset } = useSimulation();
  const { weather } = state;

  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const [tickSpeed, setTickSpeed] = useState(1000);

  return (
    <div className="settings-page">
      <div className="settings-sections">
        <div className="panel settings-section">
          <h3>API Configuration</h3>
          <div className="settings-field">
            <label>Backend URL</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="settings-input"
            />
          </div>
          <div className="settings-field">
            <label>Simulation Tick Speed</label>
            <div className="settings-range">
              <input
                type="range"
                min={200}
                max={5000}
                step={100}
                value={tickSpeed}
                onChange={(e) => setTickSpeed(Number(e.target.value))}
              />
              <span>{tickSpeed}ms</span>
            </div>
          </div>
        </div>

        <div className="panel settings-section">
          <h3>Simulation</h3>
          <div className="settings-field">
            <label>Grid Size</label>
            <span className="settings-value">64 × 64</span>
          </div>
          <div className="settings-field">
            <label>Status</label>
            <span className={`settings-badge ${state.running ? 'running' : 'stopped'}`}>
              {state.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="settings-field">
            <label>Weather Source</label>
            <span className="settings-value">{weather?.source ?? 'N/A'}</span>
          </div>
          <button className="btn btn-danger" onClick={doReset}>
            Reset Simulation
          </button>
        </div>

        <div className="panel settings-section">
          <h3>About</h3>
          <div className="settings-field">
            <label>Version</label>
            <span className="settings-value">1.0.0</span>
          </div>
          <div className="settings-field">
            <label>Model</label>
            <span className="settings-value">ResNet34-UNet</span>
          </div>
          <div className="settings-field">
            <label>Weather API</label>
            <span className="settings-value">Open-Meteo (free, no key)</span>
          </div>
        </div>
      </div>
    </div>
  );
}