import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, Trash2, Bell } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function SettingsPage() {
  const { decks, toast, api, settings } = useApp();
  const [deckNames, setDeckNames] = useState({ a: '', b: '', c: '', d: '' });
  const [ducking, setDucking] = useState(5);
  const [micDucking, setMicDucking] = useState(20);
  const [dbMode, setDbMode] = useState('local');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState(null);

  // Chime state
  const [chimeEnabled,   setChimeEnabled]   = useState(settings?.on_air_chime_enabled ?? false);
  const [chimeExists,    setChimeExists]    = useState(false);
  const [chimeUploading, setChimeUploading] = useState(false);
  const chimeInputRef = useRef(null);

  useEffect(() => {
    setDeckNames({
      a: decks.a?.name || 'Deck A',
      b: decks.b?.name || 'Deck B',
      c: decks.c?.name || 'Deck C',
      d: decks.d?.name || 'Deck D',
    });
  }, [decks]);

  useEffect(() => {
    setChimeEnabled(settings?.on_air_chime_enabled ?? false);
    if (settings?.ducking_percent   != null) setDucking(settings.ducking_percent);
    if (settings?.mic_ducking_percent != null) setMicDucking(settings.mic_ducking_percent);
    if (settings?.db_mode)                    setDbMode(settings.db_mode);
  }, [settings]);

  // Load chime status on mount
  useEffect(() => {
    api.getChimeStatus().then(s => setChimeExists(s.exists)).catch(() => {});
  }, []); // eslint-disable-line

  const handleChimeUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().match(/\.(mp3|wav|ogg)$/)) {
      toast.error('Only MP3, WAV, OGG allowed'); return;
    }
    setChimeUploading(true);
    try {
      await api.uploadChime(file);
      setChimeExists(true);
      toast.success('Chime uploaded!');
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setChimeUploading(false);
      if (chimeInputRef.current) chimeInputRef.current.value = '';
    }
  };

  const handleDeleteChime = async () => {
    if (!window.confirm('Delete the on-air chime?')) return;
    try {
      await api.deleteChime();
      setChimeExists(false);
      toast.info('Chime deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleTestDb = async () => {
    setDbTesting(true);
    setDbStatus(null);
    try {
      const payload = {
        value: {
          db_mode: dbMode,
          ...(dbMode === 'cloud' && { supabase_url: supabaseUrl, supabase_key: supabaseKey }),
        }
      };
      const res = await fetch('/api/settings/db-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setDbStatus('ok');
        const migrationsMsg = data.migrations_applied > 0
          ? ` — ${data.migrations_applied} migration(s) applied`
          : ' — migrations up to date';
        toast.success(`Connected!${migrationsMsg}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setDbStatus('error');
        toast.error('Failed: ' + (err.detail || res.statusText));
      }
    } catch (err) {
      setDbStatus('error');
      toast.error('Failed: ' + err.message);
    } finally {
      setDbTesting(false);
    }
  };

  const handleSaveDb = async () => {
    setDbSaving(true);
    try {
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
        if (name !== decks[id]?.name) await api.renameDeck(id, name);
      }
      await api.saveSettings({
        ducking_percent: ducking,
        mic_ducking_percent: micDucking,
        db_mode: dbMode,
        on_air_chime_enabled: chimeEnabled,
      });
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const panel = { marginBottom: '0', padding: '1.5rem' };
  const lbl = { display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' };
  const inp = { width: '100%', padding: '0.6rem 0.9rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Station Settings</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '780px' }}>

        {/* Database Mode */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Database Mode</h3>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
            {['local', 'cloud'].map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <input type="radio" name="db_mode" value={mode} checked={dbMode === mode}
                  onChange={() => { setDbMode(mode); setDbStatus(null); }}
                  style={{ accentColor: 'var(--accent-blue)' }} />
                <span>{mode === 'local' ? '🖥 Local (PostgreSQL)' : '☁️ Cloud (Supabase)'}</span>
              </label>
            ))}
          </div>

          {dbMode === 'cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
              <div>
                <label style={lbl}>Supabase Project URL</label>
                <input type="text" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxxxxxxxxx.supabase.co" style={inp} />
              </div>
              <div>
                <label style={lbl}>Service Role Key (secret)</label>
                <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." style={inp} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                Find these in Supabase → Project Settings → API. Use the <strong>service_role</strong> key (not anon).
              </p>
            </div>
          )}

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {dbMode === 'local'
              ? '✅ Using built-in PostgreSQL. No extra config needed.'
              : '⚠️ Migrations will run automatically when you click Test Connection.'}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleTestDb} disabled={dbTesting} style={{
              padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'inherit',
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)',
              color: 'var(--accent-blue)', borderRadius: '8px', cursor: dbTesting ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: dbTesting ? 0.6 : 1,
            }}>
              {dbTesting ? '⟳ Testing & migrating…' : '⚡ Test Connection'}
            </button>
            {dbStatus && (
              <span style={{
                fontSize: '0.8rem', fontWeight: '600', padding: '0.3rem 0.75rem', borderRadius: '20px',
                background: dbStatus === 'ok' ? 'rgba(46,213,115,0.15)' : 'rgba(255,71,87,0.15)',
                border: `1px solid ${dbStatus === 'ok' ? 'rgba(46,213,115,0.4)' : 'rgba(255,71,87,0.4)'}`,
                color: dbStatus === 'ok' ? '#2ed573' : '#ff4757',
              }}>
                {dbStatus === 'ok' ? '✓ Connected' : '✕ Unreachable'}
              </span>
            )}
            <button onClick={handleSaveDb} disabled={dbSaving} style={{
              marginLeft: 'auto', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontFamily: 'inherit',
              background: 'rgba(46,213,115,0.15)', border: '1px solid rgba(46,213,115,0.4)',
              color: '#2ed573', borderRadius: '8px', cursor: dbSaving ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: dbSaving ? 0.6 : 1,
            }}>
              {dbSaving ? '✓ Saving…' : '💾 Save'}
            </button>
          </div>
        </div>

        {/* Deck Names */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Deck Names</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {['a', 'b', 'c', 'd'].map(id => (
              <div key={id}>
                <label style={lbl}>Deck {id.toUpperCase()}</label>
                <input type="text" value={deckNames[id]}
                  onChange={e => setDeckNames(prev => ({ ...prev, [id]: e.target.value }))}
                  style={inp} placeholder={`Deck ${id.toUpperCase()}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Audio Preferences */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Audio Preferences</h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
              <span>📢 Announcement Ducking</span><span style={{ color: 'var(--accent-blue)' }}>{ducking}%</span>
            </label>
            <input type="range" min="0" max="100" value={ducking} onChange={e => setDucking(Number(e.target.value))}
              style={{ width: '100%', maxWidth: '380px', background: `linear-gradient(to right, var(--accent-blue) ${ducking}%, rgba(255,255,255,0.15) ${ducking}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Volume music drops to when an announcement plays.</div>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
              <span>🎙 On Air Mic Ducking</span><span style={{ color: '#ff4757' }}>{micDucking}%</span>
            </label>
            <input type="range" min="0" max="100" value={micDucking} onChange={e => setMicDucking(Number(e.target.value))}
              style={{ width: '100%', maxWidth: '380px', background: `linear-gradient(to right, #ff4757 ${micDucking}%, rgba(255,255,255,0.15) ${micDucking}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Volume music fades to when DJ mic is On Air. Default 20%.</div>
          </div>
        </div>

        {/* On Air Chime */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '0.35rem', color: 'var(--accent-blue)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={16} /> On Air Chime
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Play a short sound before every mic activation and announcement. Upload your own MP3 (the classic "ding ding ding" or any jingle).
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <div
                onClick={() => setChimeEnabled(v => !v)}
                style={{
                  width: '42px', height: '24px', borderRadius: '12px', position: 'relative', cursor: 'pointer',
                  background: chimeEnabled ? 'var(--accent-blue)' : 'rgba(255,255,255,0.15)',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: chimeEnabled ? '21px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'white', transition: 'left 0.2s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </div>
              <span style={{ fontSize: '0.9rem', color: chimeEnabled ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                {chimeEnabled ? 'Chime enabled' : 'Chime disabled'}
              </span>
            </label>
            {!chimeExists && chimeEnabled && (
              <span style={{ fontSize: '0.78rem', color: '#fd9644', background: 'rgba(253,150,68,0.1)', padding: '0.2rem 0.6rem', borderRadius: '10px', border: '1px solid rgba(253,150,68,0.3)' }}>
                ⚠ No chime uploaded yet
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => chimeInputRef.current?.click()}
              disabled={chimeUploading}
              style={{
                padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid rgba(0,212,255,0.35)',
                background: 'rgba(0,212,255,0.1)', color: 'var(--accent-blue)',
                cursor: chimeUploading ? 'default' : 'pointer', fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: chimeUploading ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              <Upload size={14} />
              {chimeUploading ? 'Uploading…' : chimeExists ? 'Replace Chime' : 'Upload Chime MP3'}
            </button>
            <input
              ref={chimeInputRef} type="file" accept=".mp3,.wav,.ogg"
              style={{ display: 'none' }}
              onChange={e => handleChimeUpload(e.target.files[0] || null)}
            />
            {chimeExists && (
              <>
                <span style={{ fontSize: '0.82rem', color: '#2ed573', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  ✓ Chime file ready
                </span>
                <button
                  onClick={handleDeleteChime}
                  style={{
                    padding: '0.5rem 0.8rem', borderRadius: '8px',
                    border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.08)',
                    color: '#ff4757', cursor: 'pointer', fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'inherit',
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
          </div>

          <div style={{ marginTop: '0.85rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
            Supports MP3, WAV, OGG. Keep it short — 1–3 seconds recommended.
            The chime plays simultaneously on all target decks before the mic / announcement.
          </div>
        </div>

        {/* Appearance */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Appearance</h3>
          <p style={{ marginBottom: '0.85rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Dashboard Background Image</p>
          <div style={{ padding: '2rem', border: '2px dashed var(--panel-border)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', cursor: 'pointer', background: 'rgba(0,0,0,0.15)', fontSize: '0.88rem' }}
            onClick={() => document.getElementById('bgUpload')?.click()}>
            Drag & Drop image or click to browse
          </div>
          <input id="bgUpload" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              document.body.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
              document.body.style.backgroundSize = 'cover';
              toast.success('Background updated (preview only)');
            }} />
        </div>

        {/* Save All */}
        <button onClick={handleSave} disabled={saving} style={{
          padding: '1rem', background: saving ? 'rgba(46,213,115,0.3)' : 'var(--success)',
          border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1rem',
          borderRadius: '10px', boxShadow: '0 0 20px rgba(46,213,115,0.35)',
          cursor: saving ? 'default' : 'pointer', transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
        }}>
          <Save size={18} />
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>

      </div>
    </div>
  );
}
