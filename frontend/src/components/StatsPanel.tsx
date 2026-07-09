import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';

export default function StatsPanel() {
  const { t } = useTranslation();
  const { state } = useSimulation();
  const { stats, step } = state;

  return (
    <div className="panel stats-panel">
      <h3>{t('stats.title')}</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{step}</div>
          <div className="stat-label">{t('stats.step')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_cells}</div>
          <div className="stat-label">{t('stats.totalCells')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value burning">{stats.burning}</div>
          <div className="stat-label">{t('stats.burning')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value burned">{stats.burned}</div>
          <div className="stat-label">{t('stats.burned')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.percentage_burned}%</div>
          <div className="stat-label">{t('stats.burnedPct')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active_fronts}</div>
          <div className="stat-label">{t('stats.activeFronts')}</div>
        </div>
      </div>
    </div>
  );
}