# System Architecture — Wildfire Spread Predictor

## Overview

A real-time wildfire spread simulator with AI-powered prediction, interactive map visualization, multi-language support, and an LLM-powered decision assistant.

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ MapView  │  │ ControlPanel │  │    LLMChat +      │  │
│  │ (Leaflet)│  │ (Sliders)    │  │   AlertPanel      │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │               │                    │            │
│       └───────────────┼────────────────────┘            │
│                       │ HTTP (axios)                    │
└───────────────────────┼─────────────────────────────────┘
                        │
              CORS (localhost:5173 ↔ 8000)
                        │
┌───────────────────────┼─────────────────────────────────┐
│              Backend (FastAPI + Python)                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Routes  │  │  Services    │  │      Core         │  │
│  │  (API)   │──│  Simulation  │──│  Grid, Alerts,    │  │
│  │          │  │  Weather     │  │  Normalization    │  │
│  └──────────┘  │  Inference   │  └───────────────────┘  │
│                └──────┬───────┘                         │
│                       │                                  │
│              ┌────────┴────────┐                         │
│              │  Models (UNet)  │                         │
│              │  PyTorch .pt    │                         │
│              └─────────────────┘                         │
└───────────────────────┬──────────────────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          │             │              │
          ▼             ▼              ▼
   ┌──────────┐  ┌────────────┐  ┌──────────┐
   │ Open-    │  │ Fuel/Terrain│  │ LLM API  │
   │ Meteo    │  │ Static Grid  │  │ (OpenAI) │
   │ (Weather)│  │ (JSON)      │  │          │
   └──────────┘  └────────────┘  └──────────┘
```

---

## Layer Breakdown

### 1. Frontend (React + TypeScript + Vite)

| Component | Responsibility |
|---|---|
| **MapView** | Leaflet map with Esri World Imagery basemap, grid overlay, fire animation, evacuation routes |
| **ControlPanel** | Weather sliders (wind/humidity/temp), Ignite/Pause/Reset buttons, Live/Demo toggle |
| **StatsPanel** | Burn percentage, active fronts, elapsed time |
| **AlertPanel** | Red flashing alert when fire nears towns, evac direction |
| **LLMChat** | Chat interface for querying the AI assistant |
| **LanguageSwitcher** | Dropdown to switch between EN/ES/FR/DE/JA/ZH |

**State Management:** React Context (or Zustand if complexity grows)
**i18n:** `react-i18next` with JSON locale files in `public/locales/`

### 2. Backend (FastAPI + Python)

| Layer | Files | Purpose |
|---|---|---|
| **Routes** | `api/routes.py` | All REST endpoints |
| **Schemas** | `api/schemas.py` | Pydantic request/response models |
| **Simulation** | `services/simulation.py` | Tick loop orchestrator |
| **Weather** | `services/weather.py` | Open-Meteo client + demo fallback |
| **Inference** | `services/inference.py` | UNet model prediction wrapper |
| **Grid** | `core/grid.py` | 2D fuel/fire state management |
| **Alerts** | `core/alerts.py` | Town proximity detection, evac routes |
| **Normalization** | `core/normalization.py` | Min-max scaling for model inputs |
| **UNet** | `models/unet.py` | segmentation_models_pytorch UNet |

### 3. Data Sources

| Source | Type | Usage |
|---|---|---|
| **Open-Meteo** | REST API (free, no key) | Live wind, humidity, temperature |
| **Fuel Map** | Static JSON | Pre-defined terrain grid with forest/grass/water/town/road |
| **Next-Day Wildfire Spread** | Kaggle dataset | Training data for UNet (not used during runtime) |

---

## Data Flow (One Simulation Tick)

```
1. Frontend sends POST /api/simulation/tick
2. Backend fetches weather (Open-Meteo or demo)
3. Weather is normalized (min-max scale)
4. Current grid state (fuel + fire mask) is stacked with weather → 12-channel tensor
5. Tensor is passed through UNet → probability map (64x64)
6. Probability map is thresholded → new burning cells
7. Adjacent cells with prob > 0.5 become burning; old burning cells become burned
8. Alerts are checked (distance from fire to each town)
9. Response is returned: fire_mask, stats, alerts
10. Frontend updates map colors and shows alerts
```

---

## Tech Stack

| Component | Technology | Justification |
|---|---|---|
| Backend Framework | **FastAPI** | Async, auto-docs, Pydantic, ML-friendly |
| ML Model | **PyTorch + segmentation_models_pytorch** | Pretrained ResNet34-UNet |
| Frontend Framework | **React + Vite + TypeScript** | Fast dev, type safety |
| Maps | **Leaflet + Esri World Imagery** | Free, no API key |
| Weather | **Open-Meteo API** | Free, no API key required |
| i18n | **react-i18next** | Industry standard for React |
| LLM | **OpenAI API (GPT-4o-mini)** | Affordable, fast inference |
| HTTP Client | **axios** | Cleaner than fetch, interceptors |
| Container | **Docker** (optional) | Easy deployment |

---

## Development Workflow

### Running Backend (Terminal 1)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Running Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev  # → http://localhost:5173
```

### Production Build
```bash
cd frontend
npm run build
# FastAPI serves frontend/dist/ as static files
```

---

## API Overview

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/simulation/ignite` | Start fire at cell |
| POST | `/api/simulation/tick` | Advance one step |
| GET | `/api/simulation/state` | Current state |
| POST | `/api/simulation/reset` | Reset simulation |
| GET | `/api/simulation/stats` | Stats only |
| GET | `/api/weather` | Current weather |
| GET | `/api/weather/live` | Force-fetch live weather |
| POST | `/api/weather/override` | Override weather params |
| GET | `/api/alerts` | Active alerts |
| POST | `/api/llm/query` | Ask LLM assistant |

Full details in [api.md](./api.md).
