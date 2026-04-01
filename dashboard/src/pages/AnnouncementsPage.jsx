import React, { useState, useRef, useCallback } from 'react';
import { Mic, Upload, Send, Play, Trash2, Calendar, Clock, Copy, Check, Radio, Edit2, X, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';

const ORIGIN = window.location.origin;
const HOST   = window.location.hostname;

function getStreamLinks(deckId) {
  return [
    { label: 'HLS',   desc: 'Browser / VLC',        url: `${ORIGIN}/${deckId}/index.m3u8` },
    { label: 'WebRTC',desc: 'Low Latency Browser',   url: `${ORIGIN}/${deckId}/whep` },
    { label: 'RTSP',  desc: 'VLC / OBS (Internal)',  url: `rtsp://${HOST}:8554/${deckId}` },
    { label: 'RTMP',  desc: 'Streaming Software',    url: `rtmp://${HOST}:1935/${deckId}` },
  ];
}

const DECK_IDS = ['deck-a', 'deck-b', 'deck-c', 'deck-d'];

const TTS_LANGUAGES = [
  { code: 'en', label: '🇺🇸 English',  voice: 'en-US-AriaNeural' },
  { code: 'fr', label: '🇫🇷 Français', voice: 'fr-FR-DeniseNeural' },
  { code: 'ar', label: '🇸🇦 عربي',    voice: 'ar-SA-ZariyahNeural' },
  { code: 'es', label: '🇪🇸 Español',  voice: 'es-ES-ElviraNeural' },
  { code: 'de', label: '🇩🇪 Deutsch',  voice: 'de-DE-KatjaNeural' },
  { code: 'it', label: '🇮🇹 Italiano', voice: 'it-IT-ElsaNeural' },
  { code: 'ma', label: '🇲🇦 Darija',   voice: 'ar-MA-MounaNeural' },
];

export default function AnnouncementsPage() {
  const { announcements, toast, api } = useApp();
  const [type,          setType]          = useState('TTS');
  const [name,          setName]          = useState('');
  const [text,          setText]          = useState('');
  const [lang,          setLang]          = useState('en');
  const [selectedDecks, setSelectedDecks] = useState(['ALL']);
  const [submitting,    setSubmitting]    = useState(false);
  const [annFile,       setAnnFile]       = useState(null);
  const [scheduledAt,   setScheduledAt]   = useState('');
  const [copiedIdx,     setCopiedIdx]     = useState(null);
  const [streamDeck,    setStreamDeck]    = useState('deck-a');
  const [editingId,     setEditingId]     = useState(null);
  const [textDir,       setTextDir]       = useState('ltr');   // auto RTL detection
  const [listeners,     setListeners]     = useState({ total: 0, decks: {} });
  const fileRef = useRef(null);

  React.useEffect(() => {
    const poll = async () => {
      try {
        const data = await api.getListeners();
        setListeners(data);
      } catch {}
    };
    poll();
    const inv = setInterval(poll, 5000);
    return () => clearInterval(inv);
  }, [api]);

  const copyLink = async (url, idx) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedIdx(idx);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const toggleDeck = (deck) => {
    if (deck === 'ALL') { setSelectedDecks(['ALL']); return; }
    const filtered = selectedDecks.filter(d => d !== 'ALL');
    if (filtered.includes(deck)) {
      const next = filtered.filter(d => d !== deck);
      setSelectedDecks(next.length === 0 ? ['ALL'] : next);
    } else {
      setSelectedDecks([...filtered, deck]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Please give the announcement a name'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const editingAnn = announcements.find(a => a.id === editingId);
        if (editingAnn?.type === 'TTS' && text.trim()) {
          // TTS edit: delete old entry + audio file, then re-generate fresh TTS
          await api.deleteAnnouncement(editingId);
          await api.createTTS({
            name,
            text,
            lang,
            targets: selectedDecks,
            scheduled_at: scheduledAt || null,
          });
          toast.success('TTS re-generated!');
        } else {
          // MP3 edit: just update metadata (name / targets / schedule)
          await api.updateAnnouncement(editingId, {
            name,
            targets: selectedDecks,
            scheduled_at: scheduledAt || null,
          });
          toast.success('Announcement updated!');
        }
        resetForm();
      } else {
        if (type === 'TTS') {
          if (!text.trim()) { toast.error('Please enter TTS text'); setSubmitting(false); return; }
          await api.createTTS({
            name,
            text,
            lang,
            targets: selectedDecks,
            scheduled_at: scheduledAt || null,
          });
          toast.success(scheduledAt ? 'TTS announcement scheduled!' : 'TTS announcement created!');
          resetForm();
        } else {
          if (!annFile) { toast.error('Please select an audio file'); setSubmitting(false); return; }
          await api.uploadAnnouncement(annFile, name, selectedDecks, scheduledAt || null);
          toast.success(scheduledAt ? `"${annFile.name}" scheduled!` : `"${annFile.name}" uploaded`);
          resetForm();
        }
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── RTL auto-detect: Arabic / Darija codepoints ───────────────────
  const RTL_LANGS = ['ar', 'ma'];                              // ar = Arabic, ma = Darija
  const AR_RE     = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

  const handleTextChange = useCallback((val) => {
    setText(val);
    // If language is RTL or the first meaningful char is Arabic → flip direction
    if (RTL_LANGS.includes(lang)) {
      setTextDir('rtl');
    } else if (AR_RE.test(val.trimStart()[0] || '')) {
      setTextDir('rtl');
    } else {
      setTextDir('ltr');
    }
  }, [lang]);

  // Also flip direction immediately when language tab changes
  React.useEffect(() => {
    setTextDir(RTL_LANGS.includes(lang) ? 'rtl' : 'ltr');
  }, [lang]);

  const resetForm = () => {
    setName('');
    setText('');
    setScheduledAt('');
    setAnnFile(null);
    setEditingId(null);
    setSelectedDecks(['ALL']);
    setTextDir('ltr');
  };

  const handleEdit = (ann) => {
    setEditingId(ann.id);
    setName(ann.name);
    setType(ann.type);
    setSelectedDecks(ann.targets || ['ALL']);
    setScheduledAt(ann.scheduled_at ? ann.scheduled_at.slice(0, 16) : '');
    // Restore TTS text + language so user can edit and re-generate
    setText(ann.text || '');
    setLang(ann.lang || 'en');
    // Set RTL direction if language is Arabic/Darija
    const rtlLangs = ['ar', 'ma'];
    setTextDir(rtlLangs.includes(ann.lang || 'en') ? 'rtl' : 'ltr');
  };

  const handlePlay = async (ann) => {
    try {
      await api.playAnnouncement(ann.id);
      toast.success(`Playing: ${ann.name}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (ann) => {
    try {
      await api.deleteAnnouncement(ann.id);
      toast.info(`Deleted: ${ann.name}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const statusColor = (status) => {
    if (status === 'Played')    return { bg: 'rgba(46,213,115,0.1)',   color: '#2ed573' };
    if (status === 'Scheduled') return { bg: 'rgba(0,212,255,0.1)',    color: '#00d4ff' };
    return                             { bg: 'rgba(255,255,255,0.06)', color: '#a0a0a0' };
  };

  const inputStyle = {
    width: '100%', padding: '0.7rem 0.9rem', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Announcements</h2>
      <div className="announcements-grid">

        {/* ── Create Announcement ─────────────────────── */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mic size={16} /> {editingId ? 'Edit Announcement' : 'Create Announcement'}
            </span>
            {editingId && (
              <button onClick={resetForm} style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem' }}>
                <X size={14} /> Cancel Edit
              </button>
            )}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['TTS', 'MP3'].map(t => (
                  <button key={t} type="button" onClick={() => setType(t)} style={{
                    flex: 1, padding: '0.5rem',
                    background: type === t ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                    color: type === t ? '#000' : 'var(--text-secondary)',
                    border: type === t ? 'none' : '1px solid var(--panel-border)',
                    borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                    transition: 'all 0.2s',
                  }}>
                    {t === 'TTS' ? '🔊 Text-to-Speech' : '🎵 Upload MP3'}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Park Opens in 10 minutes"
                style={inputStyle} required
              />
            </div>

            {/* TTS fields */}
            {type === 'TTS' ? (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Language / Voice</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {TTS_LANGUAGES.map(l => (
                      <button key={l.code} type="button" onClick={() => setLang(l.code)} style={{
                        padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', fontSize: '0.78rem',
                        background: lang === l.code ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                        color: lang === l.code ? 'var(--accent-blue)' : 'var(--text-secondary)',
                        outline: lang === l.code ? '1px solid rgba(0,212,255,0.4)' : '1px solid var(--panel-border)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                    Voice: {TTS_LANGUAGES.find(l => l.code === lang)?.voice}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Text
                    {textDir === 'rtl' && (
                      <span style={{ marginRight: '0.5rem', fontSize: '0.68rem', background: 'rgba(0,212,255,0.15)', color: 'var(--accent-blue)', padding: '0.1rem 0.45rem', borderRadius: '4px', float: 'left', marginTop: '1px' }}>
                        ← يمين إلى يسار
                      </span>
                    )}
                  </label>
                  <textarea
                    value={text}
                    onChange={e => handleTextChange(e.target.value)}
                    placeholder={RTL_LANGS.includes(lang) ? 'اكتب النص هنا…' : 'Type what you want the robot to say…'}
                    rows="4"
                    dir={textDir}
                    lang={lang === 'ma' ? 'ar-MA' : lang}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      direction: textDir,
                      textAlign: textDir === 'rtl' ? 'right' : 'left',
                      fontFamily: textDir === 'rtl'
                        ? "'Segoe UI', 'Noto Sans Arabic', 'Arabic Typesetting', Arial, sans-serif"
                        : 'inherit',
                      fontSize: textDir === 'rtl' ? '1.05rem' : '0.9rem',
                      lineHeight: '1.7',
                      letterSpacing: textDir === 'rtl' ? '0' : 'inherit',
                      unicodeBidi: 'plaintext',
                    }}
                  />
                  {textDir === 'rtl' && (
                    <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textAlign: 'right', direction: 'rtl' }}>
                      {lang === 'ma' ? '🇲🇦 الدارجة المغربية — الكتابة من اليمين إلى اليسار' : '🇸🇦 العربية — الكتابة من اليمين إلى اليسار'}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Audio File</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '1.5rem', border: '2px dashed var(--panel-border)',
                    borderRadius: '8px', textAlign: 'center', cursor: 'pointer',
                    background: annFile ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.01)',
                    borderColor: annFile ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)',
                    transition: 'all 0.2s',
                  }}
                >
                  <Upload size={22} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                  <div style={{ fontSize: '0.85rem' }}>
                    {annFile ? annFile.name : 'Click to select MP3 / WAV / OGG'}
                  </div>
                </div>
                <input
                  ref={fileRef} type="file" accept=".mp3,.wav,.ogg"
                  style={{ display: 'none' }}
                  onChange={e => setAnnFile(e.target.files[0] || null)}
                />
              </div>
            )}

            {/* Schedule */}
            <div>
              <label style={{ marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={11} /> Schedule (optional)
              </label>
              <input
                type="datetime-local" value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
              {scheduledAt && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
                  ⏰ Will auto-play at {new Date(scheduledAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Target Decks */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Decks</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['ALL', 'A', 'B', 'C', 'D'].map(d => (
                  <button key={d} type="button" onClick={() => toggleDeck(d)} style={{
                    padding: '0.3rem 0.75rem',
                    background: selectedDecks.includes(d) ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: selectedDecks.includes(d) ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: `1px solid ${selectedDecks.includes(d) ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)'}`,
                    borderRadius: '20px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem',
                    transition: 'all 0.15s',
                  }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit" disabled={submitting}
              style={{
                marginTop: '0.25rem', padding: '0.85rem',
                background: submitting ? 'rgba(0,212,255,0.3)' : 'var(--accent-blue)',
                color: '#000', border: 'none', borderRadius: '8px',
                fontWeight: 'bold', cursor: submitting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 0.2s', fontSize: '0.95rem',
              }}
            >
              <Send size={16} />
              {submitting ? 'Processing…' : editingId ? 'Update Announcement' : (type === 'TTS' ? 'Generate & Add' : 'Upload & Schedule')}
            </button>
          </form>
        </div>

        {/* ── Announcement Library ─────────────────────── */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={16} /> Library
            </span>
            <span style={{
              fontSize: '0.75rem', fontWeight: '400',
              background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem', borderRadius: '10px',
            }}>{announcements.length}</span>
          </h3>

          {announcements.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '0.75rem', paddingTop: '3rem', color: 'var(--text-secondary)',
            }}>
              <Mic size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>No announcements yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto', maxHeight: '420px', paddingRight: '0.25rem' }}>
              {announcements.map(a => {
                const sc = statusColor(a.status);
                return (
                  <div key={a.id} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
                    borderRadius: '10px', padding: '0.85rem 1rem',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '500', fontSize: '0.9rem', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{
                          background: a.type === 'TTS' ? 'rgba(165,94,234,0.15)' : 'rgba(0,212,255,0.1)',
                          color: a.type === 'TTS' ? '#a55eea' : '#00d4ff',
                          padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem',
                        }}>{a.type}</span>
                        <span>→ {a.targets?.join(', ')}</span>
                        {a.scheduled_at && (
                          <span style={{ color: '#00d4ff' }}>
                            ⏰ {new Date(a.scheduled_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '10px', fontSize: '0.72rem',
                      background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{a.status}</span>
                    <button onClick={() => handlePlay(a)} title="Play announcement" style={{
                      width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                      background: 'rgba(46,213,115,0.15)', color: '#2ed573',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }}>
                      <Play size={12} fill="currentColor" />
                    </button>
                    <button onClick={() => handleEdit(a)} title="Edit announcement" style={{
                      width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                      background: 'rgba(255,255,255,0.1)', color: 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }}>
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => handleDelete(a)} title="Delete announcement" style={{
                      width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                      background: 'rgba(255,71,87,0.1)', color: '#ff4757',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Stream Links ──────────────────────────────────────── */}
      <div className="glass-panel" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Radio size={16} /> Stream Links
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(46,213,115,0.1)', color: '#2ed573', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>
              <Users size={14} /> {listeners.total} Live Listeners
            </span>
          </h3>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {DECK_IDS.map(d => (
              <button key={d} onClick={() => setStreamDeck(d)} style={{
                padding: '0.25rem 0.65rem', borderRadius: '6px', border: 'none', fontSize: '0.78rem', fontWeight: '600',
                background: streamDeck === d ? 'var(--accent-blue)' : 'rgba(255,255,255,0.06)',
                color: streamDeck === d ? '#000' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{d.replace('deck-', 'Deck ').toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
          {getStreamLinks(streamDeck).map((s, idx) => (
            <div key={idx} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
              borderRadius: '10px', padding: '0.85rem 1rem',
              display: 'flex', flexDirection: 'column', gap: '0.35rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '700', fontSize: '0.8rem', color: 'var(--accent-blue)' }}>{s.label}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{s.desc}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{
                  flex: 1, fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)',
                  background: 'rgba(0,0,0,0.25)', padding: '0.3rem 0.5rem',
                  borderRadius: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>{s.url}</code>
                <button
                  onClick={() => copyLink(s.url, idx)}
                  title="Copy link"
                  style={{
                    width: '30px', height: '30px', borderRadius: '8px', border: 'none', flexShrink: 0,
                    background: copiedIdx === idx ? 'rgba(46,213,115,0.2)' : 'rgba(255,255,255,0.06)',
                    color: copiedIdx === idx ? '#2ed573' : 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  {copiedIdx === idx ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
