import { useState, useEffect, useMemo } from 'react';
import { BarChart2, Clock, Music, Radio, Layers, Wifi, Edit2, Check, X, Broadcast } from 'lucide-react';
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

// Inline Upload/Broadcast icon for RTMP publishers
function UploadCloud({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

export default function StatisticsPage() {
  const { authFetch, decks } = useApp();
  const [stats,     setStats]     = useState(null);
  const [listeners, setListeners] = useState(null);
  const [labels,    setLabels]    = useState({});
  const [editingIp, setEditingIp] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [nowTs,     setNowTs]     = useState(Date.now());

  // Live uptime counter
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll /api/stats every 10 s
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await authFetch('/api/stats');
        if (res.ok) setStats(await res.json());
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 10000);
    return () => clearInterval(id);
  }, []);

  // Poll /api/listeners every 10 s
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await authFetch('/api/listeners');
        if (res.ok) setListeners(await res.json());
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 10000);
    return () => clearInterval(id);
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

  // Active deck count
  const activeDeckCount = useMemo(() => {
    if (decks && Object.keys(decks).length > 0) {
      return Object.values(decks).filter(d => d?.is_playing).length;
    }
    return stats?.playing_decks ?? 0;
  }, [decks, stats]);

  // Flatten all active RTSP readers across all decks
  const activeReaders = useMemo(() => {
    if (!listeners?.paths) return [];
    const DECK_COLORS = {
      'deck-a': '#00d4ff', 'deck-b': '#26de81', 'deck-c': '#fd9644',
      'deck-d': '#a55eea', 'deck-e': '#ff6b81', 'deck-f': '#45aaf2',
    };
    const rows = [];
    for (const [deckName, info] of Object.entries(listeners.paths)) {
      const color = DECK_COLORS[deckName] || '#aaa';
      for (const r of (info.readers || [])) {
        if (!r.ip) continue;
        rows.push({
          deck: deckName, color, ip: r.ip, addr: r.addr,
          protocol: r.protocol,
          label: labels[r.ip] || r.label || '',
        });
      }
    }
    return rows;
  }, [listeners, labels]);

  // RTMP publishers with live labels merged in
  const activePublishers = useMemo(() => {
    if (!listeners?.publishers) return [];
    return listeners.publishers.map(p => ({
      ...p,
      label: labels[p.ip] || p.label || '',
    }));
  }, [listeners, labels]);

  const baseStartedAt = useMemo(() => {
    if (!stats?.uptime_seconds) return null;
    return nowTs - (stats.uptime_seconds * 1000);
  }, [stats?.uptime_seconds]);

  const formatUptime = () => {
    const total = baseStartedAt
      ? Math.max(0, Math.floor((nowTs - baseStartedAt) / 1000))
      : (stats?.uptime_seconds || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const statCards = stats ? [
    { label: 'Total Uptime',   value: formatUptime(),              icon: <Clock   size={22} />, color: '#00d4ff' },
    { label: 'Tracks Played',  value: stats.tracks_played ?? 0,    icon: <Music   size={22} />, color: '#26de81' },
    { label: 'Active Decks',   value: `${activeDeckCount} / 6`,    icon: <Layers  size={22} />, color: '#a55eea' },
    { label: 'Library Tracks', value: stats.library_count ?? 0,    icon: <Library size={22} />, color: '#fd9644' },
  ] : [];

  // Shared inline edit cell renderer
  const renderLabelCell = (ip, label) => {
    if (editingIp === ip) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  saveLabel(ip, editValue);
              if (e.key === 'Escape') setEditingIp(null);
            }}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px', color: '#fff', padding: '0.2rem 0.5rem',
              fontSize: '0.8rem', width: '140px',
            }}
            placeholder="e.g. Pool Area"
          />
          <button onClick={() => saveLabel(ip, editValue)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2ed573', padding: '2px' }}><Check size={14} /></button>
          <button onClick={() => setEditingIp(null)}       style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px' }}><X size={14} /></button>
        </span>
      );
    }
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: label ? '#fff' : 'rgba(255,255,255,0.2)', fontStyle: label ? 'normal' : 'italic' }}>
          {label || 'unlabelled'}
        </span>
        <button
          onClick={() => { setEditingIp(ip); setEditValue(labels[ip] || ''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '2px', lineHeight: 1 }}
          title="Name this source"
        ><Edit2 size={12} /></button>
      </span>
    );
  };

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

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>

        {/* Live Listeners */}
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Radio size={16} /> Live Listeners</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: '800', color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>
              {listeners?.total ?? stats?.current_listeners ?? 0}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>listeners right now</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>
              Peak today: <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>{stats?.peak_listeners ?? 0}</span>
            </div>
            {(listeners?.total ?? stats?.current_listeners ?? 0) > 0 && (
              <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#2ed573' }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#2ed573', boxShadow: '0 0 6px #2ed573',
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
              const key    = `deck-${deck}`;
              const count  = listeners?.decks?.[key] ?? 0;
              const total  = listeners?.total ?? 0;
              const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
              const isLive = count > 0;
              const COLORS = { a: '#00d4ff', b: '#26de81', c: '#fd9644', d: '#a55eea', e: '#ff6b81', f: '#45aaf2' };
              const color  = COLORS[deck];
              return (
                <div key={deck} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 36px', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isLive ? color : 'rgba(255,255,255,0.2)', width: '20px', textAlign: 'center' }}>{deck.toUpperCase()}</span>
                  <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '4px',
                      width: `${pct}%`, minWidth: isLive ? '8px' : '0',
                      background: isLive ? `linear-gradient(to right, ${color}, ${color}88)` : 'transparent',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', textAlign: 'right', color: isLive ? color : 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                </div>
              );
            })}
            <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
              {listeners?.total ?? 0} total
            </div>
          </div>
        </div>

        {/* Active Decks breakdown */}
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Layers size={16} /> Active Decks</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
            {['a','b','c','d','e','f'].map(deck => {
              const deckState = decks?.[deck];
              const isPlaying = deckState?.is_playing;
              const isPaused  = deckState?.is_paused;
              const track     = deckState?.track?.replace(/\.[^.]+$/, '') || '—';
              const COLORS    = { a: '#00d4ff', b: '#26de81', c: '#fd9644', d: '#a55eea', e: '#ff6b81', f: '#45aaf2' };
              const color     = COLORS[deck];
              return (
                <div key={deck} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                    background: isPlaying ? color : isPaused ? '#fd9644' : 'rgba(255,255,255,0.12)',
                    boxShadow: isPlaying ? `0 0 6px ${color}` : 'none',
                  }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isPlaying ? color : 'rgba(255,255,255,0.3)', width: '20px' }}>
                    {deck.toUpperCase()}
                  </span>
                  <span style={{
                    flex: 1, fontSize: '0.72rem',
                    color: isPlaying ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{isPlaying || isPaused ? track : 'idle'}</span>
                  <span style={{
                    fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '8px',
                    background: isPlaying ? `${color}18` : isPaused ? 'rgba(253,150,68,0.15)' : 'transparent',
                    color: isPlaying ? color : isPaused ? '#fd9644' : 'rgba(255,255,255,0.15)',
                    border: `1px solid ${isPlaying ? color + '33' : isPaused ? 'rgba(253,150,68,0.3)' : 'transparent'}`,
                  }}>
                    {isPlaying ? '▶ LIVE' : isPaused ? '⏸ PAUSED' : 'OFF'}
                  </span>
                </div>
              );
            })}
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
              {activeDeckCount} / 6 active
            </div>
          </div>
        </div>
      </div>

      {/* ── RTMP Publishers Table ── */}
      <div className="glass-panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UploadCloud size={16} /> RTMP Publishers
          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'rgba(255,107,129,0.12)', color: '#ff6b81', border: '1px solid rgba(255,107,129,0.25)', fontWeight: '600' }}>
            {activePublishers.length} source{activePublishers.length !== 1 ? 's' : ''}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>Click ✏️ to name a source</span>
        </h3>
        {activePublishers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
            No active RTMP publishers right now
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th style={{ padding: '0.4rem 0.6rem' }}>IP Address</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>Protocol</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>Path</th>
                <th style={{ padding: '0.4rem 0.6rem' }}>Name / Label</th>
              </tr>
            </thead>
            <tbody>
              {activePublishers.map((p, i) => (
                <tr key={`pub-${p.ip}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* IP */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ff6b81', boxShadow: '0 0 5px #ff6b81', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{p.addr || p.ip}</span>
                    </span>
                  </td>
                  {/* Protocol */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '10px',
                      fontSize: '0.7rem', fontWeight: '700',
                      background: 'rgba(255,107,129,0.12)', color: '#ff6b81',
                      border: '1px solid rgba(255,107,129,0.3)',
                      textTransform: 'uppercase',
                    }}>{p.protocol || 'rtmp'}</span>
                  </td>
                  {/* Path */}
                  <td style={{ padding: '0.55rem 0.6rem', fontFamily: 'monospace', fontSize: '0.76rem', color: 'rgba(255,255,255,0.4)' }}>
                    {p.path || '—'}
                  </td>
                  {/* Label */}
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    {renderLabelCell(p.ip, p.label)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Live Listener Details Table (RTSP) ── */}
      <div className="glass-panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wifi size={16} /> Live Listener Details
          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)', fontWeight: '600' }}>
            {activeReaders.length} listener{activeReaders.length !== 1 ? 's' : ''}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>Click ✏️ to name a listener</span>
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
                <th style={{ padding: '0.4rem 0.6rem' }}>Name / Zone</th>
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
                    {renderLabelCell(r.ip, r.label)}
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
          <div style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '500', background: 'rgba(46,213,115,0.1)', color: '#2ed573', border: '1px solid rgba(46,213,115,0.2)' }}>
            ● API Connected
          </div>
          <div style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)' }}>
            Library: {stats.library_count} files
          </div>
          <div style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)' }}>
            Uptime: {formatUptime()}
          </div>
          {activePublishers.length > 0 && (
            <div style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.78rem', background: 'rgba(255,107,129,0.08)', color: '#ff6b81', border: '1px solid rgba(255,107,129,0.2)' }}>
              ↑ {activePublishers.length} RTMP publisher{activePublishers.length !== 1 ? 's' : ''} live
            </div>
          )}
        </div>
      )}
    </div>
  );
}
