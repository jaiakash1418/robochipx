import numpy as np
from core.grid import FUEL_TYPES

FUEL_TO_NDVI = {
    FUEL_TYPES["forest"]: 0.75,
    FUEL_TYPES["grass"]: 0.50,
    FUEL_TYPES["water"]: -0.10,
    FUEL_TYPES["town"]: 0.20,
    FUEL_TYPES["road"]: 0.15,
    FUEL_TYPES["firebreak"]: 0.30,
}

FUEL_TO_ELEVATION = {
    FUEL_TYPES["forest"]: 500.0,
    FUEL_TYPES["grass"]: 300.0,
    FUEL_TYPES["water"]: 0.0,
    FUEL_TYPES["town"]: 200.0,
    FUEL_TYPES["road"]: 250.0,
    FUEL_TYPES["firebreak"]: 350.0,
}


class EnvironmentService:
    def __init__(self):
        self._ndvi_map: np.ndarray | None = None
        self._elevation_map: np.ndarray | None = None
        self._population_map: np.ndarray | None = None
        self._fuel_hash: int | None = None

    def _fuel_hash_fn(self, fuel_map: np.ndarray) -> int:
        return hash(fuel_map.tobytes())

    def compute_ndvi(self, fuel_map: np.ndarray) -> np.ndarray:
        h, w = fuel_map.shape
        ndvi = np.zeros((h, w), dtype=np.float32)
        for fuel_type, val in FUEL_TO_NDVI.items():
            ndvi[fuel_map == fuel_type] = val
        noise = np.random.default_rng(42).uniform(-0.05, 0.05, (h, w)).astype(np.float32)
        return np.clip(ndvi + noise, -0.2, 1.0)

    def compute_elevation(self, fuel_map: np.ndarray) -> np.ndarray:
        h, w = fuel_map.shape
        elev = np.zeros((h, w), dtype=np.float32)
        for fuel_type, val in FUEL_TO_ELEVATION.items():
            elev[fuel_map == fuel_type] = val
        smooth = np.random.default_rng(42).uniform(-20, 20, (h, w)).astype(np.float32)
        return np.clip(elev + smooth, 0, 1500)

    def compute_population(self, fuel_map: np.ndarray, towns: list[dict]) -> np.ndarray:
        h, w = fuel_map.shape
        pop = np.zeros((h, w), dtype=np.float32)
        for t in towns:
            tx, ty = t["x"], t["y"]
            y_grid, x_grid = np.ogrid[:h, :w]
            dist2 = (x_grid - tx) ** 2 + (y_grid - ty) ** 2
            pop += np.exp(-dist2 / 200.0) * 100.0
        urban = (fuel_map == FUEL_TYPES["town"]) | (fuel_map == FUEL_TYPES["road"])
        pop[urban] = np.maximum(pop[urban], 150.0)
        return pop

    def get_spatial_data(self, fuel_map: np.ndarray, towns: list[dict], weather: dict) -> dict:
        fh = self._fuel_hash_fn(fuel_map)
        if fh != self._fuel_hash:
            self._ndvi_map = self.compute_ndvi(fuel_map)
            self._elevation_map = self.compute_elevation(fuel_map)
            self._population_map = self.compute_population(fuel_map, towns)
            self._fuel_hash = fh

        sm = weather.get("soil_moisture")
        if sm is None:
            sm = 0.3
        pdsi_const = 2.0 * sm - 1.0
        h, w = fuel_map.shape
        pdsi = np.full((h, w), pdsi_const, dtype=np.float32)

        precip = weather.get("precipitation")
        if precip is None:
            precip = 0.0
        precip_map = np.full((h, w), precip, dtype=np.float32)

        ws = weather.get("wind_speed")
        if ws is None:
            ws = 10.0
        temp = weather.get("temperature")
        if temp is None:
            temp = 20.0
        hum = weather.get("humidity")
        if hum is None:
            hum = 50.0
        pdsi_val = pdsi_const
        erc = self._compute_erc(ws, temp, hum, pdsi_val, precip)
        erc_map = np.full((h, w), erc, dtype=np.float32)

        tmin = weather.get("temperature_min")
        if tmin is None:
            tmin = temp - 5.0
        tmin_map = np.full((h, w), tmin, dtype=np.float32)

        return {
            "elevation": self._elevation_map,
            "pdsi": pdsi,
            "ndvi": self._ndvi_map,
            "population": self._population_map,
            "precipitation": precip_map,
            "erc": erc_map,
            "temperature_min": tmin_map,
        }

    def _compute_erc(self, wind_speed: float, temperature: float, humidity: float, pdsi: float, precipitation: float) -> float:
        temp_factor = max(0, (temperature - 5.0) / 35.0)
        hum_factor = 1.0 - humidity / 100.0
        wind_factor = min(wind_speed / 30.0, 1.5)
        drought_factor = max(0, (pdsi + 3.0) / 6.0)
        precip_reduction = min(precipitation / 10.0, 1.0)
        erc = (temp_factor * 0.3 + hum_factor * 0.3 + wind_factor * 0.2 + drought_factor * 0.2) * (1.0 - precip_reduction * 0.5)
        return float(np.clip(erc, 0.0, 1.0))


environment_service = EnvironmentService()
