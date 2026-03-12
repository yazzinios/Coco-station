import React, { useState, useEffect } from 'react';
import { Music, Upload, Plus, Play } from 'lucide-react';

export default function LibraryManager() {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/library')
      .then(res => res.json())
      .then(data => {
        setTracks(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Library fetch failed:", err);
        setIsLoading(false);
        // Mock data for dev if API fails
        setTracks([
          { filename: 'Chill_Vibes.mp3', size: 5242880 },
          { filename: 'Midnight_Jazz.mp3', size: 4194304 },
          { filename: 'Ocean_Waves.mp3', size: 6291456 }
        ]);
      });
  }, []);

  const handleUpload = () => {
    alert("In a real scenario, this would open a file picker and upload to /api/library/upload");
  };

  const loadToDeck = (track, deckId) => {
    alert(`Loading ${track.filename} to Deck ${deckId.toUpperCase()}`);
    // Real call: fetch(`/api/decks/${deckId}/play`, { method: 'POST', body: JSON.stringify({ track_id: track.filename }) })
  };

  return (
    <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Music size={18} /> Library & Playlist
        </h3>
        <button 
          onClick={handleUpload}
          style={{ 
            background: 'var(--accent-blue)', color: '#000', border: 'none', 
            borderRadius: '4px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', 
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' 
          }}
        >
          <Upload size={14} /> Upload
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>Loading tracks...</div>
        ) : tracks.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>No tracks found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tracks.map((track) => (
              <div 
                key={track.filename} 
                style={{ 
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', 
                  borderRadius: '8px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{track.filename}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(track.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['A', 'B', 'C', 'D'].map(deck => (
                    <button 
                      key={deck}
                      onClick={() => loadToDeck(track, deck.toLowerCase())}
                      style={{ 
                        width: '28px', height: '28px', borderRadius: '4px', border: 'none', 
                        background: 'rgba(255,255,255,0.1)', color: 'white', 
                        fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' 
                      }}
                    >
                      {deck}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
