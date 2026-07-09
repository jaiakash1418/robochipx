import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSimulation } from '../context/SimulationContext';
import { FUEL_COLORS, type FuelType, type CellState, type LiveFire } from '../api/types';
import MapWeatherOverlay from './MapWeatherOverlay';
import InfoTooltip from './InfoTooltip';
import { convex } from '@turf/turf';
import type { Feature, Polygon, FeatureCollection } from 'geojson';

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
    return [Math.floor(lngPct * GRID_SIZE), Math.floor((1 - latPct) * GRID_SIZE)];
  };
}

/* --- Turf.js geospatial utilities --- */

function burningCellsToGeoJSON(fireMask: CellState[][], bounds: L.LatLngBounds): FeatureCollection<Polygon> {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const cellLat = (north - south) / GRID_SIZE;
  const cellLng = (east - west) / GRID_SIZE;

  const features: Feature<Polygon>[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (fireMask[row][col] === 1) { // burning
        const cellWest = west + col * cellLng;
        const cellEast = cellWest + cellLng;
        const cellNorth = north - row * cellLat;
        const cellSouth = cellNorth - cellLat;
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [cellWest, cellSouth],
              [cellEast, cellSouth],
              [cellEast, cellNorth],
              [cellWest, cellNorth],
              [cellWest, cellSouth],
            ]],
          },
          properties: { row, col },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

function getFirePerimeter(fireMask: CellState[][], bounds: L.LatLngBounds): Feature<Polygon> | null {
  const geojson = burningCellsToGeoJSON(fireMask, bounds);
  if (geojson.features.length === 0) return null;
  
  // Extract centroids of burning cells as points for convex hull
  const points = geojson.features.map(f => {
    const coords = f.geometry.coordinates[0];
    // Get centroid of cell polygon
    const lng = coords[0][0] + (coords[2][0] - coords[0][0]) / 2;
    const lat = coords[0][1] + (coords[2][1] - coords[0][1]) / 2;
    return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [lng, lat] }, properties: {} };
  });
  
  if (points.length < 3) return null;
  
  const hull = convex({ type: 'FeatureCollection', features: points });
  return hull;
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
  const windParticlesRef = useRef<{ x: number; y: number; speed: number; spawnTime: number; lifetime: number }[]>([]);
  const rafRef = useRef<number>(0);
  const perimeterLayerRef = useRef<L.GeoJSON | null>(null);
  const gridSnapshotRef = useRef<ImageData | null>(null);
  const selectionRectRef = useRef<L.Rectangle | null>(null);
  const gridRectRef = useRef<L.Rectangle | null>(null);
  const dragStartRef = useRef<L.LatLng | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const liveFiresLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds>(computeBounds(gridCenter));
  const gridToLatLngRef = useRef<(cellX: number, cellY: number) => [number, number]>(
    makeGridToLatLng(boundsRef.current),
  );
  const latLngToGridRef = useRef<(latlng: L.LatLng) => [number, number]>(
    makeLatLngToGrid(boundsRef.current),
  );
  const { state, doIgnite, doIgniteArea, setSelectedArea } = useSimulation();
  const { fireMask, fuelMap, weather, selectActive, selectedArea } = state;
  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const lastOverlayUpdateRef = useRef(0);
const drawWindParticlesRef = useRef<(ctx: CanvasRenderingContext2D) => void>(() => {});

  const updatePerimeter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (perimeterLayerRef.current) {
      map.removeLayer(perimeterLayerRef.current);
      perimeterLayerRef.current = null;
    }

    // Use Turf.js for fire perimeter
    const perimeter = getFirePerimeter(fireMask, boundsRef.current);
    if (!perimeter) return;

    const layer = L.geoJSON(perimeter, {
      style: {
        color: '#ff4500',
        weight: 2.5,
        fillColor: 'rgba(255,69,0,0.10)',
        fillOpacity: 1,
        dashArray: '6,4',
        opacity: 0.8,
      },
    }).addTo(map);
    perimeterLayerRef.current = layer;
  }, [fireMask]);

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

    gridSnapshotRef.current = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, [fuelMap, fireMask]);

  drawWindParticlesRef.current = (ctx: CanvasRenderingContext2D) => {
    const w = weatherRef.current;
    const wDir = w?.wind_direction ?? 0;
    const wSpeed = w?.wind_speed ?? 0;
    const rad = ((wDir + 90) * Math.PI) / 180;

    if (wSpeed < 0.5) return;

    const count = Math.min(Math.floor(wSpeed * 3), 120);
    let particles = windParticlesRef.current;

    if (particles.length !== count) {
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * CANVAS_SIZE,
        y: Math.random() * CANVAS_SIZE,
        speed: 0.6 + Math.random() * 1.8,
        spawnTime: Date.now(),
        lifetime: 1.5 + Math.random() * 1.5,
      }));
      windParticlesRef.current = particles;
    }

    const now = Date.now();
    const t = now / 1000;

    for (const p of particles) {
      const age = (now - p.spawnTime) / 1000;
      if (age > p.lifetime || p.x < -60 || p.x > CANVAS_SIZE + 60 || p.y < -60 || p.y > CANVAS_SIZE + 60) {
        p.x = Math.random() * CANVAS_SIZE;
        p.y = Math.random() * CANVAS_SIZE;
        p.spawnTime = now;
        continue;
      }

      const lifeFade = 1 - age / p.lifetime;
      const baseLen = 3 + wSpeed * 0.15;
      const len = baseLen * p.speed;
      const dx = Math.cos(rad) * len;
      const dy = Math.sin(rad) * len;

      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.x * 0.01 + p.y * 0.01);
      const alpha = (0.4 + 0.4 * pulse) * lifeFade;

      ctx.save();
      ctx.translate(p.x, p.y);

      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1.5 + pulse;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dx, dy);
      ctx.stroke();

      const arrowSize = 3 + pulse * 1.5;
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

      p.x += dx * 0.08;
      p.y += dy * 0.08;
    }
  };

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
    drawWindParticlesRef.current(ctx);

    const now = performance.now();
    if (now - lastOverlayUpdateRef.current > 66) {
      overlay.setUrl(canvas.toDataURL());
      lastOverlayUpdateRef.current = now;
    }
  }, []);

  useEffect(() => {
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
  }, [compositeFrame]);

  useEffect(() => {
    if (!mapRef.current) return;
    drawGridCanvas();
    updatePerimeter();
  }, [drawGridCanvas, updatePerimeter]);

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
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri' },
    ).addTo(map);

    const overlay = L.imageOverlay(canvas.toDataURL(), boundsRef.current, {
      interactive: true,
    }).addTo(map);
    overlayRef.current = overlay;

    gridRectRef.current = L.rectangle(boundsRef.current, {
      color: '#ff6b35',
      weight: 2,
      fill: false,
      opacity: 0.6,
    }).addTo(map);

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
      const label = `${fire.title}${fire.magnitude ? ` — ${fire.magnitude} ${fire.magnitude_unit}` : ''}`;
      marker.bindTooltip(label, { direction: 'top' });
      marker.bindPopup(
        `<strong>${fire.title}</strong><br/>` +
        (fire.description ? `${fire.description}<br/>` : '') +
        (fire.magnitude ? `Size: ${fire.magnitude} ${fire.magnitude_unit}<br/>` : '') +
        `Updated: ${new Date(fire.date).toLocaleString()}`,
      );
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const lat = userLocation[0];
      const lon = userLocation[1];
      const toGrid = latLngToGridRef.current;
      const gridPt = toGrid(L.latLng(lat, lon));
      const x = gridPt[0];
      const y = gridPt[1];
      const icon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-location-dot" />',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.bindPopup(`<b>Your Location</b><br/>${lat.toFixed(4)}, ${lon.toFixed(4)}<br/>Grid: (${x}, ${y})`);
      userMarkerRef.current = marker;
    }
  }, [userLocation]);

  /* --- selection tool (draw rectangle, persists after release) --- */
  const selRectRef = useRef<L.Rectangle | null>(null);
  const selStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const gridBounds = boundsRef.current;

    const drawPersistentSel = () => {
      if (selRectRef.current) {
        map.removeLayer(selRectRef.current);
        selRectRef.current = null;
      }
      if (selectedArea && !selectActive) {
        const toLatLng = gridToLatLngRef.current;
        const sw = toLatLng(selectedArea.x1, selectedArea.y2);
        const ne = toLatLng(selectedArea.x2, selectedArea.y1);
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

    const toLatLng = gridToLatLngRef.current;
    const toGrid = latLngToGridRef.current;

    const onDown = (e: L.LeafletMouseEvent) => {
      if (!gridBounds.contains(e.latlng)) return;
      const [cx, cy] = toGrid(e.latlng);
      selStartRef.current = {
        x: Math.max(0, Math.min(GRID_SIZE - 1, cx)),
        y: Math.max(0, Math.min(GRID_SIZE - 1, cy)),
      };
    };

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!selStartRef.current || !gridBounds.contains(e.latlng)) return;
      const [cx, cy] = toGrid(e.latlng);
      const sx = Math.min(selStartRef.current.x, Math.max(0, Math.min(GRID_SIZE - 1, cx)));
      const sy = Math.min(selStartRef.current.y, Math.max(0, Math.min(GRID_SIZE - 1, cy)));
      const ex = Math.max(selStartRef.current.x, Math.max(0, Math.min(GRID_SIZE - 1, cx)));
      const ey = Math.max(selStartRef.current.y, Math.max(0, Math.min(GRID_SIZE - 1, cy)));

      if (selRectRef.current) map.removeLayer(selRectRef.current);
      const sw = toLatLng(sx, ey);
      const ne = toLatLng(ex, sy);
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
      const x1 = Math.floor(((sw.lng - gridBounds.getWest()) / (gridBounds.getEast() - gridBounds.getWest())) * GRID_SIZE);
      const x2 = Math.ceil(((ne.lng - gridBounds.getWest()) / (gridBounds.getEast() - gridBounds.getWest())) * GRID_SIZE);
      const y1 = Math.floor(((gridBounds.getNorth() - ne.lat) / (gridBounds.getNorth() - gridBounds.getSouth())) * GRID_SIZE);
      const y2 = Math.ceil(((gridBounds.getNorth() - sw.lat) / (gridBounds.getNorth() - gridBounds.getSouth())) * GRID_SIZE);
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
        <InfoTooltip text="Simulation grid overlay" />
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
