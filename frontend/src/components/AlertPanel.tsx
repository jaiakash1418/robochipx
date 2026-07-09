import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';
import { useToast } from '../toast/ToastContext';

export default function AlertPanel() {
  const { t } = useTranslation();
  const { state } = useSimulation();
  const { alerts } = state;
  const { addToast } = useToast();
  const prevRef = useRef(alerts.length);

  useEffect(() => {
    if (alerts.length > prevRef.current) {
      const newest = alerts[alerts.length - 1];
      addToast(newest.message, newest.severity);
    }
    prevRef.current = alerts.length;
  }, [alerts, addToast]);

  if (alerts.length === 0) {
    return (
      <div className="panel alert-panel">
        <h3>{t('alerts.title')}</h3>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="panel alert-panel">
      <h3>{t('alerts.title')}</h3>
      {alerts.map((alert, i) => (
        <div key={i} className={`alert-item ${alert.severity}`}>
          <span className="alert-badge">
            {alert.severity === 'danger' ? '⚠️' : '⚡'}
          </span>
          <div style={{ flex: 1 }}>
            <p className="alert-message">{alert.message}</p>
            <p className="alert-detail">
              {alert.severity === 'danger' ? t('alerts.distance') : 'Distance'}:{' '}
              {alert.distance_cells.toFixed(1)} cells
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}