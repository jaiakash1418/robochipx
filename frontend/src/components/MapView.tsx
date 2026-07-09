import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSimulation } from '../context/SimulationContext';
import { FUEL_COLORS, type FuelType, type CellState, type LiveFire } from '../api/types';
import MapWeatherOverlay from './MapWeatherOverlay';

const GRID_SIZE = 64;
const CANVAS_SIZE = 1024;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
const GRID_SPAN = 1;

function computeBounds(center: [number, number]): L.LatLngBounds {
  return L.latLngBounds(
    [center[0] - GRID_SPAN / 2, center[1] - GRID_SPAN / 2],
    [center[0] + GRID_SPAN / 2, center[1] + GRID_SPAN / 2],
  );
}

function makeGridToLatLng(bounds: L.LatLngBounds): (cellX: number, cellY: number) => [number, number] {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  return (cellX, cellY) => {
    const lat = north - ((cellY + 0.5) / GRID_SIZE) * (north - south);
    const lng = west + ((cellX + 0.5) / GRID_SIZE) * (east - west);
    return [lat, lng];
  };
}

function makeLatLngToGrid(bounds: L.LatLngBounds): (latlng: L.LatLng) => [number, number] {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  return (latlng) => {
    const latPct = (latlng.lat - south) / (north - south);
    const lngPct = (latlng.lng - west) / (east - west);
    const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(lngPct * GRID_SIZE)));
    const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((1 - latPct) * GRID_SIZE)));
    return [x, y];
  };
}

interface Props {
  igniteMode: 'point' | 'area' | 'move';
  gridCenter: [number, number];
  onGridCenterChange: (c: [number, number]) => void;
  liveFires: LiveFire[];
  flyToFire: [number, number] | null;
  onFlyDone: () => void;
  userLocation: [number, number] | null;
}

export default function MapView({ igniteMode, gridCenter, onGridCenterChange, liveFires, flyToFire, onFlyDone, userLocation }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const windParticlesRef = useRef<{ x: number; y: number; speed: number }[]>([]);
  const rafRef = useRef<number>(0);
  const perimeterLayerRef = useRef<L.Polygon | null>(null);
  const gridSnapshotRef = useRef<ImageData | null>(null);
  const selectionRectRef = useRef<L.Rectangle | null>(null);
  const gridRectRef = useRef<L.Rectangle | null>(null);
  const dragStartRef = useRef<L.LatLng | null>(null);
  const liveFiresLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds>(computeBounds(gridCenter));
  const gridToLatLngRef = useRef<(cellX: number, cellY: number) => [number, number]>(
    makeGridToLatLng(boundsRef.current),
  );
  const latLngToGridRef = useRef<(latlng: L.LatLng) => [number, number]>(
    makeLatLngToGrid(boundsRef.current),
  );
  const { state, doIgnite, doIgniteArea } = useSimulation();
  const { fireMask, fuelMap, weather } = state;

  const getPerimeterPoints = useCallback((): [number, number][] => {
    const pts: [number, number][] = [];
    const toLatLng = gridToLatLngRef.current;

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
            pts.push(toLatLng(col, row));
            break;
          }
          const ns = fireMask[nr]?.[nc] as CellState | undefined;
          if (!ns || ns === 0) {
            pts.push(toLatLng(col, row));
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

  const drawGridCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

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

    gridSnapshotRef.current = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, [fuelMap, fireMask]);

  const drawWindParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const wDir = weather?.wind_direction ?? 0;
    const wSpeed = weather?.wind_speed ?? 0;
    const rad = ((wDir + 90) * Math.PI) / 180;

    if (wSpeed < 0.5) return;

    const count = Math.min(Math.floor(wSpeed * 3), 120);
    let particles = windParticlesRef.current;

    if (particles.length !== count) {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * CANVAS_SIZE,
        y: Math.random() * CANVAS_SIZE,
        speed: 0.6 + Math.random() * 1.8,
      }));
      windParticlesRef.current = particles;
    }

    const t = Date.now() / 1000;

    for (const p of particles) {
      const baseLen = 10 + wSpeed * 0.5;
      const len = baseLen * p.speed;
      const dx = Math.cos(rad) * len;
      const dy = Math.sin(rad) * len;

      const cx = p.x + dx;
      const cy = p.y + dy;

      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.x * 0.01 + p.y * 0.01);
      const alpha = 0.3 + 0.5 * pulse;

      ctx.save();
      ctx.translate(p.x, p.y);

      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 2 + pulse;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dx, dy);
      ctx.stroke();

      const arrowSize = 4 + pulse * 2;
      const angle = Math.atan2(dy, dx);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(
        dx - arrowSize * Math.cos(angle - 0.5),
        dy - arrowSize * Math.sin(angle - 0.5),
      );
      ctx.lineTo(
        dx - arrowSize * Math.cos(angle + 0.5),
        dy - arrowSize * Math.sin(angle + 0.5),
      );
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      p.x += dx * 0.04;
      p.y += dy * 0.04;

      const margin = 60;
      if (p.x < -margin) p.x = CANVAS_SIZE + margin;
      if (p.x > CANVAS_SIZE + margin) p.x = -margin;
      if (p.y < -margin) p.y = CANVAS_SIZE + margin;
      if (p.y > CANVAS_SIZE + margin) p.y = -margin;
    }
  }, [weather]);

  const compositeFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snap = gridSnapshotRef.current;
    if (snap) {
      ctx.putImageData(snap, 0, 0);
    }
    drawWindParticles(ctx);
    overlay.setUrl(canvas.toDataURL());
  }, [drawWindParticles]);

  useEffect(() => {
    const wSpeed = weather?.wind_speed ?? 0;

    // No animation needed — render a single frame when inputs change.
    if (wSpeed < 0.5) {
      compositeFrame();
      return;
    }

    let running = true;
    const loop = () => {
      if (!running) return;
      compositeFrame();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [compositeFrame, weather?.wind_speed]);

  useEffect(() => {
    if (!mapRef.current) return;
    drawGridCanvas();
    updatePerimeter();
    compositeFrame();
  }, [drawGridCanvas, updatePerimeter, compositeFrame]);

  const handleAreaStart = useCallback((e: L.LeafletMouseEvent, map: L.Map) => {
    dragStartRef.current = e.latlng;
    const rect = L.rectangle(L.latLngBounds(e.latlng, e.latlng), {
      color: '#3b82f6',
      weight: 2,
      fillColor: 'rgba(59,130,246,0.15)',
      fillOpacity: 1,
      dashArray: '4,4',
    }).addTo(map);
    selectionRectRef.current = rect;
  }, []);

  const handleAreaMove = useCallback((e: L.LeafletMouseEvent) => {
    if (!dragStartRef.current || !selectionRectRef.current) return;
    const bounds = L.latLngBounds(dragStartRef.current, e.latlng);
    selectionRectRef.current.setBounds(bounds);
  }, []);

  const handleAreaEnd = useCallback((e: L.LeafletMouseEvent, gridBounds: L.LatLngBounds) => {
    if (!dragStartRef.current) return;
    const start = dragStartRef.current;
    const end = e.latlng;
    dragStartRef.current = null;

    if (selectionRectRef.current) {
      mapRef.current?.removeLayer(selectionRectRef.current);
      selectionRectRef.current = null;
    }

    const clampToBounds = (latlng: L.LatLng) => {
      const lat = Math.min(gridBounds.getNorth(), Math.max(gridBounds.getSouth(), latlng.lat));
      const lng = Math.min(gridBounds.getEast(), Math.max(gridBounds.getWest(), latlng.lng));
      return L.latLng(lat, lng);
    };

    const toGrid = latLngToGridRef.current;
    const [x1, y1] = toGrid(clampToBounds(start));
    const [x2, y2] = toGrid(clampToBounds(end));
    doIgniteArea(x1, y1, x2, y2);
  }, [doIgniteArea]);

  const handleMoveClick = useCallback((e: L.LeafletMouseEvent) => {
    onGridCenterChange([e.latlng.lat, e.latlng.lng]);
  }, [onGridCenterChange]);

  // Initialize map
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

    const overlay = L.imageOverlay(canvas.toDataURL(), boundsRef.current, {
      interactive: true,
    }).addTo(map);
    overlayRef.current = overlay;

    const rect = L.rectangle(boundsRef.current, {
      color: '#ff6b35',
      weight: 2,
      fill: false,
      opacity: 0.6,
    }).addTo(map);
    gridRectRef.current = rect;

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      gridRectRef.current = null;
    };
  }, []);

  // Update bounds when gridCenter changes
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    const rect = gridRectRef.current;
    if (!map || !overlay || !rect) return;

    const newBounds = computeBounds(gridCenter);
    boundsRef.current = newBounds;
    gridToLatLngRef.current = makeGridToLatLng(newBounds);
    latLngToGridRef.current = makeLatLngToGrid(newBounds);

    overlay.setBounds(newBounds);
    rect.setBounds(newBounds);
    map.flyTo(gridCenter, 9, { duration: 1.2 });
  }, [gridCenter]);

  // Live fires — render from props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (liveFiresLayerRef.current) {
      map.removeLayer(liveFiresLayerRef.current);
      liveFiresLayerRef.current = null;
    }

    if (liveFires.length === 0) return;

    const layer = L.layerGroup().addTo(map);
    liveFiresLayerRef.current = layer;

    for (const fire of liveFires) {
      const size = fire.magnitude ? Math.min(22, Math.max(12, 8 + fire.magnitude / 200)) : 14;
      const icon = L.divIcon({
        className: 'live-fire-icon',
        html: `<span style="font-size:${size}px">🔥</span>`,
        iconSize: [size + 6, size + 6],
        iconAnchor: [(size + 6) / 2, (size + 6) / 2],
      });
      const marker = L.marker([fire.latitude, fire.longitude], { icon });
      const hasMag = fire.magnitude != null;
      const label = `${fire.title}${hasMag ? ` — ${fire.magnitude} ${fire.magnitude_unit}` : ''}`;
      marker.bindTooltip(label, { direction: 'top' });

      const popup = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = fire.title;
      popup.appendChild(title);
      popup.appendChild(document.createElement('br'));

      if (fire.description) {
        popup.appendChild(document.createTextNode(fire.description));
        popup.appendChild(document.createElement('br'));
      }

      if (hasMag) {
        popup.appendChild(document.createTextNode(`Size: ${fire.magnitude} ${fire.magnitude_unit}`));
        popup.appendChild(document.createElement('br'));
      }

      if (fire.date) {
        popup.appendChild(document.createTextNode(`Updated: ${new Date(fire.date).toLocaleString()}`));
      }

      marker.bindPopup(popup);
      layer.addLayer(marker);
    }

    return () => {
      map.removeLayer(layer);
      if (liveFiresLayerRef.current === layer) liveFiresLayerRef.current = null;
    };
  }, [liveFires]);

  // User location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocationLayerRef.current) {
      map.removeLayer(userLocationLayerRef.current);
      userLocationLayerRef.current = null;
    }

    if (!userLocation) return;

    const layer = L.layerGroup().addTo(map);
    userLocationLayerRef.current = layer;

    const radius = 8;
    L.circleMarker(userLocation, {
      radius,
      color: '#3b82f6',
      fillColor: '#60a5fa',
      fillOpacity: 0.4,
      weight: 3,
      opacity: 0.9,
    }).addTo(layer);

    L.circleMarker(userLocation, {
      radius: radius * 2.5,
      color: 'transparent',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
    }).addTo(layer);

    return () => {
      map.removeLayer(layer);
      if (userLocationLayerRef.current === layer) userLocationLayerRef.current = null;
    };
  }, [userLocation]);

  // Fly to a fire
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToFire) return;
    map.flyTo(flyToFire, 9, { duration: 1.5 });
    onFlyDone();
  }, [flyToFire, onFlyDone]);

  // Mouse handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (igniteMode === 'point') {
      map.dragging.enable();
      const clickHandler = (e: L.LeafletMouseEvent) => {
        const gridBounds = boundsRef.current;
        if (!gridBounds.contains(e.latlng)) return;
        const toGrid = latLngToGridRef.current;
        const [x, y] = toGrid(e.latlng);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
          doIgnite(x, y);
        }
      };
      map.on('click', clickHandler);
      return () => { map.off('click', clickHandler); };
    } else if (igniteMode === 'area') {
      map.dragging.disable();
      const down = (e: L.LeafletMouseEvent) => {
        if (!boundsRef.current.contains(e.latlng)) return;
        handleAreaStart(e, map);
      };
      const move = (e: L.LeafletMouseEvent) => {
        handleAreaMove(e);
      };
      const up = (e: L.LeafletMouseEvent) => {
        if (!dragStartRef.current) return;
        handleAreaEnd(e, boundsRef.current);
      };

      map.on('mousedown', down);
      map.on('mousemove', move);
      map.on('mouseup', up);

      return () => {
        map.dragging.enable();
        map.off('mousedown', down);
        map.off('mousemove', move);
        map.off('mouseup', up);
        if (selectionRectRef.current) {
          map.removeLayer(selectionRectRef.current);
          selectionRectRef.current = null;
        }
        dragStartRef.current = null;
      };
    } else {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
      const clickHandler = (e: L.LeafletMouseEvent) => {
        handleMoveClick(e);
      };
      map.on('click', clickHandler);
      return () => {
        map.dragging.enable();
        map.getContainer().style.cursor = '';
        map.off('click', clickHandler);
      };
    }
  }, [igniteMode, doIgnite, doIgniteArea, handleAreaStart, handleAreaMove, handleAreaEnd, handleMoveClick]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <MapWeatherOverlay weather={weather} loading={false} />
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
