import React, { useState, useRef } from 'react';
import { Music, Upload, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DECK_COLORS = { a: '#00d4ff', b: '#a55eea', c: '#26de81', d: '#fd9644' };

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
    const interval = setInterval(() => setUploadProgress(p => Math.min(p + 12, 90)), 100);
    try {
      await api.uploadTrack(file);
      clearInterval(interval);
      setUploadProgress(100);
      toast.success(`"${file.name}" uploaded`);
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 600);
    } catch (err) {
      clearInterval(interval);
      setUploading(false);
      setUploadProgress(0);
      toast.error(`Upload failed: ${err.message}`);
    }
  };

  // Click deck button: load if not loaded, unload if already loaded
  const handleDeckToggle = async (track, deckId) => {
    const deck = decks[deckId];
    const isLoaded = deck?.track === track.filename;
    try {
      if (isLoaded) {
        // Stop playback first, then unload
        if (deck.is_playing || deck.is_paused) await api.stop(deckId);
        await api.unloadTrack(deckId);
        toast.info(`Deck ${deckId.toUpperCase()} unloaded`);
      } else {
        await api.loadTrack(deckId, track.filename);
        toast.success(`"${track.filename.replace(/\.[^.]+$/, '')}" → Deck ${deckId.toUpperCase()}`);
      }
    } catch (err) {
      toast.error(err.message);
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

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '380px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
          <Music size={18} /> Library
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: '400', background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.5rem', borderRadius: '10px', color: 'var(--text-secondary)' }}>
            {library.length} tracks
          </span>
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            background: uploading ? 'rgba(0,212,255,0.3)' : 'var(--accent-blue)',
            color: '#000', border: 'none', borderRadius: '6px',
            padding: '0.45rem 0.9rem', fontSize: '0.85rem',
            fontWeight: '600', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s',
          }}
        >
          <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a"
          style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files)} />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.1s ease', borderRadius: '2px' }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', textAlign: 'right' }}>{uploadProgress}%</div>
        </div>
      )}

      {/* Empty state */}
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
            transition: 'all 0.2s', background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
          }}
        >
          <Upload size={32} style={{ opacity: 0.3 }} />
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Drag & drop audio files or click to browse</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>MP3, WAV, OGG, FLAC, AAC, M4A</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {library.map((track) => {
            const loadedOnDecks = Object.values(decks).filter(d => d.track === track.filename);
            return (
              <div key={track.filename} style={{
                background: loadedOnDecks.length > 0 ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${loadedOnDecks.length > 0 ? 'rgba(0,212,255,0.2)' : 'var(--panel-border)'}`,
                borderRadius: '8px', padding: '0.65rem 0.85rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'all 0.2s',
              }}>
                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                    {track.filename.replace(/\.[^.]+$/, '')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                    <span>{formatSize(track.size)}</span>
                    {loadedOnDecks.map(d => (
                      <span key={d.id} style={{ color: DECK_COLORS[d.id] }}>
                        ● {d.name || `Deck ${d.id.toUpperCase()}`}
                        {d.is_playing ? ' ▶' : d.is_paused ? ' ⏸' : ''}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Deck buttons + delete */}
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
                  {['a', 'b', 'c', 'd'].map(deckId => {
                    const isLoaded = decks[deckId]?.track === track.filename;
                    const isPlaying = decks[deckId]?.is_playing && isLoaded;
                    const color = DECK_COLORS[deckId];
                    return (
                      <button
                        key={deckId}
                        title={isLoaded ? `Unload from Deck ${deckId.toUpperCase()}` : `Load to Deck ${deckId.toUpperCase()}`}
                        onClick={() => handleDeckToggle(track, deckId)}
                        style={{
                          width: '28px', height: '28px', borderRadius: '5px',
                          border: isLoaded ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.12)',
                          background: isLoaded ? `${color}30` : 'rgba(255,255,255,0.05)',
                          color: isLoaded ? color : 'var(--text-secondary)',
                          fontSize: '0.65rem', fontWeight: '700', cursor: 'pointer',
                          transition: 'all 0.15s', position: 'relative',
                          boxShadow: isPlaying ? `0 0 8px ${color}60` : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isLoaded ? '✕' : deckId.toUpperCase()}
                      </button>
                    );
                  })}
                  <button
                    title="Delete from library"
                    onClick={() => handleDelete(track.filename)}
                    style={{
                      width: '28px', height: '28px', borderRadius: '5px',
                      border: '1px solid rgba(255,71,87,0.2)', background: 'rgba(255,71,87,0.08)',
                      color: 'rgba(255,71,87,0.6)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', marginLeft: '0.1rem',
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
