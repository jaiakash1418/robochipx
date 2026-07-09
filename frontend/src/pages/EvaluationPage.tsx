import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Play, RefreshCw, Target, Crosshair, Eye, CheckCircle, AlertCircle } from 'lucide-react';
import apiClient from '../api/client';

interface EvalMetrics {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  dice: number;
  iou: number;
}

interface EvalSample {
  fire_mask: number[][];
  prediction_prob: number[][];
  prediction_bin: number[][];
  ground_truth: number[][];
  metrics: { precision: number; recall: number; f1: number; accuracy: number };
}

interface EvalResult {
  model: string;
  test_samples: number;
  summary: EvalMetrics;
  samples: EvalSample[];
}

const GRID_W = 64;

function MiniGrid({ data, colorMap }: { data: number[][]; colorMap: (v: number) => string }) {
  const size = 140;
  const cell = size / GRID_W;
  return (
    <svg width={size} height={size} style={{ borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
      {data.map((row, y) =>
        row.map((val, x) => (
          <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={colorMap(val)} />
        ))
      )}
    </svg>
  );
}

function probColor(v: number): string {
  if (v > 0.5) return '#ff6b35';
  if (v > 0.3) return '#ffa366';
  if (v > 0.1) return '#ffd699';
  return '#1a1a2e';
}

function binColor(v: number): string {
  return v > 0.5 ? '#ff6b35' : '#1a1a2e';
}

function gtColor(v: number): string {
  return v > 0.5 ? '#00e676' : '#1a1a2e';
}

export default function EvaluationPage() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/model/evaluation');
      if (res.data?.summary) {
        setResult(res.data);
      }
    } catch {
      // No cached results yet
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadResults(); }, [loadResults]);

  const runEval = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiClient.post('/model/evaluate');
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setResult(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Evaluation failed');
    }
    setRunning(false);
  };

  const metricCards = result ? [
    { label: 'F1 Score', value: result.summary.f1, icon: Target, color: 'var(--accent-fire)' },
    { label: 'IoU', value: result.summary.iou, icon: Crosshair, color: 'var(--accent-orange)' },
    { label: 'Precision', value: result.summary.precision, icon: Crosshair, color: 'var(--accent-green)' },
    { label: 'Recall', value: result.summary.recall, icon: Eye, color: 'var(--accent-water)' },
    { label: 'Dice', value: result.summary.dice, icon: CheckCircle, color: 'var(--accent-green)' },
    { label: 'Accuracy', value: result.summary.accuracy, icon: CheckCircle, color: 'var(--text-secondary)' },
  ] : [];

  return (
    <div className="eval-page">
      <div className="eval-header">
        <h2>
          <BarChart3 size={20} /> Model Evaluation
        </h2>
        <button className="btn btn-primary" onClick={runEval} disabled={running}>
          {running ? <><RefreshCw size={14} className="spin" /> Running...</> : <><Play size={14} /> Run Evaluation</>}
        </button>
      </div>

      {loading && !result && <div className="eval-loading">Loading cached results...</div>}

      {error && (
        <div className="eval-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="panel eval-empty">
          <BarChart3 size={40} />
          <h3>No Evaluation Results</h3>
          <p>Run an evaluation to see model performance on the test dataset.</p>
        </div>
      )}

      {result && (
        <>
          <div className="eval-info panel">
            <span><strong>Model:</strong> {result.model}</span>
            <span><strong>Test Samples:</strong> {result.test_samples.toLocaleString()}</span>
          </div>

          <div className="eval-metrics-grid">
            {metricCards.map((m) => (
              <div key={m.label} className="panel eval-metric-card">
                <m.icon size={20} style={{ color: m.color }} />
                <div className="eval-metric-value">{m.value.toFixed(4)}</div>
                <div className="eval-metric-label">{m.label}</div>
              </div>
            ))}
          </div>

          {result.samples && result.samples.length > 0 && (
            <div className="panel">
              <h3 style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>Sample Predictions</h3>
              <div className="eval-samples">
                {result.samples.map((s, i) => (
                  <div key={i} className="eval-sample-row">
                    <div className="eval-sample-label">Sample {i + 1}</div>
                    <div className="eval-sample-grids">
                      <div>
                        <div className="eval-sample-title">Fire Mask</div>
                        <MiniGrid data={s.fire_mask} colorMap={(v) => v === 1 ? '#ff6b35' : v === 2 ? '#1a1a1a' : '#1a1a2e'} />
                      </div>
                      <div>
                        <div className="eval-sample-title">Prediction (prob)</div>
                        <MiniGrid data={s.prediction_prob} colorMap={probColor} />
                      </div>
                      <div>
                        <div className="eval-sample-title">Prediction (bin)</div>
                        <MiniGrid data={s.prediction_bin} colorMap={binColor} />
                      </div>
                      <div>
                        <div className="eval-sample-title">Ground Truth</div>
                        <MiniGrid data={s.ground_truth} colorMap={gtColor} />
                      </div>
                    </div>
                    <div className="eval-sample-metrics">
                      <span>P:{s.metrics.precision.toFixed(3)}</span>
                      <span>R:{s.metrics.recall.toFixed(3)}</span>
                      <span>F1:{s.metrics.f1.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
