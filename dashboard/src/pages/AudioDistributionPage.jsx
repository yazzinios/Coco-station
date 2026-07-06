import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio, Sliders, Wifi, Activity, FlaskConical, Save,
  Play, Square, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, XCircle, Wand2, BookMarked
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const PANEL = { marginBottom: 0, padding: '1.5rem' };
const LBL   = {
  display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.45rem',
};
const INP = {
  width: '100%', padding: '0.55rem 0.85rem', borderRadius: '8px',
  background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)',
  fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};
const BTN_BASE = {
  display: 'flex', alignItems: 'center', gap: '0.45rem',
  padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
  fontSize: '0.85rem', fontFamily: 'inherit', border: '1px solid',
  transition: 'opacity 0.2s',
};

function SectionHeader({ icon, title, subtitle, color = 'var(--accent-blue)' }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon} {title}
      </h3>
      {subtitle && <p style={{ margin: '0.3rem 0 0 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</p>}
    </div>
  );
}

function StatusBadge({ value, thresholds = [50, 150], unit = 'ms' }) {
  // thresholds = [warn, crit]
  if (value == null) return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>—</span>;
  const color = value < thresholds[0] ? '#2ed573' : value < thresholds[1] ? '#ffd32a' : '#ff4757';
  const icon  = value < thresholds[0] ? '🟢' : value < thresholds[1] ? '🟡' : '🔴';
  return (
    <span style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>
      {icon} {value} {unit}
    </span>
  );
}

function DriftBadge({ drift }) {
  if (drift == null) return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>—</span>;
  const abs = Math.abs(drift);
  const color = abs < 5 ? '#2ed573' : abs < 20 ? '#ffd32a' : '#ff4757';
  return <span style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>{drift > 0 ? '+' : ''}{drift} ms</span>;
}

// ─────────────────────────────────────────────────────────────
// COLLAPSIBLE SECTION WRAPPER
// ─────────────────────────────────────────────────────────────
function CollapseSection({ id, title, icon, color = 'var(--accent-blue)', badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel" style={PANEL}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon} {title}
          {badge && (
            <span style={{
              fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '10px',
              background: `${color}22`, color, border: `1px solid ${color}44`
            }}>{badge}</span>
          )}
        </h3>
        {open ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
      </div>
      {open && <div style={{ marginTop: '1.25rem' }}>{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DECK ROW for tables
// ─────────────────────────────────────────────────────────────
function DeckRow({ deck, deckNames, onChange, readonlyOffset }) {
  const color = ['#00d4ff', '#2ed573', '#a55eea', '#fd9644', '#ff4757', '#ffd32a'][deck.index] || '#00d4ff';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1fr 110px 100px 110px 110px',
      gap: '0.65rem', alignItems: 'center', padding: '0.6rem 0.75rem',
      borderRadius: '8px', background: 'rgba(0,0,0,0.2)',
      border: `1px solid ${color}22`,
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: deck.online ? '#2ed573' : '#666',
        boxShadow: deck.online ? '0 0 6px #2ed573' : 'none',
        margin: '0 auto',
      }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color }}>{deckNames?.[deck.id] || `Deck ${deck.id.toUpperCase()}`}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{deck.ip || '—'}</div>
      </div>
      {/* Network delay */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Network</div>
        <StatusBadge value={deck.networkDelay} />
      </div>
      {/* DSP/amplifier manual */}
      <div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>DSP + Amp</div>
        <input
          type="number" min="0" max="999" value={deck.manualOffset}
          onChange={e => onChange(deck.id, 'manualOffset', Number(e.target.value))}
          style={{ ...INP, width: '90px', padding: '0.3rem 0.5rem', fontSize: '0.82rem', textAlign: 'center' }}
        />
      </div>
      {/* Computed total */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Total</div>
        <StatusBadge value={deck.totalDelay} />
      </div>
      {/* Compensation applied */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Compensation</div>
        <span style={{ fontWeight: 700, color: '#a55eea', fontSize: '0.88rem' }}>
          {deck.compensation != null ? `+${deck.compensation} ms` : '—'}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MONITORING ROW
// ─────────────────────────────────────────────────────────────
function MonitorRow({ deck, deckNames }) {
  const color = ['#00d4ff', '#2ed573', '#a55eea', '#fd9644', '#ff4757', '#ffd32a'][deck.index] || '#00d4ff';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '8px 1fr 90px 80px 80px 90px 90px',
      gap: '0.6rem', alignItems: 'center', padding: '0.55rem 0.75rem',
      borderRadius: '7px', background: 'rgba(0,0,0,0.18)', border: `1px solid ${color}1a`,
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%', background: deck.online ? '#2ed573' : '#555',
        boxShadow: deck.online ? '0 0 5px #2ed573' : 'none',
      }} />
      <span style={{ fontWeight: 600, fontSize: '0.85rem', color }}>{deckNames?.[deck.id] || `Deck ${deck.id.toUpperCase()}`}</span>
      <StatusBadge value={deck.networkDelay} />
      <span style={{ fontSize: '0.82rem', color: '#ffd32a', fontWeight: 600 }}>{deck.jitter != null ? `±${deck.jitter}` : '—'} ms</span>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{deck.decodeDelay != null ? `${deck.decodeDelay} ms` : '—'}</span>
      <DriftBadge drift={deck.clockDrift} />
      <div style={{
        padding: '0.2rem 0.5rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
        textAlign: 'center',
        background: !deck.online ? 'rgba(102,102,102,0.15)' :
          (deck.networkDelay ?? 999) < 50 ? 'rgba(46,213,115,0.12)' :
          (deck.networkDelay ?? 999) < 150 ? 'rgba(255,211,42,0.12)' : 'rgba(255,71,87,0.12)',
        color: !deck.online ? '#666' :
          (deck.networkDelay ?? 999) < 50 ? '#2ed573' :
          (deck.networkDelay ?? 999) < 150 ? '#ffd32a' : '#ff4757',
        border: `1px solid ${!deck.online ? '#33333355' :
          (deck.networkDelay ?? 999) < 50 ? '#2ed57333' :
          (deck.networkDelay ?? 999) < 150 ? '#ffd32a33' : '#ff475733'}`,
      }}>
        {!deck.online ? 'Offline' : (deck.networkDelay ?? 999) < 50 ? 'Excellent' : (deck.networkDelay ?? 999) < 150 ? 'Warning' : 'Critical'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function AudioDistributionPage() {
  const { decks: deckCtx, toast, api, settings } = useApp();

  // Build deck list from context
  const deckIds = ['a', 'b', 'c', 'd', 'e', 'f'];
  const deckNames = Object.fromEntries(deckIds.map(id => [id, deckCtx?.[id]?.name || `Deck ${id.toUpperCase()}`]));

  // ── Sync Mode ──────────────────────────────────────────────
  const [syncMode, setSyncMode] = useState('hybrid'); // disabled | manual | automatic | hybrid
  const [masterClock, setMasterClock] = useState('server'); // server | ntp
  const [ntpServer, setNtpServer] = useState('pool.ntp.org');
  const [maxDrift, setMaxDrift] = useState(20);
  const [syncInterval, setSyncInterval] = useState(30);
  const [latencySamples, setLatencySamples] = useState(10);
  const [maxJitter, setMaxJitter] = useState(20);
  const [autoRecalc, setAutoRecalc] = useState(true);

  // ── Audio Buffer ──────────────────────────────────────────
  const [bufferMin, setBufferMin] = useState(500);
  const [bufferTarget, setBufferTarget] = useState(1000);
  const [bufferMax, setBufferMax] = useState(3000);

  // ── Per-deck state ────────────────────────────────────────
  const [deckData, setDeckData] = useState(() =>
    deckIds.map((id, index) => ({
      id, index,
      online: index < 4,
      ip: index < 4 ? `192.168.1.${10 + index * 10}` : null,
      networkDelay: index < 4 ? [25, 52, 109, 88][index] : null,
      jitter: index < 4 ? [1, 4, 6, 5][index] : null,
      decodeDelay: index < 4 ? [10, 20, 15, 18][index] : null,
      clockDrift: index < 4 ? [+2, -4, +1, -3][index] : null,
      manualOffset: index < 4 ? [0, 0, 45, 10][index] : 0, // DSP + amp + speaker distance
      totalDelay: null,
      compensation: null,
    }))
  );

  // Compute totals & compensations whenever delays/offsets change
  useEffect(() => {
    setDeckData(prev => {
      const online = prev.filter(d => d.online);
      if (!online.length) return prev;
      const maxTotal = Math.max(...online.map(d => (d.networkDelay ?? 0) + (d.manualOffset ?? 0)));
      return prev.map(d => {
        if (!d.online) return { ...d, totalDelay: null, compensation: null };
        const total = (d.networkDelay ?? 0) + (d.manualOffset ?? 0);
        return { ...d, totalDelay: total, compensation: maxTotal - total };
      });
    });
  }, []);

  const updateDeck = useCallback((id, field, value) => {
    setDeckData(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, [field]: value } : d);
      const online = updated.filter(d => d.online);
      const maxTotal = online.length ? Math.max(...online.map(d => (d.networkDelay ?? 0) + (d.manualOffset ?? 0))) : 0;
      return updated.map(d => {
        if (!d.online) return { ...d, totalDelay: null, compensation: null };
        const total = (d.networkDelay ?? 0) + (d.manualOffset ?? 0);
        return { ...d, totalDelay: total, compensation: maxTotal - total };
      });
    });
  }, []);

  // ── Auto-measure simulation ──────────────────────────────
  const [measuring, setMeasuring] = useState(false);
  const [measureProgress, setMeasureProgress] = useState(0);
  const measureRef = useRef(null);

  const handleMeasureAll = () => {
    if (measuring) return;
    setMeasuring(true);
    setMeasureProgress(0);
    let step = 0;
    measureRef.current = setInterval(() => {
      step += 1;
      setMeasureProgress(Math.min(100, Math.round((step / 20) * 100)));
      if (step >= 20) {
        clearInterval(measureRef.current);
        // Simulate updated measurements
        setDeckData(prev => {
          const updated = prev.map(d => {
            if (!d.online) return d;
            const newNet = Math.max(10, (d.networkDelay ?? 30) + Math.floor(Math.random() * 10 - 5));
            const newJitter = Math.max(1, (d.jitter ?? 3) + Math.floor(Math.random() * 4 - 2));
            const newDrift = Math.floor(Math.random() * 10 - 5);
            return { ...d, networkDelay: newNet, jitter: newJitter, clockDrift: newDrift };
          });
          const online = updated.filter(d => d.online);
          const maxTotal = online.length ? Math.max(...online.map(d => (d.networkDelay ?? 0) + (d.manualOffset ?? 0))) : 0;
          return updated.map(d => {
            if (!d.online) return { ...d, totalDelay: null, compensation: null };
            const total = (d.networkDelay ?? 0) + (d.manualOffset ?? 0);
            return { ...d, totalDelay: total, compensation: maxTotal - total };
          });
        });
        setMeasuring(false);
        toast?.success('Latency measurement complete — offsets recalculated.');
      }
    }, 150);
  };

  useEffect(() => () => clearInterval(measureRef.current), []);

  // ── Test Tone ─────────────────────────────────────────────
  const [toneFreq, setToneFreq] = useState(1000);
  const [toneDuration, setToneDuration] = useState(1);
  const [toneTarget, setToneTarget] = useState('all');
  const [toneRunning, setToneRunning] = useState(false);
  const toneTimerRef = useRef(null);

  const handlePlayTone = () => {
    if (toneRunning) return;
    setToneRunning(true);
    toneTimerRef.current = setTimeout(() => setToneRunning(false), toneDuration * 1000);
    toast?.success(`▶ Playing ${toneFreq} Hz test tone for ${toneDuration}s on ${toneTarget === 'all' ? 'all decks' : `Deck ${toneTarget.toUpperCase()}`}`);
  };
  useEffect(() => () => clearTimeout(toneTimerRef.current), []);

  // ── Calibration Wizard ────────────────────────────────────
  const [wizardStep, setWizardStep] = useState(0); // 0=idle, 1,2,3
  const [wizardBusy, setWizardBusy] = useState(false);

  const wizardSteps = [
    { label: 'Play Sync Pulse', icon: <Play size={14} />, desc: 'Sends a reference pulse to all decks simultaneously.' },
    { label: 'Measure Delays', icon: <Activity size={14} />, desc: 'Captures round-trip time from each deck endpoint.' },
    { label: 'Apply Compensation', icon: <Save size={14} />, desc: 'Calculates and saves optimal offsets for zero echo.' },
  ];

  const handleWizardStep = () => {
    if (wizardBusy) return;
    setWizardBusy(true);
    setTimeout(() => {
      setWizardBusy(false);
      if (wizardStep < 3) setWizardStep(s => s + 1);
      if (wizardStep === 2) {
        handleMeasureAll();
        setTimeout(() => toast?.success('✓ Calibration complete — all zones aligned.'), 3500);
      }
    }, 1800);
  };

  // ── Profiles ──────────────────────────────────────────────
  const PROFILES = ['Normal Operation', 'Summer Season', 'Event Mode', 'Night Mode', 'Maintenance'];
  const [activeProfile, setActiveProfile] = useState('Normal Operation');

  // ── Advanced ─────────────────────────────────────────────
  const [autoDriftCorrection, setAutoDriftCorrection] = useState(true);
  const [adaptiveNetwork, setAdaptiveNetwork] = useState(true);
  const [logSyncEvents, setLogSyncEvents] = useState(true);
  const [alertOnDelay, setAlertOnDelay] = useState(true);
  const [maxAllowedDelay, setMaxAllowedDelay] = useState(250);

  // ── Save ─────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // In a real implementation this would call api.saveSettings({ audio_distribution: { ... } })
      await new Promise(r => setTimeout(r, 800));
      toast?.success('Audio distribution settings saved!');
    } catch (err) {
      toast?.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Overall sync quality ──────────────────────────────────
  const onlineDecks = deckData.filter(d => d.online);
  const maxCompensationError = onlineDecks.length
    ? Math.max(...onlineDecks.map(d => Math.abs(d.clockDrift ?? 0)))
    : 0;
  const syncQuality = maxCompensationError < 5 ? 'Excellent' : maxCompensationError < 20 ? 'Good' : 'Poor';
  const syncQualityColor = maxCompensationError < 5 ? '#2ed573' : maxCompensationError < 20 ? '#ffd32a' : '#ff4757';

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Radio size={22} style={{ color: 'var(--accent-blue)' }} />
          Audio Distribution
        </h2>
        {/* Sync quality banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 1rem',
          borderRadius: '20px', background: `${syncQualityColor}18`, border: `1px solid ${syncQualityColor}44`,
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: syncQualityColor, boxShadow: `0 0 6px ${syncQualityColor}` }} />
          <span style={{ fontWeight: 700, color: syncQualityColor, fontSize: '0.85rem' }}>Sync: {syncQuality}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Max drift: {maxCompensationError} ms</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '900px' }}>

        {/* ── 1. SYNCHRONIZATION MODE ───────────────────────── */}
        <div className="glass-panel" style={PANEL}>
          <SectionHeader icon={<Sliders size={16} />} title="Synchronization Mode" subtitle="Choose how the system aligns audio across all zones." />

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {[
              { value: 'disabled',  label: '⊘ Disabled',          desc: 'No sync — raw stream',   color: '#666' },
              { value: 'manual',    label: '✎ Manual',             desc: 'Fixed operator offsets', color: '#ffd32a' },
              { value: 'automatic', label: '⚡ Automatic',          desc: 'Network RTT measured',   color: '#00d4ff' },
              { value: 'hybrid',    label: '✦ Hybrid',             desc: 'Recommended for parks',  color: '#a55eea' },
            ].map(opt => (
              <label key={opt.value} style={{
                flex: '1 1 180px', cursor: 'pointer', padding: '0.85rem 1rem', borderRadius: '10px',
                background: syncMode === opt.value ? `${opt.color}15` : 'rgba(0,0,0,0.2)',
                border: `1px solid ${syncMode === opt.value ? opt.color + '66' : 'var(--panel-border)'}`,
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                  <input type="radio" name="syncMode" value={opt.value} checked={syncMode === opt.value}
                    onChange={() => setSyncMode(opt.value)} style={{ accentColor: opt.color }} />
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: syncMode === opt.value ? opt.color : 'white' }}>{opt.label}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.35rem' }}>{opt.desc}</div>
              </label>
            ))}
          </div>

          {/* Mode-specific explanation */}
          {syncMode === 'manual' && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(255,211,42,0.06)', border: '1px solid rgba(255,211,42,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              🔧 <strong style={{ color: '#ffd32a' }}>Manual mode:</strong> You set the delay offset for each deck directly in the Deck Delays table below. Best for fixed infrastructure with known cable/fiber paths.
            </div>
          )}
          {syncMode === 'automatic' && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              ⚡ <strong style={{ color: '#00d4ff' }}>Automatic mode:</strong> The server continuously sends <code>SYNC_REQUEST</code> pings to each deck, measures round-trip time, and calculates one-way delay automatically.
            </div>
          )}
          {syncMode === 'hybrid' && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(165,94,234,0.06)', border: '1px solid rgba(165,94,234,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              ✦ <strong style={{ color: '#a55eea' }}>Hybrid mode (recommended):</strong> Network latency is measured automatically. DSP, amplifier, and speaker-distance delays are entered manually per deck. Total = Auto Network + Manual Offset.
            </div>
          )}

          {/* Clock settings */}
          {syncMode !== 'disabled' && (
            <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={LBL}>Master Clock Source</label>
                <select value={masterClock} onChange={e => setMasterClock(e.target.value)}
                  style={{ ...INP, cursor: 'pointer', colorScheme: 'dark' }}>
                  <option value="server">Server Clock</option>
                  <option value="ntp">NTP Server</option>
                </select>
              </div>
              {masterClock === 'ntp' && (
                <div>
                  <label style={LBL}>NTP Server Address</label>
                  <input type="text" value={ntpServer} onChange={e => setNtpServer(e.target.value)}
                    style={INP} placeholder="pool.ntp.org" />
                </div>
              )}
              {syncMode !== 'manual' && (
                <>
                  <div>
                    <label style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
                      Max Drift Allowed <span style={{ color: '#ffd32a' }}>{maxDrift} ms</span>
                    </label>
                    <input type="range" min="5" max="100" value={maxDrift} onChange={e => setMaxDrift(Number(e.target.value))}
                      style={{ width: '100%', background: `linear-gradient(to right, #ffd32a ${maxDrift}%, rgba(255,255,255,0.15) ${maxDrift}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
                  </div>
                  <div>
                    <label style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
                      Measurement Interval <span style={{ color: 'var(--accent-blue)' }}>{syncInterval}s</span>
                    </label>
                    <input type="range" min="5" max="120" step="5" value={syncInterval} onChange={e => setSyncInterval(Number(e.target.value))}
                      style={{ width: '100%', background: `linear-gradient(to right, var(--accent-blue) ${(syncInterval/120)*100}%, rgba(255,255,255,0.15) ${(syncInterval/120)*100}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 2. AUDIO BUFFER ──────────────────────────────── */}
        {syncMode !== 'disabled' && (
          <div className="glass-panel" style={PANEL}>
            <SectionHeader icon={<Activity size={16} />} title="Audio Sync Buffer" subtitle="Larger buffers improve synchronization quality at the cost of latency." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
              {[
                { label: 'Minimum', value: bufferMin, set: setBufferMin, color: '#2ed573', min: 100, max: 2000, step: 100 },
                { label: 'Target', value: bufferTarget, set: setBufferTarget, color: 'var(--accent-blue)', min: 200, max: 5000, step: 100 },
                { label: 'Maximum', value: bufferMax, set: setBufferMax, color: '#ff4757', min: 500, max: 10000, step: 500 },
              ].map(({ label, value, set, color, min, max, step }) => (
                <div key={label}>
                  <label style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{label}</span><span style={{ color }}>{value} ms</span>
                  </label>
                  <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))}
                    style={{ width: '100%', background: `linear-gradient(to right, ${color} ${((value-min)/(max-min))*100}%, rgba(255,255,255,0.15) ${((value-min)/(max-min))*100}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.55rem 0.8rem', borderRadius: '7px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)' }}>
              💡 Recommended: Min 500 ms · Target 1000 ms · Max 3000 ms for a theme park environment.
            </div>
          </div>
        )}

        {/* ── 3. DECK DELAYS ───────────────────────────────── */}
        {syncMode !== 'disabled' && (
          <div className="glass-panel" style={PANEL}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={16} /> Deck Delays
                </h3>
                <p style={{ margin: '0.2rem 0 0 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {syncMode === 'manual' ? 'Enter the total known delay for each zone (fiber + DSP + amp + speaker distance).' : 'Network delay is auto-measured. Enter DSP + amplifier + speaker distance manually.'}
                </p>
              </div>
              {syncMode !== 'manual' && (
                <button
                  onClick={handleMeasureAll}
                  disabled={measuring}
                  style={{ ...BTN_BASE, background: 'rgba(0,212,255,0.1)', borderColor: 'rgba(0,212,255,0.35)', color: 'var(--accent-blue)', opacity: measuring ? 0.6 : 1 }}
                >
                  <RefreshCw size={14} className={measuring ? 'spin' : ''} />
                  {measuring ? `Measuring… ${measureProgress}%` : 'Measure All Decks'}
                </button>
              )}
            </div>

            {/* Progress bar */}
            {measuring && (
              <div style={{ marginBottom: '1rem', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${measureProgress}%`, background: 'var(--accent-blue)', borderRadius: '2px', transition: 'width 0.15s linear' }} />
              </div>
            )}

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 110px 100px 110px 110px',
              gap: '0.65rem', padding: '0.3rem 0.75rem', marginBottom: '0.4rem',
            }}>
              {['', 'Zone', 'Network', 'DSP+Amp (ms)', 'Total', 'Compensation'].map((h, i) => (
                <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {deckData.map(deck => (
                <DeckRow key={deck.id} deck={deck} deckNames={deckNames} onChange={updateDeck} readonlyOffset={syncMode === 'automatic'} />
              ))}
            </div>

            {/* Reference delay explanation */}
            {onlineDecks.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', borderRadius: '8px', background: 'rgba(165,94,234,0.06)', border: '1px solid rgba(165,94,234,0.2)', fontSize: '0.8rem' }}>
                <strong style={{ color: '#a55eea' }}>Reference:</strong>
                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  Max total = <strong style={{ color: 'white' }}>{Math.max(...onlineDecks.map(d => d.totalDelay ?? 0))} ms</strong>
                  {' '}— all other zones are held back to match, eliminating echo between adjacent areas.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── 4. CALIBRATION WIZARD + TEST TONE ─────────────── */}
        <CollapseSection id="calibration" icon={<Wand2 size={16} />} title="Calibration" color="#ffd32a" defaultOpen={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

            {/* Wizard */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem' }}>🔮 Calibration Wizard</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                {wizardSteps.map((s, i) => {
                  const done = wizardStep > i + 1;
                  const active = wizardStep === i + 1;
                  const idle = wizardStep < i + 1;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      background: active ? 'rgba(255,211,42,0.08)' : done ? 'rgba(46,213,115,0.06)' : 'rgba(0,0,0,0.15)',
                      border: `1px solid ${active ? 'rgba(255,211,42,0.35)' : done ? 'rgba(46,213,115,0.3)' : 'var(--panel-border)'}`,
                    }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700,
                        background: done ? 'rgba(46,213,115,0.2)' : active ? 'rgba(255,211,42,0.2)' : 'rgba(255,255,255,0.05)',
                        color: done ? '#2ed573' : active ? '#ffd32a' : 'var(--text-secondary)',
                        border: `1px solid ${done ? '#2ed57355' : active ? '#ffd32a55' : 'var(--panel-border)'}`,
                      }}>
                        {done ? '✓' : i + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: active ? '#ffd32a' : done ? '#2ed573' : 'white' }}>{s.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={handleWizardStep} disabled={wizardBusy || wizardStep === 3}
                  style={{ ...BTN_BASE, background: 'rgba(255,211,42,0.1)', borderColor: 'rgba(255,211,42,0.4)', color: '#ffd32a', opacity: (wizardBusy || wizardStep === 3) ? 0.5 : 1, flex: 1, justifyContent: 'center' }}>
                  {wizardBusy ? '⟳ Running…' : wizardStep === 0 ? <><Play size={14} /> Start Wizard</> : wizardStep === 3 ? '✓ Complete' : `Step ${wizardStep + 1} →`}
                </button>
                {wizardStep > 0 && (
                  <button onClick={() => setWizardStep(0)} style={{ ...BTN_BASE, background: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.25)', color: '#ff4757', padding: '0.5rem 0.7rem' }}>
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Test Tone */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem' }}>🎵 Test Tone Generator</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={LBL}>Frequency (Hz)</label>
                  <input type="number" min="100" max="8000" step="100" value={toneFreq}
                    onChange={e => setToneFreq(Number(e.target.value))} style={INP} />
                </div>
                <div>
                  <label style={LBL}>Duration (seconds)</label>
                  <input type="number" min="1" max="10" value={toneDuration}
                    onChange={e => setToneDuration(Number(e.target.value))} style={INP} />
                </div>
                <div>
                  <label style={LBL}>Target Deck</label>
                  <select value={toneTarget} onChange={e => setToneTarget(e.target.value)}
                    style={{ ...INP, cursor: 'pointer', colorScheme: 'dark' }}>
                    <option value="all">All Decks</option>
                    {deckIds.map(id => (
                      <option key={id} value={id}>{deckNames[id]}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handlePlayTone} disabled={toneRunning}
                  style={{ ...BTN_BASE, background: toneRunning ? 'rgba(255,71,87,0.15)' : 'rgba(0,212,255,0.1)', borderColor: toneRunning ? 'rgba(255,71,87,0.4)' : 'rgba(0,212,255,0.35)', color: toneRunning ? '#ff4757' : 'var(--accent-blue)', justifyContent: 'center' }}>
                  {toneRunning ? <><Square size={14} /> Playing…</> : <><Play size={14} /> Play Test Tone</>}
                </button>
              </div>
            </div>
          </div>
        </CollapseSection>

        {/* ── 5. REAL-TIME MONITORING ──────────────────────── */}
        <CollapseSection id="monitoring" icon={<Wifi size={16} />} title="Real-Time Monitoring" color="#2ed573" badge="Live" defaultOpen={true}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '8px 1fr 90px 80px 80px 90px 90px', gap: '0.6rem', padding: '0.25rem 0.75rem', marginBottom: '0.4rem' }}>
            {['', 'Zone', 'Network', 'Jitter', 'Decode', 'Clock Drift', 'Status'].map((h, i) => (
              <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem' }}>
            {deckData.map(deck => (
              <MonitorRow key={deck.id} deck={deck} deckNames={deckNames} />
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>🟢 Excellent (&lt;50 ms)</span>
            <span>🟡 Warning (50–150 ms)</span>
            <span>🔴 Critical (&gt;150 ms)</span>
          </div>
        </CollapseSection>

        {/* ── 6. CALIBRATION PROFILES ──────────────────────── */}
        <CollapseSection id="profiles" icon={<BookMarked size={16} />} title="Calibration Profiles" color="#fd9644" defaultOpen={false}>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Save and restore full sync configurations — useful when speaker placement changes for events or seasons.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LBL}>Active Profile</label>
            <select value={activeProfile} onChange={e => setActiveProfile(e.target.value)}
              style={{ ...INP, maxWidth: '280px', cursor: 'pointer', colorScheme: 'dark' }}>
              {PROFILES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: '0.65rem', justifyContent: 'start', flexWrap: 'wrap' }}>
            {[
              { label: 'Save Current', color: '#2ed573', bg: 'rgba(46,213,115,0.1)', border: 'rgba(46,213,115,0.35)' },
              { label: 'Load Profile', color: '#fd9644', bg: 'rgba(253,150,68,0.1)', border: 'rgba(253,150,68,0.35)' },
              { label: 'Duplicate', color: 'var(--accent-blue)', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.3)' },
              { label: 'Delete', color: '#ff4757', bg: 'rgba(255,71,87,0.08)', border: 'rgba(255,71,87,0.25)' },
            ].map(({ label, color, bg, border }) => (
              <button key={label} onClick={() => toast?.info(`${label}: ${activeProfile}`)}
                style={{ ...BTN_BASE, background: bg, borderColor: border, color }}>
                {label}
              </button>
            ))}
          </div>
        </CollapseSection>

        {/* ── 7. ADVANCED ──────────────────────────────────── */}
        <CollapseSection id="advanced" icon={<FlaskConical size={16} />} title="Advanced" color="var(--text-secondary)" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {[
              { label: '🔄 Automatic Drift Correction', sub: 'Continuously adjusts offsets as network conditions change.', val: autoDriftCorrection, set: setAutoDriftCorrection },
              { label: '📡 Adaptive Network Compensation', sub: 'Uses a rolling average to smooth out transient spikes.', val: adaptiveNetwork, set: setAdaptiveNetwork },
              { label: '📋 Log Synchronization Events', sub: 'Write sync events to the system log for diagnostics.', val: logSyncEvents, set: setLogSyncEvents },
              { label: '🔔 Alert On Excessive Delay', sub: 'Notify operators when a deck exceeds the maximum threshold.', val: alertOnDelay, set: setAlertOnDelay },
            ].map(({ label, sub, val, set }) => (
              <label key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--panel-border)' }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} style={{ accentColor: 'var(--accent-blue)', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</div>
                </div>
              </label>
            ))}
          </div>
          {alertOnDelay && (
            <div>
              <label style={{ ...LBL, display: 'flex', justifyContent: 'space-between' }}>
                Maximum Allowed Delay <span style={{ color: '#ff4757' }}>{maxAllowedDelay} ms</span>
              </label>
              <input type="range" min="50" max="1000" step="50" value={maxAllowedDelay} onChange={e => setMaxAllowedDelay(Number(e.target.value))}
                style={{ width: '100%', maxWidth: '400px', background: `linear-gradient(to right, #ff4757 ${((maxAllowedDelay-50)/950)*100}%, rgba(255,255,255,0.15) ${((maxAllowedDelay-50)/950)*100}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
            </div>
          )}
        </CollapseSection>

        {/* ── SAVE ─────────────────────────────────────────── */}
        <button onClick={handleSave} disabled={saving} style={{
          padding: '1rem', background: saving ? 'rgba(46,213,115,0.3)' : 'var(--success)',
          border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1rem',
          borderRadius: '10px', boxShadow: '0 0 20px rgba(46,213,115,0.35)',
          cursor: saving ? 'default' : 'pointer', transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
        }}>
          <Save size={18} />
          {saving ? 'Saving…' : 'Save Audio Distribution Settings'}
        </button>

      </div>

      {/* Spin keyframe for the measure icon */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
