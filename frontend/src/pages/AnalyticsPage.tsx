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

export default function AnalyticsPage() {
  const { state } = useSimulation();
  const { stats } = state;

  const burnData = Array.from({ length: 20 }, (_, i) => ({
    step: i + 1,
    burned: Math.round(stats.percentage_burned * (i + 1) / 20 * 10) / 10,
    burning: Math.round(stats.burning * (1 - i / 20)),
  }));

  const fuelData = [
    { name: 'Forest', value: 40 },
    { name: 'Grass', value: 25 },
    { name: 'Water', value: 10 },
    { name: 'Town', value: 10 },
    { name: 'Road', value: 10 },
    { name: 'Firebreak', value: 5 },
  ];

  return (
    <div className="analytics-page">
      <div className="analytics-grid">
        <div className="panel chart-card">
          <h3>Burn Progression</h3>
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
        </div>

        <div className="panel chart-card">
          <h3>Fuel Type Distribution</h3>
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
        </div>

        <div className="panel chart-card">
          <h3>Active Fronts Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={Array.from({ length: 10 }, (_, i) => ({
                step: i + 1,
                fronts: Math.max(0, Math.round(stats.active_fronts * (1 - Math.abs(i - 4) / 10))),
              }))}
            >
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
        </div>

        <div className="panel chart-card">
          <h3>Weather Correlation</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={Array.from({ length: 10 }, (_, i) => ({
                step: i + 1,
                wind: Math.round(10 + Math.sin(i) * 8),
                spread: Math.round(5 + Math.cos(i * 0.7) * 4),
              }))}
            >
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
                dataKey="wind"
                stroke="var(--accent-water)"
                strokeWidth={2}
                dot={false}
                name="Wind km/h"
              />
              <Line
                type="monotone"
                dataKey="spread"
                stroke="var(--accent-fire)"
                strokeWidth={2}
                dot={false}
                name="Spread rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}