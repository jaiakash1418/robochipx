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
  GridRect,
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

export const getWeather = async (lat?: number, lon?: number) => {
  if (await isUsingMock()) return { ...mockEngine.weather };
  const params: Record<string, number> = {};
  if (lat !== undefined) params.lat = lat;
  if (lon !== undefined) params.lon = lon;
  return apiClient.get<WeatherResponse>('/weather', { params }).then((r) => r.data);
};

export const getWeatherLive = async (lat?: number, lon?: number) => {
  if (await isUsingMock()) return { ...mockEngine.weather };
  const params: Record<string, number> = {};
  if (lat !== undefined) params.lat = lat;
  if (lon !== undefined) params.lon = lon;
  return apiClient.get<WeatherResponse>('/weather/live', { params }).then((r) => r.data);
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

export const clearBatch = async (cells: { x: number; y: number }[]) => {
  if (await isUsingMock()) {
    for (const c of cells) mockEngine.clear(c.x, c.y);
    return;
  }
  return apiClient.post('/clear/batch', { cells }).then((r) => r.data);
};

export const getEvaluation = async () => {
  if (await isUsingMock()) return { f1: 0.206, iou: 0.12, samples: [] };
  return apiClient.get('/model/evaluation').then((r) => r.data);
};

export const evaluateModel = async () => {
  if (await isUsingMock()) return { f1: 0.206, iou: 0.12, samples: [] };
  return apiClient.post('/model/evaluate').then((r) => r.data);
};

export const setBackendLocation = async (lat?: number, lon?: number) => {
  if (await isUsingMock()) return { success: true, lat, lon };
  return apiClient.post('/location/set', null, { params: { lat, lon } }).then((r) => r.data);
};

export const igniteBatch = async (cells: { x: number; y: number }[]) => {
  if (await isUsingMock()) {
    for (const c of cells) mockEngine.ignite(c.x, c.y);
    return;
  }
  return apiClient.post('/ignite/batch', { cells }).then((r) => r.data);
};

export const setInitialZone = async (rect: GridRect | null) => {
  if (await isUsingMock()) return;
  const body = rect ?? {};
  return apiClient.post('/zone/set', body).then((r) => r.data);
};

export const queryLLM = async (data: LLMQueryRequest) => {
  if (await isUsingMock()) {
    const state = mockEngine.getState();
    const alerts = state.alerts.map((a) => a.message).join(', ') || 'No active alerts.';
    const loc = data.context?.lat && data.context?.lon ? `User location: ${data.context.lat}, ${data.context.lon}. ` : '';
    return { answer: `${loc}Current simulation at step ${state.step}: ${state.stats.percentage_burned}% area burned, ${state.stats.active_fronts} active fire fronts. ${alerts} The fire is ${state.running ? 'spreading' : 'paused'}.` } as LLMQueryResponse;
  }
  return apiClient.post<LLMQueryResponse>('/llm/query', data).then((r) => r.data);
};
