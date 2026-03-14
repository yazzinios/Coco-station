import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';

// ─── Browser → Server mic streaming via WebSocket ───────────────────────────
// Captures browser mic, resamples to 16-bit PCM 44100 Hz mono,
// and streams raw chunks to the API /ws/mic endpoint.
// The server pipes those chunks into ffmpeg which pushes RTMP to MediaMTX.
// ─────────────────────────────────────────────────────────────────────────────

export default function OnAirButton() {
  const { mic, toast, api, settings } = useApp();
  const duckingPercent = settings?.mic_ducking_percent ?? 20;
  const [targets, setTargets] = useState(['ALL']);
  const [loading, setLoading] = useState(false);
  const [micLevel, setMicLevel] = useState(0);       // 0-100 VU meter
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [micDevices, setMicDevices] = useState([]);

  // Refs for audio pipeline
  const wsRef          = useRef(null);
  const streamRef      = useRef(null);
  const audioCtxRef    = useRef(null);
  const processorRef   = useRef(null);
  const analyserRef    = useRef(null);
  const animFrameRef   = useRef(null);

  // Enumerate mic devices on mount
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devs => setMicDevices(devs.filter(d => d.kind === 'audioinput')))
      .catch(() => {});
  }, []);

  const isOnAir = mic.active;

  const toggleTarget = (t) => {
    if (t === 'ALL') { setTargets(['ALL']); return; }
    const filtered = targets.filter(x => x !== 'ALL');
    if (filtered.includes(t)) {
      const next = filtered.filter(x => x !== t);
      setTargets(next.length === 0 ? ['ALL'] : next);
    } else {
      setTargets([...filtered, t]);
    }
  };

  // ── VU meter animation ───────────────────────────────────────────────────
  const startVU = (analyser) => {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
      setMicLevel(Math.min(100, Math.round((avg / 255) * 100 * 2.5)));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopVU = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setMicLevel(0);
  };

  // ── Start streaming ──────────────────────────────────────────────────────
  const startMic = async () => {
    // 1. Request mic permission
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      });
    } catch (err) {
      toast.error('Microphone access denied: ' + err.message);
      return false;
    }
    streamRef.current = stream;

    // 2. Open WebSocket to server mic endpoint
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/mic`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('WebSocket /ws/mic failed to connect'));
      setTimeout(() => reject(new Error('WebSocket /ws/mic timeout')), 4000);
    });

    // 3. Send mic_start control message
    ws.send(JSON.stringify({ type: 'mic_start', targets, ducking: duckingPercent }));

    // 4. Set up Web Audio pipeline: mic → analyser → ScriptProcessor → WS
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    audioCtxRef.current = ctx;

    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // ScriptProcessor to grab raw PCM and send over WS
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Convert Float32 → Int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }
      ws.send(int16.buffer);
    };

    source.connect(analyser);
    source.connect(processor);
    processor.connect(ctx.destination);

    startVU(analyser);
    return true;
  };

  // ── Stop streaming ───────────────────────────────────────────────────────
  const stopMic = () => {
    stopVU();
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (audioCtxRef.current)  { audioCtxRef.current.close();       audioCtxRef.current = null;  }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (wsRef.current)        { wsRef.current.close();              wsRef.current = null;         }
  };

  // ── Toggle On Air ────────────────────────────────────────────────────────
  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isOnAir) {
        stopMic();
        await api.micOff();
        toast.info('Off Air');
      } else {
        const ok = await startMic();
        if (!ok) { setLoading(false); return; }
        await api.micOn(targets);
        toast.success(`🎙 On Air → ${targets.join(', ')}`);
      }
    } catch (err) {
      stopMic();
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clean up if component unmounts while on air
  useEffect(() => () => stopMic(), []);

  // ── VU bar segments ──────────────────────────────────────────────────────
  const VU_BARS = 12;
  const vuBars = Array.from({ length: VU_BARS }, (_, i) => {
    const threshold = (i / VU_BARS) * 100;
    const active = micLevel >= threshold;
    const color = i < 7 ? '#2ed573' : i < 10 ? '#ffa502' : '#ff4757';
    return { active, color };
  });

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', textAlign: 'center' }}>

      {/* Title */}
      <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
        🎙 On Air
      </h3>

      {/* Mic device selector */}
      {micDevices.length > 0 && (
        <select
          value={selectedDeviceId}
          onChange={e => setSelectedDeviceId(e.target.value)}
          disabled={isOnAir}
          style={{
            width: '100%', marginBottom: '1rem', padding: '0.45rem 0.7rem',
            background: 'rgba(0,0,0,0.35)', color: 'white',
            border: '1px solid var(--panel-border)', borderRadius: '8px',
            fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none',
            opacity: isOnAir ? 0.5 : 1,
          }}
        >
          <option value="">Default Microphone</option>
          {micDevices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      {/* VU Meter */}
      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'flex-end', height: '28px', marginBottom: '1rem' }}>
        {vuBars.map((bar, i) => (
          <div key={i} style={{
            width: '14px',
            height: `${40 + i * 5}%`,
            background: bar.active ? bar.color : 'rgba(255,255,255,0.08)',
            borderRadius: '2px',
            transition: 'background 0.05s',
          }} />
        ))}
      </div>

      {/* Target selector */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {['ALL', 'A', 'B', 'C', 'D'].map(t => {
          const isSelected = targets.includes(t);
          return (
            <button key={t} onClick={() => !isOnAir && toggleTarget(t)} style={{
              padding: '0.35rem 0.8rem',
              background: isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
              color: isSelected ? '#000' : 'var(--text-primary)',
              border: isSelected ? 'none' : '1px solid var(--panel-border)',
              borderRadius: '20px', cursor: isOnAir ? 'default' : 'pointer',
              fontWeight: '600', fontSize: '0.78rem',
              transition: 'all 0.2s', opacity: isOnAir ? 0.6 : 1,
            }}>
              {t}
            </button>
          );
        })}
      </div>

      {/* ON AIR button */}
      <button
        onClick={handleToggle}
        disabled={loading}
        style={{
          width: '100%', padding: '1.1rem',
          background: isOnAir ? 'rgba(255,71,87,0.18)' : 'rgba(255,255,255,0.05)',
          border: isOnAir ? '2px solid var(--danger)' : '1px solid var(--panel-border)',
          color: isOnAir ? 'var(--danger)' : 'var(--text-primary)',
          borderRadius: '12px', cursor: loading ? 'default' : 'pointer',
          fontWeight: 'bold', fontSize: '1.05rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem',
          boxShadow: isOnAir ? '0 0 30px rgba(255,71,87,0.35)' : 'none',
          transition: 'all 0.3s', opacity: loading ? 0.7 : 1,
          animation: isOnAir ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        {isOnAir ? <Radio size={20} /> : <Mic size={20} />}
        {loading ? 'Please wait…' : isOnAir ? '● ON AIR' : 'GO LIVE'}
      </button>

      <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {isOnAir
          ? `Broadcasting to: ${mic.targets.join(', ')}`
          : 'Select targets, then Go Live'}
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 20px rgba(255,71,87,0.35); }
          50%      { box-shadow: 0 0 45px rgba(255,71,87,0.65); }
        }
      `}</style>
    </div>
  );
}
