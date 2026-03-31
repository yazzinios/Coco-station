import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext(null);
export function useApp() { return useContext(AppContext); }

function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 9999, maxWidth: '360px' }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => onRemove(t.id)} style={{
          background: t.type === 'error' ? 'rgba(255,71,87,0.15)' : t.type === 'success' ? 'rgba(46,213,115,0.15)' : 'rgba(0,212,255,0.12)',
          border: `1px solid ${t.type === 'error' ? 'rgba(255,71,87,0.4)' : t.type === 'success' ? 'rgba(46,213,115,0.4)' : 'rgba(0,212,255,0.3)'}`,
          borderRadius: '10px', padding: '0.85rem 1.1rem',
          color: t.type === 'error' ? '#ff4757' : t.type === 'success' ? '#2ed573' : '#00d4ff',
          fontSize: '0.875rem', fontWeight: '500', backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '0.75rem',
          cursor: 'pointer', animation: 'slideIn 0.25s ease',
        }}>
          <span style={{ fontSize: '1.1rem' }}>{t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}

const DEFAULT_DECK = (id, name) => ({
  id, name, track: null, volume: 100, is_playing: false, is_paused: false, is_loop: false,
});

export function AppProvider({ children }) {
  const [decks, setDecks] = useState({
    a: DEFAULT_DECK('a', 'Castle'),
    b: DEFAULT_DECK('b', 'Deck B'),
    c: DEFAULT_DECK('c', 'Karting'),
    d: DEFAULT_DECK('d', 'Deck D'),
  });
  const [library,                   setLibrary]                   = useState([]);
  const [announcements,             setAnnouncements]             = useState([]);
  const [playlists,                 setPlaylists]                 = useState([]);
  const [musicSchedules,            setMusicSchedules]            = useState([]);
  const [recurringSchedules,        setRecurringSchedules]        = useState([]);
  const [recurringMixerSchedules,   setRecurringMixerSchedules]   = useState([]);  // ← NEW
  const [mic,                       setMic]                       = useState({ active: false, targets: [] });
  const [wsConnected,               setWsConnected]               = useState(false);
  const [settings,                  setSettings]                  = useState({ ducking_percent: 5, mic_ducking_percent: 20, on_air_chime_enabled: false });
  const [toasts,                    setToasts]                    = useState([]);
  const wsRef   = useRef(null);
  const toastId = useRef(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const toast = {
    info:    (msg) => addToast(msg, 'info'),
    success: (msg) => addToast(msg, 'success'),
    error:   (msg) => addToast(msg, 'error'),
  };

  function buildWsUrl(path = '/ws') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host     = window.location.host;

    if (import.meta.env.VITE_WS_URL) {
      const envUrl    = import.meta.env.VITE_WS_URL;
      const isInternal = envUrl.includes('172.') || envUrl.includes('192.') || envUrl.includes('10.') || envUrl.includes('localhost');
      if (!isInternal) {
        const base = envUrl.replace(/\/+$/, '');
        if (base.startsWith('ws://') || base.startsWith('wss://')) return `${base}${path}`;
        if (base.startsWith('http://'))  return `ws://${base.slice(7)}${path}`;
        if (base.startsWith('https://')) return `wss://${base.slice(8)}${path}`;
        return `wss://${base}${path}`;
      }
    }
    return `${protocol}://${host}${path}`;
  }

  const handleWsMessageRef = useRef(null);

  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'FULL_STATE':
        if (msg.decks) {
          const m = {};
          msg.decks.forEach(d => { m[d.id] = { is_loop: false, playlist_id: null, playlist_index: null, playlist_loop: false, ...d }; });
          setDecks(m);
        }
        if (msg.mic)           setMic(msg.mic);
        if (msg.announcements) setAnnouncements(msg.announcements);
        if (msg.settings)        setSettings(prev => ({ ...prev, ...msg.settings }));
        if (msg.playlists)        setPlaylists(msg.playlists);
        if (msg.music_schedules)  setMusicSchedules(msg.music_schedules);
        if (msg.recurring_schedules)       setRecurringSchedules(msg.recurring_schedules);
        if (msg.recurring_mixer_schedules) setRecurringMixerSchedules(msg.recurring_mixer_schedules);  // ← NEW
        break;
      case 'DECK_STATE':
        if (msg.decks) {
          const m = {};
          msg.decks.forEach(d => { m[d.id] = { is_loop: false, ...d }; });
          setDecks(m);
        }
        break;
      case 'MIC_STATUS':            setMic({ active: msg.active, targets: msg.targets || [] }); break;
      case 'ANNOUNCEMENTS_UPDATED': if (msg.announcements) setAnnouncements(msg.announcements); break;
      case 'SETTINGS_UPDATED':      if (msg.settings) setSettings(prev => ({ ...prev, ...msg.settings })); break;
      case 'LIBRARY_UPDATED':       fetchLibrary(); break;
      case 'PLAYLISTS_UPDATED':        if (msg.playlists)  setPlaylists(msg.playlists); break;
      case 'MUSIC_SCHEDULES_UPDATED':  if (msg.schedules) setMusicSchedules(msg.schedules); break;
      case 'RECURRING_SCHEDULES_UPDATED':       if (msg.schedules) setRecurringSchedules(msg.schedules); break;
      case 'RECURRING_MIXER_SCHEDULES_UPDATED': if (msg.schedules) setRecurringMixerSchedules(msg.schedules); break;  // ← NEW
      default: break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  handleWsMessageRef.current = handleWsMessage;

  const connectWS = useCallback(() => {
    const wsUrl = buildWsUrl('/ws');
    console.log('[WS] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => { console.log('[WS] Connected'); setWsConnected(true); };
    ws.onmessage = (evt) => { try { handleWsMessageRef.current(JSON.parse(evt.data)); } catch (_) {} };
    ws.onclose   = () => { setWsConnected(false); console.log('[WS] Disconnected – retrying in 3s'); setTimeout(connectWS, 3000); };
    ws.onerror   = () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectWS();
    fetchLibrary();
    fetchAnnouncements();
    fetchPlaylists();
    fetchRecurringSchedules();
    fetchRecurringMixerSchedules();  // ← NEW
    return () => { wsRef.current?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function parseError(res) {
    try { const d = await res.json(); return d?.detail || d?.message || JSON.stringify(d); }
    catch (_) { return await res.text(); }
  }
  async function fetchLibrary() {
    try { const r = await fetch('/api/library'); if (r.ok) setLibrary(await r.json()); } catch (_) {}
  }
  async function fetchAnnouncements() {
    try { const r = await fetch('/api/announcements'); if (r.ok) setAnnouncements(await r.json()); } catch (_) {}
  }
  async function fetchPlaylists() {
    try { const r = await fetch('/api/playlists'); if (r.ok) setPlaylists(await r.json()); } catch (_) {}
  }
  async function fetchRecurringSchedules() {
    try { const r = await fetch('/api/recurring-schedules'); if (r.ok) setRecurringSchedules(await r.json()); } catch (_) {}
  }
  // ── NEW ──────────────────────────────────────────────────────────────────────
  async function fetchRecurringMixerSchedules() {
    try { const r = await fetch('/api/recurring-mixer-schedules'); if (r.ok) setRecurringMixerSchedules(await r.json()); } catch (_) {}
  }

  const api = {
    uploadTrack: async (file) => {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/library/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchLibrary(); return r.json();
    },
    deleteTrack: async (filename) => {
      const r = await fetch(`/api/library/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchLibrary();
    },
    loadTrack: async (deckId, filename) => {
      const r = await fetch(`/api/decks/${deckId}/load`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: filename }),
      });
      if (!r.ok) throw new Error(await parseError(r));
    },
    unloadTrack: async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/unload`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    play:  async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/play`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    pause: async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/pause`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    stop:  async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/stop`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    loop: async (deckId, loopEnabled) => {
      const r = await fetch(`/api/decks/${deckId}/loop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loop: loopEnabled }),
      });
      if (!r.ok) throw new Error(await parseError(r));
      setDecks(prev => ({ ...prev, [deckId]: { ...prev[deckId], is_loop: loopEnabled } }));
    },
    setVolume: async (deckId, volume) => {
      await fetch(`/api/decks/${deckId}/volume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: Math.round(volume) }),
      });
    },
    renameDeck: async (deckId, name) => {
      const r = await fetch(`/api/decks/${deckId}/name`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error(await parseError(r));
    },
    micOn: async (targets) => {
      const r = await fetch('/api/mic/on', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      if (!r.ok) throw new Error(await parseError(r));
    },
    micOff: async () => {
      const r = await fetch('/api/mic/off', { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    createTTS: async (payload) => {
      const r = await fetch('/api/announcements/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchAnnouncements(); return r.json();
    },
    uploadAnnouncement: async (file, name, targets, scheduledAt = null) => {
      const fd = new FormData(); fd.append('file', file); fd.append('name', name); fd.append('targets', targets.join(','));
      if (scheduledAt) fd.append('scheduled_at', scheduledAt);
      const r = await fetch('/api/announcements/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchAnnouncements(); return r.json();
    },
    playAnnouncement: async (id) => {
      const r = await fetch(`/api/announcements/${id}/play`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchAnnouncements();
    },
    deleteAnnouncement: async (id) => {
      const r = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchAnnouncements();
    },
    updateAnnouncement: async (id, payload) => {
      const r = await fetch(`/api/announcements/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchAnnouncements();
      return r.json();
    },
    getListeners: async () => {
      const r = await fetch('/api/listeners');
      if (!r.ok) return { total: 0, decks: {}, paths: {} };
      return r.json();
    },
    saveSettings: async (s) => {
      const r = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: s }),
      });
      if (!r.ok) throw new Error(await parseError(r));
    },
    buildWsUrl,
    // ── Playlists ──
    createPlaylist: async (name, tracks) => {
      const r = await fetch('/api/playlists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tracks }),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchPlaylists(); return r.json();
    },
    updatePlaylist: async (id, name, tracks) => {
      const r = await fetch(`/api/playlists/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tracks }),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchPlaylists();
    },
    deletePlaylist: async (id) => {
      const r = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchPlaylists();
    },
    loadPlaylist: async (deckId, playlistId, loop = false) => {
      const r = await fetch(`/api/decks/${deckId}/playlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId, loop }),
      });
      if (!r.ok) throw new Error(await parseError(r));
    },
    // ── Chime ──
    uploadChime: async (file) => {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/settings/chime/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    deleteChime: async () => {
      const r = await fetch('/api/settings/chime', { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    getChimeStatus: async () => {
      const r = await fetch('/api/settings/chime/status');
      if (!r.ok) return { exists: false, enabled: false };
      return r.json();
    },
    // ── Music Schedules ──
    createMusicSchedule: async (payload) => {
      const r = await fetch('/api/music-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    deleteMusicSchedule: async (id) => {
      const r = await fetch(`/api/music-schedules/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    triggerMusicSchedule: async (id) => {
      const r = await fetch(`/api/music-schedules/${id}/trigger`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    // ── Recurring Schedules (Mic & Announcements) ──
    createRecurringSchedule: async (payload) => {
      const r = await fetch('/api/recurring-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    updateRecurringSchedule: async (id, payload) => {
      const r = await fetch(`/api/recurring-schedules/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    deleteRecurringSchedule: async (id) => {
      const r = await fetch(`/api/recurring-schedules/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    // ── Recurring Mixer Schedules (Music / Deck) ── NEW ──────────────────────
    createRecurringMixerSchedule: async (payload) => {
      const r = await fetch('/api/recurring-mixer-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchRecurringMixerSchedules();
      return r.json();
    },
    updateRecurringMixerSchedule: async (id, payload) => {
      const r = await fetch(`/api/recurring-mixer-schedules/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchRecurringMixerSchedules();
      return r.json();
    },
    deleteRecurringMixerSchedule: async (id) => {
      const r = await fetch(`/api/recurring-mixer-schedules/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
      await fetchRecurringMixerSchedules();
    },
  };

  return (
    <AppContext.Provider value={{
      decks, library, announcements, playlists, musicSchedules,
      recurringSchedules, recurringMixerSchedules,
      mic, wsConnected, settings, toast, api,
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </AppContext.Provider>
  );
}
