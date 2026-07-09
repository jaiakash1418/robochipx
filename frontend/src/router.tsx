import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'weather', element: <div className="page-placeholder"><h2>Weather Center</h2><p>Coming soon</p></div> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'assistant', element: <div className="page-placeholder"><h2>AI Console</h2><p>Coming soon</p></div> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);