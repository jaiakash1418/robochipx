import json
import logging
import math
import os
from hashlib import md5
from pathlib import Path

import numpy as np
from config import settings
from matplotlib.path import Path as MplPath
from scipy.ndimage import gaussian_filter

logger = logging.getLogger(__name__)

FUEL_TYPES = {
    "forest": 0,
    "grass": 1,
    "water": 2,
    "town": 3,
    "road": 4,
    "firebreak": 5,
}

CELL_STATES = {
    "unburned": 0,
    "burning": 1,
    "burned": 2,
}

DEFAULT_LAT = 39.8283
DEFAULT_LON = -98.5795

# --- real-terrain settings -------------------------------------------------
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT_S = 25
METERS_PER_DEGREE_LAT = 111_320
METERS_PER_CELL_DEFAULT = 1739  # each grid cell covers ~1.7km x 1.7km to match frontend 1° grid span (64 × 1739 ≈ 111 km ≈ 1°)

# (osm_key, osm_value_or_None_for_any) -> fuel type, geometry kind.
# Order matters: later entries are painted on top of earlier ones.
OSM_LAYERS = [
    (("landuse", "meadow"), "grass", "poly"),
    (("landuse", "farmland"), "grass", "poly"),
    (("natural", "grassland"), "grass", "poly"),
    (("landuse", "grass"), "grass", "poly"),
    (("natural", "wood"), "forest", "poly"),
    (("landuse", "forest"), "forest", "poly"),
    (("landuse", "residential"), "town", "poly"),
    (("building", None), "town", "poly"),
    (("natural", "water"), "water", "poly"),
    (("waterway", None), "water", "line"),
    (("power", "line"), "firebreak", "line"),
    (("highway", None), "road", "line"),
]

PLACE_TAGS = {"city", "town", "village", "hamlet"}


class Grid:
    def __init__(self, size: int = 64, meters_per_cell: float = METERS_PER_CELL_DEFAULT):
        self.size = size
        self.meters_per_cell = meters_per_cell
        self.fuel_map: np.ndarray | None = None
        self.fire_mask: np.ndarray | None = None
        self.step: int = 0
        self.towns: list[dict] = []
        self.bounds: tuple[float, float, float, float] | None = None
        self.water_mask: np.ndarray | None = None
        self._init_empty()

    def _init_empty(self):
        self.fuel_map = np.zeros((self.size, self.size), dtype=np.int8)
        self.fire_mask = np.zeros((self.size, self.size), dtype=np.int8)
        self.water_mask = np.zeros((self.size, self.size), dtype=bool)
        self.towns = []
        self.step = 0

    def _seed_from_location(self, lat: float, lon: float) -> int:
        h = md5(f"{lat:.4f},{lon:.4f}".encode()).hexdigest()
        return int(h[:8], 16)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    async def load_fuel_map(self, path: str, lat: float | None = None, lon: float | None = None):
        p = Path(path)
        if p.exists():
            with open(p) as f:
                data = json.load(f)
            loaded = np.array(data.get("fuel_map", []), dtype=np.int8)
            expected_size = data.get("size", self.size)
            if loaded.ndim == 2 and loaded.shape[0] == expected_size and loaded.shape[1] == expected_size:
                self.size = expected_size
                self.fuel_map = loaded
                self.towns = data.get("towns", [])
                self.bounds = tuple(data["bounds"]) if data.get("bounds") else None
                self.fire_mask = np.zeros((self.size, self.size), dtype=np.int8)
                self.step = 0
                return
        await self.generate_terrain(
            lat if lat is not None else DEFAULT_LAT,
            lon if lon is not None else DEFAULT_LON,
        )

    def save_fuel_map(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(
                {
                    "size": self.size,
                    "fuel_map": self.fuel_map.tolist(),
                    "towns": self.towns,
                    "bounds": list(self.bounds) if self.bounds else None,
                },
                f,
            )

    # ------------------------------------------------------------------
    # Terrain generation
    # ------------------------------------------------------------------
    async def generate_terrain(self, lat: float, lon: float, use_real_data: bool = True, use_landcover: bool = True):
        """Build the fuel map for the area around (lat, lon).

        Priority order:
          1. Overpass OSM (accurate water, roads, towns) → landcover ONNX fills gaps
          2. OSM alone
          3. Synthetic noise fallback
        """
        bounds = self._bbox_for(lat, lon)
        self.bounds = bounds
        n = self.size

        osm_ok = False
        lc_ok = False

        if use_real_data:
            self.fuel_map = np.full((n, n), -1, dtype=np.int8)
            self.fire_mask = np.zeros((n, n), dtype=np.int8)
            self.towns = []
            self.step = 0

            osm_data = self._fetch_osm_data(bounds)
            if osm_data and osm_data.get("elements"):
                self._apply_osm_overlay(osm_data, bounds)
                osm_ok = True

            if use_landcover:
                from services.landcover import landcover_service

                lc = await landcover_service.generate(lat, lon, n)
                if lc and lc.get("fuel_map") is not None:
                    lc_fuel = np.array(lc["fuel_map"], dtype=np.int8)
                    if osm_ok:
                        unfilled = self.fuel_map == -1
                        self.fuel_map[unfilled] = lc_fuel[unfilled]
                        self.fuel_map[self.fuel_map == -1] = FUEL_TYPES["grass"]
                    else:
                        self.fuel_map = lc_fuel
                        self.towns = lc.get("towns", [])
                    lc_ok = True
            else:
                self.fuel_map[self.fuel_map == -1] = FUEL_TYPES["grass"]
                lc_ok = True  # OSM-only data is enough

        if not osm_ok and not lc_ok:
            self._generate_terrain_synthetic(lat, lon)
            logger.info(f"Synthetic terrain generated at ({lat:.4f},{lon:.4f})")

        unique, counts = np.unique(self.fuel_map, return_counts=True)
        fuel_dist = {int(k): int(v) for k, v in zip(unique, counts)}
        logger.info(f"Terrain done — osm_ok={osm_ok} lc_ok={lc_ok} fuel_dist={fuel_dist}")

        self.fire_mask = np.zeros((n, n), dtype=np.int8)
        self.save_fuel_map(settings.fuel_map_path)

    # -- real terrain (OpenStreetMap via Overpass) ----------------------
    def _bbox_for(self, lat: float, lon: float) -> tuple[float, float, float, float]:
        # Fixed lat/lng span matching frontend GRID_SPAN = 1 (see MapView.tsx)
        half_span = 0.5
        south = lat - half_span
        north = lat + half_span
        west = lon - half_span
        east = lon + half_span
        return south, west, north, east

    def _latlon_to_grid(self, lat: float, lon: float, bounds=None) -> tuple[float, float]:
        """lat/lon -> fractional (row, col). row 0 is the north edge."""
        south, west, north, east = bounds or self.bounds
        row = (north - lat) / (north - south) * self.size
        col = (lon - west) / (east - west) * self.size
        return row, col

    def cell_to_latlon(self, row: int, col: int) -> tuple[float, float] | None:
        """Center lat/lon of a grid cell. Use this to place markers on Leaflet."""
        if not self.bounds:
            return None
        south, west, north, east = self.bounds
        lat = north - (row + 0.5) / self.size * (north - south)
        lon = west + (col + 0.5) / self.size * (east - west)
        return lat, lon

    def latlon_to_cell(self, lat: float, lon: float) -> tuple[int, int] | None:
        """lat/lon -> (row, col). Use this to turn a Leaflet click into ignite(x, y)."""
        if not self.bounds:
            return None
        row, col = self._latlon_to_grid(lat, lon)
        return int(row), int(col)

    def _fetch_osm_data(self, bounds) -> dict | None:
        south, west, north, east = bounds
        bbox = f"{south},{west},{north},{east}"
        query = f"""
[out:json];
(
  way["natural"="water"]({bbox});
  way["waterway"]({bbox});
  way["landuse"="forest"]({bbox});
  way["natural"="wood"]({bbox});
  way["landuse"="grass"]({bbox});
  way["natural"="grassland"]({bbox});
  way["landuse"="farmland"]({bbox});
  way["landuse"="meadow"]({bbox});
  way["landuse"="residential"]({bbox});
  way["building"]({bbox});
  way["highway"]({bbox});
  way["power"="line"]({bbox});
  node["place"]({bbox});
);
out body;
>;
out skel qt;
"""
        try:
            import httpx
            headers = {"User-Agent": "RoboChipX/1.0 wildfire-simulator"}
            resp = httpx.post(OVERPASS_URL, data={"data": query}, headers=headers, timeout=OVERPASS_TIMEOUT_S)
            resp.raise_for_status()
            data = resp.json()
            elements = data.get("elements", [])
            logger.info(f"Overpass OK: {len(elements)} elements at bbox={bbox}")
            return {"elements": elements}
        except Exception as e:
            logger.info(f"Overpass API call failed: {e}")
            return None

    def _apply_osm_overlay(self, osm: dict, bounds):
        """Paint OSM features over an existing fuel map without resetting it.
        Water, roads, buildings, towns are painted on top of whatever base
        (elevation-derived or synthetic) already exists."""
        nodes: dict[int, tuple[float, float]] = {}
        ways = []
        places = []
        for el in osm.get("elements", []):
            if el["type"] == "node":
                nodes[el["id"]] = (el["lat"], el["lon"])
                if el.get("tags", {}).get("place") in PLACE_TAGS:
                    places.append(el)
            elif el["type"] == "way":
                ways.append(el)

        n = self.size

        def way_to_grid_coords(way):
            coords = []
            for nid in way.get("nodes", []):
                if nid not in nodes:
                    return None
                lat_n, lon_n = nodes[nid]
                row, col = self._latlon_to_grid(lat_n, lon_n, bounds)
                coords.append((col, row))
            return coords

        def paint_polygon(coords, fuel_value):
            if len(coords) < 4:
                return
            from matplotlib.path import Path as MplPath
            import numpy as np
            row_centers = np.arange(n) + 0.5
            col_centers = np.arange(n) + 0.5
            rows, cols = np.meshgrid(row_centers, col_centers, indexing="ij")
            cell_points = np.stack([cols.ravel(), rows.ravel()], axis=-1)
            path = MplPath(coords)
            mask = path.contains_points(cell_points).reshape(n, n)
            if mask.any():
                self.fuel_map[mask] = fuel_value

        def paint_line(coords, fuel_value, width_cells=1):
            for (x0, y0), (x1, y1) in zip(coords[:-1], coords[1:]):
                self._rasterize_line(x0, y0, x1, y1, fuel_value, width_cells)

        ways_by_key: dict[tuple[str, str | None], list] = {}
        for way in ways:
            tags = way.get("tags", {})
            for key, val in tags.items():
                ways_by_key.setdefault((key, val), []).append(way)
                ways_by_key.setdefault((key, None), []).append(way)

        water_fuel = FUEL_TYPES["water"]
        layer_counts = {}
        for (osm_key, osm_val), fuel_name, kind in OSM_LAYERS:
            fuel_value = FUEL_TYPES[fuel_name]
            is_water = fuel_value == water_fuel
            ways_in_layer = ways_by_key.get((osm_key, osm_val), [])
            painted = 0
            for way in ways_in_layer:
                coords = way_to_grid_coords(way)
                if not coords:
                    continue
                is_closed = way["nodes"][0] == way["nodes"][-1]
                if kind == "poly" and is_closed:
                    paint_polygon(coords, fuel_value)
                else:
                    paint_line(coords, fuel_value)
                painted += 1
            if painted:
                layer_counts[f"{osm_key}={osm_val}"] = painted
            if is_water and self.water_mask is not None:
                self.water_mask[self.fuel_map == water_fuel] = True
        if layer_counts:
            logger.info(f"OSM painted: {layer_counts}")
        else:
            logger.info("OSM overlay painted nothing — no matching OSM ways found")

        name_set = {t["name"] for t in self.towns}
        for p in places:
            cell = self.latlon_to_cell(p["lat"], p["lon"])
            if cell is None:
                continue
            row, col = cell
            if 0 <= row < n and 0 <= col < n:
                name = p.get("tags", {}).get("name", f"Place {len(self.towns) + 1}")
                if name not in name_set:
                    name_set.add(name)
                    self.towns.append({"x": int(col), "y": int(row), "name": name})
                self.fuel_map[row, col] = FUEL_TYPES["town"]

    def _generate_terrain_from_osm(self, bounds) -> bool:
        osm = self._fetch_osm_data(bounds)
        if not osm or not osm.get("elements"):
            return False

        nodes: dict[int, tuple[float, float]] = {}
        ways = []
        places = []
        for el in osm["elements"]:
            if el["type"] == "node":
                nodes[el["id"]] = (el["lat"], el["lon"])
                if el.get("tags", {}).get("place") in PLACE_TAGS:
                    places.append(el)
            elif el["type"] == "way":
                ways.append(el)

        n = self.size
        # default background: open/unclassified land reads as grass
        self.fuel_map = np.full((n, n), FUEL_TYPES["grass"], dtype=np.int8)

        row_centers = np.arange(n) + 0.5
        col_centers = np.arange(n) + 0.5
        rows, cols = np.meshgrid(row_centers, col_centers, indexing="ij")
        cell_points = np.stack([cols.ravel(), rows.ravel()], axis=-1)  # (x=col, y=row)

        def way_to_grid_coords(way):
            coords = []
            for nid in way.get("nodes", []):
                if nid not in nodes:
                    return None
                lat_n, lon_n = nodes[nid]
                row, col = self._latlon_to_grid(lat_n, lon_n, bounds)
                coords.append((col, row))
            return coords

        def paint_polygon(coords, fuel_value):
            if len(coords) < 4:  # need at least a closed triangle (3 + repeat)
                return
            path = MplPath(coords)
            mask = path.contains_points(cell_points).reshape(n, n)
            if mask.any():
                self.fuel_map[mask] = fuel_value

        def paint_line(coords, fuel_value, width_cells=1):
            for (x0, y0), (x1, y1) in zip(coords[:-1], coords[1:]):
                self._rasterize_line(x0, y0, x1, y1, fuel_value, width_cells)

        ways_by_key: dict[tuple[str, str | None], list] = {}
        for way in ways:
            tags = way.get("tags", {})
            for key, val in tags.items():
                ways_by_key.setdefault((key, val), []).append(way)
                ways_by_key.setdefault((key, None), []).append(way)

        for (osm_key, osm_val), fuel_name, kind in OSM_LAYERS:
            fuel_value = FUEL_TYPES[fuel_name]
            for way in ways_by_key.get((osm_key, osm_val), []):
                coords = way_to_grid_coords(way)
                if not coords:
                    continue
                is_closed = way["nodes"][0] == way["nodes"][-1]
                if kind == "poly" and is_closed:
                    paint_polygon(coords, fuel_value)
                else:
                    paint_line(coords, fuel_value)

        self.towns = []
        for p in places:
            cell = self.latlon_to_cell(p["lat"], p["lon"])
            if cell is None:
                continue
            row, col = cell
            if 0 <= row < n and 0 <= col < n:
                self.towns.append(
                    {
                        "x": int(col),
                        "y": int(row),
                        "name": p.get("tags", {}).get("name", f"Town {len(self.towns) + 1}"),
                    }
                )

        return True

    def _rasterize_line(self, x0: float, y0: float, x1: float, y1: float, fuel_value: int, width_cells: int = 1):
        """Bresenham line rasterization in (col, row) space, with an optional
        square brush so thin features like roads and power-line firebreaks
        show up as more than a single pixel-wide diagonal."""
        n = self.size
        x0i, y0i = int(round(x0)), int(round(y0))
        x1i, y1i = int(round(x1)), int(round(y1))
        dx, dy = abs(x1i - x0i), -abs(y1i - y0i)
        sx = 1 if x0i < x1i else -1
        sy = 1 if y0i < y1i else -1
        err = dx + dy
        x, y = x0i, y0i
        half_w = width_cells // 2
        while True:
            for ox in range(-half_w, half_w + 1):
                for oy in range(-half_w, half_w + 1):
                    px, py = x + ox, y + oy
                    if 0 <= px < n and 0 <= py < n:
                        self.fuel_map[py, px] = fuel_value
            if x == x1i and y == y1i:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x += sx
            if e2 <= dx:
                err += dx
                y += sy

    # -- synthetic fallback (used only if OSM data can't be fetched) ----
    def _generate_terrain_synthetic(self, lat: float, lon: float):
        seed = self._seed_from_location(lat, lon)
        rng = np.random.default_rng(seed)
        n = self.size

        coarse = rng.random((n // 4 + 2, n // 4 + 2))
        up = np.repeat(np.repeat(coarse, 4, axis=0), 4, axis=1)
        smooth = gaussian_filter(up[:n, :n], sigma=1.5)

        threshold_rng = np.random.default_rng(seed + 1)
        jitter = threshold_rng.uniform(-0.03, 0.03, (n, n)).astype(np.float64)
        smooth = np.clip(smooth + jitter, 0, 1)

        self.fuel_map = np.zeros((n, n), dtype=np.int8)
        self.fuel_map[smooth < 0.35] = FUEL_TYPES["forest"]
        self.fuel_map[(smooth >= 0.35) & (smooth < 0.65)] = FUEL_TYPES["grass"]
        self.fuel_map[(smooth >= 0.65) & (smooth < 0.75)] = FUEL_TYPES["water"]
        self.fuel_map[(smooth >= 0.75) & (smooth < 0.88)] = FUEL_TYPES["town"]
        self.fuel_map[(smooth >= 0.88) & (smooth < 0.95)] = FUEL_TYPES["road"]
        self.fuel_map[smooth >= 0.95] = FUEL_TYPES["firebreak"]

        self.towns = []
        town_cells = np.argwhere(self.fuel_map == FUEL_TYPES["town"])
        if len(town_cells) > 0:
            town_rng = np.random.default_rng(seed + 2)
            n_towns = min(6, max(2, len(town_cells) // 8))
            chosen = town_rng.choice(len(town_cells), n_towns, replace=False)
            for idx in chosen:
                i, j = town_cells[idx]
                self.towns.append({"x": int(j), "y": int(i), "name": f"Town {len(self.towns) + 1}"})

    # ------------------------------------------------------------------
    # Fire state
    # ------------------------------------------------------------------
    def ignite(self, x: int, y: int) -> bool:
        """x = column, y = row. Rejects water cells (OSM water_mask first, then fuel_map)."""
        if 0 <= x < self.size and 0 <= y < self.size:
            if self.fire_mask[y, x] == CELL_STATES["unburned"]:
                if self.water_mask is not None and self.water_mask[y, x]:
                    return False
                if self.fuel_map[y, x] == FUEL_TYPES["water"]:
                    return False
                self.fire_mask[y, x] = CELL_STATES["burning"]
                return True
        return False

    def clear(self, x: int, y: int) -> bool:
        if 0 <= x < self.size and 0 <= y < self.size:
            self.fire_mask[y, x] = CELL_STATES["unburned"]
            return True
        return False

    def reset(self):
        self.fire_mask.fill(CELL_STATES["unburned"])
        self.step = 0

    def get_state(self) -> dict:
        return {
            "step": self.step,
            "grid": self.fuel_map.tolist(),
            "fire_mask": self.fire_mask.tolist(),
            "towns": self.towns,
            "bounds": list(self.bounds) if self.bounds else None,
            "fuel_types": {v: k for k, v in FUEL_TYPES.items()},
            "cell_states": {v: k for k, v in CELL_STATES.items()},
        }

    def get_stats(self) -> dict:
        total = self.size * self.size
        burning = int(np.sum(self.fire_mask == CELL_STATES["burning"]))
        burned = int(np.sum(self.fire_mask == CELL_STATES["burned"]))
        return {
            "total_cells": total,
            "burning": burning,
            "burned": burned,
            "percentage_burned": round((burned / total) * 100, 2),
            "active_fronts": burning,
        }

    def get_grid_array(self) -> np.ndarray:
        stacked = np.stack([self.fuel_map, self.fire_mask], axis=-1)
        return stacked.astype(np.float32)