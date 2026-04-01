import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Radio, RefreshCw, ChevronDown } from 'lucide-react';
import { useApp } from '../context/useApp';

// ─── Hook: enumerate + watch audio input devices ──────────────────────────────
function useMicDevices() {
  const [devices, setDevices]       = useState([]);
  const [permState, setPermState]   = useState('unknown'); // 'unknown'|'granted'|'denied'|'unavailable'
  const [scanning, setScanning]     = useState(false);

  const enumerate = useCallback(async (withPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setPermState('unavailable');
      return;
    }
    setScanning(true);
    try {
      let stream = null;
      if (withPermission) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setPermState('granted');
        } catch {
          setPermState('denied');
          setScanning(false);
          return;
        }
      }
      const all  = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter(d => d.kind === 'audioinput');
      setDevices(mics);
      // If labels are present, permission is already granted
      if (mics.length > 0 && mics[0].label) setPermState('granted');
      else if (mics.length > 0)              setPermState('unknown');
      if (stream) stream.getTracks().forEach(t => t.stop());
    } catch {
      setPermState('unavailable');
    } finally {
      setScanning(false);
    }
  }, []);

  // Initial enumerate (no permission prompt)
  useEffect(() => { enumerate(false); }, [enumerate]);

  // Listen for device changes (plug/unplug)
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const handler = () => enumerate(false);
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [enumerate]);

  return { devices, permState, scanning, enumerate };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnAirButton() {
  const { mic, toast, api, settings } = useApp();
  const duckingPercent = settings?.mic_ducking_percent ?? 20;

  const [targets,         setTargets]         = useState(['ALL']);
  const [loading,         setLoading]         = useState(false);
  const [micLevel,        setMicLevel]        = useState(0);
  const [selectedId,      setSelectedId]      = useState('');
  const [showDevices,     setShowDevices]      = useState(false);

  const { devices, permState, scanning, enumerate } = useMicDevices();

  const wsRef        = useRef(null);
  const streamRef    = useRef(null);
  const audioCtxRef  = useRef(null);
  const processorRef = useRef(null);
  const analyserRef  = useRef(null);
  const animFrameRef = useRef(null);

  const isOnAir    = mic.active;
  const isBlocked  = permState === 'unavailable';
  const needsPerms = permState === 'unknown' || permState === 'denied';

  // Auto-select first device when list populates
  useEffect(() => {
    if (devices.length > 0 && !selectedId) setSelectedId(devices[0].deviceId);
  }, [devices, selectedId]);

  // Selected device label
  const selectedLabel = devices.find(d => d.deviceId === selectedId)?.label
    || (selectedId ? 'Selected device' : 'Default microphone');

  const toggleTarget = (t) => {
    if (t === 'ALL') { setTargets(['ALL']); return; }
    const filtered = targets.filter(x => x !== 'ALL');
    const next = filtered.includes(t)
      ? filtered.filter(x => x !== t)
      : [...filtered, t];
    setTargets(next.length === 0 ? ['ALL'] : next);
  };

  // ── VU meter ────────────────────────────────────────────────
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

  // ── Start mic stream ────────────────────────────────────────
  const startMic = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedId ? { exact: selectedId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      });
    } catch (err) {
      toast.error('Mic access denied: ' + err.message);
      enumerate(false); // refresh device list
      return false;
    }
    streamRef.current = stream;
    // Refresh device labels now that we have permission
    enumerate(false);

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/ws/mic`;
    const ws    = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    await new Promise((resolve, reject) => {
      ws.onopen  = resolve;
      ws.onerror = () => reject(new Error('WebSocket /ws/mic failed'));
      setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
    });

    // Send mic_start and wait for mic_ready confirmation before streaming audio.
    // This ensures the server has opened the ffmpeg session + applied ducking
    // BEFORE any PCM data (or the API micOn call) fires — preventing the
    // "shoulder" where music ducks too late on the first chunk.
    await new Promise((resolve) => {
      const readyHandler = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'mic_ready') { ws.removeEventListener('message', readyHandler); resolve(); }
        } catch (error) {
          console.debug('[mic_ws] message parse error', error);
        }
      };
      ws.addEventListener('message', readyHandler);
      ws.send(JSON.stringify({ type: 'mic_start', targets, ducking: duckingPercent }));
      // Fallback: don't hang forever if server doesn't send mic_ready
      setTimeout(resolve, 1500);
    });

    const ctx       = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    audioCtxRef.current = ctx;
    const source    = ctx.createMediaStreamSource(stream);
    const analyser  = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const f32  = e.inputBuffer.getChannelData(0);
      const i16  = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++)
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
      ws.send(i16.buffer);
    };

    source.connect(analyser);
    source.connect(processor);
    processor.connect(ctx.destination);
    startVU(analyser);
    return true;
  };

  const stopMic = () => {
    stopVU();
    processorRef.current?.disconnect(); processorRef.current = null;
    audioCtxRef.current?.close();       audioCtxRef.current  = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    wsRef.current?.close();             wsRef.current        = null;
  };

  const handleToggle = async () => {
    if (isBlocked) { toast.error('Mic API unavailable — HTTPS required.'); return; }
    setLoading(true);
    try {
      if (isOnAir) {
        stopMic();
        await api.micOff();
        toast.info('Off Air');
      } else {
        // startMic() now waits for mic_ready from server (WS session open + ducking applied)
        // before returning — so api.micOn() fires only after everything is ready
        const ok = await startMic();
        if (!ok) { setLoading(false); return; }
        // Small guard: ensure fade-out has started before declaring On Air
        await new Promise(r => setTimeout(r, 120));
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

  useEffect(() => () => stopMic(), []); // eslint-disable-line

  // ── VU bars ─────────────────────────────────────────────────
  const VU_BARS = 12;
  const vuBars = Array.from({ length: VU_BARS }, (_, i) => ({
    active: micLevel >= (i / VU_BARS) * 100,
    color:  i < 7 ? '#2ed573' : i < 10 ? '#ffa502' : '#ff4757',
  }));

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
        🎙 On Air
      </h3>

      {/* HTTPS warning */}
      {isBlocked && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 0.85rem', background: 'rgba(255,165,2,0.12)', border: '1px solid rgba(255,165,2,0.35)', borderRadius: '8px', fontSize: '0.78rem', color: '#ffa502', textAlign: 'left', lineHeight: '1.5' }}>
          ⚠️ <strong>HTTPS required for microphone.</strong><br />
          <span style={{ opacity: 0.8 }}>Access via <code>https://</code> or localhost.</span>
        </div>
      )}

      {/* ── Device selector ── */}
      {!isBlocked && (
        <div style={{ marginBottom: '1rem', position: 'relative' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Input Device
            </span>
            <button
              onClick={() => enumerate(!devices.some(d => d.label))}
              disabled={scanning || isOnAir}
              title="Refresh devices"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', opacity: scanning ? 0.5 : 1 }}
            >
              <RefreshCw size={13} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Permission prompt */}
          {needsPerms && devices.every(d => !d.label) && (
            <button
              onClick={() => enumerate(true)}
              disabled={scanning || isOnAir}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', background: 'rgba(0,212,255,0.08)', border: '1px dashed rgba(0,212,255,0.35)', color: 'var(--accent-blue)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <Mic size={13} /> Grant mic permission to see devices
            </button>
          )}

          {/* Custom dropdown */}
          {devices.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => !isOnAir && setShowDevices(v => !v)}
                disabled={isOnAir}
                style={{
                  width: '100%', padding: '0.5rem 0.8rem', background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${showDevices ? 'var(--accent-blue)' : 'var(--panel-border)'}`,
                  color: 'white', borderRadius: '8px', cursor: isOnAir ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                  opacity: isOnAir ? 0.5 : 1, textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  <Mic size={13} style={{ flexShrink: 0, color: 'var(--accent-blue)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedLabel}
                  </span>
                </span>
                <ChevronDown size={14} style={{ flexShrink: 0, transform: showDevices ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {showDevices && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#1a1a2e', border: '1px solid var(--panel-border)',
                  borderRadius: '8px', zIndex: 100, overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {devices.map((d, i) => (
                    <button key={d.deviceId} onClick={() => { setSelectedId(d.deviceId); setShowDevices(false); }}
                      style={{
                        width: '100%', padding: '0.6rem 0.9rem', background: d.deviceId === selectedId ? 'rgba(0,212,255,0.12)' : 'transparent',
                        border: 'none', borderBottom: i < devices.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        color: d.deviceId === selectedId ? 'var(--accent-blue)' : 'white',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem',
                        textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem',
                      }}
                    >
                      <Mic size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label || `Microphone ${i + 1}`}
                      </span>
                      {d.deviceId === selectedId && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                    </button>
                  ))}

                  {/* Refresh inside dropdown */}
                  <button onClick={() => { enumerate(devices.every(d => !d.label)); }}
                    disabled={scanning}
                    style={{ width: '100%', padding: '0.5rem 0.9rem', background: 'rgba(0,0,0,0.3)', border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RefreshCw size={11} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
                    {scanning ? 'Scanning…' : 'Refresh device list'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* No devices found */}
          {devices.length === 0 && !scanning && permState === 'granted' && (
            <div style={{ fontSize: '0.78rem', color: '#ffa502', padding: '0.4rem', textAlign: 'center' }}>
              No microphone detected. Plug one in and refresh.
            </div>
          )}
        </div>
      )}

      {/* VU Meter */}
      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'flex-end', height: '28px', marginBottom: '1rem' }}>
        {vuBars.map((bar, i) => (
          <div key={i} style={{ width: '14px', height: `${40 + i * 5}%`, background: bar.active ? bar.color : 'rgba(255,255,255,0.08)', borderRadius: '2px', transition: 'background 0.05s' }} />
        ))}
      </div>

      {/* Target selector */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {['ALL', 'A', 'B', 'C', 'D'].map(t => {
          const sel = targets.includes(t);
          return (
            <button key={t} onClick={() => !isOnAir && toggleTarget(t)} style={{
              padding: '0.35rem 0.8rem',
              background: sel ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
              color: sel ? '#000' : 'var(--text-primary)',
              border: sel ? 'none' : '1px solid var(--panel-border)',
              borderRadius: '20px', cursor: isOnAir ? 'default' : 'pointer',
              fontWeight: '600', fontSize: '0.78rem', transition: 'all 0.2s', opacity: isOnAir ? 0.6 : 1,
            }}>{t}</button>
          );
        })}
      </div>

      {/* ON AIR button */}
      <button onClick={handleToggle} disabled={loading} style={{
        width: '100%', padding: '1.1rem',
        background: isOnAir ? 'rgba(255,71,87,0.18)' : isBlocked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
        border: isOnAir ? '2px solid var(--danger)' : '1px solid var(--panel-border)',
        color: isOnAir ? 'var(--danger)' : isBlocked ? 'rgba(255,255,255,0.3)' : 'var(--text-primary)',
        borderRadius: '12px', cursor: loading ? 'default' : 'pointer',
        fontWeight: 'bold', fontSize: '1.05rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem',
        boxShadow: isOnAir ? '0 0 30px rgba(255,71,87,0.35)' : 'none',
        transition: 'all 0.3s', opacity: loading ? 0.7 : 1,
        animation: isOnAir ? 'pulse 2s ease-in-out infinite' : 'none',
      }}>
        {isOnAir ? <Radio size={20} /> : <Mic size={20} />}
        {loading ? 'Please wait…' : isOnAir ? '● ON AIR' : isBlocked ? 'HTTPS Required' : 'GO LIVE'}
      </button>

      <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {isOnAir
          ? `Broadcasting to: ${mic.targets.join(', ')} — ${selectedLabel}`
          : isBlocked
          ? 'Mic API unavailable on plain HTTP'
          : devices.length === 0
          ? 'No mic found — plug one in and refresh'
          : 'Select targets, then Go Live'}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { box-shadow: 0 0 20px rgba(255,71,87,0.35); } 50% { box-shadow: 0 0 45px rgba(255,71,87,0.65); } }
        @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
