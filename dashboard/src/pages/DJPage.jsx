import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════
   GLOBAL CSS — injected once
═══════════════════════════════════════════════════════════ */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Exo+2:wght@400;600;700&display=swap');

  :root {
    --dj-bg:      #0a0c10;
    --dj-panel:   #111318;
    --dj-panel2:  #181b22;
    --dj-border:  #1f2333;
    --dj-accent:  #e8a020;
    --dj-green:   #1ed760;
    --dj-red:     #e03c3c;
    --dj-blue:    #3a8fff;
    --dj-text:    #cdd2e0;
    --dj-muted:   #4a5068;
    --dj-mono:    'Share Tech Mono', monospace;
    --dj-sans:    'Exo 2', sans-serif;
  }

  .djpage-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .djpage-root {
    font-family: var(--dj-sans);
    background: var(--dj-bg);
    color: var(--dj-text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* escape the .main-content padding and fill the remaining viewport */
    margin: -2rem;
    height: calc(100vh - 80px); /* 80px = AppHeader height approx */
  }

  @keyframes dj-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
  @keyframes dj-spin  { to{ transform:rotate(360deg) } }
  @keyframes dj-spin-slow { to{ transform:rotate(360deg) } }

  /* VU animations */
  @keyframes vu0{0%,100%{height:28%}40%{height:82%}70%{height:46%}}
  @keyframes vu1{0%,100%{height:55%}30%{height:18%}75%{height:90%}}
  @keyframes vu2{0%,100%{height:40%}20%{height:95%}60%{height:32%}}
  @keyframes vu3{0%,100%{height:70%}50%{height:22%}85%{height:88%}}
  @keyframes vu4{0%,100%{height:35%}35%{height:78%}65%{height:50%}}
  @keyframes vu5{0%,100%{height:60%}45%{height:20%}80%{height:92%}}
  .dj-vu0{animation:vu0 1.05s ease-in-out infinite}
  .dj-vu1{animation:vu1 0.85s ease-in-out infinite}
  .dj-vu2{animation:vu2 1.2s  ease-in-out infinite}
  .dj-vu3{animation:vu3 0.78s ease-in-out infinite}
  .dj-vu4{animation:vu4 1.35s ease-in-out infinite}
  .dj-vu5{animation:vu5 0.95s ease-in-out infinite}

  /* Spectrum animations */
  @keyframes sp0{0%,100%{height:22%}50%{height:70%}}
  @keyframes sp1{0%,100%{height:55%}50%{height:92%}}
  @keyframes sp2{0%,100%{height:38%}50%{height:74%}}
  @keyframes sp3{0%,100%{height:72%}50%{height:28%}}
  @keyframes sp4{0%,100%{height:45%}50%{height:85%}}
  @keyframes sp5{0%,100%{height:80%}50%{height:18%}}
  @keyframes sp6{0%,100%{height:60%}50%{height:96%}}
  @keyframes sp7{0%,100%{height:30%}50%{height:62%}}
  .dj-sp0{animation:sp0 0.9s  ease-in-out infinite}
  .dj-sp1{animation:sp1 0.72s ease-in-out infinite}
  .dj-sp2{animation:sp2 1.1s  ease-in-out infinite}
  .dj-sp3{animation:sp3 0.83s ease-in-out infinite}
  .dj-sp4{animation:sp4 1.02s ease-in-out infinite}
  .dj-sp5{animation:sp5 0.65s ease-in-out infinite}
  .dj-sp6{animation:sp6 0.97s ease-in-out infinite}
  .dj-sp7{animation:sp7 1.18s ease-in-out infinite}

  .djpage-root button:focus { outline: none; }
  .djpage-root input:focus  { outline: none; }

  .djpage-root ::-webkit-scrollbar { width: 3px; }
  .djpage-root ::-webkit-scrollbar-track { background: transparent; }
  .djpage-root ::-webkit-scrollbar-thumb { background: var(--dj-border); border-radius: 2px; }
`;

function injectCSS() {
  if (document.getElementById('djpage-css')) return;
  const s = document.createElement('style');
  s.id = 'djpage-css';
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════
   WEB MIDI — controller hook
   Reads CC / Note messages from any connected MIDI device.
   Map is intentionally open — extend for your Denon SC6000.
═══════════════════════════════════════════════════════════ */
function useMIDI(onMessage) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let inputs = [];

    navigator.requestMIDIAccess().then(access => {
      const attach = () => {
        inputs.forEach(i => { i.onmidimessage = null; });
        inputs = [];
        access.inputs.forEach(input => {
          input.onmidimessage = (evt) => {
            const [status, data1, data2] = evt.data;
            const type   = status & 0xf0;
            const ch     = status & 0x0f;
            onMessageRef.current({ type, ch, data1, data2, raw: evt.data });
          };
          inputs.push(input);
        });
      };
      attach();
      access.onstatechange = attach;
    }).catch(() => {});

    return () => { inputs.forEach(i => { i.onmidimessage = null; }); };
  }, []);
}

/* ═══════════════════════════════════════════════════════════
   STATIC MOCK DATA (overridden by MIDI when controller live)
═══════════════════════════════════════════════════════════ */
const FAKE_DEVICES = [
  { id:'d1', name:'Denon DJ SC6000',  connected:true,  sampleRate:'48kHz', buffer:'256' },
  { id:'d2', name:'Built-in Audio',   connected:true,  sampleRate:'44.1kHz', buffer:'128' },
  { id:'d3', name:'Focusrite 2i2',    connected:false, sampleRate:'96kHz',   buffer:'64'  },
];

const TRACKS = {
  A: { title:'Midnight Protocol',  artist:'CØVR',     bpm:128.0, key:'Am', dur:402 },
  B: { title:'Neon Cascade',       artist:'Parallax', bpm:135.0, key:'Fm', dur:435 },
};

const SEQ_STEPS = [
  { label:'Music',           cls:'seq-music' },
  { label:'Fad Jingle',      cls:'seq-jingle' },
  { label:'Fad Start',       cls:'seq-jingle' },
  { label:'Announcement',    cls:'seq-announce' },
  { label:'End Fad',         cls:'seq-jingle' },
  { label:'Jingle Fad Start',cls:'seq-jingle' },
  { label:'Music',           cls:'seq-music' },
];

const HOT_COLORS = ['#e03c3c','#e8a020','#f5d020','#1ed760','#3a8fff','#a855f7','#ec4899','#ffffff'];
const DECK_OUTPUTS = ['A','B','C','D','E','F'];

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const fmt   = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

/* ═══════════════════════════════════════════════════════════
   KNOB
═══════════════════════════════════════════════════════════ */
function Knob({ size=42, value=0.5, onChange, color='#e8a020', label, centerZero=false }) {
  const startRef = useRef(null);
  const angle = centerZero ? (value - 0.5) * 270 : -135 + value * 270;
  const r = size / 2 - 4, cx = size / 2, cy = size / 2;
  const rad = (angle * Math.PI) / 180;
  const tx = cx + r * 0.68 * Math.sin(rad);
  const ty = cy - r * 0.68 * Math.cos(rad);

  const onMD = e => {
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };
    const move = ev => {
      const dy = (startRef.current.y - ev.clientY) / 130;
      onChange?.(clamp(startRef.current.v + dy, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <svg width={size} height={size} onMouseDown={onMD} style={{ cursor:'ns-resize', flexShrink:0 }}>
        <circle cx={cx} cy={cy} r={r+2} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1.5}/>
        <circle cx={cx} cy={cy} r={r}   fill="#0e1018" stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
        <circle cx={cx} cy={cy} r={r-7} fill="#0a0c10"/>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={color} strokeWidth={2.5} strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r={2} fill={color} opacity={0.5}/>
      </svg>
      {label && <span style={{ fontSize:8, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VERT FADER
═══════════════════════════════════════════════════════════ */
function VertFader({ value, onChange, color, height=110 }) {
  const trackRef = useRef(null);
  const onMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = trackRef.current.getBoundingClientRect();
      onChange(clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  const pct = (1 - value) * 100;
  return (
    <div ref={trackRef} onMouseDown={onMD} style={{
      width:12, height, background:'rgba(0,0,0,0.5)', borderRadius:6,
      border:`1px solid var(--dj-border)`, position:'relative',
      cursor:'ns-resize', flexShrink:0,
    }}>
      <div style={{
        position:'absolute', left:2, right:2, bottom:2,
        height:`${value*100}%`, borderRadius:4,
        background:`linear-gradient(0deg,${color}99,${color}22)`,
      }}/>
      <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.07)' }}/>
      <div onMouseDown={onMD} style={{
        position:'absolute', left:'50%', top:`${pct}%`,
        transform:'translate(-50%,-50%)',
        width:20, height:9, borderRadius:3,
        background:'linear-gradient(180deg,#2e3245,#141824)',
        border:'1px solid rgba(255,255,255,0.15)',
        boxShadow:`0 2px 6px rgba(0,0,0,.7)`,
        cursor:'ns-resize',
      }}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VU METER
═══════════════════════════════════════════════════════════ */
function VUMeter({ color, playing, height=80, bars=6 }) {
  return (
    <div style={{ display:'flex', gap:2, alignItems:'flex-end', height, width: bars*7+bars }}>
      {Array.from({ length: bars }).map((_, i) => {
        const c = i >= bars-1 ? 'var(--dj-red)' : i >= bars-2 ? '#f5d020' : color;
        return (
          <div key={i} style={{ width:5, height:'100%', background:'rgba(255,255,255,0.04)', borderRadius:2, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
            <div className={playing ? `dj-vu${i}` : ''}
              style={{ width:'100%', height: playing ? undefined : '12%', background:c, borderRadius:2 }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   JOG WHEEL
═══════════════════════════════════════════════════════════ */
function JogWheel({ playing, color, angle=0, size=155 }) {
  const r = size / 2;
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{
        position:'absolute', inset:-4, borderRadius:'50%', pointerEvents:'none',
        boxShadow: playing
          ? `0 0 22px ${color}88, 0 0 50px ${color}33`
          : `0 0 8px ${color}22`,
        transition:'box-shadow 0.5s',
      }}/>
      <svg width={size} height={size} style={{
        position:'absolute', top:0, left:0,
        animation: playing ? 'dj-spin 2.5s linear infinite' : 'dj-spin-slow 10s linear infinite',
      }}>
        <defs>
          <radialGradient id={`jog-g-${color.replace(/[^a-z0-9]/gi,'')}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#1e2235"/>
            <stop offset="100%" stopColor="#0a0c14"/>
          </radialGradient>
        </defs>
        <circle cx={r} cy={r} r={r-2} fill={`url(#jog-g-${color.replace(/[^a-z0-9]/gi,'')})`} stroke={color} strokeWidth={1} strokeOpacity={0.3}/>
        {Array.from({length:10}).map((_,i) => (
          <circle key={i} cx={r} cy={r} r={r-14-i*8} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={0.8}/>
        ))}
        {Array.from({length:12}).map((_,i) => {
          const a = (i*30*Math.PI)/180;
          return <line key={i} x1={r+18*Math.cos(a)} y1={r+18*Math.sin(a)} x2={r+(r-18)*Math.cos(a)} y2={r+(r-18)*Math.sin(a)} stroke="rgba(255,255,255,0.035)" strokeWidth={0.8}/>;
        })}
        <circle cx={r} cy={r} r={22} fill="#0d0f18" stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
        <circle cx={r} cy={r} r={14} fill="#08090e"/>
        <line x1={r} y1={r-8} x2={r} y2={r-r+10} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.9}/>
        <circle cx={r} cy={r} r={5} fill={color} opacity={0.85}/>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MINI WAVEFORM CANVAS
═══════════════════════════════════════════════════════════ */
function MiniWave({ color, progress=0.35, seed=1 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth || 300;
    const H = 40;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const bw = 3, gap = 1;
    const cols = Math.floor(W / (bw + gap));
    for (let i = 0; i < cols; i++) {
      const x = i * (bw + gap);
      const amp = Math.abs(Math.sin(i * 0.12 * seed) * 10 + Math.sin(i * 0.31) * 6 + Math.sin(i * 0.7 * seed) * 3);
      const played = x / W < progress;
      ctx.fillStyle = played ? color : color + '30';
      ctx.globalAlpha = played ? 0.9 : 0.35;
      ctx.beginPath();
      ctx.roundRect(x, H/2 - amp, bw, amp*2, 1);
      ctx.fill();
    }
    // playhead
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(progress * W - 1, 0, 1.5, H);
    // beat ticks
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 16; i++) {
      ctx.fillRect(i * (W/16), H-3, 1, 3);
    }
  });
  return <canvas ref={canvasRef} style={{ width:'100%', height:40, display:'block' }}/>;
}

/* ═══════════════════════════════════════════════════════════
   PITCH SLIDER
═══════════════════════════════════════════════════════════ */
function PitchSlider({ value, onChange, color }) {
  const tRef = useRef(null);
  const onMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = tRef.current.getBoundingClientRect();
      onChange(clamp((ev.clientY - rect.top) / rect.height, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  const pct = value * 100;
  const semi = ((value - 0.5) * 16).toFixed(2);
  const sign = semi > 0 ? '+' : '';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', textTransform:'uppercase', letterSpacing:1 }}>PITCH</span>
      <div ref={tRef} onMouseDown={onMD} style={{
        width:8, height:88, background:'rgba(0,0,0,0.5)', borderRadius:4,
        border:`1px solid var(--dj-border)`, position:'relative', cursor:'ns-resize',
      }}>
        <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.1)' }}/>
        <div style={{
          position:'absolute', left:'50%', top:`${pct}%`, transform:'translate(-50%,-50%)',
          width:14, height:6, borderRadius:2, background:color,
          boxShadow:`0 0 6px ${color}`, cursor:'ns-resize',
        }}/>
      </div>
      <span style={{ fontSize:8, color, fontFamily:'var(--dj-mono)' }}>{sign}{semi}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DECK TOP (track info + waveform + transport)
═══════════════════════════════════════════════════════════ */
function DeckTop({ side, color, midiState }) {
  const track = TRACKS[side];
  const [playing, setPlaying] = useState(side === 'A');
  const [sync, setSync]       = useState(false);
  const [elapsed, setElapsed] = useState(side === 'A' ? 148 : 62);
  const [progress, setProgress] = useState(side === 'A' ? 0.37 : 0.14);

  // MIDI overrides
  useEffect(() => {
    if (!midiState) return;
    if (midiState[`play_${side}`] !== undefined) setPlaying(midiState[`play_${side}`]);
  }, [midiState, side]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed(e => e + 1);
      setProgress(p => clamp(p + 0.0004, 0, 0.999));
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  const remain = track.dur - elapsed;
  const bpm = midiState?.[`bpm_${side}`] ?? track.bpm;

  const Btn = ({ label, active, onClick, ac }) => (
    <button onClick={onClick} style={{
      padding:'4px 8px', borderRadius:4, fontSize:9, fontFamily:'var(--dj-mono)', cursor:'pointer',
      border:`1px solid ${active ? (ac||color) : 'var(--dj-border)'}`,
      background: active ? `${ac||color}18` : 'rgba(255,255,255,0.02)',
      color: active ? (ac||color) : 'var(--dj-muted)',
      boxShadow: active ? `0 0 7px ${ac||color}55` : 'none',
      transition:'all 0.12s', textTransform:'uppercase', letterSpacing:'0.5px',
    }}>{label}</button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1, minWidth:0 }}>
      {/* Header */}
      <div style={{
        background:'rgba(0,0,0,0.35)', borderRadius:7, padding:'7px 10px',
        border:`1px solid var(--dj-border)`,
        display:'flex', justifyContent:'space-between', alignItems:'flex-start',
      }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
            <div style={{
              width:5, height:5, borderRadius:'50%',
              background: playing ? color : 'var(--dj-muted)',
              boxShadow: playing ? `0 0 5px ${color}` : 'none',
              transition:'all 0.3s', flexShrink:0,
            }}/>
            <span style={{ fontSize:7, fontFamily:'var(--dj-mono)', color, letterSpacing:2 }}>DECK {side}</span>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dj-text)', maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
          <div style={{ fontSize:10, color:'var(--dj-muted)', marginTop:1 }}>{track.artist}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--dj-mono)', color, lineHeight:1 }}>{bpm.toFixed(1)}</div>
          <div style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>BPM</div>
          <div style={{ fontSize:10, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', marginTop:1 }}>{track.key}</div>
        </div>
      </div>

      {/* Time row */}
      <div style={{ display:'flex', gap:5 }}>
        {[['ELAPSED', fmt(elapsed), color], ['REMAIN', `-${fmt(Math.max(0,remain))}`, 'var(--dj-muted)']].map(([lbl,val,c]) => (
          <div key={lbl} style={{
            flex:1, background:'rgba(0,0,0,0.4)', borderRadius:5, padding:'3px 7px',
            border:`1px solid var(--dj-border)`,
          }}>
            <div style={{ fontSize:14, fontFamily:'var(--dj-mono)', color:c, fontWeight:700, lineHeight:1 }}>{val}</div>
            <div style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Waveform */}
      <div style={{ background:'rgba(0,0,0,0.4)', borderRadius:6, padding:'3px 5px', border:`1px solid var(--dj-border)` }}>
        <MiniWave color={color} progress={progress} seed={side === 'A' ? 1 : 1.7}/>
      </div>

      {/* Transport */}
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <button onClick={() => setPlaying(p => !p)} style={{
          width:42, height:36, borderRadius:7, cursor:'pointer', fontSize:14,
          border:`2px solid ${playing ? color : 'var(--dj-border)'}`,
          background: playing ? `${color}22` : 'rgba(255,255,255,0.03)',
          color: playing ? color : 'var(--dj-muted)',
          boxShadow: playing ? `0 0 14px ${color}66` : 'none',
          transition:'all 0.2s', flexShrink:0,
        }}>{playing ? '⏸' : '▶'}</button>
        <Btn label="CUE" active={false} onClick={() => {}}/>
        <Btn label="SYNC" active={sync} onClick={() => setSync(s => !s)} ac="var(--dj-green)"/>
        <div style={{ marginLeft:'auto', fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)' }}>
          {Math.round(progress * 100)}%
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DECK BOTTOM (scratch section)
═══════════════════════════════════════════════════════════ */
function DeckBottom({ side, color, midiState }) {
  const [playing]  = useState(side === 'A');
  const [hotCues, setHotCues] = useState(() => HOT_COLORS.map((_, i) => i < 2));
  const [pitch, setPitch]     = useState(0.5);
  const [loopSize, setLoopSize] = useState('4');
  const [loopOn, setLoopOn]   = useState(false);
  const loops = ['1','2','4','8','16','32'];

  // MIDI pitch override
  useEffect(() => {
    if (midiState?.[`pitch_${side}`] !== undefined) setPitch(midiState[`pitch_${side}`]);
  }, [midiState, side]);

  return (
    <div style={{
      background:'var(--dj-panel)', borderRadius:10,
      border:`1px solid var(--dj-border)`,
      padding:10, display:'flex', flexDirection:'column', gap:8,
      height:'100%',
    }}>
      {/* Jog + pitch + VU */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
        <PitchSlider value={pitch} onChange={setPitch} color={color}/>
        <JogWheel playing={playing} color={color} size={148}/>
        <VUMeter color={color} playing={playing} height={148} bars={6}/>
      </div>

      {/* Loop */}
      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
        <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:1, marginRight:2 }}>LOOP</span>
        {loops.map(s => (
          <button key={s} onClick={() => { setLoopSize(s); setLoopOn(true); }} style={{
            padding:'2px 5px', borderRadius:3, fontSize:8, fontFamily:'var(--dj-mono)', cursor:'pointer',
            border:`1px solid ${loopOn && loopSize===s ? color : 'var(--dj-border)'}`,
            background: loopOn && loopSize===s ? `${color}18` : 'rgba(255,255,255,0.02)',
            color: loopOn && loopSize===s ? color : 'var(--dj-muted)',
            transition:'all 0.1s',
          }}>{s}</button>
        ))}
        <button onClick={() => setLoopOn(false)} style={{
          padding:'2px 5px', borderRadius:3, fontSize:8, fontFamily:'var(--dj-mono)', cursor:'pointer',
          border:'1px solid rgba(224,60,60,0.25)', background:'rgba(224,60,60,0.06)', color:'var(--dj-red)',
        }}>✕</button>
      </div>

      {/* Hot cue pads */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:3 }}>
        {HOT_COLORS.map((c, i) => (
          <button key={i} onClick={() => setHotCues(h => { const n=[...h]; n[i]=!n[i]; return n; })} style={{
            height:24, borderRadius:4, cursor:'pointer', fontSize:9, fontFamily:'var(--dj-mono)',
            border:`1px solid ${hotCues[i] ? c : 'var(--dj-border)'}`,
            background: hotCues[i] ? `${c}22` : 'rgba(255,255,255,0.02)',
            color: hotCues[i] ? c : 'var(--dj-muted)',
            boxShadow: hotCues[i] ? `0 0 7px ${c}55` : 'none',
            transition:'all 0.1s',
          }}>{side}{i+1}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VOLUME COLUMN (ch A + ch B faders + crossfader)
═══════════════════════════════════════════════════════════ */
function VolumeColumn({ midiState }) {
  const [volA, setVolA] = useState(0.82);
  const [volB, setVolB] = useState(0.75);
  const [xfader, setXfader] = useState(0.5);
  const xRef = useRef(null);

  // MIDI overrides
  useEffect(() => {
    if (midiState?.volA !== undefined) setVolA(midiState.volA);
    if (midiState?.volB !== undefined) setVolB(midiState.volB);
    if (midiState?.xfader !== undefined) setXfader(midiState.xfader);
  }, [midiState]);

  const onXMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = xRef.current.getBoundingClientRect();
      setXfader(clamp((ev.clientX - rect.left) / rect.width, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };

  return (
    <div style={{
      width:130, flexShrink:0,
      background:'var(--dj-panel)', borderRadius:10,
      border:`1px solid var(--dj-border)`,
      padding:'10px 8px',
      display:'flex', flexDirection:'column', gap:8, alignItems:'center',
    }}>
      <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:2, textTransform:'uppercase' }}>VOLUME</span>

      <div style={{ display:'flex', gap:12, alignItems:'flex-end', justifyContent:'center' }}>
        {[['A','var(--dj-blue)',volA,setVolA],['B','var(--dj-accent)',volB,setVolB]].map(([ch,c,val,set]) => (
          <div key={ch} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:8, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{ch}</span>
            <VUMeter color={c} playing height={80} bars={5}/>
            <VertFader value={val} onChange={set} color={c} height={100}/>
          </div>
        ))}
      </div>

      <div style={{ height:1, width:'100%', background:'var(--dj-border)' }}/>

      {/* Crossfader */}
      <div style={{ width:'100%' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:7, color:'var(--dj-blue)', fontFamily:'var(--dj-mono)' }}>A</span>
          <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>XFADER</span>
          <span style={{ fontSize:7, color:'var(--dj-accent)', fontFamily:'var(--dj-mono)' }}>B</span>
        </div>
        <div ref={xRef} style={{
          position:'relative', height:16,
          background:'rgba(0,0,0,0.5)', borderRadius:8,
          border:`1px solid var(--dj-border)`, cursor:'pointer',
        }}>
          <div style={{
            position:'absolute', left:2, top:'50%', transform:'translateY(-50%)',
            width:`${xfader*100}%`, height:4, borderRadius:2,
            background:`linear-gradient(90deg,#3a8fff,#e8a020)`,
          }}/>
          <div onMouseDown={onXMD} style={{
            position:'absolute', top:'50%', left:`${xfader*100}%`,
            transform:'translate(-50%,-50%)',
            width:22, height:12, borderRadius:3,
            background:'linear-gradient(180deg,#2e3245,#141824)',
            border:'1px solid rgba(255,255,255,0.18)',
            cursor:'ew-resize',
          }}/>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EQ + FX CENTER
═══════════════════════════════════════════════════════════ */
function EQMixer({ midiState }) {
  const [eqA, setEqA] = useState({ hi:0.72, mid:0.6, lo:0.68 });
  const [eqB, setEqB] = useState({ hi:0.68, mid:0.65, lo:0.71 });
  const [gainA, setGainA] = useState(0.75);
  const [gainB, setGainB] = useState(0.72);
  const [master, setMaster] = useState(0.82);
  const [fxOn, setFxOn]   = useState({ echo:false, reverb:true, flanger:false, delay:false });
  const [fxDepth, setFxDepth] = useState({ echo:0.35, reverb:0.5, flanger:0.28, delay:0.42 });

  const fxList = [
    { id:'echo',    label:'ECHO',   color:'#3a8fff' },
    { id:'reverb',  label:'REVERB', color:'#a855f7' },
    { id:'flanger', label:'FLNG',   color:'#e8a020' },
    { id:'delay',   label:'DELAY',  color:'#1ed760' },
  ];

  return (
    <div style={{
      flex:1, minWidth:0,
      background:'var(--dj-panel)', borderRadius:10,
      border:`1px solid var(--dj-border)`,
      padding:'10px 12px',
      display:'flex', flexDirection:'column', gap:8,
    }}>
      <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:2, textTransform:'uppercase', textAlign:'center' }}>EQ + FX MIXER</span>

      {/* EQ strips */}
      <div style={{ display:'flex', gap:10, justifyContent:'center', alignItems:'flex-start' }}>
        {[['CH.A','var(--dj-blue)',eqA,setEqA,gainA,setGainA],['CH.B','var(--dj-accent)',eqB,setEqB,gainB,setGainB]].map(([ch,c,eq,setEq,gain,setGain], ci) => (
          ci === 0 ? (
            <React.Fragment key={ch}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:8, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{ch}</span>
                <Knob size={38} value={gain}    onChange={setGain}                      color={c} label="GAIN"/>
                <Knob size={36} value={eq.hi}   onChange={v => setEq(e=>({...e,hi:v}))}  color={c} label="HI"  centerZero/>
                <Knob size={36} value={eq.mid}  onChange={v => setEq(e=>({...e,mid:v}))} color={c} label="MID" centerZero/>
                <Knob size={36} value={eq.lo}   onChange={v => setEq(e=>({...e,lo:v}))}  color={c} label="LO"  centerZero/>
              </div>
              {/* Master center */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, paddingTop:14 }}>
                <div style={{ width:1, flex:1, minHeight:12, background:'var(--dj-border)' }}/>
                <Knob size={44} value={master} onChange={setMaster} color="var(--dj-green)" label="MST"/>
                <VUMeter color="var(--dj-green)" playing height={55} bars={4}/>
                <div style={{ width:1, flex:1, minHeight:12, background:'var(--dj-border)' }}/>
              </div>
            </React.Fragment>
          ) : (
            <div key={ch} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:8, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{ch}</span>
              <Knob size={38} value={gain}    onChange={setGain}                      color={c} label="GAIN"/>
              <Knob size={36} value={eq.hi}   onChange={v => setEq(e=>({...e,hi:v}))}  color={c} label="HI"  centerZero/>
              <Knob size={36} value={eq.mid}  onChange={v => setEq(e=>({...e,mid:v}))} color={c} label="MID" centerZero/>
              <Knob size={36} value={eq.lo}   onChange={v => setEq(e=>({...e,lo:v}))}  color={c} label="LO"  centerZero/>
            </div>
          )
        ))}
      </div>

      <div style={{ height:1, background:'var(--dj-border)' }}/>

      {/* FX */}
      <div>
        <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:2, display:'block', textAlign:'center', marginBottom:5 }}>FX UNIT</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
          {fxList.map(fx => (
            <div key={fx.id} style={{
              display:'flex', alignItems:'center', gap:5,
              background:'rgba(0,0,0,0.3)', borderRadius:5, padding:'4px 6px',
              border:`1px solid ${fxOn[fx.id] ? `${fx.color}44` : 'var(--dj-border)'}`,
            }}>
              <button onClick={() => setFxOn(f => ({...f,[fx.id]:!f[fx.id]}))} style={{
                width:7, height:7, borderRadius:'50%', flexShrink:0, cursor:'pointer',
                border:'none', padding:0,
                background: fxOn[fx.id] ? fx.color : 'var(--dj-muted)',
                boxShadow: fxOn[fx.id] ? `0 0 6px ${fx.color}` : 'none',
                transition:'all 0.2s',
              }}/>
              <span style={{ fontSize:8, fontFamily:'var(--dj-mono)', color: fxOn[fx.id] ? fx.color : 'var(--dj-muted)', flex:1, letterSpacing:0.5 }}>{fx.label}</span>
              <Knob size={26} value={fxDepth[fx.id]} onChange={v => setFxDepth(d => ({...d,[fx.id]:v}))} color={fxOn[fx.id] ? fx.color : 'var(--dj-muted)'}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOP BAR
═══════════════════════════════════════════════════════════ */
function TopBar({ isLive, setIsLive, midiDevices }) {
  const [time, setTime] = useState(new Date());
  const primaryDevice = midiDevices[0] || FAKE_DEVICES.find(d => d.connected && d.name.includes('Denon'));

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtTime = d =>
    `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;

  return (
    <div style={{
      height:48, flexShrink:0,
      background:'#0d0f18',
      borderBottom:`1px solid var(--dj-border)`,
      display:'flex', alignItems:'center', padding:'0 14px', gap:12,
    }}>
      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{
          width:28, height:28, borderRadius:6,
          background:'linear-gradient(135deg,#3a8fff,#0044aa)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 12px rgba(58,143,255,0.5)',
          fontSize:13, fontWeight:900, color:'#fff', fontFamily:'var(--dj-mono)',
        }}>C</div>
        <span style={{ fontFamily:'var(--dj-mono)', fontSize:13, fontWeight:700, color:'var(--dj-blue)', letterSpacing:3, whiteSpace:'nowrap' }}>
          COCO<span style={{ color:'var(--dj-muted)' }}>DJ</span>
        </span>
      </div>

      <div style={{ width:1, height:26, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* DJ Name */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <div style={{
          width:22, height:22, borderRadius:'50%', flexShrink:0,
          background:'linear-gradient(135deg,#a855f7,#e8a020)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:9, fontWeight:700, color:'#fff',
        }}>Y</div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--dj-text)', lineHeight:1 }}>DJ Yassine</div>
          <div style={{ fontSize:8, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:0.5 }}>ON AIR</div>
        </div>
      </div>

      {/* LIVE badge */}
      <div style={{
        display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:10,
        border:`1px solid ${isLive ? 'rgba(224,60,60,0.4)' : 'var(--dj-border)'}`,
        background: isLive ? 'rgba(224,60,60,0.1)' : 'rgba(255,255,255,0.03)',
        flexShrink:0,
      }}>
        <div style={{
          width:6, height:6, borderRadius:'50%',
          background: isLive ? 'var(--dj-red)' : 'var(--dj-muted)',
          boxShadow: isLive ? '0 0 6px var(--dj-red)' : 'none',
          animation: isLive ? 'dj-blink 1.1s ease-in-out infinite' : 'none',
        }}/>
        <span style={{ fontSize:9, fontFamily:'var(--dj-mono)', color: isLive ? 'var(--dj-red)' : 'var(--dj-muted)', letterSpacing:1 }}>
          {isLive ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Clock */}
      <div style={{ fontSize:17, fontFamily:'var(--dj-mono)', color:'var(--dj-accent)', letterSpacing:2, fontWeight:600, flexShrink:0 }}>
        {fmtTime(time)}
      </div>

      <div style={{ width:1, height:26, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* Device card */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'4px 10px', borderRadius:7,
        background:'rgba(0,0,0,0.4)', border:`1px solid ${primaryDevice ? 'rgba(58,143,255,0.3)' : 'var(--dj-border)'}`,
        flexShrink:0,
      }}>
        <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
          background: primaryDevice ? 'var(--dj-green)' : 'var(--dj-muted)',
          boxShadow: primaryDevice ? '0 0 5px var(--dj-green)' : 'none',
        }}/>
        <div>
          <div style={{ fontSize:10, color:'var(--dj-blue)', fontFamily:'var(--dj-mono)', fontWeight:600, lineHeight:1 }}>
            {primaryDevice?.name || 'No controller'}
          </div>
          <div style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)' }}>
            {primaryDevice ? `${primaryDevice.sampleRate || '48kHz'} · ${primaryDevice.buffer || '256'}buf` : 'Connect a MIDI device'}
          </div>
        </div>
      </div>

      <div style={{ flex:1 }}/>

      {/* GO LIVE */}
      <button onClick={() => setIsLive(l => !l)} style={{
        padding:'6px 16px', borderRadius:7, cursor:'pointer',
        fontFamily:'var(--dj-mono)', fontSize:10, letterSpacing:1, fontWeight:700,
        border:`2px solid ${isLive ? 'rgba(224,60,60,0.6)' : 'rgba(30,215,96,0.5)'}`,
        background: isLive ? 'rgba(224,60,60,0.15)' : 'rgba(30,215,96,0.12)',
        color: isLive ? 'var(--dj-red)' : 'var(--dj-green)',
        boxShadow: isLive ? '0 0 14px rgba(224,60,60,0.4)' : '0 0 14px rgba(30,215,96,0.3)',
        transition:'all 0.25s', flexShrink:0,
      }}>{isLive ? '● GO OFFLINE' : '▶ GO LIVE'}</button>

      <div style={{ width:1, height:26, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* Settings */}
      <button style={{
        width:30, height:30, borderRadius:6, cursor:'pointer', fontSize:14,
        border:`1px solid var(--dj-border)`, background:'rgba(255,255,255,0.03)',
        color:'var(--dj-muted)', display:'flex', alignItems:'center', justifyContent:'center',
        transition:'all 0.2s', flexShrink:0,
      }}>⚙</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SEQUENCE BAR
═══════════════════════════════════════════════════════════ */
const SEQ_STYLES = {
  'seq-music':    { bg:'rgba(58,143,255,0.12)',  border:'#3a8fff', color:'#3a8fff' },
  'seq-jingle':   { bg:'rgba(232,160,32,0.12)',  border:'#e8a020', color:'#e8a020' },
  'seq-announce': { bg:'rgba(30,215,96,0.12)',   border:'#1ed760', color:'#1ed760' },
};

function SequenceBar({ currentStep=3 }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:6,
      background:'var(--dj-panel2)', borderTop:`1px solid var(--dj-border)`,
      borderBottom:`1px solid var(--dj-border)`,
      padding:'5px 14px', flexShrink:0,
    }}>
      <span style={{ fontSize:9, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', whiteSpace:'nowrap', letterSpacing:1 }}>AUTO SEQ</span>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
        {SEQ_STEPS.map((step, i) => {
          const s = SEQ_STYLES[step.cls];
          const active = i === currentStep;
          return (
            <React.Fragment key={i}>
              <span style={{
                fontFamily:'var(--dj-mono)', fontSize:10, padding:'2px 8px', borderRadius:3,
                background: active ? s.border + '33' : s.bg,
                border:`1px solid ${s.border}${active ? '' : '88'}`,
                color: s.color,
                outline: active ? `2px solid ${s.border}` : 'none',
                outlineOffset: active ? 1 : 0,
                fontWeight: active ? 700 : 400,
              }}>{step.label}</span>
              {i < SEQ_STEPS.length-1 && (
                <span style={{ color:'var(--dj-muted)', fontSize:9 }}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   BOTTOM BAR
═══════════════════════════════════════════════════════════ */
function BottomBar({ isLive, midiDevices }) {
  const [outputs, setOutputs] = useState({ A:true, B:true, C:false, D:false, E:false, F:false });

  const allDevices = [
    ...midiDevices.map(d => ({ ...d, connected:true })),
    ...FAKE_DEVICES.filter(fd => !midiDevices.find(md => md.name === fd.name)),
  ];

  const specCls = ['dj-sp0','dj-sp1','dj-sp2','dj-sp3','dj-sp4','dj-sp5','dj-sp6','dj-sp7'];
  const specColors = ['#3a8fff','#3adfff','#1ed760','#f5d020','#e8a020','#e03c3c','#a855f7','#3a8fff'];

  return (
    <div style={{
      flexShrink:0,
      background:'#0d0f18',
      borderTop:`1px solid var(--dj-border)`,
      padding:'7px 14px',
      display:'flex', alignItems:'center', gap:14,
    }}>
      {/* Audio Input */}
      <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
        <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:2, textTransform:'uppercase' }}>AUDIO IN</span>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {allDevices.map(d => (
            <div key={d.id||d.name} style={{
              display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5,
              border:`1px solid ${d.connected ? 'rgba(30,215,96,0.3)' : 'var(--dj-border)'}`,
              background: d.connected ? 'rgba(30,215,96,0.07)' : 'rgba(255,255,255,0.02)',
            }}>
              <div style={{
                width:5, height:5, borderRadius:'50%', flexShrink:0,
                background: d.connected ? 'var(--dj-green)' : 'var(--dj-muted)',
                boxShadow: d.connected ? '0 0 4px var(--dj-green)' : 'none',
              }}/>
              <span style={{ fontSize:9, fontFamily:'var(--dj-mono)', color: d.connected ? 'var(--dj-text)' : 'var(--dj-muted)', whiteSpace:'nowrap' }}>{d.name}</span>
              {d.connected && d.sampleRate && (
                <span style={{ fontSize:7, color:'var(--dj-green)', fontFamily:'var(--dj-mono)' }}>{d.sampleRate}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ width:1, height:34, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* Output routing */}
      <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
        <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:2, textTransform:'uppercase' }}>OUTPUT</span>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {DECK_OUTPUTS.map(k => (
            <button key={k} onClick={() => setOutputs(o => ({...o,[k]:!o[k]}))} style={{
              width:26, height:22, borderRadius:4, cursor:'pointer',
              fontSize:9, fontFamily:'var(--dj-mono)', fontWeight:700,
              border:`1px solid ${outputs[k] ? 'var(--dj-blue)' : 'var(--dj-border)'}`,
              background: outputs[k] ? 'rgba(58,143,255,0.18)' : 'rgba(255,255,255,0.02)',
              color: outputs[k] ? 'var(--dj-blue)' : 'var(--dj-muted)',
              boxShadow: outputs[k] ? '0 0 7px rgba(58,143,255,0.4)' : 'none',
              transition:'all 0.12s',
            }}>{k}</button>
          ))}
          <div style={{ width:1, height:18, background:'var(--dj-border)', margin:'0 2px' }}/>
          <button onClick={() => setOutputs(DECK_OUTPUTS.reduce((a,k)=>({...a,[k]:true}),{}))} style={{
            padding:'2px 7px', borderRadius:4, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)',
            border:'1px solid rgba(30,215,96,0.3)', background:'rgba(30,215,96,0.08)', color:'var(--dj-green)',
          }}>ALL</button>
          <button onClick={() => setOutputs(DECK_OUTPUTS.reduce((a,k)=>({...a,[k]:false}),{}))} style={{
            padding:'2px 7px', borderRadius:4, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)',
            border:'1px solid rgba(224,60,60,0.25)', background:'rgba(224,60,60,0.06)', color:'var(--dj-red)',
          }}>NONE</button>
        </div>
      </div>

      <div style={{ width:1, height:34, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* Spectrum */}
      <div style={{ flex:1, display:'flex', gap:1.5, alignItems:'flex-end', height:30, minWidth:0, overflow:'hidden' }}>
        {Array.from({length:50}).map((_, i) => {
          const cl = specCls[i % 8];
          const c  = specColors[Math.floor(i/6) % specColors.length];
          return (
            <div key={i} style={{ flex:1, height:'100%', background:'rgba(255,255,255,0.04)', borderRadius:1, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
              <div className={cl} style={{
                width:'100%', background:c, borderRadius:1,
                animationDelay:`${i*0.04}s`,
              }}/>
            </div>
          );
        })}
      </div>

      <div style={{ width:1, height:34, background:'var(--dj-border)', flexShrink:0 }}/>

      {/* On-air status */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0 }}>
        <div style={{
          padding:'4px 12px', borderRadius:7,
          border:`1px solid ${isLive ? 'rgba(224,60,60,0.5)' : 'var(--dj-border)'}`,
          background: isLive ? 'rgba(224,60,60,0.12)' : 'rgba(255,255,255,0.03)',
        }}>
          <span style={{
            fontSize:10, fontFamily:'var(--dj-mono)', fontWeight:700, letterSpacing:1.5,
            color: isLive ? 'var(--dj-red)' : 'var(--dj-muted)',
          }}>{isLive ? '● ON AIR' : '■ OFFLINE'}</span>
        </div>
        <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)' }}>
          {isLive ? '320kbps · AAC' : 'READY'}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MIDI MESSAGE PARSER
   Maps raw MIDI CC/Note messages → named DJ parameters.
   Extend the switch cases to match your Denon SC6000 mapping.
═══════════════════════════════════════════════════════════ */
function parseMIDI(msg, setState) {
  const { type, ch, data1, data2 } = msg;
  const norm = data2 / 127; // 0..1

  // type 0xB0 = CC, 0x90 = Note On, 0x80 = Note Off
  if (type === 0xB0) {
    switch (data1) {
      // ── Deck A ──
      case 1:  return setState(s => ({...s, volA: norm }));          // CH A volume
      case 2:  return setState(s => ({...s, pitch_A: 1-norm }));     // CH A pitch
      case 3:  return setState(s => ({...s, eqA_hi: norm }));        // CH A EQ hi
      case 4:  return setState(s => ({...s, eqA_mid: norm }));       // CH A EQ mid
      case 5:  return setState(s => ({...s, eqA_lo: norm }));        // CH A EQ lo
      // ── Deck B ──
      case 6:  return setState(s => ({...s, volB: norm }));
      case 7:  return setState(s => ({...s, pitch_B: 1-norm }));
      case 8:  return setState(s => ({...s, eqB_hi: norm }));
      case 9:  return setState(s => ({...s, eqB_mid: norm }));
      case 10: return setState(s => ({...s, eqB_lo: norm }));
      // ── Crossfader ──
      case 14: return setState(s => ({...s, xfader: norm }));
      default: break;
    }
  }

  if (type === 0x90 && data2 > 0) {
    switch (data1) {
      case 11: return setState(s => ({...s, play_A: !s.play_A }));
      case 12: return setState(s => ({...s, play_B: !s.play_B }));
      default: break;
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   ROOT PAGE
═══════════════════════════════════════════════════════════ */
export default function DJPage() {
  const [isLive, setIsLive]   = useState(false);
  const [midiState, setMidiState] = useState({});
  const [midiDevices, setMidiDevices] = useState([]);

  useEffect(() => { injectCSS(); }, []);

  // Enumerate MIDI devices and keep list updated
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(access => {
      const update = () => {
        const devs = [];
        access.inputs.forEach(input => {
          devs.push({ id: input.id, name: input.name, sampleRate:'48kHz', buffer:'256' });
        });
        setMidiDevices(devs);
      };
      update();
      access.onstatechange = update;
    }).catch(() => {});
  }, []);

  // Receive MIDI messages
  useMIDI(useCallback(msg => {
    parseMIDI(msg, setMidiState);
  }, []));

  return (
    <div className="djpage-root">
      <TopBar isLive={isLive} setIsLive={setIsLive} midiDevices={midiDevices}/>
      <SequenceBar currentStep={3}/>

      {/* MAIN BODY */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, padding:'6px 8px', overflow:'hidden', minHeight:0 }}>

        {/* ROW 1 — Deck tops + Volume column */}
        <div style={{ display:'flex', gap:6, flex:'0 0 auto' }}>
          {/* Deck A top */}
          <div style={{
            flex:1, minWidth:0,
            background:'var(--dj-panel)', borderRadius:10,
            border:`1px solid var(--dj-border)`,
            padding:10,
          }}>
            <DeckTop side="A" color="var(--dj-blue)" midiState={midiState}/>
          </div>

          <VolumeColumn midiState={midiState}/>

          {/* Deck B top */}
          <div style={{
            flex:1, minWidth:0,
            background:'var(--dj-panel)', borderRadius:10,
            border:`1px solid var(--dj-border)`,
            padding:10,
          }}>
            <DeckTop side="B" color="var(--dj-accent)" midiState={midiState}/>
          </div>
        </div>

        {/* ROW 2 — Scratch A | EQ Center | Scratch B */}
        <div style={{ display:'flex', gap:6, flex:1, minHeight:0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <DeckBottom side="A" color="var(--dj-blue)" midiState={midiState}/>
          </div>
          <EQMixer midiState={midiState}/>
          <div style={{ flex:1, minWidth:0 }}>
            <DeckBottom side="B" color="var(--dj-accent)" midiState={midiState}/>
          </div>
        </div>
      </div>

      <BottomBar isLive={isLive} midiDevices={midiDevices}/>
    </div>
  );
}
