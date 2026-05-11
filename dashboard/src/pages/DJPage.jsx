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
   PIONEER XDJ-RX3 CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
function PioneerController({ session }) {
  const c = '#e8a020';

  const [decks, setDecks] = useState({
    L: { playing:true,  bpm:124.0, pitch:0.5, volume:0.82, eq:{ hi:0.72, mid:0.6,  lo:0.68 }, gain:0.74, trim:0.68, track:'Above The Cloud', artist:'CØVR', elapsed:278, progress:0.46, hc:Array(16).fill(false).map((_,i)=>i<2), loop:false, slip:false },
    R: { playing:false, bpm:124.0, pitch:0.5, volume:0.75, eq:{ hi:0.68, mid:0.65, lo:0.71 }, gain:0.71, trim:0.62, track:'Rainy Season', artist:'Parallax', elapsed:201, progress:0.32, hc:Array(16).fill(false).map((_,i)=>i===1), loop:false, slip:false },
  });
  const [xfader,    setXfader]    = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.82);
  const [boothVol,  setBoothVol]  = useState(0.68);
  const [mic,       setMic]       = useState(false);
  const [head,      setHead]      = useState(true);
  const [beatFx,    setBeatFx]    = useState('FLANGER');
  const [colorFx,   setColorFx]   = useState({ noise:false, duco:false, sweep:false, filter:true });
  const [screenTab, setScreenTab] = useState('WAVEFORM');

  /* canvas refs */
  const jogLRef     = useRef(null);
  const jogRRef     = useRef(null);
  const wvLRef      = useRef(null);
  const wvRRef      = useRef(null);
  const screenWvRef = useRef(null);
  const vuRefs      = useRef([]);
  const masterVURef = useRef(null);
  const animRef     = useRef(null);
  const jogAngle    = useRef({ L:0, R:0 });
  const waveOff     = useRef({ L:0, R:20 });
  const vuLevels    = useRef([0.7, 0.75]);
  const playingRef  = useRef({ L:true, R:false });

  const D  = s => decks[s];
  const sD = (s, p) => setDecks(d => ({ ...d, [s]: typeof p === 'function' ? p(d[s]) : { ...d[s], ...p } }));

  /* timer */
  useEffect(() => {
    const id = setInterval(() => setDecks(d => {
      const u = {};
      for (const s of ['L','R']) if (d[s].playing) u[s] = { ...d[s], elapsed: d[s].elapsed+1, progress: clamp(d[s].progress+0.0003,0,0.999) };
      return { ...d, ...u };
    }), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { playingRef.current = { L: decks.L.playing, R: decks.R.playing }; }, [decks.L.playing, decks.R.playing]);

  /* ── draw jog (XDJ-RX3 style: large black platter, red/orange glowing center hub) ── */
  const drawJog = useCallback((canvas, angle, playing, side) => {
    if (!canvas) return;
    const W=190, H=190, cx=W/2, cy=H/2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);

    /* outer tyre ring */
    ctx.beginPath(); ctx.arc(cx,cy,93,0,Math.PI*2);
    ctx.fillStyle='#111'; ctx.fill();
    ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=1; ctx.stroke();

    /* tyre texture grooves */
    for (let i=0;i<60;i++) {
      const a=(i/60)*Math.PI*2;
      ctx.beginPath();
      ctx.arc(cx,cy,88,a,a+0.07);
      ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=3; ctx.stroke();
    }

    /* platter */
    ctx.beginPath(); ctx.arc(cx,cy,80,0,Math.PI*2);
    const pg=ctx.createRadialGradient(cx-15,cy-15,4,cx,cy,80);
    pg.addColorStop(0,'#1c1c1c'); pg.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=pg; ctx.fill();

    /* spinning radial lines */
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
    for (let i=0;i<20;i++) {
      const a=(i/20)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*22,Math.sin(a)*22);
      ctx.lineTo(Math.cos(a)*76,Math.sin(a)*76);
      ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=0.8; ctx.stroke();
    }
    /* tick marks */
    for (let i=0;i<16;i++) {
      const a=(i/16)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*68,Math.sin(a)*68);
      ctx.lineTo(Math.cos(a)*76,Math.sin(a)*76);
      ctx.strokeStyle=playing?`rgba(232,160,32,0.6)`:'rgba(80,80,80,0.4)';
      ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.restore();

    /* center hub — XDJ-RX3 has a screen/label in center */
    const hubR=30;
    ctx.beginPath(); ctx.arc(cx,cy,hubR,0,Math.PI*2);
    const hg=ctx.createRadialGradient(cx-6,cy-6,2,cx,cy,hubR);
    hg.addColorStop(0, playing?'#3a1500':'#1a1a1a');
    hg.addColorStop(1,'#050505');
    ctx.fillStyle=hg; ctx.fill();
    ctx.strokeStyle=playing?`${c}88`:'#2a2a2a'; ctx.lineWidth=1.5;
    if(playing){ctx.shadowBlur=12;ctx.shadowColor=c;}
    ctx.stroke(); ctx.shadowBlur=0;

    /* hub inner ring glow */
    if(playing){
      ctx.beginPath(); ctx.arc(cx,cy,hubR-4,0,Math.PI*2);
      ctx.strokeStyle=`${c}44`; ctx.lineWidth=3; ctx.stroke();
    }

    /* hub label */
    ctx.save(); ctx.translate(cx,cy);
    ctx.fillStyle=playing?c:'#333';
    ctx.font=`bold 7px 'Orbitron',sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('PIONEER', 0, -5);
    ctx.font=`5px 'Share Tech Mono',monospace`;
    ctx.fillStyle=playing?`${c}aa`:'#222';
    ctx.fillText(D(side).bpm.toFixed(1)+' BPM', 0, 5);
    ctx.restore();

    /* outer glow when playing */
    if(playing){
      ctx.beginPath(); ctx.arc(cx,cy,93,0,Math.PI*2);
      ctx.strokeStyle=`${c}33`; ctx.lineWidth=4;
      ctx.shadowBlur=20; ctx.shadowColor=c;
      ctx.stroke(); ctx.shadowBlur=0;
    }
  }, [c]);

  /* ── draw waveform ── */
  const drawWaveform = useCallback((canvas, offset, playing, color=c) => {
    if (!canvas) return;
    const W=canvas.offsetWidth||300, H=canvas.height||38;
    if(canvas.width!==W) canvas.width=W;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#06080f'; ctx.fillRect(0,0,W,H);
    const bars=Math.floor(W/2.5);
    for(let i=0;i<bars;i++){
      const x=i*2.5;
      const s=(i+offset)*0.22;
      const amp=Math.abs(Math.sin(s)*10+Math.sin(s*0.4)*6+Math.sin(s*1.9)*3);
      const pct=i/bars;
      if(pct<0.45) ctx.fillStyle='rgba(232,140,20,0.35)';
      else if(pct<0.5) ctx.fillStyle=color;
      else ctx.fillStyle=color+'55';
      ctx.fillRect(x,H/2-amp,2,amp*2);
    }
    ctx.fillStyle=playing?'rgba(255,255,255,0.9)':'rgba(100,120,150,0.4)';
    ctx.fillRect(W*0.47,0,1.5,H);
  }, [c]);

  /* ── draw VU ── */
  const drawVU = useCallback((canvas, level) => {
    if(!canvas) return;
    const W=canvas.width, H=canvas.height, segs=14, segH=(H-segs)/segs;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<segs;i++){
      const y=H-(i+1)*(segH+1);
      const col=i/segs>0.85?'#f00':i/segs>0.70?'#fa0':'#0c0';
      ctx.fillStyle=(i/segs)<level?col:col+'18';
      ctx.fillRect(0,y,W,segH);
    }
  }, []);

  /* ── draw master VU (stereo) ── */
  const drawMasterVU = useCallback((canvas, level) => {
    if(!canvas) return;
    const W=canvas.width, H=canvas.height, segs=14, segH=(H-segs)/segs;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    for(let ch=0;ch<2;ch++){
      const lv=level+(ch===0?0.05:-0.04)+Math.sin(Date.now()*0.003+ch)*0.07;
      for(let i=0;i<segs;i++){
        const y=H-(i+1)*(segH+1);
        const col=i/segs>0.85?'#f00':i/segs>0.70?'#fa0':'#0c0';
        ctx.fillStyle=(i/segs)<lv?col:col+'18';
        ctx.fillRect(ch*(W/2)+1,y,W/2-2,segH);
      }
    }
  }, []);

  /* ── animation loop ── */
  useEffect(() => {
    const loop = () => {
      /* jog wheels */
      if(jogLRef.current){
        jogAngle.current.L += playingRef.current.L ? 0.038 : 0.004;
        drawJog(jogLRef.current, jogAngle.current.L, playingRef.current.L, 'L');
      }
      if(jogRRef.current){
        jogAngle.current.R += playingRef.current.R ? 0.038 : 0.004;
        drawJog(jogRRef.current, jogAngle.current.R, playingRef.current.R, 'R');
      }
      /* waveforms */
      if(playingRef.current.L) waveOff.current.L += 0.5;
      if(playingRef.current.R) waveOff.current.R += 0.5;
      if(wvLRef.current) drawWaveform(wvLRef.current, waveOff.current.L, playingRef.current.L, c);
      if(wvRRef.current) drawWaveform(wvRRef.current, waveOff.current.R, playingRef.current.R, '#fa0');
      if(screenWvRef.current) drawWaveform(screenWvRef.current, waveOff.current.L, playingRef.current.L, c);
      /* VUs */
      for(let ch=0;ch<2;ch++){
        const base=ch===0?(playingRef.current.L?0.68:0.04):(playingRef.current.R?0.64:0.04);
        vuLevels.current[ch]=clamp(base+Math.sin(Date.now()*0.006+ch*1.5)*0.16+Math.random()*0.05,0,1);
        if(vuRefs.current[ch]) drawVU(vuRefs.current[ch], vuLevels.current[ch]);
      }
      const mLv=(playingRef.current.L||playingRef.current.R)?0.73+Math.sin(Date.now()*0.004)*0.11:0.04;
      if(masterVURef.current) drawMasterVU(masterVURef.current, mLv);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawJog, drawWaveform, drawVU, drawMasterVU]);

  /* ── pad colors ── */
  const PAD_MODES = ['HOT CUE','BEAT LOOP','SLIP LOOP','BEAT JUMP'];
  const PAD_COLS  = ['#f44','#fa0','#4af','#4f4','#f44','#fa0','#4af','#4f4','#f44','#fa0','#4af','#4f4','#f44','#fa0','#4af','#4f4'];
  const [padMode, setPadMode] = useState({ L:'HOT CUE', R:'HOT CUE' });

  /* ── button component ── */
  const PB = ({ label, active, onClick, ac, w=32, h=20, fontSize=7 }) => (
    <button className="pBtn" onClick={onClick} style={{
      width:w, height:h, borderRadius:4, cursor:'pointer', fontSize, fontFamily:'var(--dj-mono)',
      border:`1px solid ${active?(ac||c):'#222'}`,
      background:active?`${ac||c}22`:'#0c0c14',
      color:active?(ac||c):'#333',
      boxShadow:active?`0 0 8px ${ac||c}55`:'none',
      letterSpacing:0.3,
    }}>{label}</button>
  );

  /* ── single deck panel (XDJ-RX3 layout) ── */
  const renderDeck = s => {
    const dk = D(s); const dur=600; const remain=dur-dk.elapsed; const isL=s==='L';
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>

        {/* ── deck waveform display ── */}
        <div style={{ background:'#050810', borderRadius:6, padding:'6px 8px', border:`1px solid ${c}44`, boxShadow:`0 0 14px ${c}18` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:5,height:5,borderRadius:'50%', background:dk.playing?c:'#222', boxShadow:dk.playing?`0 0 5px ${c}`:'none', animation:dk.playing?'djBlink 1.1s infinite':'none' }}/>
              <span style={{ fontFamily:'var(--dj-mono)',fontSize:6,color:c,letterSpacing:2 }}>XDJ-RX3 · DECK {s==='L'?1:2}</span>
            </div>
            <div style={{ display:'flex',gap:6,alignItems:'center' }}>
              <span style={{ fontFamily:'var(--dj-orb)',fontSize:14,fontWeight:700,color:c }}>{dk.bpm.toFixed(1)}</span>
              <span style={{ fontFamily:'var(--dj-mono)',fontSize:6,color:'#555' }}>BPM</span>
            </div>
          </div>
          <div style={{ fontSize:10,fontWeight:700,color:'#d0d8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:1 }}>{dk.track}</div>
          <div style={{ fontSize:7,color:'#333',marginBottom:4 }}>{dk.artist}</div>
          <div style={{ display:'flex',gap:4,marginBottom:4 }}>
            <div style={{ flex:1,background:'#030508',borderRadius:3,padding:'2px 5px',border:'1px solid #0e1420' }}>
              <div style={{ fontSize:11,fontFamily:'var(--dj-mono)',color:c,fontWeight:700,lineHeight:1 }}>{fmt(dk.elapsed)}</div>
              <div style={{ fontSize:5,color:'#1a2535',fontFamily:'var(--dj-mono)' }}>ELAPSED</div>
            </div>
            <div style={{ flex:1,background:'#030508',borderRadius:3,padding:'2px 5px',border:'1px solid #0e1420' }}>
              <div style={{ fontSize:11,fontFamily:'var(--dj-mono)',color:'#2a3050',fontWeight:700,lineHeight:1 }}>-{fmt(Math.max(0,remain))}</div>
              <div style={{ fontSize:5,color:'#1a2535',fontFamily:'var(--dj-mono)' }}>REMAIN</div>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:2,justifyContent:'center' }}>
              <div style={{ width:60,height:3,background:'#0c1020',borderRadius:1,overflow:'hidden' }}>
                <div style={{ height:'100%',width:`${dk.progress*100}%`,background:c,borderRadius:1 }}/>
              </div>
              <div style={{ fontSize:6,fontFamily:'var(--dj-mono)',color:c,textAlign:'right' }}>{(dk.progress*100).toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ background:'#020407',borderRadius:2,padding:'1px 2px',border:'1px solid #0a1018' }}>
            <canvas ref={s==='L'?wvLRef:wvRRef} style={{ width:'100%',height:34,display:'block' }}/>
          </div>
        </div>

        {/* ── top controls: LOOP, CUE, RELOOP, QUANTIZE, SLIP ── */}
        <div style={{ display:'flex',gap:3,alignItems:'center',background:'#08090f',borderRadius:5,padding:'4px 6px',border:'1px solid #1a1e28' }}>
          <PB label="IN" w={24} h={18}/>
          <PB label="OUT" w={24} h={18}/>
          <PB label="RELOOP" ac={c} w={38} h={18}/>
          <PB label="CUE/LOOP" ac={c} w={44} h={18}/>
          <div style={{ flex:1 }}/>
          <PB label="SLIP" active={dk.slip} onClick={()=>sD(s,{slip:!dk.slip})} ac='#a855f7' w={28} h={18}/>
          <PB label="QUANTIZE" ac='#1ed760' w={46} h={18}/>
        </div>

        {/* ── jog wheel + pitch ── */}
        <div style={{ background:'#06080f',borderRadius:8,padding:'8px',border:`1px solid ${c}22`,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
          {isL && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={170}/>}
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:3 }}>
            <div style={{ position:'relative',width:190,height:190,flexShrink:0 }}>
              <div style={{ position:'absolute',inset:-5,borderRadius:'50%',pointerEvents:'none',transition:'box-shadow 0.4s',
                boxShadow:dk.playing?`0 0 28px ${c}55,0 0 60px ${c}22`:`0 0 8px ${c}11` }}/>
              <canvas ref={s==='L'?jogLRef:jogRRef} width={190} height={190} style={{ borderRadius:'50%',cursor:'grab',display:'block' }}/>
            </div>
            {/* JOG controls below */}
            <div style={{ display:'flex',gap:3 }}>
              <PB label="JOG" w={28} h={16} fontSize={6}/>
              <PB label="VINYL" active w={32} h={16} fontSize={6} ac={c}/>
              <PB label="BEAT SYNC" active={dk.playing} ac='#1ed760' w={46} h={16} fontSize={6}/>
            </div>
          </div>
          {!isL && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={170}/>}
          <VUMeter color={c} playing={dk.playing} height={170} bars={6}/>
        </div>

        {/* ── transport + loop size ── */}
        <div style={{ display:'flex',gap:3,alignItems:'center',background:'#08090f',borderRadius:5,padding:'4px 6px',border:'1px solid #1a1e28' }}>
          <button className="pBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ width:38,height:26,borderRadius:5,cursor:'pointer',fontSize:13,
            border:`2px solid ${dk.playing?c:'#1a1e2a'}`,background:dk.playing?`${c}22`:'#0c0e15',
            color:dk.playing?c:'#333',boxShadow:dk.playing?`0 0 14px ${c}66`:'none',transition:'all 0.2s' }}>{dk.playing?'⏸':'▶'}</button>
          <button className="pBtn" style={{ width:26,height:26,borderRadius:5,cursor:'pointer',fontSize:11,
            border:`2px solid ${c}88`,background:`${c}11`,color:c,fontWeight:700 }}>CUE</button>
          <PB label="LOOP" active={dk.loop} onClick={()=>sD(s,{loop:!dk.loop})} ac={c} w={32} h={26}/>
          <div style={{ flex:1 }}/>
          {['¼','½','1','2','4','8'].map(x=>(
            <button key={x} className="pBtn" style={{ flex:1,height:18,borderRadius:2,fontSize:6,fontFamily:'var(--dj-mono)',cursor:'pointer',border:'1px solid #1a1e28',background:'#080a14',color:'#2a3050' }}>{x}</button>
          ))}
        </div>

        {/* ── PAD MODE selector ── */}
        <div style={{ display:'flex',gap:2 }}>
          {PAD_MODES.map(m=>(
            <button key={m} className="pBtn" onClick={()=>setPadMode(p=>({...p,[s]:m}))}
              style={{ flex:1,height:16,borderRadius:3,fontSize:5,fontFamily:'var(--dj-mono)',cursor:'pointer',letterSpacing:0.2,
                border:`1px solid ${padMode[s]===m?c:'#1a1e28'}`,background:padMode[s]===m?`${c}22`:'#07090f',
                color:padMode[s]===m?c:'#2a3050',boxShadow:padMode[s]===m?`0 0 5px ${c}44`:'none' }}>{m}</button>
          ))}
        </div>

        {/* ── 16 performance pads (4×4 grid matching XDJ-RX3) ── */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:3 }}>
          {PAD_COLS.map((col,i)=>(
            <button key={i} className="pBtn"
              onClick={()=>sD(s,dk=>{const h=[...dk.hc];h[i]=!h[i];return{hc:h};})}
              style={{ height:24,borderRadius:4,cursor:'pointer',
                border:`2px solid ${dk.hc[i]?col:col+'28'}`,
                background:dk.hc[i]?`${col}28`:`${col}06`,
                boxShadow:dk.hc[i]?`0 0 10px ${col}66,inset 0 0 8px ${col}18`:'none',
                transition:'all 0.08s' }}/>
          ))}
        </div>

        {/* ── CUE + PLAY/PAUSE large buttons ── */}
        <div style={{ display:'flex',gap:5 }}>
          <button className="pBtn" style={{ flex:1,height:28,borderRadius:6,cursor:'pointer',fontFamily:'var(--dj-orb)',fontSize:9,letterSpacing:2,
            border:`2px solid ${c}`,background:`${c}18`,color:c,fontWeight:700 }}>CUE</button>
          <button className="pBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ flex:2,height:28,borderRadius:6,cursor:'pointer',fontSize:15,
            border:`2px solid ${dk.playing?'#1ed760':'#1a2a1a'}`,
            background:dk.playing?'rgba(30,215,96,0.14)':'#060c06',
            color:dk.playing?'#1ed760':'#1a3a1a',
            boxShadow:dk.playing?'0 0 14px rgba(30,215,96,0.5)':'none',transition:'all 0.2s' }}>⏯</button>
        </div>

      </div>
    );
  };

  /* ── main render ── */
  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',animation:'djReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards' }}>

      {/* top bar */}
      <div style={{ background:'#0a0b12',borderBottom:`1px solid ${c}33`,padding:'5px 14px',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
        <div style={{ fontFamily:'var(--dj-orb)',fontSize:14,fontWeight:900,color:c,letterSpacing:3 }}>Pioneer DJ</div>
        <div style={{ fontFamily:'var(--dj-orb)',fontSize:9,color:'#2a1a00',letterSpacing:2,background:`${c}22`,padding:'1px 6px',borderRadius:2 }}>XDJ-RX3</div>
        <div style={{ fontFamily:'var(--dj-mono)',fontSize:7,color:'#c00',letterSpacing:2,border:'1px solid #c004',padding:'1px 5px',borderRadius:2 }}>● rekordbox</div>
        <div style={{ fontFamily:'var(--dj-mono)',fontSize:7,color:'#1af',letterSpacing:2,border:'1px solid #1af4',padding:'1px 5px',borderRadius:2 }}>● serato</div>
        <div style={{ width:1,height:28,background:`${c}22` }}/>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ width:28,height:28,borderRadius:'50%',background:`linear-gradient(135deg,${c},#a05000)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:'#000',fontFamily:'var(--dj-orb)' }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)',fontSize:12,fontWeight:700,color:'#d8d0c0',letterSpacing:1,lineHeight:1 }}>{session.djName}</div>
            <div style={{ fontSize:7,color:c,fontFamily:'var(--dj-mono)',letterSpacing:1,marginTop:1 }}>XDJ-RX3 SESSION</div>
          </div>
        </div>
        <div style={{ width:1,height:28,background:`${c}22` }}/>
        <div style={{ display:'flex',alignItems:'center',gap:5 }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:'#1ed760',boxShadow:'0 0 5px #1ed760',animation:'djBlink 2s infinite' }}/>
          <span style={{ fontSize:9,fontFamily:'var(--dj-mono)',color:'#1ed760' }}>{session.audioSrc}</span>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
            <span style={{ fontSize:6,color:'#2a1a00',fontFamily:'var(--dj-mono)',letterSpacing:1 }}>MASTER</span>
            <HorizFader value={masterVol} onChange={setMasterVol} color={c} width={80}/>
          </div>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
            <span style={{ fontSize:6,color:'#2a1a00',fontFamily:'var(--dj-mono)',letterSpacing:1 }}>BOOTH</span>
            <HorizFader value={boothVol} onChange={setBoothVol} color='#3a8fff' width={80}/>
          </div>
          <canvas ref={masterVURef} width={28} height={28} style={{ display:'block' }}/>
        </div>
        <div style={{ width:1,height:28,background:`${c}22` }}/>
        <button onClick={()=>window.location.reload()} style={{ padding:'4px 12px',borderRadius:6,cursor:'pointer',fontFamily:'var(--dj-mono)',fontSize:8,letterSpacing:1,border:`1px solid ${c}33`,background:'transparent',color:'#3a4060' }}>✕ EXIT</button>
      </div>

      {/* main 3-column layout */}
      <div style={{ flex:1,display:'flex',overflow:'hidden',minHeight:0 }}>

        {/* LEFT DECK */}
        <div style={{ flex:1,padding:'6px 5px 6px 8px',overflow:'auto',display:'flex',flexDirection:'column',gap:4 }}>
          {renderDeck('L')}
        </div>

        {/* CENTER: touchscreen + mixer */}
        <div style={{ width:220,flexShrink:0,background:'#060810',borderLeft:`1px solid ${c}22`,borderRight:`1px solid ${c}22`,display:'flex',flexDirection:'column',gap:0,overflow:'auto' }}>

          {/* ── touchscreen ── */}
          <div style={{ background:'#020408',borderBottom:`1px solid ${c}33`,padding:'6px' }}>
            {/* nav tabs */}
            <div style={{ display:'flex',gap:1,marginBottom:5 }}>
              {['SOURCE','BROWSE','PLAYLIST','WAVEFORM','MENU'].map(t=>(
                <button key={t} className="pBtn" onClick={()=>setScreenTab(t)}
                  style={{ flex:1,height:14,borderRadius:2,fontSize:4.5,fontFamily:'var(--dj-mono)',cursor:'pointer',letterSpacing:0,
                    border:`1px solid ${screenTab===t?c:'#111'}`,
                    background:screenTab===t?`${c}33`:'#0a0a14',
                    color:screenTab===t?c:'#333' }}>{t}</button>
              ))}
            </div>
            {/* waveform area */}
            <div style={{ background:'#010306',borderRadius:3,padding:'3px',border:`1px solid ${c}33`,marginBottom:4 }}>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:2 }}>
                <span style={{ fontSize:6,fontFamily:'var(--dj-mono)',color:c }}>DECK 1 · {D('L').track}</span>
                <span style={{ fontSize:6,fontFamily:'var(--dj-orb)',color:c,fontWeight:700 }}>{D('L').bpm.toFixed(1)}</span>
              </div>
              <canvas ref={screenWvRef} style={{ width:'100%',height:28,display:'block' }}/>
              <div style={{ marginTop:3,display:'flex',justifyContent:'space-between' }}>
                <span style={{ fontSize:5,fontFamily:'var(--dj-mono)',color:'#333' }}>REMAIN: -{fmt(Math.max(0,600-D('L').elapsed))}</span>
                <span style={{ fontSize:5,fontFamily:'var(--dj-mono)',color:c }}>BEAT FX</span>
              </div>
            </div>
            {/* beat fx selector */}
            <div style={{ display:'flex',gap:2,flexWrap:'wrap',marginBottom:3 }}>
              {['FLANGER','TRANS','PHASER','REVERB','ECHO','DELAY','ROLL','HELIX'].map(f=>(
                <button key={f} className="pBtn" onClick={()=>setBeatFx(f)}
                  style={{ padding:'1px 3px',borderRadius:2,fontSize:5,fontFamily:'var(--dj-mono)',cursor:'pointer',
                    border:`1px solid ${beatFx===f?c:'#1a1020'}`,
                    background:beatFx===f?`${c}22`:'transparent',
                    color:beatFx===f?c:'#2a1a30' }}>{f}</button>
              ))}
            </div>
            <div style={{ display:'flex',gap:3,alignItems:'center' }}>
              <div style={{ flex:1,background:`${c}22`,border:`1px solid ${c}`,borderRadius:3,padding:'2px 5px',textAlign:'center' }}>
                <div style={{ fontFamily:'var(--dj-orb)',fontSize:8,color:c,fontWeight:700 }}>{beatFx}</div>
              </div>
              <Knob size={22} value={0.5} onChange={()=>{}} color={c} label="DEPTH"/>
              <PB label="TAP" w={22} h={18} ac={c}/>
            </div>
          </div>

          {/* ── mixer section ── */}
          <div style={{ flex:1,padding:'6px',display:'flex',flexDirection:'column',gap:5 }}>
            <div style={{ textAlign:'center',fontFamily:'var(--dj-orb)',fontSize:6,color:'#2a1a00',letterSpacing:2 }}>2CH · MIXER</div>

            {/* TRIM + EQ for both channels */}
            <div style={{ display:'flex',gap:6,justifyContent:'center' }}>
              {['L','R'].map((s,ci)=>(
                <div key={s} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:3 }}>
                  <span style={{ fontSize:6,color:c,fontFamily:'var(--dj-mono)',letterSpacing:1 }}>CH {ci+1}</span>
                  <Knob size={26} value={D(s).trim} onChange={v=>sD(s,{trim:v})} color={c} label="TRIM"/>
                  <Knob size={24} value={D(s).eq.hi}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,hi:v}}))}  color='#f55' label="HI"  centerZero/>
                  <Knob size={24} value={D(s).eq.mid} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,mid:v}}))} color='#fa0' label="MID" centerZero/>
                  <Knob size={24} value={D(s).eq.lo}  onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,lo:v}}))}  color='#5af' label="LOW" centerZero/>
                  <Knob size={20} value={0.5} onChange={()=>{}} color='#a6f' label="COLOR"/>
                  <canvas ref={el=>vuRefs.current[ci]=el} width={8} height={48} style={{ display:'block' }}/>
                  <VertFader value={D(s).volume} onChange={v=>sD(s,{volume:v})} color={c} height={70}/>
                  <div style={{ width:32,height:16,background:'#060810',border:`2px solid ${c}`,borderRadius:3,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,color:c,fontFamily:'var(--dj-orb)',fontWeight:700,cursor:'pointer',letterSpacing:1 }}>
                    CUE
                  </div>
                </div>
              ))}
            </div>

            {/* SOUND COLOR FX */}
            <div style={{ background:'#07090f',borderRadius:5,padding:'4px',border:'1px solid #1a1020' }}>
              <div style={{ fontSize:6,color:'#2a1030',fontFamily:'var(--dj-mono)',letterSpacing:1,textAlign:'center',marginBottom:3 }}>SOUND COLOR FX</div>
              <div style={{ display:'flex',gap:2,justifyContent:'center' }}>
                {[{id:'noise',l:'NOISE',col:'#aaa'},{id:'duco',l:'DUCO',col:'#fa0'},{id:'sweep',l:'SWEEP',col:c},{id:'filter',l:'FILTER',col:'#5af'}].map(f=>(
                  <button key={f.id} className="pBtn" onClick={()=>setColorFx(x=>({...x,[f.id]:!x[f.id]}))}
                    style={{ flex:1,height:16,borderRadius:3,fontSize:5.5,fontFamily:'var(--dj-mono)',cursor:'pointer',
                      border:`1px solid ${colorFx[f.id]?f.col+'88':'#1a1020'}`,
                      background:colorFx[f.id]?`${f.col}22`:'transparent',
                      color:colorFx[f.id]?f.col:'#2a1030',
                      boxShadow:colorFx[f.id]?`0 0 6px ${f.col}44`:'none' }}>{f.l}</button>
                ))}
              </div>
              <div style={{ display:'flex',justifyContent:'center',marginTop:4 }}>
                <Knob size={26} value={0.5} onChange={()=>{}} color={c} label="PARAM"/>
              </div>
            </div>

            {/* crossfader */}
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:3 }}>
                <span style={{ fontSize:6,color:c,fontFamily:'var(--dj-mono)' }}>‹A</span>
                <span style={{ fontSize:6,color:'#2a1a00',fontFamily:'var(--dj-mono)',letterSpacing:1 }}>CROSSFADER</span>
                <span style={{ fontSize:6,color:c,fontFamily:'var(--dj-mono)' }}>B›</span>
              </div>
              <HorizFader value={xfader} onChange={setXfader} color={c} width={196}/>
            </div>

            {/* headphones + master knob */}
            <div style={{ display:'flex',gap:5,justifyContent:'center',alignItems:'center' }}>
              <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
                <Knob size={28} value={0.65} onChange={()=>{}} color='#555' label="CUE"/>
              </div>
              <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:2 }}>
                <Knob size={28} value={masterVol} onChange={setMasterVol} color={c} label="MASTER"/>
              </div>
              <button className="pBtn" onClick={()=>setMic(m=>!m)} style={{ flex:1,height:26,borderRadius:4,cursor:'pointer',fontSize:7,fontFamily:'var(--dj-mono)',
                border:`1px solid ${mic?'#e03c3c':'#1a1020'}`,background:mic?'rgba(224,60,60,0.14)':'#070a14',
                color:mic?'#f44':'#2a1020',boxShadow:mic?'0 0 8px rgba(224,60,60,0.5)':'none' }}>🎙 {mic?'ON':'MIC'}</button>
            </div>

            {/* spectrum */}
            <div style={{ display:'flex',gap:1,alignItems:'flex-end',height:20,overflow:'hidden' }}>
              {Array.from({length:30}).map((_,i)=>(
                <div key={i} style={{ flex:1,height:'100%',background:'rgba(255,255,255,0.025)',borderRadius:1,display:'flex',alignItems:'flex-end',overflow:'hidden' }}>
                  <div className={`dj-sp${i%8}`} style={{ width:'100%',background:c,borderRadius:1,animationDelay:`${i*0.05}s` }}/>
                </div>
              ))}
            </div>

            {/* BPM */}
            <div style={{ background:'#050710',borderRadius:4,padding:'3px 6px',border:`1px solid ${c}22`,textAlign:'center' }}>
              <div style={{ fontFamily:'var(--dj-orb)',fontSize:16,color:c,fontWeight:700,lineHeight:1 }}>{D('L').bpm.toFixed(1)}</div>
              <div style={{ fontSize:5,color:'#2a1a00',fontFamily:'var(--dj-mono)',letterSpacing:1 }}>MASTER BPM</div>
            </div>
          </div>
        </div>

        {/* RIGHT DECK */}
        <div style={{ flex:1,padding:'6px 8px 6px 5px',overflow:'auto',display:'flex',flexDirection:'column',gap:4 }}>
          {renderDeck('R')}
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DENON MCX8000 CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
function DenonController({ session }) {
  /* ── State ── */
  const [decks, setDecks] = useState({
    L: { playing:true,  bpm:128.0, pitch:0.5, volume:0.82, eq:{ hi:0.72, mid:0.62, lo:0.68 }, gain:0.74, track:'Midnight & Mirrors', artist:'CØVR', elapsed:308, progress:0.38, hc:Array(16).fill(false).map((_,i)=>i<2), layer:'A', loop:false },
    R: { playing:false, bpm:128.0, pitch:0.5, volume:0.75, eq:{ hi:0.70, mid:0.60, lo:0.72 }, gain:0.70, track:'Elektrik Soundsystem', artist:'AXIS', elapsed:436, progress:0.52, hc:Array(16).fill(false).map((_,i)=>i===1), layer:'A', loop:false },
  });
  const [xfader,    setXfader]    = useState(0.5);
  const [masterVol, setMasterVol] = useState(0.80);
  const [boothVol,  setBoothVol]  = useState(0.65);
  const [mic,       setMic]       = useState(false);
  const [fxOn, setFxOn] = useState({ echo:true, phaser:false, noise:false, filter:true });
  const [micOn, setMicOn] = useState(false);

  /* ── Canvas refs ── */
  const jogLRef = useRef(null); const jogRRef = useRef(null);
  const wvLRef  = useRef(null); const wvRRef  = useRef(null);
  const vuRefs  = useRef([]);
  const masterVURef = useRef(null);
  const animRef = useRef(null);
  const frameRef = useRef(0);
  const jogAngle = useRef({ L:0, R:0 });
  const waveOff  = useRef({ L:0, R:20 });
  const vuLevels = useRef([0.7,0.75,0.4,0.3]);

  const D  = s => decks[s];
  const sD = (s, p) => setDecks(d => ({ ...d, [s]: typeof p === 'function' ? p(d[s]) : { ...d[s], ...p } }));
  const c  = '#1aafff';

  /* ── Timer ── */
  useEffect(() => {
    const id = setInterval(() => setDecks(d => {
      const u = {};
      for (const s of ['L','R']) if (d[s].playing) u[s] = { ...d[s], elapsed:d[s].elapsed+1, progress:clamp(d[s].progress+0.0003,0,0.999) };
      return { ...d, ...u };
    }), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Canvas helpers ── */
  const drawJog = useCallback((canvas, angle, playing) => {
    if (!canvas) return;
    const W = 160, H = 160, cx = W/2, cy = H/2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    // Outer ring
    ctx.beginPath(); ctx.arc(cx,cy,78,0,Math.PI*2);
    ctx.fillStyle='#0d0d0d'; ctx.fill();
    ctx.strokeStyle= playing ? c : '#1a2a3a';
    ctx.lineWidth=2;
    if (playing) { ctx.shadowBlur=14; ctx.shadowColor=c; }
    ctx.stroke(); ctx.shadowBlur=0;
    // LED ring dots
    for (let i=0;i<40;i++) {
      const a=(i/40)*Math.PI*2+angle*0.25;
      const lx=cx+74*Math.cos(a), ly=cy+74*Math.sin(a);
      const bright=(Math.sin(a*4+angle)+1)*0.5;
      ctx.beginPath(); ctx.arc(lx,ly,1.4,0,Math.PI*2);
      ctx.fillStyle=playing?`rgba(17,175,255,${0.25+bright*0.75})`:`rgba(30,60,90,0.5)`;
      ctx.fill();
    }
    // Platter
    ctx.beginPath(); ctx.arc(cx,cy,66,0,Math.PI*2);
    const pg=ctx.createRadialGradient(cx-12,cy-12,3,cx,cy,66);
    pg.addColorStop(0,'#222'); pg.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=pg; ctx.fill();
    // Spinning grooves
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
    for (let i=0;i<28;i++) {
      const a=(i/28)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*18,Math.sin(a)*18);
      ctx.lineTo(Math.cos(a)*62,Math.sin(a)*62);
      ctx.strokeStyle='rgba(255,255,255,0.035)'; ctx.lineWidth=0.6; ctx.stroke();
    }
    for (let i=0;i<12;i++) {
      const a=(i/12)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*56,Math.sin(a)*56);
      ctx.lineTo(Math.cos(a)*63,Math.sin(a)*63);
      ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=1.2; ctx.stroke();
    }
    // Hub
    ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2);
    const hg=ctx.createRadialGradient(-4,-4,1,0,0,20);
    hg.addColorStop(0,'#282828'); hg.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=hg; ctx.fill();
    ctx.strokeStyle='#333'; ctx.lineWidth=0.5; ctx.stroke();
    // Marker
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,-16);
    ctx.strokeStyle=playing?c:'rgba(255,255,255,0.18)';
    ctx.lineWidth=2.5; ctx.lineCap='round';
    if (playing){ctx.shadowBlur=8;ctx.shadowColor=c;}
    ctx.stroke(); ctx.shadowBlur=0;
    ctx.restore();
  }, [c]);

  const drawWaveform = useCallback((canvas, offset, playing) => {
    if (!canvas) return;
    const W=canvas.offsetWidth||280, H=32;
    if (canvas.width!==W) canvas.width=W;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#060a10'; ctx.fillRect(0,0,W,H);
    const bars=Math.floor(W/3);
    for (let i=0;i<bars;i++){
      const x=i*3;
      const s=(i+offset)*0.28;
      const amp=Math.abs(Math.sin(s)*10+Math.sin(s*0.5)*6+Math.sin(s*2.3)*3);
      const pct=i/bars;
      ctx.fillStyle=pct<0.46?'#1a2535':pct<0.52?c:c+'55';
      ctx.fillRect(x,H/2-amp,2,amp*2);
    }
    ctx.fillStyle=playing?'rgba(255,255,255,0.9)':'rgba(100,120,150,0.5)';
    ctx.fillRect(W*0.47,0,1.5,H);
  }, [c]);

  const drawVU = useCallback((canvas, level) => {
    if (!canvas) return;
    const W=canvas.width, H=canvas.height, segs=12, segH=(H-segs)/segs;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    for (let i=0;i<segs;i++){
      const y=H-(i+1)*(segH+1);
      const col=i/segs>0.83?'#f00':i/segs>0.67?'#fa0':'#0f0';
      ctx.fillStyle=(i/segs)<level?col:col+'18';
      ctx.fillRect(1,y,W-2,segH);
    }
  }, []);

  const drawMasterVU = useCallback((canvas, level) => {
    if (!canvas) return;
    const W=canvas.width, H=canvas.height, segs=14, segH=(H-segs)/segs;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);
    for (let ch=0;ch<2;ch++){
      const lv=level+(ch===0?0.06:-0.04)+Math.sin(Date.now()*0.003+ch)*0.07;
      for (let i=0;i<segs;i++){
        const y=H-(i+1)*(segH+1);
        const col=i/segs>0.86?'#f00':i/segs>0.71?'#fa0':'#0f0';
        ctx.fillStyle=(i/segs)<lv?col:col+'18';
        ctx.fillRect(ch*(W/2)+1,y,W/2-2,segH);
      }
    }
  }, []);

  /* ── Animation loop ── */
  useEffect(() => {
    let playing = { L: true, R: false };
    // keep a ref-based snapshot to avoid stale closure
    const getPlaying = () => playing;
    const unsubPlaying = () => {};

    const loop = () => {
      frameRef.current++;
      const dk = { L: null, R: null }; // will read from DOM state via refs

      // Jog angles — read playing from refs we set below
      if (jogLRef.current) {
        jogAngle.current.L += playingRef.current.L ? 0.045 : 0.005;
        drawJog(jogLRef.current, jogAngle.current.L, playingRef.current.L);
      }
      if (jogRRef.current) {
        jogAngle.current.R += playingRef.current.R ? 0.045 : 0.005;
        drawJog(jogRRef.current, jogAngle.current.R, playingRef.current.R);
      }
      // Waveforms
      if (playingRef.current.L) waveOff.current.L += 0.55;
      if (playingRef.current.R) waveOff.current.R += 0.55;
      if (wvLRef.current) drawWaveform(wvLRef.current, waveOff.current.L, playingRef.current.L);
      if (wvRRef.current) drawWaveform(wvRRef.current, waveOff.current.R, playingRef.current.R);
      // Channel VUs
      for (let ch=0;ch<4;ch++) {
        const base = ch<2?(playingRef.current.L?0.66:0.05):(playingRef.current.R?0.62:0.05);
        vuLevels.current[ch]=clamp(base+Math.sin(Date.now()*0.006+ch*1.4)*0.17+Math.random()*0.05,0,1);
        if (vuRefs.current[ch]) drawVU(vuRefs.current[ch], vuLevels.current[ch]);
      }
      // Master VU
      const mLv=playingRef.current.L||playingRef.current.R?0.72+Math.sin(Date.now()*0.004)*0.12:0.05;
      if (masterVURef.current) drawMasterVU(masterVURef.current, mLv);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawJog, drawWaveform, drawVU, drawMasterVU]);

  /* ── playing ref (so animation loop stays current) ── */
  const playingRef = useRef({ L:true, R:false });
  useEffect(() => {
    playingRef.current = { L: decks.L.playing, R: decks.R.playing };
  }, [decks.L.playing, decks.R.playing]);

  /* ── Sub-buttons ── */
  const DB = ({ label, active, onClick, ac, w=34, h=20 }) => (
    <button className="dBtn" onClick={onClick} style={{
      width:w, height:h, borderRadius:4, cursor:'pointer', fontSize:7, fontFamily:'var(--dj-mono)',
      border:`1px solid ${active?(ac||c):'#1c2232'}`, background:active?`${ac||c}22`:'#080b14',
      color:active?(ac||c):'#2a3558', boxShadow:active?`0 0 8px ${ac||c}55`:'none', letterSpacing:0.5,
    }}>{label}</button>
  );

  /* ── Pad colors (16 pads like real MCX8000) ── */
  const PAD_COLS = [
    '#e040fb','#ab47bc','#7c4dff','#3d5afe',
    '#00b0ff','#00e5ff','#1de9b6','#00e676',
    '#c6ff00','#ffea00','#ff6d00','#ff1744',
    '#f06292','#ff8a65','#a5d6a7','#80cbc4'
  ];

  /* ── Single deck panel ── */
  const renderDeck = s => {
    const dk = D(s); const dur = 600; const remain = dur - dk.elapsed;
    const isL = s === 'L';
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5, minWidth:0 }}>

        {/* ── Screen ── */}
        <div style={{ background:'#020609', borderRadius:7, padding:'7px 9px', border:`2px solid ${c}55`, boxShadow:`0 0 18px ${c}22,inset 0 0 25px rgba(0,0,0,0.7)` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:dk.playing?c:'#1a2535', boxShadow:dk.playing?`0 0 5px ${c}`:'none', animation:dk.playing?'djBlink 1.1s infinite':'none' }}/>
              <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, color:c, letterSpacing:2 }}>MCX8000 · DECK {s}</span>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontFamily:'var(--dj-mono)', fontSize:7, color:'#3a6' }}>+4.9%</span>
              <span style={{ fontFamily:'var(--dj-orb)', fontSize:15, fontWeight:700, color:c, letterSpacing:1 }}>{dk.bpm.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:'#d8e0f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1 }}>{dk.track}</div>
          <div style={{ fontSize:8, color:'#2a3558', marginBottom:4 }}>{dk.artist}</div>
          <div style={{ display:'flex', gap:5, marginBottom:5 }}>
            <div style={{ flex:1, background:'rgba(0,0,0,0.4)', borderRadius:3, padding:'2px 6px', border:'1px solid #101828' }}>
              <div style={{ fontSize:12, fontFamily:'var(--dj-mono)', color:c, fontWeight:700, lineHeight:1 }}>{fmt(dk.elapsed)}</div>
              <div style={{ fontSize:5, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>ELAPSED</div>
            </div>
            <div style={{ flex:1, background:'rgba(0,0,0,0.4)', borderRadius:3, padding:'2px 6px', border:'1px solid #101828' }}>
              <div style={{ fontSize:12, fontFamily:'var(--dj-mono)', color:'#2a3558', fontWeight:700, lineHeight:1 }}>-{fmt(Math.max(0,remain))}</div>
              <div style={{ fontSize:5, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>REMAIN</div>
            </div>
          </div>
          <div style={{ background:'#020508', borderRadius:3, padding:'2px 3px', border:'1px solid #0a1020' }}>
            <canvas ref={s==='L'?wvLRef:wvRRef} style={{ width:'100%', height:32, display:'block' }}/>
          </div>
          <div style={{ display:'flex', gap:3, marginTop:4 }}>
            {['ECHO','PHASER','NOISE'].map((f,i)=>(
              <button key={f} className="dBtn" onClick={()=>setFxOn(x=>({...x,[f.toLowerCase()]:!x[f.toLowerCase()]}))}
                style={{ padding:'2px 5px', borderRadius:2, fontSize:6, fontFamily:'var(--dj-mono)', cursor:'pointer',
                  border:`1px solid ${fxOn[f.toLowerCase()]?'#fa0':'#1a2535'}`,
                  background:fxOn[f.toLowerCase()]?'rgba(255,170,0,0.15)':'transparent',
                  color:fxOn[f.toLowerCase()]?'#fa0':'#1a2535' }}>{f}</button>
            ))}
            <div style={{ flex:1 }}/>
            <span style={{ fontSize:6, color:'#1a2535', fontFamily:'var(--dj-mono)' }}>{isL?'1/2':'1/8'}</span>
          </div>
        </div>

        {/* ── FX Section ── */}
        <div style={{ background:'#07090f', borderRadius:6, padding:'5px 7px', border:'1px solid #1a1e2e', display:'flex', gap:5, alignItems:'center' }}>
          <span style={{ fontFamily:'var(--dj-orb)', fontSize:7, color:c, letterSpacing:1 }}>FX {isL?1:2}</span>
          {[0.6,0.4,0.7].map((v,i)=>(
            <Knob key={i} size={24} value={v} onChange={()=>{}} color='#fa0'/>
          ))}
          <Knob size={20} value={0.5} onChange={()=>{}} color='#fa0' label="BEATS"/>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ display:'flex', gap:2 }}>
              {['ON','ON','ON'].map((l,i)=>(
                <button key={i} className="dBtn" style={{ width:22, height:13, borderRadius:2, fontSize:6, fontFamily:'var(--dj-mono)', cursor:'pointer', border:'1px solid #1a6a1a', background:'rgba(0,180,0,0.1)', color:'#0c0' }}>{l}</button>
              ))}
            </div>
            <div style={{ display:'flex', gap:2 }}>
              {['SEL','SEL','TAP'].map((l,i)=>(
                <button key={i} className="dBtn" style={{ width:22, height:13, borderRadius:2, fontSize:6, fontFamily:'var(--dj-mono)', cursor:'pointer', border:'1px solid #1a1e2e', background:'#070a12', color:'#2a3558' }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Jog wheel + pitch ── */}
        <div style={{ background:'#07090f', borderRadius:8, padding:'8px', border:`1px solid ${c}22`, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          {isL && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={150}/>}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:6, color:'#1a2535', fontFamily:'var(--dj-mono)', letterSpacing:2 }}>NEEDLE DROP</span>
            <div style={{ position:'relative', width:160, height:160, flexShrink:0 }}>
              <div style={{ position:'absolute', inset:-4, borderRadius:'50%', pointerEvents:'none', transition:'box-shadow 0.4s',
                boxShadow:dk.playing?`0 0 22px ${c}66,0 0 50px ${c}28`:`0 0 8px ${c}18` }}/>
              <canvas ref={s==='L'?jogLRef:jogRRef} width={160} height={160}
                style={{ borderRadius:'50%', cursor:'grab', display:'block' }}/>
            </div>
          </div>
          {!isL && <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} color={c} height={150}/>}
          <VUMeter color={c} playing={dk.playing} height={150} bars={6}/>
        </div>

        {/* ── Transport controls ── */}
        <div style={{ display:'flex', gap:4, alignItems:'center', background:'#07090f', borderRadius:6, padding:'5px 7px', border:'1px solid #1a1e2e' }}>
          <button className="dBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ width:36, height:28, borderRadius:5, cursor:'pointer', fontSize:13, border:`2px solid ${dk.playing?c:'#1c2030'}`, background:dk.playing?`${c}22`:'#080b14', color:dk.playing?c:'#2a3558', boxShadow:dk.playing?`0 0 14px ${c}55`:'none', transition:'all 0.2s' }}>{dk.playing?'⏸':'▶'}</button>
          <DB label="CUE" ac={c}/>
          <DB label="SYNC" ac="#1ed760"/>
          <DB label="LOOP" active={dk.loop} onClick={()=>sD(s,{loop:!dk.loop})} ac="#e8a020"/>
          <DB label="SLIP" ac="#a855f7"/>
          <div style={{ flex:1 }}/>
          <VUMeter color={c} playing={dk.playing} height={26} bars={4}/>
        </div>

        {/* ── Loop size ── */}
        <div style={{ display:'flex', gap:2, alignItems:'center', background:'#07090f', borderRadius:5, padding:'3px 6px', border:'1px solid #1a1e2e' }}>
          <span style={{ fontSize:6, color:'#1c2a40', fontFamily:'var(--dj-mono)', letterSpacing:1, marginRight:2 }}>LOOP</span>
          {['¼','½','1','2','4','8','16','32'].map(x=>(
            <button key={x} className="dBtn" style={{ flex:1, height:14, borderRadius:2, fontSize:5, fontFamily:'var(--dj-mono)', cursor:'pointer', border:'1px solid #1a1e2e', background:'#060810', color:'#2a3558' }}>{x}</button>
          ))}
        </div>

        {/* ── Mode labels ── */}
        <div style={{ display:'flex', justifyContent:'space-around', fontSize:6, fontFamily:'var(--dj-mono)' }}>
          <span style={{ color:'#555' }}>CUE LOOP</span>
          <span style={{ color:'#0c0' }}>ROLL</span>
          <span style={{ color:'#a6f' }}>SLICER</span>
          <span style={{ color:'#fa0' }}>SAMPLER</span>
        </div>

        {/* ── 16 Performance pads ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:3 }}>
          {PAD_COLS.map((col,i)=>(
            <button key={i} className="dBtn"
              onClick={()=>sD(s,dk=>{const h=[...dk.hc];h[i]=!h[i];return{hc:h};})}
              style={{ height:26, borderRadius:4, cursor:'pointer', border:`2px solid ${dk.hc[i]?col:col+'30'}`,
                background:dk.hc[i]?`${col}30`:`${col}08`,
                boxShadow:dk.hc[i]?`0 0 10px ${col}77,inset 0 0 8px ${col}22`:'none',
                transition:'all 0.08s' }}/>
          ))}
        </div>

        {/* ── CUE + Play bottom ── */}
        <div style={{ display:'flex', gap:4 }}>
          <button className="dBtn" style={{ flex:1, height:24, borderRadius:5, cursor:'pointer', fontFamily:'var(--dj-mono)', fontSize:9, letterSpacing:1, border:`2px solid ${c}88`, background:`${c}11`, color:c }}>CUE</button>
          <button className="dBtn" onClick={()=>sD(s,{playing:!dk.playing})} style={{ flex:1, height:24, borderRadius:5, cursor:'pointer', fontSize:14, border:`2px solid ${dk.playing?'#0c0':'#1c3c1c'}`, background:dk.playing?'rgba(0,200,0,0.12)':'#060c06', color:dk.playing?'#0c0':'#1c3c1c' }}>⏯</button>
        </div>

        {/* ── Deck select ── */}
        <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
          {(isL?['DECK 1','DECK 3']:['DECK 2','DECK 4']).map((l,i)=>(
            <button key={l} className="dBtn" style={{ padding:'2px 8px', borderRadius:3, fontSize:6, fontFamily:'var(--dj-mono)', cursor:'pointer',
              border:`1px solid ${(isL?i===0:i===1)?c:'#1a1e2e'}`,
              background:(isL?i===0:i===1)?`${c}18`:'#070a12',
              color:(isL?i===0:i===1)?c:'#2a3558' }}>{l}</button>
          ))}
        </div>

      </div>
    );
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', animation:'djReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards' }}>

      {/* ── Top bar ── */}
      <div style={{ background:'#06080f', borderBottom:`1px solid ${c}33`, padding:'5px 14px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:14, fontWeight:900, color:c, letterSpacing:3 }}>DENON DJ</div>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:9, color:'#1a2a40', letterSpacing:2 }}>MCX8000</div>
        <div style={{ fontFamily:'var(--dj-mono)', fontSize:7, color:'#1af', letterSpacing:2, border:'1px solid #1af4', padding:'1px 5px', borderRadius:2 }}>● SERATO DJ</div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${c},#0a50c0)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#fff', fontFamily:'var(--dj-orb)' }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:12, fontWeight:700, color:'#d0d8f0', letterSpacing:1, lineHeight:1 }}>{session.djName}</div>
            <div style={{ fontSize:7, color:c, fontFamily:'var(--dj-mono)', letterSpacing:1, marginTop:1 }}>MCX8000 SESSION</div>
          </div>
        </div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#1ed760', boxShadow:'0 0 5px #1ed760', animation:'djBlink 2s infinite' }}/>
          <span style={{ fontSize:9, fontFamily:'var(--dj-mono)', color:'#1ed760' }}>{session.audioSrc}</span>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:6, color:'#1a2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>MASTER</span>
            <HorizFader value={masterVol} onChange={setMasterVol} color={c} width={80}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <span style={{ fontSize:6, color:'#1a2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>BOOTH</span>
            <HorizFader value={boothVol} onChange={setBoothVol} color={c} width={80}/>
          </div>
          <canvas ref={masterVURef} width={28} height={28} style={{ display:'block' }}/>
        </div>
        <div style={{ width:1, height:28, background:`${c}22` }}/>
        <button onClick={()=>window.location.reload()} style={{ padding:'4px 12px', borderRadius:6, cursor:'pointer', fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1, border:`1px solid ${c}33`, background:'transparent', color:'#3a4060' }}>✕ EXIT</button>
      </div>

      {/* ── Main layout: Deck L | Mixer | Deck R ── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* Left deck */}
        <div style={{ flex:1, padding:'8px 6px 8px 8px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>
          {renderDeck('L')}
        </div>

        {/* Center Mixer (MCX8000 4-channel) */}
        <div style={{ width:210, flexShrink:0, background:'#050710', borderLeft:`1px solid ${c}22`, borderRight:`1px solid ${c}22`, padding:'8px', display:'flex', flexDirection:'column', gap:5, overflow:'auto' }}>

          <div style={{ textAlign:'center', fontFamily:'var(--dj-orb)', fontSize:7, color:'#1a2a40', letterSpacing:2, marginBottom:2 }}>MCX8000 · 4CH MIXER</div>

          {/* MIC section */}
          <div style={{ background:'#07090f', borderRadius:6, padding:'5px', border:'1px solid #1a1e2e', display:'flex', gap:5, alignItems:'center' }}>
            <span style={{ fontSize:6, color:'#444', fontFamily:'var(--dj-mono)' }}>MIC</span>
            <Knob size={22} value={0.55} onChange={()=>{}} color='#f44' label="LVL"/>
            <Knob size={20} value={0.3}  onChange={()=>{}} color='#f44' label="ECHO"/>
            <canvas ref={el=>vuRefs.current[4]=el} width={6} height={28} style={{ display:'block' }}/>
            <button className="dBtn" onClick={()=>setMicOn(m=>!m)} style={{ flex:1, height:20, borderRadius:4, cursor:'pointer', fontSize:7, fontFamily:'var(--dj-mono)',
              border:`1px solid ${micOn?'#f00':'#2a1010'}`, background:micOn?'rgba(255,0,0,0.15)':'#080b14',
              color:micOn?'#f44':'#2a1515', boxShadow:micOn?'0 0 8px rgba(255,0,0,0.5)':'none' }}>MIC {micOn?'ON':'OFF'}</button>
          </div>

          {/* 4 channel strips */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
            {[{ch:'3',col:'#fa0'},{ch:'1',col:c},{ch:'2',col:'#0f0'},{ch:'4',col:'#a6f'}].map((ch,i)=>(
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <span style={{ fontSize:7, color:ch.col, fontFamily:'var(--dj-mono)', letterSpacing:0.5 }}>{ch.ch}</span>
                <Knob size={18} value={[0.65,0.55,0.6,0.7][i]} onChange={()=>{}} color='#f44' label="HI"/>
                <Knob size={18} value={[0.55,0.5,0.62,0.58][i]} onChange={()=>{}} color='#fa0' label="MID"/>
                <Knob size={18} value={[0.6,0.68,0.55,0.52][i]} onChange={()=>{}} color={c} label="LO"/>
                <Knob size={16} value={[0.7,0.72,0.45,0.35][i]} onChange={()=>{}} color='#0f0' label="LVL"/>
                <Knob size={16} value={0.5} onChange={()=>{}} color='#a6f' label="FLT"/>
                <canvas ref={el=>vuRefs.current[i]=el} width={8} height={42} style={{ display:'block' }}/>
                <VertFader
                  value={i<2?D('L').volume:D('R').volume}
                  onChange={v=>sD(i<2?'L':'R',{volume:v})}
                  color={ch.col} height={70}/>
                <div style={{ width:28, height:12, background:'#060810', border:`1px solid ${ch.col}44`, borderRadius:2,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, color:ch.col, fontFamily:'var(--dj-mono)', cursor:'pointer' }}>CUE</div>
              </div>
            ))}
          </div>

          {/* Crossfader */}
          <div style={{ marginTop:3 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:6, color:c, fontFamily:'var(--dj-mono)' }}>A</span>
              <span style={{ fontSize:6, color:'#1a2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>X-FADER</span>
              <span style={{ fontSize:6, color:c, fontFamily:'var(--dj-mono)' }}>B</span>
            </div>
            <HorizFader value={xfader} onChange={setXfader} color={c} width={188}/>
          </div>

          {/* Phones + master knobs */}
          <div style={{ display:'flex', gap:5, justifyContent:'center', marginTop:3 }}>
            <Knob size={28} value={masterVol} onChange={setMasterVol} color='#0f0' label="MASTER"/>
            <Knob size={28} value={boothVol}  onChange={setBoothVol}  color='#0f0' label="BOOTH"/>
            <Knob size={24} value={0.7}        onChange={()=>{}}        color='#fff' label="PHONES"/>
          </div>

          {/* FX send rows */}
          <div style={{ background:'#07090f', borderRadius:5, padding:'4px', border:'1px solid #1a1e2e' }}>
            <div style={{ fontSize:6, color:'#1a2a40', fontFamily:'var(--dj-mono)', letterSpacing:2, textAlign:'center', marginBottom:4 }}>SWEEP FX</div>
            <div style={{ display:'flex', gap:2, flexWrap:'wrap', justifyContent:'center' }}>
              {[{id:'echo',l:'ECHO',col:c},{id:'filter',l:'FILTER',col:'#a6f'},{id:'phaser',l:'PHASER',col:'#fa0'},{id:'noise',l:'NOISE',col:'#f44'}].map(f=>(
                <button key={f.id} className="dBtn" onClick={()=>setFxOn(x=>({...x,[f.id]:!x[f.id]}))}
                  style={{ padding:'3px 6px', borderRadius:3, cursor:'pointer', fontSize:6, fontFamily:'var(--dj-mono)',
                    border:`1px solid ${fxOn[f.id]?f.col+'66':'#1a1e2e'}`,
                    background:fxOn[f.id]?`${f.col}18`:'#060810',
                    color:fxOn[f.id]?f.col:'#2a3558', boxShadow:fxOn[f.id]?`0 0 6px ${f.col}44`:'none' }}>{f.l}</button>
              ))}
            </div>
          </div>

          {/* Mic on / talk over */}
          <div style={{ display:'flex', gap:3 }}>
            <button className="dBtn" onClick={()=>setMicOn(m=>!m)} style={{ flex:1, height:22, borderRadius:4, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)', letterSpacing:0.5,
              border:`1px solid ${micOn?'#f00':'#2a1010'}`, background:micOn?'rgba(255,0,0,0.12)':'#080b14',
              color:micOn?'#f55':'#2a1515', boxShadow:micOn?'0 0 8px rgba(255,0,0,0.4)':'none' }}>🎙 MIC ON</button>
            <button className="dBtn" style={{ flex:1, height:22, borderRadius:4, cursor:'pointer', fontSize:8, fontFamily:'var(--dj-mono)', border:'1px solid #1a1e2e', background:'#060810', color:'#2a3558' }}>TALK OVER</button>
          </div>

          {/* Spectrum bar */}
          <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:22, overflow:'hidden' }}>
            {Array.from({length:30}).map((_,i)=>(
              <div key={i} style={{ flex:1, height:'100%', background:'rgba(255,255,255,0.025)', borderRadius:1, display:'flex', alignItems:'flex-end', overflow:'hidden' }}>
                <div className={`dj-sp${i%8}`} style={{ width:'100%', background:c, borderRadius:1, animationDelay:`${i*0.05}s` }}/>
              </div>
            ))}
          </div>

          {/* BPM display */}
          <div style={{ background:'#060910', borderRadius:5, padding:'4px', border:`1px solid ${c}22`, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:18, color:c, fontWeight:700, lineHeight:1 }}>{D('L').bpm.toFixed(1)}</div>
            <div style={{ fontSize:6, color:'#1a2a40', fontFamily:'var(--dj-mono)', letterSpacing:1 }}>MASTER BPM</div>
          </div>
        </div>

        {/* Right deck */}
        <div style={{ flex:1, padding:'8px 8px 8px 6px', overflow:'auto', display:'flex', flexDirection:'column', gap:5 }}>
          {renderDeck('R')}
        </div>

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
