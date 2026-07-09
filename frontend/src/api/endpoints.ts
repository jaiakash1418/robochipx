import apiClient from './client';
import type {
  HealthResponse,
  IgniteRequest,
  TickResponse,
  WeatherResponse,
  WeatherOverrideRequest,
  AlertsResponse,
  LLMQueryRequest,
  LLMQueryResponse,
  Stats,
} from './types';

export const healthCheck = () =>
  apiClient.get<HealthResponse>('/health').then((r) => r.data);

export const ignite = (data: IgniteRequest) =>
  apiClient.post<{ success: boolean; message: string }>('/simulation/ignite', data).then((r) => r.data);

export const tick = () =>
  apiClient.post<TickResponse>('/simulation/tick').then((r) => r.data);

export const getState = () =>
  apiClient.get<TickResponse>('/simulation/state').then((r) => r.data);

export const resetSimulation = () =>
  apiClient.post<{ success: boolean; message: string }>('/simulation/reset').then((r) => r.data);

export const getStats = () =>
  apiClient.get<Stats>('/simulation/stats').then((r) => r.data);

export const getWeather = () =>
  apiClient.get<WeatherResponse>('/weather').then((r) => r.data);

export const getWeatherLive = () =>
  apiClient.get<WeatherResponse>('/weather/live').then((r) => r.data);

export const overrideWeather = (data: WeatherOverrideRequest) =>
  apiClient.post<WeatherResponse>('/weather/override', data).then((r) => r.data);

export const getAlerts = () =>
  apiClient.get<AlertsResponse>('/alerts').then((r) => r.data);

export const queryLLM = (data: LLMQueryRequest) =>
  apiClient.post<LLMQueryResponse>('/llm/query', data).then((r) => r.data);