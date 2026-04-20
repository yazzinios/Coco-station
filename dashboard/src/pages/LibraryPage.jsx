import React, { useState, useRef, useCallback } from 'react';
import {
  Music, Upload, Trash2, ListMusic, Plus, ChevronUp, ChevronDown,
  Play, CheckCircle, XCircle, Loader, X, Search, ArrowUpDown,
  ArrowUp, ArrowDown, Filter, FolderOpen, GripVertical, Repeat,
  PlayCircle, StopCircle
} from 'lucide-react';
import { useApp } from '../context/useApp';

const DECK_COLORS = { a: '#00d4ff', b: '#a55eea', c: '#26de81', d: '#fd9644' };
const ALLOWED_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

/* ─────────────────────── Upload Queue Item ─────────────────────── */
function UploadQueueItem({ item, onRemove }) {
  const statusIcon = {
    pending:   <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }} />,
    uploading: <Loader size={16} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />,
    done:      <CheckCircle size={16} style={{ color: '#2ed573' }} />,
    error:     <XCircle size={16} style={{ color: '#ff4757' }} />,
  }[item.status];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.5rem 0.75rem', borderRadius: '8px',
      background: item.status === 'done' ? 'rgba(46,213,115,0.06)'
        : item.status === 'error' ? 'rgba(255,71,87,0.06)'
        : item.status === 'uploading' ? 'rgba(0,212,255,0.06)'
        : 'rgba(255,255,255,0.03)',
      border: `1px solid ${
        item.status === 'done' ? 'rgba(46,213,115,0.2)' :
        item.status === 'error' ? 'rgba(255,71,87,0.2)' :
        item.status === 'uploading' ? 'rgba(0,212,255,0.2)' :
        'var(--panel-border)'
      }`,
      transition: 'all 0.2s',
    }}>
      <div style={{ flexShrink: 0 }}>{statusIcon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: item.status === 'uploading' ? '0.3rem' : 0 }}>
          {item.file.name}
        </div>
        {item.status === 'uploading' && (
          <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${item.progress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.1s ease', borderRadius: '2px' }} />
          </div>
        )}
        {item.status === 'error' && (
          <div style={{ fontSize: '0.7rem', color: '#ff6b7a', marginTop: '0.15rem' }}>{item.error}</div>
        )}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
        {(item.file.size / 1048576).toFixed(1)} MB
      </div>
      {(item.status === 'pending' || item.status === 'error') && (
        <button onClick={() => onRemove(item.id)} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)',
          cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0,
        }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/* ─────────────────────── Playlist Editor ─────────────────────── */
function PlaylistEditor({ playlist, library, onSave, onCancel }) {
  const [name, setName] = useState(playlist?.name ?? '');
  const [tracks, setTracks] = useState(playlist?.tracks ?? []);
  const [searchPl, setSearchPl] = useState('');

  const addTrack = (filename) => {
    if (!tracks.includes(filename)) setTracks(t => [...t, filename]);
  };
  const removeTrack = (i) => setTracks(t => t.filter((_, idx) => idx !== i));
  const moveUp   = (i) => { if (i === 0) return; const a = [...tracks]; [a[i-1], a[i]] = [a[i], a[i-1]]; setTracks(a); };
  const moveDown = (i) => { if (i === tracks.length - 1) return; const a = [...tracks]; [a[i], a[i+1]] = [a[i+1], a[i]]; setTracks(a); };

  const filteredLib = library.filter(t =>
    !searchPl || t.filename.toLowerCase().includes(searchPl.toLowerCase())
  );

  const inp = {
    padding: '0.55rem 0.8rem', borderRadius: '7px', background: 'rgba(0,0,0,0.35)',
    color: 'white', border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.88rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>Playlist Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Castle Ambient" style={inp} />
      </div>

      {/* Tracks in playlist */}
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>
          Tracks in order — {tracks.length} selected
        </label>
        {tracks.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'rgba(255,255,255,0.25)', border: '1px dashed var(--panel-border)', borderRadius: '7px' }}>
            Pick tracks from the library below
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '200px', overflowY: 'auto' }}>
            {tracks.map((filename, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                <GripVertical size={12} style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.68rem', color: 'rgba(0,212,255,0.5)', minWidth: '18px' }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename.replace(/\.[^.]+$/, '')}</span>
                <button onClick={() => moveUp(i)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'var(--text-secondary)', cursor: i === 0 ? 'default' : 'pointer', padding: '0 2px' }}><ChevronUp size={12} /></button>
                <button onClick={() => moveDown(i)} disabled={i === tracks.length - 1} style={{ background: 'none', border: 'none', color: i === tracks.length - 1 ? 'rgba(255,255,255,0.1)' : 'var(--text-secondary)', cursor: i === tracks.length - 1 ? 'default' : 'pointer', padding: '0 2px' }}><ChevronDown size={12} /></button>
                <button onClick={() => removeTrack(i)} style={{ background: 'none', border: 'none', color: 'rgba(255,71,87,0.6)', cursor: 'pointer', padding: '0 2px', fontSize: '0.9rem' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add from library with search */}
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>Add from Library</label>
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
          <input
            value={searchPl} onChange={e => setSearchPl(e.target.value)}
            placeholder="Filter tracks…"
            style={{ ...inp, paddingLeft: '2rem', fontSize: '0.8rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '180px', overflowY: 'auto' }}>
          {filteredLib.map(track => {
            const inList = tracks.includes(track.filename);
            return (
              <div key={track.filename} onClick={() => !inList && addTrack(track.filename)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.4rem 0.7rem', borderRadius: '6px', cursor: inList ? 'default' : 'pointer',
                background: inList ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${inList ? 'rgba(0,212,255,0.2)' : 'var(--panel-border)'}`,
                opacity: inList ? 0.6 : 1, transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>{track.filename.replace(/\.[^.]+$/, '')}</span>
                <span style={{ fontSize: '0.68rem', color: inList ? '#2ed573' : 'var(--accent-blue)', flexShrink: 0, marginLeft: '0.5rem' }}>{inList ? '✓ Added' : '+ Add'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={() => onSave(name.trim(), tracks)} disabled={!name.trim() || tracks.length === 0} style={{
          flex: 1, padding: '0.7rem', borderRadius: '7px', border: 'none',
          background: (!name.trim() || tracks.length === 0) ? 'rgba(46,213,115,0.2)' : 'var(--success)',
          color: 'white', fontWeight: '600', fontSize: '0.88rem', cursor: (!name.trim() || tracks.length === 0) ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}>
          {playlist ? 'Save Changes' : 'Create Playlist'}
        </button>
        <button onClick={onCancel} style={{ padding: '0.7rem 1.2rem', borderRadius: '7px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN LIBRARY PAGE
   ═══════════════════════════════════════════════════════════════════ */
let _queueIdCounter = 0;
const newId = () => ++_queueIdCounter;

export default function LibraryPage() {
  const { library, playlists, decks, toast, api, canControlDeck, hasFeature } = useApp();

  // Tabs
  const [tab, setTab] = useState('library');

  // Search & sort
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState('name');  // 'name' | 'size' | 'loaded'
  const [sortDir, setSortDir]     = useState('asc');

  // Upload
  const [dragging, setDragging]       = useState(false);
  const [queue, setQueue]             = useState([]);
  const [uploadRunning, setUploadRunning] = useState(false);
  const fileInputRef = useRef(null);

  // Playlist
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [playlistLoop, setPlaylistLoop]       = useState({});
  const [previewTrack, setPreviewTrack]       = useState(null);
  const audioRef                              = useRef(null);

  const togglePreview = useCallback((filename) => {
    if (previewTrack === filename) {
      setPreviewTrack(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    } else {
      setPreviewTrack(filename);
    }
  }, [previewTrack]);

  /* ── Queue helpers ───────────────────────────────────────── */
  const updateItem = useCallback((id, patch) => {
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);
  const removeItem = useCallback((id) => {
    setQueue(q => q.filter(item => item.id !== id));
  }, []);
  const clearDone = () => setQueue(q => q.filter(item => item.status !== 'done' && item.status !== 'error'));

  /* ── Validate & enqueue ──────────────────────────────────── */
  const enqueueFiles = useCallback((files) => {
    if (!files || files.length === 0) return;
    const newItems = [];
    for (const file of Array.from(files)) {
      const isValid = ALLOWED_EXTS.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isValid) { toast.error(`"${file.name}" is not a supported audio file`); continue; }
      newItems.push({ id: newId(), file, status: 'pending', progress: 0, error: null });
    }
    if (newItems.length > 0) setQueue(q => [...q, ...newItems]);
  }, [toast]);

  /* ── Process queue ───────────────────────────────────────── */
  const runQueue = useCallback(async (currentQueue) => {
    setUploadRunning(true);
    for (const item of currentQueue) {
      if (item.status !== 'pending') continue;
      updateItem(item.id, { status: 'uploading', progress: 0 });
      let prog = 0;
      const ticker = setInterval(() => { prog = Math.min(prog + 10, 88); updateItem(item.id, { progress: prog }); }, 120);
      try {
        await api.uploadTrack(item.file);
        clearInterval(ticker);
        updateItem(item.id, { status: 'done', progress: 100 });
      } catch (err) {
        clearInterval(ticker);
        updateItem(item.id, { status: 'error', error: err.message });
      }
    }
    setUploadRunning(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [api, updateItem]);

  const startUpload = useCallback(() => {
    setQueue(q => {
      const pending = q.filter(i => i.status === 'pending');
      if (pending.length === 0) return q;
      setTimeout(() => runQueue(q), 0);
      return q;
    });
  }, [runQueue]);

  /* ── Drag & Drop ─────────────────────────────────────────── */
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = ()  => setDragging(false);
  const onDrop      = (e) => { e.preventDefault(); setDragging(false); enqueueFiles(e.dataTransfer.files); };

  /* ── Library handlers ────────────────────────────────────── */
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
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}" from library?`)) return;
    try { await api.deleteTrack(filename); toast.success(`"${filename}" removed`); }
    catch (err) { toast.error(`Delete failed: ${err.message}`); }
  };

  /* ── Playlist handlers ───────────────────────────────────── */
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
    } catch (err) { toast.error(err.message); }
  };

  const handleDeletePlaylist = async (id, name) => {
    if (!window.confirm(`Delete playlist "${name}"?`)) return;
    try { await api.deletePlaylist(id); toast.info(`Playlist "${name}" deleted`); }
    catch (err) { toast.error(err.message); }
  };

  const handleLoadPlaylist = async (playlistId, deckId) => {
    const loop = playlistLoop[playlistId] ?? false;
    try {
      await api.loadPlaylist(deckId, playlistId, loop);
      toast.success(`Playlist → Deck ${deckId.toUpperCase()}${loop ? ' 🔁' : ''}`);
    } catch (err) { toast.error(err.message); }
  };

  /* ── Search & sort ───────────────────────────────────────── */
  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const filteredLibrary = library
    .filter(t => !search || t.filename.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.filename.localeCompare(b.filename);
      else if (sortBy === 'size') cmp = a.size - b.size;
      else if (sortBy === 'loaded') {
        const aLoaded = Object.values(decks).some(d => d.track === a.filename) ? 1 : 0;
        const bLoaded = Object.values(decks).some(d => d.track === b.filename) ? 1 : 0;
        cmp = bLoaded - aLoaded;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const formatSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  /* ── Queue stats ─────────────────────────────────────────── */
  const pendingCount  = queue.filter(i => i.status === 'pending').length;
  const doneCount     = queue.filter(i => i.status === 'done').length;
  const errorCount    = queue.filter(i => i.status === 'error').length;

  /* ── Shared styles ───────────────────────────────────────── */
  const tabStyle = (active) => ({
    padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
    background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontWeight: active ? '600' : '400', fontSize: '0.9rem',
    outline: active ? '1px solid rgba(0,212,255,0.3)' : 'none',
    transition: 'all 0.15s', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: '0.45rem',
  });

  const sortBtnStyle = (field) => ({
    padding: '0.35rem 0.7rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: sortBy === field ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
    color: sortBy === field ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontSize: '0.75rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <FolderOpen size={24} style={{ color: 'var(--accent-blue)' }} /> Media Library
      </h2>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button style={tabStyle(tab === 'library')} onClick={() => setTab('library')}>
              <Music size={15} /> Library <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>({library.length})</span>
            </button>
            <button style={tabStyle(tab === 'playlists')} onClick={() => setTab('playlists')}>
              <ListMusic size={15} /> Playlists <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>({playlists.length})</span>
            </button>
          </div>

          {tab === 'library' && hasFeature('can_library') && (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadRunning} style={{
              background: uploadRunning ? 'rgba(0,212,255,0.25)' : 'var(--accent-blue)',
              color: '#000', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem',
              fontSize: '0.88rem', fontWeight: '600', cursor: uploadRunning ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s', fontFamily: 'inherit',
            }}>
              <Upload size={15} /> Upload Files
            </button>
          )}
          {tab === 'playlists' && !editingPlaylist && hasFeature('can_library') && (
            <button onClick={() => setEditingPlaylist('new')} style={{
              background: 'rgba(46,213,115,0.15)', color: '#2ed573',
              border: '1px solid rgba(46,213,115,0.35)', borderRadius: '8px',
              padding: '0.5rem 1rem', fontSize: '0.88rem', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
            }}>
              <Plus size={15} /> New Playlist
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" multiple
        style={{ display: 'none' }} onChange={e => { enqueueFiles(e.target.files); e.target.value = ''; }} />

      {/* ── Upload Queue ───────────────────────────────────────── */}
      {tab === 'library' && queue.length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Upload Queue
              </span>
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {queue.length} file{queue.length !== 1 ? 's' : ''}
              </span>
              {doneCount > 0 && <span style={{ fontSize: '0.72rem', color: '#2ed573' }}>{doneCount} done</span>}
              {errorCount > 0 && <span style={{ fontSize: '0.72rem', color: '#ff4757' }}>{errorCount} failed</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(doneCount > 0 || errorCount > 0) && !uploadRunning && (
                <button onClick={clearDone} style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-border)',
                  color: 'var(--text-secondary)', borderRadius: '6px', padding: '0.25rem 0.6rem',
                  cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
                }}>Clear finished</button>
              )}
              {pendingCount > 0 && !uploadRunning && (
                <button onClick={startUpload} style={{
                  background: 'var(--accent-blue)', color: '#000', border: 'none', borderRadius: '6px',
                  padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700',
                  display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit',
                }}>
                  <Upload size={12} /> Upload {pendingCount}
                </button>
              )}
              {uploadRunning && (
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '220px', overflowY: 'auto' }}>
            {queue.map(item => <UploadQueueItem key={item.id} item={item} onRemove={removeItem} />)}
          </div>
          {!uploadRunning && (
            <button onClick={() => fileInputRef.current?.click()} style={{
              marginTop: '0.6rem', width: '100%', padding: '0.45rem',
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '7px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
              fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontFamily: 'inherit',
            }}>
              <Plus size={12} /> Add more files
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          LIBRARY TAB
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'library' && (
        <div className="glass-panel" style={{ minHeight: '400px' }}>
          {/* Search & sort bar */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search tracks…"
                style={{
                  width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.2rem', borderRadius: '8px',
                  background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)',
                  fontFamily: 'inherit', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{
                  position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '2px',
                }}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <Filter size={13} style={{ color: 'var(--text-secondary)', marginRight: '0.2rem' }} />
              <button style={sortBtnStyle('name')} onClick={() => toggleSort('name')}>
                Name {sortBy === 'name' && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
              <button style={sortBtnStyle('size')} onClick={() => toggleSort('size')}>
                Size {sortBy === 'size' && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
              <button style={sortBtnStyle('loaded')} onClick={() => toggleSort('loaded')}>
                On Deck {sortBy === 'loaded' && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            </div>
          </div>

          {/* Results count */}
          {search && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              {filteredLibrary.length} result{filteredLibrary.length !== 1 ? 's' : ''} for "{search}"
            </div>
          )}

          {filteredLibrary.length === 0 && !queue.length ? (
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '0.75rem', minHeight: '250px',
                border: `2px dashed ${dragging ? 'var(--accent-blue)' : 'var(--panel-border)'}`,
                borderRadius: '10px', cursor: 'pointer', padding: '2rem',
                transition: 'all 0.2s', background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
              }}
            >
              <Upload size={36} style={{ opacity: 0.2 }} />
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                {search ? 'No tracks match your search' : <>Drag & drop <strong>audio files</strong> or click to browse</>}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>MP3 · WAV · OGG · FLAC · AAC · M4A</div>
            </div>
          ) : (
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              style={{ position: 'relative' }}
            >
              {dragging && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,212,255,0.08)',
                  border: '2px dashed var(--accent-blue)', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                }}>
                  <div style={{ textAlign: 'center', color: 'var(--accent-blue)' }}>
                    <Upload size={28} style={{ marginBottom: '0.4rem' }} />
                    <div style={{ fontWeight: '600' }}>Drop files to add</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {filteredLibrary.map((track) => {
                  const loadedOnDecks = Object.values(decks).filter(d => d.track === track.filename);
                  return (
                    <div key={track.filename} style={{
                      background: loadedOnDecks.length > 0 ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${loadedOnDecks.length > 0 ? 'rgba(0,212,255,0.2)' : 'var(--panel-border)'}`,
                      borderRadius: '10px', padding: '0.7rem 0.9rem',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                          {track.filename.replace(/\.[^.]+$/, '')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>{formatSize(track.size)}</span>
                          <span style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>
                          <span style={{ opacity: 0.6 }}>{track.filename.split('.').pop()?.toUpperCase()}</span>
                          {loadedOnDecks.map(d => (
                            <span key={d.id} style={{ color: DECK_COLORS[d.id], fontWeight: '600' }}>
                              ● {d.name || `Deck ${d.id.toUpperCase()}`}
                              {d.is_playing ? ' ▶' : d.is_paused ? ' ⏸' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                        {['a', 'b', 'c', 'd'].map(deckId => {
                          const allowed = canControlDeck(deckId);
                          const isLoaded  = decks[deckId]?.track === track.filename;
                          const isPlaying = decks[deckId]?.is_playing && isLoaded;
                          const color     = DECK_COLORS[deckId];
                          return (
                            <button key={deckId}
                              disabled={!allowed}
                              title={!allowed ? "Lock — permission denied" : isLoaded ? `Unload from Deck ${deckId.toUpperCase()}` : `Load to Deck ${deckId.toUpperCase()}`}
                              onClick={() => handleDeckToggle(track, deckId)} style={{
                                width: '30px', height: '30px', borderRadius: '6px',
                                border: isLoaded ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.12)',
                                background: isLoaded ? `${color}30` : 'rgba(255,255,255,0.05)',
                                color: isLoaded ? color : 'var(--text-secondary)',
                                fontSize: '0.68rem', fontWeight: '700', cursor: allowed ? 'pointer' : 'not-allowed',
                                transition: 'all 0.15s', boxShadow: isPlaying ? `0 0 8px ${color}60` : 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: allowed ? 1 : 0.25,
                              }}>
                              {isLoaded ? '✕' : deckId.toUpperCase()}
                            </button>
                          );
                        })}
                        <button title={previewTrack === track.filename ? "Stop preview" : "Preview locally"} onClick={() => togglePreview(track.filename)} style={{
                          width: '30px', height: '30px', borderRadius: '6px',
                          border: previewTrack === track.filename ? '1px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.12)',
                          background: previewTrack === track.filename ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)',
                          color: previewTrack === track.filename ? 'var(--accent-blue)' : 'var(--text-secondary)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {previewTrack === track.filename ? <StopCircle size={14} /> : <PlayCircle size={14} />}
                        </button>
                        {hasFeature('can_library') && (
                          <button title="Delete from library" onClick={() => handleDelete(track.filename)} style={{
                            width: '30px', height: '30px', borderRadius: '6px',
                            border: '1px solid rgba(255,71,87,0.2)', background: 'rgba(255,71,87,0.08)',
                            color: 'rgba(255,71,87,0.6)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s', marginLeft: '0.2rem',
                          }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          PLAYLISTS TAB
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'playlists' && (
        <div className="glass-panel" style={{ minHeight: '400px' }}>
          {editingPlaylist && (
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ListMusic size={14} />
                {editingPlaylist === 'new' ? 'New Playlist' : `Editing: ${editingPlaylist.name}`}
              </div>
              <PlaylistEditor
                playlist={editingPlaylist === 'new' ? null : editingPlaylist}
                library={library}
                onSave={handleSavePlaylist}
                onCancel={() => setEditingPlaylist(null)}
              />
            </div>
          )}

          {playlists.length === 0 && !editingPlaylist ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <ListMusic size={40} style={{ opacity: 0.15 }} />
              <div style={{ fontSize: '0.95rem' }}>No playlists yet</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Organize your tracks into playlists for easy deck loading</div>
              <button onClick={() => setEditingPlaylist('new')} style={{
                marginTop: '0.5rem', padding: '0.5rem 1.1rem', borderRadius: '8px',
                border: '1px solid rgba(46,213,115,0.35)', background: 'rgba(46,213,115,0.1)',
                color: '#2ed573', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <Plus size={15} /> Create first playlist
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '0.75rem' }}>
              {playlists.map(pl => (
                <div key={pl.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem 1.1rem', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.65rem' }}>
                    <ListMusic size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.92rem' }}>{pl.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}</div>
                    </div>
                    <label title="Loop playlist" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <div onClick={() => setPlaylistLoop(prev => ({ ...prev, [pl.id]: !prev[pl.id] }))} style={{
                        width: '34px', height: '19px', borderRadius: '10px', position: 'relative', cursor: 'pointer',
                        background: playlistLoop[pl.id] ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)',
                        transition: 'background 0.2s', flexShrink: 0,
                      }}>
                        <div style={{ position: 'absolute', top: '2px', left: playlistLoop[pl.id] ? '17px' : '2px', width: '15px', height: '15px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                      </div>
                      <Repeat size={12} style={{ color: playlistLoop[pl.id] ? 'var(--accent-blue)' : 'var(--text-secondary)' }} />
                    </label>
                    {hasFeature('can_library') && (
                      <button onClick={() => setEditingPlaylist(pl)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.6rem', fontFamily: 'inherit' }}>Edit</button>
                    )}
                    {hasFeature('can_library') && (
                      <button onClick={() => handleDeletePlaylist(pl.id, pl.name)} style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: 'rgba(255,71,87,0.7)', borderRadius: '6px', cursor: 'pointer', padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {pl.tracks.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.7rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {pl.tracks.slice(0, 5).map((t, i) => (
                        <span key={i} style={{ background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.5rem', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {i + 1}. {t.replace(/\.[^.]+$/, '').slice(0, 24)}
                        </span>
                      ))}
                      {pl.tracks.length > 5 && <span style={{ opacity: 0.5, padding: '0.15rem 0' }}>+{pl.tracks.length - 5} more</span>}
                    </div>
                  )}

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginRight: '0.15rem' }}>Send to:</span>
                      {['a', 'b', 'c', 'd'].map(deckId => {
                        const allowed = canControlDeck(deckId);
                        return (
                          <button key={deckId} onClick={() => handleLoadPlaylist(pl.id, deckId)}
                            disabled={!allowed}
                            title={!allowed ? "Lock — permission denied" : `Load & play on Deck ${deckId.toUpperCase()}`}
                            style={{
                              padding: '0.35rem 0.7rem', borderRadius: '6px', border: `1px solid ${DECK_COLORS[deckId]}${allowed ? '40' : '20'}`,
                              background: `${DECK_COLORS[deckId]}${allowed ? '18' : '05'}`, color: DECK_COLORS[deckId],
                              cursor: allowed ? 'pointer' : 'not-allowed', fontSize: '0.75rem', fontWeight: '700',
                              display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit',
                              transition: 'all 0.15s', opacity: allowed ? 1 : 0.35,
                            }}>
                            <Play size={10} fill="currentColor" /> {deckId.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HIDDEN AUDIO PLAYER FOR PREVIEWS */}
      {previewTrack && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', padding: '0.6rem 1.2rem', borderRadius: '12px',
          border: '1px solid var(--accent-blue)', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '1rem',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{ color: 'white', fontSize: '0.85rem', fontWeight: '500', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Previewing: {previewTrack.replace(/\.[^.]+$/, '')}
          </div>
          <audio 
            ref={audioRef}
            src={`/api/library/file/${encodeURIComponent(previewTrack)}`}
            controls 
            autoPlay 
            style={{ height: '35px', outline: 'none' }} 
            onEnded={() => setPreviewTrack(null)}
          />
          <button onClick={() => togglePreview(previewTrack)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
