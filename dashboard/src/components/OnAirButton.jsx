import React, { useState } from 'react';
import { Mic } from 'lucide-react';

export default function OnAirButton() {
  const [isOnAir, setIsOnAir] = useState(false);
  const [targets, setTargets] = useState(['ALL']);

  const handleToggle = () => {
    // Note: React state toggle
    // In actual implementation, this triggers:
    // 1. Play 'tin-tin-tin' beep via backend
    // 2. Delay 1500ms
    // 3. Send /api/mic/on command with `targets`
    // 4. Send API command to drop Deck volumes to 5% (music fade feature)
    setIsOnAir(!isOnAir);
  };

  const toggleTarget = (t) => {
    if (t === 'ALL') {
      setTargets(['ALL']);
      return;
    }
    const newTargets = targets.filter(x => x !== 'ALL');
    if (newTargets.includes(t)) {
      setTargets(newTargets.filter(x => x !== t));
    } else {
      setTargets([...newTargets, t]);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Microphone Target</h3>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        {['ALL', 'A', 'B', 'C', 'D'].map(t => {
          const isSelected = targets.includes(t);
          return (
            <button key={t} onClick={() => toggleTarget(t)} style={{
              padding: '0.5rem 1rem',
              background: isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
              color: isSelected ? '#000' : 'var(--text-primary)',
              border: isSelected ? 'none' : '1px solid var(--panel-border)',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}>
              {t}
            </button>
          )
        })}
      </div>

      <button 
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '1.25rem',
          background: isOnAir ? 'rgba(255, 71, 87, 0.15)' : 'rgba(255,255,255,0.05)',
          border: isOnAir ? '2px solid var(--danger)' : '1px solid var(--panel-border)',
          color: isOnAir ? 'var(--danger)' : 'var(--text-primary)',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          boxShadow: isOnAir ? '0 0 25px rgba(255, 71, 87, 0.4)' : 'none',
          transition: 'all 0.3s'
        }}
      >
        <Mic size={24} />
        {isOnAir ? 'ON AIR' : 'GO LIVE'}
      </button>
      
      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {isOnAir ? `Broadcasting to: ${targets.join(', ')}` : 'Mic is muted'}
      </div>
    </div>
  );
}
