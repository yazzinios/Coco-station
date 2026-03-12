import React from 'react';

export default function StatisticsPage() {
  const stats = [
    { label: "Total Uptime", value: "00:00:00" },
    { label: "Tracks Played", value: "0" },
    { label: "Peak Listeners", value: "0" },
    { label: "Current Listeners", value: "0" }
  ];

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Station Statistics</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {stats.map(s => (
          <div key={s.label} className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{s.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: '600', color: 'var(--accent-blue)' }}>{s.value}</div>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ height: '300px' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Listener Traffic</h3>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Chart placeholder</div>
        </div>
        <div className="glass-panel" style={{ height: '300px' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Data by Deck</h3>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Breakdown placeholder</div>
        </div>
      </div>
    </div>
  );
}
