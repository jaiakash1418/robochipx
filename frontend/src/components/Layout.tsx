import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  CloudSun,
  Bell,
  Bot,
  Settings,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import { ToastProvider } from '../toast/ToastContext';
import { useSimulation } from '../context/SimulationContext';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/weather', label: 'Weather', icon: CloudSun },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/assistant', label: 'AI', icon: Bot },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function TopNav() {
  const { state } = useSimulation();
  const alertCount = state.alerts.length;

  return (
    <nav className="topnav">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
        >
          <Icon size={16} />
          <span>{label}</span>
          {label === 'Alerts' && alertCount > 0 && (
            <span className="topnav-badge">{alertCount}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  return (
    <ToastProvider>
      <div className="app-layout">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-brand">
              <img src="/logo.jpeg" alt="Logo" className="brand-logo" />
              <span className="brand-text">FIRE GUARD</span>
            </div>
            <TopNav />
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}