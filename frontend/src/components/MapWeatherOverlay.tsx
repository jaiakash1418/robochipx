import { Compass, Wind, Droplets, Thermometer } from 'lucide-react';
import type { WeatherResponse } from '../api/types';

interface Props {
  weather: WeatherResponse | null;
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
            <span className="weather-source">{weather.source}</span>
          </div>

          <div className="weather-rows">
            <div className="weather-row">
              <div className="weather-row-icon">
                <Wind size={14} />
              </div>
              <div className="weather-row-info">
                <span className="weather-row-label">Wind</span>
                <span className="weather-row-value">
                  {weather.wind_speed.toFixed(1)} km/h
                </span>
              </div>
              <div
                className="weather-compass"
                style={{ transform: `rotate(${weather.wind_direction}deg)` }}
                title={`${weather.wind_direction}°`}
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