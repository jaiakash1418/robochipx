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
  EvacuationRouteRequest,
  EvacuationRouteResponse,
  DispatcherStatusResponse,
  DispatchOrder,
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

export const getEvacuationRoute = async (data: EvacuationRouteRequest) => {
  if (await isUsingMock()) {
    const state = mockEngine.getState();
    const fuel = state.fuel_map;
    const fire = state.fire_mask;
    const path = mockFindSafestRoute(data.start_x, data.start_y, data.goal_x, data.goal_y, fuel, fire);
    return { path, found: path.length > 0 } as EvacuationRouteResponse;
  }
  return apiClient.post<EvacuationRouteResponse>('/evacuation/route', data).then((r) => r.data);
};

function mockFindSafestRoute(
  startX: number, startY: number, goalX: number, goalY: number,
  fuelMap: number[][], fireMask: number[][],
): { x: number; y: number }[] {
  const size = fuelMap.length;
  const impassable = new Set([2, 5]);
  const key = (x: number, y: number) => `${x},${y}`;

  function isSafe(x: number, y: number): boolean {
    if (x < 0 || x >= size || y < 0 || y >= size) return false;
    if (impassable.has(fuelMap[y][x])) return false;
    if (fireMask[y][x] !== 0) return false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && fireMask[ny][nx] !== 0) return false;
      }
    }
    return true;
  }

  const openSet = [{ x: startX, y: startY, f: 0, g: 0 }];
  const cameFrom = new Map<string, { x: number; y: number } | null>();
  const gScore = new Map<string, number>();
  cameFrom.set(key(startX, startY), null);
  gScore.set(key(startX, startY), 0);

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    if (current.x === goalX && current.y === goalY) {
      const path: { x: number; y: number }[] = [];
      let c = { x: goalX, y: goalY };
      while (c) {
        path.push(c);
        c = cameFrom.get(key(c.x, c.y)) || undefined!;
        if (!c) break;
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
      const nx = current.x + dx, ny = current.y + dy;
      if (!isSafe(nx, ny)) continue;
      const cost = fuelMap[ny][nx] === 4 ? 0.5 : fuelMap[ny][nx] === 3 ? 1 : 1.5;
      const tentG = (gScore.get(key(current.x, current.y)) ?? 0) + cost;
      if (!gScore.has(key(nx, ny)) || tentG < gScore.get(key(nx, ny))!) {
        gScore.set(key(nx, ny), tentG);
        const h = Math.sqrt((nx - goalX) ** 2 + (ny - goalY) ** 2);
        openSet.push({ x: nx, y: ny, f: tentG + h, g: tentG });
        cameFrom.set(key(nx, ny), { x: current.x, y: current.y });
      }
    }
  }
  return [];
}

export const getDispatcherStatus = async () => {
  if (await isUsingMock()) {
    return mockGetDispatcherStatus();
  }
  return apiClient.get<DispatcherStatusResponse>('/dispatcher/status').then((r) => r.data);
};

function mockComputeDispatches(): DispatchOrder[] {
  const state = mockEngine.getState();
  const fire = state.fire_mask;
  const fuel = state.fuel_map;
  const towns = state.towns;
  const size = fuel.length;

  function fireRisk(x: number, y: number): number {
    const burning: [number, number][] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (fire[r][c] === 1) burning.push([c, r]);
      }
    }
    if (burning.length === 0) return 0;
    const minDist = Math.min(...burning.map(([bx, by]) => Math.sqrt((x - bx) ** 2 + (y - by) ** 2)));
    const distFactor = Math.max(0, 1 - minDist / 25);
    const flam = [1.0, 1.3, 0.0, 0.8, 0.3, 0.1];
    return Math.min(1, distFactor * (flam[fuel[y]?.[x] ?? 1] ?? 0.5));
  }

  const items: { score: number; risk: number; value: number; label: string; cx: number; cy: number }[] = [];
  for (const t of towns) {
    const risk = fireRisk(t.x, t.y);
    const val = 5;
    if (risk > 0) items.push({ score: risk * val, risk, value: val, label: t.name, cx: t.x, cy: t.y });
  }

  items.sort((a, b) => b.score - a.score);
  const units = ['Engine 1', 'Engine 2', 'Engine 3', 'Truck 4', 'Truck 5', 'Helicopter 6'];
  return items.slice(0, 12).map((item, i) => ({
    unit: units[i % units.length],
    priority: i + 1,
    risk_score: parseFloat(item.score.toFixed(2)),
    grid_x: item.cx,
    grid_y: item.cy,
    target: item.label,
    infrastructure_type: 'town',
    arrival_estimate_ticks: 3,
    risk_pct: Math.round(item.risk * 100),
    critical_value: item.value,
    action: `Deploy ${units[i % units.length]} to Grid (${item.cx}, ${item.cy}) - ${item.label} at Risk in ~6s`,
  }));
}

function mockGetDispatcherStatus(): DispatcherStatusResponse {
  const state = mockEngine.getState();
  const active = state.stats.burning;
  const dispatches = mockComputeDispatches();
  return { dispatches, active_fires: active, total_dispatched: dispatches.length };
}
