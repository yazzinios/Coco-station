import React from 'react';

export default function AnnouncementsPage() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Announcements</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 2fr', gap: '2rem' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Create Announcement</h3>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Type</label>
              <select style={{ 
                width: '100%', padding: '0.75rem', borderRadius: '8px', 
                background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)' 
              }}>
                <option>Text-to-Speech (TTS)</option>
                <option>Upload MP3</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Name</label>
              <input type="text" placeholder="e.g. Next Show Promo" style={{ 
                width: '100%', padding: '0.75rem', borderRadius: '8px', 
                background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)' 
              }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Text for TTS</label>
              <textarea placeholder="Type what you want the robot to say..." rows="4" style={{ 
                width: '100%', padding: '0.75rem', borderRadius: '8px', 
                background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)', resize: 'vertical' 
              }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Target Decks</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {['ALL', 'A', 'B', 'C', 'D'].map(d => (
                  <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" /> {d}
                  </label>
                ))}
              </div>
            </div>
            <button style={{ 
              marginTop: '1rem', padding: '0.75rem', background: 'var(--accent-blue)', 
              color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' 
            }}>Generate & Add</button>
          </form>
        </div>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Scheduled & Library</h3>
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No announcements created yet.</p>
        </div>
      </div>
    </div>
  );
}
