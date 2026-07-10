import math, io, os, logging, time, asyncio
from typing import Optional
import httpx
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from hashlib import md5
from config import settings

logger = logging.getLogger(__name__)

OEM_CLASSES = {0: "background", 1: "bareland", 2: "rangeland", 3: "developed", 4: "road", 5: "tree", 6: "water", 7: "agriculture"}
OEM_TO_FUEL = {0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 5: 0, 6: 2, 7: 1}
FUEL_TO_OEM = {0: 5, 1: 2, 2: 6, 3: 3, 4: 4, 5: 1}
ESRI_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
CACHE_TTL = 3600


class LandcoverService:
    def __init__(self):
        self._http_client: Optional[httpx.AsyncClient] = None
        self._hf_token: Optional[str] = settings.hf_token or os.getenv("HF_TOKEN")
        self._cache: dict[str, tuple[float, dict]] = {}
        self._local_ml = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    def _cache_key(self, lat: float, lon: float) -> str:
        return f"{lat:.4f},{lon:.4f}"

    def _get_cached(self, lat: float, lon: float) -> Optional[dict]:
        key = self._cache_key(lat, lon)
        entry = self._cache.get(key)
        if entry is not None and time.monotonic() - entry[0] < CACHE_TTL:
            return entry[1]
        self._cache.pop(key, None)
        return None

    def _set_cached(self, lat: float, lon: float, data: dict):
        self._cache[self._cache_key(lat, lon)] = (time.monotonic(), data)

    @staticmethod
    def _latlon_to_tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
        lat_rad = math.radians(lat)
        n = 2 ** zoom
        return int(n * ((lon + 180) / 360)), int(n * (1 - (math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi)) / 2)

    async def _fetch_tile(self, client: httpx.AsyncClient, x: int, y: int, zoom: int) -> Optional[Image.Image]:
        try:
            resp = await client.get(ESRI_TILE_URL.format(z=zoom, y=y, x=x), headers={"User-Agent": "robochipx/1.0"})
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content))
        except Exception as e:
            logger.warning(f"Tile ({x},{y}) @ z{zoom} failed: {e}")
            return None

    async def _fetch_tiles_parallel(self, x_min, x_max, y_min, y_max, zoom) -> Optional[list[list[Image.Image]]]:
        client = await self._get_client()
        coords = [(x, y) for y in range(y_min, y_max + 1) for x in range(x_min, x_max + 1)]
        results = await asyncio.gather(*[self._fetch_tile(client, x, y, zoom) for x, y in coords])
        if any(r is None for r in results):
            return None
        w = x_max - x_min + 1
        return [results[i * w:(i + 1) * w] for i in range(y_max - y_min + 1)]

    def _get_local_ml(self):
        if self._local_ml is None:
            try:
                from models.landcover_model import landcover_model
                self._local_ml = landcover_model
            except Exception as e:
                logger.warning(f"Local ML not available: {e}")
        return self._local_ml

    async def _fetch_and_classify_ml(self, lat: float, lon: float) -> Optional[dict]:
        local_ml = self._get_local_ml()
        if local_ml is None or not local_ml.is_loaded():
            return None

        zoom = 10
        south, north, west, east = lat - 0.5, lat + 0.5, lon - 0.5, lon + 0.5
        xw, yn = self._latlon_to_tile(north, west, zoom)
        xe, ys = self._latlon_to_tile(south, east, zoom)
        x_min, x_max, y_min, y_max = min(xw, xe), max(xw, xe), min(yn, ys), max(yn, ys)

        rows = await self._fetch_tiles_parallel(x_min, x_max, y_min, y_max, zoom)
        if rows is None:
            return None

        tw, th = rows[0][0].size
        fw, fh = (x_max - x_min + 1) * tw, (y_max - y_min + 1) * th
        stitched = Image.new("RGB", (fw, fh))
        for j, row in enumerate(rows):
            for i, tile in enumerate(row):
                stitched.paste(tile, (i * tw, j * th))

        return local_ml.predict_to_fuel(stitched)

    def _generate_synthetic(self, lat: float, lon: float, size: int = 64) -> dict:
        seed = int(md5(f"landcover:{lat:.4f},{lon:.4f}".encode()).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)
        coarse = rng.random((size // 4 + 2, size // 4 + 2))
        up = np.repeat(np.repeat(coarse, 4, axis=0), 4, axis=1)
        smooth = gaussian_filter(up[:size, :size], sigma=1.5)
        fuel = np.zeros((size, size), dtype=np.int8)
        fuel[smooth < 0.30] = 0
        fuel[(smooth >= 0.30) & (smooth < 0.55)] = 1
        fuel[(smooth >= 0.55) & (smooth < 0.62)] = 2
        fuel[(smooth >= 0.62) & (smooth < 0.75)] = 3
        fuel[(smooth >= 0.75) & (smooth < 0.85)] = 4
        fuel[(smooth >= 0.85) & (smooth < 0.92)] = 1
        fuel[smooth >= 0.92] = 5
        grid_classes = [[OEM_CLASSES.get(int(fuel[r, c]), "rangeland") for c in range(size)] for r in range(size)]
        return {"fuel_map": fuel.tolist(), "landcover": fuel.tolist(), "classes": grid_classes, "source": "synthetic"}

    async def generate(self, lat: float, lon: float, size: int = 64) -> dict:
        cached = self._get_cached(lat, lon)
        if cached is not None:
            return cached

        ml_result = await self._fetch_and_classify_ml(lat, lon)
        if ml_result is not None:
            self._set_cached(lat, lon, ml_result)
            return ml_result

        result = self._generate_synthetic(lat, lon, size)
        self._set_cached(lat, lon, result)
        return result


landcover_service = LandcoverService()
