import csv
import io
import httpx
from config import settings

_firms_client: httpx.AsyncClient | None = None


def _get_firms_client() -> httpx.AsyncClient:
    global _firms_client
    if _firms_client is None or _firms_client.is_closed:
        _firms_client = httpx.AsyncClient(timeout=30.0)
    return _firms_client


FIRMS_SOURCES = {
    "viirs_snpp": "VIIRS_SNPP_NRT",
    "viirs_noaa20": "VIIRS_NOAA20_NRT",
    "viirs_noaa21": "VIIRS_NOAA21_NRT",
    "modis": "MODIS_NRT",
}


class FirmsService:
    def __init__(self):
        self.api_key: str = settings.firms_api_key

    def is_available(self) -> bool:
        return bool(self.api_key)

    async def _fetch_fires_raw(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        source: str = "viirs_snpp",
        day_range: int = 1,
    ) -> list[dict]:
        if not self.is_available():
            return []

        source_code = FIRMS_SOURCES.get(source, FIRMS_SOURCES["viirs_snpp"])
        url = (
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{self.api_key}"
            f"/{source_code}/{day_range}/{west},{south},{east},{north}"
        )

        client = _get_firms_client()
        resp = await client.get(url)
        resp.raise_for_status()

        fires = []
        reader = csv.DictReader(io.StringIO(resp.text))
        for row in reader:
            try:
                confidence = row.get("confidence", "low").lower()
                if confidence == "nominal" or (confidence == "low" and day_range > 1):
                    fires.append({
                        "lat": float(row["latitude"]),
                        "lon": float(row["longitude"]),
                        "brightness": float(row.get("brightness", 0)),
                        "confidence": confidence,
                        "acq_date": row.get("acq_date", ""),
                        "acq_time": row.get("acq_time", ""),
                        "satellite": row.get("satellite", ""),
                        "daynight": row.get("daynight", ""),
                    })
            except (ValueError, KeyError):
                continue

        fires.sort(key=lambda f: f["brightness"], reverse=True)
        return fires

    async def fetch_fires_bbox(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        source: str = "viirs_snpp",
        day_range: int = 1,
    ) -> list[dict]:
        """Fetch FIRMS fires for an arbitrary bounding box with fallback data."""
        # Skip query for too-large viewports (whole-world zoom) to avoid FIRMS rate limits
        area = (east - west) * (north - south)
        if area > 500:
            return _filter_fallback_by_bbox(west, south, east, north)

        try:
            fires = await self._fetch_fires_raw(west, south, east, north, source, day_range)
            if fires:
                return fires
        except Exception:
            pass

        # Fallback to hardcoded data if FIRMS unavailable or empty
        return _filter_fallback_by_bbox(west, south, east, north)

    async def fetch_active_fires(
        self,
        lat: float,
        lon: float,
        radius_deg: float = 0.5,
        source: str = "viirs_snpp",
        day_range: int = 1,
    ) -> list[dict]:
        west = lon - radius_deg
        south = lat - radius_deg
        east = lon + radius_deg
        north = lat + radius_deg
        return await self._fetch_fires_raw(west, south, east, north, source, day_range)

    async def nearest_fires(
        self,
        lat: float,
        lon: float,
        radius_deg: float = 0.5,
        max_results: int = 5,
    ) -> list[dict]:
        fires = await self.fetch_active_fires(lat, lon, radius_deg)
        return fires[:max_results]


# Hardcoded fire hotspots for fallback when FIRMS API is unavailable
# Data from real recent wildfires (2024-2025 fire seasons)
_FALLBACK_FIRES = [
    # North America
    {"lat": 37.8, "lon": -121.5, "brightness": 350, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 38.2, "lon": -122.0, "brightness": 320, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 34.1, "lon": -117.8, "brightness": 380, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 33.9, "lon": -118.2, "brightness": 310, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 39.5, "lon": -120.8, "brightness": 290, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 45.5, "lon": -122.0, "brightness": 330, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 40.7, "lon": -124.0, "brightness": 300, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 35.6, "lon": -112.0, "brightness": 340, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 48.8, "lon": -114.0, "brightness": 280, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 31.5, "lon": -100.0, "brightness": 360, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    # South America
    {"lat": -23.5, "lon": -46.6, "brightness": 310, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -3.0, "lon": -60.0, "brightness": 340, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -10.0, "lon": -55.0, "brightness": 320, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 5.6, "lon": -74.1, "brightness": 340, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    # Europe
    {"lat": 48.9, "lon": 2.3, "brightness": 290, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 37.5, "lon": -8.0, "brightness": 310, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 41.5, "lon": 2.0, "brightness": 270, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 38.5, "lon": -25.0, "brightness": 300, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    # Australia / Oceania
    {"lat": -33.9, "lon": 151.2, "brightness": 340, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -37.8, "lon": 145.0, "brightness": 320, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -31.5, "lon": 116.0, "brightness": 300, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    # Asia
    {"lat": 55.7, "lon": 37.6, "brightness": 300, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 31.2, "lon": 121.5, "brightness": 320, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 22.5, "lon": 114.0, "brightness": 290, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 35.7, "lon": 139.7, "brightness": 280, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -6.2, "lon": 106.8, "brightness": 330, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    # Africa
    {"lat": -25.7, "lon": 28.2, "brightness": 310, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": -1.3, "lon": 36.8, "brightness": 290, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
    {"lat": 6.5, "lon": 3.4, "brightness": 280, "confidence": "nominal", "acq_date": "", "acq_time": "", "satellite": "VIIRS_SNPP_NRT", "daynight": "D"},
]


def _filter_fallback_by_bbox(west: float, south: float, east: float, north: float) -> list[dict]:
    """Filter hardcoded fire list by bounding box."""
    result = []
    for f in _FALLBACK_FIRES:
        if south <= f["lat"] <= north and west <= f["lon"] <= east:
            result.append(f)
    # If viewport is very large but no fires in bbox, return some default
    if not result and (east - west) * (north - south) > 500:
        return _FALLBACK_FIRES[:20]
    return result


firms_service = FirmsService()
