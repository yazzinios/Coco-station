import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import MixerPage from './pages/MixerPage';
import LibraryPage from './pages/LibraryPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import SchedulesPage from './pages/SchedulesPage';
import RequestPage from './pages/RequestPage';
import LoginPage from './pages/LoginPage';
import { useApp } from './context/useApp';

function AppHeader() {
  const { wsConnected, currentUser, logout } = useApp();
  return (
    <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: '600' }} className="app-title">
        CocoStation
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: wsConnected ? 'var(--success)' : '#666',
            boxShadow: wsConnected ? '0 0 8px var(--success)' : 'none',
            transition: 'all 0.3s'
          }} />
          <span style={{ color: wsConnected ? 'var(--success)' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '500' }}>
            {wsConnected ? 'Live' : 'Connecting…'}
          </span>
        </div>
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {currentUser.display_name || currentUser.username}
            </span>
            <button
              onClick={logout}
              title="Sign out"
              style={{
                padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid var(--panel-border)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.1)'; e.currentTarget.style.color = '#ff4757'; e.currentTarget.style.borderColor = 'rgba(255,71,87,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--panel-border)'; }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-container">
      <button className="mobile-nav-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle navigation">
        {sidebarOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={closeSidebar} />
      <div className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <Sidebar onNavClick={closeSidebar} />
      </div>
      <main className="main-content">
        <AppHeader />
        <Routes>
          <Route path="/"              element={<MixerPage />} />
          <Route path="/library"       element={<LibraryPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/schedules"     element={<SchedulesPage />} />
          <Route path="/stats"         element={<StatisticsPage />} />
          <Route path="/settings"      element={<SettingsPage />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// Guard — redirects to /login if not authenticated
function ProtectedLayout() {
  const { currentUser, login } = useApp();

  if (!currentUser) {
    return <LoginPage onLogin={login} />;
  }
  return <AppLayout />;
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* /request is always public — no auth required */}
          <Route path="/request" element={<RequestPage />} />
          {/* Everything else requires login */}
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
