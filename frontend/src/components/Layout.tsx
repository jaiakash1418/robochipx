import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  BarChart3,
  CloudSun,
  Bell,
  Bot,
  Settings,
  Activity,
  Beaker,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import * as api from '../api/endpoints';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import { useSimulation } from '../context/SimulationContext';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/weather', label: 'Weather', icon: CloudSun },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/assistant', label: 'AI Agent', icon: Bot },
  { to: '/health', label: 'Health', icon: Activity },
  { to: '/hackathon', label: 'Hackathon', icon: Beaker },
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

function BackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await api.healthCheck();
        if (mounted) setOnline(true);
      } catch {
        if (mounted) setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <button
      className="backend-status-btn"
      onClick={() => navigate('/health')}
      title={online === true ? 'Backend connected' : online === false ? 'Backend offline' : 'Checking...'}
    >
      <span className={`backend-status-dot ${online === true ? 'online' : online === false ? 'offline' : ''}`} />
      <span className="backend-status-label">{online === true ? 'Live' : online === false ? 'Offline' : '...'}</span>
    </button>
  );
}

export default function Layout() {
  const location = useLocation();

  return (
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
          <BackendStatus />
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="app-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
