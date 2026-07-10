import { useRef, useCallback } from 'react';

interface WindyOptions {
  key: string;
  lat: number;
  lon: number;
  zoom: number;
}

interface WindyAPI {
  store: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown, opts?: { forceChange?: boolean }) => void;
    on: (key: string, callback: (...args: unknown[]) => void) => void;
    once: (key: string, callback: (...args: unknown[]) => void) => void;
    off: (key: string, callback: (...args: unknown[]) => void) => void;
  };
  map: L.Map;
  picker: {
    open: (coords: { lat: number; lon: number }) => void;
    close: () => void;
    getParams: () => { lat: number; lon: number; values: Record<string, number>; overlay: string };
    on: (event: string, callback: (...args: unknown[]) => void) => void;
    off: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  broadcast: {
    fire: (event: string, ...args: unknown[]) => void;
    on: (event: string, callback: (...args: unknown[]) => void) => void;
    off: (event: string, callback: (...args: unknown[]) => void) => void;
  };
}

declare global {
  interface Window {
    windyInit?: (options: WindyOptions, callback: (api: WindyAPI) => void) => void;
  }
}

export function useWindyMap() {
  const windyApiRef = useRef<WindyAPI | null>(null);
  const initializedRef = useRef(false);

  const initWindy = useCallback(
    (container: HTMLElement, options: WindyOptions) => {
      if (initializedRef.current) return;
      if (!window.windyInit) {
        const s = document.createElement('script');
        s.src = 'https://api.windy.com/assets/map-forecast/libBoot.js';
        s.onload = () => {
          if (window.windyInit) {
            window.windyInit(
              { ...options, key: options.key },
              (api: WindyAPI) => {
                windyApiRef.current = api;
                api.store.set('overlay', 'temp', { forceChange: true });
                api.store.set('fireSpots', true, { forceChange: true });
              },
            );
            initializedRef.current = true;
          }
        };
        container.appendChild(s);
      } else {
        window.windyInit(
          { ...options, key: options.key },
          (api: WindyAPI) => {
            windyApiRef.current = api;
            api.store.set('overlay', 'temp', { forceChange: true });
            api.store.set('fireSpots', true, { forceChange: true });
          },
        );
        initializedRef.current = true;
      }
    },
    [],
  );

  const destroyWindy = useCallback(() => {
    if (windyApiRef.current) {
      const map = windyApiRef.current.map;
      if (map && map.remove) {
        map.remove();
      }
      windyApiRef.current = null;
    }
    initializedRef.current = false;
  }, []);

  return { windyApi: windyApiRef, initWindy, destroyWindy, initialized: initializedRef };
}