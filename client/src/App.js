import React, { useState } from 'react';
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
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ProfilePage from './ProfilePage';
import SharePage from './SharePage';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const navigate = useNavigate();
  const location = useLocation();
  const isExport = location.pathname === '/export';

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    navigate('/login');
  };

  return (
    <div className={isExport ? 'App App--export' : 'App'}>
      <nav>
        <span className="nav-brand">📊 ArfidWatch</span>
        {token ? (
          <div className="nav-links">
            <Link to="/">Health</Link>
            <span className="nav-divider">|</span>
            <Link to="/macros">Macros</Link>
            <span className="nav-divider">|</span>
            <Link to="/food">Food Log</Link>
            <span className="nav-divider">|</span>
            <Link to="/calendar">Journal</Link>
            <span className="nav-divider">|</span>
            <Link to="/export">Export</Link>
            <span className="nav-divider">|</span>
            <Link to="/profile">Profile</Link>
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
          path="/food"
          element={token ? <FoodItemsPage token={token} /> : <LoginPage setToken={setToken} />}
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
      </Routes>
    </div>
  );
}

export default App;
