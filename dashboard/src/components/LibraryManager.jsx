import React, { useState, useRef } from 'react';
import { Music, Upload, Trash2, ListMusic, Plus, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DECK_COLORS = { a: '#00d4ff', b: '#a55eea', c: '#26de81', d: '#fd9644' };

// ── Playlist Editor ────────────────────────────────────────────────────────────
function PlaylistEditor({ playlist, library, onSave, onCancel }) {
  const [name, setName] = useState(playlist?.name ?? '');
  const [tracks, setTracks] = useState(playlist?.tracks ?? []);

  const addTrack = (filename) => {
    if (!tracks.includes(filename)) setTracks(t => [...t, filename]);
  };
  const removeTrack = (i) => setTracks(t => t.filter((_, idx) => idx !== i));
  const moveUp   = (i) => { if (i === 0) return; const a = [...tracks]; [a[i-1], a[i]] = [a[i], a[i-1]]; setTracks(a); };
  const moveDown = (i) => { if (i === tracks.length - 1) return; const a = [...tracks]; [a[i], a[i+1]] = [a[i+1], a[i]]; setTracks(a); };

  const inp = {
    padding: '0.55rem 0.8rem', borderRadius: '7px', background: 'rgba(0,0,0,0.35)',
    color: 'white', border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.88rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>Playlist Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Castle Ambient" style={inp} />
      </div>

      {/* Track list (ordered) */}
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>
          Tracks in order — {tracks.length} selected
        </label>
        {tracks.length === 0 ? (
          <div style={{ padding: '0.85rem', textAlign: 'center', fontSize: '0.82rem', color: 'rgba(255,255,255,0.25)', border: '1px dashed var(--panel-border)', borderRadius: '7px' }}>
            Pick tracks from the library below
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '160px', overflowY: 'auto' }}>
            {tracks.map((filename, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '6px', padding: '0.35rem 0.6rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'rgba(0,212,255,0.5)', minWidth: '18px' }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename.replace(/\.[^.]+$/, '')}</span>
                <button onClick={() => moveUp(i)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'var(--text-secondary)', cursor: i === 0 ? 'default' : 'pointer', padding: '0 2px' }}><ChevronUp size={12} /></button>
                <button onClick={() => moveDown(i)} disabled={i === tracks.length - 1} style={{ background: 'none', border: 'none', color: i === tracks.length - 1 ? 'rgba(255,255,255,0.1)' : 'var(--text-secondary)', cursor: i === tracks.length - 1 ? 'default' : 'pointer', padding: '0 2px' }}><ChevronDown size={12} /></button>
                <button onClick={() => removeTrack(i)} style={{ background: 'none', border: 'none', color: 'rgba(255,71,87,0.6)', cursor: 'pointer', padding: '0 2px', fontSize: '0.9rem' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Library picker */}
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>Add from Library</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '130px', overflowY: 'auto' }}>
          {library.map(track => {
            const inList = tracks.includes(track.filename);
            return (
              <div key={track.filename} onClick={() => !inList && addTrack(track.filename)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.35rem 0.7rem', borderRadius: '6px', cursor: inList ? 'default' : 'pointer',
                background: inList ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${inList ? 'rgba(0,212,255,0.2)' : 'var(--panel-border)'}`,
                opacity: inList ? 0.6 : 1, transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>{track.filename.replace(/\.[^.]+$/, '')}</span>
                <span style={{ fontSize: '0.68rem', color: inList ? '#2ed573' : 'var(--accent-blue)', flexShrink: 0, marginLeft: '0.5rem' }}>{inList ? '✓ Added' : '+ Add'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
        <button onClick={() => onSave(name.trim(), tracks)} disabled={!name.trim() || tracks.length === 0} style={{
          flex: 1, padding: '0.6rem', borderRadius: '7px', border: 'none',
          background: (!name.trim() || tracks.length === 0) ? 'rgba(46,213,115,0.2)' : 'var(--success)',
          color: 'white', fontWeight: '600', fontSize: '0.88rem', cursor: (!name.trim() || tracks.length === 0) ? 'default' : 'pointer',
        }}>
          {playlist ? 'Save Changes' : 'Create Playlist'}
        </button>
        <button onClick={onCancel} style={{ padding: '0.6rem 1rem', borderRadius: '7px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main LibraryManager ────────────────────────────────────────────────────────
export default function LibraryManager() {
  const { library, playlists, decks, toast, api } = useApp();
  const [tab,            setTab]           = useState('library'); // 'library' | 'playlists'
  const [uploading,      setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging,       setDragging]      = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null); // null | 'new' | {playlist object}
  const [playlistLoop,   setPlaylistLoop]  = useState({});  // {playlistId: bool}
  const fileInputRef = useRef(null);

  // ── Library tab handlers ────────────────────────────────────────────────────
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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeckToggle = async (track, deckId) => {
    const deck = decks[deckId];
    const isLoaded = deck?.track === track.filename;
    try {
      if (isLoaded) {
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

  // ── Playlist tab handlers ───────────────────────────────────────────────────
  const handleSavePlaylist = async (name, tracks) => {
    try {
      if (editingPlaylist === 'new') {
        await api.createPlaylist(name, tracks);
        toast.success(`Playlist "${name}" created`);
      } else {
        await api.updatePlaylist(editingPlaylist.id, name, tracks);
        toast.success(`Playlist "${name}" updated`);
      }
      setEditingPlaylist(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeletePlaylist = async (id, name) => {
    if (!window.confirm(`Delete playlist "${name}"?`)) return;
    try {
      await api.deletePlaylist(id);
      toast.info(`Playlist "${name}" deleted`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleLoadPlaylist = async (playlistId, deckId) => {
    const loop = playlistLoop[playlistId] ?? false;
    try {
      await api.loadPlaylist(deckId, playlistId, loop);
      const pl = playlists.find(p => p.id === playlistId);
      toast.success(`Playlist → Deck ${deckId.toUpperCase()}${loop ? ' 🔁' : ''}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const formatSize = (bytes) => {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  // ── Shared tab bar ──────────────────────────────────────────────────────────
  const tabStyle = (active) => ({
    padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontWeight: active ? '600' : '400', fontSize: '0.85rem',
    outline: active ? '1px solid rgba(0,212,255,0.3)' : 'none',
    transition: 'all 0.15s', fontFamily: 'inherit',
  });

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '380px' }}>
      {/* Header with tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button style={tabStyle(tab === 'library')} onClick={() => setTab('library')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Music size={14} /> Library <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({library.length})</span></span>
          </button>
          <button style={tabStyle(tab === 'playlists')} onClick={() => setTab('playlists')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ListMusic size={14} /> Playlists <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({playlists.length})</span></span>
          </button>
        </div>

        {tab === 'library' && (
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
            background: uploading ? 'rgba(0,212,255,0.3)' : 'var(--accent-blue)',
            color: '#000', border: 'none', borderRadius: '6px', padding: '0.45rem 0.9rem',
            fontSize: '0.85rem', fontWeight: '600', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s',
          }}>
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        )}
        {tab === 'playlists' && !editingPlaylist && (
          <button onClick={() => setEditingPlaylist('new')} style={{
            background: 'rgba(46,213,115,0.15)', color: '#2ed573',
            border: '1px solid rgba(46,213,115,0.35)', borderRadius: '6px',
            padding: '0.4rem 0.85rem', fontSize: '0.85rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontFamily: 'inherit',
          }}>
            <Plus size={14} /> New Playlist
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a"
        style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files)} />

      {/* Upload progress */}
      {uploading && tab === 'library' && (
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.1s ease', borderRadius: '2px' }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem', textAlign: 'right' }}>{uploadProgress}%</div>
        </div>
      )}

      {/* ── LIBRARY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'library' && (
        library.length === 0 ? (
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
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
                    {['a', 'b', 'c', 'd'].map(deckId => {
                      const isLoaded = decks[deckId]?.track === track.filename;
                      const isPlaying = decks[deckId]?.is_playing && isLoaded;
                      const color = DECK_COLORS[deckId];
                      return (
                        <button key={deckId} title={isLoaded ? `Unload from Deck ${deckId.toUpperCase()}` : `Load to Deck ${deckId.toUpperCase()}`}
                          onClick={() => handleDeckToggle(track, deckId)} style={{
                            width: '28px', height: '28px', borderRadius: '5px',
                            border: isLoaded ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.12)',
                            background: isLoaded ? `${color}30` : 'rgba(255,255,255,0.05)',
                            color: isLoaded ? color : 'var(--text-secondary)',
                            fontSize: '0.65rem', fontWeight: '700', cursor: 'pointer',
                            transition: 'all 0.15s', boxShadow: isPlaying ? `0 0 8px ${color}60` : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          {isLoaded ? '✕' : deckId.toUpperCase()}
                        </button>
                      );
                    })}
                    <button title="Delete from library" onClick={() => handleDelete(track.filename)} style={{
                      width: '28px', height: '28px', borderRadius: '5px',
                      border: '1px solid rgba(255,71,87,0.2)', background: 'rgba(255,71,87,0.08)',
                      color: 'rgba(255,71,87,0.6)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', marginLeft: '0.1rem',
                    }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── PLAYLISTS TAB ────────────────────────────────────────────────────── */}
      {tab === 'playlists' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Inline editor */}
          {editingPlaylist && (
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
                {editingPlaylist === 'new' ? '✦ New Playlist' : `✦ Editing: ${editingPlaylist.name}`}
              </div>
              <PlaylistEditor
                playlist={editingPlaylist === 'new' ? null : editingPlaylist}
                library={library}
                onSave={handleSavePlaylist}
                onCancel={() => setEditingPlaylist(null)}
              />
            </div>
          )}

          {/* Playlist list */}
          {playlists.length === 0 && !editingPlaylist ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <ListMusic size={36} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>No playlists yet</div>
              <button onClick={() => setEditingPlaylist('new')} style={{ padding: '0.45rem 1rem', borderRadius: '7px', border: '1px solid rgba(46,213,115,0.35)', background: 'rgba(46,213,115,0.1)', color: '#2ed573', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus size={14} /> Create first playlist
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {playlists.map(pl => (
                <div key={pl.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: '9px', padding: '0.75rem 0.9rem' }}>
                  {/* Playlist header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
                    <ListMusic size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>{pl.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}</div>
                    </div>
                    {/* Loop toggle */}
                    <label title="Loop playlist" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <div onClick={() => setPlaylistLoop(prev => ({ ...prev, [pl.id]: !prev[pl.id] }))} style={{
                        width: '32px', height: '18px', borderRadius: '9px', position: 'relative', cursor: 'pointer',
                        background: playlistLoop[pl.id] ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)',
                        transition: 'background 0.2s', flexShrink: 0,
                      }}>
                        <div style={{ position: 'absolute', top: '2px', left: playlistLoop[pl.id] ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: playlistLoop[pl.id] ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>🔁</span>
                    </label>
                    {/* Edit & Delete */}
                    <button onClick={() => setEditingPlaylist(pl)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.5rem', fontFamily: 'inherit' }}>Edit</button>
                    <button onClick={() => handleDeletePlaylist(pl.id, pl.name)} style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: 'rgba(255,71,87,0.7)', borderRadius: '5px', cursor: 'pointer', padding: '0.2rem 0.35rem', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* Track preview */}
                  {pl.tracks.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {pl.tracks.slice(0, 4).map((t, i) => (
                        <span key={i} style={{ background: 'rgba(255,255,255,0.04)', padding: '0.1rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {i + 1}. {t.replace(/\.[^.]+$/, '').slice(0, 22)}
                        </span>
                      ))}
                      {pl.tracks.length > 4 && <span style={{ opacity: 0.5 }}>+{pl.tracks.length - 4} more</span>}
                    </div>
                  )}

                  {/* Load to deck buttons */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginRight: '0.1rem' }}>Send to:</span>
                    {['a', 'b', 'c', 'd'].map(deckId => (
                      <button key={deckId} onClick={() => handleLoadPlaylist(pl.id, deckId)}
                        title={`Load & play on Deck ${deckId.toUpperCase()}`}
                        style={{
                          padding: '0.3rem 0.6rem', borderRadius: '5px', border: `1px solid ${DECK_COLORS[deckId]}40`,
                          background: `${DECK_COLORS[deckId]}18`, color: DECK_COLORS[deckId],
                          cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700',
                          display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'inherit',
                          transition: 'all 0.15s',
                        }}>
                        <Play size={9} fill="currentColor" /> {deckId.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
