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

export type FuelType = 0 | 1 | 2 | 3 | 4 | 5;

export const FUEL_COLORS: Record<FuelType, string> = {
  0: '#2d5a27',
  1: '#a4b843',
  2: '#3b82f6',
  3: '#d4a373',
  4: '#6b7280',
  5: '#92400e',
};

export const CELL_STATE_COLORS: Record<CellState, string> = {
  0: '',
  1: '#ff6b35',
  2: '#1a1a1a',
};