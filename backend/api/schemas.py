from pydantic import BaseModel
from typing import Optional


class IgniteRequest(BaseModel):
    x: int
    y: int


class TickResponse(BaseModel):
    step: int
    new_burned_cells: list[dict]
    stats: dict
    alerts: list[dict]


class StateResponse(BaseModel):
    step: int
    grid: list[list[int]]
    fire_mask: list[list[int]]
    stats: dict
    weather: dict
    alerts: list[dict]


class WeatherOverride(BaseModel):
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None


class WeatherResponse(BaseModel):
    wind_speed: float
    wind_direction: float
    temperature: float
    humidity: float
    source: str
    timestamp: str


class LLMQueryRequest(BaseModel):
    query: str
    context: Optional[dict] = None


class LLMQueryResponse(BaseModel):
    answer: str


class AlertResponse(BaseModel):
    alerts: list[dict]
