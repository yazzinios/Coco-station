import React, { useState, useEffect, useRef, useCallback } from 'react';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt   = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

function VUMeter({ color, level, height = 70, bars = 12 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column-reverse', gap:2, height, width: 8 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const c = i >= bars-2 ? '#e03c3c' : i >= bars-4 ? '#f5d020' : color;
        const active = (i / bars) < level;
        return (
          <div key={i} style={{
            width:'100%', height:`${100/bars}%`, background: active ? c : 'rgba(255,255,255,0.08)',
            borderRadius:1, boxShadow: active ? `0 0 6px ${c}88` : 'none',
            transition: 'background 0.05s'
          }}/>
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
      {label && <span style={{ fontSize:7, color:'#999', fontFamily:'var(--dj-sans)', fontWeight:600, letterSpacing:'0.5px' }}>{label}</span>}
      <svg width={size} height={size} onMouseDown={onMD} style={{ cursor:'ns-resize', flexShrink:0 }}>
        <circle cx={cx} cy={cy} r={r+3} fill="#0d1015" stroke="#1a1e28" strokeWidth={1}/>
        <circle cx={cx} cy={cy} r={r}   fill="#11151c" stroke="#2a3040" strokeWidth={1}/>
        <circle cx={cx} cy={cy} r={r-4} fill="#050608"/>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="#fff" strokeWidth={2} strokeLinecap="round"/>
        {centerZero && <rect x={cx-1} y={cy-r-3} width={2} height={4} fill="#fff" opacity={0.5}/>}
      </svg>
    </div>
  );
}

function VertFader({ value, onChange, height = 100 }) {
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
      width:14, height, background:'#050608', borderRadius:3,
      border:'1px solid #1a1e28', position:'relative', cursor:'ns-resize', flexShrink:0,
    }}>
      <div style={{ position:'absolute', left:6, right:6, top:2, bottom:2, background:'rgba(255,255,255,0.05)', borderRadius:1 }}/>
      <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.15)' }}/>
      <div style={{ position:'absolute', left:'50%', top:`${(1-value)*100}%`, transform:'translate(-50%,-50%)', width:22, height:12, borderRadius:2, background:'linear-gradient(180deg,#2a3040,#11151c)', border:'1px solid #3a4050', cursor:'ns-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:16, height:2, background:'#fff', opacity:0.8, borderRadius:1 }}/>
      </div>
    </div>
  );
}

function PitchSlider({ value, onChange, height = 100 }) {
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
  return (
    <div ref={ref} onMouseDown={onMD} style={{ width:12, height, background:'#050608', borderRadius:3, border:'1px solid #1a1e28', position:'relative', cursor:'ns-resize' }}>
      <div style={{ position:'absolute', left:5, right:5, top:2, bottom:2, background:'rgba(255,255,255,0.05)', borderRadius:1 }}/>
      <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(255,255,255,0.15)' }}/>
      <div style={{ position:'absolute', left:'50%', top:`${value*100}%`, transform:'translate(-50%,-50%)', width:20, height:10, borderRadius:2, background:'linear-gradient(180deg,#2a3040,#11151c)', border:'1px solid #3a4050', cursor:'ns-resize' }}>
        <div style={{ width:'100%', height:1, background:'#fff', marginTop:4, opacity:0.6 }}/>
      </div>
    </div>
  );
}

function RoundBtn({ active, onClick, color, label, size=36, icon }) {
  return (
    <button onClick={onClick} style={{
      width:size, height:size, borderRadius:'50%', cursor:'pointer',
      background: active ? `linear-gradient(135deg, ${color}cc, ${color}66)` : 'linear-gradient(135deg, #1a1e28, #0d1015)',
      border: `2px solid ${active ? color : '#2a3040'}`,
      color: active ? '#fff' : color,
      boxShadow: active ? `0 0 15px ${color}88, inset 0 0 10px rgba(255,255,255,0.5)` : '0 4px 6px rgba(0,0,0,0.3)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      transition:'all 0.15s', padding:0
    }}>
      {icon && <span style={{ fontSize:size*0.4, lineHeight:1, marginBottom:label?2:0 }}>{icon}</span>}
      {label && <span style={{ fontSize:size*0.2, fontFamily:'var(--dj-sans)', fontWeight:700 }}>{label}</span>}
    </button>
  );
}

export default function XDJRRController({ session }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const [decks, setDecks] = useState({
    L: { playing:true,  bpm:124.0, pitch:0.5, volume:0.82, eq:{ hi:0.5, mid:0.5, lo:0.5 }, color:0.5, trim:0.68, track:'Cant Sleep', artist:'Above & Beyond', elapsed:296, progress:0.46, hc:[true,false,false,false], loop:false, cue:false },
    R: { playing:false, bpm:124.0, pitch:0.5, volume:0.75, eq:{ hi:0.5, mid:0.5, lo:0.5 }, color:0.5, trim:0.62, track:'Lost (Original Mix)', artist:'Parallax', elapsed:135, progress:0.32, hc:[false,true,false,false], loop:false, cue:false },
  });
  
  const [xfader, setXfader] = useState(0.5);
  const [colorFx, setColorFx] = useState('FILTER'); // NOISE, PITCH, DUB ECHO, FILTER

  const jogLRef = useRef(null);
  const jogRRef = useRef(null);
  const wvLRef = useRef(null);
  const wvRRef = useRef(null);
  
  const jogAngle = useRef({ L:0, R:0 });
  const waveOff = useRef({ L:0, R:20 });
  const animRef = useRef(null);
  const playingRef = useRef({ L:true, R:false });

  const sD = (s, p) => setDecks(d => ({ ...d, [s]: typeof p === 'function' ? p(d[s]) : { ...d[s], ...p } }));

  useEffect(() => {
    playingRef.current = { L: decks.L.playing, R: decks.R.playing };
  }, [decks.L.playing, decks.R.playing]);

  useEffect(() => {
    const id = setInterval(() => setDecks(d => {
      const u = {};
      for (const s of ['L','R']) if (d[s].playing) u[s] = { ...d[s], elapsed: d[s].elapsed+1, progress: clamp(d[s].progress+0.0003,0,0.999) };
      return { ...d, ...u };
    }), 1000);
    return () => clearInterval(id);
  }, []);

  const drawJog = useCallback((canvas, angle, playing, bpm) => {
    if (!canvas) return;
    const W=200, H=200, cx=W/2, cy=H/2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,W,H);

    ctx.beginPath(); ctx.arc(cx,cy,95,0,Math.PI*2);
    ctx.fillStyle='#080a0c'; ctx.fill();
    ctx.strokeStyle='#1a1e28'; ctx.lineWidth=2; ctx.stroke();

    ctx.beginPath(); ctx.arc(cx,cy,85,0,Math.PI*2);
    const pg=ctx.createRadialGradient(cx,cy,20,cx,cy,85);
    pg.addColorStop(0,'#11151c'); pg.addColorStop(1,'#050608');
    ctx.fillStyle=pg; ctx.fill();

    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
    ctx.beginPath(); ctx.arc(0,0,85,0,Math.PI*2);
    ctx.strokeStyle='#2a3040'; ctx.lineWidth=1; ctx.stroke();
    for(let i=0;i<32;i++){
      const a = (i/32)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*60, Math.sin(a)*60);
      ctx.lineTo(Math.cos(a)*85, Math.sin(a)*85);
      ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath(); ctx.arc(cx,cy,38,0,Math.PI*2);
    ctx.fillStyle='#020304'; ctx.fill();
    ctx.strokeStyle=playing?'#1a8cff':'#333'; ctx.lineWidth=3;
    if(playing){ ctx.shadowBlur=10; ctx.shadowColor='#1a8cff'; }
    ctx.stroke(); ctx.shadowBlur=0;

    ctx.save(); ctx.translate(cx,cy);
    ctx.fillStyle='#fff';
    ctx.font='bold 10px "Exo 2", sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(bpm.toFixed(1), 0, -8);
    ctx.fillStyle='#666'; ctx.font='7px "Exo 2", sans-serif';
    ctx.fillText('BPM', 0, 4);
    
    if(playing){
      ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0,-25); ctx.lineTo(0,-35);
      ctx.strokeStyle='#1a8cff'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.stroke();
    }
    ctx.restore();

  }, []);

  const drawWaveform = useCallback((canvas, offset, playing, color) => {
    if (!canvas) return;
    const W=canvas.width, H=canvas.height;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#050608'; ctx.fillRect(0,0,W,H);
    const bars=Math.floor(W/3);
    for(let i=0;i<bars;i++){
      const x=i*3;
      const s=(i+offset)*0.2;
      const amp=Math.abs(Math.sin(s)*12+Math.sin(s*0.4)*6);
      ctx.fillStyle = i/bars < 0.5 ? color : color+'66';
      ctx.fillRect(x,H/2-amp,2,amp*2);
    }
    ctx.fillStyle='#fff'; ctx.fillRect(W/2,0,2,H);
  }, []);

  useEffect(() => {
    const loop = () => {
      if(jogLRef.current){
        jogAngle.current.L += playingRef.current.L ? 0.04 : 0;
        drawJog(jogLRef.current, jogAngle.current.L, playingRef.current.L, decks.L.bpm);
      }
      if(jogRRef.current){
        jogAngle.current.R += playingRef.current.R ? 0.04 : 0;
        drawJog(jogRRef.current, jogAngle.current.R, playingRef.current.R, decks.R.bpm);
      }
      if(playingRef.current.L) waveOff.current.L += 0.8;
      if(playingRef.current.R) waveOff.current.R += 0.8;
      if(wvLRef.current) drawWaveform(wvLRef.current, waveOff.current.L, playingRef.current.L, '#1a8cff');
      if(wvRRef.current) drawWaveform(wvRRef.current, waveOff.current.R, playingRef.current.R, '#ff3366');

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawJog, drawWaveform, decks.L.bpm, decks.R.bpm]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.log(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const renderDeck = (s) => {
    const dk = decks[s];
    const isL = s === 'L';
    
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'10px 20px', gap:15, position:'relative' }}>
        
        {/* Top Section: Loop & USB */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ display:'flex', gap:6 }}>
                <RoundBtn active={dk.loop} onClick={()=>sD(s,{loop:!dk.loop})} color="#ffaa00" label="IN" size={32}/>
                <RoundBtn active={false} color="#ffaa00" label="OUT" size={32}/>
              </div>
              <span style={{ fontSize:9, color:'#888', fontWeight:600 }}>IN / -4BEAT &nbsp; OUT</span>
            </div>
            <RoundBtn active={false} color="#ffaa00" label="RELOOP" size={24}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:10, color:'#aaa', fontWeight:700 }}>JOG MODE</span>
            <button style={{ background:'#1a8cff22', border:'1px solid #1a8cff', color:'#1a8cff', borderRadius:3, padding:'2px 8px', fontSize:10, fontWeight:700 }}>VINYL</button>
          </div>
        </div>

        {/* Jog Wheel & Pitch */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, flex:1 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
            <RoundBtn active={false} color="#888" icon="⏮" size={28}/>
            <RoundBtn active={false} color="#888" icon="⏭" size={28}/>
            <span style={{ fontSize:8, color:'#666' }}>SEARCH</span>
          </div>
          
          <canvas ref={isL ? jogLRef : jogRRef} width={200} height={200} style={{ borderRadius:'50%' }}/>
          
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
            <RoundBtn active={dk.playing||decks[isL?'R':'L'].playing} color="#1ed760" label="SYNC" size={28}/>
            <span style={{ fontSize:8, color:'#666', marginBottom:10 }}>BEAT SYNC</span>
            <PitchSlider value={dk.pitch} onChange={v=>sD(s,{pitch:v})} height={120} />
            <span style={{ fontSize:9, color:'#888', fontWeight:600 }}>TEMPO</span>
          </div>
        </div>

        {/* Bottom Section: Play/Cue & Pads */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:20 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <RoundBtn active={dk.cue} onClick={()=>{sD(s,{cue:true}); setTimeout(()=>sD(s,{cue:false}),200);}} color="#ffaa00" label="CUE" size={44}/>
            <RoundBtn active={dk.playing} onClick={()=>sD(s,{playing:!dk.playing})} color="#1ed760" icon={dk.playing?"⏸":"▶"} size={52}/>
          </div>
          
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ display:'flex', gap:2 }}>
              {['HOT CUE','BEAT LOOP','SLIP LOOP','BEAT JUMP'].map((l,i)=>(
                <div key={l} style={{ flex:1, textAlign:'center', fontSize:8, color:'#888', fontWeight:700, paddingBottom:2, borderBottom:`2px solid ${i===0?'#1a8cff':'#333'}` }}>{l}</div>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {dk.hc.map((active, i)=>(
                <button key={i} onClick={()=>sD(s, d=>{const h=[...d.hc];h[i]=!h[i];return {hc:h}})} style={{
                  flex:1, height:36, borderRadius:4, cursor:'pointer',
                  background: active ? '#1a8cff' : '#0a0d12',
                  border: `2px solid ${active ? '#1a8cff' : '#1a8cff44'}`,
                  boxShadow: active ? '0 0 12px #1a8cff88' : 'none',
                  transition: 'all 0.1s',
                  color: active ? '#fff' : '#1a8cff',
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: 'var(--dj-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {String.fromCharCode(65 + i)}
                </button>
              ))}
            </div>
          </div>
        </div>
        
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{
      width: '100%', height: isFullscreen ? '100vh' : 'calc(100vh - 80px)',
      background: '#030405', fontFamily: 'var(--dj-sans)', color: '#fff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <div style={{ display:'flex', justifyContent:'center', padding:'10px 20px', background:'#06080c', borderBottom:'2px solid #111' }}>
        
        <div style={{ flex:1, display:'flex', alignItems:'center' }}>
          <div style={{ display:'flex', flexDirection:'column' }}>
            <span style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:2 }}>Pioneer DJ</span>
            <span style={{ fontSize:16, color:'#888', letterSpacing:1 }}>ALL-IN-ONE DJ SYSTEM XDJ-RR</span>
          </div>
        </div>

        <div style={{ width: 600, height: 200, background:'#000', borderRadius:6, border:'2px solid #222', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>
          <div style={{ display:'flex', background:'#111', padding:'4px 10px', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #333' }}>
            <div style={{ display:'flex', gap:10 }}>
              <button style={{ background:'transparent', border:'none', color:'#1a8cff', fontSize:10, fontWeight:700 }}>BROWSE</button>
              <button style={{ background:'transparent', border:'none', color:'#888', fontSize:10 }}>TAG LIST</button>
              <button style={{ background:'transparent', border:'none', color:'#888', fontSize:10 }}>INFO</button>
              <button style={{ background:'transparent', border:'none', color:'#888', fontSize:10 }}>MENU</button>
            </div>
            <span style={{ fontSize:10, color:'#888', fontWeight:700 }}>{fmt(decks.L.elapsed)}</span>
          </div>
          
          <div style={{ flex:1, display:'flex', flexDirection:'column', padding:10, gap:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:16, height:16, background:'#1a8cff', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, borderRadius:2 }}>1</span>
                <span style={{ fontSize:14, fontWeight:600 }}>{decks.L.track}</span>
              </div>
              <div style={{ display:'flex', gap:15, alignItems:'baseline' }}>
                <span style={{ fontSize:10, color:'#1a8cff' }}>{decks.L.bpm.toFixed(1)}</span>
                <span style={{ fontSize:18, fontWeight:700 }}>{decks.L.bpm.toFixed(1)}</span>
              </div>
            </div>
            
            <div style={{ flex:1, position:'relative', borderTop:'1px solid #222', borderBottom:'1px solid #222', padding:'5px 0' }}>
              <canvas ref={wvLRef} width={580} height={40} style={{ display:'block', marginBottom:2 }}/>
              <canvas ref={wvRRef} width={580} height={40} style={{ display:'block' }}/>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:16, height:16, background:'#ff3366', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, borderRadius:2 }}>2</span>
                <span style={{ fontSize:14, fontWeight:600 }}>{decks.R.track}</span>
              </div>
              <div style={{ display:'flex', gap:15, alignItems:'baseline' }}>
                <span style={{ fontSize:10, color:'#ff3366' }}>{decks.R.bpm.toFixed(1)}</span>
                <span style={{ fontSize:18, fontWeight:700 }}>{decks.R.bpm.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', gap:15 }}>
           <button onClick={toggleFullscreen} style={{ background:'#1a1e28', color:'#fff', border:'none', padding:'6px 12px', borderRadius:4, cursor:'pointer', fontSize:10, fontWeight:700 }}>
             {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
           </button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex' }}>
        {renderDeck('L')}

        <div style={{ width: 280, background:'#080a0c', borderLeft:'2px solid #111', borderRight:'2px solid #111', display:'flex', flexDirection:'column', padding:'15px 10px' }}>
          
          <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #222', paddingBottom:10 }}>
            {['L','R'].map((s, i) => (
              <div key={s} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                <Knob size={28} value={decks[s].trim} onChange={v=>sD(s,{trim:v})} color="#fff" label="TRIM"/>
                <Knob size={28} value={decks[s].eq.hi} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,hi:v}}))} color="#fff" label="HI" centerZero/>
                <Knob size={28} value={decks[s].eq.mid} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,mid:v}}))} color="#fff" label="MID" centerZero/>
                <Knob size={28} value={decks[s].eq.lo} onChange={v=>sD(s,dk=>({...dk,eq:{...dk.eq,lo:v}}))} color="#fff" label="LOW" centerZero/>
                <Knob size={32} value={decks[s].color} onChange={v=>sD(s,{color:v})} color="#1a8cff" label="COLOR" centerZero/>
                
                <RoundBtn active={false} color="#ffaa00" label="CUE" size={28}/>
                
                <div style={{ display:'flex', gap:5, height:120, alignItems:'center' }}>
                  <VUMeter color="#0f0" level={decks[s].playing ? 0.6 + Math.random()*0.2 : 0.05} height={100} bars={10}/>
                  <VertFader value={decks[s].volume} onChange={v=>sD(s,{volume:v})} height={120}/>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding:'10px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:10, color:'#888', fontWeight:700 }}>SOUND COLOR FX</span>
            <div style={{ display:'flex', gap:8 }}>
              {['DUB ECHO','PITCH','NOISE','FILTER'].map(f=>(
                <button key={f} onClick={()=>setColorFx(f)} style={{
                  padding:'4px 8px', borderRadius:3, border:`1px solid ${colorFx===f?'#1a8cff':'#333'}`,
                  background:colorFx===f?'#1a8cff33':'#111', color:colorFx===f?'#1a8cff':'#888',
                  fontSize:9, fontWeight:700, cursor:'pointer'
                }}>{f}</button>
              ))}
            </div>
            
            <div style={{ width:'100%', marginTop:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:10, color:'#fff', fontWeight:700 }}>A</span>
                <span style={{ fontSize:9, color:'#888' }}>CROSSFADER</span>
                <span style={{ fontSize:10, color:'#fff', fontWeight:700 }}>B</span>
              </div>
              <div style={{ display:'flex', justifyContent:'center' }}>
                 <div style={{ width:180, position:'relative' }}>
                    <div style={{ height:6, background:'#050608', borderRadius:3, border:'1px solid #1a1e28' }}/>
                    <div style={{ position:'absolute', top:-8, left:`${xfader*100}%`, transform:'translateX(-50%)', width:24, height:22, background:'linear-gradient(180deg,#2a3040,#11151c)', border:'1px solid #3a4050', borderRadius:3, cursor:'ew-resize' }}/>
                 </div>
              </div>
            </div>
          </div>
          
        </div>

        {renderDeck('R')}
      </div>
    </div>
  );
}
