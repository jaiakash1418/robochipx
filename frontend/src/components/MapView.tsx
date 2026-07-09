import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSimulation } from '../context/SimulationContext';
import { FUEL_COLORS, type FuelType, type CellState } from '../api/types';
import MapWeatherOverlay from './MapWeatherOverlay';
import InfoTooltip from './InfoTooltip';

const GRID_SIZE = 64;
const CANVAS_SIZE = 1024;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

const GRID_SOUTH = 37.5;
const GRID_NORTH = 38.5;
const GRID_WEST = -122.0;
const GRID_EAST = -121.0;

function gridToLatLng(cellX: number, cellY: number): [number, number] {
  const lat = GRID_NORTH - ((cellY + 0.5) / GRID_SIZE) * (GRID_NORTH - GRID_SOUTH);
  const lng = GRID_WEST + ((cellX + 0.5) / GRID_SIZE) * (GRID_EAST - GRID_WEST);
  return [lat, lng];
}

function latLngToGrid(lat: number, lng: number): { x: number; y: number } {
  const col = Math.round(((lng - GRID_WEST) / (GRID_EAST - GRID_WEST)) * GRID_SIZE);
  const row = Math.round(((GRID_NORTH - lat) / (GRID_NORTH - GRID_SOUTH)) * GRID_SIZE);
  return { x: Math.max(0, Math.min(GRID_SIZE - 1, col)), y: Math.max(0, Math.min(GRID_SIZE - 1, row)) };
}

export default function MapView() {
  const { t } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const windParticlesRef = useRef<{ x: number; y: number; speed: number }[]>([]);
  const perimeterLayerRef = useRef<L.Polygon | null>(null);
  const evacLinesRef = useRef<L.Polyline[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const selRectRef = useRef<L.Rectangle | null>(null);
  const selStartRef = useRef<{ x: number; y: number } | null>(null);
  const toolActiveRef = useRef(false);
  const { state, doIgnite, setSelectedArea } = useSimulation();
  const { fireMask, fuelMap, alerts, weather, userLocation, selectActive, selectedArea, flyToTarget } = state;
  toolActiveRef.current = selectActive;

  const getPerimeterPoints = useCallback((): [number, number][] => {
    const pts: [number, number][] = [];

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cs = fireMask[row]?.[col] as CellState | undefined;
        if (cs === undefined || cs === 0) continue;

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
          if (ns === undefined || ns === 0) {
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

    const wDir = weather?.wind_direction ?? 0;
    const wSpeed = weather?.wind_speed ?? 0;
    const rad = ((wDir - 180) * Math.PI) / 180;

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        let color = 'rgba(255,255,255,0.04)';

        const fuelType = fuelMap[row]?.[col] as FuelType | undefined;
        if (fuelType !== undefined) {
          color = hexToRgba(FUEL_COLORS[fuelType], 0.45);
        }

        const cellState = fireMask[row]?.[col] as CellState | undefined;
        if (cellState !== undefined && cellState !== 0) {
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

    if (userLocation) {
      const { x, y } = latLngToGrid(userLocation.lat, userLocation.lon);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(`(${x},${y})`, x * CELL_SIZE + 3, y * CELL_SIZE + 12);
        ctx.shadowBlur = 0;
      }
    }

    overlayRef.current?.setUrl(canvas.toDataURL());

    updatePerimeter();
    updateEvacuationRoutes();
  }, [fuelMap, fireMask, weather, userLocation, updatePerimeter, updateEvacuationRoutes]);

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

    const bounds = L.latLngBounds([[GRID_SOUTH, GRID_WEST], [GRID_NORTH, GRID_EAST]]);

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

    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (toolActiveRef.current) return;
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
    };
    map.on('click', clickHandler);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.removeEventListener('click', clickHandler);
      map.remove();
      mapRef.current = null;
    };
  }, [doIgnite]);

  useEffect(() => {
    if (mapRef.current) drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const { x, y } = latLngToGrid(userLocation.lat, userLocation.lon);
      const icon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-location-dot" />',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([userLocation.lat, userLocation.lon], { icon }).addTo(map);
      marker.bindPopup(`<b>Your Location</b><br/>${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}<br/>Grid: (${x}, ${y})`);
      userMarkerRef.current = marker;
    }
  }, [userLocation]);

  /* --- fly to target --- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo([flyToTarget.lat, flyToTarget.lon], flyToTarget.zoom, { duration: 1.2 });
  }, [flyToTarget]);

  /* --- selection tool (draw rectangle, persists after release) --- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const gridBounds = L.latLngBounds([[GRID_SOUTH, GRID_WEST], [GRID_NORTH, GRID_EAST]]);

    /* draw the persistent selection rectangle if one exists */
    const drawPersistentSel = () => {
      if (selRectRef.current) {
        map.removeLayer(selRectRef.current);
        selRectRef.current = null;
      }
      if (selectedArea && !selectActive) {
        const sw = gridToLatLng(selectedArea.x1, selectedArea.y2);
        const ne = gridToLatLng(selectedArea.x2, selectedArea.y1);
        selRectRef.current = L.rectangle(L.latLngBounds(sw, ne), {
          color: '#ff6b35',
          weight: 2.5,
          fillColor: 'rgba(255,107,53,0.12)',
          fillOpacity: 1,
          dashArray: '6,4',
        }).addTo(map);
      }
    };

    if (!selectActive) {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      if (selRectRef.current && !selectedArea) {
        map.removeLayer(selRectRef.current);
        selRectRef.current = null;
      }
      selStartRef.current = null;
      drawPersistentSel();
      return;
    }

    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';

    const onDown = (e: L.LeafletMouseEvent) => {
      if (!gridBounds.contains(e.latlng)) return;
      const pctX = (e.latlng.lng - GRID_WEST) / (GRID_EAST - GRID_WEST);
      const pctY = 1 - (e.latlng.lat - GRID_SOUTH) / (GRID_NORTH - GRID_SOUTH);
      selStartRef.current = {
        x: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(pctX * GRID_SIZE))),
        y: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(pctY * GRID_SIZE))),
      };
    };

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!selStartRef.current || !gridBounds.contains(e.latlng)) return;
      const pctX = (e.latlng.lng - GRID_WEST) / (GRID_EAST - GRID_WEST);
      const pctY = 1 - (e.latlng.lat - GRID_SOUTH) / (GRID_NORTH - GRID_SOUTH);
      const cx = Math.floor(pctX * GRID_SIZE);
      const cy = Math.floor(pctY * GRID_SIZE);
      const sx = Math.min(selStartRef.current.x, Math.max(0, Math.min(GRID_SIZE - 1, cx)));
      const sy = Math.min(selStartRef.current.y, Math.max(0, Math.min(GRID_SIZE - 1, cy)));
      const ex = Math.max(selStartRef.current.x, Math.max(0, Math.min(GRID_SIZE - 1, cx)));
      const ey = Math.max(selStartRef.current.y, Math.max(0, Math.min(GRID_SIZE - 1, cy)));

      if (selRectRef.current) map.removeLayer(selRectRef.current);
      const sw = gridToLatLng(sx, ey);
      const ne = gridToLatLng(ex, sy);
      selRectRef.current = L.rectangle(L.latLngBounds(sw, ne), {
        color: '#ff6b35',
        weight: 2.5,
        fillColor: 'rgba(255,107,53,0.12)',
        fillOpacity: 1,
        dashArray: '6,4',
      }).addTo(map);
    };

    const onUp = () => {
      if (!selStartRef.current) return;
      selStartRef.current = null;

      if (!selRectRef.current) return;
      const b = selRectRef.current.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const x1 = Math.floor(((sw.lng - GRID_WEST) / (GRID_EAST - GRID_WEST)) * GRID_SIZE);
      const x2 = Math.ceil(((ne.lng - GRID_WEST) / (GRID_EAST - GRID_WEST)) * GRID_SIZE);
      const y1 = Math.floor(((GRID_NORTH - ne.lat) / (GRID_NORTH - GRID_SOUTH)) * GRID_SIZE);
      const y2 = Math.ceil(((GRID_NORTH - sw.lat) / (GRID_NORTH - GRID_SOUTH)) * GRID_SIZE);
      setSelectedArea({ x1, y1, x2, y2 });
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);

    return () => {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
    };
  }, [selectActive, selectedArea, setSelectedArea]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <MapWeatherOverlay weather={weather} loading={false} />
      <div style={{ position: 'absolute', bottom: 80, left: 12, zIndex: 1000 }}>
        <InfoTooltip text={t('tooltips.grid')} />
      </div>
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