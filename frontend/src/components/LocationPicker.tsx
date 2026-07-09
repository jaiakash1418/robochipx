import { useState } from 'react';
import { MapPin, Crosshair, Globe, Navigation } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import * as api from '../api/endpoints';
import InfoTooltip from './InfoTooltip';

const DEFAULT_LAT = 39.8283;
const DEFAULT_LON = -98.5795;

export default function LocationPicker() {
  const { state, doFetchWeatherLive, setCustomLocation, requestGps, flyToLocation } = useSimulation();
  const { customLat, customLon, userLocation } = state;

  const [latInput, setLatInput] = useState(customLat?.toString() ?? '');
  const [lonInput, setLonInput] = useState(customLon?.toString() ?? '');

  const syncLocation = (lat: number, lon: number) => {
    setCustomLocation(lat, lon);
    doFetchWeatherLive(lat, lon);
  };

  const handleApply = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (isNaN(lat) || isNaN(lon)) return;
    syncLocation(lat, lon);
  };

  const handleUseGps = async () => {
    try {
      const loc = await requestGps();
      setLatInput(loc.lat.toString());
      setLonInput(loc.lon.toString());
      syncLocation(loc.lat, loc.lon);
      flyToLocation(loc.lat, loc.lon, 12);
    } catch {
      // GPS unavailable or denied
    }
  };

  const handleFlyTo = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (!isNaN(lat) && !isNaN(lon)) {
      flyToLocation(lat, lon, 12);
    }
  };

  const handleUseDefaultLocation = () => {
    setLatInput('');
    setLonInput('');
    setCustomLocation(null, null);
    api.setBackendLocation(DEFAULT_LAT, DEFAULT_LON);
    doFetchWeatherLive(DEFAULT_LAT, DEFAULT_LON);
  };

  return (
    <div className="location-picker">
      <div className="location-picker-header">
        <MapPin size={14} />
        <span>Location</span>
        <InfoTooltip text="Set a custom location to generate terrain and fetch live weather. The simulation grid is ~1°×1° centered on your chosen point." />
      </div>
      <div className="location-picker-inputs">
        <input
          type="number"
          className="location-input"
          placeholder="Latitude"
          value={latInput}
          onChange={(e) => setLatInput(e.target.value)}
          step="0.01"
        />
        <input
          type="number"
          className="location-input"
          placeholder="Longitude"
          value={lonInput}
          onChange={(e) => setLonInput(e.target.value)}
          step="0.01"
        />
      </div>
      <div className="location-picker-actions">
        <button className="btn" onClick={handleApply} disabled={!latInput || !lonInput}>
          <Globe size={12} /> Apply
        </button>
        <button className="btn" onClick={handleFlyTo} disabled={!latInput || !lonInput}>
          <Navigation size={12} /> Fly To
        </button>
        <button className="btn" onClick={handleUseGps}>
          <Crosshair size={12} /> GPS
        </button>
      </div>
      {customLat !== null && customLon !== null && (
        <div className="location-picker-active">
          Using weather from {customLat.toFixed(4)}, {customLon.toFixed(4)}
        </div>
      )}
      {userLocation && (
        <div className="location-picker-user">
          Your GPS: {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
        </div>
      )}
      {(customLat !== null || customLon !== null) && (
        <button className="btn location-picker-default-btn" onClick={handleUseDefaultLocation}>
          Reset to Default
        </button>
      )}
    </div>
  );
}
