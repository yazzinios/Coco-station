import React, { useState, useRef } from 'react';
import { Music, Upload, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function LibraryManager() {
  const { library, decks, toast, api } = useApp();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
    if (!allowed.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast.error('Only audio files are supported (mp3, wav, ogg, flac, aac, m4a)');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    // Simulate progress (actual upload is in one request)
    const interval = setInterval(() => {
      setUploadProgress(p => Math.min(p + 12, 90));
    }, 100);
    try {
      await api.uploadTrack(file);
      clearInterval(interval);
      setUploadProgress(100);
      toast.success(`"${file.name}" uploaded to library`);
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 600);
    } catch (err) {
      clearInterval(interval);
      setUploading(false);
      setUploadProgress(0);
      toast.error(`Upload failed: ${err.message}`);
    }
  };

  const handleLoadToDeck = async (track, deckId) => {
    try {
      await api.loadTrack(deckId, track.filename);
      toast.success(`"${track.filename}" loaded to Deck ${deckId.toUpperCase()}`);
    } catch (err) {
      toast.error(`Could not load track: ${err.message}`);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}" from library?`)) return;
    try {
      await api.deleteTrack(filename);
      toast.success(`"${filename}" removed`);
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  const formatSize = (bytes) => {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getDeckColor = (deckId) => {
    const deck = decks[deckId.toLowerCase()];
    if (deck?.track) {
      // Check which tracks are loaded on which deck
      return 'rgba(0,212,255,0.25)';
    }
    return 'rgba(255,255,255,0.08)';
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '380px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
          <Music size={18} /> Library
          <span style={{
            marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: '400',
            background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.5rem',
            borderRadius: '10px', color: 'var(--text-secondary)'
          }}>{library.length} tracks</span>
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            background: uploading ? 'rgba(0,212,255,0.3)' : 'var(--accent-blue)',
            color: '#000', border: 'none', borderRadius: '6px',
            padding: '0.45rem 0.9rem', fontSize: '0.85rem',
            fontWeight: '600', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            transition: 'all 0.2s',
          }}
        >
          <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.flac,.aac,.m4a"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${uploadProgress}%`, height: '100%',
              background: 'var(--accent-blue)', transition: 'width 0.1s ease',
              borderRadius: '2px'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', textAlign: 'right' }}>
            {uploadProgress}%
          </div>
        </div>
      )}

      {/* Drop zone when library empty */}
      {library.length === 0 ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
            border: `2px dashed ${dragging ? 'var(--accent-blue)' : 'var(--panel-border)'}`,
            borderRadius: '8px', cursor: 'pointer', padding: '2rem',
            transition: 'all 0.2s',
            background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
          }}
        >
          <Upload size={32} style={{ opacity: 0.3 }} />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Drag & drop audio files or click to browse
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
            MP3, WAV, OGG, FLAC, AAC, M4A
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {library.map((track) => {
            const loadedOnDeck = Object.values(decks).find(d => d.track === track.filename);
            return (
              <div
                key={track.filename}
                style={{
                  background: loadedOnDeck ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${loadedOnDeck ? 'rgba(0,212,255,0.25)' : 'var(--panel-border)'}`,
                  borderRadius: '8px', padding: '0.65rem 0.85rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.875rem', fontWeight: '500',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '200px'
                  }}>
                    {track.filename.replace(/\.[^.]+$/, '')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', marginTop: '0.15rem' }}>
                    <span>{formatSize(track.size)}</span>
                    {loadedOnDeck && (
                      <span style={{ color: 'var(--accent-blue)' }}>
                        ● Deck {loadedOnDeck.id.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                  {['A', 'B', 'C', 'D'].map(deck => (
                    <button
                      key={deck}
                      title={`Load to Deck ${deck}`}
                      onClick={() => handleLoadToDeck(track, deck.toLowerCase())}
                      style={{
                        width: '26px', height: '26px', borderRadius: '5px',
                        border: decks[deck.toLowerCase()]?.track === track.filename
                          ? '1px solid var(--accent-blue)'
                          : '1px solid rgba(255,255,255,0.12)',
                        background: decks[deck.toLowerCase()]?.track === track.filename
                          ? 'rgba(0,212,255,0.2)'
                          : 'rgba(255,255,255,0.05)',
                        color: decks[deck.toLowerCase()]?.track === track.filename
                          ? 'var(--accent-blue)' : 'var(--text-secondary)',
                        fontSize: '0.65rem', fontWeight: '700', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {deck}
                    </button>
                  ))}
                  <button
                    title="Delete from library"
                    onClick={() => handleDelete(track.filename)}
                    style={{
                      width: '26px', height: '26px', borderRadius: '5px',
                      border: '1px solid rgba(255,71,87,0.2)',
                      background: 'rgba(255,71,87,0.08)',
                      color: 'rgba(255,71,87,0.6)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                      marginLeft: '0.1rem',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
