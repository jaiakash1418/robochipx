import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  TickResponse,
  WeatherResponse,
  Stats,
  Alert,
  Town,
  CellState,
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
}

type Action =
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_SIMULATION'; payload: TickResponse }
  | { type: 'PUSH_HISTORY'; payload: TickResponse }
  | { type: 'SCRUB_TO'; payload: number }
  | { type: 'SET_WEATHER'; payload: WeatherResponse }
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
};

function reducer(state: SimulationState, action: Action): SimulationState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
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
  doIgniteArea: (x1: number, y1: number, x2: number, y2: number) => Promise<void>;
  doReset: () => Promise<void>;
  doFetchWeather: (lat?: number, lon?: number) => Promise<void>;
  doFetchWeatherLive: (lat?: number, lon?: number) => Promise<void>;
  doOverrideWeather: (data: Partial<WeatherResponse>) => Promise<void>;
  dismissError: () => void;
  doScrubTo: (index: number) => void;
  saveScenario: (name: string) => void;
  loadScenario: (name: string) => boolean;
  listScenarios: () => string[];
  deleteScenario: (name: string) => void;
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

  const doIgniteArea = useCallback(async (x1: number, y1: number, x2: number, y2: number) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      await api.igniteArea({ x1, y1, x2, y2 });
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
      const w = await api.getWeather(lat, lon);
      dispatch({ type: 'SET_WEATHER', payload: w });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const doFetchWeatherLive = useCallback(async (lat?: number, lon?: number) => {
    try {
      const w = await api.getWeatherLive(lat, lon);
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

  const dismissError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const doScrubTo = useCallback((index: number) => {
    dispatch({ type: 'SCRUB_TO', payload: index });
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
        doIgniteArea,
        doReset,
        dismissError,
        doFetchWeather,
        doFetchWeatherLive,
        doOverrideWeather,
        doScrubTo,
        saveScenario,
        loadScenario,
        listScenarios,
        deleteScenario,
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