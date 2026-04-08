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
import FoodLog from './FoodLog';
import FoodItemsPage from './FoodItemsPage';
import MedicationPage from './MedicationPage';
import SleepPage from './SleepPage';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ProfilePage from './ProfilePage';
import SharePage from './SharePage';
import RemindersPage from './RemindersPage';
import VitalsPage from './VitalsPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import TasksPage from './TasksPage';
import API_BASE from './apiBase';
import { authFetch, checkSession, clearAuthToken, getAuthToken } from './auth';

const TAB_DEFS = [
  { id: 'health', label: 'Health', to: '/' },
  { id: 'sleep', label: 'Sleep', to: '/sleep' },
  { id: 'vitals', label: 'Vitals', to: '/vitals' },
  { id: 'macros', label: 'Macros', to: '/macros' },
  { id: 'food', label: 'Food Log', to: '/food' },
  { id: 'medications', label: 'Medications', to: '/medications' },
  { id: 'journal', label: 'Journal', to: '/calendar' },
  { id: 'reminders', label: 'Reminders', to: '/reminders' },
  { id: 'tasks', label: 'Tasks', to: '/tasks' },
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

function App() {
  const [token, setToken] = useState(() => getAuthToken() ? 'authenticated' : null);
  const [healthApiUrl, setHealthApiUrl] = useState('');
  const [tabPrefs, setTabPrefs] = useState({ order: TAB_IDS, hidden: [] });
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(() => window.innerWidth <= 900);
  const [theme, setTheme] = useState(() => localStorage.getItem('aw_theme') || 'dark');
  const navigate = useNavigate();
  const location = useLocation();

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aw_theme', theme);
  }, [theme]);

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (token) {
      try {
        await authFetch(`${API_BASE}/api/profile`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: next }),
        });
      } catch {}
    }
  };

  /* Restore session from httpOnly cookie or stored token on mount */
  useEffect(() => {
    let active = true;
    checkSession().then(data => {
      if (!active) return;
      if (data) setToken('authenticated');
      else { clearAuthToken(); setToken(null); }
    });
    return () => { active = false; };
  }, []);

  const saveTabPrefs = async (next) => {
    const safe = sanitizeTabPrefs(next);
    setTabPrefs(safe);
    if (!token) return;
    try {
      await authFetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nav_tab_order: safe.order,
          nav_hidden_tabs: safe.hidden,
        }),
      });
    } catch (_) {
      // Keep local state even if persistence request fails transiently.
    }
  };

  const orderedTabs = useMemo(() => {
    const byId = Object.fromEntries(TAB_DEFS.map(t => [t.id, t]));
    return tabPrefs.order.map(id => byId[id]).filter(Boolean);
  }, [tabPrefs.order]);

  useEffect(() => {
    const onResize = () => setIsMobileNav(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, token]);

  useEffect(() => {
    if (!isMobileNav) setMobileMenuOpen(false);
  }, [isMobileNav]);

  useEffect(() => {
    if (!token) {
      setHealthApiUrl('');
      setTabPrefs({ order: TAB_IDS, hidden: [] });
      return;
    }
    let active = true;

    const loadProfileApiUrl = async () => {
      try {
        const response = await authFetch(`${API_BASE}/api/profile`, {
          credentials: 'include',
        });
        if (response.status === 401) {
          if (active) setToken(null);
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setHealthApiUrl(data?.health_auto_export_url || '');
        setTabPrefs(sanitizeTabPrefs({
          order: data?.nav_tab_order,
          hidden: data?.nav_hidden_tabs,
        }));
        if (data?.theme) setTheme(data.theme);
      } catch (_) {
        if (active) {
          setHealthApiUrl('');
          setTabPrefs({ order: TAB_IDS, hidden: [] });
        }
      }
    };

    loadProfileApiUrl();
    return () => { active = false; };
  }, [token]);

  const handleLogout = async () => {
    try { await authFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' }); } catch (_) {}
    clearAuthToken();
    setToken(null);
    setMobileMenuOpen(false);
    navigate('/login');
  };

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

        await authFetch(`${API_BASE}/api/health/import`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/reminder-sw.js`, {
        scope: `${process.env.PUBLIC_URL}/`,
      })
      .then(() => {
        try {
          const list = JSON.parse(localStorage.getItem('arfidwatch_reminders') || '[]');
          navigator.serviceWorker.ready.then(reg => {
            if (reg.active) reg.active.postMessage({ type: 'SET_REMINDERS', reminders: list });
          });
        } catch (_) {}
      })
      .catch(() => {});
  }, []);

  const reorderTabs = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (sourceId === 'settings' || targetId === 'settings') return;
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
    <div className="App">
      <nav>
        <div className="nav-left-group">
          <span className="nav-brand"><img src={process.env.PUBLIC_URL + '/logo32.png'} alt="" className="nav-brand-logo" />ArfidWatch</span>
          <button
            type="button"
            className={`nav-burger${mobileMenuOpen ? ' nav-burger--open' : ''}`}
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className="nav-burger-line" />
            <span className="nav-burger-line" />
            <span className="nav-burger-line" />
          </button>
        </div>
        {token ? (
          <div className={`nav-links${mobileMenuOpen ? ' nav-links--open' : ''}`}>
            {orderedTabs.map((tab, idx) => {
              const isSettings = tab.id === 'settings';
              const isDragging = draggedTabId === tab.id;
              const isDropTarget = dragOverTabId === tab.id && draggedTabId !== tab.id;
              return (
                <React.Fragment key={tab.id}>
                  <Link
                    to={tab.to}
                    className={`nav-tab-link${isDragging ? ' nav-tab-link--dragging' : ''}${isDropTarget ? ' nav-tab-link--drop-target' : ''}${location.pathname === tab.to ? ' nav-tab-link--active' : ''}`}
                    draggable={!isMobileNav && !isSettings}
                    onDragStart={() => { if (!isSettings) onTabDragStart(tab.id); }}
                    onDragEnd={onTabDragEnd}
                    onDragOver={(e) => {
                      if (isMobileNav || isSettings) return;
                      e.preventDefault();
                      if (dragOverTabId !== tab.id) setDragOverTabId(tab.id);
                    }}
                    onDrop={() => { if (!isSettings) onTabDrop(tab.id); }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {tab.label}
                  </Link>
                  {idx < orderedTabs.length - 1 ? <span className="nav-divider">|</span> : null}
                </React.Fragment>
              );
            })}
            <span className="nav-divider">|</span>
            <button onClick={handleLogout}>Log out</button>
            <button type="button" className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        ) : (
          <div className={`nav-links${mobileMenuOpen ? ' nav-links--open' : ''}`}>
            <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Login</Link>
            <span className="nav-divider">|</span>
            <Link to="/register" onClick={() => setMobileMenuOpen(false)}>Create Account</Link>
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
          path="/vitals"
          element={token ? <VitalsPage token={token} /> : <LoginPage setToken={setToken} />}
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
          path="/reminders"
          element={token ? <RemindersPage token={token} /> : <LoginPage setToken={setToken} />}
        />
        <Route
          path="/tasks"
          element={token ? <TasksPage /> : <LoginPage setToken={setToken} />}
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
