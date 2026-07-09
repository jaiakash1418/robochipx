import httpx
import numpy as np
from hashlib import md5
from scipy.ndimage import zoom, gaussian_filter
from config import settings

FUEL_TYPES = {
    "forest": 0,
    "grass": 1,
    "water": 2,
    "town": 3,
    "road": 4,
    "firebreak": 5,
}


class TerrainService:
    def __init__(self):
        self._cache: dict[str, np.ndarray] = {}
        self._last_location: tuple[float, float] | None = None
        self._last_elevation: np.ndarray | None = None

    def _cache_key(self, lat: float, lon: float) -> str:
        return f"{lat:.4f},{lon:.4f}"

    async def get_elevation(
        self, lat: float, lon: float, size: int = 64,
        bounds: tuple[float, float, float, float] | None = None,
    ) -> np.ndarray | None:
        key = self._cache_key(lat, lon)
        if key in self._cache:
            return self._cache[key]

        if bounds:
            south, west, north, east = bounds
        else:
            south = lat - 0.5
            north = lat + 0.5
            west = lon - 0.5
            east = lon + 0.5

        params = {
            "demtype": "SRTM",
            "south": south,
            "north": north,
            "west": west,
            "east": east,
            "output": "JSON",
        }
        if settings.open_topography_api_key:
            params["API_key"] = settings.open_topography_api_key

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    settings.open_topography_url,
                    params=params,
                    timeout=30,
                )
                resp.raise_for_status()
                raw = resp.json()

            if isinstance(raw, list) and len(raw) > 0 and isinstance(raw[0], list):
                elev = np.array(raw, dtype=np.float32)
            elif isinstance(raw, dict) and "elevation" in raw:
                elev = np.array(raw["elevation"], dtype=np.float32)
            else:
                return None

            h, w = elev.shape
            if h > size * 2 or w > size * 2:
                elev = zoom(elev, (size / h, size / w), order=1)

            elev[elev < -1000] = 0
            self._cache[key] = elev
            return elev

        except Exception:
            return None

    def elevation_to_fuel(self, elevation: np.ndarray, lat: float, lon: float, size: int = 64) -> dict:
        n = elevation.shape[0]
        if n != size:
            elev = zoom(elevation, (size / n, size / n), order=1)
        else:
            elev = elevation

        dy, dx = np.gradient(elev)
        slope = np.sqrt(dx ** 2 + dy ** 2)

        seed = int(md5(f"{lat:.4f},{lon:.4f}".encode()).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)

        fuel = np.zeros((size, size), dtype=np.int8)

        water = elev < 5
        fuel[water] = FUEL_TYPES["water"]

        forest_mask = (~water) & ((elev >= 5) & (elev < 800) & (slope > 3))
        fuel[forest_mask] = FUEL_TYPES["forest"]

        remaining = ~water & (fuel == 0)
        grass_mask = remaining & (elev < 1200) & (slope <= 3)
        fuel[grass_mask] = FUEL_TYPES["grass"]

        remaining = ~water & (fuel == 0)
        high_grass = remaining & (elev >= 1200)
        fuel[high_grass] = FUEL_TYPES["grass"]

        remaining = ~water & (fuel == 0)
        extra_forest = remaining & ((elev >= 5) & (slope > 1.5))
        fuel[extra_forest] = FUEL_TYPES["forest"]

        remaining = ~water & (fuel == 0)
        fuel[remaining] = FUEL_TYPES["grass"]

        town_rng = np.random.default_rng(seed + 1)
        flat_land = (fuel == FUEL_TYPES["grass"]) & (slope < 1)
        flat_indices = np.argwhere(flat_land)
        if len(flat_indices) > 0:
            n_towns = min(6, max(2, len(flat_indices) // 12))
            chosen = town_rng.choice(len(flat_indices), n_towns, replace=False)
            for idx in chosen:
                i, j = flat_indices[idx]
                fuel[i, j] = FUEL_TYPES["town"]

        towns = []
        town_cells = np.argwhere(fuel == FUEL_TYPES["town"])
        town_name_rng = np.random.default_rng(seed + 2)
        if len(town_cells) > 0:
            kept = town_name_rng.choice(
                len(town_cells),
                min(len(town_cells), 6),
                replace=False,
            )
            for idx in kept:
                i, j = town_cells[idx]
                towns.append({
                    "x": int(j), "y": int(i),
                    "name": f"Town {len(towns) + 1}",
                })

        return {"fuel_map": fuel, "towns": towns}

    def generate_synthetic(self, lat: float, lon: float, size: int = 64) -> dict:
        seed = int(md5(f"{lat:.4f},{lon:.4f}".encode()).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)

        coarse = rng.random((size // 4 + 2, size // 4 + 2))
        up = np.repeat(np.repeat(coarse, 4, axis=0), 4, axis=1)
        smooth = gaussian_filter(up[:size, :size], sigma=1.5)

        jitter_rng = np.random.default_rng(seed + 1)
        jitter = jitter_rng.uniform(-0.03, 0.03, (size, size)).astype(np.float64)
        smooth = np.clip(smooth + jitter, 0, 1)

        fuel = np.zeros((size, size), dtype=np.int8)
        fuel[smooth < 0.35] = FUEL_TYPES["forest"]
        fuel[(smooth >= 0.35) & (smooth < 0.65)] = FUEL_TYPES["grass"]
        fuel[(smooth >= 0.65) & (smooth < 0.75)] = FUEL_TYPES["water"]
        fuel[(smooth >= 0.75) & (smooth < 0.88)] = FUEL_TYPES["town"]
        fuel[(smooth >= 0.88) & (smooth < 0.95)] = FUEL_TYPES["road"]
        fuel[smooth >= 0.95] = FUEL_TYPES["firebreak"]

        towns = []
        town_cells = np.argwhere(fuel == FUEL_TYPES["town"])
        if len(town_cells) > 0:
            town_rng = np.random.default_rng(seed + 2)
            n_towns = min(6, max(2, len(town_cells) // 8))
            chosen = town_rng.choice(len(town_cells), n_towns, replace=False)
            for idx in chosen:
                i, j = town_cells[idx]
                towns.append({
                    "x": int(j), "y": int(i),
                    "name": f"Town {len(towns) + 1}",
                })

        return {"fuel_map": fuel, "towns": towns}

    async def generate(
        self, lat: float, lon: float, size: int = 64,
        bounds: tuple[float, float, float, float] | None = None,
    ) -> dict:
        elev = await self.get_elevation(lat, lon, size, bounds)
        if elev is not None:
            return self.elevation_to_fuel(elev, lat, lon, size)
        return self.generate_synthetic(lat, lon, size)


terrain_service = TerrainService()
