import React from 'react';

export default function SettingsPage() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Station Settings</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
        
        {/* DB Mode */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-blue)' }}>Database Mode</h3>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="db_mode" value="local" defaultChecked />
              Local Database (PostgreSQL container)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="db_mode" value="cloud" />
              Cloud Mode (Supabase)
            </label>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Note: Switching requires application restart.</p>
        </div>

        {/* Deck Configuration */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-blue)' }}>Deck Configuration</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {['A', 'B', 'C', 'D'].map(col => (
              <div key={col}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Deck {col} Name</label>
                <input type="text" defaultValue={`Deck ${col}`} style={{ 
                  width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', 
                  color: 'white', borderRadius: '4px', marginTop: '0.25rem' 
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Audio Preferences */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-blue)' }}>Audio Preferences</h3>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Microphone Hardware</label>
            <select style={{ width: '100%', maxWidth: '300px', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', color: 'white', borderRadius: '4px' }}>
              <option>Browser Default Microphone</option>
            </select>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Uses browser MediaDevices API</div>
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>On Air Beep</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select style={{ width: '100%', maxWidth: '200px', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)', color: 'white', borderRadius: '4px' }}>
                <option>Default (tin-tin-tin)</option>
                <option>Custom Upload...</option>
              </select>
              <button style={{ padding: '0.4rem 1rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Test Play</button>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Music Fade / Ducking</span>
              <span style={{ color: 'var(--accent-blue)' }}>5%</span>
            </label>
            <input type="range" min="0" max="100" defaultValue="5" style={{ width: '100%' }} />
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Volume percentage music drops to when On Air or Announcements are playing.</div>
          </div>
        </div>
        
        {/* Appearance */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', color: 'var(--accent-blue)' }}>Appearance</h3>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Dashboard Background Image</p>
          <div style={{ padding: '2rem', border: '1px dashed var(--panel-border)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', cursor: 'pointer', background: 'rgba(0,0,0,0.2)' }}>
            Drag & Drop image or click to browse
          </div>
        </div>

        <button style={{ 
          padding: '1rem', background: 'var(--success)', border: 'none', 
          color: 'white', fontWeight: 'bold', fontSize: '1rem', borderRadius: '8px',
          boxShadow: '0 0 15px rgba(46, 213, 115, 0.4)', cursor: 'pointer'
        }}>Save All Settings</button>
      </div>
    </div>
  );
}
