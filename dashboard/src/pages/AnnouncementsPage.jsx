import React, { useState, useRef } from 'react';
import { Mic, Upload, Send, Play, Trash2, Calendar, Clock, Copy, Check, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';

const STREAM_BASE = `${window.location.protocol}//${window.location.hostname}`;
const STREAM_LINKS = [
  { label: 'HLS (browser)', url: `${STREAM_BASE}:8888/deck-a/index.m3u8`, desc: 'Deck A – HLS' },
  { label: 'WebRTC', url: `${STREAM_BASE}:8889/deck-a`, desc: 'Deck A – WebRTC' },
  { label: 'RTSP', url: `rtsp://${window.location.hostname}:8554/deck-a`, desc: 'Deck A – RTSP' },
  { label: 'RTMP', url: `rtmp://${window.location.hostname}:1935/deck-a`, desc: 'Deck A – RTMP' },
];

export default function AnnouncementsPage() {
  const { announcements, toast, api } = useApp();
  const [type, setType] = useState('TTS');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [selectedDecks, setSelectedDecks] = useState(['ALL']);
  const [submitting, setSubmitting] = useState(false);
  const [annFile, setAnnFile] = useState(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const fileRef = useRef(null);

  const copyLink = (url, idx) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
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
      if (type === 'TTS') {
        if (!text.trim()) { toast.error('Please enter TTS text'); setSubmitting(false); return; }
        await api.createTTS({ name, text, targets: selectedDecks, scheduled_at: scheduledAt || null });
        toast.success(scheduledAt ? 'TTS announcement scheduled!' : 'TTS announcement created!');
        setName(''); setText(''); setScheduledAt('');
      } else {
        if (!annFile) { toast.error('Please select an MP3 file'); setSubmitting(false); return; }
        await api.uploadAnnouncement(annFile, name, selectedDecks, scheduledAt || null);
        toast.success(scheduledAt ? `"${annFile.name}" scheduled!` : `"${annFile.name}" announcement uploaded`);
        setName(''); setAnnFile(null); setScheduledAt('');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
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
    if (status === 'Played')    return { bg: 'rgba(46,213,115,0.1)',  color: '#2ed573' };
    if (status === 'Scheduled') return { bg: 'rgba(0,212,255,0.1)',   color: '#00d4ff' };
    return                             { bg: 'rgba(255,255,255,0.06)', color: '#a0a0a0' };
  };

  const inputStyle = {
    width: '100%', padding: '0.7rem 0.9rem', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.9rem', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Announcements</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', gap: '2rem' }}>

        {/* ── Create Announcement ─────────────────────── */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mic size={16} /> Create Announcement
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

            {/* Content area */}
            {type === 'TTS' ? (
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Text</label>
                <textarea
                  value={text} onChange={e => setText(e.target.value)}
                  placeholder="Type what you want the robot to say..."
                  rows="4"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Audio File</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '1.5rem', border: '2px dashed var(--panel-border)',
                    borderRadius: '8px', textAlign: 'center', cursor: 'pointer',
                    background: annFile ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.01)',
                    transition: 'all 0.2s',
                    borderColor: annFile ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)',
                  }}
                >
                  <Upload size={22} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                  <div style={{ fontSize: '0.85rem' }}>
                    {annFile ? annFile.name : 'Click to select MP3'}
                  </div>
                </div>
                <input
                  ref={fileRef} type="file" accept=".mp3,.wav,.ogg"
                  style={{ display: 'none' }}
                  onChange={e => setAnnFile(e.target.files[0] || null)}
                />
              </div>
            )}

            {/* Schedule Time */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={11} /> Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
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
              {submitting ? 'Processing…' : type === 'TTS' ? 'Generate & Add' : 'Upload & Schedule'}
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
              background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem',
              borderRadius: '10px',
            }}>{announcements.length}</span>
          </h3>

          {announcements.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '0.75rem', paddingTop: '3rem',
              color: 'var(--text-secondary)',
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem' }}>
                        <span style={{
                          background: a.type === 'TTS' ? 'rgba(165,94,234,0.15)' : 'rgba(0,212,255,0.1)',
                          color: a.type === 'TTS' ? '#a55eea' : '#00d4ff',
                          padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem'
                        }}>{a.type}</span>
                        <span>→ {a.targets?.join(', ')}</span>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '10px', fontSize: '0.72rem',
                      background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{a.status}</span>
                    <button
                      onClick={() => handlePlay(a)}
                      title="Play announcement"
                      style={{
                        width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                        background: 'rgba(46,213,115,0.15)', color: '#2ed573',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 0.2s',
                      }}
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => handleDelete(a)}
                      title="Delete announcement"
                      style={{
                        width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                        background: 'rgba(255,71,87,0.1)', color: '#ff4757',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 0.2s',
                      }}
                    >
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
        <h3 style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Radio size={16} /> Stream Links
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {STREAM_LINKS.map((s, idx) => (
            <div key={idx} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
              borderRadius: '10px', padding: '0.85rem 1rem',
              display: 'flex', flexDirection: 'column', gap: '0.3rem',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{
                  flex: 1, fontSize: '0.75rem', color: 'var(--accent-blue)',
                  background: 'rgba(0,212,255,0.06)', padding: '0.3rem 0.5rem',
                  borderRadius: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
