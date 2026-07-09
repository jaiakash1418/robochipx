import axios from 'axios';

interface OpenMeteoCurrent {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
}

interface OpenMeteoResponse {
  current: OpenMeteoCurrent;
}

export interface LocationWeather {
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  location: { lat: number; lng: number };
  timestamp: string;
}

export async function fetchLocationWeather(
  lat: number,
  lng: number,
): Promise<LocationWeather> {
  const { data } = await axios.get<OpenMeteoResponse>(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude: lat.toFixed(2),
        longitude: lng.toFixed(2),
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
      },
    },
  );

  return {
    temperature: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windDirection: data.current.wind_direction_10m,
    location: { lat, lng },
    timestamp: new Date().toISOString(),
  };
}