import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException
from api.schemas import (
    IgniteRequest,
    IgniteAreaRequest,
    WeatherOverride,
    LLMQueryRequest,
    LLMQueryResponse,
    BatchIgniteRequest,
    ZoneRequest,
)
from services.simulation import simulation
from services.weather import weather_service
from services.firms import firms_service
from services.rag import build_rag_context
from core.alerts import check_alerts
from core.grid import CELL_STATES
from config import settings

router = APIRouter(prefix="/api")


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "wildfire-spread-predictor",
        "grid_size": simulation.grid.size,
        "running": simulation.running,
    }


@router.post("/simulation/ignite")
async def ignite(req: IgniteRequest):
    success = simulation.ignite(req.x, req.y)
    if not success:
        raise HTTPException(400, "Invalid cell coordinates or cell already burning")
    simulation.running = True
    return {"success": True, "message": f"Ignited at ({req.x}, {req.y})"}


@router.post("/simulation/ignite-area")
async def ignite_area(req: IgniteAreaRequest):
    ignited = 0
    for row in range(req.y1, req.y2 + 1):
        for col in range(req.x1, req.x2 + 1):
            if simulation.ignite(col, row):
                ignited += 1
    if ignited > 0:
        simulation.running = True
    return {"success": True, "ignited": ignited}


@router.post("/ignite/batch")
async def ignite_batch(req: BatchIgniteRequest):
    ignited = 0
    for cell in req.cells:
        if simulation.ignite(cell.x, cell.y):
            ignited += 1
    if ignited > 0:
        simulation.running = True
    return {"success": True, "ignited": ignited}


@router.post("/clear/batch")
async def clear_batch(req: BatchIgniteRequest):
    cleared = 0
    for cell in req.cells:
        if simulation.clear(cell.x, cell.y):
            cleared += 1
    return {"success": True, "cleared": cleared}


@router.post("/zone/set")
async def set_zone(req: ZoneRequest):
    if req.x1 is None or req.y1 is None or req.x2 is None or req.y2 is None:
        simulation.clear_initial_zone()
        return {"success": True, "zone": None}
    simulation.set_initial_zone(req.x1, req.y1, req.x2, req.y2)
    return {"success": True, "zone": {"x1": req.x1, "y1": req.y1, "x2": req.x2, "y2": req.y2}}


@router.post("/simulation/tick")
async def tick():
    result = await simulation.tick()
    return result


@router.get("/simulation/state")
async def get_state():
    return simulation._build_response()


@router.post("/simulation/reset")
async def reset():
    simulation.reset()
    return {"success": True, "message": "Simulation reset"}


@router.get("/simulation/stats")
async def get_stats():
    return simulation.grid.get_stats()


@router.post("/location/set")
async def set_location(lat: Optional[float] = None, lon: Optional[float] = None):
    await simulation.set_custom_location(lat, lon)
    return {"success": True, "lat": lat, "lon": lon, "state": simulation._build_response()}


@router.get("/weather/live")
async def get_live_weather(lat: float = None, lon: float = None):
    try:
        weather = await weather_service.fetch_live(lat, lon)
        return weather
    except Exception:
        return weather_service.get_demo()


@router.post("/weather/override")
async def override_weather(params: WeatherOverride):
    weather = weather_service.override(
        wind_speed=params.wind_speed,
        wind_direction=params.wind_direction,
        temperature=params.temperature,
        humidity=params.humidity,
    )
    return weather


@router.get("/weather")
async def get_weather(lat: float = None, lon: float = None):
    weather = await weather_service.get_current(lat, lon)
    return weather


@router.get("/fires/active")
async def get_active_fires(lat: float = None, lon: float = None, radius: float = 0.5):
    lat = lat or settings.default_lat
    lon = lon or settings.default_lon
    try:
        fires = await firms_service.nearest_fires(lat, lon, radius)
        return {"fires": fires, "source": "NASA FIRMS", "api_key_configured": firms_service.is_available()}
    except Exception as e:
        return {"fires": [], "source": "NASA FIRMS", "api_key_configured": firms_service.is_available(), "error": str(e)}


@router.post("/demo/run")
async def demo_run(ticks: int = 10, lat: float = None, lon: float = None):
    simulation.reset()
    lat = lat or settings.default_lat
    lon = lon or settings.default_lon
    await simulation.set_custom_location(lat, lon)

    # Fetch live weather
    try:
        await weather_service.fetch_live(lat, lon)
    except Exception:
        pass

    # Try FIRMS auto-ignite; fall back to grid center
    try:
        fires = await firms_service.nearest_fires(lat, lon, radius_deg=0.5, max_results=5)
    except Exception:
        fires = []

    if fires:
        for f in fires:
            gx = int((f["lon"] - (lon - 0.5)) / 1.0 * 64)
            gy = int((lat + 0.5 - f["lat"]) / 1.0 * 64)
            gx = max(0, min(63, gx))
            gy = max(0, min(63, gy))
            simulation.grid.ignite(gx, gy)
    else:
        simulation.grid.ignite(32, 32)

    simulation.running = True
    steps = []
    for _ in range(ticks):
        result = await simulation.tick()
        steps.append({
            "step": result["step"],
            "burning": result["stats"]["burning"],
            "burned": result["stats"]["burned"],
            "percentage_burned": result["stats"]["percentage_burned"],
            "active_fronts": result["stats"]["active_fronts"],
        })
    simulation.running = False

    return {
        "location": {"lat": lat, "lon": lon},
        "firms_ignited": len(fires),
        "ticks": ticks,
        "final_state": simulation._build_response(),
        "steps": steps,
    }


@router.get("/alerts")
async def get_alerts():
    alerts = check_alerts(
        simulation.grid.fire_mask.tolist(),
        simulation.grid.towns,
        simulation.grid.size,
    )
    return {"alerts": alerts}


@router.get("/model/evaluation")
async def get_evaluation():
    import json
    from pathlib import Path
    result_path = Path("models/evaluation_results/latest_eval.json")
    if result_path.exists():
        return json.loads(result_path.read_text())
    return {"message": "No evaluation results yet. Run POST /api/model/evaluate first."}


@router.post("/model/evaluate")
async def model_evaluate():
    try:
        from evaluate import evaluate as run_eval
        result = run_eval()
        if "error" in result:
            raise HTTPException(500, result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Evaluation failed: {str(e)}")


@router.post("/llm/query", response_model=LLMQueryResponse)
async def llm_query(req: LLMQueryRequest):
    state = simulation._build_response()
    weather_state = await weather_service.get_current()
    state["weather"] = weather_state
    state["location"] = req.context if req.context else {}
    rag_context = build_rag_context(state)
    prompt = _build_llm_prompt(req.query, rag_context)

    try:
        answer = await _call_ollama(prompt)
    except Exception:
        try:
            answer = await _call_openai(prompt)
        except Exception:
            answer = _fallback_response(req.query, rag_context)

    return {"answer": answer}


def _build_llm_prompt(query: str, context: str) -> str:
    return f"""You are a wildfire decision-support assistant. Use the simulation data below to answer the user's question. Be concise, specific, and cite data where relevant.

{context}

USER QUESTION: {query}

Provide a clear, actionable response based on the data above."""


async def _call_ollama(prompt: str) -> str:
    url = f"{settings.ollama_base_url}/v1/chat/completions"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json={
                "model": settings.ollama_model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"num_predict": 300},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _call_openai(prompt: str) -> str:
    import os

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("No OpenAI API key configured")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def _fallback_response(query: str, context: str) -> str:
    return f"Here is the current simulation data:\n\n{context}\n\nI couldn't reach the AI model, but based on the data above, please analyze the situation yourself. Your question was: {query}"
