import { useState, useEffect, useRef } from 'react';
import { animate } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';
import InfoTooltip from './InfoTooltip';

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const controls = animate(prevRef.current, value, {
      duration: 0.35,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Number(v.toFixed(decimals))),
    });
    prevRef.current = value;
    return controls.stop;
  }, [value, decimals]);

  return <>{display}</>;
}

export default function StatsPanel() {
  const { t } = useTranslation();
  const { state } = useSimulation();
  const { stats, step } = state;

  return (
    <div className="panel stats-panel">
      <h3>{t('stats.title')}</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value"><AnimatedNumber value={step} /></div>
          <div className="stat-label">{t('stats.step')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value"><AnimatedNumber value={stats.total_cells} /></div>
          <div className="stat-label">{t('stats.totalCells')}</div>
        </div>
        <div className="stat-card">
<<<<<<< HEAD
          <div className="stat-value burning"><AnimatedNumber value={stats.burning} /></div>
          <div className="stat-label">{t('stats.burning')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value burned"><AnimatedNumber value={stats.burned} /></div>
          <div className="stat-label">{t('stats.burned')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value"><AnimatedNumber value={stats.percentage_burned} decimals={1} />%</div>
          <div className="stat-label">{t('stats.burnedPct')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value"><AnimatedNumber value={stats.active_fronts} /></div>
          <div className="stat-label">{t('stats.activeFronts')}</div>
=======
          <div className="stat-value burning">{stats.burning}</div>
          <div className="stat-label">
            {t('stats.burning')}
            <InfoTooltip text={t('tooltips.burning')} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value burned">{stats.burned}</div>
          <div className="stat-label">
            {t('stats.burned')}
            <InfoTooltip text={t('tooltips.burned')} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.percentage_burned}%</div>
          <div className="stat-label">
            {t('stats.burnedPct')}
            <InfoTooltip text={t('tooltips.burnedPct')} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.active_fronts}</div>
          <div className="stat-label">
            {t('stats.activeFronts')}
            <InfoTooltip text={t('tooltips.activeFronts')} />
          </div>
>>>>>>> main
        </div>
      </div>
    </div>
  );
}
