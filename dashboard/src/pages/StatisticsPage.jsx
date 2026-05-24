import { useState, useEffect, useMemo } from 'react';
import { BarChart2, Clock, Music, Radio, Layers, Wifi, Edit2, Check, X } from 'lucide-react';
import { useApp } from '../context/useApp';

// Inline Library icon (not in lucide)
function Library({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}

export default function StatisticsPage() {
  const { authFetch } = useApp();
  const [stats, setStats] = useState(null);
  const [nowTs, setNowTs] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch('/api/stats');
        if (res.ok) setStats(await res.json());
      } catch {
        // Keep stale stats when fetch fails.
      }
    };
    fetchStats();
    const poll = setInterval(fetchStats, 10000); // poll every 10s
    return () => clearInterval(poll);
  }, []);

  // Live uptime counter.
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [listeners, setListeners]   = useState(null);
  const [labels, setLabels]         = useState({});       // ip → friendly name
  const [editingIp, setEditingIp]   = useState(null);     // ip currently being renamed
  const [editValue, setEditValue]   = useState('');

  // Poll /api/listeners every 10 s
  useEffect(() => {
    const fetchListeners = async () => {
      try {
        const res = await authFetch('/api/listeners');
        if (res.ok) setListeners(await res.json());
      } catch {}
    };
    fetchListeners();
    const poll = setInterval(fetchListeners, 10000);
    return () => clearInterval(poll);
  }, []);

  // Load saved labels once
  useEffect(() => {
    authFetch('/api/listener-labels')
      .then(r => r.ok ? r.json() : {})
      .then(data => setLabels(data))
      .catch(() => {});
  }, []);

  const saveLabel = async (ip, name) => {
    const updated = { ...labels, [ip]: name };
    try {
      const res = await authFetch('/api/listener-labels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setLabels(updated);
    } catch {}
    setEditingIp(null);
  };

  // Flatten all active readers across all decks into a single list
  const activeReaders = useMemo(() => {
    if (!listeners?.paths) return [];
    const DECK_COLORS = { 'deck-a': '#00d4ff', 'deck-b': '#26de81', 'deck-c': '#fd9644', 'deck-d': '#a55eea', 'deck-e': '#ff6b81', 'deck-f': '#45aaf2' };
    const rows = [];
    for (const [deckName, info] of Object.entries(listeners.paths)) {
      const color = DECK_COLORS[deckName] || '#aaa';
      for (const r of (info.readers || [])) {
        if (!r.ip) continue;
        rows.push({ deck: deckName, color, ip: r.ip, addr: r.addr, protocol: r.protocol, label: labels[r.ip] || r.label || '' });
      }
    }
    return rows;
  }, [listeners, labels]);

  const baseStartedAt = useMemo(() => {
    if (!stats?.uptime_seconds) return null;
    return nowTs - (stats.uptime_seconds * 1000);
  }, [stats?.uptime_seconds, nowTs]);

  const formatUptime = (base) => {
    const total = baseStartedAt
      ? Math.max(0, Math.floor((nowTs - baseStartedAt) / 1000))
      : (base || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const statCards = stats ? [
    { label: 'Total Uptime',       value: formatUptime(stats.uptime_seconds), icon: <Clock size={22} />, color: '#00d4ff' },
    { label: 'Tracks Played',      value: stats.tracks_played ?? 0,           icon: <Music size={22} />, color: '#26de81' },
    { label: 'Active Decks',       value: `${stats.playing_decks ?? 0} / 6`,  icon: <Layers size={22} />, color: '#a55eea' },
    { label: 'Library Tracks',     value: stats.library_count ?? 0,           icon: <Library size={22} />, color: '#fd9644' },
  ] : [];

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <BarChart2 size={24} style={{ color: 'var(--accent-blue)' }} /> Station Statistics
      </h2>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats === null ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel" style={{ textAlign: 'center', padding: '1.75rem' }}>
              <div style={{ height: '22px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '0.75rem' }} />
              <div style={{ height: '36px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', width: '60%', margin: '0 auto' }} />
            </div>
          ))
        ) : statCards.map(s => (
          <div key={s.label} className="glass-panel" style={{ textAlign: 'center', padding: '1.75rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: `linear-gradient(to right, ${s.color}, transparent)`,
            }} />
            <div style={{ color: s.color, marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            <div style={{ fontSize: '1.85rem', fontWeight: '700', color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {/* Live Listeners */}
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Radio size={16} /> Live Listeners</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: '800', color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>{stats?.current_listeners ?? 0}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>listeners right now</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>
              Peak today: <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>{stats?.peak_listeners ?? 0}</span>
            </div>
            {(stats?.current_listeners ?? 0) > 0 && (
              <div style={{
                marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.72rem', color: '#2ed573',
              }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#2ed573',
                  boxShadow: '0 0 6px #2ed573',
                  animation: 'livePulse 1.4s ease-in-out infinite',
                  display: 'inline-block',
                }} />
                LIVE
              </div>
            )}
          </div>
        </div>

        {/* Per-Deck Listener Breakdown */}
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart2 size={16} /> Listeners by Deck</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.55rem' }}>
            {['a','b','c','d','e','f'].map(deck => {
              const key     = `deck-${deck}`;
              const count   = stats?.decks_summary?.[key] ?? 0;
              const total   = stats?.current_listeners ?? 0;
              const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
              const isLive  = count > 0;
              const COLORS  = { a: '#00d4ff', b: '#26de81', c: '#fd9644', d: '#a55eea', e: '#ff6b81', f: '#45aaf2' };
              const color   = COLORS[deck];
              return (
                <div key={deck} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 36px', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Deck label */}
                  <span style={{
                    fontSize: '0.72rem', fontWeight: '700', color: isLive ? color : 'rgba(255,255,255,0.2)',
                    width: '20px', textAlign: 'center',
                  }}>{ deck.toUpperCase() }</span>
                  {/* Bar */}
                  <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '4px',
                      width: `${pct}%`,
                      minWidth: isLive ? '8px' : '0',
                      background: isLive
                        ? `linear-gradient(to right, ${color}, ${color}88)`
                        : 'transparent',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  {/* Count */}
                  <span style={{
                    fontSize: '0.72rem', fontWeight: '600', textAlign: 'right',
                    color: isLive ? color : 'rgba(255,255,255,0.2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{ count }</span>
                </div>
              );
            })}
            <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
              {stats?.current_listeners ?? 0} total
            </div>
          </div>
        </div>

        {/* Announcements */}
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Layers size={16} /> Announcements</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: '800', color: '#a55eea' }}>{stats?.announcements_count ?? 0}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>announcements in library</div>
          </div>
        </div>
      </div>

      {/* Live Listener Details Table */}
      <div className="glass-panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wifi size={16} /> Live Listener Details
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>Click ✏️ to label an IP</span>
        </h3>
        {activeReaders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
            No active listeners right now
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th style={{ padding: '0.4rem 0.6rem' }}>Deck</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>IP Address</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>Protocol</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>Label / Zone</th>
              </tr>
            </thead>
            <tbody>
              {activeReaders.map((r, i) => (
                <tr key={`${r.deck}-${r.ip}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* Deck */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '12px',
                      fontSize: '0.72rem', fontWeight: '700', color: r.color,
                      background: `${r.color}18`, border: `1px solid ${r.color}44`,
                    }}>{r.deck.toUpperCase()}</span>
                  </td>
                  {/* IP */}
                  <td style={{ padding: '0.55rem 0.6rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.addr || r.ip}</td>
                  {/* Protocol */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontSize: '0.72rem' }}>{r.protocol}</span>
                  </td>
                  {/* Label */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    {editingIp === r.ip ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLabel(r.ip, editValue); if (e.key === 'Escape') setEditingIp(null); }}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '6px', color: '#fff', padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '140px',
                          }}
                          placeholder="e.g. Pool Area"
                        />
                        <button onClick={() => saveLabel(r.ip, editValue)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2ed573', padding: '2px' }}><Check size={14} /></button>
                        <button onClick={() => setEditingIp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px' }}><X size={14} /></button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: r.label ? '#fff' : 'rgba(255,255,255,0.2)', fontStyle: r.label ? 'normal' : 'italic' }}>
                          {r.label || 'unlabelled'}
                        </span>
                        <button
                          onClick={() => { setEditingIp(r.ip); setEditValue(labels[r.ip] || ''); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '2px', lineHeight: 1 }}
                          title="Rename"
                        ><Edit2 size={12} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status row */}
      {stats && (
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{
            padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '500',
            background: 'rgba(46,213,115,0.1)', color: '#2ed573', border: '1px solid rgba(46,213,115,0.2)',
          }}>
            ● API Connected
          </div>
          <div style={{
            padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem',
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)',
          }}>
            Library: {stats.library_count} files
          </div>
          <div style={{
            padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem',
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)',
          }}>
            Uptime: {formatUptime(stats.uptime_seconds)}
          </div>
        </div>
      )}
    </div>
  );
}

// Live-pulse keyframe injected once at module level via a style element in App.css
// (moved out of component render to avoid duplicate injection across re-renders)
