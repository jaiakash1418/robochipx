import apiClient from './client';
import { mockEngine } from './mockEngine';
import type {
  HealthResponse,
  IgniteRequest,
  IgniteAreaRequest,
  TickResponse,
  WeatherResponse,
  WeatherOverrideRequest,
  AlertsResponse,
  LLMQueryRequest,
  LLMQueryResponse,
  Stats,
  GridRect,
  DemoRunResponse,
  FiresResponse,
  GlobalFiresResponse,
  BBoxRequest,
  FirmsFire,
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

export const igniteArea = async (data: IgniteAreaRequest) => {
  if (await isUsingMock()) {
    const count = mockEngine.igniteArea(data.x1, data.y1, data.x2, data.y2);
    if (count === 0) throw new Error('No unburned cells in the selected area');
    return { success: true, message: `Ignited ${count} cells`, count };
  }
  return apiClient.post<{ success: boolean; message: string; count: number }>('/simulation/ignite-area', data).then((r) => r.data);
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

export const getLiveFires = async () => {
  if (await isUsingMock()) return { fires: [], count: 0 } as unknown as FiresResponse;
  return apiClient.get<FiresResponse>('/fires/live').then((r) => r.data);
};

export const getGlobalFires = async (bbox: BBoxRequest) => {
  if (await isUsingMock()) {
    return {
      fires: MOCK_GLOBAL_FIRES.filter(f =>
        f.lat >= bbox.south && f.lat <= bbox.north &&
        f.lon >= bbox.west && f.lon <= bbox.east
      ),
      source: 'NASA FIRMS (mock)',
      api_key_configured: true,
    } as GlobalFiresResponse;
  }
  const params = {
    west: bbox.west,
    south: bbox.south,
    east: bbox.east,
    north: bbox.north,
    source: bbox.source ?? 'viirs_snpp',
    day_range: bbox.day_range ?? 1,
  };
  return apiClient.get<GlobalFiresResponse>('/fires/global', { params }).then((r) => r.data);
};

// Mock global fires for offline testing - real-world major wildfire locations
const MOCK_GLOBAL_FIRES: FirmsFire[] = [
  { lat: 37.8, lon: -121.5, brightness: 350, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // California
  { lat: 34.1, lon: -117.8, brightness: 380, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // LA area
  { lat: 45.5, lon: -122.0, brightness: 320, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Oregon
  { lat: -33.9, lon: 151.2, brightness: 340, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Australia (Sydney area)
  { lat: -23.5, lon: -46.6, brightness: 310, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Brazil (Amazon)
  { lat: 55.7, lon: 37.6, brightness: 300, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Russia (Moscow)
  { lat: 48.9, lon: 2.3, brightness: 290, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // France (Paris)
  { lat: -6.2, lon: 106.8, brightness: 330, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Indonesia
  { lat: 5.6, lon: -74.1, brightness: 340, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // Colombia
  { lat: 31.2, lon: 121.5, brightness: 320, confidence: 'nominal', acq_date: '2024-07-01', acq_time: '1200', satellite: 'VIIRS_SNPP_NRT', daynight: 'D' }, // China (Shanghai)
] as const;

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
  return apiClient.post<{ success: boolean; lat?: number; lon?: number; state?: TickResponse }>('/location/set', null, { params: { lat, lon } }).then((r) => r.data);
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

export const runDemo = async (ticks?: number, lat?: number, lon?: number) => {
  if (await isUsingMock()) {
    const data = await mockEngine.runDemo(ticks ?? 10, lat, lon);
    return data;
  }
  const params: Record<string, number> = {};
  if (ticks !== undefined) params.ticks = ticks;
  if (lat !== undefined) params.lat = lat;
  if (lon !== undefined) params.lon = lon;
  return apiClient.post<DemoRunResponse>('/demo/run', null, { params }).then((r) => r.data);
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
