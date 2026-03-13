import React, { useState } from 'react';
import { Play, Pause, SkipForward, Volume2 } from 'lucide-react';

export default function DeckPanel({ id, name }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);

  return (
    <div className="glass-panel" style={{ height: '380px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Deck {id.toUpperCase()} <span style={{ fontSize: '0.8rem', fontWeight: '400' }}>({name})</span>
        </h3>
        <div style={{ 
          width: '10px', height: '10px', borderRadius: '50%', 
          background: isPlaying ? 'var(--success)' : 'rgba(255,255,255,0.2)',
          boxShadow: isPlaying ? '0 0 10px var(--success)' : 'none'
        }} />
      </div>
      
      {/* Now Playing Art & Info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          width: '90px', height: '90px', borderRadius: '50%', 
          background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isPlaying ? '0 0 20px rgba(0, 212, 255, 0.2)' : 'none',
          animation: isPlaying ? 'spin 10s linear infinite' : 'none'
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No Track</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Ready</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--accent-blue)' }}>00:00 / 00:00</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ 
            width: '45px', height: '45px', borderRadius: '50%', border: 'none', 
            background: 'var(--text-primary)', color: 'var(--bg-color)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" style={{ marginLeft: '4px' }} />}
        </button>
        <button 
          style={{ 
            width: '45px', height: '45px', borderRadius: '50%', border: 'none', 
            background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <SkipForward />
        </button>
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Volume2 size={16} color="var(--text-secondary)" />
        <input 
          type="range" min="0" max="100" 
          value={volume} onChange={(e) => setVolume(e.target.value)} 
          style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', appearance: 'none' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '25px' }}>{volume}%</span>
      </div>
      
      {/* Stream Link Copy */}
      <div 
        onClick={() => {
          const streamUrl = `${window.location.protocol}//${window.location.hostname}:8888/live/deck-${id}`;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(streamUrl);
            alert(`Copied Stream URL: ${streamUrl}`);
          } else {
            // Fallback for non-secure contexts
            const textArea = document.createElement("textarea");
            textArea.value = streamUrl;
            document.body.appendChild(textArea);
            textArea.select();
            try {
              document.execCommand('copy');
              alert(`Copied Stream URL (Fallback): ${streamUrl}`);
            } catch (err) {
              console.error('Fallback copy failed', err);
              alert(`Failed to copy. URL is: ${streamUrl}`);
            }
            document.body.removeChild(textArea);
          }
        }}
        style={{ 
          marginTop: '1rem', 
          fontSize: '0.75rem', 
          color: 'var(--accent-blue)', 
          textAlign: 'center', 
          cursor: 'pointer', 
          padding: '0.5rem',
          borderRadius: '4px',
          background: 'rgba(0, 212, 255, 0.05)',
          border: '1px solid rgba(0, 212, 255, 0.1)'
        }}
      >
        Copy Stream URL
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
