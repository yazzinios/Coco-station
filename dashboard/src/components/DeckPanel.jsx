import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Square, Volume2, Link, Check, Headphones, Repeat, ListMusic } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DECK_COLORS = {
  a: { accent: '#00d4ff', glow: 'rgba(0,212,255,0.3)' },
  b: { accent: '#a55eea', glow: 'rgba(165,94,234,0.3)' },
  c: { accent: '#26de81', glow: 'rgba(38,222,129,0.3)' },
  d: { accent: '#fd9644', glow: 'rgba(253,150,68,0.3)' },
};

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('execCommand failed'));
}

// ── Browser-native monitor via WHEP (WebRTC) or HLS fallback ──────────────────
// Uses the browser's own audio engine — no external app, no VLC needed.
function DeckMonitor({ id, color }) {
  const audioRef   = useRef(null);
  const hlsRef     = useRef(null);
  const pcRef      = useRef(null);   // RTCPeerConnection for WHEP
  const [listening, setListening] = useState(false);
  const [monVol,    setMonVol]    = useState(80);
  const [protocol,  setProtocol]  = useState('—'); // shows which protocol is active

  // HLS URL via nginx reverse proxy — no direct port exposure needed
  const hlsUrl  = `${window.location.origin}/deck-${id}/index.m3u8`;
  // WHEP URL via nginx reverse proxy
  const whepUrl = `${window.location.origin}/deck-${id}/whep`;

  // ── Try WebRTC/WHEP first (lowest latency, browser-native) ─────────────────
  const startWhep = useCallback(async () => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;

    pc.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    try {
      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`WHEP ${res.status}`);
      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      pc.ontrack = (evt) => {
        const audio = audioRef.current;
        if (!audio) return;
        const stream = evt.streams[0] || new MediaStream([evt.track]);
        audio.srcObject = stream;
        audio.volume = monVol / 100;
        audio.play().catch(() => {});
      };
      setProtocol('WebRTC');
      return true;
    } catch (err) {
      console.warn(`[Monitor deck-${id}] WHEP failed:`, err.message, '— falling back to HLS');
      pc.close(); pcRef.current = null;
      return false;
    }
  }, [id, whepUrl, monVol]);

  // ── HLS fallback using hls.js or native (Safari) ───────────────────────────
  const startHls = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = null; // clear any WebRTC stream

    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      audio.src = hlsUrl;
      audio.volume = monVol / 100;
      await audio.play().catch(() => {});
      setProtocol('HLS (native)');
      return;
    }

    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ lowLatencyMode: true, backBufferLength: 4 });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(audio);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        audio.volume = monVol / 100;
        audio.play().catch(() => {});
      });
      setProtocol('HLS');
      return;
    }

    // Last resort
    audio.src = hlsUrl;
    audio.volume = monVol / 100;
    audio.play().catch(() => {});
    setProtocol('HLS (direct)');
  }, [hlsUrl, monVol]);

  const startListening = useCallback(async () => {
    const whepOk = await startWhep();
    if (!whepOk) await startHls();
    setListening(true);
  }, [startWhep, startHls]);

  const stopListening = useCallback(() => {
    // Stop WebRTC
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    // Stop HLS
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    // Stop audio element
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.src = '';
    }
    setListening(false);
    setProtocol('—');
  }, []);

  const toggleMonitor = () => {
    if (listening) stopListening();
    else startListening();
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = monVol / 100;
  }, [monVol]);

  useEffect(() => () => stopListening(), []); // cleanup on unmount // eslint-disable-line

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
      <button
        onClick={toggleMonitor}
        title={listening ? `Stop monitoring (${protocol})` : 'Monitor this deck (browser audio, no VLC needed)'}
        style={{
          width: '30px', height: '30px', borderRadius: '50%', border: 'none', flexShrink: 0,
          background: listening ? `rgba(0,0,0,0.25)` : 'rgba(255,255,255,0.05)',
          color: listening ? color.accent : 'rgba(255,255,255,0.3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: listening ? `0 0 8px ${color.glow}` : 'none',
          border: listening ? `1px solid ${color.accent}40` : '1px solid transparent',
          transition: 'all 0.2s',
        }}
      >
        <Headphones size={14} />
      </button>

      {listening ? (
        <>
          <input
            type="range" min="0" max="100" value={monVol}
            onChange={e => setMonVol(Number(e.target.value))}
            title="Monitor volume"
            style={{
              flex: 1, height: '2px', appearance: 'none', cursor: 'pointer',
              background: `linear-gradient(to right, ${color.accent} ${monVol}%, rgba(255,255,255,0.1) ${monVol}%)`,
              borderRadius: '1px',
            }}
          />
          <span style={{ fontSize: '0.6rem', color: color.accent, opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {protocol}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)' }}>Monitor</span>
      )}

      {/* Hidden audio element — driven by hls.js or WebRTC srcObject */}
      <audio ref={audioRef} style={{ display: 'none' }} playsInline />
    </div>
  );
}

// ── Main DeckPanel ──────────────────────────────────────────────────────────────
export default function DeckPanel({ id }) {
  const { decks, playlists, toast, api } = useApp();
  const deck  = decks[id] || { id, name: `Deck ${id.toUpperCase()}`, track: null, volume: 100, is_playing: false, is_paused: false, is_loop: false, playlist_id: null, playlist_index: null, playlist_loop: false };
  const activePlaylist = deck.playlist_id ? playlists.find(p => p.id === deck.playlist_id) : null;
  const color = DECK_COLORS[id] || DECK_COLORS.a;

  const [volumeLocal, setVolumeLocal] = useState(deck.volume);
  const [copied,      setCopied]      = useState(false);

  // Optimistic state — reflects the desired state immediately on click,
  // before the server WebSocket update confirms it.
  const [optimistic, setOptimistic] = useState(null);

  // Merge server state with optimistic override
  const display = optimistic ? { ...deck, ...optimistic } : deck;

  // Clear optimistic state once the server confirms the change
  useEffect(() => {
    if (
      optimistic &&
      optimistic.is_playing === deck.is_playing &&
      optimistic.is_paused  === deck.is_paused
    ) {
      setOptimistic(null);
    }
  }, [deck.is_playing, deck.is_paused]); // eslint-disable-line

  // ── Play / Pause / Resume ────────────────────────────────────────────────────
  const handlePlay = async () => {
    if (!deck.track) { toast.error('Load a track first'); return; }

    if (deck.is_playing) {
      // Currently playing → pause
      setOptimistic({ is_playing: false, is_paused: true });
      try { await api.pause(id); }
      catch (err) { setOptimistic(null); toast.error(err.message); }
    } else if (deck.is_paused) {
      // Currently paused → resume from where it stopped (NOT a fresh play)
      setOptimistic({ is_playing: true, is_paused: false });
      try { await api.pause(id); }   // backend pause endpoint toggles pause→resume
      catch (err) { setOptimistic(null); toast.error(err.message); }
    } else {
      // Stopped → fresh play
      setOptimistic({ is_playing: true, is_paused: false });
      try { await api.play(id); }
      catch (err) { setOptimistic(null); toast.error(err.message); }
    }
  };

  const handleStop = async () => {
    setOptimistic({ is_playing: false, is_paused: false });
    try { await api.stop(id); }
    catch (err) { setOptimistic(null); toast.error(err.message); }
  };

  // ── Loop toggle ─────────────────────────────────────────────────────────────
  const handleLoop = async () => {
    const newLoop = !deck.is_loop;
    try {
      await api.loop(id, newLoop);
      toast.info(newLoop ? '🔁 Loop ON' : '▶ Loop OFF');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleVolumeChange = useCallback(async (val) => {
    const v = Number(val);
    setVolumeLocal(v);
    try { await api.setVolume(id, v); } catch (_) {}
  }, [id, api]);

  // Stream URLs
  const getRtspUrl = () => `rtsp://${window.location.hostname}:8554/deck-${id}`;
  const getHlsUrl  = () => `${window.location.origin}/deck-${id}/index.m3u8`;

  const copyStreamUrl = async () => {
    const url = getRtspUrl();
    try {
      await copyToClipboard(url);
      setCopied(true);
      toast.success(`RTSP URL copied! Open VLC → Media → Open Network → paste`);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('RTSP stream URL (low latency, for VLC):', url);
    }
  };

  const copyHlsUrl = async () => {
    const url = getHlsUrl();
    try {
      await copyToClipboard(url);
      toast.info(`HLS URL copied (browser/web players)`);
    } catch {
      window.prompt('HLS stream URL:', url);
    }
  };

  const trackDisplayName = deck.track ? deck.track.replace(/\.[^.]+$/, '') : null;
  const isActive         = display.is_playing || display.is_paused;

  return (
    <div className="glass-panel" style={{
      height: '420px', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      borderColor: display.is_playing ? color.accent + '40' : 'var(--panel-border)',
      transition: 'border-color 0.3s',
    }}>
      {display.is_playing && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at top, ${color.glow} 0%, transparent 70%)`,
          opacity: 0.6,
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', position: 'relative' }}>
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
          background: display.is_playing ? color.accent : display.is_paused ? '#fd9644' : 'rgba(255,255,255,0.15)',
          boxShadow: display.is_playing ? `0 0 10px ${color.accent}` : 'none',
          transition: 'all 0.3s',
        }} />
      </div>

      {/* Vinyl */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          background: `conic-gradient(${color.accent}15, rgba(0,0,0,0.5) 30%, ${color.accent}15 60%, rgba(0,0,0,0.5) 90%)`,
          border: `2px solid ${display.is_playing ? color.accent + '60' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: display.is_playing ? `0 0 20px ${color.glow}` : 'none',
          animation: display.is_playing ? 'vinylSpin 3s linear infinite' : 'none',
          transition: 'box-shadow 0.3s, border-color 0.3s',
        }}>
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: display.is_playing ? color.accent : 'rgba(255,255,255,0.15)',
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
              {activePlaylist && (
                <div style={{ fontSize: '0.68rem', color: color.accent, opacity: 0.8, marginBottom: '0.1rem',
                  display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ListMusic size={10} />
                  {activePlaylist.name} · {(deck.playlist_index ?? 0) + 1}/{activePlaylist.tracks.length}
                  {deck.playlist_loop && ' 🔁'}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: color.accent }}>
                {display.is_playing
                  ? (activePlaylist ? '▶ Playlist' : deck.is_loop ? '🔁 Looping' : '▶ Playing')
                  : display.is_paused
                    ? '⏸ Paused'
                    : '⏹ Ready'}
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

      {/* Controls: Play | Stop | Loop */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>

        {/* Play / Pause button */}
        <button onClick={handlePlay} disabled={!deck.track} title={display.is_playing ? 'Pause' : display.is_paused ? 'Resume' : 'Play'} style={{
          width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: deck.track ? (display.is_playing ? 'rgba(0,0,0,0.2)' : color.accent) : 'rgba(255,255,255,0.05)',
          color: deck.track ? (display.is_playing ? color.accent : '#000') : 'rgba(255,255,255,0.2)',
          cursor: deck.track ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: display.is_playing ? `0 0 12px ${color.glow}` : 'none',
          transition: 'all 0.2s',
        }}>
          {display.is_playing
            ? <Pause size={18} fill="currentColor" />
            : <Play  size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
        </button>

        {/* Stop button */}
        <button onClick={handleStop} disabled={!isActive} title="Stop" style={{
          width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: isActive ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.05)',
          color: isActive ? '#ff4757' : 'rgba(255,255,255,0.2)',
          cursor: isActive ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <Square size={16} fill="currentColor" />
        </button>

        {/* Loop button */}
        <button
          onClick={handleLoop}
          disabled={!deck.track}
          title={deck.is_loop ? 'Loop ON — click to disable' : 'Loop OFF — click to enable'}
          style={{
            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
            background: deck.is_loop
              ? `rgba(${color.accent.replace(/[^\d,]/g, '')},0.15)`
              : 'rgba(255,255,255,0.05)',
            color: deck.is_loop ? color.accent : (deck.track ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'),
            cursor: deck.track ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: deck.is_loop ? `1px solid ${color.accent}50` : '1px solid transparent',
            boxShadow: deck.is_loop ? `0 0 8px ${color.glow}` : 'none',
            transition: 'all 0.2s',
          }}
        >
          <Repeat size={16} />
        </button>
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
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

      {/* Monitor — browser audio, WHEP/WebRTC with HLS fallback */}
      <DeckMonitor id={id} color={color} />

      {/* Stream URLs */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <div onClick={copyStreamUrl} title="Low-latency stream for VLC" style={{
          flex: 1, fontSize: '0.68rem', color: copied ? '#2ed573' : color.accent,
          cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: '5px',
          background: copied ? 'rgba(46,213,115,0.08)' : 'rgba(0,0,0,0.15)',
          border: `1px solid ${copied ? 'rgba(46,213,115,0.3)' : color.accent + '25'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          transition: 'all 0.2s',
        }}>
          {copied ? <Check size={10} /> : <Link size={10} />}
          {copied ? 'Copied!' : 'RTSP — VLC'}
        </div>
        <div onClick={copyHlsUrl} title="HLS stream for browser/web players" style={{
          flex: 1, fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: '5px',
          background: 'rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          transition: 'all 0.2s',
        }}>
          <Link size={10} />
          HLS — browser
        </div>
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
