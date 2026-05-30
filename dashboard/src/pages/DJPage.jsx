import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/useApp.js';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════ */
const API  = import.meta.env.VITE_API_URL  || 'http://localhost:8000';
const WS   = import.meta.env.VITE_WS_URL   || 'ws://localhost:8000';

const DECK_COLORS = {
  a: '#00d4ff', b: '#2ed573', c: '#a55eea',
  d: '#fd9644', e: '#ff4757', f: '#ffd32a',
};
const DECK_ORDER_LEFT  = ['a', 'b', 'c'];
const DECK_ORDER_RIGHT = ['d', 'e', 'f'];
const EFFECTS_CYCLE    = ['none', 'reverb', 'echo'];

function buildDJName(user) {
  if (!user) return 'DJ';
  const n = user.display_name || user.username || '';
  return n.toLowerCase().startsWith('dj') ? n : `DJ ${n}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   GLOBAL STYLES
══════════════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Exo+2:ital,wght@0,400;0,600;0,700;1,400&display=swap');

:root {
  --dj-bg:      #06080d;
  --dj-panel:   #0b0e18;
  --dj-card:    #0f1220;
  --dj-border:  #1c2038;
  --dj-accent:  #e8a020;
  --dj-green:   #2ed573;
  --dj-red:     #e03c3c;
  --dj-blue:    #3a8fff;
  --dj-text:    #c8cfe8;
  --dj-muted:   #3a4462;
  --dj-mono:    'Share Tech Mono', monospace;
  --dj-orb:     'Orbitron', sans-serif;
  --dj-sans:    'Exo 2', sans-serif;
}

.djp *, .djp *::before, .djp *::after { box-sizing: border-box; margin: 0; padding: 0; }
.djp { font-family: var(--dj-sans); background: var(--dj-bg); color: var(--dj-text);
       display: flex; flex-direction: column; overflow: hidden;
       margin: -2rem; height: calc(100vh - 80px); position: relative; }
.djp button:focus, .djp input:focus, .djp select:focus { outline: none; }
.djp ::-webkit-scrollbar { width: 3px; }
.djp ::-webkit-scrollbar-thumb { background: var(--dj-border); border-radius: 2px; }

/* Animations */
@keyframes djFadeIn   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes djReveal   { from{opacity:0;transform:translateY(50px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes djSpin     { to{transform:rotate(360deg)} }
@keyframes djScanLine { from{top:-100%} to{top:200%} }
@keyframes djNameIn   { 0%{opacity:0;transform:scale(.85)} 60%{transform:scale(1.03)} 100%{opacity:1;transform:scale(1)} }
@keyframes djPulseRing{ 0%,100%{box-shadow:0 0 18px var(--pc,#e8a020)44} 50%{box-shadow:0 0 42px var(--pc,#e8a020)cc,0 0 80px var(--pc,#e8a020)44} }
@keyframes djLivePulse{ 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes djGlow     { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.5)} }
@keyframes djSlideUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }

/* Spectrum bars */
@keyframes sp0{0%,100%{height:22%}50%{height:72%}} @keyframes sp1{0%,100%{height:55%}50%{height:94%}}
@keyframes sp2{0%,100%{height:36%}50%{height:75%}} @keyframes sp3{0%,100%{height:70%}50%{height:28%}}
@keyframes sp4{0%,100%{height:44%}50%{height:86%}} @keyframes sp5{0%,100%{height:80%}50%{height:18%}}
@keyframes sp6{0%,100%{height:60%}50%{height:96%}} @keyframes sp7{0%,100%{height:28%}50%{height:62%}}
.dj-sp0{animation:sp0 0.90s ease-in-out infinite} .dj-sp1{animation:sp1 0.72s ease-in-out infinite}
.dj-sp2{animation:sp2 1.10s ease-in-out infinite} .dj-sp3{animation:sp3 0.83s ease-in-out infinite}
.dj-sp4{animation:sp4 1.02s ease-in-out infinite} .dj-sp5{animation:sp5 0.65s ease-in-out infinite}
.dj-sp6{animation:sp6 0.97s ease-in-out infinite} .dj-sp7{animation:sp7 1.18s ease-in-out infinite}
`;

function injectCSS() {
  if (document.getElementById('djbooth-css')) return;
  const s = document.createElement('style');
  s.id = 'djbooth-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════════════
   SETUP SCREEN
══════════════════════════════════════════════════════════════════════════ */
function SetupScreen({ onConnect }) {
  const { currentUser, token } = useApp() || {};
  const djName = buildDJName(currentUser);
  const [devices,    setDevices]    = useState([]);
  const [audioSrc,   setAudioSrc]   = useState('');
  const [audioLabel, setAudioLabel] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [permErr,    setPermErr]    = useState(false);
  const [apiErr,     setApiErr]     = useState('');
  const C = '#e8a020';

  useEffect(() => {
    async function load() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter(d => d.kind === 'audioinput'));
        setPermErr(false);
      } catch { setPermErr(true); }
    }
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', load);
  }, []);

  const handleConnect = async () => {
    if (!audioSrc) return;
    setConnecting(true);
    setApiErr('');
    try {
      const res = await fetch(`${API}/api/dj/session/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ audio_src: audioSrc, audio_label: audioLabel }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onConnect({
        djName,
        audioSrc,
        audioLabel,
        token,
        allowedDecks:  data.allowed_decks || [],
        initialDecks:  data.deck_states   || {},
      });
    } catch (e) {
      setApiErr(e.message);
      setConnecting(false);
    }
  };

  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--dj-bg)',
      backgroundImage:'radial-gradient(ellipse at 20% 50%,rgba(232,160,32,.06) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(58,143,255,.06) 0%,transparent 55%)',
      position:'relative', overflow:'hidden' }}>

      {/* Grid bg */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:'linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)',
        backgroundSize:'44px 44px' }}/>
      {/* Scan line */}
      <div style={{ position:'absolute', left:0, right:0, height:60,
        background:'linear-gradient(transparent,rgba(255,255,255,.02),transparent)',
        animation:'djScanLine 5s linear infinite', pointerEvents:'none' }}/>

      <div style={{ width:480, animation:'djFadeIn .55s ease forwards', position:'relative', zIndex:2 }}>

        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:'var(--dj-orb)', fontSize:30, fontWeight:900, color:C,
            letterSpacing:5, animation:'djNameIn .7s ease forwards' }}>{djName}</div>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'var(--dj-muted)',
            letterSpacing:3, marginTop:5 }}>COCOSTATION · DJ BOOTH</div>
        </div>

        <div style={{ background:'var(--dj-panel)', borderRadius:18,
          border:`1px solid ${C}33`, padding:'28px 32px 32px',
          boxShadow:'0 24px 80px rgba(0,0,0,.8)' }}>

          <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)',
            letterSpacing:3, marginBottom:14 }}>AUDIO INPUT</div>

          {permErr ? (
            <div style={{ padding:14, borderRadius:9, background:'rgba(224,60,60,.08)',
              border:'1px solid rgba(224,60,60,.3)', color:'#e03c3c',
              fontFamily:'var(--dj-mono)', fontSize:11, textAlign:'center', marginBottom:20 }}>
              Microphone access denied — allow in browser settings and refresh
            </div>
          ) : devices.length === 0 ? (
            <div style={{ padding:14, borderRadius:9, background:'rgba(255,255,255,.03)',
              border:'1px solid var(--dj-border)', color:'var(--dj-muted)',
              fontFamily:'var(--dj-mono)', fontSize:11, textAlign:'center', marginBottom:20 }}>
              <span style={{ display:'inline-block', animation:'djSpin .9s linear infinite', marginRight:8 }}>⟳</span>
              Detecting audio devices…
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
              {devices.map((dev, i) => {
                const sel   = audioSrc === dev.deviceId;
                const label = dev.label || `Audio Input ${i + 1}`;
                return (
                  <button key={dev.deviceId}
                    onClick={() => { setAudioSrc(dev.deviceId); setAudioLabel(label); }}
                    style={{ padding:'12px 16px', borderRadius:10, cursor:'pointer', textAlign:'left',
                      border:`1.5px solid ${sel ? C : 'var(--dj-border)'}`,
                      background: sel ? `${C}14` : 'rgba(255,255,255,.025)',
                      color: sel ? C : 'var(--dj-muted)',
                      display:'flex', alignItems:'center', gap:12, transition:'all .18s',
                      boxShadow: sel ? `0 0 18px ${C}30` : 'none',
                      fontFamily:'var(--dj-mono)', fontSize:12 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', flexShrink:0,
                      background: sel ? C : 'var(--dj-border)',
                      boxShadow: sel ? `0 0 8px ${C}` : 'none',
                      animation: sel ? 'djLivePulse 1.4s infinite' : 'none', transition:'all .2s' }}/>
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {label}
                    </span>
                    {sel && <span style={{ fontSize:8, color:C, letterSpacing:1 }}>SELECTED ✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {apiErr && (
            <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:8,
              background:'rgba(224,60,60,.1)', border:'1px solid rgba(224,60,60,.35)',
              color:'#e03c3c', fontFamily:'var(--dj-mono)', fontSize:11 }}>
              ⚠ {apiErr}
            </div>
          )}

          <button onClick={handleConnect} disabled={!audioSrc || connecting}
            style={{ width:'100%', padding:16, borderRadius:11,
              cursor: audioSrc && !connecting ? 'pointer' : 'not-allowed',
              fontFamily:'var(--dj-orb)', fontSize:13, fontWeight:700, letterSpacing:4,
              border:`2px solid ${audioSrc ? C : 'var(--dj-border)'}`,
              background: audioSrc ? `linear-gradient(135deg,${C}22,${C}0a)` : 'rgba(255,255,255,.02)',
              color: audioSrc ? C : 'var(--dj-muted)',
              boxShadow: audioSrc ? `0 0 30px ${C}45` : 'none',
              '--pc': C,
              animation: audioSrc && !connecting ? 'djPulseRing 2.5s ease-in-out infinite' : 'none',
              transition:'all .25s' }}>
            {connecting
              ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                  <span style={{ display:'inline-block', width:12, height:12,
                    border:`2px solid ${C}`, borderTopColor:'transparent',
                    borderRadius:'50%', animation:'djSpin .7s linear infinite' }}/>
                  CONNECTING…
                </span>
              : '🎧  ENTER BOOTH'}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:14, fontFamily:'var(--dj-mono)',
          fontSize:7, color:'var(--dj-muted)', letterSpacing:2 }}>
          COCOSTATION DJ BOOTH v3.0 · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   JOG WHEEL CANVAS
══════════════════════════════════════════════════════════════════════════ */
function JogWheel({ color, status, size = 180 }) {
  const canvasRef = useRef(null);
  const angleRef  = useRef(0);
  const animRef   = useRef(null);

  const speed = status === 'LIVE' ? 0.065
              : status === 'GOING_LIVE' ? 0.035
              : status === 'RESERVED' ? 0.008
              : status === 'STOPPING' ? 0.02
              : 0;

  const glowIntensity = status === 'LIVE' ? 1
                      : status === 'GOING_LIVE' ? 0.6
                      : status === 'RESERVED' ? 0.3
                      : 0.05;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = size, H = size, cx = W / 2, cy = H / 2, R = W / 2 - 6;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      // Outer ring glow
      ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
      ctx.strokeStyle = color + Math.round(glowIntensity * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 4;
      if (status === 'LIVE') { ctx.shadowBlur = 28; ctx.shadowColor = color; }
      ctx.stroke(); ctx.shadowBlur = 0;

      // Disk bg
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, '#111520');
      grad.addColorStop(1, '#060810');
      ctx.fillStyle = grad; ctx.fill();

      // Spinning grooves
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angleRef.current);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const isMajor = i % 4 === 0;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
        ctx.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97);
        ctx.strokeStyle = isMajor
          ? `rgba(255,255,255,${0.12 + glowIntensity * 0.35})`
          : `rgba(255,255,255,${0.04 + glowIntensity * 0.08})`;
        ctx.lineWidth = isMajor ? 1.8 : 0.8;
        ctx.stroke();
      }
      ctx.restore();

      // Center hub
      const hubR = R * 0.35;
      ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
      ctx.fillStyle = '#040508'; ctx.fill();
      ctx.strokeStyle = status === 'LIVE' ? color : '#1c2038';
      ctx.lineWidth = 2.5;
      if (status === 'LIVE') { ctx.shadowBlur = 12; ctx.shadowColor = color; }
      ctx.stroke(); ctx.shadowBlur = 0;

      // Status dot
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = status === 'LIVE'    ? color
                    : status === 'RESERVED' ? color + '99'
                    : '#1c2038';
      ctx.fill();
    };

    const loop = () => {
      angleRef.current += speed;
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [color, status, size, speed, glowIntensity]);

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ borderRadius: '50%', display: 'block',
        filter: status === 'LIVE' ? `drop-shadow(0 0 14px ${color}88)` : 'none',
        transition: 'filter .4s' }}/>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DECK BUTTON
══════════════════════════════════════════════════════════════════════════ */
function DeckButton({ deckId, deckName, state, isAllowed, isMine, onPress }) {
  const color     = DECK_COLORS[deckId] || '#888';
  const status    = state?.status || 'AVAILABLE';
  const ownerName = state?.owner_name || '';

  const isLive     = status === 'LIVE';
  const isReserved = status === 'RESERVED' && isMine;
  const isOther    = (status === 'LIVE' || status === 'RESERVED' || status === 'GOING_LIVE') && !isMine;
  const isLocked   = !isAllowed;

  let bg, border, textColor, animation, shadow, cursor;

  if (isLocked || isOther) {
    bg = 'rgba(255,255,255,.03)'; border = '#1c2038';
    textColor = '#2a3050'; animation = 'none'; shadow = 'none'; cursor = 'not-allowed';
  } else if (isLive) {
    bg = `${color}22`; border = color; textColor = color;
    animation = 'djGlow 1.2s ease-in-out infinite'; shadow = `0 0 24px ${color}66`; cursor = 'pointer';
  } else if (isReserved) {
    bg = `${color}18`; border = color; textColor = color;
    animation = 'djPulseRing 1.8s ease-in-out infinite'; shadow = `0 0 20px ${color}55`; cursor = 'pointer';
  } else {
    bg = 'rgba(255,255,255,.04)'; border = color + '55'; textColor = color + 'bb';
    animation = 'none'; shadow = 'none'; cursor = 'pointer';
  }

  return (
    <button id={`deck-btn-${deckId}`} onClick={() => !isLocked && !isOther && onPress(deckId)}
      title={isOther ? `${ownerName} is on this deck` : isLocked ? 'No access' : ''}
      style={{ position:'relative', width:52, height:52, borderRadius:10, border:`2px solid ${border}`,
        background: bg, color: textColor, cursor, boxShadow: shadow,
        '--pc': color, animation,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:2, transition:'all .2s', padding:0 }}>
      <span style={{ fontFamily:'var(--dj-orb)', fontSize:16, fontWeight:900, lineHeight:1 }}>
        {deckId.toUpperCase()}
      </span>
      <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, letterSpacing:1, opacity:.8 }}>
        {deckName}
      </span>
      {isLocked && (
        <div style={{ position:'absolute', top:3, right:4, fontSize:8, opacity:.5 }}>🔒</div>
      )}
      {isLive && (
        <div style={{ position:'absolute', top:-4, right:-4, width:10, height:10, borderRadius:'50%',
          background:'#e03c3c', animation:'djLivePulse .8s ease-in-out infinite',
          border:'2px solid var(--dj-bg)' }}/>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FEATURE BUTTON
══════════════════════════════════════════════════════════════════════════ */
function FeatBtn({ id, label, icon, active, disabled, onClick, color = '#e8a020' }) {
  return (
    <button id={id} onClick={disabled ? undefined : onClick}
      style={{ flex:1, minWidth:72, padding:'8px 4px', borderRadius:9,
        border:`1.5px solid ${active ? color : '#1c2038'}`,
        background: active ? `${color}22` : 'rgba(255,255,255,.03)',
        color: disabled ? '#1c2038' : active ? color : '#5a6480',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active ? `0 0 14px ${color}55` : 'none',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4,
        transition:'all .18s', '--pc': color,
        animation: active ? 'djPulseRing 2s ease-in-out infinite' : 'none' }}>
      <span style={{ fontSize:16, lineHeight:1 }}>{icon}</span>
      <span style={{ fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1 }}>{label}</span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LIVE TIMER
══════════════════════════════════════════════════════════════════════════ */
function LiveTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t0 = parseFloat(startedAt) * 1000;
    const id  = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return <span style={{ fontFamily:'var(--dj-mono)', fontSize:13, color:'#e03c3c',
    animation:'djLivePulse 1.5s ease-in-out infinite' }}>{mm}:{ss}</span>;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN DJ BOOTH CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
function DJBoothController({ session, onExit }) {
  const { token } = useApp() || {};
  const tk = token || session.token;

  // ── State ──
  const [deckStates,   setDeckStates]   = useState(session.initialDecks || {});
  const [activeDeck,   setActiveDeck]   = useState(null);   // currently selected by ME
  const [recording,    setRecording]    = useState(false);
  const [activeEffect, setActiveEffect] = useState('none');
  const [announcing,   setAnnouncing]   = useState(false);
  const [looping,      setLooping]      = useState(false);
  const [cueActive,    setCueActive]    = useState(false);
  const [wsStatus,     setWsStatus]     = useState('connecting');

  const allowedDecks = session.allowedDecks || [];

  // ── WebSocket ──
  const wsRef = useRef(null);
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${WS}/ws`);
      wsRef.current = ws;

      ws.onopen  = () => setWsStatus('connected');
      ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus('error');

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Full state sync on connect
          if (msg.type === 'FULL_STATE' && msg.dj_decks) {
            setDeckStates(msg.dj_decks);
          }

          // Individual DJ events
          if (msg.type === 'DJ_EVENT') {
            const { event, deck } = msg;

            if (['deck_reserved','deck_going_live','deck_live','deck_stopping',
                 'deck_released','deck_recovery','playlist_resumed'].includes(event)) {
              // Refresh deck state for the affected deck
              setDeckStates(prev => {
                const updated = { ...prev };
                const statusMap = {
                  deck_reserved:    'RESERVED',
                  deck_going_live:  'GOING_LIVE',
                  deck_live:        'LIVE',
                  deck_stopping:    'STOPPING',
                  deck_released:    'AVAILABLE',
                  deck_recovery:    'RECOVERY',
                  playlist_resumed: 'AVAILABLE',
                };
                if (updated[deck]) {
                  updated[deck] = {
                    ...updated[deck],
                    status:     statusMap[event] || updated[deck].status,
                    owner_name: msg.dj  || updated[deck].owner_name,
                    zone:       msg.zone || updated[deck].zone,
                  };
                }
                return updated;
              });

              // If MY deck is now released/resumed, clear active
              if (event === 'deck_released' || event === 'playlist_resumed') {
                setActiveDeck(d => d === deck ? null : d);
              }
            }

            if (event === 'announcement') {
              setAnnouncing(msg.status === 'playing');
            }
          }
        } catch (_) {}
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  // ── Heartbeat ──
  useEffect(() => {
    if (!activeDeck) return;
    const id = setInterval(async () => {
      try {
        await fetch(`${API}/api/dj/deck/heartbeat`, {
          method:  'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
          body:    JSON.stringify({ deck_id: activeDeck }),
        });
      } catch (_) {}
    }, 20_000);
    return () => clearInterval(id);
  }, [activeDeck, tk]);

  // ── Deck button handler ──
  const handleDeckPress = useCallback(async (deckId) => {
    if (!allowedDecks.includes(deckId)) return;

    // If clicking active deck → release it
    if (activeDeck === deckId) {
      try {
        await fetch(`${API}/api/dj/deck/release`, {
          method:  'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
          body:    JSON.stringify({ deck_id: deckId }),
        });
        setActiveDeck(null);
      } catch (e) { console.error('[dj] release error', e); }
      return;
    }

    // Reserve the new deck
    try {
      const res = await fetch(`${API}/api/dj/deck/reserve`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
        body:    JSON.stringify({ deck_id: deckId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[dj] reserve failed:', err.detail);
        return;
      }
      setActiveDeck(deckId);
    } catch (e) { console.error('[dj] reserve error', e); }
  }, [activeDeck, allowedDecks, tk]);

  // ── Feature handlers ──
  const handleAnnounce = async () => {
    if (!activeDeck || announcing) return;
    await fetch(`${API}/api/dj/announce`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
      body:    JSON.stringify({ deck_id: activeDeck, text: 'Live DJ announcement' }),
    }).catch(console.error);
  };

  const handleEffect = async () => {
    if (!activeDeck) return;
    const idx    = EFFECTS_CYCLE.indexOf(activeEffect);
    const next   = EFFECTS_CYCLE[(idx + 1) % EFFECTS_CYCLE.length];
    setActiveEffect(next);
    await fetch(`${API}/api/dj/effect`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
      body:    JSON.stringify({ deck_id: activeDeck, effect: next }),
    }).catch(console.error);
  };

  const handleRecord = async () => {
    if (!activeDeck) return;
    const endpoint = recording ? '/api/dj/record/stop' : '/api/dj/record/start';
    await fetch(`${API}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk}` },
      body:    JSON.stringify({ deck_id: activeDeck }),
    }).catch(console.error);
    setRecording(r => !r);
  };

  const handleExit = async () => {
    try {
      await fetch(`${API}/api/dj/session/end`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${tk}` },
      });
    } catch (_) {}
    onExit();
  };

  // ── Derive current deck state ──
  const activeDeckState = activeDeck ? (deckStates[activeDeck] || {}) : {};
  const isLive     = activeDeckState.status === 'LIVE';
  const isReserved = activeDeckState.status === 'RESERVED';

  // ── Status text ──
  let statusText = '● STANDBY';
  let statusColor= '#3a4462';
  if (activeDeck) {
    const st = activeDeckState.status || 'RESERVED';
    if (st === 'LIVE')       { statusText = `● LIVE · DECK ${activeDeck.toUpperCase()}`; statusColor = '#e03c3c'; }
    else if (st === 'GOING_LIVE') { statusText = `◐ GOING LIVE · DECK ${activeDeck.toUpperCase()}`; statusColor = '#fd9644'; }
    else if (st === 'STOPPING')   { statusText = `◑ STOPPING · DECK ${activeDeck.toUpperCase()}`; statusColor = '#fd9644'; }
    else                          { statusText = `◎ RESERVED · DECK ${activeDeck.toUpperCase()}`; statusColor = DECK_COLORS[activeDeck]; }
  }

  const accentColor = activeDeck ? DECK_COLORS[activeDeck] : '#e8a020';
  const jogStatus   = activeDeck ? (activeDeckState.status || 'AVAILABLE') : 'AVAILABLE';

  const renderDeckColumn = (deckIds) => (
    <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
      {deckIds.map(id => {
        const state  = deckStates[id] || { status: 'AVAILABLE' };
        const isMine = activeDeck === id;
        return (
          <DeckButton key={id} deckId={id}
            deckName={state.zone || id.toUpperCase()}
            state={state}
            isAllowed={allowedDecks.includes(id)}
            isMine={isMine}
            onPress={handleDeckPress}/>
        );
      })}
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
      animation:'djReveal .6s cubic-bezier(.16,1,.3,1) forwards' }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div style={{ background:'#05070c', borderBottom:`1px solid ${accentColor}33`,
        padding:'6px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0,
        transition:'border-color .4s' }}>

        <div style={{ fontFamily:'var(--dj-orb)', fontSize:13, fontWeight:900,
          color:accentColor, letterSpacing:3 }}>DJ BOOTH</div>
        <div style={{ width:1, height:22, background:`${accentColor}22` }}/>

        {/* DJ name tag */}
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{ width:28, height:28, borderRadius:'50%',
            background:`${accentColor}22`, border:`1px solid ${accentColor}44`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:900, color:accentColor }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase() || 'D'}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:700,
              color:'#d0d8f0', letterSpacing:1 }}>{session.djName}</div>
            <div style={{ fontSize:8, color:`${accentColor}aa`, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>
              🎤 {session.audioLabel || session.audioSrc}
            </div>
          </div>
        </div>

        <div style={{ flex:1 }}/>

        {/* WS status */}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:7, height:7, borderRadius:'50%',
            background: wsStatus === 'connected' ? '#2ed573' : wsStatus === 'connecting' ? '#fd9644' : '#e03c3c',
            animation: wsStatus === 'connected' ? 'none' : 'djLivePulse 1s infinite' }}/>
          <span style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)' }}>
            {wsStatus.toUpperCase()}
          </span>
        </div>

        {/* Spectrum bars */}
        <div style={{ display:'flex', gap:2, alignItems:'center', height:20 }}>
          {[...Array(8)].map((_,i) => (
            <div key={i} className={`dj-sp${i}`}
              style={{ width:3, background:accentColor, borderRadius:1, opacity:.7 }}/>
          ))}
        </div>

        <div style={{ width:1, height:22, background:`${accentColor}22` }}/>
        <button id="dj-exit-btn" onClick={handleExit}
          style={{ padding:'4px 12px', borderRadius:6, cursor:'pointer',
            fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1,
            border:'1px solid #1c2038', background:'transparent', color:'#3a4462',
            transition:'all .2s' }}
          onMouseEnter={e => { e.currentTarget.style.color='#e03c3c'; e.currentTarget.style.borderColor='#e03c3c44'; }}
          onMouseLeave={e => { e.currentTarget.style.color='#3a4462'; e.currentTarget.style.borderColor='#1c2038'; }}>
          ✕ EXIT
        </button>
      </div>

      {/* ── MAIN CONTROLLER AREA ─────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        padding:'18px 24px', gap:24, overflow:'hidden',
        backgroundImage:`radial-gradient(ellipse at 50% 50%, ${accentColor}07 0%, transparent 65%)`,
        transition:'background-image .5s' }}>

        {/* LEFT DECKS */}
        {renderDeckColumn(DECK_ORDER_LEFT)}

        {/* LEFT JOG WHEEL */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)',
            letterSpacing:2 }}>JOG L</div>
          <JogWheel color={accentColor} status={jogStatus} size={170}/>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:`${accentColor}88`,
            letterSpacing:1 }}>
            {activeDeck ? `DECK ${activeDeck.toUpperCase()}` : '—'}
          </div>
        </div>

        {/* CENTER PANEL */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14,
          minWidth:220, animation:'djSlideUp .5s ease forwards' }}>

          {/* Stream key hint */}
          {activeDeck && (
            <div style={{ background:'rgba(255,255,255,.03)', borderRadius:8,
              padding:'7px 14px', border:'1px solid var(--dj-border)',
              fontFamily:'var(--dj-mono)', fontSize:9, color:'var(--dj-muted)',
              textAlign:'center', letterSpacing:1 }}>
              OBS stream key: <span style={{ color:accentColor }}>dj-{activeDeck}</span>
              <br/>rtmp://YOUR_IP:1935/dj-{activeDeck}
            </div>
          )}

          {/* Feature buttons row 1 */}
          <div style={{ display:'flex', gap:8, width:'100%' }}>
            <FeatBtn id="dj-btn-announce" label="ANNOUNCE" icon="📢"
              active={announcing} disabled={!isLive}
              color="#fd9644" onClick={handleAnnounce}/>
            <FeatBtn id="dj-btn-loop"   label="LOOP"     icon="🔁"
              active={looping} disabled={!activeDeck}
              color="#a55eea" onClick={() => setLooping(l => !l)}/>
            <FeatBtn id="dj-btn-effect" label={activeEffect !== 'none' ? activeEffect.toUpperCase() : 'EFFECT'} icon="✨"
              active={activeEffect !== 'none'} disabled={!activeDeck}
              color="#3a8fff" onClick={handleEffect}/>
          </div>

          {/* Feature buttons row 2 */}
          <div style={{ display:'flex', gap:8, width:'100%' }}>
            <FeatBtn id="dj-btn-bpmsync" label="BPM SYNC" icon="🎵"
              active={false} disabled={!activeDeck}
              color="#2ed573" onClick={() => {}}/>
            <FeatBtn id="dj-btn-cue" label="CUE"      icon="🎧"
              active={cueActive} disabled={!activeDeck}
              color="#00d4ff" onClick={() => setCueActive(c => !c)}/>
            <FeatBtn id="dj-btn-rec" label={recording ? 'STOP REC' : 'REC'} icon={recording ? '⏹' : '⏺'}
              active={recording} disabled={!activeDeck}
              color="#e03c3c" onClick={handleRecord}/>
          </div>

          {/* Status bar */}
          <div style={{ width:'100%', background:'rgba(0,0,0,.4)', borderRadius:10,
            border:`1px solid ${accentColor}22`, padding:'10px 16px',
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <span style={{ fontFamily:'var(--dj-mono)', fontSize:11, color:statusColor,
              fontWeight:700, letterSpacing:1, animation: isLive ? 'none' : 'none' }}>
              {statusText}
            </span>
            {activeDeck && (
              <span style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'var(--dj-muted)' }}>
                {activeDeckState.zone || '—'}
              </span>
            )}
            {isLive && activeDeckState.started_at && (
              <LiveTimer startedAt={activeDeckState.started_at}/>
            )}
          </div>

          {/* Effect indicator */}
          {activeEffect !== 'none' && (
            <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'#3a8fff',
              letterSpacing:2, animation:'djLivePulse 1.5s infinite' }}>
              ⚡ FX: {activeEffect.toUpperCase()} ACTIVE
            </div>
          )}
        </div>

        {/* RIGHT JOG WHEEL */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)',
            letterSpacing:2 }}>JOG R</div>
          <JogWheel color={accentColor} status={jogStatus} size={170}/>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:`${accentColor}88`,
            letterSpacing:1 }}>
            {activeDeck ? `DECK ${activeDeck.toUpperCase()}` : '—'}
          </div>
        </div>

        {/* RIGHT DECKS */}
        {renderDeckColumn(DECK_ORDER_RIGHT)}
      </div>

      {/* ── BOTTOM STREAM INSTRUCTION ─────────────────────────────────────── */}
      {!activeDeck && (
        <div style={{ borderTop:'1px solid var(--dj-border)', padding:'8px 20px',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'var(--dj-muted)', letterSpacing:1 }}>
            SELECT A DECK TO RESERVE YOUR ZONE, THEN START STREAMING VIA OBS
          </span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════════════ */
export default function DJPage() {
  const [session, setSession] = useState(null);

  useEffect(() => { injectCSS(); }, []);

  const handleConnect = useCallback(cfg  => setSession(cfg),  []);
  const handleExit    = useCallback(()   => setSession(null), []);

  return (
    <div className="djp">
      {!session
        ? <SetupScreen onConnect={handleConnect}/>
        : <DJBoothController session={session} onExit={handleExit}/>}
    </div>
  );
}
