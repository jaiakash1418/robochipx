import apiClient from './client';
import { mockEngine } from './mockEngine';
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

let useMock: boolean | null = null;

async function isUsingMock(): Promise<boolean> {
  if (useMock !== null) return useMock;
  try {
    await apiClient.get('/health', { timeout: 3000 });
    useMock = false;
    console.log('[API] Backend reachable');
  } catch {
    useMock = true;
    console.warn('[API] Backend unreachable, using mock simulation');
  }
  return useMock;
}

export const healthCheck = async () => {
  if (await isUsingMock()) return { status: 'ok', service: 'mock', grid_size: 64, running: mockEngine.running } as HealthResponse;
  return apiClient.get<HealthResponse>('/health').then((r) => r.data);
};

export const ignite = async (data: IgniteRequest) => {
  if (await isUsingMock()) {
    const ok = mockEngine.ignite(data.x, data.y);
    if (!ok) throw new Error('Invalid cell coordinates or cell already burning');
    return { success: true, message: `Ignited at (${data.x}, ${data.y})` };
  }
  return apiClient.post<{ success: boolean; message: string }>('/simulation/ignite', data).then((r) => r.data);
};

export const tick = async () => {
  if (await isUsingMock()) return mockEngine.tick();
  return apiClient.post<TickResponse>('/simulation/tick').then((r) => r.data);
};

export const getState = async () => {
  if (await isUsingMock()) return mockEngine.getState();
  return apiClient.get<TickResponse>('/simulation/state').then((r) => r.data);
};

export const resetSimulation = async () => {
  if (await isUsingMock()) { mockEngine.reset(); return { success: true, message: 'Simulation reset' }; }
  return apiClient.post<{ success: boolean; message: string }>('/simulation/reset').then((r) => r.data);
};

export const getStats = async () => {
  if (await isUsingMock()) return mockEngine.getState().stats;
  return apiClient.get<Stats>('/simulation/stats').then((r) => r.data);
};

export const getWeather = async () => {
  if (await isUsingMock()) return { ...mockEngine.weather };
  return apiClient.get<WeatherResponse>('/weather').then((r) => r.data);
};

export const getWeatherLive = async () => {
  if (await isUsingMock()) return { ...mockEngine.weather };
  return apiClient.get<WeatherResponse>('/weather/live').then((r) => r.data);
};

export const overrideWeather = async (data: WeatherOverrideRequest) => {
  if (await isUsingMock()) return mockEngine.overrideWeather(data);
  return apiClient.post<WeatherResponse>('/weather/override', data).then((r) => r.data);
};

export const getAlerts = async () => {
  if (await isUsingMock()) {
    const alerts = mockEngine.getState().alerts;
    return { alerts } as AlertsResponse;
  }
  return apiClient.get<AlertsResponse>('/alerts').then((r) => r.data);
};

export const queryLLM = async (data: LLMQueryRequest) => {
  if (await isUsingMock()) {
    const state = mockEngine.getState();
    const alerts = state.alerts.map((a) => a.message).join(', ') || 'No active alerts.';
    return { answer: `Current simulation at step ${state.step}: ${state.stats.percentage_burned}% area burned, ${state.stats.active_fronts} active fire fronts. ${alerts} The fire is ${state.running ? 'spreading' : 'paused'}.` } as LLMQueryResponse;
  }
  return apiClient.post<LLMQueryResponse>('/llm/query', data).then((r) => r.data);
};
