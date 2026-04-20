import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import SessionGuard from './components/SessionGuard';
import MixerPage from './pages/MixerPage';
import LibraryPage from './pages/LibraryPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import SchedulesPage from './pages/SchedulesPage';
import RequestPage from './pages/RequestPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import { useApp } from './context/useApp';

function AppHeader() {
  const { wsConnected, currentUser, logout } = useApp();
  return (
    <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: '600' }} className="app-title">
        CocoStation
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Live indicator */}
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

        {/* User badge + role pill + sign out */}
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Role pill */}
            <span style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              background: currentUser.is_super_admin ? 'rgba(255,215,0,0.12)' :
                          currentUser.role === 'admin' ? 'rgba(253,150,68,0.12)' :
                          'rgba(0,212,255,0.10)',
              color: currentUser.is_super_admin ? '#ffd700' :
                     currentUser.role === 'admin' ? '#fd9644' :
                     'var(--accent-blue)',
              border: `1px solid ${
                currentUser.is_super_admin ? 'rgba(255,215,0,0.3)' :
                currentUser.role === 'admin' ? 'rgba(253,150,68,0.3)' :
                'rgba(0,212,255,0.25)'
              }`,
            }}>
              {currentUser.is_super_admin ? '⭐ Super Admin' : currentUser.role || 'operator'}
            </span>

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
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,71,87,0.1)';
                e.currentTarget.style.color = '#ff4757';
                e.currentTarget.style.borderColor = 'rgba(255,71,87,0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.borderColor = 'var(--panel-border)';
              }}
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
          {/* Mixer — always accessible when logged in */}
          <Route path="/" element={<MixerPage />} />

          {/* Feature-gated pages — URL-level protection */}
          <Route path="/library" element={
            <ProtectedRoute feature="can_library"><LibraryPage /></ProtectedRoute>
          } />
          <Route path="/announcements" element={
            <ProtectedRoute feature="can_announce"><AnnouncementsPage /></ProtectedRoute>
          } />
          <Route path="/schedules" element={
            <ProtectedRoute feature="can_schedule"><SchedulesPage /></ProtectedRoute>
          } />
          <Route path="/stats" element={
            <ProtectedRoute feature="can_requests"><StatisticsPage /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute feature="can_settings"><SettingsPage /></ProtectedRoute>
          } />

          {/* Admin-only pages */}
          <Route path="/users" element={
            <ProtectedRoute elevated><UsersPage /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Session expiry warning — visible on all protected pages */}
      <SessionGuard />
    </div>
  );
}

function ProtectedLayout() {
  const { currentUser, login } = useApp();
  if (!currentUser) return <LoginPage onLogin={login} />;
  return <AppLayout />;
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* /request is always public */}
          <Route path="/request" element={<RequestPage />} />
          {/* Everything else requires login */}
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
