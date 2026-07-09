import { useEffect, useState } from 'react';
import { CloudSun, Wind, Droplets, Thermometer, Compass, RefreshCw } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

interface ForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  weatherCode: number;
}

interface HourlyPoint {
  time: string;
  temp: number;
  precip: number;
  wind: number;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Depositing rime fog',
  51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle',
  61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
  71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
  80: 'Slight Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with Slight Hail', 99: 'Thunderstorm with Heavy Hail',
};

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌦️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 75) return '🌨️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '❓';
}

export default function WeatherPage() {
  const { state } = useSimulation();
  const { weather } = state;

  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchForecast = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=38&longitude=-121.5&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=7',
      );
      const data = await res.json();

      const daily = data.daily;
      const days: ForecastDay[] = daily.time.map((t: string, i: number) => ({
        date: t,
        tempMax: daily.temperature_2m_max[i],
        tempMin: daily.temperature_2m_min[i],
        precip: daily.precipitation_sum[i],
        weatherCode: daily.weather_code[i],
      }));
      setForecast(days);

      const hrs = data.hourly;
      const now = new Date();
      const next48: HourlyPoint[] = [];
      for (let i = 0; i < hrs.time.length; i++) {
        const h = new Date(hrs.time[i]);
        if (h >= now && next48.length < 48) {
          next48.push({
            time: hrs.time[i],
            temp: hrs.temperature_2m[i],
            precip: hrs.precipitation_probability[i],
            wind: hrs.wind_speed_10m[i],
          });
        }
      }
      setHourly(next48);
    } catch {
      setError('Failed to fetch forecast. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  const currentWeather = weather;
  const windDirDeg = currentWeather?.wind_direction ?? 0;

  return (
    <div className="weather-page">
      <div className="weather-header">
        <h2><CloudSun size={22} /> Weather Center</h2>
        <button className="btn" onClick={fetchForecast} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="dashboard-error-banner"><span>{error}</span></div>}

      <div className="weather-grid">
        {/* Current conditions */}
        <div className="panel weather-current">
          <h3>Current Conditions</h3>
          {currentWeather ? (
            <div className="weather-current-body">
              <div className="weather-current-main">
                <span className="weather-current-temp">{Math.round(currentWeather.temperature)}°C</span>
                <span className="weather-current-desc">Simulation Weather</span>
              </div>
              <div className="weather-current-details">
                <div className="weather-detail-item">
                  <Wind size={16} />
                  <span>{Math.round(currentWeather.wind_speed)} km/h</span>
                </div>
                <div className="weather-detail-item">
                  <Compass size={16} />
                  <span>{windDirDeg}°</span>
                </div>
                <div className="weather-detail-item">
                  <Droplets size={16} />
                  <span>{Math.round(currentWeather.humidity)}%</span>
                </div>
                <div className="weather-detail-item">
                  <Thermometer size={16} />
                  <span>Source: {currentWeather.source}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="weather-empty">No weather data available</p>
          )}
        </div>

        {/* Live weather from Open-Meteo */}
        <div className="panel weather-current">
          <h3>Live Weather (Open-Meteo)</h3>
          {loading ? (
            <p className="weather-empty">Loading...</p>
          ) : forecast.length > 0 ? (
            <div className="weather-current-body">
              <div className="weather-current-main">
                <span className="weather-current-temp">
                  {weatherEmoji(forecast[0].weatherCode)} {Math.round(forecast[0].tempMax)}°C
                </span>
                <span className="weather-current-desc">{WEATHER_CODES[forecast[0].weatherCode] || 'Unknown'}</span>
              </div>
              <div className="weather-current-details">
                <div className="weather-detail-item">
                  <Thermometer size={16} />
                  <span>H: {Math.round(forecast[0].tempMax)}° L: {Math.round(forecast[0].tempMin)}°</span>
                </div>
                <div className="weather-detail-item">
                  <Droplets size={16} />
                  <span>{forecast[0].precip} mm precip</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="weather-empty">Click Refresh to load</p>
          )}
        </div>

        {/* 7-day forecast */}
        <div className="panel weather-forecast-panel">
          <h3>7-Day Forecast</h3>
          {forecast.length > 0 ? (
            <div className="weather-forecast-list">
              {forecast.map((day, i) => (
                <div key={i} className="weather-forecast-day">
                  <span className="forecast-day-name">
                    {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                  <span className="forecast-day-emoji">{weatherEmoji(day.weatherCode)}</span>
                  <span className="forecast-day-temps">
                    <span className="forecast-high">{Math.round(day.tempMax)}°</span>
                    <span className="forecast-low">{Math.round(day.tempMin)}°</span>
                  </span>
                  <span className="forecast-day-precip">{day.precip} mm</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="weather-empty">No forecast data</p>
          )}
        </div>
      </div>

      {/* Hourly chart */}
      {hourly.length > 0 && (
        <div className="panel weather-chart-panel">
          <h3>48-Hour Forecast</h3>
          <div className="weather-charts">
            <div className="weather-chart">
              <h4>Temperature</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={hourly.filter((_, i) => i % 3 === 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="time" tickFormatter={(v) => new Date(v).toLocaleDateString('en', { weekday: 'short', hour: '2-digit' })} stroke="var(--text-tertiary)" fontSize={10} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={11} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v as string).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit' })}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  />
                  <Line type="monotone" dataKey="temp" stroke="var(--accent-fire)" strokeWidth={2} dot={false} name="°C" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="weather-chart">
              <h4>Precipitation Probability</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourly.filter((_, i) => i % 3 === 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="time" tickFormatter={(v) => new Date(v).toLocaleDateString('en', { weekday: 'short', hour: '2-digit' })} stroke="var(--text-tertiary)" fontSize={10} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={11} />
                  <Tooltip
                    labelFormatter={(v) => new Date(v as string).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit' })}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  />
                  <Bar dataKey="precip" fill="var(--accent-water)" name="%" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
