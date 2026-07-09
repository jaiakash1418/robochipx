import json
import numpy as np
from pathlib import Path

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


class Grid:
    def __init__(self, size: int = 64):
        self.size = size
        self.fuel_map: np.ndarray | None = None
        self.fire_mask: np.ndarray | None = None
        self.step: int = 0
        self.towns: list[dict] = []
        self._init_empty()

    def _init_empty(self):
        self.fuel_map = np.zeros((self.size, self.size), dtype=np.int8)
        self.fire_mask = np.zeros((self.size, self.size), dtype=np.int8)
        self.towns = []

    def load_fuel_map(self, path: str):
        p = Path(path)
        if p.exists():
            with open(p) as f:
                data = json.load(f)
            self.size = data.get("size", self.size)
            self.fuel_map = np.array(data["fuel_map"], dtype=np.int8)
            self.towns = data.get("towns", [])
            self.fire_mask = np.zeros((self.size, self.size), dtype=np.int8)
        else:
            self._generate_synthetic()

    def _generate_synthetic(self):
        np.random.seed(42)
        rng = np.random.default_rng(42)

        for i in range(self.size):
            for j in range(self.size):
                r = np.random.random()
                if r < 0.5:
                    self.fuel_map[i, j] = FUEL_TYPES["forest"]
                elif r < 0.8:
                    self.fuel_map[i, j] = FUEL_TYPES["grass"]
                elif r < 0.85:
                    self.fuel_map[i, j] = FUEL_TYPES["water"]
                elif r < 0.95:
                    self.fuel_map[i, j] = FUEL_TYPES["town"]
                    self.towns.append({"x": int(i), "y": int(j), "name": f"Town {len(self.towns) + 1}"})
                else:
                    self.fuel_map[i, j] = FUEL_TYPES["road"]

    def ignite(self, x: int, y: int) -> bool:
        if 0 <= x < self.size and 0 <= y < self.size:
            if self.fire_mask[x, y] == CELL_STATES["unburned"]:
                self.fire_mask[x, y] = CELL_STATES["burning"]
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
