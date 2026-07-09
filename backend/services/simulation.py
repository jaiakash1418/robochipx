import numpy as np
from core.grid import Grid
from core.normalization import Normalizer
from core.alerts import check_alerts
from models.unet import unet_model
from services.weather import weather_service


class SimulationService:
    def __init__(self, grid_size: int = 64):
        self.grid = Grid(size=grid_size)
        self.normalizer = Normalizer()
        self.running: bool = False

    def load_fuel_map(self, path: str):
        self.grid.load_fuel_map(path)

    async def tick(self) -> dict:
        if not self.running:
            return self._build_response()

        weather = await weather_service.get_current()
        input_tensor = self.normalizer.build_input_tensor(
            self.grid.get_grid_array(), weather
        )
        prob_map = unet_model.predict(input_tensor, fuel_map=self.grid.fuel_map)

        self._apply_spread(prob_map)
        self.grid.step += 1

        return self._build_response()

    def _apply_spread(self, prob_map: np.ndarray):
        from scipy.ndimage import binary_dilation

        threshold = 0.4

        burning = self.grid.fire_mask == 1
        if not burning.any():
            return

        kernel = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        neighbors = binary_dilation(burning, structure=kernel)

        water = self.grid.fuel_map == 2
        new_fire = (prob_map >= threshold) & (self.grid.fire_mask == 0) & neighbors & ~water

        self.grid.fire_mask[burning] = 2
        self.grid.fire_mask[new_fire] = 1

    def ignite(self, x: int, y: int) -> bool:
        return self.grid.ignite(x, y)

    def reset(self):
        self.grid.reset()
        self.running = False

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