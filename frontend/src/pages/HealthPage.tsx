import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Server, Cpu, Wind, AlertTriangle, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import * as api from '../api/endpoints';
import type { HealthResponse } from '../api/types';

interface EndpointStatus {
  name: string;
  method: string;
  path: string;
  status: 'ok' | 'error' | 'pending';
  latency?: number;
}

export default function HealthPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([
    { name: 'Health Check', method: 'GET', path: '/api/health', status: 'pending' },
    { name: 'Simulation State', method: 'GET', path: '/api/simulation/state', status: 'pending' },
    { name: 'Simulation Stats', method: 'GET', path: '/api/simulation/stats', status: 'pending' },
    { name: 'Weather', method: 'GET', path: '/api/weather', status: 'pending' },
    { name: 'Alerts', method: 'GET', path: '/api/alerts', status: 'pending' },
  ]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setEndpoints(prev => prev.map(e => ({ ...e, status: 'pending' as const })));

    try {
      const h = await api.healthCheck();
      setHealth(h);
      setBackendOk(h.status === 'ok');
      setEndpoints(prev => prev.map(e =>
        e.path === '/api/health' ? { ...e, status: 'ok' as const } : e
      ));
    } catch {
      setBackendOk(false);
      setEndpoints(prev => prev.map(e => ({ ...e, status: 'error' as const })));
      setChecking(false);
      return;
    }

    const checks = [
      { name: 'Simulation State', method: 'GET', path: '/api/simulation/state', fn: () => api.getState() },
      { name: 'Simulation Stats', method: 'GET', path: '/api/simulation/stats', fn: () => api.getStats() },
      { name: 'Weather', method: 'GET', path: '/api/weather', fn: () => api.getWeather() },
      { name: 'Alerts', method: 'GET', path: '/api/alerts', fn: () => api.getAlerts() },
    ];

    const results = await Promise.allSettled(
      checks.map(async (c) => {
        const start = performance.now();
        try {
          await c.fn();
          return { name: c.name, status: 'ok' as const, latency: Math.round(performance.now() - start) };
        } catch {
          return { name: c.name, status: 'error' as const, latency: undefined };
        }
      })
    );

    setEndpoints(prev => prev.map(e => {
      const r = results.find(r => r.status === 'fulfilled' && r.value.name === e.name) as PromiseFulfilledResult<{ name: string; status: 'ok' | 'error'; latency?: number }> | undefined;
      if (r?.status === 'fulfilled') {
        return { ...e, status: r.value.status, latency: r.value.latency };
      }
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (rejected) {
        return { ...e, status: 'error' as const };
      }
      return e;
    }));

    setChecking(false);
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  return (
    <div className="health-page">
      <div className="health-header">
        <h2>
          <Activity size={20} /> System Health
        </h2>
        <button className="btn btn-primary" onClick={runCheck} disabled={checking}>
          {checking ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      <div className="health-grid">
        <div className={`panel health-summary ${backendOk === true ? 'ok' : backendOk === false ? 'error' : ''}`}>
          <div className="health-summary-icon">
            {backendOk === true ? <CheckCircle size={32} /> : backendOk === false ? <XCircle size={32} /> : <AlertTriangle size={32} />}
          </div>
          <div className="health-summary-info">
            <h3>{backendOk === true ? 'Connected' : backendOk === false ? 'Disconnected' : 'Checking...'}</h3>
            <p>{backendOk === true ? `Backend is reachable at localhost:8000` : backendOk === false ? 'Backend is not reachable — using mock simulation' : ''}</p>
          </div>
        </div>

        <div className="panel health-card">
          <div className="health-card-header">
            <Server size={16} />
            <span>Backend Info</span>
          </div>
          <div className="health-card-body">
            <div className="health-row">
              <span className="health-label">Status</span>
              <span className={`health-value ${backendOk === true ? 'text-green' : backendOk === false ? 'text-red' : ''}`}>
                {backendOk === null ? '...' : backendOk ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="health-row">
              <span className="health-label">Service</span>
              <span className="health-value">{health?.service ?? 'N/A'}</span>
            </div>
            <div className="health-row">
              <span className="health-label">Grid Size</span>
              <span className="health-value">{health?.grid_size ?? 64}×{health?.grid_size ?? 64}</span>
            </div>
            <div className="health-row">
              <span className="health-label">Simulation</span>
              <span className={`health-value ${health?.running ? 'text-green' : ''}`}>
                {health ? (health.running ? 'Running' : 'Stopped') : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="panel health-card">
          <div className="health-card-header">
            <Cpu size={16} />
            <span>Frontend Mode</span>
          </div>
          <div className="health-card-body">
            <div className="health-row">
              <span className="health-label">API Mode</span>
              <span className="health-value">{backendOk ? 'Live' : 'Mock'}</span>
            </div>
            <div className="health-row">
              <span className="health-label">ML Model</span>
              <span className="health-value">{backendOk ? 'ResNet34-UNet' : 'Fallback (rule-based)'}</span>
            </div>
            <div className="health-row">
              <span className="health-label">Weather Source</span>
              <span className="health-value">{backendOk ? 'Open-Meteo' : 'Demo'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="health-card-header" style={{ marginBottom: 12 }}>
          <Wind size={16} />
          <span>Endpoint Status</span>
        </div>
        <div className="health-endpoints">
          {endpoints.map((ep) => (
            <div key={ep.path} className="health-endpoint-row">
              <div className="health-endpoint-method">{ep.method}</div>
              <div className="health-endpoint-path">{ep.path}</div>
              <div className="health-endpoint-name">{ep.name}</div>
              <div className="health-endpoint-status">
                {ep.status === 'ok' && <span className="health-badge ok">OK</span>}
                {ep.status === 'error' && <span className="health-badge error">ERROR</span>}
                {ep.status === 'pending' && <span className="health-badge pending">...</span>}
              </div>
              {ep.latency !== undefined && (
                <div className="health-endpoint-latency">{ep.latency}ms</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel health-summary" style={{ cursor: 'pointer' }} onClick={() => navigate('/evaluation')}>
        <div className="health-summary-icon" style={{ color: 'var(--accent-fire)' }}>
          <BarChart3 size={32} />
        </div>
        <div className="health-summary-info">
          <h3>ML Model Evaluation</h3>
          <p>Run performance evaluation on the test dataset — F1, IoU, Precision, Recall, and sample predictions.</p>
        </div>
      </div>
    </div>
  );
}
