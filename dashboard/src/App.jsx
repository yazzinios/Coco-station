import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import MixerPage from './pages/MixerPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import SchedulesPage from './pages/SchedulesPage';
import { useApp } from './context/AppContext';

function AppHeader({ onMenuToggle }) {
  const { wsConnected } = useApp();
  return (
    <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: '600' }} className="app-title">
        CocoStation
      </h1>
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
    </header>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-container">

      {/* Hamburger toggle — only visible on mobile via CSS */}
      <button
        className="mobile-nav-toggle"
        onClick={() => setSidebarOpen(v => !v)}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Dimmed overlay when sidebar is open on mobile */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <div className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <Sidebar onNavClick={closeSidebar} />
      </div>

      {/* Main content */}
      <main className="main-content">
        <AppHeader />
        <Routes>
          <Route path="/"              element={<MixerPage />} />
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

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
