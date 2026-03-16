import React, { useState, useEffect } from 'react';
import { Save, Mic2, Speaker } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function SettingsPage() {
  const { decks, toast, api } = useApp();
  const [deckNames, setDeckNames] = useState({
    a: '', b: '', c: '', d: ''
  });
  const [ducking, setDucking] = useState(5);
  const [micDucking, setMicDucking] = useState(20);
  const [dbMode, setDbMode] = useState('local');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [micDevices, setMicDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState(null); // null | 'ok' | 'error'

  // Populate deck names from context
  useEffect(() => {
    setDeckNames({
      a: decks.a?.name || 'Deck A',
      b: decks.b?.name || 'Deck B',
      c: decks.c?.name || 'Deck C',
      d: decks.d?.name || 'Deck D',
    });
  }, [decks]);

  // Enumerate microphone devices
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const mics = devices.filter(d => d.kind === 'audioinput');
          setMicDevices(mics);
        })
        .catch(() => {});
    }
  }, []);

  const handleTestDb = async () => {
    setDbTesting(true);
    setDbStatus(null);
    try {
      // API expects { value: { db_mode: ... } }
      const payload = { value: { db_mode: dbMode } };
      const res = await fetch('/api/settings/db-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDbStatus('ok');
        toast.success('Connection successful!');
      } else {
        const err = await res.json().catch(() => ({}));
        setDbStatus('error');
        toast.error('Connection failed: ' + (err.detail || res.statusText));
      }
    } catch (err) {
      setDbStatus('error');
      toast.error('Connection failed: ' + err.message);
    } finally {
      setDbTesting(false);
    }
  };

  const handleSaveDb = async () => {
    setDbSaving(true);
    try {
      // API expects { value: { ... } }
      const payload = { db_mode: dbMode };
      if (dbMode === 'cloud') {
        payload.supabase_url = supabaseUrl;
        payload.supabase_key = supabaseKey;
      }
      await api.saveSettings(payload);
      toast.success('Database setting saved!');
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setDbSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [id, name] of Object.entries(deckNames)) {
        if (name !== decks[id]?.name) {
          await api.renameDeck(id, name);
        }
      }
      await api.saveSettings({ ducking_percent: ducking, mic_ducking_percent: micDucking, db_mode: dbMode });
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const panelStyle = { marginBottom: '0', padding: '1.5rem' };
  const labelStyle = { display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' };
  const inputStyle = {
    width: '100%', padding: '0.6rem 0.9rem', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Station Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '780px' }}>

        {/* ── DB Mode ─────────────────────── */}
        <div className="glass-panel" style={panelStyle}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Database Mode</h3>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
            {['local', 'cloud'].map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                  type="radio" name="db_mode" value={mode}
                  checked={dbMode === mode}
                  onChange={() => { setDbMode(mode); setDbStatus(null); }}
                  style={{ accentColor: 'var(--accent-blue)' }}
                />
                <span>{mode === 'local' ? '🖥 Local (PostgreSQL)' : '☁️ Cloud (Supabase)'}</span>
              </label>
            ))}
          </div>

          {/* Cloud fields — only shown when cloud is selected */}
          {dbMode === 'cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
              <div>
                <label style={labelStyle}>Supabase URL</label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Supabase Service Key</label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  placeholder="eyJ..."
                  style={inputStyle}
                />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                Find these in your Supabase project → Settings → API
              </p>
            </div>
          )}

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {dbMode === 'local'
              ? 'Using the built-in PostgreSQL container. No extra config needed.'
              : 'Switching to Supabase requires an application restart after saving.'}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleTestDb}
              disabled={dbTesting}
              style={{
                padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'inherit',
                background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)',
                color: 'var(--accent-blue)', borderRadius: '8px', cursor: dbTesting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: dbTesting ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {dbTesting ? '⟳ Testing…' : '⚡ Test Connection'}
            </button>

            {dbStatus && (
              <span style={{
                fontSize: '0.8rem', fontWeight: '600', padding: '0.3rem 0.75rem',
                borderRadius: '20px',
                background: dbStatus === 'ok' ? 'rgba(46,213,115,0.15)' : 'rgba(255,71,87,0.15)',
                border: `1px solid ${dbStatus === 'ok' ? 'rgba(46,213,115,0.4)' : 'rgba(255,71,87,0.4)'}`,
                color: dbStatus === 'ok' ? '#2ed573' : '#ff4757',
              }}>
                {dbStatus === 'ok' ? '✓ Connected' : '✕ Unreachable'}
              </span>
            )}

            <button
              onClick={handleSaveDb}
              disabled={dbSaving}
              style={{
                marginLeft: 'auto', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontFamily: 'inherit',
                background: dbSaving ? 'rgba(46,213,115,0.2)' : 'rgba(46,213,115,0.15)',
                border: '1px solid rgba(46,213,115,0.4)',
                color: '#2ed573', borderRadius: '8px', cursor: dbSaving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: dbSaving ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {dbSaving ? '✓ Saving…' : '💾 Save'}
            </button>
          </div>
        </div>

        {/* ── Deck Names ─────────────────────── */}
        <div className="glass-panel" style={panelStyle}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Deck Names</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {['a', 'b', 'c', 'd'].map(id => (
              <div key={id}>
                <label style={labelStyle}>Deck {id.toUpperCase()}</label>
                <input
                  type="text"
                  value={deckNames[id]}
                  onChange={e => setDeckNames(prev => ({ ...prev, [id]: e.target.value }))}
                  style={inputStyle}
                  placeholder={`Deck ${id.toUpperCase()}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Audio ─────────────────────── */}
        <div className="glass-panel" style={panelStyle}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Audio Preferences</h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Microphone Device</label>
            <select style={{ ...inputStyle, maxWidth: '380px' }}>
              {micDevices.length > 0 ? (
                micDevices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))
              ) : (
                <option>Default (grant mic permission to see options)</option>
              )}
            </select>
            {micDevices.length === 0 && (
              <button
                onClick={() => navigator.mediaDevices?.getUserMedia({ audio: true })
                  .then(s => { s.getTracks().forEach(t => t.stop()); return navigator.mediaDevices.enumerateDevices(); })
                  .then(devs => setMicDevices(devs.filter(d => d.kind === 'audioinput')))
                  .catch(() => toast.error('Microphone permission denied'))
                }
                style={{
                  marginTop: '0.5rem', padding: '0.35rem 0.8rem', fontSize: '0.8rem',
                  background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                  color: 'var(--accent-blue)', borderRadius: '6px', cursor: 'pointer',
                }}
              >
                Grant permission & detect
              </button>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
              <span>📢 Announcement Ducking</span>
              <span style={{ color: 'var(--accent-blue)' }}>{ducking}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={ducking}
              onChange={e => setDucking(Number(e.target.value))}
              style={{
                width: '100%', maxWidth: '380px',
                background: `linear-gradient(to right, var(--accent-blue) ${ducking}%, rgba(255,255,255,0.15) ${ducking}%)`,
                height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer',
              }}
            />
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Volume music drops to when an Announcement plays.
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
              <span>🎙 On Air Mic Ducking</span>
              <span style={{ color: '#ff4757' }}>{micDucking}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={micDucking}
              onChange={e => setMicDucking(Number(e.target.value))}
              style={{
                width: '100%', maxWidth: '380px',
                background: `linear-gradient(to right, #ff4757 ${micDucking}%, rgba(255,255,255,0.15) ${micDucking}%)`,
                height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer',
              }}
            />
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Volume music fades to when DJ mic is On Air. Default 20%.
            </div>
          </div>
        </div>

        {/* ── Appearance ─────────────────────── */}
        <div className="glass-panel" style={panelStyle}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Appearance</h3>
          <p style={{ marginBottom: '0.85rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Dashboard Background Image</p>
          <div
            style={{
              padding: '2rem', border: '2px dashed var(--panel-border)',
              borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)',
              cursor: 'pointer', background: 'rgba(0,0,0,0.15)', fontSize: '0.88rem',
            }}
            onClick={() => document.getElementById('bgUpload')?.click()}
          >
            Drag & Drop image or click to browse
          </div>
          <input id="bgUpload" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              document.body.style.backgroundImage = `url(${url})`;
              document.body.style.backgroundSize = 'cover';
              toast.success('Background updated (preview only)');
            }}
          />
        </div>

        {/* ── Save ─────────────────────── */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '1rem', background: saving ? 'rgba(46,213,115,0.3)' : 'var(--success)',
            border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1rem',
            borderRadius: '10px', boxShadow: '0 0 20px rgba(46,213,115,0.35)',
            cursor: saving ? 'default' : 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
          }}
        >
          <Save size={18} />
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>

      </div>
    </div>
  );
}
