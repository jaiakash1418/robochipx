import os
from pydantic_settings import BaseSettings

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


class Settings(BaseSettings):
    app_name: str = "Wildfire Spread Predictor"
    app_version: str = "1.0.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000

    grid_size: int = 64
    cell_size_meters: int = 1739

    model_type: str = "fire_sense_net"
    model_path: str = os.path.join(_BACKEND_DIR, "models", "unet_checkpoint.pt")
    fire_sense_net_path: str = os.path.join(_BACKEND_DIR, "models", "firesense_best.pth")
    device: str = "cpu"
    input_channels: int = 12

    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    default_lat: float = 39.8283
    default_lon: float = -98.5795

    log_file: str = os.path.join(_BACKEND_DIR, "logs", "weather_log.csv")
    fuel_map_path: str = os.path.join(_BACKEND_DIR, "data", "fuel_map.json")

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    firms_api_key: str = ""
    hf_token: str = ""

    landcover_model_dir: str = os.path.join(_BACKEND_DIR, "models", "landcover_onnx")

    open_topography_url: str = "https://portal.opentopography.org/API/globaldem"
    open_topography_api_key: str = ""

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
