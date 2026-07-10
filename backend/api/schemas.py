from pydantic import BaseModel
from typing import Optional


class IgniteRequest(BaseModel):
    x: int
    y: int


class IgniteAreaRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class StatsResponse(BaseModel):
    total_cells: int
    burning: int
    burned: int
    percentage_burned: float
    active_fronts: int


class SimulationState(BaseModel):
    step: int
    fire_mask: list[list[int]]
    fuel_map: list[list[int]]
    towns: list[dict]
    stats: StatsResponse
    alerts: list[dict]
    running: bool


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


class CellCoordinate(BaseModel):
    x: int
    y: int


class BatchIgniteRequest(BaseModel):
    cells: list[CellCoordinate]


class ZoneRequest(BaseModel):
    x1: int | None = None
    y1: int | None = None
    x2: int | None = None
    y2: int | None = None


class EvacuationRouteRequest(BaseModel):
    start_x: int
    start_y: int
    goal_x: int
    goal_y: int


class EvacuationRouteResponse(BaseModel):
    path: list[dict]
    found: bool


class DispatcherStatusResponse(BaseModel):
    dispatches: list[dict]
    active_fires: int
    total_dispatched: int
