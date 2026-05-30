import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/useApp.js';
import XDJRRController from './XDJRRController';
import defaultDDJ from '../assets/ddj800.png';

/* ══════════════════════════════════════════════════════════════════════════
   RealImageJog — canvas overlay on DDJ photo
══════════════════════════════════════════════════════════════════════════ */
function RealImageJog({ decks, playing, onToggle }) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);
  const animRef   = useRef(null);
  const anglesRef = useRef({ L: 0, R: 0 });
  const dragRef   = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const wheelsRef = useRef({ L: { xFrac:0.198, yFrac:0.485, rFrac:0.155 }, R: { xFrac:0.802, yFrac:0.485, rFrac:0.155 } });
  const pxRef = useRef({ L:{cx:0,cy:0,r:0}, R:{cx:0,cy:0,r:0} });

  const updatePx = useCallback(() => {
    const img = imgRef.current; if (!img) return;
    for (const s of ['L','R']) {
      const w = wheelsRef.current[s];
      pxRef.current[s] = { cx: img.naturalWidth*w.xFrac, cy: img.naturalHeight*w.yFrac, r: Math.min(img.naturalWidth,img.naturalHeight)*w.rFrac };
    }
  }, []);

  useEffect(() => {
    if (defaultDDJ) {
      const image = new window.Image();
      image.onload = () => { imgRef.current=image; const canvas=canvasRef.current; if(canvas){canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;} updatePx(); setImgLoaded(true); };
      image.src = defaultDDJ;
    }
  }, [updatePx]);

  const drawFrame = useCallback(() => {
    const canvas=canvasRef.current; const img=imgRef.current;
    if(!canvas||!img||!imgLoaded) return;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    const W=img.naturalWidth, H=img.naturalHeight;
    for (const s of ['L','R']) {
      const {cx,cy,r}=pxRef.current[s]; const angle=anglesRef.current[s]; const isPlaying=playing[s];
      ctx.save(); ctx.translate(cx,cy); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.clip();
      ctx.fillStyle='rgba(0,0,0,0.58)'; ctx.fill(); ctx.rotate(angle);
      for(let i=0;i<36;i++){const a=i*Math.PI*2/36;ctx.strokeStyle=i%3===0?'rgba(255,255,255,0.78)':'rgba(255,255,255,0.18)';ctx.lineWidth=i%3===0?Math.max(1.5,r*0.013):Math.max(0.7,r*0.007);ctx.beginPath();ctx.moveTo(Math.cos(a)*r*0.82,Math.sin(a)*r*0.82);ctx.lineTo(Math.cos(a)*r*0.97,Math.sin(a)*r*0.97);ctx.stroke();}
      ctx.restore();
      ctx.save(); ctx.translate(cx,cy); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
      ctx.strokeStyle=isPlaying?'rgba(232,160,32,0.9)':'rgba(70,70,70,0.45)'; ctx.lineWidth=Math.max(2,r*0.026);
      if(isPlaying){ctx.shadowBlur=18;ctx.shadowColor='#e8a020';} ctx.stroke(); ctx.shadowBlur=0;
      const sr=r*0.37; ctx.beginPath(); ctx.arc(0,0,sr,0,Math.PI*2); ctx.fillStyle='rgba(4,12,24,0.92)'; ctx.fill();
      ctx.strokeStyle=isPlaying?'rgba(91,155,213,0.9)':'rgba(40,40,60,0.7)'; ctx.lineWidth=Math.max(1,r*0.015); ctx.stroke();
      const fs=Math.max(8,r*0.1); ctx.textAlign='center';
      ctx.fillStyle=isPlaying?'#5b9bd5':'#555'; ctx.font=`bold ${fs*0.65}px monospace`; ctx.fillText('BPM',0,-fs*0.8);
      ctx.fillStyle='#fff'; ctx.font=`bold ${fs}px monospace`; ctx.fillText((decks?decks[s]:{bpm:128}).bpm?.toFixed(1)||'128.0',0,fs*0.2);
      ctx.fillStyle=isPlaying?'#e8a020':'#333'; ctx.font=`${fs*0.6}px monospace`; ctx.fillText('DECK '+(s==='L'?'1':'2'),0,fs*1.1);
      ctx.beginPath(); ctx.arc(0,0,r*0.045,0,Math.PI*2); ctx.fillStyle='#1a1a1a'; ctx.fill();
      ctx.restore();
    }
  }, [imgLoaded, editMode, playing, decks]);

  useEffect(() => {
    const loop=()=>{ if(playing.L) anglesRef.current.L+=0.038; if(playing.R) anglesRef.current.R+=0.038; drawFrame(); animRef.current=requestAnimationFrame(loop); };
    animRef.current=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(animRef.current);
  }, [playing, drawFrame]);

  const toCanvas=(e)=>{ const canvas=canvasRef.current; if(!canvas) return{x:0,y:0}; const rect=canvas.getBoundingClientRect(); const touch=e.touches?e.touches[0]:e; const img=imgRef.current; return{x:(touch.clientX-rect.left)*(img.naturalWidth/rect.width),y:(touch.clientY-rect.top)*(img.naturalHeight/rect.height)}; };
  const onDown=(e)=>{ const{x,y}=toCanvas(e); for(const s of['L','R']){const{cx,cy,r}=pxRef.current[s];if(Math.hypot(x-cx,y-cy)<r){onToggle(s);return;}} };

  const loadFile=(file)=>{ if(!file||!file.type.startsWith('image/')) return; const url=URL.createObjectURL(file); const image=new window.Image(); image.onload=()=>{imgRef.current=image;const canvas=canvasRef.current;if(canvas){canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;}updatePx();setImgLoaded(true);}; image.src=url; };

  return(
    <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'center',width:'100%'}}>
      {!imgLoaded?(
        <label style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',width:'100%',minHeight:140,borderRadius:10,cursor:'pointer',border:'2px dashed #2a2a3a',background:'#080a12',color:'#555',fontSize:12,gap:6}}>
          <span style={{fontSize:26}}>🎛</span>
          <span>Drop your DDJ photo here or click to browse</span>
          <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadFile(e.target.files[0])}/>
        </label>
      ):(
        <>
          <canvas ref={canvasRef} style={{width:'100%',borderRadius:8,cursor:'pointer'}} onMouseDown={onDown} onTouchStart={e=>{e.preventDefault();onDown(e);}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();loadFile(e.dataTransfer.files[0]);}}/>
          <label style={{padding:'3px 10px',borderRadius:5,cursor:'pointer',fontSize:9,fontFamily:'var(--dj-mono)',letterSpacing:1,border:'1px solid #2a2a3a',background:'#0c0e16',color:'#555'}}>
            Change Image <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadFile(e.target.files[0])}/>
          </label>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CSS
══════════════════════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Exo+2:wght@400;600;700&display=swap');
  :root { --dj-bg:#07090d; --dj-panel:#0d1018; --dj-border:#1b1f2e; --dj-accent:#e8a020; --dj-green:#1ed760; --dj-red:#e03c3c; --dj-blue:#3a8fff; --dj-text:#cdd2e0; --dj-muted:#38405a; --dj-mono:'Share Tech Mono',monospace; --dj-orb:'Orbitron',sans-serif; --dj-sans:'Exo 2',sans-serif; }
  .djp * { box-sizing:border-box; margin:0; padding:0; }
  .djp { font-family:var(--dj-sans); background:var(--dj-bg); color:var(--dj-text); display:flex; flex-direction:column; overflow:hidden; margin:-2rem; height:calc(100vh - 80px); position:relative; }
  .djp button:focus,.djp input:focus,.djp select:focus { outline:none; }
  .djp ::-webkit-scrollbar { width:3px; }
  .djp ::-webkit-scrollbar-thumb { background:var(--dj-border); border-radius:2px; }
  @keyframes djFadeIn   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes djBlink    { 0%,100%{opacity:1} 50%{opacity:.15} }
  @keyframes djSpin     { to{transform:rotate(360deg)} }
  @keyframes djPulse    { 0%,100%{box-shadow:0 0 20px var(--pc,#e8a020)44} 50%{box-shadow:0 0 40px var(--pc,#e8a020)99,0 0 80px var(--pc,#e8a020)33} }
  @keyframes djNameIn   { 0%{opacity:0;transform:scale(.8) translateY(-10px)} 60%{transform:scale(1.04) translateY(2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes djReveal   { from{opacity:0;transform:translateY(60px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes djScanLine { from{top:-100%} to{top:200%} }
  @keyframes sp0{0%,100%{height:22%}50%{height:70%}} @keyframes sp1{0%,100%{height:55%}50%{height:92%}} @keyframes sp2{0%,100%{height:38%}50%{height:74%}} @keyframes sp3{0%,100%{height:72%}50%{height:28%}} @keyframes sp4{0%,100%{height:45%}50%{height:85%}} @keyframes sp5{0%,100%{height:80%}50%{height:18%}} @keyframes sp6{0%,100%{height:60%}50%{height:96%}} @keyframes sp7{0%,100%{height:30%}50%{height:62%}}
  .dj-sp0{animation:sp0 0.9s ease-in-out infinite} .dj-sp1{animation:sp1 0.72s ease-in-out infinite} .dj-sp2{animation:sp2 1.1s ease-in-out infinite} .dj-sp3{animation:sp3 0.83s ease-in-out infinite} .dj-sp4{animation:sp4 1.02s ease-in-out infinite} .dj-sp5{animation:sp5 0.65s ease-in-out infinite} .dj-sp6{animation:sp6 0.97s ease-in-out infinite} .dj-sp7{animation:sp7 1.18s ease-in-out infinite}
  .dBtn{transition:all 0.1s;} .dBtn:hover{filter:brightness(1.25);transform:scale(1.04);} .dBtn:active{transform:scale(0.96);}
`;
function injectCSS() { if(document.getElementById('djp-css')) return; const s=document.createElement('style'); s.id='djp-css'; s.textContent=CSS; document.head.appendChild(s); }

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function buildDJName(user) { if(!user) return 'DJ'; if(user.display_name) return `DJ ${user.display_name.trim()}`; if(user.username) return `DJ ${user.username.trim()}`; return 'DJ'; }

/* ══════════════════════════════════════════════════════════════════════════
   SETUP SCREEN — audio input only
══════════════════════════════════════════════════════════════════════════ */
function SetupScreen({ onConnect }) {
  const { currentUser } = useApp() || {};
  const fullName = buildDJName(currentUser);
  const [audioDevices, setAudioDevices] = useState([]);
  const [audioSrc,     setAudioSrc]     = useState('');
  const [audioLabel,   setAudioLabel]   = useState('');
  const [connecting,   setConnecting]   = useState(false);
  const [permErr,      setPermErr]      = useState(false);

  useEffect(() => {
    async function loadDevices() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        const all    = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter(d => d.kind === 'audioinput');
        setAudioDevices(inputs);
        setPermErr(false);
      } catch { setPermErr(true); }
    }
    loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
  }, []);

  const C = '#e8a020';

  const handleConnect = () => {
    if (!audioSrc) return;
    setConnecting(true);
    setTimeout(() => onConnect({ djName: fullName, audioSrc, audioLabel }), 1600);
  };

  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--dj-bg)', backgroundImage:'radial-gradient(ellipse at 20% 50%, rgba(232,160,32,0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(58,143,255,0.05) 0%, transparent 55%)', overflow:'hidden', position:'relative' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.012) 1px, transparent 1px)', backgroundSize:'44px 44px' }}/>
      <div style={{ position:'absolute', left:0, right:0, height:60, background:'linear-gradient(transparent,rgba(255,255,255,0.018),transparent)', animation:'djScanLine 5s linear infinite', pointerEvents:'none' }}/>

      <div style={{ width:460, animation:'djFadeIn 0.55s ease forwards', position:'relative', zIndex:2 }}>

        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:'var(--dj-orb)', fontSize:28, fontWeight:900, color:C, letterSpacing:4, animation:'djNameIn 0.7s ease forwards' }}>{fullName}</div>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:9, color:'var(--dj-muted)', letterSpacing:3, marginTop:4 }}>COCOSTATION DJ BOOTH</div>
        </div>

        <div style={{ background:'var(--dj-panel)', borderRadius:18, border:`1px solid ${C}33`, padding:'28px 32px 32px', boxShadow:'0 24px 70px rgba(0,0,0,0.75)' }}>
          <div style={{ fontFamily:'var(--dj-mono)', fontSize:8, color:'var(--dj-muted)', letterSpacing:3, marginBottom:12 }}>AUDIO INPUT</div>

          {permErr ? (
            <div style={{ padding:'14px', borderRadius:9, background:'rgba(224,60,60,0.08)', border:'1px solid rgba(224,60,60,0.3)', color:'#e03c3c', fontFamily:'var(--dj-mono)', fontSize:11, textAlign:'center', marginBottom:20 }}>
              Microphone access denied — allow in browser settings and refresh
            </div>
          ) : audioDevices.length === 0 ? (
            <div style={{ padding:'14px', borderRadius:9, background:'rgba(255,255,255,0.03)', border:'1px solid var(--dj-border)', color:'var(--dj-muted)', fontFamily:'var(--dj-mono)', fontSize:11, textAlign:'center', marginBottom:20 }}>
              <span style={{ display:'inline-block', animation:'djSpin 0.9s linear infinite', marginRight:8 }}>⟳</span>
              Detecting audio devices…
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
              {audioDevices.map((dev, i) => {
                const selected = audioSrc === dev.deviceId;
                const label    = dev.label || `Audio Input ${i + 1}`;
                return (
                  <button key={dev.deviceId} onClick={() => { setAudioSrc(dev.deviceId); setAudioLabel(label); }} style={{ padding:'13px 16px', borderRadius:10, cursor:'pointer', textAlign:'left', border:`1.5px solid ${selected ? C : 'var(--dj-border)'}`, background: selected ? `${C}14` : 'rgba(255,255,255,0.025)', color: selected ? C : 'var(--dj-muted)', display:'flex', alignItems:'center', gap:12, transition:'all 0.18s', boxShadow: selected ? `0 0 18px ${C}30` : 'none', fontFamily:'var(--dj-mono)', fontSize:12 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: selected ? C : 'var(--dj-border)', boxShadow: selected ? `0 0 8px ${C}` : 'none', animation: selected ? 'djBlink 1.4s infinite' : 'none', transition:'all 0.2s' }}/>
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
                    {selected && <span style={{ fontSize:8, color:C, letterSpacing:1 }}>SELECTED ✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={handleConnect} disabled={!audioSrc || connecting} style={{ width:'100%', padding:'16px', borderRadius:11, cursor: audioSrc && !connecting ? 'pointer' : 'not-allowed', fontFamily:'var(--dj-orb)', fontSize:13, fontWeight:700, letterSpacing:4, border:`2px solid ${audioSrc ? C : 'var(--dj-border)'}`, background: audioSrc ? `linear-gradient(135deg, ${C}22, ${C}0a)` : 'rgba(255,255,255,0.02)', color: audioSrc ? C : 'var(--dj-muted)', boxShadow: audioSrc ? `0 0 30px ${C}45` : 'none', '--pc':C, animation: audioSrc && !connecting ? 'djPulse 2.5s ease-in-out infinite' : 'none', transition:'all 0.25s' }}>
            {connecting ? (
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <span style={{ display:'inline-block', width:12, height:12, border:`2px solid ${C}`, borderTopColor:'transparent', borderRadius:'50%', animation:'djSpin 0.7s linear infinite' }}/>
                CONNECTING…
              </span>
            ) : '🎧  ENTER BOOTH'}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:14, fontFamily:'var(--dj-mono)', fontSize:7, color:'var(--dj-muted)', letterSpacing:2 }}>COCOSTATION DJ BOOTH v2.0 · {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DJ STREAM CONTROLLER — slim session bar + full XDJ-RR controller
══════════════════════════════════════════════════════════════════════════ */
const DEFAULT_DECK_COLORS = { a:'#00d4ff', b:'#2ed573', c:'#a55eea', d:'#fd9644', e:'#ff4757', f:'#ffd32a' };

function DJStreamController({ session }) {
  const accentColor = '#e8a020';

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', animation:'djReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards' }}>

      {/* ── Slim session bar ── */}
      <div style={{ background:'#06080f', borderBottom:`1px solid ${accentColor}33`, padding:'5px 18px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
        <div style={{ fontFamily:'var(--dj-orb)', fontSize:14, fontWeight:900, color:accentColor, letterSpacing:3 }}>DJ BOOTH</div>
        <div style={{ width:1, height:24, background:`${accentColor}22` }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:`${accentColor}22`, border:`1px solid ${accentColor}44`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:900, color:accentColor }}>
            {session.djName.replace(/^DJ\s*/i,'')[0]?.toUpperCase()||'D'}
          </div>
          <div>
            <div style={{ fontFamily:'var(--dj-orb)', fontSize:11, fontWeight:700, color:'#d0d8f0', letterSpacing:1 }}>{session.djName}</div>
            <div style={{ fontSize:7, color:`${accentColor}bb`, fontFamily:'var(--dj-mono)', letterSpacing:1 }}>
              🎤 {session.audioLabel||session.audioSrc}
            </div>
          </div>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', gap:3, alignItems:'center' }}>
          {[...Array(8)].map((_,i) => (
            <div key={i} className={`dj-sp${i%8}`} style={{ width:3, background:accentColor, borderRadius:1, opacity:0.7 }}/>
          ))}
        </div>
        <div style={{ width:1, height:24, background:`${accentColor}22` }}/>
        <button onClick={() => window.location.reload()} style={{ padding:'3px 10px', borderRadius:5, cursor:'pointer', fontFamily:'var(--dj-mono)', fontSize:8, letterSpacing:1, border:`1px solid ${accentColor}33`, background:'transparent', color:'#3a4060' }}>✕ EXIT</button>
      </div>

      {/* ── Full XDJ-RR controller fills the rest ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <XDJRRController session={session}/>
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
      {!session ? <SetupScreen onConnect={handleConnect}/> : <DJStreamController session={session}/>}
    </div>
  );
}
