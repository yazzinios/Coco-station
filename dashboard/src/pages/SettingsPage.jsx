import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, Trash2, Music2, Globe, Clock, Building2 } from 'lucide-react';
import { useApp } from '../context/useApp';

// ── JingleCard must live OUTSIDE SettingsPage so React never remounts it
function JingleCard({ type, label, description, exists, filename, uploading, inputRef, onUpload, onDelete }) {
  return (
    <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)' }}>
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ fontWeight: '600', fontSize: '0.88rem', marginBottom: '0.2rem', color: exists ? '#a55eea' : 'var(--text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{description}</div>
        {exists && filename && (
          <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#a55eea', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Music2 size={10} /> {filename.replace(/\.[^.]+$/, '').replace('global_jingle_', '')}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '0.4rem 0.85rem', borderRadius: '7px', border: '1px solid rgba(165,94,234,0.4)',
            background: 'rgba(165,94,234,0.1)', color: '#a55eea',
            cursor: uploading ? 'default' : 'pointer', fontSize: '0.82rem',
            display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: uploading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          <Upload size={13} />
          {uploading ? 'Uploading…' : exists ? 'Replace' : 'Upload MP3'}
        </button>
        <input
          ref={inputRef} type="file" accept=".mp3,.wav,.ogg" style={{ display: 'none' }}
          onChange={e => onUpload(type, e.target.files[0] || null)}
        />
        {exists ? (
          <>
            <span style={{ fontSize: '0.78rem', color: '#2ed573' }}>✓ Ready</span>
            <button
              onClick={() => onDelete(type)}
              style={{ padding: '0.35rem 0.65rem', borderRadius: '7px', border: '1px solid rgba(255,71,87,0.3)',
                background: 'rgba(255,71,87,0.08)', color: '#ff4757', cursor: 'pointer', fontSize: '0.78rem',
                display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit' }}>
              <Trash2 size={12} /> Delete
            </button>
          </>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>No file uploaded</span>
        )}
      </div>
    </div>
  );
}

const TIMEZONES = [
  'Africa/Casablanca', 'Africa/Abidjan', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Cairo', 'Africa/Johannesburg',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Lisbon',
  'Europe/Moscow', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'America/Mexico_City',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Seoul',
  'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'UTC',
];

export default function SettingsPage() {
  const { decks, toast, api, settings } = useApp();

  const [deckNames,    setDeckNames]    = useState({ a: '', b: '', c: '', d: '' });
  const [ducking,      setDucking]      = useState(5);
  const [micDucking,   setMicDucking]   = useState(20);
  const [dbMode,       setDbMode]       = useState('local');
  const [supabaseUrl,  setSupabaseUrl]  = useState('');
  const [supabaseKey,  setSupabaseKey]  = useState('');
  const [timezone,     setTimezone]     = useState('Africa/Casablanca');
  const [sessionHours, setSessionHours] = useState(8);
  const [saving,       setSaving]       = useState(false);
  const [dbSaving,     setDbSaving]     = useState(false);
  const [dbTesting,    setDbTesting]    = useState(false);
  const [dbStatus,     setDbStatus]     = useState(null);

  // LDAP
  const [ldapEnabled,       setLdapEnabled]       = useState(false);
  const [ldapServer,        setLdapServer]        = useState('');
  const [ldapPort,          setLdapPort]          = useState(389);
  const [ldapBaseDn,        setLdapBaseDn]        = useState('');
  const [ldapBindDn,        setLdapBindDn]        = useState('');
  const [ldapBindPw,        setLdapBindPw]        = useState('');
  const [ldapUserFilter,    setLdapUserFilter]    = useState('(sAMAccountName={username})');
  const [ldapAttrName,      setLdapAttrName]      = useState('cn');
  const [ldapAttrEmail,     setLdapAttrEmail]     = useState('mail');
  const [ldapUseSsl,        setLdapUseSsl]        = useState(false);
  const [ldapTlsVerify,     setLdapTlsVerify]     = useState(true);
  const [ldapTesting,       setLdapTesting]       = useState(false);
  const [ldapSaving,        setLdapSaving]        = useState(false);
  const [ldapStatus,        setLdapStatus]        = useState(null);
  const [ldapExpanded,      setLdapExpanded]      = useState(false);
  const [ldapInfo,          setLdapInfo]          = useState(null);   // { user_count, groups }
  const [ldapInfoLoading,   setLdapInfoLoading]   = useState(false);

  // Company Customization
  const [companyName,       setCompanyName]       = useState('');
  const [companyLogoUrl,    setCompanyLogoUrl]    = useState(null);
  const [companyLogoFile,   setCompanyLogoFile]   = useState(null);
  const [companySaving,     setCompanySaving]     = useState(false);
  const logoInputRef = useRef(null);

  // Jingles
  const [jingleIntroExists,    setJingleIntroExists]    = useState(false);
  const [jingleIntroFilename,  setJingleIntroFilename]  = useState(null);
  const [jingleOutroExists,    setJingleOutroExists]    = useState(false);
  const [jingleOutroFilename,  setJingleOutroFilename]  = useState(null);
  const [jingleUploading,      setJingleUploading]      = useState({ intro: false, outro: false });
  const jingleIntroRef = useRef(null);
  const jingleOutroRef = useRef(null);

  // Sync from settings context
  useEffect(() => {
    setDeckNames({
      a: decks.a?.name || 'Deck A', b: decks.b?.name || 'Deck B',
      c: decks.c?.name || 'Deck C', d: decks.d?.name || 'Deck D',
    });
  }, [decks]);

  useEffect(() => {
    if (settings?.ducking_percent    != null) setDucking(settings.ducking_percent);
    if (settings?.mic_ducking_percent != null) setMicDucking(settings.mic_ducking_percent);
    if (settings?.db_mode)                    setDbMode(settings.db_mode);
    if (settings?.timezone)                   setTimezone(settings.timezone);
    if (settings?.session_hours != null)      setSessionHours(Number(settings.session_hours));
    // LDAP
    setLdapEnabled(settings?.ldap_enabled ?? false);
    if (settings?.ldap_server)      setLdapServer(settings.ldap_server);
    if (settings?.ldap_port)        setLdapPort(settings.ldap_port);
    if (settings?.ldap_base_dn)     setLdapBaseDn(settings.ldap_base_dn);
    if (settings?.ldap_bind_dn)     setLdapBindDn(settings.ldap_bind_dn);
    if (settings?.ldap_bind_pw)     setLdapBindPw(settings.ldap_bind_pw);
    if (settings?.ldap_user_filter) setLdapUserFilter(settings.ldap_user_filter);
    if (settings?.ldap_attr_name)   setLdapAttrName(settings.ldap_attr_name);
    if (settings?.ldap_attr_email)  setLdapAttrEmail(settings.ldap_attr_email);
    setLdapUseSsl(settings?.ldap_use_ssl ?? false);
    setLdapTlsVerify(settings?.ldap_tls_verify ?? true);
    // Company
    if (settings?.company_name != null) setCompanyName(settings.company_name || '');
    if (settings?.company_logo) {
      setCompanyLogoUrl(`${api.baseUrl || ''}/api/settings/company/logo?t=${Date.now()}`);
    } else {
      setCompanyLogoUrl(null);
    }
  }, [settings]);

  // Auto-fetch LDAP info when enabled and section expanded
  useEffect(() => {
    if (ldapEnabled && ldapExpanded && !ldapInfo && !ldapInfoLoading) {
      fetchLdapInfo();
    }
  }, [ldapEnabled, ldapExpanded]);

  // Load jingle status on mount
  useEffect(() => {
    api.getJingleStatus().then(s => {
      setJingleIntroExists(s.intro?.exists ?? false);
      setJingleIntroFilename(s.intro?.filename ?? null);
      setJingleOutroExists(s.outro?.exists ?? false);
      setJingleOutroFilename(s.outro?.filename ?? null);
    }).catch(() => {});
  }, [api, settings.jingle_intro, settings.jingle_outro]);

  // ── LDAP Info ──
  const fetchLdapInfo = async () => {
    setLdapInfoLoading(true);
    try {
      const res = await api.authFetch('/api/settings/ldap/info');
      if (res.ok) {
        const data = await res.json();
        setLdapInfo(data);
      }
    } catch (_) {}
    finally { setLdapInfoLoading(false); }
  };

  // ── Company Customization ──
  const handleCompanyLogoSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files allowed'); return; }
    setCompanyLogoFile(file);
    setCompanyLogoUrl(URL.createObjectURL(file));
  };

  const handleCompanySave = async () => {
    setCompanySaving(true);
    try {
      // Upload logo if a new file was selected
      if (companyLogoFile) {
        const fd = new FormData();
        fd.append('file', companyLogoFile);
        const r = await api.authFetch('/api/settings/company/logo', { method: 'POST', body: fd });
        if (!r.ok) throw new Error('Logo upload failed');
        setCompanyLogoFile(null);
      }
      // Save company name
      await api.saveSettings({ company_name: companyName });
      toast.success('Company settings saved!');
    } catch (err) { toast.error(`Save failed: ${err.message}`); }
    finally { setCompanySaving(false); }
  };

  const handleDeleteCompanyLogo = async () => {
    if (!window.confirm('Delete company logo?')) return;
    try {
      await api.authFetch('/api/settings/company/logo', { method: 'DELETE' });
      setCompanyLogoUrl(null);
      setCompanyLogoFile(null);
      toast.info('Logo deleted');
    } catch (err) { toast.error(err.message); }
  };

  // ── Jingles ──
  const handleJingleUpload = async (type, file) => {
    if (!file) return;
    if (!file.name.toLowerCase().match(/\.(mp3|wav|ogg)$/)) { toast.error('Only MP3, WAV, OGG allowed'); return; }
    setJingleUploading(prev => ({ ...prev, [type]: true }));
    try {
      const result = await api.uploadJingle(type, file);
      if (type === 'intro') { setJingleIntroExists(true); setJingleIntroFilename(result.filename); }
      else                  { setJingleOutroExists(true); setJingleOutroFilename(result.filename); }
      toast.success(`${type === 'intro' ? 'Intro' : 'Outro'} jingle uploaded!`);
    } catch (err) { toast.error(`Upload failed: ${err.message}`); }
    finally {
      setJingleUploading(prev => ({ ...prev, [type]: false }));
      const ref = type === 'intro' ? jingleIntroRef : jingleOutroRef;
      if (ref.current) ref.current.value = '';
    }
  };

  const handleDeleteJingle = async (type) => {
    if (!window.confirm(`Delete the ${type} jingle?`)) return;
    try {
      await api.deleteJingle(type);
      if (type === 'intro') { setJingleIntroExists(false); setJingleIntroFilename(null); }
      else                  { setJingleOutroExists(false); setJingleOutroFilename(null); }
      toast.info(`${type === 'intro' ? 'Intro' : 'Outro'} jingle deleted`);
    } catch (err) { toast.error(err.message); }
  };

  // ── DB test ──
  const handleTestDb = async () => {
    setDbTesting(true); setDbStatus(null);
    try {
      const payload = { value: { db_mode: dbMode, ...(dbMode === 'cloud' && { supabase_url: supabaseUrl, supabase_key: supabaseKey }) } };
      const res = await api.authFetch('/api/settings/db-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = await res.json();
        setDbStatus('ok');
        toast.success(`Connected! ${data.migrations_applied > 0 ? `— ${data.migrations_applied} migration(s) applied` : '— migrations up to date'}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setDbStatus('error'); toast.error('Failed: ' + (err.detail || res.statusText));
      }
    } catch (err) { setDbStatus('error'); toast.error('Failed: ' + err.message); }
    finally { setDbTesting(false); }
  };

  const handleSaveDb = async () => {
    setDbSaving(true);
    try {
      const payload = { db_mode: dbMode };
      if (dbMode === 'cloud') { payload.supabase_url = supabaseUrl; payload.supabase_key = supabaseKey; }
      await api.saveSettings(payload);
      toast.success('Database setting saved!');
    } catch (err) { toast.error(`Save failed: ${err.message}`); }
    finally { setDbSaving(false); }
  };

  // ── Save all ──
  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [id, name] of Object.entries(deckNames)) {
        if (name !== decks[id]?.name) await api.renameDeck(id, name);
      }
      await api.saveSettings({
        ducking_percent:     ducking,
        mic_ducking_percent: micDucking,
        db_mode:             dbMode,
        timezone:            timezone,
        session_hours:       sessionHours,
      });
      toast.success('Settings saved! Timezone change requires API restart to take effect.');
    } catch (err) { toast.error(`Save failed: ${err.message}`); }
    finally { setSaving(false); }
  };

  // ── LDAP handlers ──
  const ldapPayload = () => {
    const port = parseInt(ldapPort, 10);
    return {
      server:           ldapServer || '',
      port:             isNaN(port) ? 389 : port,
      base_dn:          ldapBaseDn || '',
      bind_dn:          ldapBindDn || '',
      bind_pw:          ldapBindPw || '',
      user_filter:      ldapUserFilter || '(sAMAccountName={username})',
      attr_name:        ldapAttrName || 'cn',
      attr_email:       ldapAttrEmail || 'mail',
      use_ssl:          !!ldapUseSsl,
      tls_verify:       !!ldapTlsVerify,
    };
  };

  const handleLdapTest = async () => {
    if (!ldapServer) { toast.error('LDAP Server URL required'); return; }
    const p = parseInt(ldapPort, 10);
    if (isNaN(p) || p <= 0) { toast.error('Valid LDAP Port required'); return; }
    setLdapTesting(true); setLdapStatus(null);
    try {
      const r = await api.testLdap(ldapPayload());
      setLdapStatus('ok');
      toast.success('LDAP connected! ' + r.detail);
    } catch (e) { setLdapStatus('error'); toast.error('LDAP error: ' + e.message); }
    finally { setLdapTesting(false); }
  };

  const handleLdapSave = async (enabled) => {
    if (enabled && !ldapServer) { toast.error('LDAP Server URL required'); return; }
    setLdapSaving(true);
    try {
      await api.saveLdap(ldapPayload(), enabled);
      setLdapEnabled(enabled);
      if (enabled) {
        setLdapInfo(null); // Reset so it re-fetches
        fetchLdapInfo();
      }
      toast.success(enabled ? 'LDAP enabled & saved!' : 'LDAP disabled.');
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setLdapSaving(false); }
  };

  const panel = { marginBottom: '0', padding: '1.5rem' };
  const lbl = { display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' };
  const inp = { width: '100%', padding: '0.6rem 0.9rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Station Settings</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '780px' }}>

        {/* ── Company Customization ── */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '0.3rem', color: 'var(--accent-blue)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={16} /> Company Customization
          </h3>
          <p style={{ margin: '0 0 1.4rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Your brand shown in the header, sidebar, browser tab, and login screen.
          </p>

          {/* Live Preview Banner */}
          <div style={{
            marginBottom: '1.5rem', padding: '0.85rem 1.1rem', borderRadius: '10px',
            background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)',
            display: 'flex', alignItems: 'center', gap: '0.85rem',
          }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Preview</span>
            <div style={{ width: '1px', height: '28px', background: 'var(--panel-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1 }}>
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="logo preview"
                  style={{ height: '28px', width: '28px', objectFit: 'contain', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', padding: '2px' }} />
              ) : (
                <div style={{ height: '28px', width: '28px', borderRadius: '5px', background: 'rgba(0,212,255,0.1)', border: '1px dashed rgba(0,212,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--accent-blue)' }}>🏢</div>
              )}
              <span style={{ fontSize: '1rem', fontWeight: 600, color: 'white' }}>
                {companyName || 'Your Station Name'}
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>header</span>
          </div>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── Logo Upload Zone ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
              <div
                onClick={() => logoInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)'; e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = companyLogoUrl ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = companyLogoUrl ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)';
                  e.currentTarget.style.background = 'rgba(0,0,0,0.25)';
                  const file = e.dataTransfer.files[0];
                  if (file) handleCompanyLogoSelect(file);
                }}
                style={{
                  width: '120px', height: '120px', borderRadius: '14px',
                  border: `2px dashed ${companyLogoUrl ? 'rgba(0,212,255,0.45)' : 'rgba(255,255,255,0.15)'}`,
                  background: 'rgba(0,0,0,0.25)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', transition: 'border-color 0.2s, background 0.2s', position: 'relative',
                }}
              >
                {companyLogoUrl ? (
                  <img src={companyLogoUrl} alt="logo"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px' }} />
                ) : (
                  <>
                    <Upload size={22} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: '0.4rem' }} />
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '0 0.5rem', lineHeight: 1.4 }}>Click or drag logo here</span>
                  </>
                )}
                {companyLogoUrl && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.2s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                  >
                    <span style={{ fontSize: '0.72rem', color: 'white', fontWeight: 600 }}>Change</span>
                  </div>
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleCompanyLogoSelect(e.target.files[0] || null)} />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => logoInputRef.current?.click()}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.76rem', fontFamily: 'inherit', borderRadius: '7px', cursor: 'pointer',
                    background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: 'var(--accent-blue)',
                    display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Upload size={12} /> {companyLogoUrl ? 'Replace' : 'Upload'}
                </button>
                {companyLogoUrl && (
                  <button onClick={handleDeleteCompanyLogo}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', fontFamily: 'inherit', borderRadius: '7px', cursor: 'pointer',
                      background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', color: '#ff4757',
                      display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>PNG · JPG · SVG · WEBP</span>
            </div>

            {/* ── Fields + Save ── */}
            <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div>
                <label style={lbl}>Station / Company Name</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. CocoStation FM"
                  style={{ ...inp, fontSize: '1rem', fontWeight: 500 }} />
                <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.8rem' }}>
                  <span>📑 Browser tab</span><span>🖥 Header</span><span>🔐 Login screen</span>
                </div>
              </div>

              {/* Logo tips */}
              <div style={{ padding: '0.7rem 0.9rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <div style={{ marginBottom: '0.3rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>💡 Logo tips</div>
                Square format works best · Transparent PNG recommended · Min 128 × 128 px
              </div>

              <button onClick={handleCompanySave} disabled={companySaving}
                style={{
                  padding: '0.6rem 1.3rem', fontSize: '0.9rem', fontFamily: 'inherit', borderRadius: '9px', alignSelf: 'flex-start',
                  background: companySaving ? 'rgba(46,213,115,0.08)' : 'rgba(46,213,115,0.15)',
                  border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573',
                  cursor: companySaving ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  opacity: companySaving ? 0.6 : 1,
                  boxShadow: companySaving ? 'none' : '0 0 14px rgba(46,213,115,0.12)',
                  transition: 'all 0.2s',
                }}>
                {companySaving ? '⟳ Saving…' : <><Save size={14} /> Save Branding</>}
              </button>
            </div>
          </div>
        </div>

        {/* Database Mode */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem' }}>Database Mode</h3>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
            {['local', 'cloud'].map(mode => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <input type="radio" name="db_mode" value={mode} checked={dbMode === mode}
                  onChange={() => { setDbMode(mode); setDbStatus(null); }} style={{ accentColor: 'var(--accent-blue)' }} />
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
                  placeholder="eyJhbGci…" style={inp} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleTestDb} disabled={dbTesting} style={{
              padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'inherit',
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)',
              color: 'var(--accent-blue)', borderRadius: '8px', cursor: dbTesting ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: dbTesting ? 0.6 : 1,
            }}>
              {dbTesting ? '⟳ Testing…' : '⚡ Test Connection'}
            </button>
            {dbStatus && (
              <span style={{ fontSize: '0.8rem', fontWeight: '600', padding: '0.3rem 0.75rem', borderRadius: '20px',
                background: dbStatus === 'ok' ? 'rgba(46,213,115,0.15)' : 'rgba(255,71,87,0.15)',
                border: `1px solid ${dbStatus === 'ok' ? 'rgba(46,213,115,0.4)' : 'rgba(255,71,87,0.4)'}`,
                color: dbStatus === 'ok' ? '#2ed573' : '#ff4757' }}>
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

        {/* LDAP / Active Directory */}
        <div className="glass-panel" style={panel}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setLdapExpanded(v => !v)}
          >
            <h3 style={{ margin: 0, color: ldapEnabled ? '#a55eea' : 'var(--accent-blue)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔑 LDAP / Active Directory
              {ldapEnabled && <span style={{ fontSize: '0.7rem', background: 'rgba(165,94,234,0.15)', color: '#a55eea', padding: '0.1rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(165,94,234,0.3)' }}>ENABLED</span>}
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ldapExpanded ? '▲' : '▼'}</span>
          </div>

          {!ldapExpanded && (
            <p style={{ marginTop: '0.6rem', marginBottom: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {ldapEnabled
                ? `Active — users authenticate via ${ldapServer || 'LDAP'}. Local fallback always available.`
                : 'Not configured. Click to expand and set up LDAP/AD authentication.'}
            </p>
          )}

          {/* LDAP Connected Stats (shown when enabled, even collapsed) */}
          {ldapEnabled && !ldapExpanded && ldapInfo && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(165,94,234,0.08)', border: '1px solid rgba(165,94,234,0.2)', fontSize: '0.8rem' }}>
                👥 <strong style={{ color: '#a55eea' }}>{ldapInfo.user_count ?? '—'}</strong> <span style={{ color: 'var(--text-secondary)' }}>LDAP users</span>
              </div>
              {ldapInfo.groups && ldapInfo.groups.length > 0 && (
                <div style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(165,94,234,0.08)', border: '1px solid rgba(165,94,234,0.2)', fontSize: '0.8rem' }}>
                  🗂 <strong style={{ color: '#a55eea' }}>{ldapInfo.groups.length}</strong> <span style={{ color: 'var(--text-secondary)' }}>groups</span>
                </div>
              )}
            </div>
          )}

          {ldapExpanded && (
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0.6rem 0.85rem', background: 'rgba(165,94,234,0.06)', borderRadius: '8px', border: '1px solid rgba(165,94,234,0.15)' }}>
                📌 When enabled, users log in with their LDAP/AD credentials. Local accounts (like <strong>cocoadmin</strong>) always remain available as fallback.
              </p>

              {/* LDAP Live Stats */}
              {ldapEnabled && (
                <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: 'rgba(165,94,234,0.06)', border: '1px solid rgba(165,94,234,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#a55eea' }}>📊 Directory Stats</span>
                    <button onClick={fetchLdapInfo} disabled={ldapInfoLoading}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontFamily: 'inherit', borderRadius: '6px', cursor: 'pointer',
                        background: 'rgba(165,94,234,0.1)', border: '1px solid rgba(165,94,234,0.3)', color: '#a55eea', opacity: ldapInfoLoading ? 0.5 : 1 }}>
                      {ldapInfoLoading ? '⟳ Loading…' : '↻ Refresh'}
                    </button>
                  </div>
                  {ldapInfoLoading && !ldapInfo && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Fetching from LDAP…</div>
                  )}
                  {ldapInfo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.82rem' }}>
                          👥 <strong style={{ color: 'white' }}>{ldapInfo.user_count ?? '—'}</strong>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.3rem' }}>users found</span>
                        </div>
                        <div style={{ fontSize: '0.82rem' }}>
                          🗂 <strong style={{ color: 'white' }}>{ldapInfo.groups?.length ?? '—'}</strong>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.3rem' }}>groups</span>
                        </div>
                      </div>
                      {ldapInfo.groups && ldapInfo.groups.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                          {ldapInfo.groups.slice(0, 12).map(g => (
                            <span key={g} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '12px',
                              background: 'rgba(165,94,234,0.12)', border: '1px solid rgba(165,94,234,0.25)', color: '#c89ef5' }}>
                              {g}
                            </span>
                          ))}
                          {ldapInfo.groups.length > 12 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{ldapInfo.groups.length - 12} more</span>
                          )}
                        </div>
                      )}
                      {ldapInfo.error && (
                        <div style={{ fontSize: '0.75rem', color: '#ff4757' }}>⚠ {ldapInfo.error}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Server + Port */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                <div>
                  <label style={lbl}>LDAP Server URL</label>
                  <input type="text" style={inp} value={ldapServer} onChange={e => setLdapServer(e.target.value)}
                    placeholder="ldap://192.168.1.10 or ldaps://dc.company.com" />
                </div>
                <div style={{ width: '90px' }}>
                  <label style={lbl}>Port</label>
                  <input type="number" style={inp} value={ldapPort} onChange={e => setLdapPort(Number(e.target.value))}
                    placeholder="389" />
                </div>
              </div>

              {/* Base DN */}
              <div>
                <label style={lbl}>Base DN</label>
                <input type="text" style={inp} value={ldapBaseDn} onChange={e => setLdapBaseDn(e.target.value)}
                  placeholder="dc=company,dc=com" />
              </div>

              {/* Bind DN + Bind PW */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={lbl}>Service Account DN</label>
                  <input type="text" style={inp} value={ldapBindDn} onChange={e => setLdapBindDn(e.target.value)}
                    placeholder="cn=svc-coco,dc=company,dc=com" />
                </div>
                <div>
                  <label style={lbl}>Service Account Password</label>
                  <input type="password" style={inp} value={ldapBindPw} onChange={e => setLdapBindPw(e.target.value)}
                    placeholder="••••••••" />
                </div>
              </div>

              {/* User filter */}
              <div>
                <label style={lbl}>User Search Filter <span style={{ color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 400 }}>({'{username}'} is replaced at login)</span></label>
                <input type="text" style={inp} value={ldapUserFilter} onChange={e => setLdapUserFilter(e.target.value)}
                  placeholder="(sAMAccountName={username})" />
              </div>

              {/* Attribute mapping */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={lbl}>Display Name Attribute</label>
                  <input type="text" style={inp} value={ldapAttrName} onChange={e => setLdapAttrName(e.target.value)}
                    placeholder="cn" />
                </div>
                <div>
                  <label style={lbl}>Email Attribute</label>
                  <input type="text" style={inp} value={ldapAttrEmail} onChange={e => setLdapAttrEmail(e.target.value)}
                    placeholder="mail" />
                </div>
              </div>

              {/* SSL + TLS */}
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={ldapUseSsl} onChange={e => { setLdapUseSsl(e.target.checked); if (e.target.checked) setLdapPort(636); else setLdapPort(389); }}
                    style={{ accentColor: '#a55eea' }} />
                  Use LDAPS (SSL) — port 636
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={ldapTlsVerify} onChange={e => setLdapTlsVerify(e.target.checked)}
                    style={{ accentColor: '#a55eea' }} />
                  Verify TLS certificate
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>(uncheck for self-signed)</span>
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--panel-border)' }}>
                <button onClick={handleLdapTest} disabled={ldapTesting || !ldapServer}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'inherit', borderRadius: '8px', cursor: (ldapTesting || !ldapServer) ? 'default' : 'pointer',
                    background: 'rgba(165,94,234,0.1)', border: '1px solid rgba(165,94,234,0.35)', color: '#a55eea',
                    display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: (ldapTesting || !ldapServer) ? 0.5 : 1 }}>
                  {ldapTesting ? '⟳ Testing…' : '⚡ Test Connection'}
                </button>

                {ldapStatus && (
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', padding: '0.3rem 0.75rem', borderRadius: '20px',
                    background: ldapStatus === 'ok' ? 'rgba(46,213,115,0.15)' : 'rgba(255,71,87,0.15)',
                    border: `1px solid ${ldapStatus === 'ok' ? 'rgba(46,213,115,0.4)' : 'rgba(255,71,87,0.4)'}`,
                    color: ldapStatus === 'ok' ? '#2ed573' : '#ff4757' }}>
                    {ldapStatus === 'ok' ? '✓ Reachable' : '✕ Unreachable'}
                  </span>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem' }}>
                  {ldapEnabled && (
                    <button onClick={() => handleLdapSave(false)} disabled={ldapSaving}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'inherit', borderRadius: '8px', cursor: 'pointer',
                        background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.35)', color: '#ff4757',
                        display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      🔴 Disable LDAP
                    </button>
                  )}
                  <button onClick={() => handleLdapSave(true)} disabled={ldapSaving || !ldapServer}
                    style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontFamily: 'inherit', borderRadius: '8px',
                      cursor: (ldapSaving || !ldapServer) ? 'default' : 'pointer',
                      background: 'rgba(46,213,115,0.15)', border: '1px solid rgba(46,213,115,0.4)', color: '#2ed573',
                      display: 'flex', alignItems: 'center', gap: '0.45rem', opacity: (ldapSaving || !ldapServer) ? 0.5 : 1 }}>
                    {ldapSaving ? '⟳ Saving…' : '💾 Save & Enable LDAP'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Time & Session */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '1.1rem', color: 'var(--accent-blue)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={16} /> Time & Session
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div>
              <label style={lbl}>Scheduler Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}
                style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}>
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                ⚠ Requires API container restart to apply.
              </div>
            </div>
            <div>
              <label style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={11} /> Session Duration
                </span>
                <span style={{ color: 'var(--accent-blue)' }}>{sessionHours}h</span>
              </label>
              <input type="range" min="1" max="48" step="1" value={sessionHours}
                onChange={e => setSessionHours(Number(e.target.value))}
                style={{ width: '100%', background: `linear-gradient(to right, var(--accent-blue) ${(sessionHours/48)*100}%, rgba(255,255,255,0.15) ${(sessionHours/48)*100}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                How long users stay logged in (1–48 h). Default: 8h per shift.
              </div>
            </div>
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
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Volume music drops to during an announcement.</div>
          </div>
          <div>
            <label style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
              <span>🎙 On Air Mic Ducking</span><span style={{ color: '#ff4757' }}>{micDucking}%</span>
            </label>
            <input type="range" min="0" max="100" value={micDucking} onChange={e => setMicDucking(Number(e.target.value))}
              style={{ width: '100%', maxWidth: '380px', background: `linear-gradient(to right, #ff4757 ${micDucking}%, rgba(255,255,255,0.15) ${micDucking}%)`, height: '4px', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }} />
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Volume music fades to when DJ mic is On Air.</div>
          </div>
        </div>

        {/* Global Jingles */}
        <div className="glass-panel" style={panel}>
          <h3 style={{ marginBottom: '0.4rem', color: '#a55eea', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Music2 size={16} /> Global Jingles
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            These jingles play automatically around <strong>every mic activation</strong> and <strong>every announcement</strong>.
            No schedule configuration needed — they are global.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <JingleCard
              type="intro" label="🎵 Intro Jingle" inputRef={jingleIntroRef}
              description="Plays before the mic opens / announcement starts."
              exists={jingleIntroExists} filename={jingleIntroFilename}
              uploading={jingleUploading.intro}
              onUpload={handleJingleUpload}
              onDelete={handleDeleteJingle}
            />
            <JingleCard
              type="outro" label="🎵 Outro Jingle" inputRef={jingleOutroRef}
              description="Plays after the mic closes / announcement ends."
              exists={jingleOutroExists} filename={jingleOutroFilename}
              uploading={jingleUploading.outro}
              onUpload={handleJingleUpload}
              onDelete={handleDeleteJingle}
            />
          </div>
          <div style={{ marginTop: '0.85rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(165,94,234,0.05)', border: '1px solid rgba(165,94,234,0.15)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span>🔒</span>
            <span>Jingle files are saved on a persistent volume and their names are stored in the database — they survive container rebuilds and restarts.</span>
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
