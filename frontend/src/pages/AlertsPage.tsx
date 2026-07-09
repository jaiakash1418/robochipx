import { useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import { Filter, AlertTriangle, ArrowUpRight } from 'lucide-react';

type SeverityFilter = 'all' | 'danger' | 'warning';

export default function AlertsPage() {
  const { state } = useSimulation();
  const { alerts } = state;
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter((a) => a.severity === filter);

  const toggleExpand = (i: number) => {
    setExpanded(expanded === i ? null : i);
  };

  return (
    <div className="alerts-page">
      <div className="alerts-header">
        <div>
          <h2>Alert History</h2>
          <p className="alerts-subtitle">
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <div className="alerts-filters">
          <button
            className={`btn ${filter === 'all' ? 'btn-primary' : ''}`}
            onClick={() => setFilter('all')}
          >
            <Filter size={14} /> All
          </button>
          <button
            className={`btn ${filter === 'danger' ? 'btn-primary' : ''}`}
            onClick={() => setFilter('danger')}
          >
            <AlertTriangle size={14} /> Danger
          </button>
          <button
            className={`btn ${filter === 'warning' ? 'btn-primary' : ''}`}
            onClick={() => setFilter('warning')}
          >
            <AlertTriangle size={14} /> Warning
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="alerts-empty">
          <div className="alerts-empty-icon">🛡️</div>
          <h3>No alerts</h3>
          <p>No {filter !== 'all' ? filter : ''} alerts recorded yet. Ignite a fire on the dashboard to start.</p>
        </div>
      ) : (
        <div className="alerts-list">
          {filtered.map((alert, i) => (
            <div
              key={i}
              className={`alert-card ${alert.severity} ${expanded === i ? 'expanded' : ''}`}
              onClick={() => toggleExpand(i)}
            >
              <div className="alert-card-header">
                <div className="alert-card-icon">
                  {alert.severity === 'danger' ? '⚠️' : '⚡'}
                </div>
                <div className="alert-card-info">
                  <span className="alert-card-title">{alert.town}</span>
                  <span className="alert-card-severity">{alert.severity.toUpperCase()}</span>
                </div>
                <span className="alert-card-distance">
                  {alert.distance_cells.toFixed(1)} cells
                </span>
                <ArrowUpRight size={16} className="alert-card-expand" />
              </div>

              {expanded === i && (
                <div className="alert-card-body">
                  <p className="alert-card-message">{alert.message}</p>
                  <div className="alert-card-details">
                    <div className="alert-detail-row">
                      <span>Town Position</span>
                      <span>({alert.town_x}, {alert.town_y})</span>
                    </div>
                    <div className="alert-detail-row">
                      <span>Distance</span>
                      <span>{alert.distance_cells.toFixed(1)} cells</span>
                    </div>
                    <div className="alert-detail-row">
                      <span>Severity</span>
                      <span className={`severity-tag ${alert.severity}`}>{alert.severity}</span>
                    </div>
                    {alert.evacuation_direction && (
                      <div className="alert-detail-row">
                        <span>Evacuation Vector</span>
                        <span>
                          dx: {alert.evacuation_direction.dx.toFixed(2)},
                          dy: {alert.evacuation_direction.dy.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}