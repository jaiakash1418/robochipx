import os
import httpx
import csv
import datetime
from config import settings


class WeatherService:
    def __init__(self):
        self.cached: dict = {}
        self.use_live: bool = True

    async def fetch_live(self, lat: float = None, lon: float = None) -> dict:
        lat = lat or settings.default_lat
        lon = lon or settings.default_lon

        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.open_meteo_url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()["current"]

        weather = {
            "wind_speed": data["wind_speed_10m"],
            "wind_direction": data["wind_direction_10m"],
            "temperature": data["temperature_2m"],
            "humidity": data["relative_humidity_2m"],
            "source": "open-meteo",
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }

        self.cached = weather
        self._log(weather)
        return weather

    def get_demo(self) -> dict:
        return {
            "wind_speed": 12.0,
            "wind_direction": 135.0,
            "temperature": 29.0,
            "humidity": 34.0,
            "source": "demo",
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }

    async def get_current(self) -> dict:
        if self.use_live:
            try:
                return await self.fetch_live()
            except Exception:
                return self.get_demo()
        return self.cached if self.cached else self.get_demo()

    def override(self, **kwargs) -> dict:
        base = self.cached if self.cached else self.get_demo()
        base.update({k: v for k, v in kwargs.items() if v is not None})
        base["source"] = "manual_override"
        base["timestamp"] = datetime.datetime.utcnow().isoformat()
        self.cached = base
        return base

    def _log(self, weather: dict):
        os.makedirs(os.path.dirname(settings.log_file), exist_ok=True)
        with open(settings.log_file, "a", newline="") as f:
            writer = csv.writer(f)
            if f.tell() == 0:
                writer.writerow(["timestamp", "wind_speed", "wind_direction", "temperature", "humidity"])
            writer.writerow([
                weather["timestamp"],
                weather["wind_speed"],
                weather["wind_direction"],
                weather["temperature"],
                weather["humidity"],
            ])


weather_service = WeatherService()
