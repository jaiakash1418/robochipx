import numpy as np
from core.grid import Grid
from core.normalization import Normalizer
from core.alerts import check_alerts
from models.unet import unet_model
from services.weather import weather_service
from services.environment import environment_service


class SimulationService:
    def __init__(self, grid_size: int = 64):
        self.grid = Grid(size=grid_size)
        self.normalizer = Normalizer()
        self.running: bool = False
        self.custom_lat: float | None = None
        self.custom_lon: float | None = None
        self.initial_zone: tuple[int, int, int, int] | None = None

    def set_custom_location(self, lat: float | None, lon: float | None):
        self.custom_lat = lat
        self.custom_lon = lon

    def set_initial_zone(self, x1: int, y1: int, x2: int, y2: int):
        self.initial_zone = (x1, y1, x2, y2)

    def clear_initial_zone(self):
        self.initial_zone = None

    def load_fuel_map(self, path: str):
        self.grid.load_fuel_map(path)

    async def tick(self) -> dict:
        if not self.running:
            return self._build_response()

        if self.initial_zone:
            x1, y1, x2, y2 = self.initial_zone
            for row in range(y1, y2 + 1):
                for col in range(x1, x2 + 1):
                    self.grid.ignite(col, row)
            self.initial_zone = None

        weather = await weather_service.get_current(self.custom_lat, self.custom_lon)
        env = environment_service.get_spatial_data(self.grid.fuel_map, self.grid.towns, weather)
        input_tensor = self.normalizer.build_input_tensor(
            self.grid.get_grid_array(), weather, env
        )
        prob_map = unet_model.predict(input_tensor, fuel_map=self.grid.fuel_map)

        self._apply_spread(prob_map)
        self.grid.step += 1

        return self._build_response()

    def _apply_spread(self, prob_map: np.ndarray):
        from scipy.ndimage import binary_dilation

        weather = weather_service.cached if weather_service.cached else weather_service.get_demo()
        wind_speed = weather.get("wind_speed", 10.0)
        wind_dir = weather.get("wind_direction", 0.0)
        humidity = weather.get("humidity", 50.0)

        p_max = float(prob_map.max())
        base_threshold = max(0.25, p_max * 0.65) if p_max > 0.1 else 0.5
        threshold = base_threshold - (wind_speed / 100.0) + (1.0 - humidity / 100.0) * 0.2
        threshold = float(np.clip(threshold, 0.15, 0.6))

        burning = self.grid.fire_mask == 1
        if not burning.any():
            return

        rad = np.radians(90 - wind_dir)
        stretch = 1.0 + wind_speed / 30.0
        cos_a, sin_a = np.cos(rad), np.sin(rad)

        kernel_size = 3
        kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                if dx == 0 and dy == 0:
                    kernel[dy + 1, dx + 1] = 1.0
                    continue
                rx = dx * cos_a - dy * sin_a
                ry = dx * sin_a + dy * cos_a
                rx /= stretch
                dist = np.sqrt(rx ** 2 + ry ** 2)
                kernel[dy + 1, dx + 1] = max(0, 1.0 - dist * 0.6)

        structure = (kernel > 0.3).astype(int)
        kernel = kernel / kernel.sum()
        neighbors = binary_dilation(burning, structure=structure)

        water = self.grid.fuel_map == 2
        fuel_flammability = np.array([1.0, 1.3, 0.0, 0.8, 0.3, 0.1], dtype=np.float32)
        flammability = fuel_flammability[self.grid.fuel_map.astype(int)]

        adj_threshold = threshold / np.clip(flammability, 0.1, 1.5)

        new_fire = (prob_map >= adj_threshold) & (self.grid.fire_mask == 0) & neighbors & ~water

        if burning.any() and not new_fire.any():
            candidates = neighbors & ~water & (self.grid.fire_mask == 0)
            if candidates.any():
                best = np.unravel_index(np.argmax(prob_map * candidates), prob_map.shape)
                new_fire[best] = True

        self.grid.fire_mask[burning] = 2
        self.grid.fire_mask[new_fire] = 1

        if not (self.grid.fire_mask == 1).any():
            self.running = False

    def ignite(self, x: int, y: int) -> bool:
        return self.grid.ignite(x, y)

    def clear(self, x: int, y: int) -> bool:
        return self.grid.clear(x, y)

    def reset(self):
        self.grid.reset()
        self.running = False
        self.initial_zone = None

    def _build_response(self) -> dict:
        stats = self.grid.get_stats()
        alerts = check_alerts(
            self.grid.fire_mask.tolist(),
            self.grid.towns,
            self.grid.size,
        )

        return {
            "step": self.grid.step,
            "fire_mask": self.grid.fire_mask.tolist(),
            "fuel_map": self.grid.fuel_map.tolist(),
            "towns": self.grid.towns,
            "stats": stats,
            "alerts": alerts,
            "running": self.running,
        }


simulation = SimulationService()