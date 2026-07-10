export interface HealthResponse {
  status: string;
  service: string;
  grid_size: number;
  running: boolean;
}

export interface IgniteRequest {
  x: number;
  y: number;
}

export interface IgniteAreaRequest {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TickResponse {
  step: number;
  fire_mask: number[][];
  fuel_map: number[][];
  towns: Town[];
  stats: Stats;
  alerts: Alert[];
  running: boolean;
}

export interface Town {
  x: number;
  y: number;
  name: string;
}

export interface Stats {
  total_cells: number;
  burning: number;
  burned: number;
  percentage_burned: number;
  active_fronts: number;
}

export interface Alert {
  town: string;
  town_x: number;
  town_y: number;
  distance_cells: number;
  severity: 'danger' | 'warning';
  evacuation_direction: { dx: number; dy: number };
  message: string;
}

export interface WeatherResponse {
  wind_speed: number;
  wind_direction: number;
  temperature: number;
  humidity: number;
  source: 'open-meteo' | 'demo' | 'manual_override';
  timestamp: string;
}

export interface WeatherOverrideRequest {
  wind_speed?: number;
  wind_direction?: number;
  temperature?: number;
  humidity?: number;
}

export interface AlertsResponse {
  alerts: Alert[];
}

export interface UserLocation {
  lat: number;
  lon: number;
}

export interface LLMQueryRequest {
  query: string;
  context?: Record<string, unknown>;
}

export interface LLMQueryResponse {
  answer: string;
}

export interface GridRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GridBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
}

export interface BatchIgniteRequest {
  cells: { x: number; y: number }[];
}

export type RectangleMode = 'off' | 'ignite' | 'zone';
export type PaintMode = 'off' | 'fire' | 'clear';
export type ToolMode = 'off' | 'select';

export type CellState = 0 | 1 | 2;

export type FuelType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const FUEL_COLORS: Record<number, string> = {
  0: '#2d5a27',
  1: '#a4b843',
  2: '#3b82f6',
  3: '#d4a373',
  4: '#6b7280',
  5: '#92400e',
  6: '#5f9ea0',
  7: '#f0e68c',
};

export interface DemoRunResponse {
  location: { lat: number; lon: number };
  firms_ignited: number;
  ticks: number;
  final_state: TickResponse;
  steps: Array<{ step: number; burning: number; burned: number; percentage_burned: number; active_fronts: number }>;
}

export const CELL_STATE_COLORS: Record<CellState, string> = {
  0: '',
  1: '#ff6b35',
  2: '#1a1a1a',
};

export interface LiveFireSource {
  id: string;
  url: string;
}

export interface LiveFire {
  id: string;
  title: string;
  description: string | null;
  closed: string | null;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  magnitude_unit: string;
  date: string;
  first_detected: string;
  sources: LiveFireSource[];
}

export interface FiresResponse {
  fires: LiveFire[];
  count: number;
}

export interface DispatchOrder {
  unit: string;
  priority: number;
  risk_score: number;
  grid_x: number;
  grid_y: number;
  target: string;
  infrastructure_type: string;
  arrival_estimate_ticks: number;
  risk_pct: number;
  critical_value: number;
  action: string;
}

export interface DispatcherStatusResponse {
  dispatches: DispatchOrder[];
  active_fires: number;
  total_dispatched: number;
}

export interface EvacuationRouteRequest {
  start_x: number;
  start_y: number;
  goal_x: number;
  goal_y: number;
}

export interface EvacuationRouteResponse {
  path: { x: number; y: number }[];
  found: boolean;
}

export interface FirmsFire {
  lat: number;
  lon: number;
  brightness: number;
  confidence: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
  daynight: string;
}

export interface GlobalFiresResponse {
  fires: FirmsFire[];
  source: string;
  api_key_configured: boolean;
  error?: string;
}

export interface LandcoverResponse {
  fuel_map: number[][];
  landcover: number[][];
  classes: string[][];
  source: string;
  towns?: Town[];
}

export interface EvacuationZonesResponse {
  zones: { name: string; lat: number; lon: number }[];
  towns_affected: string[];
}

export interface BBoxRequest {
  west: number;
  south: number;
  east: number;
  north: number;
  source?: string;
  day_range?: number;
}