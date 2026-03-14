import React, { useState, useCallback } from 'react';
import { Play, Pause, Square, Volume2, Link } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DECK_COLORS = {
  a: { accent: '#00d4ff', glow: 'rgba(0,212,255,0.3)' },
  b: { accent: '#a55eea', glow: 'rgba(165,94,234,0.3)' },
  c: { accent: '#26de81', glow: 'rgba(38,222,129,0.3)' },
  d: { accent: '#fd9644', glow: 'rgba(253,150,68,0.3)' },
};

export default function DeckPanel({ id }) {
  const { decks, toast, api } = useApp();
  const deck = decks[id] || { id, name: `Deck ${id.toUpperCase()}`, track: null, volume: 100, is_playing: false, is_paused: false };
  const color = DECK_COLORS[id] || DECK_COLORS.a;
  const [volumeLocal, setVolumeLocal] = useState(deck.volume);
  const [isVolumeChanging, setIsVolumeChanging] = useState(false);

  const handlePlay = async () => {
    if (!deck.track) { toast.error('Load a track first'); return; }
    try {
      if (deck.is_playing) {
        await api.pause(id);
      } else {
        await api.play(id);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleStop = async () => {
    try {
      await api.stop(id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleVolumeChange = useCallback(async (val) => {
    const v = Number(val);
    setVolumeLocal(v);
    setIsVolumeChanging(true);
    try {
      await api.setVolume(id, v);
    } catch (_) {}
    setTimeout(() => setIsVolumeChanging(false), 300);
  }, [id, api]);

  const copyStreamUrl = () => {
    const url = `${window.location.protocol}//${window.location.hostname}:8888/live/deck-${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      toast.success(`Copied: ${url}`);
    }).catch(() => {
      toast.info(`Stream URL: ${url}`);
    });
  };

  const trackDisplayName = deck.track
    ? deck.track.replace(/\.[^.]+$/, '')
    : null;

  const isActive = deck.is_playing || deck.is_paused;

  return (
    <div className="glass-panel" style={{
      height: '370px', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      borderColor: deck.is_playing ? color.accent + '40' : 'var(--panel-border)',
      transition: 'border-color 0.3s',
    }}>
      {/* Playing glow */}
      {deck.is_playing && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at top, ${color.glow} 0%, transparent 70%)`,
          opacity: 0.6,
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            Deck {id.toUpperCase()}
          </div>
          <div style={{ fontWeight: '600', fontSize: '0.95rem', color: color.accent }}>
            {deck.name}
          </div>
        </div>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: deck.is_playing ? color.accent : deck.is_paused ? '#fd9644' : 'rgba(255,255,255,0.15)',
          boxShadow: deck.is_playing ? `0 0 10px ${color.accent}` : 'none',
          transition: 'all 0.3s',
        }} />
      </div>

      {/* Vinyl art */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '85px', height: '85px', borderRadius: '50%',
          background: `conic-gradient(${color.accent}15, rgba(0,0,0,0.5) 30%, ${color.accent}15 60%, rgba(0,0,0,0.5) 90%)`,
          border: `2px solid ${deck.is_playing ? color.accent + '60' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: deck.is_playing ? `0 0 20px ${color.glow}` : 'none',
          animation: deck.is_playing ? 'vinylSpin 3s linear infinite' : 'none',
          transition: 'box-shadow 0.3s, border-color 0.3s',
          position: 'relative',
        }}>
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: deck.is_playing ? color.accent : 'rgba(255,255,255,0.15)',
            transition: 'all 0.3s',
          }} />
        </div>

        <div style={{ textAlign: 'center', maxWidth: '90%' }}>
          {trackDisplayName ? (
            <>
              <div style={{
                fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.2rem',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: '140px',
              }} title={deck.track}>
                {trackDisplayName}
              </div>
              <div style={{
                fontSize: '0.75rem', color: color.accent,
              }}>
                {deck.is_playing ? '▶ Playing' : deck.is_paused ? '⏸ Paused' : '⏹ Ready'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: '500', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No Track Loaded</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.15rem' }}>Pick one from Library</div>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={handlePlay}
          disabled={!deck.track}
          style={{
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: deck.track
              ? (deck.is_playing ? `rgba(${color.accent.replace(/[^\d,]/g,'')},0.2)` : color.accent)
              : 'rgba(255,255,255,0.05)',
            color: deck.track ? (deck.is_playing ? color.accent : '#000') : 'rgba(255,255,255,0.2)',
            cursor: deck.track ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: deck.is_playing ? `0 0 12px ${color.glow}` : 'none',
            transition: 'all 0.2s',
          }}
        >
          {deck.is_playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
        </button>

        <button
          onClick={handleStop}
          disabled={!isActive}
          style={{
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: isActive ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.05)',
            color: isActive ? '#ff4757' : 'rgba(255,255,255,0.2)',
            cursor: isActive ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <Square size={16} fill="currentColor" />
        </button>
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <Volume2 size={14} color="var(--text-secondary)" />
        <input
          type="range" min="0" max="100"
          value={volumeLocal}
          onChange={(e) => handleVolumeChange(e.target.value)}
          style={{
            flex: 1, height: '3px', appearance: 'none',
            background: `linear-gradient(to right, ${color.accent} ${volumeLocal}%, rgba(255,255,255,0.15) ${volumeLocal}%)`,
            borderRadius: '2px', cursor: 'pointer',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '28px', textAlign: 'right' }}>
          {volumeLocal}%
        </span>
      </div>

      {/* Stream URL */}
      <div
        onClick={copyStreamUrl}
        style={{
          fontSize: '0.7rem', color: color.accent, textAlign: 'center',
          cursor: 'pointer', padding: '0.4rem',
          borderRadius: '5px', background: `rgba(${color.accent.replace(/[^\d,]/g,'')},0.05)`,
          border: `1px solid ${color.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
          transition: 'background 0.2s',
          opacity: 0.7,
        }}
      >
        <Link size={11} /> Copy Stream URL
      </div>

      <style>{`
        @keyframes vinylSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: white; cursor: pointer;
          box-shadow: 0 0 4px rgba(0,0,0,0.4);
        }
      `}</style>
    </div>
  );
}
