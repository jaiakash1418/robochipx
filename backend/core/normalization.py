import numpy as np


class Normalizer:
    def __init__(self):
        self.weather_params = {
            "wind_speed": {"min": 0, "max": 50},
            "wind_direction": {"min": 0, "max": 360},
            "temperature": {"min": -20, "max": 50},
            "humidity": {"min": 0, "max": 100},
        }
        self.env_params = {
            "elevation": {"min": 0, "max": 1500},
            "pdsi": {"min": -4, "max": 4},
            "ndvi": {"min": -0.2, "max": 1.0},
            "population": {"min": 0, "max": 300},
            "precipitation": {"min": 0, "max": 50},
            "erc": {"min": 0, "max": 1.0},
            "temperature_min": {"min": -20, "max": 50},
        }

    def min_max_scale(self, value: float, key: str, param_set: dict) -> float:
        p = param_set[key]
        return (value - p["min"]) / (p["max"] - p["min"])

    def scale_array(self, arr: np.ndarray, key: str, param_set: dict) -> np.ndarray:
        p = param_set[key]
        return (arr - p["min"]) / (p["max"] - p["min"])

    def normalize_weather(self, weather: dict) -> dict:
        return {
            "wind_speed": self.min_max_scale(weather["wind_speed"], "wind_speed", self.weather_params),
            "wind_direction": self.min_max_scale(weather["wind_direction"], "wind_direction", self.weather_params),
            "temperature": self.min_max_scale(weather["temperature"], "temperature", self.weather_params),
            "humidity": self.min_max_scale(weather["humidity"], "humidity", self.weather_params),
        }

    def build_input_tensor(self, grid: np.ndarray, weather: dict, env: dict = None) -> np.ndarray:
        normalized = self.normalize_weather(weather)
        h, w = grid.shape[:2]

        fire_mask = grid[:, :, 1].astype(np.float32)

        channels = [np.zeros((h, w), dtype=np.float32) for _ in range(12)]

        channels[0] = fire_mask
        channels[1] = np.full((h, w), normalized["temperature"])
        channels[2] = np.full((h, w), normalized["wind_speed"])
        channels[3] = np.full((h, w), normalized["wind_direction"])
        channels[4] = np.full((h, w), normalized["humidity"])

        if env is not None:
            channels[5] = self.scale_array(env["elevation"], "elevation", self.env_params)
            channels[6] = self.scale_array(env["pdsi"], "pdsi", self.env_params)
            channels[7] = self.scale_array(env["ndvi"], "ndvi", self.env_params)
            channels[8] = self.scale_array(env["population"], "population", self.env_params)
            channels[9] = self.scale_array(env["precipitation"], "precipitation", self.env_params)
            channels[10] = self.scale_array(env["erc"], "erc", self.env_params)
            channels[11] = self.scale_array(env["temperature_min"], "temperature_min", self.env_params)

        return np.stack(channels, axis=0)