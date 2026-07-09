import { useTranslation } from 'react-i18next';
import InfoTooltip from './InfoTooltip';

const ITEMS = [
  { labelKey: 'legend.forest', color: '#2d5a27' },
  { labelKey: 'legend.grass', color: '#a4b843' },
  { labelKey: 'legend.water', color: '#3b82f6' },
  { labelKey: 'legend.town', color: '#d4a373' },
  { labelKey: 'legend.road', color: '#6b7280' },
  { labelKey: 'legend.burning', color: '#ff6b35' },
  { labelKey: 'legend.burned', color: '#1a1a1a' },
];

export default function Legend() {
  const { t } = useTranslation();

  return (
    <div className="legend">
      <h4>
        {t('legend.title')}
        <InfoTooltip text={t('tooltips.legend')} />
      </h4>
      <div className="legend-items">
        {ITEMS.map((item) => (
          <div key={item.labelKey} className="legend-item">
            <span className="legend-color" style={{ background: item.color }} />
            <span>{t(item.labelKey)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}