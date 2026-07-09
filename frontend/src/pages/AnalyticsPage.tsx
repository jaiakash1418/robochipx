import { useSimulation } from '../context/SimulationContext';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend as RechartsLegend,
} from 'recharts';

const COLORS = ['#ff4500', '#ff8c00', '#ffd600', '#00e676', '#00bcd4', '#6b7280'];

const FUEL_LABELS: Record<number, string> = {
  0: 'Forest', 1: 'Grass', 2: 'Water',
  3: 'Town', 4: 'Road', 5: 'Firebreak',
};

function computeFuelDistribution(fuelMap: number[][]): { name: string; value: number }[] {
  const counts: Record<number, number> = {};
  let total = 0;
  for (const row of fuelMap) {
    for (const cell of row) {
      counts[cell] = (counts[cell] || 0) + 1;
      total++;
    }
  }
  return Object.entries(counts)
    .map(([k, v]) => ({ name: FUEL_LABELS[Number(k)] ?? `Type ${k}`, value: Math.round((v / total) * 100) }))
    .sort((a, b) => b.value - a.value);
}

export default function AnalyticsPage() {
  const { state } = useSimulation();
  const { stats, history, fuelMap } = state;

  const burnData = history.length >= 2
    ? history.map((h) => ({
        step: h.step,
        burned: h.stats.percentage_burned,
        burning: h.stats.burning,
      }))
    : stats.step > 0
      ? [{ step: stats.step, burned: stats.percentage_burned, burning: stats.burning }]
      : [];

  const fuelData = fuelMap.length > 0 ? computeFuelDistribution(fuelMap) : [];

  const frontsData = history.length >= 2
    ? history.map((h) => ({ step: h.step, fronts: h.stats.active_fronts }))
    : [];

  return (
    <div className="analytics-page">
      <div className="analytics-grid">
        <div className="panel chart-card">
          <h3>Burn Progression</h3>
          {burnData.length < 2 ? (
            <p className="chart-empty">Run the simulation to see burn progression.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={burnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="step" stroke="var(--text-tertiary)" fontSize={12} />
                <YAxis stroke="var(--text-tertiary)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="burned"
                  stroke="var(--accent-fire)"
                  strokeWidth={2}
                  dot={false}
                  name="Burned %"
                />
                <Line
                  type="monotone"
                  dataKey="burning"
                  stroke="var(--accent-orange)"
                  strokeWidth={2}
                  dot={false}
                  name="Burning"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel chart-card">
          <h3>Fuel Type Distribution</h3>
          {fuelData.length === 0 ? (
            <p className="chart-empty">No fuel map data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={fuelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  stroke="none"
                >
                  {fuelData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsLegend />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel chart-card">
          <h3>Active Fronts Over Time</h3>
          {frontsData.length < 2 ? (
            <p className="chart-empty">Run the simulation to see active fronts.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={frontsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="step" stroke="var(--text-tertiary)" fontSize={12} />
                <YAxis stroke="var(--text-tertiary)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="fronts"
                  stroke="var(--accent-water)"
                  strokeWidth={2}
                  dot={false}
                  name="Active Fronts"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel chart-card">
          <h3>Weather</h3>
          <div className="chart-empty">
            <p>Current weather data available from Control Panel.</p>
            <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
              Source: {state.weather?.source ?? 'N/A'} &middot;
              Wind: {state.weather?.wind_speed.toFixed(1) ?? '-'} km/h &middot;
              Temp: {state.weather?.temperature.toFixed(1) ?? '-'}°C &middot;
              Humidity: {state.weather?.humidity ?? '-'}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}