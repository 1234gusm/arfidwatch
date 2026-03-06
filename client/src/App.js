import React, { useEffect, useMemo, useState } from 'react';
import {
  Routes,
  Route,
  Link,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import './App.css';
import HealthPage from './HealthPage';
import CalendarPage from './CalendarPage';
import ExportPage from './ExportPage';
import FoodLog from './FoodLog';
import FoodItemsPage from './FoodItemsPage';
import MedicationPage from './MedicationPage';
import SleepPage from './SleepPage';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ProfilePage from './ProfilePage';
import SharePage from './SharePage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import API_BASE from './apiBase';

const NAV_PREFS_KEY = 'navTabPrefs_v1';

const TAB_DEFS = [
  { id: 'health', label: 'Health', to: '/' },
  { id: 'sleep', label: 'Sleep', to: '/sleep' },
  { id: 'macros', label: 'Macros', to: '/macros' },
  { id: 'food', label: 'Food Log', to: '/food' },
  { id: 'medications', label: 'Medications', to: '/medications' },
  { id: 'journal', label: 'Journal', to: '/calendar' },
  { id: 'export', label: 'Export', to: '/export' },
  { id: 'settings', label: 'Settings', to: '/profile' },
];

const TAB_IDS = TAB_DEFS.map(t => t.id);

const sanitizeTabPrefs = (raw) => {
  const rawOrder = Array.isArray(raw?.order) ? raw.order : [];
  const validOrder = rawOrder.filter(id => TAB_IDS.includes(id));
  const seen = new Set(validOrder);
  const missing = TAB_IDS.filter(id => !seen.has(id));
  const order = [...validOrder, ...missing];

  const rawHidden = Array.isArray(raw?.hidden) ? raw.hidden : [];
  const hidden = rawHidden.filter(id => TAB_IDS.includes(id));

  return { order, hidden };
};

const loadTabPrefs = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(NAV_PREFS_KEY) || '{}');
    return sanitizeTabPrefs(parsed);
  } catch (_) {
    return { order: TAB_IDS, hidden: [] };
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [autoPullStatus, setAutoPullStatus] = useState(null);
  const [healthApiUrl, setHealthApiUrl] = useState(() => localStorage.getItem('apiUrl') || '');
  const [tabPrefs, setTabPrefs] = useState(() => loadTabPrefs());
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isExport = location.pathname === '/export';


  const saveTabPrefs = (next) => {
    const safe = sanitizeTabPrefs(next);
    setTabPrefs(safe);
    localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(safe));
  };

  const orderedTabs = useMemo(() => {
    const byId = Object.fromEntries(TAB_DEFS.map(t => [t.id, t]));
    return tabPrefs.order.map(id => byId[id]).filter(Boolean);
  }, [tabPrefs.order]);

  useEffect(() => {
    if (!token) {
      setAutoPullStatus(null);
      return undefined;
    }

    let active = true;

    const loadStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/health/auto-pull/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setAutoPullStatus(data || null);
      } catch (_) {
        if (active) setAutoPullStatus(null);
      }
    };

    loadStatus();
    const timer = setInterval(loadStatus, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  const showAutoPullBadge = Boolean(token && autoPullStatus && autoPullStatus.configured);
  const isAutoPullHealthy = Boolean(
    autoPullStatus &&
    autoPullStatus.enabled &&
    autoPullStatus.configured &&
    !autoPullStatus.last_error
  );
  const autoPullBadgeClass = isAutoPullHealthy
    ? 'auto-pull-badge auto-pull-badge--ok'
    : 'auto-pull-badge auto-pull-badge--warn';
  const autoPullBadgeText = isAutoPullHealthy
    ? 'Sync On'
    : autoPullStatus && !autoPullStatus.enabled
      ? 'Sync Off'
      : 'Sync Issue';

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    navigate('/login');
  };

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'apiUrl') setHealthApiUrl(e.newValue || '');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!token || !healthApiUrl) return undefined;

    let active = true;

    const syncHealthAutoExport = async () => {
      try {
        const resp = await fetch(healthApiUrl);
        const text = await resp.text();
        if (!active) return;

        let payload = null;
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) payload = { samples: parsed };
          else if (parsed && Array.isArray(parsed.samples)) payload = { samples: parsed.samples };
          else payload = { csv: text };
        } catch (_) {
          payload = { csv: text };
        }

        await fetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (_) {
        // Silent background sync to avoid noisy UX if source is intermittently unavailable.
      }
    };

    syncHealthAutoExport();
    const timer = setInterval(syncHealthAutoExport, 5 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, healthApiUrl]);


  const reorderTabs = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const order = [...tabPrefs.order];
    const sourceIdx = order.indexOf(sourceId);
    const targetIdx = order.indexOf(targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const [moved] = order.splice(sourceIdx, 1);
    order.splice(targetIdx, 0, moved);
    saveTabPrefs({ ...tabPrefs, order });
  };

  const onTabDragStart = (id) => {
    setDraggedTabId(id);
    setDragOverTabId(id);
  };

  const onTabDrop = (targetId) => {
    reorderTabs(draggedTabId, targetId);
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const onTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };


  return (
    <div className={isExport ? 'App App--export' : 'App'}>
      <nav>
        <div className="nav-left-group">
          <span className="nav-brand">📊 ArfidWatch</span>
        </div>
        {token ? (
          <div className="nav-links">
            {showAutoPullBadge ? (
              <span
                className={autoPullBadgeClass}
                title={
                  autoPullStatus.last_error
                    ? `Auto pull error: ${autoPullStatus.last_error}`
                    : 'Auto pull status'
                }
              >
                {autoPullBadgeText}
              </span>
            ) : null}
            {orderedTabs.map((tab, idx) => {
              const isDragging = draggedTabId === tab.id;
              const isDropTarget = dragOverTabId === tab.id && draggedTabId !== tab.id;
              return (
                <React.Fragment key={tab.id}>
                  <Link
                    to={tab.to}
                    className={`nav-tab-link${isDragging ? ' nav-tab-link--dragging' : ''}${isDropTarget ? ' nav-tab-link--drop-target' : ''}`}
                    draggable
                    onDragStart={() => onTabDragStart(tab.id)}
                    onDragEnd={onTabDragEnd}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverTabId !== tab.id) setDragOverTabId(tab.id);
                    }}
                    onDrop={() => onTabDrop(tab.id)}
                  >
                    {tab.label}
                  </Link>
                  {idx < orderedTabs.length - 1 ? <span className="nav-divider">|</span> : null}
                </React.Fragment>
              );
            })}
            <span className="nav-divider">|</span>
            <button onClick={handleLogout}>Log out</button>
          </div>
        ) : (
          <div className="nav-links">
            <Link to="/login">Login</Link>
            <span className="nav-divider">|</span>
            <Link to="/register">Create Account</Link>
          </div>
        )}
      </nav>
      <Routes>
        <Route
          path="/"
          element={token ? <HealthPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/macros"
          element={token ? <FoodLog token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/sleep"
          element={token ? <SleepPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/food"
          element={token ? <FoodItemsPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/medications"
          element={token ? <MedicationPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/calendar"
          element={token ? <CalendarPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/export"
          element={token ? <ExportPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/profile"
          element={token ? <ProfilePage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route path="/share/:shareToken" element={<SharePage />} />
        <Route path="/login" element={<LoginPage setToken={setToken} />} />
        <Route path="/register" element={<RegisterPage setToken={setToken} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </div>
  );
}

export default App;
