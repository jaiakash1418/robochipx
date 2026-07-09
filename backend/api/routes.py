import httpx
from fastapi import APIRouter, HTTPException
from api.schemas import (
    IgniteRequest,
    StateResponse,
    WeatherOverride,
    LLMQueryRequest,
    LLMQueryResponse,
)
from services.simulation import simulation
from services.weather import weather_service
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


@router.get("/weather/live")
async def get_live_weather():
    try:
        weather = await weather_service.fetch_live()
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
    if lat is not None and lon is not None:
        try:
            weather = await weather_service.fetch_live(lat, lon)
            return weather
        except Exception:
            return weather_service.get_demo()
    weather = await weather_service.get_current()
    return weather


@router.get("/fires/live")
async def get_live_fires():
    from datetime import datetime, timedelta, timezone
    eonet_url = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(eonet_url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return {"fires": [], "count": 0}
    fires = []
    for ev in data.get("events", []):
        geo = ev.get("geometry", [])
        if not geo:
            continue
        latest = geo[-1]
        coords = latest.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        latest_date = latest.get("date")
        if latest_date:
            try:
                dt = datetime.fromisoformat(latest_date.replace("Z", "+00:00"))
                if dt < cutoff:
                    continue
            except ValueError:
                pass
        earliest = geo[0]
        fires.append({
            "id": ev["id"],
            "title": ev.get("title", "Unknown"),
            "description": ev.get("description"),
            "closed": ev.get("closed"),
            "latitude": coords[1],
            "longitude": coords[0],
            "magnitude": latest.get("magnitudeValue"),
            "magnitude_unit": latest.get("magnitudeUnit") or "acres",
            "date": latest_date or "",
            "first_detected": earliest.get("date") or latest_date or "",
            "sources": ev.get("sources") or [],
        })
    fires.sort(key=lambda f: f.get("date") or "", reverse=True)
    trimmed = fires[:200]
    return {"fires": trimmed, "count": len(trimmed)}


@router.get("/alerts")
async def get_alerts():
    alerts = check_alerts(
        simulation.grid.fire_mask.tolist(),
        simulation.grid.towns,
        simulation.grid.size,
    )
    return {"alerts": alerts}


@router.post("/llm/query", response_model=LLMQueryResponse)
async def llm_query(req: LLMQueryRequest):
    state = simulation._build_response()
    prompt = _build_llm_prompt(req.query, state)

    try:
        answer = await _call_ollama(prompt)
    except Exception:
        try:
            answer = await _call_openai(prompt)
        except Exception:
            answer = _fallback_response(req.query, state)

    return {"answer": answer}


def _build_llm_prompt(query: str, state: dict) -> str:
    return f"""
You are a wildfire decision-support assistant.

Current simulation state:
- Step: {state['step']}
- Active fire fronts: {state['stats']['active_fronts']}
- Area burned: {state['stats']['percentage_burned']}%
- Active alerts: {len(state['alerts'])}
- Simulation running: {state['running']}

User query: {query}

Provide a concise, actionable response based on this data.
"""


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


def _fallback_response(query: str, state: dict) -> str:
    alerts_text = ", ".join(a["message"] for a in state["alerts"]) if state["alerts"] else "No active alerts."
    return (
        f"Current simulation at step {state['step']}: "
        f"{state['stats']['percentage_burned']}% area burned, "
        f"{state['stats']['active_fronts']} active fire fronts. "
        f"{alerts_text} "
        f"The fire is {'spreading' if state['running'] else 'paused'}."
    )
