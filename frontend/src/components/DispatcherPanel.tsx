import { useEffect, useState, useRef } from 'react';
import { Flame, Siren, MapPin, Shield } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { getDispatcherStatus } from '../api/endpoints';
import type { DispatchOrder } from '../api/types';

export default function DispatcherPanel() {
  const { state } = useSimulation();
  const { stats, running } = state;
  const [dispatches, setDispatches] = useState<DispatchOrder[]>([]);
  const [activeFires, setActiveFires] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDispatches = async () => {
    try {
      const res = await getDispatcherStatus();
      setDispatches(res.dispatches);
      setActiveFires(res.active_fires);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (stats.burning > 0) {
      fetchDispatches();
      intervalRef.current = setInterval(fetchDispatches, 4000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [stats.burning]);

  if (dispatches.length === 0) {
    return (
      <div className="dispatcher-panel">
        <div className="dispatcher-header">
          <Shield size={16} />
          <span>Fire Chief Dispatcher</span>
        </div>
        <div className="dispatcher-empty">
          <Siren size={28} />
          <p>No active dispatches</p>
          <p className="dispatcher-hint">Start a fire to see dispatch orders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dispatcher-panel">
      <div className="dispatcher-header">
        <Shield size={16} />
        <span>Fire Chief Dispatcher</span>
        <span className="dispatcher-badge">{dispatches.length}</span>
      </div>

      <div className="dispatcher-summary">
        <div className="dispatcher-summary-item">
          <Flame size={14} />
          <span>{activeFires} active</span>
        </div>
        <div className="dispatcher-summary-item">
          <Siren size={14} />
          <span>{dispatches.length} deployed</span>
        </div>
        <div className="dispatcher-summary-item">
          {running ? (
            <span className="dispatcher-live">● LIVE</span>
          ) : (
            <span className="dispatcher-paused">● PAUSED</span>
          )}
        </div>
      </div>

      <div className="dispatcher-list">
        {dispatches.map((d, i) => (
          <div key={i} className={`dispatch-item dispatch-p${d.priority <= 3 ? 'critical' : d.priority <= 6 ? 'high' : 'standard'}`}>
            <div className="dispatch-rank">#{d.priority}</div>
            <div className="dispatch-body">
              <div className="dispatch-unit">{d.unit}</div>
              <div className="dispatch-target">
                <MapPin size={11} />
                <span>{d.target}</span>
              </div>
              <div className="dispatch-meta">
                <span className="dispatch-risk" style={{ color: d.risk_pct > 60 ? '#ff6b35' : d.risk_pct > 30 ? '#fbbf24' : '#34d399' }}>
                  {d.risk_pct}% risk
                </span>
                <span className="dispatch-value">CV: {d.critical_value}</span>
                <span className="dispatch-grid">({d.grid_x},{d.grid_y})</span>
              </div>
              <div className="dispatch-action">{d.action}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}