import { useEffect, useRef } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import MapView from '../components/MapView';
import ControlPanel from '../components/ControlPanel';
import StatsPanel from '../components/StatsPanel';
import AlertPanel from '../components/AlertPanel';
import LLMChat from '../components/LLMChat';
import Legend from '../components/Legend';
import TimeScrubber from '../components/TimeScrubber';
import ScenarioPanel from '../components/ScenarioPanel';
import { useSimulation } from '../context/SimulationContext';

const TICK_INTERVAL = 2000;

export default function DashboardPage() {
  const { state, doTick, doReset } = useSimulation();
  const { running, loading, error } = state;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        </div>
      )}
      <div className="dashboard-map-area">
        <div className="dashboard-map">
          <div className="map-overlay-controls">
            <button
              className="btn btn-primary map-control-btn"
              onClick={() => doTick()}
              disabled={!running}
              title="Manual step"
            >
              <Play size={14} /> Step
            </button>
            <button
              className="btn map-control-btn"
              onClick={doReset}
              title="Clear map & reset"
            >
              <RotateCcw size={14} /> Clear
            </button>
            {running && (
              <span className="map-live-badge">
                <span className="live-dot" /> LIVE
              </span>
            )}
          </div>
          <MapView />
          <Legend />
        </div>
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