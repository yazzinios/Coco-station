import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import MixerPage from './pages/MixerPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import { useApp } from './context/AppContext';

function AppHeader() {
  const { wsConnected } = useApp();
  return (
    <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: '600' }}>CocoStation</h1>
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
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <AppHeader />
        <Routes>
          <Route path="/"              element={<MixerPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
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
