import numpy as np


class Normalizer:
    def __init__(self):
        self.weather_params = {
            "wind_speed": {"min": 0, "max": 50},
            "wind_direction": {"min": 0, "max": 360},
            "temperature": {"min": -20, "max": 50},
            "humidity": {"min": 0, "max": 100},
        }

    def min_max_scale(self, value: float, key: str) -> float:
        p = self.weather_params[key]
        return (value - p["min"]) / (p["max"] - p["min"])

    def normalize_weather(self, weather: dict) -> dict:
        return {
            "wind_speed": self.min_max_scale(weather["wind_speed"], "wind_speed"),
            "wind_direction": self.min_max_scale(weather["wind_direction"], "wind_direction"),
            "temperature": self.min_max_scale(weather["temperature"], "temperature"),
            "humidity": self.min_max_scale(weather["humidity"], "humidity"),
        }

    def build_input_tensor(self, grid: np.ndarray, weather: dict) -> np.ndarray:
        normalized = self.normalize_weather(weather)
        h, w = grid.shape[:2]

        fuel_map = grid[:, :, 0].astype(np.float32)
        fire_mask = grid[:, :, 1].astype(np.float32)

        channels = [np.zeros((h, w), dtype=np.float32) for _ in range(12)]

        channels[0] = fire_mask
        channels[1] = np.full((h, w), normalized["temperature"])
        channels[2] = np.full((h, w), normalized["wind_speed"])
        channels[3] = np.full((h, w), normalized["wind_direction"])
        channels[4] = np.full((h, w), normalized["humidity"])

        return np.stack(channels, axis=0)