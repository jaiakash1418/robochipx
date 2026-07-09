import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSimulation } from '../context/SimulationContext';
import { FUEL_COLORS, type FuelType, type CellState } from '../api/types';
import { fetchLocationWeather, type LocationWeather } from '../api/weatherApi';
import MapWeatherOverlay from './MapWeatherOverlay';

const GRID_SIZE = 64;
const CANVAS_SIZE = 1024;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

const GRID_BOUNDS: L.LatLngBoundsExpression = [
  [37.5, -122.0],
  [38.5, -121.0],
];

const WEATHER_UPDATE_MS = 60000;

function gridToLatLng(cellX: number, cellY: number): [number, number] {
  const south = 37.5;
  const north = 38.5;
  const west = -122.0;
  const east = -121.0;
  const lat = north - ((cellY + 0.5) / GRID_SIZE) * (north - south);
  const lng = west + ((cellX + 0.5) / GRID_SIZE) * (east - west);
  return [lat, lng];
}

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const windParticlesRef = useRef<{ x: number; y: number; speed: number }[]>([]);
  const perimeterLayerRef = useRef<L.Polygon | null>(null);
  const evacLinesRef = useRef<L.Polyline[]>([]);
  const { state, doIgnite } = useSimulation();
  const { fireMask, fuelMap, alerts } = state;

  const [weather, setWeather] = useState<LocationWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<L.LatLng | null>(null);

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    setWeatherLoading(true);
    try {
      const w = await fetchLocationWeather(lat, lng);
      setWeather(w);
    } catch {
      console.warn('Weather fetch failed');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const getPerimeterPoints = useCallback((): [number, number][] => {
    const pts: [number, number][] = [];

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cs = fireMask[row]?.[col] as CellState | undefined;
        if (!cs || cs === 0) continue;

        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
            pts.push(gridToLatLng(col, row));
            break;
          }
          const ns = fireMask[nr]?.[nc] as CellState | undefined;
          if (!ns || ns === 0) {
            pts.push(gridToLatLng(col, row));
            break;
          }
        }
      }
    }
    return pts;
  }, [fireMask]);

  const updatePerimeter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (perimeterLayerRef.current) {
      map.removeLayer(perimeterLayerRef.current);
      perimeterLayerRef.current = null;
    }

    const pts = getPerimeterPoints();
    if (pts.length < 3) return;

    const hull = convexHull(pts);
    if (hull.length < 3) return;

    const layer = L.polygon(hull, {
      color: '#ff4500',
      weight: 2.5,
      fillColor: 'rgba(255,69,0,0.10)',
      fillOpacity: 1,
      dashArray: '6,4',
      opacity: 0.8,
    }).addTo(map);
    perimeterLayerRef.current = layer;
  }, [getPerimeterPoints]);

  const updateEvacuationRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    evacLinesRef.current.forEach((l) => map.removeLayer(l));
    evacLinesRef.current = [];

    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      const [lat, lng] = gridToLatLng(alert.town_x, alert.town_y);
      const dir = alert.evacuation_direction;
      const len = 0.05;
      const endLat = lat + dir.dy * len;
      const endLng = lng + dir.dx * len;

      const line = L.polyline(
        [
          [lat, lng],
          [endLat, endLng],
        ],
        {
          color: '#00e676',
          weight: 3,
          opacity: 0.9,
          dashArray: '8,6',
        },
      ).addTo(map);

      const arrowLen = 0.015;
      const angle = Math.atan2(dir.dy, dir.dx);
      const arrowLat = endLat - dir.dy * 0.15 * len;
      const arrowLng = endLng - dir.dx * 0.15 * len;

      L.polygon(
        [
          [endLat, endLng],
          [
            arrowLat + arrowLen * Math.sin(angle - 0.5),
            arrowLng + arrowLen * Math.cos(angle - 0.5),
          ],
          [
            arrowLat + arrowLen * Math.sin(angle + 0.5),
            arrowLng + arrowLen * Math.cos(angle + 0.5),
          ],
        ],
        {
          color: '#00e676',
          fillColor: '#00e676',
          fillOpacity: 1,
          weight: 0,
        },
      ).addTo(map);

      evacLinesRef.current.push(line);
    }
  }, [alerts]);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const wDir = weather?.windDirection ?? 0;
    const wSpeed = weather?.windSpeed ?? 0;
    const rad = ((wDir - 180) * Math.PI) / 180;

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        let color = 'rgba(255,255,255,0.04)';

        const fuelType = fuelMap[row]?.[col] as FuelType | undefined;
        if (fuelType !== undefined) {
          color = hexToRgba(FUEL_COLORS[fuelType], 0.45);
        }

        const cellState = fireMask[row]?.[col] as CellState | undefined;
        if (cellState && cellState !== 0) {
          color = cellState === 1 ? '#ff6b35' : '#1a1a1a';
          if (cellState === 1) {
            ctx.shadowColor = 'rgba(255,107,53,0.4)';
            ctx.shadowBlur = 8;
          }
        }

        ctx.fillStyle = color;
        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    drawWindParticles(ctx, wDir, wSpeed, rad);

    overlayRef.current?.setUrl(canvas.toDataURL());

    updatePerimeter();
    updateEvacuationRoutes();
  }, [fuelMap, fireMask, weather, updatePerimeter, updateEvacuationRoutes]);

  function drawWindParticles(
    ctx: CanvasRenderingContext2D,
    _windDir: number,
    windSpeed: number,
    rad: number,
  ) {
    if (windSpeed < 1) return;

    const count = Math.min(Math.floor(windSpeed * 1.5), 60);
    let particles = windParticlesRef.current;

    if (particles.length !== count) {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * CANVAS_SIZE,
        y: Math.random() * CANVAS_SIZE,
        speed: 0.5 + Math.random() * 1.5,
      }));
      windParticlesRef.current = particles;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;

    for (const p of particles) {
      const len = 6 + windSpeed * 0.3;
      const dx = Math.cos(rad) * len * p.speed;
      const dy = Math.sin(rad) * len * p.speed;

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();

      p.x += dx * 0.5;
      p.y += dy * 0.5;

      if (p.x < -20) p.x = CANVAS_SIZE + 20;
      if (p.x > CANVAS_SIZE + 20) p.x = -20;
      if (p.y < -20) p.y = CANVAS_SIZE + 20;
      if (p.y > CANVAS_SIZE + 20) p.y = -20;
    }
  }

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvasRef.current = canvas;

    const map = L.map(containerRef.current, {
      center: [38, -121.5],
      zoom: 9,
      zoomControl: true,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri' },
    ).addTo(map);

    const bounds = L.latLngBounds(GRID_BOUNDS);

    L.rectangle(bounds, {
      color: '#ff6b35',
      weight: 2,
      fill: false,
      opacity: 0.6,
    }).addTo(map);

    const overlay = L.imageOverlay(canvas.toDataURL(), bounds, {
      interactive: true,
    }).addTo(map);
    overlayRef.current = overlay;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!bounds.contains(e.latlng)) return;
      const latPct =
        (e.latlng.lat - bounds.getSouth()) /
        (bounds.getNorth() - bounds.getSouth());
      const lngPct =
        (e.latlng.lng - bounds.getWest()) /
        (bounds.getEast() - bounds.getWest());
      const x = Math.floor(lngPct * GRID_SIZE);
      const y = Math.floor((1 - latPct) * GRID_SIZE);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        doIgnite(x, y);
      }
    });

    const updateCenter = () => {
      const center = map.getCenter();
      setMapCenter(center);
    };

    map.on('moveend', updateCenter);
    updateCenter();

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [doIgnite]);

  useEffect(() => {
    if (mapRef.current) drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    if (!mapCenter) return;

    fetchWeather(mapCenter.lat, mapCenter.lng);

    const interval = setInterval(() => {
      if (mapRef.current) {
        const c = mapRef.current.getCenter();
        setMapCenter(c);
        fetchWeather(c.lat, c.lng);
      }
    }, WEATHER_UPDATE_MS);

    return () => clearInterval(interval);
  }, [mapCenter, fetchWeather]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <MapWeatherOverlay weather={weather} loading={weatherLoading} />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}