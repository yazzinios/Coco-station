import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

// ────────────────────────────────────────────────────────────
// Toast notification system
// ────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{
      position: 'fixed', bottom: '2rem', right: '2rem',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
      zIndex: 9999, maxWidth: '360px',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error'   ? 'rgba(255,71,87,0.15)' :
                      t.type === 'success' ? 'rgba(46,213,115,0.15)' :
                      'rgba(0,212,255,0.12)',
          border: `1px solid ${
            t.type === 'error'   ? 'rgba(255,71,87,0.4)'   :
            t.type === 'success' ? 'rgba(46,213,115,0.4)'  :
            'rgba(0,212,255,0.3)'
          }`,
          borderRadius: '10px', padding: '0.85rem 1.1rem',
          color: t.type === 'error'   ? '#ff4757' :
                 t.type === 'success' ? '#2ed573' : '#00d4ff',
          fontSize: '0.875rem', fontWeight: '500',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          cursor: 'pointer', animation: 'slideIn 0.25s ease',
        }} onClick={() => onRemove(t.id)}>
          <span style={{ fontSize: '1.1rem' }}>
            {t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}
          </span>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [decks, setDecks] = useState({
    a: { id:'a', name:'Castle',  track:null, volume:100, is_playing:false, is_paused:false },
    b: { id:'b', name:'Deck B',  track:null, volume:100, is_playing:false, is_paused:false },
    c: { id:'c', name:'Karting', track:null, volume:100, is_playing:false, is_paused:false },
    d: { id:'d', name:'Deck D',  track:null, volume:100, is_playing:false, is_paused:false },
  });
  const [library, setLibrary]           = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [mic, setMic]                   = useState({ active: false, targets: [] });
  const [wsConnected, setWsConnected]   = useState(false);
  const [settings, setSettings]         = useState({ ducking_percent: 5, mic_ducking_percent: 20 });
  const [toasts, setToasts]             = useState([]);
  const wsRef = useRef(null);
  const toastId = useRef(0);

  // ── Toast helpers ──────────────────────────────────────────
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Expose shorthand
  const toast = {
    info:    (msg) => addToast(msg, 'info'),
    success: (msg) => addToast(msg, 'success'),
    error:   (msg) => addToast(msg, 'error'),
  };

  // ── WebSocket ──────────────────────────────────────────────
  const connectWS = useCallback(() => {
    // Use same host/port — Vite proxy forwards /ws → ws://localhost:8000/ws in dev
    // In production, nginx proxies /ws to the API container
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;
    console.log('[WS] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setWsConnected(true);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        handleWsMessage(msg);
      } catch (_) {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('[WS] Disconnected – retrying in 3s');
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []); // eslint-disable-line

  function handleWsMessage(msg) {
    switch (msg.type) {
      case 'FULL_STATE':
        if (msg.decks) {
          const map = {};
          msg.decks.forEach(d => { map[d.id] = d; });
          setDecks(map);
        }
        if (msg.mic) setMic(msg.mic);
        if (msg.announcements) setAnnouncements(msg.announcements);
        break;
      case 'DECK_STATE':
        if (msg.decks) {
          const map = {};
          msg.decks.forEach(d => { map[d.id] = d; });
          setDecks(map);
        }
        break;
      case 'MIC_STATUS':
        setMic({ active: msg.active, targets: msg.targets || [] });
        break;
      case 'ANNOUNCEMENTS_UPDATED':
        if (msg.announcements) setAnnouncements(msg.announcements);
        break;
      case 'SETTINGS_UPDATED':
        if (msg.settings) setSettings(prev => ({ ...prev, ...msg.settings }));
        break;
      case 'FULL_STATE':
        if (msg.settings) setSettings(prev => ({ ...prev, ...msg.settings }));
        break;
      case 'LIBRARY_UPDATED':
        fetchLibrary();
        break;
      default:
        break;
    }
  }

  useEffect(() => {
    connectWS();
    fetchLibrary();
    fetchAnnouncements();
    return () => { wsRef.current?.close(); };
  }, []); // eslint-disable-line

  // ── API helpers ────────────────────────────────────────────
  async function parseError(res) {
    try {
      const data = await res.json();
      return data?.detail || data?.message || JSON.stringify(data);
    } catch (_) {
      return await res.text();
    }
  }

  async function fetchLibrary() {
    try {
      const res = await fetch('/api/library');
      if (res.ok) setLibrary(await res.json());
    } catch (_) {}
  }

  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) setAnnouncements(await res.json());
    } catch (_) {}
  }

  // Exposed API actions
  const api = {
    // Library
    uploadTrack: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/library/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json();
      await fetchLibrary();
      return data;
    },
    deleteTrack: async (filename) => {
      const res = await fetch(`/api/library/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseError(res));
      await fetchLibrary();
    },
    // Decks
    loadTrack: async (deckId, filename) => {
      const res = await fetch(`/api/decks/${deckId}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: filename }),
      });
      if (!res.ok) throw new Error(await parseError(res));
    },
    play: async (deckId) => {
      const res = await fetch(`/api/decks/${deckId}/play`, { method: 'POST' });
      if (!res.ok) throw new Error(await parseError(res));
    },
    pause: async (deckId) => {
      const res = await fetch(`/api/decks/${deckId}/pause`, { method: 'POST' });
      if (!res.ok) throw new Error(await parseError(res));
    },
    stop: async (deckId) => {
      const res = await fetch(`/api/decks/${deckId}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error(await parseError(res));
    },
    setVolume: async (deckId, volume) => {
      await fetch(`/api/decks/${deckId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: Math.round(volume) }),
      });
    },
    renameDeck: async (deckId, name) => {
      const res = await fetch(`/api/decks/${deckId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await parseError(res));
    },
    // Mic
    micOn: async (targets) => {
      const res = await fetch('/api/mic/on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      if (!res.ok) throw new Error(await parseError(res));
    },
    micOff: async () => {
      const res = await fetch('/api/mic/off', { method: 'POST' });
      if (!res.ok) throw new Error(await parseError(res));
    },
    // Announcements
    createTTS: async (payload) => {
      const res = await fetch('/api/announcements/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json();
      await fetchAnnouncements();
      return data;
    },
    uploadAnnouncement: async (file, name, targets, scheduledAt = null) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      fd.append('targets', targets.join(','));
      if (scheduledAt) fd.append('scheduled_at', scheduledAt);
      const res = await fetch('/api/announcements/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json();
      await fetchAnnouncements();
      return data;
    },
    playAnnouncement: async (id) => {
      const res = await fetch(`/api/announcements/${id}/play`, { method: 'POST' });
      if (!res.ok) throw new Error(await parseError(res));
      await fetchAnnouncements();
    },
    deleteAnnouncement: async (id) => {
      const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseError(res));
      await fetchAnnouncements();
    },
    // Settings
    saveSettings: async (settings) => {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings }),
      });
      if (!res.ok) throw new Error(await parseError(res));
    },
  };

  return (
    <AppContext.Provider value={{ decks, library, announcements, mic, wsConnected, settings, toast, api }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </AppContext.Provider>
  );
}
