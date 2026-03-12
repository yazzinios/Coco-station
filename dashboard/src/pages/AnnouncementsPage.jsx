import React, { useState, useEffect } from 'react';
import { Mic, Upload, Send, Calendar } from 'lucide-react';

export default function AnnouncementsPage() {
  const [type, setType] = useState('TTS');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [selectedDecks, setSelectedDecks] = useState(['ALL']);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => setAnnouncements(data))
      .catch(() => {
        // Mock data for dev
        setAnnouncements([
          { id: 1, name: 'Morning Greeting', type: 'TTS', status: 'Played' },
          { id: 2, name: 'Closing Soon', type: 'MP3', status: 'Scheduled' }
        ]);
      });
  }, []);

  const toggleDeck = (deck) => {
    if (deck === 'ALL') {
      setSelectedDecks(['ALL']);
      return;
    }
    const filtered = selectedDecks.filter(d => d !== 'ALL');
    if (filtered.includes(deck)) {
      setSelectedDecks(filtered.filter(d => d !== deck));
    } else {
      setSelectedDecks([...filtered, deck]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (type === 'TTS') {
      fetch('/api/announcements/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text, targets: selectedDecks })
      }).then(() => alert("TTS Announcement Generated!"));
    } else {
      alert("MP3 Upload would trigger here.");
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Announcements</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 2fr', gap: '2rem' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Create Announcement</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Type</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value)}
                style={{ 
                  width: '100%', padding: '0.75rem', borderRadius: '8px', 
                  background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)' 
                }}
              >
                <option value="TTS">Text-to-Speech (TTS)</option>
                <option value="MP3">Upload MP3</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Next Show Promo" 
                style={{ 
                  width: '100%', padding: '0.75rem', borderRadius: '8px', 
                  background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)' 
                }} 
              />
            </div>
            
            {type === 'TTS' ? (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Text for TTS</label>
                <textarea 
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type what you want the robot to say..." 
                  rows="4" 
                  style={{ 
                    width: '100%', padding: '0.75rem', borderRadius: '8px', 
                    background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)', resize: 'vertical' 
                  }} 
                />
              </div>
            ) : (
              <div style={{ 
                padding: '2rem', border: '2px dashed var(--panel-border)', borderRadius: '8px', 
                textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' 
              }}>
                <Upload size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                <div>Click to upload MP3 announcement</div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Target Decks</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {['ALL', 'A', 'B', 'C', 'D'].map(d => (
                  <label key={d} style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.5rem', 
                    cursor: 'pointer', background: selectedDecks.includes(d) ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                    padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid var(--panel-border)'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={selectedDecks.includes(d)}
                      onChange={() => toggleDeck(d)}
                      style={{ display: 'none' }}
                    /> 
                    <span style={{ color: selectedDecks.includes(d) ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" style={{ 
              marginTop: '1rem', padding: '0.75rem', background: 'var(--accent-blue)', 
              color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
            }}>
              <Send size={18} /> {type === 'TTS' ? 'Generate & Add' : 'Upload & Schedule'}
            </button>
          </form>
        </div>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} /> Scheduled & Library
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {announcements.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No announcements created yet.</p>
            ) : (
              announcements.map(a => (
                <div key={a.id} style={{ 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', 
                  borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>{a.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Type: {a.type}</div>
                  </div>
                  <div style={{ 
                    fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '12px',
                    background: a.status === 'Played' ? 'rgba(46, 213, 115, 0.1)' : 'rgba(0, 212, 255, 0.1)',
                    color: a.status === 'Played' ? 'var(--success)' : 'var(--accent-blue)'
                  }}>
                    {a.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
