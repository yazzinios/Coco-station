import { useState, useEffect } from 'react';
import { BarChart2, Clock, Music, Radio, Layers } from 'lucide-react';

export default function StatisticsPage() {
  const [stats, setStats] = useState(null);
  const [uptimeTick, setUptimeTick] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) setStats(await res.json());
      } catch (_) {}
    };
    fetchStats();
    const poll = setInterval(fetchStats, 10000); // poll every 10s
    return () => clearInterval(poll);
  }, []);

  // Live uptime counter — restart ticker whenever base uptime changes
  useEffect(() => {
    if (!stats) return;
    setUptimeTick(0); // reset offset when we get a fresh base from API
    const interval = setInterval(() => setUptimeTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stats?.uptime_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatUptime = (base) => {
    const total = (base || 0) + uptimeTick;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const statCards = stats ? [
    { label: 'Total Uptime',       value: formatUptime(stats.uptime_seconds), icon: <Clock size={22} />, color: '#00d4ff' },
    { label: 'Tracks Played',      value: stats.tracks_played ?? 0,           icon: <Music size={22} />, color: '#26de81' },
    { label: 'Active Decks',       value: `${stats.playing_decks ?? 0} / 4`,  icon: <Layers size={22} />, color: '#a55eea' },
    { label: 'Library Tracks',     value: stats.library_count ?? 0,           icon: <Library size={22} />, color: '#fd9644' },
  ] : [];

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <BarChart2 size={24} style={{ color: 'var(--accent-blue)' }} /> Station Statistics
      </h2>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
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

      {/* Charts placeholder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Radio size={16} /> Live Listeners</span>
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: '800', color: 'var(--accent-blue)' }}>{stats?.current_listeners ?? 0}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>listeners right now</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)' }}>
              Peak: {stats?.peak_listeners ?? 0}
            </div>
          </div>
        </div>

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

// Inline icon since lucide doesn't have 'Library'
function Library({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}
