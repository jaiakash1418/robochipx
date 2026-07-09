# API Documentation — Wildfire Spread Predictor

Base URL: `http://localhost:8000/api`
Interactive Docs (Swagger): `http://localhost:8000/docs`
ReDoc: `http://localhost:8000/redoc`

---

## 1. Health Check

Check if the backend is running.

```
GET /api/health
```

**Response 200:**
```json
{
  "status": "ok",
  "service": "wildfire-spread-predictor",
  "grid_size": 64,
  "running": false
}
```

---

## 2. Simulation Endpoints

### 2.1 Ignite Fire

Start a fire at a specific grid cell. Only unburned cells can be ignited. After ignition, the simulation automatically starts running.

```
POST /api/simulation/ignite
```

**Request Body:**
```json
{
  "x": 32,
  "y": 25
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Ignited at (32, 25)"
}
```

**Response 400:** Cell out of bounds or already on fire.

---

### 2.2 Tick (Advance Simulation)

Advance the simulation by one step. Fetches weather (live or demo), runs the model, updates fire mask, and returns new state.

```
POST /api/simulation/tick
```

**Response 200:**
```json
{
  "step": 5,
  "fire_mask": [[0, 0, 2, 1, 0, ...], ...],
  "fuel_map": [[0, 0, 0, 1, 2, ...], ...],
  "towns": [
    {"x": 10, "y": 10, "name": "Lakewood"},
    {"x": 45, "y": 50, "name": "Pine Valley"}
  ],
  "stats": {
    "total_cells": 4096,
    "burning": 12,
    "burned": 45,
    "percentage_burned": 1.1,
    "active_fronts": 12
  },
  "alerts": [
    {
      "town": "Lakewood",
      "town_x": 10,
      "town_y": 10,
      "distance_cells": 3.2,
      "severity": "danger",
      "evacuation_direction": {"dx": -0.71, "dy": -0.71},
      "message": "Fire approaching Lakewood! Evacuate immediately."
    }
  ],
  "running": true
}
```

**Fuel type values:**
| Code | Type |
|------|------|
| 0 | Forest |
| 1 | Grass |
| 2 | Water |
| 3 | Town |
| 4 | Road |
| 5 | Firebreak |

**Cell state values:**
| Code | State |
|------|-------|
| 0 | Unburned |
| 1 | Burning |
| 2 | Burned |

---

### 2.3 Get Current State

Get the full simulation state without advancing time.

```
GET /api/simulation/state
```

**Response 200:** Same structure as `/simulation/tick` response.

---

### 2.4 Reset Simulation

Reset fire mask to all unburned. Stops the simulation.

```
POST /api/simulation/reset
```

**Response 200:**
```json
{
  "success": true,
  "message": "Simulation reset"
}
```

---

### 2.5 Get Stats Only

Get just the current statistics (lighter payload than full state).

```
GET /api/simulation/stats
```

**Response 200:**
```json
{
  "total_cells": 4096,
  "burning": 12,
  "burned": 45,
  "percentage_burned": 1.1,
  "active_fronts": 12
}
```

---

## 3. Weather Endpoints

### 3.1 Get Current Weather

Returns the current weather (live from Open-Meteo or cached demo data).

```
GET /api/weather
```

**Response 200:**
```json
{
  "wind_speed": 12.0,
  "wind_direction": 135.0,
  "temperature": 29.0,
  "humidity": 34.0,
  "source": "open-meteo",
  "timestamp": "2026-07-09T12:00:00"
}
```

**`source` field meanings:**
- `"open-meteo"` — live data from API
- `"demo"` — default demo values
- `"manual_override"` — user overrode via sliders

---

### 3.2 Fetch Fresh Live Weather

Force-fetch the latest weather from Open-Meteo API (updates cache).

```
GET /api/weather/live
```

**Response 200:** Same structure as `/api/weather`.

---

### 3.3 Override Weather

Manually override weather parameters. Partial updates supported — omit fields you don't want to change.

```
POST /api/weather/override
```

**Request Body (all fields optional):**
```json
{
  "wind_speed": 25.0,
  "wind_direction": 180.0,
  "temperature": 35.0,
  "humidity": 20.0
}
```

**Response 200:** Full weather object with updated values and `source: "manual_override"`.

---

## 4. Alerts Endpoint

Get current active evacuation alerts (lighter than getting full state).

```
GET /api/alerts
```

**Response 200:**
```json
{
  "alerts": [
    {
      "town": "Lakewood",
      "town_x": 10,
      "town_y": 10,
      "distance_cells": 3.2,
      "severity": "warning",
      "evacuation_direction": {"dx": -0.71, "dy": -0.71},
      "message": "Fire approaching Lakewood! Evacuate immediately."
    }
  ]
}
```

**Severity levels:**
- `"danger"` — fire within 2 cells
- `"warning"` — fire within 5 cells

---

## 5. LLM Assistant Endpoint

Send a natural-language query with optional simulation context.

```
POST /api/llm/query
```

**Request Body:**
```json
{
  "query": "What is the current risk to Lakewood?",
  "context": {}
}
```

**Response 200:**
```json
{
  "answer": "Fire is approaching Lakewood from the southwest. Current distance is 3 cells. Strong winds (25 km/h) are pushing the fire northeast toward the town. Recommend evacuation via the northbound route."
}
```

> **Note:** This endpoint requires `OPENAI_API_KEY` environment variable. If not set, it returns a rule-based fallback response.

---

## 6. Error Responses

All endpoints return standard HTTP errors:

```json
{
  "detail": "Invalid cell coordinates or cell already burning"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid params) |
| 500 | Server error |

---

## Frontend Integration Guide

### Polling Loop (Recommended for MVP)

```
setInterval every 1-3 seconds:
  1. Call POST /api/simulation/tick → update fire mask + stats + alerts
  2. Re-render map (green→orange→black cells)
  3. Show/hide alert panel based on alerts array
  4. Update stats display
```

### WebSocket (Future Enhancement)

For real-time updates without polling, a WebSocket endpoint can be added at `/ws/simulation`.

### State Keys for i18n

Alert messages and stats labels should use `react-i18next` translation keys. The backend sends raw data; frontend handles display text.
