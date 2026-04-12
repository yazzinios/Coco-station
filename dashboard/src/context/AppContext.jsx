import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppContext } from './AppContextInstance';

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

const TOAST_DURATION = 5000; // ms

const TOAST_CONFIG = {
  success: {
    accent:  '#2ed573',
    glow:    'rgba(46,213,115,0.18)',
    border:  'rgba(46,213,115,0.35)',
    icon:    '✓',
  },
  error: {
    accent:  '#ff4757',
    glow:    'rgba(255,71,87,0.18)',
    border:  'rgba(255,71,87,0.35)',
    icon:    '✕',
  },
  info: {
    accent:  '#00d4ff',
    glow:    'rgba(0,212,255,0.15)',
    border:  'rgba(0,212,255,0.3)',
    icon:    'ℹ',
  },
  warning: {
    accent:  '#fd9644',
    glow:    'rgba(253,150,68,0.18)',
    border:  'rgba(253,150,68,0.35)',
    icon:    '⚠',
  },
};

function Toast({ toast, onRemove }) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting]   = useState(false);
  const cfg = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;

  // Shrinking progress bar
  useEffect(() => {
    const start    = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct     = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(pct);
      if (pct === 0) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // Trigger exit animation then actually remove
  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 280);
  }, [toast.id, onRemove]);

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(dismiss, TOAST_DURATION);
    return () => clearTimeout(t);
  }, [dismiss]);

  return (
    <div
      style={{
        position:       'relative',
        background:     `rgba(18,18,22,0.92)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border:         `1px solid ${cfg.border}`,
        borderLeft:     `3px solid ${cfg.accent}`,
        borderRadius:   '10px',
        padding:        '0.85rem 1rem 0.85rem 1rem',
        boxShadow:      `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 0 20px ${cfg.glow}`,
        display:        'flex',
        alignItems:     'flex-start',
        gap:            '0.75rem',
        minWidth:       '300px',
        maxWidth:       '380px',
        overflow:       'hidden',
        animation:      exiting
          ? 'toastExit 0.28s cubic-bezier(0.4,0,1,1) forwards'
          : 'toastEnter 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
        cursor:         'default',
      }}
    >
      {/* Icon bubble */}
      <div style={{
        width:          '28px',
        height:         '28px',
        borderRadius:   '50%',
        background:     cfg.glow,
        border:         `1px solid ${cfg.border}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       '0.85rem',
        color:          cfg.accent,
        flexShrink:     0,
        marginTop:      '1px',
        fontWeight:     '700',
      }}>
        {cfg.icon}
      </div>

      {/* Message */}
      <div style={{ flex: 1, fontSize: '0.855rem', lineHeight: '1.45', color: '#e8e8e8', paddingTop: '3px' }}>
        {toast.message}
      </div>

      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          background:  'none',
          border:      'none',
          color:       'rgba(255,255,255,0.3)',
          cursor:      'pointer',
          fontSize:    '0.95rem',
          lineHeight:  1,
          padding:     '2px 4px',
          borderRadius:'4px',
          flexShrink:  0,
          transition:  'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
        aria-label="Dismiss"
      >
        ✕
      </button>

      {/* Progress bar */}
      <div style={{
        position:     'absolute',
        bottom:       0,
        left:         0,
        height:       '2px',
        width:        `${progress}%`,
        background:   cfg.accent,
        borderRadius: '0 0 0 10px',
        transition:   'width 0.03s linear',
        opacity:      0.7,
      }} />
    </div>
  );
}

function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;
  return (
    <>
      <style>{`
        @keyframes toastEnter {
          from { opacity: 0; transform: translateX(110%) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        @keyframes toastExit {
          from { opacity: 1; transform: translateX(0)    scale(1);    max-height: 120px; margin-bottom: 0.75rem; }
          to   { opacity: 0; transform: translateX(110%) scale(0.95); max-height: 0;     margin-bottom: 0;       }
        }
      `}</style>
      <div style={{
        position:      'fixed',
        bottom:        '1.5rem',
        right:         '1.5rem',
        display:       'flex',
        flexDirection: 'column',
        gap:           '0.65rem',
        zIndex:        9999,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <Toast toast={t} onRemove={onRemove} />
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [recurringMixerSchedules,   setRecurringMixerSchedules]   = useState([]);
  const [mic,                       setMic]                       = useState({ active: false, targets: [] });
  const [musicRequests,              setMusicRequests]              = useState([]);
  const [wsConnected,               setWsConnected]               = useState(false);
  const [settings,                  setSettings]                  = useState({ ducking_percent: 5, mic_ducking_percent: 20, on_air_chime_enabled: false });
  const [schedulerStatus,           setSchedulerStatus]           = useState(null);
  const [toasts,                    setToasts]                    = useState([]);
  const wsRef   = useRef(null);
  const toastId = useRef(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // cap at 5 visible
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const toast = {
    info:    (msg) => addToast(msg, 'info'),
    success: (msg) => addToast(msg, 'success'),
    error:   (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
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

  const fetchLibrary = useCallback(async () => {
    try {
      const r = await fetch('/api/library');
      if (r.ok) setLibrary(await r.json());
    } catch { }
  }, []);
  const fetchAnnouncements = useCallback(async () => {
    try {
      const r = await fetch('/api/announcements');
      if (r.ok) setAnnouncements(await r.json());
    } catch { }
  }, []);
  const fetchPlaylists = useCallback(async () => {
    try {
      const r = await fetch('/api/playlists');
      if (r.ok) setPlaylists(await r.json());
    } catch { }
  }, []);
  const fetchRecurringSchedules = useCallback(async () => {
    try {
      const r = await fetch('/api/recurring-schedules');
      if (r.ok) setRecurringSchedules(await r.json());
    } catch { }
  }, []);
  const fetchRecurringMixerSchedules = useCallback(async () => {
    try {
      const r = await fetch('/api/recurring-mixer-schedules');
      if (r.ok) setRecurringMixerSchedules(await r.json());
    } catch { }
  }, []);
  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/scheduler/status');
      if (r.ok) setSchedulerStatus(await r.json());
    } catch { }
  }, []);

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
        if (msg.recurring_mixer_schedules) setRecurringMixerSchedules(msg.recurring_mixer_schedules);
        if (msg.music_requests) setMusicRequests(msg.music_requests);
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
      case 'RECURRING_MIXER_SCHEDULES_UPDATED': if (msg.schedules) setRecurringMixerSchedules(msg.schedules); break;
      case 'REQUESTS_UPDATED': if (msg.requests) setMusicRequests(msg.requests); break;
      case 'NOTIFICATION':
        if (msg.message) {
          const type = msg.style === 'error' ? 'error' : msg.style === 'success' ? 'success' : msg.style === 'warning' ? 'warning' : 'info';
          addToast(msg.message, type);
          // Soft beep
          try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = type === 'error' ? 300 : type === 'success' ? 880 : type === 'warning' ? 520 : 660;
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
          } catch { }
          // Browser notification
          if (Notification.permission === 'granted') {
            new Notification('CocoStation', { body: msg.message, icon: '/favicon.ico', tag: 'coco-trigger' });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
        break;
      default: break;
    }
  }, [fetchLibrary, addToast]);

  useEffect(() => {
    let reconnectTimer = null;
    const connectWS = () => {
      const wsUrl = buildWsUrl('/ws');
      console.log('[WS] Connecting to', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen  = () => { console.log('[WS] Connected'); setWsConnected(true); };
      ws.onmessage = (evt) => {
        try { handleWsMessage(JSON.parse(evt.data)); } catch { }
      };
      ws.onclose = () => {
        setWsConnected(false);
        console.log('[WS] Disconnected – retrying in 3s');
        reconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = () => ws.close();
    };

    connectWS();
    setTimeout(() => {
      fetchLibrary();
      fetchAnnouncements();
      fetchPlaylists();
      fetchRecurringSchedules();
      fetchRecurringMixerSchedules();
      fetchSchedulerStatus();
    }, 0);

    const statusTimer = setInterval(fetchSchedulerStatus, 5000);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(statusTimer);
      wsRef.current?.close();
    };
  }, [handleWsMessage, fetchAnnouncements, fetchLibrary, fetchPlaylists, fetchRecurringMixerSchedules, fetchRecurringSchedules]);

  async function parseError(res) {
    try { const d = await res.json(); return d?.detail || d?.message || JSON.stringify(d); }
    catch { return await res.text(); }
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
    nextTrack: async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/next`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    previousTrack: async (deckId) => {
      const r = await fetch(`/api/decks/${deckId}/previous`, { method: 'POST' });
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
    triggerRecurringSchedule: async (id) => {
      const r = await fetch(`/api/recurring-schedules/${id}/trigger`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
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
    triggerRecurringMixerSchedule: async (id) => {
      const r = await fetch(`/api/recurring-mixer-schedules/${id}/trigger`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    submitRequest: async (payload) => {
      const r = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    acceptRequest: async (id) => {
      const r = await fetch(`/api/requests/${id}/accept`, { method: 'POST' });
      if (!r.ok) throw new Error(await parseError(r));
      return r.json();
    },
    dismissRequest: async (id) => {
      const r = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    clearAllRequests: async () => {
      const r = await fetch('/api/requests', { method: 'DELETE' });
      if (!r.ok) throw new Error(await parseError(r));
    },
    getSchedulerStatus: fetchSchedulerStatus,
  };

  return (
    <AppContext.Provider value={{
      decks, library, announcements, playlists, musicSchedules,
      recurringSchedules, recurringMixerSchedules, musicRequests,
      mic, wsConnected, settings, schedulerStatus, toast, api,
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </AppContext.Provider>
  );
}
