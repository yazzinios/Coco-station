import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/useApp';

/* ═══════════════════════════════════════════════════════════════════════════
   DJPage — CocoStation DJ Booth
   Flow: Setup (DJ name + controller + audio) → Animated reveal → Controller
═══════════════════════════════════════════════════════════════════════════ */

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Exo+2:wght@400;600;700&display=swap');

  :root {
    --dj-bg:      #07090d;
    --dj-panel:   #0d1018;
    --dj-panel2:  #12151f;
    --dj-border:  #1b1f2e;
    --dj-border2: #232840;
    --dj-accent:  #e8a020;
    --dj-green:   #1ed760;
    --dj-red:     #e03c3c;
    --dj-blue:    #3a8fff;
    --dj-purple:  #a855f7;
    --dj-text:    #cdd2e0;
    --dj-muted:   #38405a;
    --dj-mono:    'Share Tech Mono', monospace;
    --dj-orb:     'Orbitron', sans-serif;
    --dj-sans:    'Exo 2', sans-serif;
  }

  .djp * { box-sizing: border-box; margin: 0; padding: 0; }
  .djp {
    font-family: var(--dj-sans);
    background: var(--dj-bg);
    color: var(--dj-text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: -2rem;
    height: calc(100vh - 80px);
    position: relative;
  }
  .djp button:focus, .djp input:focus, .djp select:focus { outline: none; }
  .djp ::-webkit-scrollbar { width: 3px; }
  .djp ::-webkit-scrollbar-track { background: transparent; }
  .djp ::-webkit-scrollbar-thumb { background: var(--dj-border); border-radius: 2px; }
  .djp select option { background: #0d1018; color: #cdd2e0; }

  @keyframes djFadeIn   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes djSlideUp  { from{opacity:0;transform:translateY(50px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes djBlink    { 0%,100%{opacity:1} 50%{opacity:.15} }
  @keyframes djSpin     { to{transform:rotate(360deg)} }
  @keyframes djPulse    { 0%,100%{box-shadow:0 0 20px var(--pc,#e8a020)44} 50%{box-shadow:0 0 40px var(--pc,#e8a020)99,0 0 80px var(--pc,#e8a020)33} }
  @keyframes djNameIn   { 0%{opacity:0;transform:scale(.8) translateY(-10px)} 60%{transform:scale(1.04) translateY(2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes djReveal   { from{opacity:0;transform:translateY(60px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes djScanLine { from{top:-100%} to{top:200%} }

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

  .pBtn { transition: all 0.12s; }
  .pBtn:hover  { filter: brightness(1.3); transform: scale(1.05); }
  .pBtn:active { transform: scale(0.95); filter: brightness(0.85); }

  .dBtn { transition: all 0.1s; }
  .dBtn:hover  { filter: brightness(1.25); transform: scale(1.04); }
  .dBtn:active { transform: scale(0.96); }
`;

function injectCSS() {
  if (document.getElementById('djp-css')) return;
  const s = document.createElement('style');
  s.id = 'djp-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ── helpers ── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt   = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

function buildDJName(user) {
  if (!user) return 'DJ';
  if (user.display_name) return `DJ ${user.display_name.trim()}`;
  if (user.username)     return `DJ ${user.username.trim()}`;
  return 'DJ';
}

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════════════════ */

function VUMeter({ color, playing, height = 70, bars = 6 }) {
  return (
    <div style={{ display:'flex', gap:2, alignItems:'flex-end', height, width: bars * 7 + bars }}>
      {Array.from({ length: bars }).map((_, i) => {
        const c = i >= bars-1 ? '#e03c3c' : i >= bars-2 ? '#f5d020' : color;
        return (
          <div key={i} style={{ width:5, height:'100%', background:'rgba(255,255,255,0.04)', borderRadius:2, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
            <div className={playing ? `dj-vu${i}` : ''}
              style={{ width:'100%', height: playing ? undefined : '8%', background:c, borderRadius:2 }}/>
          </div>
        );
      })}
    </div>
  );
}

function Knob({ size = 40, value = 0.5, onChange, color = '#e8a020', label, centerZero = false }) {
  const startRef = useRef(null);
  const angle = centerZero ? (value - 0.5) * 270 : -135 + value * 270;
  const r = size / 2 - 4, cx = size / 2, cy = size / 2;
  const rad = (angle * Math.PI) / 180;
  const tx = cx + r * 0.65 * Math.sin(rad);
  const ty = cy - r * 0.65 * Math.cos(rad);
  const onMD = e => {
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };
    const move = ev => {
      const dy = (startRef.current.y - ev.clientY) / 120;
      onChange?.(clamp(startRef.current.v + dy, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <svg width={size} height={size} onMouseDown={onMD} style={{ cursor:'ns-resize', flexShrink:0 }}>
        <circle cx={cx} cy={cy} r={r+2} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1.5}/>
        <circle cx={cx} cy={cy} r={r}   fill="#090b12" stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
        <circle cx={cx} cy={cy} r={r-6} fill="#06070e"/>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={color} strokeWidth={2.5} strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r={2.5} fill={color} opacity={0.6}/>
      </svg>
      {label && <span style={{ fontSize:7, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>}
    </div>
  );
}

function VertFader({ value, onChange, color, height = 100 }) {
  const ref = useRef(null);
  const onMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = ref.current.getBoundingClientRect();
      onChange(clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  return (
    <div ref={ref} onMouseDown={onMD} style={{
      width:10, height, background:'rgba(0,0,0,0.6)', borderRadius:5,
      border:'1px solid var(--dj-border)', position:'relative', cursor:'ns-resize', flexShrink:0,
    }}>
      <div style={{ position:'absolute', left:2, right:2, bottom:2, height:`${value*100}%`, borderRadius:3, background:`linear-gradient(0deg,${color}99,${color}22)` }}/>
      <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.06)' }}/>
      <div style={{ position:'absolute', left:'50%', top:`${(1-value)*100}%`, transform:'translate(-50%,-50%)', width:18, height:8, borderRadius:3, background:'linear-gradient(180deg,#2a2f45,#12151e)', border:'1px solid rgba(255,255,255,0.13)', cursor:'ns-resize' }}/>
    </div>
  );
}

function HorizFader({ value, onChange, color, width = 120 }) {
  const ref = useRef(null);
  const onMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = ref.current.getBoundingClientRect();
      onChange(clamp((ev.clientX - rect.left) / rect.width, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  return (
    <div ref={ref} onMouseDown={onMD} style={{
      width, height:14, background:'rgba(0,0,0,0.6)', borderRadius:7,
      border:'1px solid var(--dj-border)', position:'relative', cursor:'ew-resize',
    }}>
      <div style={{ position:'absolute', left:2, top:'50%', transform:'translateY(-50%)', width:`${value*100}%`, height:4, borderRadius:2, background:`linear-gradient(90deg,${color}66,${color})` }}/>
      <div style={{ position:'absolute', top:'50%', left:`${value*100}%`, transform:'translate(-50%,-50%)', width:20, height:10, borderRadius:3, background:'linear-gradient(180deg,#2a2f45,#12151e)', border:'1px solid rgba(255,255,255,0.14)', cursor:'ew-resize' }}/>
    </div>
  );
}

function JogWheel({ playing, color, size = 150, label = 'A', bpm = 128 }) {
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{ position:'absolute', inset:-5, borderRadius:'50%', pointerEvents:'none', boxShadow: playing ? `0 0 25px ${color}77, 0 0 55px ${color}33` : `0 0 10px ${color}22`, transition:'box-shadow 0.5s' }}/>
      <svg width={size} height={size} style={{ position:'absolute', top:0, left:0, animation: playing ? 'djSpin 2.2s linear infinite' : 'djSpin 12s linear infinite' }}>
        <defs>
          <radialGradient id={`jg-${label}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#1a1f30"/>
            <stop offset="100%" stopColor="#080a12"/>
          </radialGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={size/2-2} fill={`url(#jg-${label})`} stroke={color} strokeWidth={1.2} strokeOpacity={0.35}/>
        {Array.from({length:16}).map((_,i) => {
          const a = (i*22.5*Math.PI)/180, r1=20, r2=size/2-12;
          return <line key={i} x1={size/2+r1*Math.cos(a)} y1={size/2+r1*Math.sin(a)} x2={size/2+r2*Math.cos(a)} y2={size/2+r2*Math.sin(a)} stroke="rgba(255,255,255,0.03)" strokeWidth={0.6}/>;
        })}
        {Array.from({length:12}).map((_,i) => {
          const a = (i*30*Math.PI)/180, r=size/2-7;
          return <circle key={i} cx={size/2+r*Math.cos(a)} cy={size/2+r*Math.sin(a)} r={2.5} fill={color} opacity={0.45}/>;
        })}
        <circle cx={size/2} cy={size/2} r={26} fill="#0a0c16" stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
        <circle cx={size/2} cy={size/2} r={18} fill="#060810"/>
        <line x1={size/2} y1={size/2-10} x2={size/2} y2={size/2-size/2+12} stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.95}/>
        <circle cx={size/2} cy={size/2} r={6} fill={color} opacity={0.9}/>
        <circle cx={size/2} cy={size/2} r={3} fill="#0a0c16"/>
      </svg>
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:900, color, letterSpacing:2, lineHeight:1 }}>{label}</div>
        <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{bpm.toFixed(1)}</div>
      </div>
    </div>
  );
}

function MiniWave({ color, progress = 0.35, seed = 1 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth || 280, H = 36;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const bw = 2.5, gap = 1.5, cols = Math.floor(W / (bw + gap));
    for (let i = 0; i < cols; i++) {
      const x = i * (bw + gap);
      const amp = Math.abs(Math.sin(i*0.14*seed)*9 + Math.sin(i*0.33)*5 + Math.sin(i*0.71*seed)*2.5);
      ctx.fillStyle = color; ctx.globalAlpha = x/W < progress ? 0.9 : 0.22;
      ctx.beginPath(); ctx.roundRect(x, H/2-amp, bw, amp*2, 1); ctx.fill();
    }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.fillRect(progress*W-1, 0, 1.5, H);
  });
  return <canvas ref={canvasRef} style={{ width:'100%', height:36, display:'block' }}/>;
}

function PitchSlider({ value, onChange, color, height = 100 }) {
  const ref = useRef(null);
  const onMD = e => {
    e.preventDefault();
    const move = ev => {
      const rect = ref.current.getBoundingClientRect();
      onChange(clamp((ev.clientY - rect.top) / rect.height, 0, 1));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
  };
  const semi = ((value - 0.5) * 16).toFixed(1);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <span style={{ fontSize:6, color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>PITCH</span>
      <div ref={ref} onMouseDown={onMD} style={{ width:8, height, background:'rgba(0,0,0,0.5)', borderRadius:4, border:'1px solid var(--dj-border)', position:'relative', cursor:'ns-resize' }}>
        <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.08)' }}/>
        <div style={{ position:'absolute', left:'50%', top:`${value*100}%`, transform:'translate(-50%,-50%)', width:14, height:6, borderRadius:2, background:color, boxShadow:`0 0 6px ${color}`, cursor:'ns-resize' }}/>
      </div>
      <span style={{ fontSize:7, color, fontFamily:'var(--dj-mono)' }}>{semi>0?'+':''}{semi}%</span>
    </div>
  );
}

const HC = ['#e03c3c','#e8a020','#f5d020','#1ed760','#3a8fff','#a855f7','#ec4899','#ffffff'];

const AUDIO_SOURCES = [
  { value: '',                          label: '— Select audio source —' },
  { value: 'USB Audio Interface',       label: '🔌  USB Audio Interface' },
  { value: 'Headphone Jack (3.5mm)',    label: '🎧  Headphone Jack (3.5mm)' },
  { value: 'XLR Balanced Input',        label: '🎙  XLR Balanced Input' },
  { value: 'RCA Line In',               label: '📻  RCA Line In' },
  { value: 'Bluetooth Audio',           label: '📡  Bluetooth Audio' },
  { value: 'Built-in Microphone',       label: '🖥  Built-in Microphone' },
  { value: 'HDMI / Optical In',         label: '🔊  HDMI / Optical In' },
  { value: 'Virtual Audio Cable',       label: '💻  Virtual Audio Cable' },
];

/* ══════════════════════════════════════════════════════════════════════════
   SETUP SCREEN
══════════════════════════════════════════════════════════════════════════ */
function SetupScreen({ onConnect }) {
  const { currentUser } = useApp() || {};
  const fullName = buildDJName(currentUser);

  const [controller, setController] = useState('pioneer');
  const [audioSrc,   setAudioSrc]   = useState('');
  const [connecting, setConnecting] = useState(false);

  const meta = {
    pioneer: { label:'Pioneer DJ', sub:'DDJ-1000 / CDJ-3000', color:'#e8a020', icon:'⬡', gradient:'linear-gradient(135deg,#c07010,#e8a020)' },
    denon:   { label:'Denon DJ',   sub:'SC6000 / X1850 Prime', color:'#3a8fff', icon:'◈', gradient:'linear-gradient(135deg,#1a5fdf,#3a8fff)' },
  };
  const m = meta[controller];

  const handleConnect = () => {
    if (!audioSrc) return;
    setConnecting(true);
    setTimeout(() => onConnect({ controller, djName: fullName, audioSrc }), 1600);
  };

  return (
    <div style={{
      flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--dj-bg)',
      backgroundImage:'radial-gradient(ellipse at 20% 50%, rgba(58,143,255,0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(232,160,32,0.05) 0%, transparent 55%)',
      overflow:'hidden', position:'relative',
    }}>
      {/* subtle grid */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.012) 1px, transparent 1px)', backgroundSize:'44px 44px' }}/>

      {/* scan line */}
      <div style={{ position:'absolute', left:0, right:0, height:60, background:'linear-gradient(transparent,rgba(255,255,255,0.018),transparent)', animation:'djScanLine 5s linear infinite', pointerEvents:'none' }}/>

      <div style={{ width:500, animation:'djFadeIn 0.55s ease forwards', position:'relative', zIndex:2 }}>

        {/* ── DJ Name Hero ─────────────────────────────────────── */}
        <div style={{ textAlign:'center', marginBottom:30 }}>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, letterSpacing:6, color:'var(--dj-muted)', marginBottom:10 }}>COCOSTATION · DJ BOOTH</div>

          <div style={{
            fontFamily:'var(--dj-orb)', fontWeight:900, lineHeight:1,
            animation:'djNameIn 0.7s cubic-bezier(0.16,1,0.3,1) forwards',
          }}>
            <span style={{ fontSize:13, color:'var(--dj-muted)', letterSpacing:4 }}>WELCOME,</span>
            <br/>
            <span style={{ display:'inline-flex', alignItems:'baseline', gap:14, marginTop:6 }}>
              <span style={{
                fontSize:34, letterSpacing:3,
                background: m.gradient,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                backgroundClip:'text',
              }}>DJ</span>
              <span style={{
                fontSize:34, letterSpacing:3,
                background: m.gradient,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                backgroundClip:'text',
              }}>{fullName.replace(/^DJ\s*/i, '')}</span>
            </span>
          </div>

          <div style={{ marginTop:10, display:'flex', justifyContent:'center', gap:6, alignItems:'center' }}>
            {[...Array(3)].map((_,i) => (
              <div key={i} style={{ width:4, height:4, borderRadius:'50%', background:m.color, opacity: i===1?1:0.35, animation:'djBlink 1.8s infinite', animationDelay:`${i*0.3}s` }}/>
            ))}
          </div>
        </div>

        {/* ── Card ─────────────────────────────────────────────── */}
        <div style={{
          background:'var(--dj-panel)', borderRadius:18,
          border:`1px solid ${m.color}33`,
          padding:'28px 32px 32px',
          boxShadow:`0 24px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)`,
          transition:'border-color 0.3s, box-shadow 0.3s',
        }}>

          {/* Controller select */}
          <div style={{ marginBottom:22 }}>
            <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)', letterSpacing:3, marginBottom:10 }}>CONTROLLER</div>
            <div style={{ display:'flex', gap:10 }}>
              {Object.entries(meta).map(([k, mx]) => (
                <button key={k} onClick={() => setController(k)} style={{
                  flex:1, padding:'15px 14px', borderRadius:12, cursor:'pointer',
                  border:`2px solid ${controller===k ? mx.color : 'var(--dj-border)'}`,
                  background: controller===k ? `${mx.color}12` : 'rgba(255,255,255,0.018)',
                  color: controller===k ? mx.color : 'var(--dj-muted)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                  boxShadow: controller===k ? `0 0 24px ${mx.color}35` : 'none',
                  transition:'all 0.2s',
                }}>
                  <span style={{ fontSize:24 }}>{mx.icon}</span>
                  <span style={{ fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:700, letterSpacing:1 }}>{mx.label}</span>
                  <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, opacity:0.55, letterSpacing:0.5 }}>{mx.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Audio source dropdown */}
          <div style={{ marginBottom:26 }}>
            <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)', letterSpacing:3, marginBottom:10 }}>AUDIO INPUT</div>
            <div style={{ position:'relative' }}>
              <select
                value={audioSrc}
                onChange={e => setAudioSrc(e.target.value)}
                style={{
                  width:'100%', padding:'12px 40px 12px 14px',
                  background:'rgba(0,0,0,0.45)',
                  border:`1px solid ${audioSrc ? m.color+'66' : 'var(--dj-border)'}`,
                  borderRadius:9, color: audioSrc ? 'var(--dj-text)' : 'var(--dj-muted)',
                  fontFamily:'var(--dj-mono)', fontSize:12, letterSpacing:0.5,
                  cursor:'pointer', appearance:'none', WebkitAppearance:'none',
                  transition:'border-color 0.25s',
                }}
              >
                {AUDIO_SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--dj-muted)', fontSize:11 }}>▾</div>
              {audioSrc && (
                <div style={{ position:'absolute', right:30, top:'50%', transform:'translateY(-50%)', width:6, height:6, borderRadius:'50%', background:m.color, boxShadow:`0 0 6px ${m.color}`, animation:'djBlink 1.5s infinite' }}/>
              )}
            </div>
            {!audioSrc && (
              <div style={{ marginTop:5, fontSize:8, color:'#e03c3c88', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>
                ▲ Please select an audio source to continue
              </div>
            )}
          </div>

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={!audioSrc || connecting}
            style={{
              width:'100%', padding:'16px', borderRadius:11, cursor: audioSrc && !connecting ? 'pointer' : 'not-allowed',
              fontFamily:'var(--dj-orb)', fontSize:13, fontWeight:700, letterSpacing:4,
              border:`2px solid ${audioSrc ? m.color : 'var(--dj-border)'}`,
              background: audioSrc ? `linear-gradient(135deg, ${m.color}22, ${m.color}0a)` : 'rgba(255,255,255,0.02)',
              color: audioSrc ? m.color : 'var(--dj-muted)',
              boxShadow: audioSrc ? `0 0 30px ${m.color}45, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
              '--pc': m.color,
              animation: audioSrc && !connecting ? 'djPulse 2.5s ease-in-out infinite' : 'none',
              transition:'all 0.25s',
              position:'relative', overflow:'hidden',
            }}
          >
            {connecting ? (
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <span style={{ display:'inline-block', width:12, height:12, border:`2px solid ${m.color}`, borderTopColor:'transparent', borderRadius:'50%', animation:'djSpin 0.7s linear infinite' }}/>
                CONNECTING…
              </span>
            ) : (
              `LAUNCH ${m.label.toUpperCase()}`
            )}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:14, fontFamily:'var(--dj-mono)', fontSize:7, color:'var(--dj-muted)', letterSpacing:2 }}>
          COCOSTATION DJ BOOTH v2.0 · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PIONEER DDJ-1000 CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
function PioneerController({ session }) {
  const [decks, setDecks] = useState({
    L: { playing:true,  bpm:128.4, pitch:0.5, volume:0.82, eq:{ hi:0.72, mid:0.6, lo:0.68 }, gain:0.74, track:'Midnight Protocol', artist:'CØVR', elapsed:148, progress:0.37, hc:[true,true,false,false,false,false,false,false] },
    R: { playing:false, bpm:135.0, pitch:0.5, volume:0.75, eq:{ hi:0.68, mid:0.65, lo:0.71 }, gain:0.71, track:'Neon Cascade', artist:'Parallax', elapsed:62, progress:0.14, hc:[false,true,false,false,false,false,false,false] },
  });
  const [xfader,    setXfader]    = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.82);
  const [boothVol,  setBoothVol]  = useState(0.68);
  const [mic,       setMic]       = useState(false);
  const [head,      setHead]      = useState(true);
  const [fx, setFx] = useState({ echo:false, reverb:true, flanger:false });

  const D  = s => decks[s];
  const sD = (s, p) => setDecks(d => ({ ...d, [s]: typeof p === 'function' ? p(d[s]) : { ...d[s], ...p } }));
  const c  = '#e8a020';

  useEffect(() => {
    const id = setInterval(() => setDecks(d => {
      const u = {};
      for (const s of ['L','R']) if (d[s].playing) u[s] = { ...d[s], elapsed:d[s].elapsed+1, progress:clamp(d[s].progress+0.0003,0,0.999) };
      return { ...d, ...u };
    }), 1000);
    return () => clearInterval(id);
  }, []);

  const PB = ({ label, active, onClick, ac, w=32, h=22 }) => (
    <button className="pBtn" onClick={onClick} style={{
      width:w, height:h, borderRadius:4, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)',
      border:`1px solid ${active?(ac||c):'#1a1e2a'}`, background:active?`${ac||c}25`:'#0c0e15',
      color:active?(ac||c):'#3a4060',
      boxShadow:active?`0 0 8px ${ac||c}55,inset 0 0 8px ${ac||c}11`:'inset 0 1px 0 rgba(255,255,255,0.03)',
      letterSpacing:0.5,
    }}>{label}</button>
  );

  const renderDeck = s => {
    const dk = D(s); const dur = 400; const remain = dur - dk.elapsed;
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ background:'#0a0c14', borderRadius:8, padding:'8px 10px', border:'1px solid #1a1e28' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:dk.playing?c:'#2a2e40', boxShadow:dk.playing?`0 0 5px ${c}`:'none', animation:dk.playing?'djBlink 1.1s infinite':'none' }}/>
                <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, color:c, letterSpacing:2 }}>DECK {s}</span>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'#cdd2e0', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dk.track}</div>
              <div style={{ fontSize:9, color:'#3a4060', marginTop:1 }}>{dk.artist}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--dj-mono)', color:c, lineHeight:1 }}>{dk.bpm.toFixed(1)}</div>
              <div style={{ fontSize:7, color:'#3a4060', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>BPM</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:5 }}>
            {[['ELAPSED',fmt(dk.elapsed),c],['REMAIN',`-${fmt(Math.max(0,remain))}`,'#2a3050']].map(([l,v,col])=>(
              <div key={l} style={{ flex:1, background:'rgba(0,0,0,0.4)', borderRadius:4, padding:'2px 6px', border:'1px solid #141824' }}>
                <div style={{ fontSize:12, fontFamily:'var(--dj-mono)', color:col, fontWeight:700, lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:6, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'rgba(0,0,0,0.4)', borderRadius:4, padding:'2px 4px', border:'1px solid #141824' }}>
            <MiniWave color={c} progress={dk.progress} seed={s==='L'?1:1.7}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center', background:'#0a0c14', borderRadius:7, padding:'5px 7px', border:'1px solid #1a1e28' }}>
          <button className="pBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ width:36, height:28, borderRadius:6, cursor:'pointer', fontSize:13, border:`2px solid ${dk.playing?c:'#1a1e2a'}`, background:dk.playing?`${c}22`:'#0c0e15', color:dk.playing?c:'#3a4060', boxShadow:dk.playing?`0 0 14px ${c}66`:'none', transition:'all 0.2s', flexShrink:0 }}>{dk.playing?'⏸':'▶'}</button>
          <PB label="CUE"/><PB label="SYNC" ac="#1ed760"/><PB label="LOOP" ac="#3a8fff"/>
          <div style={{ flex:1 }}/><VUMeter color={c} playing={dk.playing} height={26} bars={5}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:3 }}>
          {HC.map((col,i)=>(
            <button key={i} className="pBtn" onClick={()=>sD(s,dk=>{const h=[...dk.hc];h[i]=!h[i];return{hc:h};})} style={{ height:22, borderRadius:3, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)', border:`1px solid ${dk.hc[i]?col:'#1a1e28'}`, background:dk.hc[i]?`${col}20`:'#0a0c14', color:dk.hc[i]?col:'#2a3050', boxShadow:dk.hc[i]?`0 0 6px ${col}55`:'none' }}>{s}{i+1}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:3, alignItems:'center', background:'#0a0c14', borderRadius:6, padding:'4px 6px', border:'1px solid #1a1e28' }}>
          <span style={{ fontSize:7, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:1, marginRight:3 }}>LOOP</span>
          {['¼','½','1','2','4','8','16','32'].map(x=><button key={x} className="pBtn" style={{ padding:'2px 5px', borderRadius:3, fontSize:7, fontFamily:'var(--dj-mono)', cursor:'pointer', border:'1px solid #1a1e28', background:'#0a0c14', color:'#2a3050' }}>{x}</button>)}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'center', background:'#0a0c14', borderRadius:8, padding:'8px', border:'1px solid #1a1e28' }}>
          {s==='L' && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={130}/>}
          <JogWheel playing={dk.playing} color={c} size={148} label={s} bpm={dk.bpm}/>
          {s==='R' && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={130}/>}
          <VUMeter color={c} playing={dk.playing} height={130} bars={6}/>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', animation:'djReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards' }}>
      {/* Top bar */}
      <div style={{ background:'#0d0f18', borderBottom:'1px solid #1a1e28', padding:'6px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:14, fontWeight:900, color:c, letterSpacing:2 }}>PIONEER DJ</div>
        <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'#2a3050', letterSpacing:1 }}>DDJ-1000</div>
        <div style={{ width:1, height:28, background:'#1a1e28' }}/>
        {/* DJ name badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${c},#c07010)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#000', fontFamily:'var(--dj-orb)' }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:12, fontWeight:700, color:'#cdd2e0', letterSpacing:1, lineHeight:1 }}>{session.djName}</div>
            <div style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1, marginTop:1 }}>PIONEER SESSION</div>
          </div>
        </div>
        <div style={{ width:1, height:28, background:'#1a1e28' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--dj-green)', boxShadow:'0 0 5px var(--dj-green)', animation:'djBlink 2s infinite' }}/>
          <span style={{ fontSize:9, fontFamily:'var(--dj-mono)', color:'var(--dj-green)' }}>{session.audioSrc}</span>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:6, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>MASTER</span>
            <HorizFader value={masterVol} onChange={setMasterVol} color={c} width={80}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:6, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>BOOTH</span>
            <HorizFader value={boothVol} onChange={setBoothVol} color="#3a8fff" width={80}/>
          </div>
          <VUMeter color={c} playing height={28} bars={6}/>
        </div>
        <div style={{ width:1, height:28, background:'#1a1e28' }}/>
        <button onClick={() => window.location.reload()} style={{ padding:'4px 12px', borderRadius:6, cursor:'pointer', fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1, border:'1px solid #2a3050', background:'transparent', color:'#3a4060' }}>✕ EXIT</button>
      </div>

      <div style={{ flex:1, display:'flex', gap:0, overflow:'hidden', minHeight:0 }}>
        <div style={{ flex:1, padding:'8px 6px 8px 8px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>{renderDeck('L')}</div>

        {/* Mixer */}
        <div style={{ width:200, flexShrink:0, background:'#0b0d14', borderLeft:'1px solid #1a1e28', borderRight:'1px solid #1a1e28', padding:'8px', display:'flex', flexDirection:'column', gap:6, overflow:'auto' }}>
          <div style={{ textAlign:'center', fontFamily:'var(--dj-orb)', fontSize:8, color:'#2a3050', letterSpacing:2, marginBottom:4 }}>DJM · MIXER</div>
          <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
            {['L','R'].map(s=>(
              <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>CH.{s}</span>
                <Knob size={30} value={D(s).gain} onChange={v=>sD(s,{gain:v})} color={c} label="GAIN"/>
                <Knob size={28} value={D(s).eq.hi}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,hi:v}}))}  color={c} label="HI"  centerZero/>
                <Knob size={28} value={D(s).eq.mid} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,mid:v}}))} color={c} label="MID" centerZero/>
                <Knob size={28} value={D(s).eq.lo}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,lo:v}}))}  color={c} label="LO"  centerZero/>
                <Knob size={28} value={0.5} onChange={()=>{}} color="#3a4060" label="SEND"/>
                <VUMeter color={c} playing={D(s).playing} height={55} bars={4}/>
                <VertFader value={D(s).volume} onChange={v=>sD(s,{volume:v})} color={c} height={90}/>
              </div>
            ))}
          </div>
          <div style={{ height:1, background:'#1a1e28' }}/>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)' }}>L</span>
              <span style={{ fontSize:6, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>CROSSFADER</span>
              <span style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)' }}>R</span>
            </div>
            <HorizFader value={xfader} onChange={setXfader} color={c} width={168}/>
          </div>
          <div style={{ height:1, background:'#1a1e28' }}/>
          <div>
            <div style={{ fontSize:7, color:'#2a3050', fontFamily:'var(--dj-mono)', letterSpacing:2, textAlign:'center', marginBottom:5 }}>SOUND COLOR FX</div>
            {[{id:'echo',l:'ECHO',col:'#3a8fff'},{id:'reverb',l:'REVERB',col:'#a855f7'},{id:'flanger',l:'FLANGER',col:'#e8a020'}].map(f=>(
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.3)', borderRadius:4, padding:'4px 6px', border:`1px solid ${fx[f.id]?`${f.col}44`:'#1a1e28'}`, marginBottom:3 }}>
                <button onClick={()=>setFx(x=>({...x,[f.id]:!x[f.id]}))} style={{ width:7, height:7, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0, background:fx[f.id]?f.col:'#2a2e40', boxShadow:fx[f.id]?`0 0 6px ${f.col}`:'none', transition:'all 0.2s' }}/>
                <span style={{ fontSize:8, fontFamily:'var(--dj-mono)', color:fx[f.id]?f.col:'#2a3050', flex:1, letterSpacing:0.5 }}>{f.l}</span>
                <Knob size={22} value={0.5} onChange={()=>{}} color={fx[f.id]?f.col:'#2a3050'}/>
              </div>
            ))}
          </div>
          <div style={{ height:1, background:'#1a1e28' }}/>
          <div style={{ display:'flex', gap:5 }}>
            <button className="pBtn" onClick={()=>setMic(m=>!m)} style={{ flex:1, height:26, borderRadius:5, cursor:'pointer', fontSize:9, fontFamily:'var(--dj-mono)', border:`1px solid ${mic?'#e03c3c':'#1a1e28'}`, background:mic?'rgba(224,60,60,0.15)':'#0c0e15', color:mic?'#e03c3c':'#2a3050', boxShadow:mic?'0 0 8px rgba(224,60,60,0.5)':'none' }}>🎙 MIC</button>
            <button className="pBtn" onClick={()=>setHead(h=>!h)} style={{ flex:1, height:26, borderRadius:5, cursor:'pointer', fontSize:9, fontFamily:'var(--dj-mono)', border:`1px solid ${head?'var(--dj-green)':'#1a1e28'}`, background:head?'rgba(30,215,96,0.12)':'#0c0e15', color:head?'var(--dj-green)':'#2a3050', boxShadow:head?'0 0 8px rgba(30,215,96,0.4)':'none' }}>🎧 CUE</button>
          </div>
          <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:24, overflow:'hidden' }}>
            {Array.from({length:28}).map((_,i)=>(
              <div key={i} style={{ flex:1, height:'100%', background:'rgba(255,255,255,0.03)', borderRadius:1, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
                <div className={`dj-sp${i%8}`} style={{ width:'100%', background:c, borderRadius:1, animationDelay:`${i*0.05}s` }}/>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex:1, padding:'8px 8px 8px 6px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>{renderDeck('R')}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DENON SC6000 CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
function DenonController({ session }) {
  const [decks, setDecks] = useState({
    L: { playing:true,  bpm:124.0, pitch:0.5, volume:0.82, eq:{ hi:0.72, mid:0.62, lo:0.68 }, gain:0.74, track:'Electric Blue', artist:'NEON SIGNAL', elapsed:92, progress:0.23, hc:[true,true,false,false,false,false,false,false], layer:'A', loop:false },
    R: { playing:false, bpm:130.5, pitch:0.5, volume:0.75, eq:{ hi:0.70, mid:0.60, lo:0.72 }, gain:0.70, track:'Quantum Drive', artist:'AXIS', elapsed:31, progress:0.07, hc:[false,true,false,false,false,false,false,false], layer:'A', loop:false },
  });
  const [xfader,    setXfader]    = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.80);
  const [mic,       setMic]       = useState(false);
  const [fxOn, setFxOn] = useState({ sweep:false, filter:true, flanger:false, delay:false });

  const D  = s => decks[s];
  const sD = (s, p) => setDecks(d => ({ ...d, [s]: typeof p === 'function' ? p(d[s]) : { ...d[s], ...p } }));
  const c  = '#3a8fff';

  useEffect(() => {
    const id = setInterval(() => setDecks(d => {
      const u = {};
      for (const s of ['L','R']) if (d[s].playing) u[s] = { ...d[s], elapsed:d[s].elapsed+1, progress:clamp(d[s].progress+0.0003,0,0.999) };
      return { ...d, ...u };
    }), 1000);
    return () => clearInterval(id);
  }, []);

  const DB = ({ label, active, onClick, ac, w=32, h=22 }) => (
    <button className="dBtn" onClick={onClick} style={{
      width:w, height:h, borderRadius:5, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)',
      border:`1px solid ${active?(ac||c):'#1c2030'}`, background:active?`${ac||c}20`:'#0a0d16',
      color:active?(ac||c):'#2a3558', boxShadow:active?`0 0 10px ${ac||c}50,inset 0 0 8px ${ac||c}10`:'inset 0 1px 0 rgba(255,255,255,0.03)',
      letterSpacing:0.5,
    }}>{label}</button>
  );

  const dur = 420;

  const renderDeck = s => {
    const dk = D(s); const remain = dur - dk.elapsed;
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ background:'#080c14', borderRadius:10, padding:'10px', border:`2px solid ${c}33`, boxShadow:`0 0 20px ${c}15,inset 0 0 30px rgba(0,0,0,0.5)` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:dk.playing?c:'#1c2030', boxShadow:dk.playing?`0 0 6px ${c}`:'none', animation:dk.playing?'djBlink 1.1s infinite':'none' }}/>
                <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, color:c, letterSpacing:2 }}>SC6000 · DECK {s} · LAYER {dk.layer}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#cdd2e0', maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:0.5 }}>{dk.track}</div>
              <div style={{ fontSize:9, color:'#2a3558', marginTop:1 }}>{dk.artist}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--dj-orb)', color:c, lineHeight:1 }}>{dk.bpm.toFixed(1)}</div>
              <div style={{ fontSize:7, color:'#2a3558', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>BPM</div>
              <div style={{ display:'flex', gap:3, marginTop:2, justifyContent:'flex-end' }}>
                {['A','B'].map(l=>(
                  <button key={l} className="dBtn" onClick={()=>sD(s,{layer:l})} style={{ width:16, height:14, borderRadius:3, fontSize:7, fontFamily:'var(--dj-mono)', cursor:'pointer', border:`1px solid ${dk.layer===l?c:'#1c2030'}`, background:dk.layer===l?`${c}25`:'transparent', color:dk.layer===l?c:'#2a3558' }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:5, marginBottom:6 }}>
            {[['ELAPSED',fmt(dk.elapsed),c],['REMAIN',`-${fmt(Math.max(0,remain))}`,'#2a3558']].map(([l,v,col])=>(
              <div key={l} style={{ flex:1, background:'rgba(0,0,0,0.4)', borderRadius:4, padding:'2px 7px', border:'1px solid #12162a' }}>
                <div style={{ fontSize:13, fontFamily:'var(--dj-mono)', color:col, fontWeight:700, lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:6, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>{l}</div>
              </div>
            ))}
            <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'flex-end', justifyContent:'center' }}>
              <div style={{ fontSize:8, fontFamily:'var(--dj-mono)', color:c, textAlign:'right' }}>{(dk.progress*100).toFixed(1)}%</div>
              <div style={{ width:60, height:4, background:'#0c1020', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${dk.progress*100}%`, background:`linear-gradient(90deg,${c}88,${c})`, borderRadius:2 }}/>
              </div>
            </div>
          </div>
          <div style={{ background:'rgba(0,0,0,0.5)', borderRadius:5, padding:'3px 5px', border:'1px solid #0e1428', marginBottom:5 }}>
            <MiniWave color={c} progress={dk.progress} seed={s==='L'?1.3:2.1}/>
          </div>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <button className="dBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ width:38, height:30, borderRadius:7, cursor:'pointer', fontSize:13, border:`2px solid ${dk.playing?c:'#1c2030'}`, background:dk.playing?`${c}20`:'#0a0d16', color:dk.playing?c:'#2a3558', boxShadow:dk.playing?`0 0 15px ${c}55`:'none', transition:'all 0.2s' }}>{dk.playing?'⏸':'▶'}</button>
            <DB label="CUE"/><DB label="SYNC" ac="#1ed760"/><DB label="LOOP" active={dk.loop} onClick={()=>sD(s,{loop:!dk.loop})} ac="#e8a020"/><DB label="SLIP" ac="#a855f7"/>
            <div style={{ flex:1 }}/><VUMeter color={c} playing={dk.playing} height={28} bars={5}/>
          </div>
        </div>
        <div style={{ background:'#080c14', borderRadius:8, padding:'6px', border:`1px solid ${c}22` }}>
          <div style={{ fontSize:6, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:2, marginBottom:4 }}>PERFORMANCE PADS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:3 }}>
            {HC.map((col,i)=>(
              <button key={i} className="dBtn" onClick={()=>sD(s,dk=>{const h=[...dk.hc];h[i]=!h[i];return{hc:h};})} style={{ height:26, borderRadius:5, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)', border:`2px solid ${dk.hc[i]?col:'#1c2030'}`, background:dk.hc[i]?`${col}25`:'#0a0d16', color:dk.hc[i]?col:'#1c2a40', boxShadow:dk.hc[i]?`0 0 8px ${col}66,inset 0 0 10px ${col}11`:'none' }}>{s}{i+1}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:2, marginTop:5, alignItems:'center' }}>
            <span style={{ fontSize:6, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:1, marginRight:2 }}>LOOP</span>
            {['¼','½','1','2','4','8','16','32'].map(x=><button key={x} className="dBtn" style={{ flex:1, height:16, borderRadius:2, fontSize:6, fontFamily:'var(--dj-mono)', cursor:'pointer', border:'1px solid #1c2030', background:'#090c18', color:'#2a3558' }}>{x}</button>)}
          </div>
        </div>
        <div style={{ background:'#080c14', borderRadius:10, padding:'10px', border:`1px solid ${c}22`, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          {s==='L' && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={140}/>}
          <JogWheel playing={dk.playing} color={c} size={152} label={s} bpm={dk.bpm}/>
          {s==='R' && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={140}/>}
          <VUMeter color={c} playing={dk.playing} height={140} bars={6}/>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', animation:'djReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards' }}>
      <div style={{ background:'#08111e', borderBottom:`1px solid ${c}22`, padding:'6px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:14, fontWeight:900, color:c, letterSpacing:2 }}>DENON DJ</div>
        <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'#2a3558', letterSpacing:1 }}>SC6000 PRIME</div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        {/* DJ name badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${c},#1a5fdf)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#fff', fontFamily:'var(--dj-orb)' }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:12, fontWeight:700, color:'#cdd2e0', letterSpacing:1, lineHeight:1 }}>{session.djName}</div>
            <div style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1, marginTop:1 }}>DENON SESSION</div>
          </div>
        </div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--dj-green)', boxShadow:'0 0 5px var(--dj-green)', animation:'djBlink 2s infinite' }}/>
          <span style={{ fontSize:9, fontFamily:'var(--dj-mono)', color:'var(--dj-green)' }}>{session.audioSrc}</span>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:6, color:'#2a3558', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>MASTER</span>
            <HorizFader value={masterVol} onChange={setMasterVol} color={c} width={90}/>
          </div>
          <VUMeter color={c} playing height={28} bars={6}/>
        </div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        <button onClick={() => window.location.reload()} style={{ padding:'4px 12px', borderRadius:6, cursor:'pointer', fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1, border:`1px solid ${c}33`, background:'transparent', color:'#3a4060' }}>✕ EXIT</button>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        <div style={{ flex:1, padding:'8px 6px 8px 8px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>{renderDeck('L')}</div>

        {/* X1850 Prime mixer */}
        <div style={{ width:195, flexShrink:0, background:'#060910', borderLeft:`1px solid ${c}22`, borderRight:`1px solid ${c}22`, padding:'8px', display:'flex', flexDirection:'column', gap:5, overflow:'auto' }}>
          <div style={{ textAlign:'center', fontFamily:'var(--dj-orb)', fontSize:7, color:'#2a3558', letterSpacing:2, marginBottom:2 }}>X1850 · PRIME</div>
          <div style={{ background:'#0a0e1a', borderRadius:7, padding:'6px', border:`1px solid ${c}22` }}>
            <div style={{ fontSize:6, color:'#2a3558', fontFamily:'var(--dj-mono)', letterSpacing:2, marginBottom:5, textAlign:'center' }}>SWEEP FX</div>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center' }}>
              {[{id:'sweep',l:'SWEEP',col:'#3a8fff'},{id:'filter',l:'FILTER',col:'#a855f7'},{id:'flanger',l:'FLNG',col:'#e8a020'},{id:'delay',l:'DELAY',col:'#1ed760'}].map(f=>(
                <button key={f.id} className="dBtn" onClick={()=>setFxOn(x=>({...x,[f.id]:!x[f.id]}))} style={{ padding:'3px 7px', borderRadius:4, cursor:'pointer', fontSize:7, fontFamily:'var(--dj-mono)', border:`1px solid ${fxOn[f.id]?f.col+'55':'#1c2030'}`, background:fxOn[f.id]?`${f.col}18`:'#0a0d16', color:fxOn[f.id]?f.col:'#2a3558', boxShadow:fxOn[f.id]?`0 0 8px ${f.col}44`:'none' }}>{f.l}</button>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'center', marginTop:6 }}>
              <Knob size={34} value={0.5} onChange={()=>{}} color={c} label="DEPTH"/>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
            {['L','R'].map(s=>(
              <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>CH.{s}</span>
                <Knob size={30} value={D(s).gain} onChange={v=>sD(s,{gain:v})} color={c} label="GAIN"/>
                <Knob size={28} value={D(s).eq.hi}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,hi:v}}))}  color="#e03c3c" label="HI"  centerZero/>
                <Knob size={28} value={D(s).eq.mid} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,mid:v}}))} color="#e8a020" label="MID" centerZero/>
                <Knob size={28} value={D(s).eq.lo}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,lo:v}}))}  color={c}       label="LO"  centerZero/>
                <VUMeter color={c} playing={D(s).playing} height={50} bars={4}/>
                <VertFader value={D(s).volume} onChange={v=>sD(s,{volume:v})} color={c} height={88}/>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:6, color:c, fontFamily:'var(--dj-mono)' }}>L</span>
              <span style={{ fontSize:6, color:'#2a3558', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>X-FADER</span>
              <span style={{ fontSize:6, color:c, fontFamily:'var(--dj-mono)' }}>R</span>
            </div>
            <HorizFader value={xfader} onChange={setXfader} color={c} width={163}/>
          </div>
          <button className="dBtn" onClick={()=>setMic(m=>!m)} style={{ height:26, borderRadius:6, cursor:'pointer', fontSize:9, fontFamily:'var(--dj-mono)', border:`1px solid ${mic?'#e03c3c':'#1c2030'}`, background:mic?'rgba(224,60,60,0.12)':'#0a0d16', color:mic?'#e03c3c':'#2a3558', boxShadow:mic?'0 0 10px rgba(224,60,60,0.4)':'none' }}>🎙 MICROPHONE {mic?'ON':'OFF'}</button>
          <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:24, overflow:'hidden' }}>
            {Array.from({length:28}).map((_,i)=>(
              <div key={i} style={{ flex:1, height:'100%', background:'rgba(255,255,255,0.03)', borderRadius:1, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
                <div className={`dj-sp${i%8}`} style={{ width:'100%', background:c, borderRadius:1, animationDelay:`${i*0.05}s` }}/>
              </div>
            ))}
          </div>
          <div style={{ background:'#0a0e1a', borderRadius:6, padding:'5px', border:`1px solid ${c}22`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:16, color:c, fontWeight:700 }}>{D('L').bpm.toFixed(1)}</div>
            <div style={{ fontSize:6, color:'#2a3558', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>MASTER BPM</div>
          </div>
        </div>

        <div style={{ flex:1, padding:'8px 8px 8px 6px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>{renderDeck('R')}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════════════ */
export default function DJPage() {
  const [session, setSession] = useState(null);
  useEffect(() => { injectCSS(); }, []);
  const handleConnect = useCallback(cfg => setSession(cfg), []);

  return (
    <div className="djp">
      {!session
        ? <SetupScreen onConnect={handleConnect}/>
        : session.controller === 'pioneer'
          ? <PioneerController session={session}/>
          : <DenonController session={session}/>
      }
    </div>
  );
}
