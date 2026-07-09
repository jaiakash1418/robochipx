import numpy as np
from config import settings
from models.fire_sense_net import FireSenseNet, FUEL_CHANNEL_IDXS, WEATHER_CHANNEL_IDXS


class UNetInference:
    def __init__(self):
        self.model = None
        self.device = None
        self.model_type = settings.model_type
        self._load_model()

    def _load_model(self):
        if self.model_type == "fire_sense_net":
            self._load_fire_sense_net()
        else:
            self._load_unet()

    def _load_unet(self):
        try:
            import torch
            import segmentation_models_pytorch as smp
            self.device = torch.device(settings.device)
            self.model = smp.Unet(
                encoder_name="resnet34",
                encoder_weights=None,
                in_channels=settings.input_channels,
                classes=1,
            )
            checkpoint = torch.load(settings.model_path, map_location=self.device)
            self.model.load_state_dict(checkpoint)
            self.model.to(self.device)
            self.model.eval()
        except (FileNotFoundError, ImportError):
            self.model = None

    def _load_fire_sense_net(self):
        try:
            import torch
            self.device = torch.device(settings.device)
            self.model = FireSenseNet(fuel_channels=4, weather_channels=8)
            checkpoint = torch.load(settings.fire_sense_net_path, map_location=self.device, weights_only=True)
            if "model_state_dict" in checkpoint:
                self.model.load_state_dict(checkpoint["model_state_dict"])
            else:
                self.model.load_state_dict(checkpoint)
            self.model.to(self.device)
            self.model.eval()
        except (FileNotFoundError, ImportError):
            self.model = None

    def predict(self, input_tensor: np.ndarray, fuel_map: np.ndarray | None = None) -> np.ndarray:
        if self.model is None:
            return self._fallback_predict(input_tensor, fuel_map)
        if self.model_type == "fire_sense_net":
            return self._fire_sense_predict(input_tensor)
        return self._model_predict(input_tensor)

    def _model_predict(self, input_tensor: np.ndarray) -> np.ndarray:
        import torch
        with torch.no_grad():
            tensor = torch.from_numpy(input_tensor).unsqueeze(0).float().to(self.device)
            output = torch.sigmoid(self.model(tensor))
            return output.squeeze().cpu().numpy()

    def _fire_sense_predict(self, input_tensor: np.ndarray) -> np.ndarray:
        import torch
        fuel = torch.from_numpy(input_tensor[FUEL_CHANNEL_IDXS]).unsqueeze(0).float().to(self.device)
        weather = torch.from_numpy(input_tensor[WEATHER_CHANNEL_IDXS]).unsqueeze(0).float().to(self.device)
        with torch.no_grad():
            output = torch.sigmoid(self.model(fuel, weather))
            return output.squeeze().cpu().numpy()

    def _fallback_predict(self, input_tensor: np.ndarray, fuel_map: np.ndarray | None = None) -> np.ndarray:
        from scipy.ndimage import binary_dilation, label

        h, w = input_tensor.shape[1], input_tensor.shape[2]

        fire_mask = input_tensor[0]
        burning = fire_mask == 1
        burned = fire_mask == 2

        wind_speed_norm = float(input_tensor[2].mean()) if input_tensor.shape[0] > 2 else 0.0
        wind_dir_norm = float(input_tensor[3].mean()) if input_tensor.shape[0] > 3 else 0.0

        wind_speed = wind_speed_norm * 50.0
        wind_dir_deg = wind_dir_norm * 360.0

        if fuel_map is None:
            fuel_map = np.zeros((h, w), dtype=np.int8)

        if not burning.any():
            return np.zeros((h, w))

        kernel = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        spread_zone = binary_dilation(burning, structure=kernel)
        spread_zone = spread_zone & ~burned & (fire_mask != 2)

        water = fuel_map == 2
        spread_zone = spread_zone & ~water

        fuel_flammability = np.zeros_like(fuel_map, dtype=np.float32)
        fuel_flammability[fuel_map == 1] = 1.0
        fuel_flammability[fuel_map == 0] = 0.85
        fuel_flammability[fuel_map == 3] = 0.6
        fuel_flammability[fuel_map == 4] = 0.15
        fuel_flammability[fuel_map == 5] = 0.05
        fuel_flammability[fuel_map == 2] = 0.0

        wind_factor = 1.0 + min(wind_speed / 50.0, 2.0)
        base_prob = fuel_flammability * 0.5 * wind_factor
        prob = np.where(spread_zone, base_prob, 0.0)

        if wind_speed > 1.0:
            wind_rad = np.radians(wind_dir_deg)
            burning_y, burning_x = np.where(burning)
            cx, cy = burning_x.mean(), burning_y.mean()

            dx_wind = -np.sin(wind_rad)
            dy_wind = np.cos(wind_rad)

            y_grid, x_grid = np.ogrid[:h, :w]
            downwind = (x_grid - cx) * dx_wind + (y_grid - cy) * dy_wind
            wind_bias = np.clip(downwind / max(w, h) * 3.0, 0, 1)
            wind_boost = wind_bias * wind_speed * 0.02
            prob = np.where(spread_zone, np.clip(prob + wind_boost, 0, 0.95), 0.0)

        _, num_features = label(burning)
        if num_features > 0:
            prob = np.clip(prob * (1.0 + np.log2(num_features + 1) * 0.05), 0, 0.95)

        return prob


unet_model = UNetInference()
