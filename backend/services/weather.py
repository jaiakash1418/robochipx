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
            "current": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m,precipitation,soil_moisture_0_to_7cm",
            "daily": "temperature_2m_min,precipitation_sum",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.open_meteo_url, params=params, timeout=10)
            resp.raise_for_status()
            json_data = resp.json()
            current = json_data["current"]
            daily = json_data.get("daily", {})

        weather = {
            "wind_speed": current["wind_speed_10m"],
            "wind_direction": current["wind_direction_10m"],
            "temperature": current["temperature_2m"],
            "humidity": current["relative_humidity_2m"],
            "precipitation": current.get("precipitation", 0.0),
            "soil_moisture": current.get("soil_moisture_0_to_7cm", 0.0),
            "temperature_min": daily.get("temperature_2m_min", [current["temperature_2m"]])[0] if daily.get("temperature_2m_min") else current["temperature_2m"],
            "precipitation_sum": daily.get("precipitation_sum", [0.0])[0] if daily.get("precipitation_sum") else 0.0,
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
            "precipitation": 0.0,
            "soil_moisture": 0.3,
            "temperature_min": 15.0,
            "precipitation_sum": 0.0,
            "source": "demo",
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }

    async def get_current(self, lat: float = None, lon: float = None) -> dict:
        if self.use_live:
            try:
                return await self.fetch_live(lat, lon)
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
