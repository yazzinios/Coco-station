import React, { useState, useEffect } from 'react';
import { Save, Mic2, Speaker } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function SettingsPage() {
  const { decks, toast, api } = useApp();
  const [deckNames, setDeckNames] = useState({
    a: '', b: '', c: '', d: ''
  });
  const [ducking, setDucking] = useState(5);
  const [dbMode, setDbMode] = useState('local');
  const [micDevices, setMicDevices] = useState([]);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      // Rename each deck
      for (const [id, name] of Object.entries(deckNames)) {
        if (name !== decks[id]?.name) {
          await api.renameDeck(id, name);
        }
      }
      // Save global settings
      await api.saveSettings({ ducking_percent: ducking, db_mode: dbMode });
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
                  onChange={() => setDbMode(mode)}
                  style={{ accentColor: 'var(--accent-blue)' }}
                />
                <span>{mode === 'local' ? 'Local (PostgreSQL)' : 'Cloud (Supabase)'}</span>
              </label>
            ))}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Switching requires an application restart.</p>
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
              <span>Music Ducking</span>
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
              Volume music drops to when On Air or Announcements are playing.
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
