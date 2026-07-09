import type { TickResponse, WeatherResponse, Stats, Alert, Town, DemoRunResponse } from './types';

const GRID_SIZE = 64;
const UNBURNED = 0;
const BURNING = 1;
const BURNED = 2;

export class MockSimulationEngine {
  fuelMap: number[][] = [];
  fireMask: number[][] = [];
  towns: Town[] = [];
  step = 0;
  running = false;
  weather: WeatherResponse = {
    wind_speed: 12,
    wind_direction: 135,
    temperature: 29,
    humidity: 34,
    source: 'demo',
    timestamp: new Date().toISOString(),
  };

  constructor() {
    this._generateFuelMap();
  }

  private _generateFuelMap() {
    this.fuelMap = [];
    this.towns = [];
    const rng = this._seededRng(42);
    for (let i = 0; i < GRID_SIZE; i++) {
      this.fuelMap[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        const r = rng();
        if (r < 0.5) this.fuelMap[i][j] = 0;
        else if (r < 0.8) this.fuelMap[i][j] = 1;
        else if (r < 0.85) this.fuelMap[i][j] = 2;
        else if (r < 0.95) { this.fuelMap[i][j] = 3; this.towns.push({ x: i, y: j, name: `Town ${this.towns.length + 1}` }); }
        else this.fuelMap[i][j] = 4;
      }
    }
    this._placeTown(10, 10, 'Lakewood');
    this._placeTown(45, 50, 'Pine Valley');
    this._placeTown(30, 15, 'Riverside');
    this.fireMask = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  }

  private _placeTown(x: number, y: number, name: string) {
    this.fuelMap[y][x] = 3;
    this.towns.push({ x, y, name });
  }

  private _seededRng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  ignite(x: number, y: number) {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    if (this.fireMask[y][x] !== UNBURNED) return false;
    if (this.fuelMap[y][x] === 2) return false;
    this.fireMask[y][x] = BURNING;
    this.running = true;
    return true;
  }

<<<<<<< HEAD
  igniteArea(x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(GRID_SIZE - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(GRID_SIZE - 1, Math.max(y1, y2));
    let count = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.fireMask[y][x] === UNBURNED && this.fuelMap[y][x] !== 2) {
          this.fireMask[y][x] = BURNING;
          count++;
        }
      }
    }
    if (count > 0) this.running = true;
    return count;
=======
  clear(x: number, y: number) {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    this.fireMask[y][x] = UNBURNED;
    return true;
>>>>>>> main
  }

  reset() {
    for (let y = 0; y < GRID_SIZE; y++)
      for (let x = 0; x < GRID_SIZE; x++)
        this.fireMask[y][x] = UNBURNED;
    this.step = 0;
    this.running = false;
  }

  tick(): TickResponse {
    if (!this.running) return this._buildResponse();
    const prob = this._predict();
    this._applySpread(prob);
    this.step++;
    return this._buildResponse();
  }

  overrideWeather(data: Partial<WeatherResponse>): WeatherResponse {
    this.weather = { ...this.weather, ...data, source: 'manual_override', timestamp: new Date().toISOString() };
    return { ...this.weather };
  }

  private _predict(): number[][] {
    const { wind_speed, wind_direction } = this.weather;
    const burning: [number, number][] = [];
    for (let y = 0; y < GRID_SIZE; y++)
      for (let x = 0; x < GRID_SIZE; x++)
        if (this.fireMask[y][x] === BURNING) burning.push([y, x]);

    if (!burning.length) return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

    const spread: boolean[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    for (const [by, bx] of burning) {
      for (const [ny, nx] of [[by - 1, bx], [by + 1, bx], [by, bx - 1], [by, bx + 1]]) {
        if (
          ny >= 0 && ny < GRID_SIZE && nx >= 0 && nx < GRID_SIZE &&
          this.fireMask[ny][nx] === UNBURNED &&
          this.fuelMap[ny][nx] !== 2
        )
          spread[ny][nx] = true;
      }
    }

    const fuelFlammability = [0.85, 1.0, 0.0, 0.6, 0.15, 0.05];
    const windFactor = 1.0 + Math.min(wind_speed / 50.0, 2.0);

    let cx = 0, cy = 0;
    if (wind_speed > 1) {
      for (const [, bx] of burning) cx += bx;
      for (const [by] of burning) cy += by;
      cx /= burning.length; cy /= burning.length;
    }

    const rad = wind_direction * Math.PI / 180;
    const dwx = -Math.sin(rad);
    const dwy = Math.cos(rad);
    const prob: number[][] = [];

    for (let y = 0; y < GRID_SIZE; y++) {
      prob[y] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!spread[y][x]) { prob[y][x] = 0; continue; }
        let p = fuelFlammability[this.fuelMap[y][x] as 0 | 1 | 2 | 3 | 4 | 5] * 0.5 * windFactor;
        if (wind_speed > 1) {
          const downwind = (x - cx) * dwx + (y - cy) * dwy;
          const bias = Math.max(0, Math.min(1, downwind / GRID_SIZE * 3));
          p = Math.max(0, Math.min(0.95, p + bias * wind_speed * 0.02));
        }
        prob[y][x] = p;
      }
    }
    return prob;
  }

  private _applySpread(prob: number[][]) {
    const THRESHOLD = 0.4;
    for (let y = 0; y < GRID_SIZE; y++)
      for (let x = 0; x < GRID_SIZE; x++) {
        if (this.fireMask[y][x] === BURNING) this.fireMask[y][x] = BURNED;
        if (prob[y][x] >= THRESHOLD && this.fireMask[y][x] === UNBURNED && this.fuelMap[y][x] !== 2)
          this.fireMask[y][x] = BURNING;
      }
  }

  private _stats(): Stats {
    let burning = 0, burned = 0;
    for (let y = 0; y < GRID_SIZE; y++)
      for (let x = 0; x < GRID_SIZE; x++) {
        if (this.fireMask[y][x] === BURNING) burning++;
        if (this.fireMask[y][x] === BURNED) burned++;
      }
    return { total_cells: GRID_SIZE * GRID_SIZE, burning, burned, percentage_burned: Math.round(burned / (GRID_SIZE * GRID_SIZE) * 10000) / 100, active_fronts: burning };
  }

  private _alerts(): Alert[] {
    const alerts: Alert[] = [];
    const burning: [number, number][] = [];
    for (let y = 0; y < GRID_SIZE; y++)
      for (let x = 0; x < GRID_SIZE; x++)
        if (this.fireMask[y][x] === BURNING) burning.push([y, x]);
    if (!burning.length) return alerts;

    for (const t of this.towns) {
      let min = Infinity;
      for (const [by, bx] of burning) min = Math.min(min, Math.sqrt((t.x - bx) ** 2 + (t.y - by) ** 2));
      if (min > 5) continue;
      let cx = 0, cy = 0;
      for (const [, bx] of burning) cx += bx;
      for (const [by] of burning) cy += by;
      cx /= burning.length; cy /= burning.length;
      let dx = t.x - cx, dy = t.y - cy;
      const m = Math.sqrt(dx * dx + dy * dy);
      if (m > 0) { dx /= m; dy /= m; }
      alerts.push({
        town: t.name, town_x: t.x, town_y: t.y, distance_cells: Math.round(min * 10) / 10,
        severity: min <= 2 ? 'danger' : 'warning',
        evacuation_direction: { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 },
        message: `Fire approaching ${t.name}! Evacuate immediately.`,
      });
    }
    return alerts;
  }

  getState(): TickResponse {
    return this._buildResponse();
  }

  runDemo(ticks: number = 10, lat?: number, lon?: number): DemoRunResponse {
    this.reset();
    this.ignite(32, 32);
    this.running = true;
    const steps: DemoRunResponse['steps'] = [];
    for (let i = 0; i < ticks; i++) {
      const r = this.tick();
      steps.push({
        step: r.step,
        burning: r.stats.burning,
        burned: r.stats.burned,
        percentage_burned: r.stats.percentage_burned,
        active_fronts: r.stats.active_fronts,
      });
    }
    this.running = false;
    return {
      location: { lat: lat ?? 39.8283, lon: lon ?? -98.5795 },
      firms_ignited: 0,
      ticks,
      final_state: this.getState(),
      steps,
    };
  }

  private _buildResponse(): TickResponse {
    return {
      step: this.step, running: this.running,
      fire_mask: this.fireMask.map(r => [...r]),
      fuel_map: this.fuelMap.map(r => [...r]),
      towns: [...this.towns],
      stats: this._stats(),
      alerts: this._alerts(),
    };
  }
}

export const mockEngine = new MockSimulationEngine();
