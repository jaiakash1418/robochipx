import { useState } from 'react';
import { ChevronDown, ChevronUp, Flame } from 'lucide-react';
import type { LiveFire } from '../api/types';

interface Props {
  fires: LiveFire[];
  onSelectFire: (lat: number, lng: number) => void;
}

function formatDuration(firstDetected: string): string {
  const start = new Date(firstDetected).getTime();
  const now = Date.now();
  const ms = now - start;
  if (ms < 0) return 'Just now';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return '<1h';
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  if (days > 0) return `${days}d ${remaining}h`;
  return `${hours}h`;
}

export default function LiveFiresPanel({ fires, onSelectFire }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="live-fires-panel">
      <button className="live-fires-header" onClick={() => setCollapsed((v) => !v)}>
        <span className="live-fires-header-left">
          <Flame size={16} className="live-fires-icon" />
          <span>Active Wildfires ({fires.length})</span>
        </span>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {!collapsed && (
        <div className="live-fires-list">
          {fires.slice(0, 50).map((fire) => (
            <button
              key={fire.id}
              className="live-fires-item"
              onClick={() => onSelectFire(fire.latitude, fire.longitude)}
              title="Click to focus on map"
            >
              <span className="live-fires-item-name">{fire.title}</span>
              <span className="live-fires-item-duration">{formatDuration(fire.first_detected)}</span>
              {fire.magnitude != null && (
                <span className="live-fires-item-size">
                  {fire.magnitude.toLocaleString()} {fire.magnitude_unit}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
