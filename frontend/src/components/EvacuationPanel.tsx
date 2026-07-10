import { useState, useCallback, useEffect, useRef } from 'react';
import { MapPin, Route, AlertTriangle } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { getEvacuationRoute } from '../api/endpoints';
import type { Town } from '../api/types';

interface Props {
  onRouteFound: (path: { x: number; y: number }[]) => void;
  onSelectSafeZone: () => void;
  safeZone: { x: number; y: number } | null;
  routePath: { x: number; y: number }[];
}

export default function EvacuationPanel({ onRouteFound, onSelectSafeZone, safeZone, routePath }: Props) {
  const { state } = useSimulation();
  const { towns, alerts } = state;
  const [selectedTown, setSelectedTown] = useState<Town | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [calculating, setCalculating] = useState(false);

  const recalcRoute = useCallback(async () => {
    if (!selectedTown || !safeZone) return;
    setCalculating(true);
    try {
      const res = await getEvacuationRoute({
        start_x: selectedTown.x,
        start_y: selectedTown.y,
        goal_x: safeZone.x,
        goal_y: safeZone.y,
      });
      if (res.found) {
        onRouteFound(res.path);
      } else {
        onRouteFound([]);
      }
    } catch {
      onRouteFound([]);
    } finally {
      setCalculating(false);
    }
  }, [selectedTown?.x, selectedTown?.y, safeZone?.x, safeZone?.y, onRouteFound]);

  useEffect(() => {
    recalcRoute();
  }, [recalcRoute]);

  useEffect(() => {
    if (state.running && selectedTown && safeZone) {
      intervalRef.current = setInterval(recalcRoute, 3000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.running, selectedTown, safeZone, recalcRoute]);

  const handleTownSelect = (town: Town) => {
    setSelectedTown(town);
  };

  const townAlerts = new Set(alerts.map((a) => a.town));

  return (
    <div className="evacuation-panel">
      <div className="evacuation-header">
        <Route size={16} />
        <span>Evacuation Planner</span>
      </div>

      {towns.length === 0 && (
        <div className="evacuation-empty">
          <MapPin size={32} />
          <p>No towns in the current grid area.</p>
          <p className="evacuation-hint">Move the grid to an area with towns.</p>
        </div>
      )}

      {towns.length > 0 && (
        <>
          <div className="evacuation-section">
            <div className="evacuation-section-title">Select Start (Town)</div>
            <div className="evacuation-town-list">
              {towns.map((town) => {
                const isThreatened = townAlerts.has(town.name);
                const isSelected = selectedTown?.x === town.x && selectedTown?.y === town.y;
                return (
                  <button
                    key={`${town.x}-${town.y}`}
                    className={`evacuation-town-btn${isSelected ? ' selected' : ''}${isThreatened ? ' threatened' : ''}`}
                    onClick={() => handleTownSelect(town)}
                  >
                    {isThreatened && <AlertTriangle size={12} />}
                    <span>{town.name}</span>
                    {isSelected && <span className="evacuation-check">&#10003;</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="evacuation-section">
            <div className="evacuation-section-title">Select Safe Zone</div>
            <button className="evacuation-safe-btn" onClick={onSelectSafeZone}>
              <MapPin size={14} />
              {safeZone ? `Safe zone: (${safeZone.x}, ${safeZone.y})` : 'Click on map to set safe zone'}
            </button>
          </div>

          <div className="evacuation-status">
            {calculating && <div className="evacuation-loading">Calculating safest route...</div>}
            {!calculating && routePath.length > 0 && (
              <div className="evacuation-found">
                <Route size={14} />
                <span>Route found: {routePath.length} cells</span>
              </div>
            )}
            {!calculating && routePath.length === 0 && selectedTown && safeZone && (
              <div className="evacuation-blocked">
                <AlertTriangle size={14} />
                <span>No safe route — fire blocking all paths</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}