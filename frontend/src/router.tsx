import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';
import WeatherPage from './pages/WeatherPage';
import HealthPage from './pages/HealthPage';
import EvaluationPage from './pages/EvaluationPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'weather', element: <WeatherPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'assistant', element: <div className="page-placeholder"><h2>AI Console</h2><p>Coming soon</p></div> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'health', element: <HealthPage /> },
      { path: 'evaluation', element: <EvaluationPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);