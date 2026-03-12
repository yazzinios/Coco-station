import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MixerPage from './pages/MixerPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import StatisticsPage from './pages/StatisticsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

function App() {
  // Placeholder: Authentication check logic will go here
  const isAuthenticated = true;

  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>CocoStation Dashboard</h1>
            <div className="user-indicator">
              <span style={{ color: 'var(--accent-blue)', fontSize: '0.9rem' }}>● Live</span>
            </div>
          </header>
          
          <Routes>
            <Route path="/" element={<MixerPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/stats" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
