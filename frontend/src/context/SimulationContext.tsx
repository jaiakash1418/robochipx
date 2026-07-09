import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  TickResponse,
  WeatherResponse,
  Stats,
  Alert,
  Town,
  CellState,
  UserLocation,
  GridRect,
  FlyTarget,
  RectangleMode,
} from '../api/types';
import * as api from '../api/endpoints';

interface ScenarioData {
  name: string;
  fireMask: CellState[][];
  fuelMap: number[][];
  towns: Town[];
  stats: Stats;
  alerts: Alert[];
  step: number;
  savedAt: string;
}

interface SimulationState {
  running: boolean;
  fireMask: CellState[][];
  fuelMap: number[][];
  towns: Town[];
  stats: Stats;
  alerts: Alert[];
  step: number;
  weather: WeatherResponse | null;
  loading: boolean;
  error: string | null;
  history: TickResponse[];
  historyIndex: number;
  userLocation: UserLocation | null;
  customLat: number | null;
  customLon: number | null;
  rectangleMode: RectangleMode;
  initialZone: GridRect | null;
  flyToTarget: FlyTarget | null;
}

type Action =
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'UPDATE_SIMULATION'; payload: TickResponse }
  | { type: 'PUSH_HISTORY'; payload: TickResponse }
  | { type: 'SCRUB_TO'; payload: number }
  | { type: 'SET_WEATHER'; payload: WeatherResponse }
  | { type: 'SET_USER_LOCATION'; payload: UserLocation }
  | { type: 'SET_CUSTOM_LOCATION'; payload: { lat: number | null; lon: number | null } }
  | { type: 'SET_RECTANGLE_MODE'; payload: RectangleMode }
  | { type: 'SET_INITIAL_ZONE'; payload: GridRect | null }
  | { type: 'SET_FLY_TARGET'; payload: FlyTarget | null }
  | { type: 'RESET' };

const initialState: SimulationState = {
  running: false,
  fireMask: [],
  fuelMap: [],
  towns: [],
  stats: { total_cells: 4096, burning: 0, burned: 0, percentage_burned: 0, active_fronts: 0 },
  alerts: [],
  step: 0,
  weather: null,
  loading: false,
  error: null,
  history: [],
  historyIndex: -1,
  userLocation: null,
  customLat: null,
  customLon: null,
  rectangleMode: 'off',
  initialZone: null,
  flyToTarget: null,
};

function reducer(state: SimulationState, action: Action): SimulationState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'UPDATE_SIMULATION':
      return {
        ...state,
        loading: false,
        error: null,
        running: action.payload.running,
        fireMask: action.payload.fire_mask as CellState[][],
        fuelMap: action.payload.fuel_map,
        towns: action.payload.towns,
        stats: action.payload.stats,
        alerts: action.payload.alerts,
        step: action.payload.step,
      };
    case 'PUSH_HISTORY':
      return {
        ...state,
        history: [...state.history, action.payload],
        historyIndex: state.history.length,
      };
    case 'SCRUB_TO': {
      const snap = state.history[action.payload];
      if (!snap) return state;
      return {
        ...state,
        historyIndex: action.payload,
        fireMask: snap.fire_mask as CellState[][],
        fuelMap: snap.fuel_map,
        towns: snap.towns,
        stats: snap.stats,
        alerts: snap.alerts,
        step: snap.step,
      };
    }
    case 'SET_WEATHER':
      return { ...state, weather: action.payload };
    case 'SET_USER_LOCATION':
      return { ...state, userLocation: action.payload };
    case 'SET_CUSTOM_LOCATION':
      return { ...state, customLat: action.payload.lat, customLon: action.payload.lon };
    case 'SET_RECTANGLE_MODE':
      return { ...state, rectangleMode: action.payload };
    case 'SET_INITIAL_ZONE':
      return { ...state, initialZone: action.payload };
    case 'SET_FLY_TARGET':
      return { ...state, flyToTarget: action.payload };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

interface SimulationContextValue {
  state: SimulationState;
  doTick: () => Promise<void>;
  doIgnite: (x: number, y: number) => Promise<void>;
  doReset: () => Promise<void>;
  doFetchWeather: (lat?: number, lon?: number) => Promise<void>;
  doFetchWeatherLive: (lat?: number, lon?: number) => Promise<void>;
  doOverrideWeather: (data: Partial<WeatherResponse>) => Promise<void>;
  doScrubTo: (index: number) => void;
  saveScenario: (name: string) => void;
  loadScenario: (name: string) => boolean;
  listScenarios: () => string[];
  deleteScenario: (name: string) => void;
  setUserLocation: (loc: UserLocation) => void;
  setCustomLocation: (lat: number | null, lon: number | null) => void;
  requestGps: () => Promise<UserLocation>;
  setRectangleMode: (mode: RectangleMode) => void;
  doIgniteBatch: (cells: { x: number; y: number }[]) => Promise<void>;
  setInitialZone: (zone: GridRect | null) => void;
  flyToLocation: (lat: number, lon: number, zoom?: number) => void;
}

const SCENARIOS_KEY = 'wf-scenarios';

function getScenarios(): Record<string, ScenarioData> {
  try {
    return JSON.parse(localStorage.getItem(SCENARIOS_KEY) || '{}');
  } catch {
    return {};
  }
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const doTick = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const data = await api.tick();
      dispatch({ type: 'UPDATE_SIMULATION', payload: data });
      dispatch({ type: 'PUSH_HISTORY', payload: data });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doIgnite = useCallback(async (x: number, y: number) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      await api.ignite({ x, y });
      const data = await api.tick();
      dispatch({ type: 'UPDATE_SIMULATION', payload: data });
      dispatch({ type: 'PUSH_HISTORY', payload: data });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doReset = useCallback(async () => {
    try {
      await api.resetSimulation();
      dispatch({ type: 'RESET' });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doFetchWeather = useCallback(async (lat?: number, lon?: number) => {
    try {
      const w = await api.getWeather(lat ?? undefined, lon ?? undefined);
      dispatch({ type: 'SET_WEATHER', payload: w });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doFetchWeatherLive = useCallback(async (lat?: number, lon?: number) => {
    try {
      const w = await api.getWeatherLive(lat ?? undefined, lon ?? undefined);
      dispatch({ type: 'SET_WEATHER', payload: w });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doOverrideWeather = useCallback(async (data: Partial<WeatherResponse>) => {
    try {
      const w = await api.overrideWeather(data);
      dispatch({ type: 'SET_WEATHER', payload: w });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doScrubTo = useCallback((index: number) => {
    dispatch({ type: 'SCRUB_TO', payload: index });
  }, []);

  const setUserLocation = useCallback((loc: UserLocation) => {
    dispatch({ type: 'SET_USER_LOCATION', payload: loc });
  }, []);

  const setCustomLocation = useCallback((lat: number | null, lon: number | null) => {
    dispatch({ type: 'SET_CUSTOM_LOCATION', payload: { lat, lon } });
  }, []);

  const setRectangleMode = useCallback((mode: RectangleMode) => {
    dispatch({ type: 'SET_RECTANGLE_MODE', payload: mode });
  }, []);

  const doIgniteBatch = useCallback(async (cells: { x: number; y: number }[]) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      await api.igniteBatch(cells);
      const data = await api.tick();
      dispatch({ type: 'UPDATE_SIMULATION', payload: data });
      dispatch({ type: 'PUSH_HISTORY', payload: data });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const setInitialZone = useCallback((zone: GridRect | null) => {
    api.setInitialZone(zone);
    dispatch({ type: 'SET_INITIAL_ZONE', payload: zone });
    if (zone) {
      dispatch({ type: 'SET_RECTANGLE_MODE', payload: 'off' });
    }
  }, []);

  const flyToLocation = useCallback((lat: number, lon: number, zoom: number = 12) => {
    dispatch({ type: 'SET_FLY_TARGET', payload: { lat, lon, zoom } });
  }, []);

  const requestGps = useCallback(() => {
    return new Promise<UserLocation>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not available'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: UserLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          dispatch({ type: 'SET_USER_LOCATION', payload: loc });
          resolve(loc);
        },
        reject,
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }, []);

  const saveScenario = useCallback(
    (name: string) => {
      const data: ScenarioData = {
        name,
        fireMask: state.fireMask,
        fuelMap: state.fuelMap,
        towns: state.towns,
        stats: state.stats,
        alerts: state.alerts,
        step: state.step,
        savedAt: new Date().toISOString(),
      };
      const all = getScenarios();
      all[name] = data;
      localStorage.setItem(SCENARIOS_KEY, JSON.stringify(all));
    },
    [state],
  );

  const loadScenario = useCallback((name: string): boolean => {
    const all = getScenarios();
    const data = all[name];
    if (!data) return false;
    dispatch({
      type: 'UPDATE_SIMULATION',
      payload: {
        step: data.step,
        fire_mask: data.fireMask,
        fuel_map: data.fuelMap,
        towns: data.towns,
        stats: data.stats,
        alerts: data.alerts,
        running: false,
      },
    });
    return true;
  }, []);

  const listScenarios = useCallback((): string[] => {
    return Object.keys(getScenarios());
  }, []);

  const deleteScenario = useCallback((name: string) => {
    const all = getScenarios();
    delete all[name];
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(all));
  }, []);

  return (
    <SimulationContext.Provider
      value={{
        state,
        doTick,
        doIgnite,
        doReset,
        doFetchWeather,
        doFetchWeatherLive,
        doOverrideWeather,
        doScrubTo,
        saveScenario,
        loadScenario,
        listScenarios,
        deleteScenario,
        setUserLocation,
        setCustomLocation,
        requestGps,
        setRectangleMode,
        doIgniteBatch,
        setInitialZone,
        flyToLocation,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider');
  return ctx;
}