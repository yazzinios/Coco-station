import React, { useState } from 'react';
import { Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function OnAirButton() {
  const { mic, toast, api } = useApp();
  const [targets, setTargets] = useState(['ALL']);
  const [loading, setLoading] = useState(false);

  const toggleTarget = (t) => {
    if (t === 'ALL') { setTargets(['ALL']); return; }
    const filtered = targets.filter(x => x !== 'ALL');
    if (filtered.includes(t)) {
      const next = filtered.filter(x => x !== t);
      setTargets(next.length === 0 ? ['ALL'] : next);
    } else {
      setTargets([...filtered, t]);
    }
  };

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (mic.active) {
        await api.micOff();
        toast.info('Microphone muted');
      } else {
        await api.micOn(targets);
        toast.success(`On Air → ${targets.join(', ')}`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isOnAir = mic.active;

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
        🎙 Mic Target
      </h3>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        {['ALL', 'A', 'B', 'C', 'D'].map(t => {
          const isSelected = targets.includes(t);
          return (
            <button key={t} onClick={() => toggleTarget(t)} style={{
              padding: '0.4rem 0.9rem',
              background: isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
              color: isSelected ? '#000' : 'var(--text-primary)',
              border: isSelected ? 'none' : '1px solid var(--panel-border)',
              borderRadius: '20px', cursor: 'pointer',
              fontWeight: '600', fontSize: '0.8rem',
              transition: 'all 0.2s',
            }}>
              {t}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleToggle}
        disabled={loading}
        style={{
          width: '100%', padding: '1.25rem',
          background: isOnAir ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.05)',
          border: isOnAir ? '2px solid var(--danger)' : '1px solid var(--panel-border)',
          color: isOnAir ? 'var(--danger)' : 'var(--text-primary)',
          borderRadius: '12px', cursor: loading ? 'default' : 'pointer',
          fontWeight: 'bold', fontSize: '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          boxShadow: isOnAir ? '0 0 30px rgba(255,71,87,0.35)' : 'none',
          transition: 'all 0.3s', opacity: loading ? 0.7 : 1,
          animation: isOnAir ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <Mic size={22} />
        {isOnAir ? 'ON AIR' : 'GO LIVE'}
      </button>

      <div style={{ marginTop: '0.85rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {isOnAir
          ? `Broadcasting to: ${mic.targets.join(', ')}`
          : 'Microphone is muted'}
      </div>

      <style>{`@keyframes pulse { 0%,100% { box-shadow: 0 0 20px rgba(255,71,87,0.35); } 50% { box-shadow: 0 0 40px rgba(255,71,87,0.6); } }`}</style>
    </div>
  );
}
