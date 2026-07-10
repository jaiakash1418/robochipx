import { useState } from 'react';
import * as api from '../api/endpoints';

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  request?: string;
  response: string;
  action: string;
  exec: () => Promise<any>;
  icon: string;
}

type Section = { title: string; icon: string; endpoints: EndpointDoc[] };

const sections: Section[] = [
  {
    title: 'Simulation', icon: '🔥',
    endpoints: [
      {
        method: 'GET', path: '/api/health', icon: '💚',
        description: 'Backend health check — returns status, grid size, and whether simulation is running.',
        response: JSON.stringify({ status: 'ok', service: 'wildfire-spread-predictor', grid_size: 64, running: false }, null, 2),
        action: 'Check Health',
        exec: () => api.healthCheck(),
      },
      {
        method: 'POST', path: '/api/simulation/ignite', icon: '🔥',
        description: 'Ignite a single cell at (x,y) on the grid. Starts the simulation running.',
        request: JSON.stringify({ x: 32, y: 32 }, null, 2),
        response: JSON.stringify({ success: true, message: 'Ignited at (32, 32)' }, null, 2),
        action: 'Ignite (32,32)',
        exec: () => api.ignite({ x: 32, y: 32 }),
      },
      {
        method: 'POST', path: '/api/simulation/tick', icon: '⏩',
        description: 'Advance the simulation by one step. The ML model predicts fire spread from current conditions.',
        response: '{\n  "step": 1,\n  "fire_mask": [[...]],\n  "stats": { "burning": 12 },\n  "alerts": []\n}',
        action: 'Run Tick',
        exec: () => api.tick(),
      },
      {
        method: 'GET', path: '/api/simulation/state', icon: '📊',
        description: 'Get the full current simulation state: fire mask, fuel map, towns, stats, and alerts.',
        response: '{\n  "step": 1,\n  "fire_mask": [[...]],\n  "fuel_map": [[...]],\n  "stats": {},\n  "alerts": []\n}',
        action: 'Get State',
        exec: () => api.getState(),
      },
      {
        method: 'POST', path: '/api/simulation/reset', icon: '🔄',
        description: 'Reset the simulation — clears all fire, resets step counter, pauses.',
        response: JSON.stringify({ success: true }, null, 2),
        action: 'Reset',
        exec: () => api.resetSimulation(),
      },
      {
        method: 'GET', path: '/api/simulation/stats', icon: '📈',
        description: 'Get summary statistics: total cells, burning, burned, percentage burned.',
        response: JSON.stringify({ total_cells: 4096, burning: 42, burned: 128, percentage_burned: 3.12 }, null, 2),
        action: 'Get Stats',
        exec: () => api.getStats(),
      },
    ],
  },
  {
    title: 'Ignition & Zones', icon: '🎯',
    endpoints: [
      {
        method: 'POST', path: '/api/ignite/batch', icon: '💥',
        description: 'Ignite multiple cells at once. Accepts an array of {x, y} coordinates.',
        request: JSON.stringify({ cells: [{ x: 30, y: 30 }, { x: 31, y: 31 }] }, null, 2),
        response: JSON.stringify({ success: true, ignited: 2 }, null, 2),
        action: 'Batch Ignite',
        exec: () => api.igniteBatch([{ x: 30, y: 30 }, { x: 31, y: 31 }, { x: 32, y: 32 }]),
      },
      {
        method: 'POST', path: '/api/clear/batch', icon: '🧹',
        description: 'Extinguish multiple cells. Accepts an array of {x, y} coordinates.',
        request: JSON.stringify({ cells: [{ x: 30, y: 30 }] }, null, 2),
        response: JSON.stringify({ success: true, cleared: 1 }, null, 2),
        action: 'Batch Clear',
        exec: () => api.clearBatch([{ x: 30, y: 30 }]),
      },
      {
        method: 'POST', path: '/api/zone/set', icon: '📐',
        description: 'Set an initial fire zone. On the next tick, all cells inside the rectangle ignite automatically.',
        request: JSON.stringify({ x1: 20, y1: 20, x2: 30, y2: 30 }, null, 2),
        response: JSON.stringify({ success: true, zone: { x1: 20, y1: 20, x2: 30, y2: 30 } }, null, 2),
        action: 'Set Fire Zone',
        exec: () => api.setInitialZone({ x1: 28, y1: 28, x2: 35, y2: 35 }),
      },
    ],
  },
  {
    title: 'Weather & Location', icon: '🌤️',
    endpoints: [
      {
        method: 'GET', path: '/api/weather/live', icon: '🌎',
        description: 'Fetch live weather from Open-Meteo for the configured default or custom location.',
        response: JSON.stringify({ wind_speed: 12.5, wind_direction: 180, temperature: 22, humidity: 45, precipitation: 0.0, soil_moisture: 0.3, source: 'open-meteo' }, null, 2),
        action: 'Live Weather',
        exec: () => api.getWeatherLive(),
      },
      {
        method: 'GET', path: '/api/weather', icon: '🌥️',
        description: 'Get cached weather data (last fetched value, or demo defaults).',
        response: JSON.stringify({ wind_speed: 12, wind_direction: 135, temperature: 29, humidity: 34, source: 'demo' }, null, 2),
        action: 'Cached Weather',
        exec: () => api.getWeather(),
      },
      {
        method: 'POST', path: '/api/location/set', icon: '📍',
        description: 'Override the weather fetch location. Subsequent simulation ticks use this lat/lon.',
        request: JSON.stringify({ lat: 37.7749, lon: -122.4194 }, null, 2),
        response: JSON.stringify({ success: true, lat: 37.7749, lon: -122.4194 }, null, 2),
        action: 'San Francisco',
        exec: () => api.setBackendLocation(37.7749, -122.4194),
      },
      {
        method: 'GET', path: '/api/alerts', icon: '🔔',
        description: 'Get fire proximity alerts for towns near the active fire perimeter.',
        response: JSON.stringify({ alerts: [{ town: 'Lakewood', severity: 'warning', distance_cells: 5 }] }, null, 2),
        action: 'Get Alerts',
        exec: () => api.getAlerts(),
      },
    ],
  },
  {
    title: 'AI & Intelligence', icon: '🧠',
    endpoints: [
      {
        method: 'POST', path: '/api/llm/query', icon: '🤖',
        description: 'Ask the AI assistant about the simulation. Uses RAG context (fuel, weather, alerts, location) + LLM. Falls back through Ollama → OpenAI → template.',
        request: JSON.stringify({ query: 'How far is the fire from towns?', context: {} }, null, 2),
        response: JSON.stringify({ answer: 'The fire is approximately 5 cells from Lakewood. Evacuation routes are active.' }, null, 2),
        action: 'Ask AI',
        exec: () => api.queryLLM({ query: 'What is the current fire status and risk level?', context: {} }),
      },
    ],
  },
  {
    title: 'Model Evaluation', icon: '📉',
    endpoints: [
      {
        method: 'POST', path: '/api/model/evaluate', icon: '🧪',
        description: 'Run the ML model against the test dataset. Computes F1, IoU, Dice, Precision, Recall, Accuracy and saves sample predictions.',
        response: JSON.stringify({ f1: 0.206, iou: 0.12, dice: 0.34, precision: 0.14, recall: 0.42, accuracy: 0.97, samples: 5 }, null, 2),
        action: 'Evaluate',
        exec: () => api.evaluateModel(),
      },
      {
        method: 'GET', path: '/api/model/evaluation', icon: '📋',
        description: 'Retrieve the latest evaluation results without re-running the evaluation.',
        response: JSON.stringify({ f1: 0.206, iou: 0.12, dice: 0.34, samples: 5, timestamp: '2024-01-01T00:00:00Z' }, null, 2),
        action: 'Last Eval',
        exec: () => api.getEvaluation(),
      },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  return <span className={`hackathon-method ${method.toLowerCase()}`}>{method}</span>;
}

function SchemaBox({ label, code }: { label: string; code: string }) {
  if (!code) return null;
  return (
    <div className="hackathon-schema-box">
      <div className="hackathon-schema-header">{label}</div>
      <pre className="hackathon-schema-code">{code}</pre>
    </div>
  );
}

export default function HackathonPage() {
  const [results, setResults] = useState<Record<string, { data: any; error?: string }>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const handleExec = async (key: string, fn: () => Promise<any>) => {
    setLoadingKey(key);
    try {
      const data = await fn();
      setResults((prev) => ({ ...prev, [key]: { data } }));
    } catch (err: any) {
      setResults((prev) => ({ ...prev, [key]: { data: null, error: err.message || String(err) } }));
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="hackathon-page">
      <div className="hackathon-header">
        <h1>API Explorer</h1>
        <p>
          Every backend endpoint powering the wildfire simulation — with docs, schemas, and a live Try It button.
          Click any card to see the raw API response.
        </p>
      </div>

      <div className="hackathon-ai-note">
        <strong>🤖 AI Module — Fallback Chain</strong>
        The <code>POST /api/llm/query</code> endpoint tries three backends in order:
        <ol>
          <li><strong>Ollama</strong> (local, <code>localhost:11434</code>) — requires <code>ollama serve</code> running with <code>llama3.2</code></li>
          <li><strong>OpenAI</strong> API — requires <code>OPENAI_API_KEY</code> environment variable</li>
          <li><strong>Template fallback</strong> — generates a factual response directly from the RAG context (most common if neither LLM is configured)</li>
        </ol>
        RAG context includes fuel composition percentages, weather analysis (wind direction named + speed classification), active town alerts with severity, user location distance to fire centroid, and simulation step status.
      </div>

      <div className="hackathon-section">
        <div className="hackathon-section-title">
          <span>🏗️</span>
          <span>Architecture & Workflow</span>
          <span className="hackathon-section-badge">end-to-end flow</span>
        </div>

        <div className="workflow">
          <div className="workflow-stack">
            <div className="wf-layer wf-layer-frontend">
              <div className="wf-layer-head">
                <span className="wf-layer-icon">🖥️</span>
                <span className="wf-layer-name">Frontend</span>
                <span className="wf-layer-stack">React · Vite · TypeScript</span>
              </div>
              <div className="wf-layer-body">
                <div className="wf-node"><span className="wf-ico">🧭</span><span><strong>Router</strong> — 9 pages, shared Layout, AnimatePresence page transitions</span></div>
                <div className="wf-node"><span className="wf-ico">💾</span><span><strong>SimulationContext</strong> — global state: fire mask, running, alerts, stats, weather</span></div>
                <div className="wf-node"><span className="wf-ico">📊</span><span><strong>Dashboard</strong> — MapView canvas + 6 sidebar panels + floating LLM chat</span></div>
                <div className="wf-node"><span className="wf-ico">🔄</span><span><strong>Auto intervals</strong> — tick 2s · evac route 3s · dispatcher 4s</span></div>
                <div className="wf-node"><span className="wf-ico">🖼️</span><span><strong>Canvas</strong> — grid cells, fire/fuel colors, town markers, cyan evac route, SAFE label</span></div>
              </div>
            </div>

            <div className="wf-connector" />

            <div className="wf-layer wf-layer-transport">
              <div className="wf-layer-head">
                <span className="wf-layer-icon">🌐</span>
                <span className="wf-layer-name">Transport</span>
                <span className="wf-layer-stack">REST · WebSocket</span>
              </div>
              <div className="wf-layer-body">
                <div className="wf-node"><span className="wf-ico">📡</span><span><strong>REST API</strong> — 18 endpoints at <code>/api/*</code>: simulation, weather, FIRMS, evac, dispatcher, LLM, eval</span></div>
                <div className="wf-node"><span className="wf-ico">🔌</span><span><strong>WebSocket</strong> — <code>/ws</code> pushes real-time state to all dashboard clients</span></div>
                <div className="wf-node"><span className="wf-ico">🔓</span><span><strong>CORS</strong> — open policy, configurable via <code>settings.cors_origins</code></span></div>
              </div>
            </div>

            <div className="wf-connector" />

            <div className="wf-layer wf-layer-backend">
              <div className="wf-layer-head">
                <span className="wf-layer-icon">⚙️</span>
                <span className="wf-layer-name">Backend</span>
                <span className="wf-layer-stack">FastAPI · Python</span>
              </div>
              <div className="wf-layer-body">
                <div className="wf-node"><span className="wf-ico">🚀</span><span><strong>main.py</strong> — FastAPI app, CORS, router include, WS handler, lifespan fuel-map load</span></div>
                <div className="wf-node"><span className="wf-ico">📋</span><span><strong>routes.py</strong> — 18 endpoints under <code>/api</code></span></div>
                <div className="wf-node"><span className="wf-ico">🔥</span><span><strong>simulation.py</strong> — tick(): kernel spread → ML adjust → burn transition → alerts</span></div>
                <div className="wf-node"><span className="wf-ico">🌤️</span><span><strong>weather.py</strong> — async Open-Meteo fetcher, caching, demo fallback, manual override</span></div>
                <div className="wf-node"><span className="wf-ico">🛰️</span><span><strong>firms.py</strong> — NASA FIRMS client, nearest-fires query within radius</span></div>
                <div className="wf-node"><span className="wf-ico">📐</span><span><strong>grid.py</strong> — 64×64 fuel/fire/towns, random-shape ignition cluster (~16 cells)</span></div>
                <div className="wf-node"><span className="wf-ico">📍</span><span><strong>pathfinding.py</strong> — A* 8-dir, road-weighted, fire-buffer zone, dynamic fuel cost</span></div>
                <div className="wf-node"><span className="wf-ico">🚒</span><span><strong>dispatcher.py</strong> — priority queue: risk × critical_value × wind_alignment</span></div>
                <div className="wf-node"><span className="wf-ico">🔔</span><span><strong>alerts.py</strong> — BFS from fire perimeter, flags towns within danger radius</span></div>
                <div className="wf-node"><span className="wf-ico">🧠</span><span><strong>rag.py + llm</strong> — RAG context builder; fallback: Ollama ⇒ OpenAI ⇒ template</span></div>
              </div>
            </div>

            <div className="wf-connector" />

            <div className="wf-layer wf-layer-external">
              <div className="wf-layer-head">
                <span className="wf-layer-icon">☁️</span>
                <span className="wf-layer-name">External Services</span>
              </div>
              <div className="wf-layer-body wf-external-row">
                <div className="wf-ext-card"><span className="wf-ext-icon">🌤️</span><span className="wf-ext-name">Open-Meteo</span><span className="wf-ext-desc">Live weather data</span></div>
                <div className="wf-ext-card"><span className="wf-ext-icon">🛰️</span><span className="wf-ext-name">NASA FIRMS</span><span className="wf-ext-desc">Active fire detections</span></div>
                <div className="wf-ext-card"><span className="wf-ext-icon">🤖</span><span className="wf-ext-name">Ollama</span><span className="wf-ext-desc">Local LLM (optional)</span></div>
                <div className="wf-ext-card"><span className="wf-ext-icon">☁️</span><span className="wf-ext-name">OpenAI</span><span className="wf-ext-desc">Cloud LLM (optional)</span></div>
                <div className="wf-ext-card"><span className="wf-ext-icon">🗺️</span><span className="wf-ext-name">OSM</span><span className="wf-ext-desc">Fuel map tiles</span></div>
              </div>
            </div>
          </div>

          <div className="wf-cycle">
            <div className="wf-cycle-title">🔄 Simulation Tick Cycle</div>
            <div className="wf-cycle-steps">
              <div className="wf-step">
                <div className="wf-step-marker">1</div>
                <div className="wf-step-icon">💥</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Ignite</div>
                  <div className="wf-step-info">Random cluster ~16 cells</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">2</div>
                <div className="wf-step-icon">🌊</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Kernel Spread</div>
                  <div className="wf-step-info">5×5 · wind-stretched · dot-product alignment</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">3</div>
                <div className="wf-step-icon">🧠</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">ML Adjust</div>
                  <div className="wf-step-info">FireSenseNet prob. modification</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">4</div>
                <div className="wf-step-icon">🔥</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Burn Transition</div>
                  <div className="wf-step-info">burning → burned</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">5</div>
                <div className="wf-step-icon">🔔</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Alerts</div>
                  <div className="wf-step-info">BFS perimeter → flag towns</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">6</div>
                <div className="wf-step-icon">🚗</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Evacuation</div>
                  <div className="wf-step-info">A* safest-route recalc</div>
                </div>
              </div>
              <div className="wf-step-arr">→</div>
              <div className="wf-step">
                <div className="wf-step-marker">7</div>
                <div className="wf-step-icon">🚒</div>
                <div className="wf-step-body">
                  <div className="wf-step-name">Dispatch</div>
                  <div className="wf-step-info">Priority queue → order resources</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {sections.map((section, si) => (
        <div key={si} className="hackathon-section">
          <div className="hackathon-section-title">
            <span>{section.icon}</span>
            <span>{section.title}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
              {section.endpoints.length} endpoint{section.endpoints.length !== 1 ? 's' : ''}
            </span>
          </div>

          {section.endpoints.map((ep, ei) => {
            const key = `${si}-${ei}`;
            const res = results[key];
            const loading = loadingKey === key;

            return (
              <div key={ei} className="hackathon-card">
                <div className="hackathon-card-top">
                  <div className={`hackathon-card-icon ${ep.method.toLowerCase()}`}>
                    {ep.icon}
                  </div>
                  <div className="hackathon-card-body">
                    <div className="hackathon-card-path">
                      <MethodBadge method={ep.method} />
                      <span className="hackathon-path-text">{ep.path}</span>
                    </div>
                    <p className="hackathon-card-desc">{ep.description}</p>

                    <div className="hackathon-schemas">
                      <SchemaBox label="Request" code={ep.request ?? ''} />
                      <SchemaBox label="Response" code={ep.response} />
                    </div>

                    <div className="hackathon-card-actions">
                      <button
                        className="btn hackathon-try-btn"
                        onClick={() => handleExec(key, ep.exec)}
                        disabled={loading}
                      >
                        {loading ? '⏳' : '▶'} {ep.action}
                      </button>
                      {res && (
                        <span className={`hackathon-status ${res.error ? 'err' : 'ok'}`}>
                          {res.error ? `⚠ ${res.error.slice(0, 60)}` : '✓ Success'}
                        </span>
                      )}
                    </div>

                    {res && !res.error && (
                      <div className="hackathon-response">
                        <div className="hackathon-response-header">
                          <span className="hackathon-response-dot json" />
                          response.json
                        </div>
                        <pre>{JSON.stringify(res.data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
