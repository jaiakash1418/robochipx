import { Compass, Wind, Droplets, Thermometer } from 'lucide-react';
import type { LocationWeather } from '../api/weatherApi';

interface Props {
  weather: LocationWeather | null;
  loading: boolean;
}

export default function MapWeatherOverlay({ weather, loading }: Props) {
  if (!weather && !loading) return null;

  return (
    <div className="map-weather-overlay">
      {loading && !weather && (
        <div className="weather-loading">Loading weather...</div>
      )}

      {weather && (
        <>
          <div className="weather-header">
            <Compass size={14} />
            <span className="weather-location">
              {weather.location.lat.toFixed(2)}°N, {weather.location.lng.toFixed(2)}°W
            </span>
          </div>

          <div className="weather-rows">
            <div className="weather-row">
              <div className="weather-row-icon">
                <Wind size={14} />
              </div>
              <div className="weather-row-info">
                <span className="weather-row-label">Wind</span>
                <span className="weather-row-value">
                  {weather.windSpeed.toFixed(1)} km/h
                </span>
              </div>
              <div
                className="weather-compass"
                style={{ transform: `rotate(${weather.windDirection}deg)` }}
                title={`${weather.windDirection}°`}
              >
                ↑
              </div>
            </div>

            <div className="weather-row">
              <div className="weather-row-icon">
                <Droplets size={14} />
              </div>
              <div className="weather-row-info">
                <span className="weather-row-label">Humidity</span>
                <span className="weather-row-value">{weather.humidity}%</span>
              </div>
            </div>

            <div className="weather-row">
              <div className="weather-row-icon">
                <Thermometer size={14} />
              </div>
              <div className="weather-row-info">
                <span className="weather-row-label">Temperature</span>
                <span className="weather-row-value">
                  {weather.temperature.toFixed(1)}°C
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}