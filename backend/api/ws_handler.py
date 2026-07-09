import json
import asyncio
import httpx
from fastapi import WebSocket, WebSocketDisconnect
from api.routes import _build_llm_prompt
from services.simulation import simulation
from services.weather import weather_service
from services.rag import build_rag_context
from config import settings


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        state = simulation._build_response()
        weather = await weather_service.get_current()
        await websocket.send_json({"type": "state_sync", **state, "weather": weather})

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.active_connections.remove(conn)

    async def send(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            self.disconnect(websocket)


manager = ConnectionManager()


async def handle_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            await _route_message(websocket, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        await manager.send(websocket, {"type": "error", "message": str(e)})
        manager.disconnect(websocket)


async def _route_message(websocket: WebSocket, data: dict):
    msg_type = data.get("type", "")

    if msg_type == "ping":
        await manager.send(websocket, {"type": "pong"})

    elif msg_type == "tick":
        result = await simulation.tick()
        await manager.broadcast({"type": "tick_result", **result})

    elif msg_type == "ignite":
        success = simulation.ignite(int(data["x"]), int(data["y"]))
        if success:
            simulation.running = True
        state = simulation._build_response()
        await manager.broadcast({"type": "state_update", **state})

    elif msg_type == "ignite_batch":
        cells = data.get("cells", [])
        for c in cells:
            simulation.ignite(int(c["x"]), int(c["y"]))
        if cells:
            simulation.running = True
        state = simulation._build_response()
        await manager.broadcast({"type": "state_update", **state})

    elif msg_type == "clear_batch":
        cells = data.get("cells", [])
        for c in cells:
            simulation.clear(int(c["x"]), int(c["y"]))
        state = simulation._build_response()
        await manager.broadcast({"type": "state_update", **state})

    elif msg_type == "reset":
        simulation.reset()
        state = simulation._build_response()
        await manager.broadcast({"type": "state_update", **state})

    elif msg_type == "set_zone":
        x1, y1, x2, y2 = data["x1"], data["y1"], data["x2"], data["y2"]
        if None in (x1, y1, x2, y2):
            simulation.clear_initial_zone()
        else:
            simulation.set_initial_zone(int(x1), int(y1), int(x2), int(y2))

    elif msg_type == "set_location":
        simulation.set_custom_location(data.get("lat"), data.get("lon"))

    elif msg_type == "weather_override":
        weather_service.override(
            wind_speed=data.get("wind_speed"),
            wind_direction=data.get("wind_direction"),
            temperature=data.get("temperature"),
            humidity=data.get("humidity"),
        )
        weather = await weather_service.get_current()
        await manager.broadcast({"type": "weather_update", **weather})

    elif msg_type == "llm_query":
        await _handle_llm_stream(websocket, data["query"], data.get("context"))

    else:
        await manager.send(websocket, {"type": "error", "message": f"Unknown message type: {msg_type}"})


async def _handle_llm_stream(websocket: WebSocket, query: str, context: dict | None):
    state = simulation._build_response()
    weather_state = await weather_service.get_current()
    state["weather"] = weather_state
    state["location"] = context if context else {}
    rag_context = build_rag_context(state)
    prompt = _build_llm_prompt(query, rag_context)

    full_response = ""

    try:
        async for token in _stream_ollama(prompt):
            full_response += token
            await manager.send(websocket, {"type": "llm_chunk", "token": token})
            await asyncio.sleep(0)
    except Exception:
        try:
            async for token in _stream_openai(prompt):
                full_response += token
                await manager.send(websocket, {"type": "llm_chunk", "token": token})
                await asyncio.sleep(0)
        except Exception:
            fallback = _fallback_response(query, rag_context)
            full_response = fallback
            await manager.send(websocket, {"type": "llm_chunk", "token": fallback})

    await manager.send(websocket, {"type": "llm_done", "full": full_response})


async def _stream_ollama(prompt: str):
    url = f"{settings.ollama_base_url}/v1/chat/completions"
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            url,
            json={
                "model": settings.ollama_model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "options": {"num_predict": 300},
            },
            timeout=60,
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    line = line[6:]
                if line.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(line)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue


async def _stream_openai(prompt: str):
    import os
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("No OpenAI API key configured")

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "max_tokens": 300,
            },
            timeout=30,
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    line = line[6:]
                if line.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(line)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue


def _fallback_response(query: str, context: str) -> str:
    return (
        f"Here is the current simulation data:\n\n{context}\n\n"
        f"I couldn't reach the AI model, but based on the data above, "
        f"please analyze the situation yourself. Your question was: {query}"
    )
