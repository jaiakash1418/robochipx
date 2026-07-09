import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
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
  PaintMode,
  DemoRunResponse,
} from '../api/types';
import * as api from '../api/endpoints';
import { useWebSocket, type WsMessage } from '../hooks/useWebSocket';

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
  paintMode: PaintMode;
  selectActive: boolean;
  selectedArea: GridRect | null;
  initialZone: GridRect | null;
  flyToTarget: FlyTarget | null;
  wsConnected: boolean;
  llmAnswer: string;
  llmLoading: boolean;
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
  | { type: 'SET_PAINT_MODE'; payload: PaintMode }
  | { type: 'SET_SELECT_ACTIVE'; payload: boolean }
  | { type: 'SET_SELECTED_AREA'; payload: GridRect | null }
  | { type: 'SET_INITIAL_ZONE'; payload: GridRect | null }
  | { type: 'SET_FLY_TARGET'; payload: FlyTarget | null }
  | { type: 'WS_CONNECTED'; payload: boolean }
  | { type: 'LLM_CHUNK'; payload: string }
  | { type: 'LLM_DONE' }
  | { type: 'LLM_CLEAR' }
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
  paintMode: 'off',
  selectActive: false,
  selectedArea: null,
  initialZone: null,
  flyToTarget: null,
  wsConnected: false,
  llmAnswer: '',
  llmLoading: false,
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
      return { ...state, rectangleMode: action.payload, paintMode: 'off', selectActive: false };
    case 'SET_PAINT_MODE':
      return { ...state, paintMode: action.payload, rectangleMode: 'off', selectActive: false };
    case 'SET_SELECT_ACTIVE':
      return { ...state, selectActive: action.payload, rectangleMode: 'off', paintMode: 'off', selectedArea: action.payload ? state.selectedArea : null };
    case 'SET_SELECTED_AREA':
      return { ...state, selectedArea: action.payload };
    case 'SET_INITIAL_ZONE':
      return { ...state, initialZone: action.payload };
    case 'SET_FLY_TARGET':
      return { ...state, flyToTarget: action.payload };
    case 'WS_CONNECTED':
      return { ...state, wsConnected: action.payload };
    case 'LLM_CHUNK':
      return { ...state, llmAnswer: state.llmAnswer + action.payload, llmLoading: true };
    case 'LLM_DONE':
      return { ...state, llmLoading: false };
    case 'LLM_CLEAR':
      return { ...state, llmAnswer: '', llmLoading: false };
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
  setPaintMode: (mode: PaintMode) => void;
  setSelectActive: (active: boolean) => void;
  setSelectedArea: (area: GridRect | null) => void;
  doIgniteBatch: (cells: { x: number; y: number }[]) => Promise<void>;
  doClearBatch: (cells: { x: number; y: number }[]) => Promise<void>;
  setInitialZone: (zone: GridRect | null) => void;
  flyToLocation: (lat: number, lon: number, zoom?: number) => void;
  doDemoRun: (ticks?: number, lat?: number, lon?: number) => Promise<DemoRunResponse>;
  doLLMQuery: (query: string, context?: Record<string, unknown>) => void;
  clearLLM: () => void;
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

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'tick_result' || msg.type === 'state_update') {
      dispatch({ type: 'UPDATE_SIMULATION', payload: msg as unknown as TickResponse });
      if (msg.type === 'tick_result') {
        dispatch({ type: 'PUSH_HISTORY', payload: msg as unknown as TickResponse });
      }
    } else if (msg.type === 'weather_update') {
      dispatch({ type: 'SET_WEATHER', payload: msg as unknown as WeatherResponse });
    } else if (msg.type === 'llm_chunk') {
      dispatch({ type: 'LLM_CHUNK', payload: (msg as any).token as string });
    } else if (msg.type === 'llm_done') {
      dispatch({ type: 'LLM_DONE' });
    } else if (msg.type === 'state_sync') {
      dispatch({ type: 'UPDATE_SIMULATION', payload: msg as unknown as TickResponse });
      if ((msg as any).weather) {
        dispatch({ type: 'SET_WEATHER', payload: (msg as any).weather as WeatherResponse });
      }
    }
  }, []);

  const { connected, send } = useWebSocket(handleWsMessage);

  useEffect(() => {
    dispatch({ type: 'WS_CONNECTED', payload: connected });
  }, [connected]);

  const doTick = useCallback(async () => {
    if (connected) {
      send({ type: 'tick' });
    } else {
      dispatch({ type: 'SET_LOADING' });
      try {
        const data = await api.tick();
        dispatch({ type: 'UPDATE_SIMULATION', payload: data });
        dispatch({ type: 'PUSH_HISTORY', payload: data });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

  const doIgnite = useCallback(async (x: number, y: number) => {
    if (connected) {
      send({ type: 'ignite', x, y });
      send({ type: 'tick' });
    } else {
      dispatch({ type: 'SET_LOADING' });
      try {
        await api.ignite({ x, y });
        const data = await api.tick();
        dispatch({ type: 'UPDATE_SIMULATION', payload: data });
        dispatch({ type: 'PUSH_HISTORY', payload: data });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

  const doReset = useCallback(async () => {
    if (connected) {
      send({ type: 'reset' });
    } else {
      try {
        await api.resetSimulation();
        dispatch({ type: 'RESET' });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

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
    if (connected) {
      send({ type: 'weather_override', ...data });
    } else {
      try {
        const w = await api.overrideWeather(data);
        dispatch({ type: 'SET_WEATHER', payload: w });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

  const doScrubTo = useCallback((index: number) => {
    dispatch({ type: 'SCRUB_TO', payload: index });
  }, []);

  const setUserLocation = useCallback((loc: UserLocation) => {
    dispatch({ type: 'SET_USER_LOCATION', payload: loc });
    if (connected) {
      send({ type: 'set_location', lat: loc.lat, lon: loc.lon });
    }
  }, [connected, send]);

  const setCustomLocation = useCallback((lat: number | null, lon: number | null) => {
    dispatch({ type: 'SET_CUSTOM_LOCATION', payload: { lat, lon } });
    if (connected) {
      send({ type: 'set_location', lat, lon });
    }
  }, [connected, send]);

  const setRectangleMode = useCallback((mode: RectangleMode) => {
    dispatch({ type: 'SET_RECTANGLE_MODE', payload: mode });
  }, []);

  const setSelectActive = useCallback((active: boolean) => {
    dispatch({ type: 'SET_SELECT_ACTIVE', payload: active });
  }, []);

  const setSelectedArea = useCallback((area: GridRect | null) => {
    dispatch({ type: 'SET_SELECTED_AREA', payload: area });
  }, []);

  const setPaintMode = useCallback((mode: PaintMode) => {
    dispatch({ type: 'SET_PAINT_MODE', payload: mode });
  }, []);

  const doClearBatch = useCallback(async (cells: { x: number; y: number }[]) => {
    if (connected) {
      send({ type: 'clear_batch', cells });
    } else {
      dispatch({ type: 'SET_LOADING' });
      try {
        await api.clearBatch(cells);
        const data = await api.tick();
        dispatch({ type: 'UPDATE_SIMULATION', payload: data });
        dispatch({ type: 'PUSH_HISTORY', payload: data });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

  const doIgniteBatch = useCallback(async (cells: { x: number; y: number }[]) => {
    if (connected) {
      send({ type: 'ignite_batch', cells });
      send({ type: 'tick' });
    } else {
      dispatch({ type: 'SET_LOADING' });
      try {
        await api.igniteBatch(cells);
        const data = await api.tick();
        dispatch({ type: 'UPDATE_SIMULATION', payload: data });
        dispatch({ type: 'PUSH_HISTORY', payload: data });
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [connected, send]);

  const setInitialZone = useCallback((zone: GridRect | null) => {
    if (connected) {
      if (zone) {
        send({ type: 'set_zone', x1: zone.x1, y1: zone.y1, x2: zone.x2, y2: zone.y2 });
      } else {
        send({ type: 'set_zone', x1: null, y1: null, x2: null, y2: null });
      }
    } else {
      api.setInitialZone(zone);
    }
    dispatch({ type: 'SET_INITIAL_ZONE', payload: zone });
    if (zone) {
      dispatch({ type: 'SET_RECTANGLE_MODE', payload: 'off' });
    }
  }, [connected, send]);

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
          if (connected) {
            send({ type: 'set_location', lat: loc.lat, lon: loc.lon });
          }
          resolve(loc);
        },
        reject,
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }, [connected, send]);

  const doDemoRun = useCallback(async (ticks: number = 10, lat?: number, lon?: number) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const result = await api.runDemo(ticks, lat, lon);
      dispatch({ type: 'UPDATE_SIMULATION', payload: result.final_state });
      dispatch({ type: 'PUSH_HISTORY', payload: result.final_state });
      return result;
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      throw err;
    }
  }, []);

  const doLLMQuery = useCallback((query: string, context?: Record<string, unknown>) => {
    dispatch({ type: 'LLM_CLEAR' });
    if (connected) {
      send({ type: 'llm_query', query, context });
    } else {
      api.queryLLM({ query, context }).then((res) => {
        dispatch({ type: 'LLM_CHUNK', payload: res.answer });
        dispatch({ type: 'LLM_DONE' });
      }).catch((err: any) => {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      });
    }
  }, [connected, send]);

  const clearLLM = useCallback(() => {
    dispatch({ type: 'LLM_CLEAR' });
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
        setPaintMode,
        setSelectActive,
        setSelectedArea,
        doIgniteBatch,
        doClearBatch,
        setInitialZone,
        flyToLocation,
        doDemoRun,
        doLLMQuery,
        clearLLM,
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