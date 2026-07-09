# Wildfire Spread Predictor

A real-time wildfire spread simulator with AI-powered prediction, interactive map visualization, multi-language support, and an LLM-powered decision assistant.

## Tech Stack

| Component | Technology |
|---|---|
| Backend | **FastAPI** (Python) + **Uvicorn** |
| ML Model | **PyTorch** + **ResNet34-UNet** (segmentation_models_pytorch) |
| Frontend | **React** + **TypeScript** + **Vite** |
| Maps | **Leaflet** + Esri World Imagery |
| Weather | **Open-Meteo** (free, no API key) |
| LLM | **Ollama** (default) or **OpenAI** (fallback) |
| i18n | **react-i18next** (EN, ES, FR, DE, JA, ZH) |

## Project Structure

```
robochipx/
├── backend/              # FastAPI server
│   ├── api/              # Routes + schemas
│   ├── core/             # Grid, alerts, normalization
│   ├── models/           # UNet inference + checkpoint
│   ├── services/         # Simulation, weather
│   └── main.py           # Entry point
├── frontend/             # React + Vite app
│   ├── src/
│   │   ├── api/          # Axios client + endpoints
│   │   ├── components/   # Map, controls, alerts, chat
│   │   ├── pages/        # Dashboard, analytics, settings
│   │   ├── context/      # Simulation state
│   │   └── locales/      # i18n translations
│   └── package.json
├── training/             # ML training pipeline
│   ├── train.py          # UNet training script
│   ├── requirements.txt
│   └── README.md
├── datasets/             # TFRecords + converted .pt files
├── docs/
│   ├── architecture.md   # Full system architecture
│   └── api.md            # API reference
└── README.md
```

## Setup & Run

### 1. Clone and combine branches

Backend and training code are on the `model` branch, frontend is on `main`:

```bash
# On main branch, merge in the backend
git merge model --allow-unrelated-histories
```

### 2. Backend

```powershell
cd backend
pip install -r requirements.txt
python main.py
```

Server starts at `http://localhost:8000`. Swagger docs: `http://localhost:8000/docs`

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`

### 4. (Optional) LLM Assistant

The LLM endpoint (`POST /api/llm/query`) tries providers in order:

1. **Ollama** (local) — set `OLLAMA_MODEL` in `backend/.env` (default: `llama3.2`)
2. **OpenAI** — set `OPENAI_API_KEY` in `backend/.env`
3. **Rule-based fallback** — works without any config

## API Overview

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/simulation/ignite` | Start fire at a cell |
| POST | `/api/simulation/tick` | Advance one step |
| GET | `/api/simulation/state` | Current state |
| POST | `/api/simulation/reset` | Reset simulation |
| GET | `/api/simulation/stats` | Stats only |
| GET | `/api/weather` | Current weather |
| POST | `/api/weather/override` | Override weather params |
| GET | `/api/alerts` | Active evacuation alerts |
| POST | `/api/llm/query` | Ask the AI assistant |

## Quick Start (ignite + simulate)

```powershell
curl -X POST http://localhost:8000/api/simulation/ignite ^
  -H "Content-Type: application/json" ^
  -d "{\"x\": 32, \"y\": 25}"

curl -X POST http://localhost:8000/api/simulation/tick
curl http://localhost:8000/api/simulation/state
```

## Training the Model

```powershell
# 1. Convert TFRecords to PyTorch tensors
python datasets/convert_to_pt.py

# 2. Train UNet model
python training/train.py
```

Output model saved to `backend/models/unet_checkpoint.pt`.

## Environment Variables

Create `backend/.env` (see `backend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | Wildfire Spread Predictor | App name |
| `DEBUG` | true | Enable hot reload |
| `DEVICE` | cpu | torch device (cpu/cuda) |
| `GRID_SIZE` | 64 | Simulation grid size |
| `OLLAMA_BASE_URL` | http://localhost:11434 | Ollama server URL |
| `OLLAMA_MODEL` | llama3.2 | Ollama model name |
| `OPENAI_API_KEY` | — | OpenAI key (optional fallback) |
| `DEFAULT_LAT` | 39.8283 | Weather fetch latitude |
| `DEFAULT_LON` | -98.5795 | Weather fetch longitude |
