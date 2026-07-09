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

    async def fetch_active_fires(
        self,
        lat: float,
        lon: float,
        radius_deg: float = 0.5,
        source: str = "viirs_snpp",
        day_range: int = 1,
    ) -> list[dict]:
        if not self.is_available():
            return []

        source_code = FIRMS_SOURCES.get(source, FIRMS_SOURCES["viirs_snpp"])
        # FIRMS API expects area as west,south,east,north (bounding box)
        west = lon - radius_deg
        south = lat - radius_deg
        east = lon + radius_deg
        north = lat + radius_deg
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

    async def nearest_fires(
        self,
        lat: float,
        lon: float,
        radius_deg: float = 0.5,
        max_results: int = 5,
    ) -> list[dict]:
        fires = await self.fetch_active_fires(lat, lon, radius_deg)
        return fires[:max_results]


firms_service = FirmsService()
