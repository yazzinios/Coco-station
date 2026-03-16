import React, { useState, useCallback } from 'react';
import { Play, Pause, Square, Volume2, Link, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DECK_COLORS = {
  a: { accent: '#00d4ff', glow: 'rgba(0,212,255,0.3)' },
  b: { accent: '#a55eea', glow: 'rgba(165,94,234,0.3)' },
  c: { accent: '#26de81', glow: 'rgba(38,222,129,0.3)' },
  d: { accent: '#fd9644', glow: 'rgba(253,150,68,0.3)' },
};

// Clipboard helper — works on HTTP (no HTTPS required)
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for HTTP / non-secure contexts
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('execCommand failed'));
}

export default function DeckPanel({ id }) {
  const { decks, toast, api } = useApp();
  const deck = decks[id] || { id, name: `Deck ${id.toUpperCase()}`, track: null, volume: 100, is_playing: false, is_paused: false };
  const color = DECK_COLORS[id] || DECK_COLORS.a;
  const [volumeLocal, setVolumeLocal] = useState(deck.volume);
  const [copied, setCopied] = useState(false);

  const handlePlay = async () => {
    if (!deck.track) { toast.error('Load a track first'); return; }
    try {
      if (deck.is_playing) await api.pause(id);
      else await api.play(id);
    } catch (err) { toast.error(err.message); }
  };

  const handleStop = async () => {
    try { await api.stop(id); }
    catch (err) { toast.error(err.message); }
  };

  const handleVolumeChange = useCallback(async (val) => {
    const v = Number(val);
    setVolumeLocal(v);
    try { await api.setVolume(id, v); } catch (_) {}
  }, [id, api]);

  const copyStreamUrl = async () => {
    // HLS stream URL for this deck — works in VLC and most players
    const host = window.location.hostname;
    const url = `http://${host}:8888/deck-${id}/index.m3u8`;
    try {
      await copyToClipboard(url);
      setCopied(true);
      toast.success(`Copied! Paste in VLC → deck-${id.toUpperCase()}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort — show URL in a prompt so user can copy manually
      window.prompt('Copy this stream URL:', url);
    }
  };

  const trackDisplayName = deck.track ? deck.track.replace(/\.[^.]+$/, '') : null;
  const isActive = deck.is_playing || deck.is_paused;

  return (
    <div className="glass-panel" style={{
      height: '370px', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      borderColor: deck.is_playing ? color.accent + '40' : 'var(--panel-border)',
      transition: 'border-color 0.3s',
    }}>
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

      {/* Vinyl */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '85px', height: '85px', borderRadius: '50%',
          background: `conic-gradient(${color.accent}15, rgba(0,0,0,0.5) 30%, ${color.accent}15 60%, rgba(0,0,0,0.5) 90%)`,
          border: `2px solid ${deck.is_playing ? color.accent + '60' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: deck.is_playing ? `0 0 20px ${color.glow}` : 'none',
          animation: deck.is_playing ? 'vinylSpin 3s linear infinite' : 'none',
          transition: 'box-shadow 0.3s, border-color 0.3s',
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
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px',
              }} title={deck.track}>{trackDisplayName}</div>
              <div style={{ fontSize: '0.75rem', color: color.accent }}>
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
        <button onClick={handlePlay} disabled={!deck.track} style={{
          width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: deck.track ? (deck.is_playing ? `rgba(0,0,0,0.2)` : color.accent) : 'rgba(255,255,255,0.05)',
          color: deck.track ? (deck.is_playing ? color.accent : '#000') : 'rgba(255,255,255,0.2)',
          cursor: deck.track ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: deck.is_playing ? `0 0 12px ${color.glow}` : 'none',
          transition: 'all 0.2s',
        }}>
          {deck.is_playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
        </button>

        <button onClick={handleStop} disabled={!isActive} style={{
          width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: isActive ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.05)',
          color: isActive ? '#ff4757' : 'rgba(255,255,255,0.2)',
          cursor: isActive ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <Square size={16} fill="currentColor" />
        </button>
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <Volume2 size={14} color="var(--text-secondary)" />
        <input type="range" min="0" max="100" value={volumeLocal}
          onChange={(e) => handleVolumeChange(e.target.value)}
          style={{
            flex: 1, height: '3px', appearance: 'none',
            background: `linear-gradient(to right, ${color.accent} ${volumeLocal}%, rgba(255,255,255,0.15) ${volumeLocal}%)`,
            borderRadius: '2px', cursor: 'pointer', outline: 'none',
          }}
        />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '28px', textAlign: 'right' }}>
          {volumeLocal}%
        </span>
      </div>

      {/* Copy Stream URL */}
      <div onClick={copyStreamUrl} style={{
        fontSize: '0.7rem', color: copied ? '#2ed573' : color.accent, textAlign: 'center',
        cursor: 'pointer', padding: '0.4rem', borderRadius: '5px',
        background: copied ? 'rgba(46,213,115,0.08)' : `rgba(0,0,0,0.15)`,
        border: `1px solid ${copied ? 'rgba(46,213,115,0.3)' : color.accent + '18'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
        transition: 'all 0.2s', opacity: 0.85,
      }}>
        {copied ? <Check size={11} /> : <Link size={11} />}
        {copied ? 'Copied!' : 'Copy Stream URL'}
      </div>

      <style>{`
        @keyframes vinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
          background: white; cursor: pointer; box-shadow: 0 0 4px rgba(0,0,0,0.4);
        }
      `}</style>
    </div>
  );
}
