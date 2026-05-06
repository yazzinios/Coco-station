import React, { useState } from 'react';
import { ListMusic, Play, Repeat, Music2, User, MessageSquare, Check, X, Trash2 } from 'lucide-react';
import DeckPanel from '../components/DeckPanel';
import OnAirButton from '../components/OnAirButton';
import { useApp } from '../context/useApp';

const DECK_COLORS = { a: '#00d4ff', b: '#a55eea', c: '#26de81', d: '#fd9644', e: '#ff6b9d' };

/* ─────────────────────── Multi-Deck Broadcast Launcher ─────────────────────── */
const DECK_IDS = ['a', 'b', 'c', 'd', 'e'];

function BroadcastLauncher() {
  const { playlists, library, decks, toast, api, canControlDeck } = useApp();
  const [selectedDecks, setSelectedDecks] = useState([]);
  const [loop,          setLoop]          = useState(false);
  const [launching,     setLaunching]     = useState(false);
  const [tab,           setTab]           = useState('playlists'); // 'playlists' | 'tracks'

  const controllableDecks = DECK_IDS.filter(d => canControlDeck(d));

  const toggleDeck = (d) =>
    setSelectedDecks(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );

  const selectAll  = () => setSelectedDecks([...controllableDecks]);
  const selectNone = () => setSelectedDecks([]);

  /* ── Launch playlist to all selected decks in parallel ── */
  const launchPlaylist = async (playlistId, playlistName) => {
    if (selectedDecks.length === 0) { toast.warning('Select at least one deck'); return; }
    setLaunching(true);
    const results = await Promise.allSettled(
      selectedDecks.map(d => api.loadPlaylist(d, playlistId, loop))
    );
    setLaunching(false);
    const ok  = results.filter(r => r.status === 'fulfilled').length;
    const err = results.filter(r => r.status === 'rejected').length;
    if (err === 0)
      toast.success(`"${playlistName}" → Decks ${selectedDecks.map(d => d.toUpperCase()).join(', ')}${loop ? ' 🔁' : ''}`);
    else if (ok > 0)
      toast.warning(`Launched to ${ok} deck(s), ${err} failed`);
    else
      toast.error('Launch failed on all decks');
  };

  /* ── Load single track to all selected decks in parallel ── */
  const launchTrack = async (filename) => {
    if (selectedDecks.length === 0) { toast.warning('Select at least one deck'); return; }
    setLaunching(true);
    const results = await Promise.allSettled(
      selectedDecks.map(d => api.loadTrack(d, filename))
    );
    setLaunching(false);
    const ok  = results.filter(r => r.status === 'fulfilled').length;
    const err = results.filter(r => r.status === 'rejected').length;
    const name = filename.replace(/\.[^.]+$/, '');
    if (err === 0)
      toast.success(`"${name}" → Decks ${selectedDecks.map(d => d.toUpperCase()).join(', ')}`);
    else if (ok > 0)
      toast.warning(`Loaded to ${ok} deck(s), ${err} failed`);
    else
      toast.error('Load failed on all decks');
  };

  const trackList = (library || []).filter(t =>
    /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(t.filename)
  );

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>

      {/* ── Header ── */}
      <h3 style={{
        color: 'var(--text-secondary)', fontSize: '0.9rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.85rem 0',
      }}>
        <Play size={16} /> Broadcast Launcher
        <span style={{
          marginLeft: 'auto', fontSize: '0.68rem',
          color: selectedDecks.length > 0 ? '#2ed573' : 'var(--text-secondary)',
        }}>
          {selectedDecks.length === 0 ? 'No decks selected' : `${selectedDecks.length} deck${selectedDecks.length > 1 ? 's' : ''} selected`}
        </span>
      </h3>

      {/* ── Deck selector ── */}
      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.4rem' }}>
          {DECK_IDS.map(d => {
            const allowed  = canControlDeck(d);
            const selected = selectedDecks.includes(d);
            const deckName = decks[d]?.name || `Deck ${d.toUpperCase()}`;
            return (
              <button key={d}
                onClick={() => allowed && toggleDeck(d)}
                disabled={!allowed}
                title={allowed ? deckName : `${deckName} — permission denied`}
                style={{
                  flex: 1, padding: '0.45rem 0.2rem', borderRadius: '8px', fontFamily: 'inherit',
                  border: `2px solid ${selected ? DECK_COLORS[d] : DECK_COLORS[d] + '30'}`,
                  background: selected ? DECK_COLORS[d] + '22' : 'rgba(255,255,255,0.03)',
                  color: selected ? DECK_COLORS[d] : allowed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                  cursor: allowed ? 'pointer' : 'not-allowed',
                  fontSize: '0.75rem', fontWeight: '700',
                  boxShadow: selected ? `0 0 10px ${DECK_COLORS[d]}40` : 'none',
                  transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
                }}>
                <span>{d.toUpperCase()}</span>
                {selected && (
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: DECK_COLORS[d] }} />
                )}
              </button>
            );
          })}
        </div>
        {/* Select all / none */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={selectAll} style={{
            flex: 1, padding: '0.22rem', borderRadius: '5px', fontFamily: 'inherit',
            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.68rem',
          }}>All</button>
          <button onClick={selectNone} style={{
            flex: 1, padding: '0.22rem', borderRadius: '5px', fontFamily: 'inherit',
            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.68rem',
          }}>None</button>
          {/* Loop toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Loop</span>
            <div onClick={() => setLoop(v => !v)} style={{
              width: '28px', height: '16px', borderRadius: '8px', position: 'relative', cursor: 'pointer',
              background: loop ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: '2px', left: loop ? '14px' : '2px',
                width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {['playlists', 'tracks'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '0.32rem', borderRadius: '6px', fontFamily: 'inherit', cursor: 'pointer',
            border: `1px solid ${tab === t ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
            background: tab === t ? 'rgba(0,212,255,0.1)' : 'transparent',
            color: tab === t ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontSize: '0.75rem', fontWeight: tab === t ? '700' : '400',
            textTransform: 'capitalize', transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>

        {tab === 'playlists' && (
          playlists.length === 0
            ? <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.82rem' }}>
                No playlists — create one in the Library page
              </div>
            : playlists.map(pl => (
                <div key={pl.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)',
                  borderRadius: '8px', padding: '0.55rem 0.75rem',
                }}>
                  <ListMusic size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pl.name}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{pl.tracks.length} tracks</div>
                  </div>
                  <button
                    onClick={() => launchPlaylist(pl.id, pl.name)}
                    disabled={launching || selectedDecks.length === 0}
                    style={{
                      padding: '0.3rem 0.7rem', borderRadius: '6px', border: 'none', fontFamily: 'inherit',
                      background: selectedDecks.length > 0 ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)',
                      color: selectedDecks.length > 0 ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)',
                      cursor: selectedDecks.length > 0 && !launching ? 'pointer' : 'not-allowed',
                      fontSize: '0.72rem', fontWeight: '700',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >
                    <Play size={10} fill="currentColor" />
                    {launching ? '…' : `→ ${selectedDecks.length > 0 ? selectedDecks.map(d=>d.toUpperCase()).join('+') : '?'}`}
                  </button>
                </div>
              ))
        )}

        {tab === 'tracks' && (
          trackList.length === 0
            ? <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.82rem' }}>
                No tracks in library
              </div>
            : trackList.map(t => (
                <div key={t.filename} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)',
                  borderRadius: '8px', padding: '0.45rem 0.75rem',
                }}>
                  <Music2 size={12} style={{ color: '#a55eea', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.filename.replace(/\.[^.]+$/, '')}
                  </div>
                  <button
                    onClick={() => launchTrack(t.filename)}
                    disabled={launching || selectedDecks.length === 0}
                    style={{
                      padding: '0.28rem 0.65rem', borderRadius: '6px', border: 'none', fontFamily: 'inherit',
                      background: selectedDecks.length > 0 ? 'rgba(165,94,234,0.15)' : 'rgba(255,255,255,0.05)',
                      color: selectedDecks.length > 0 ? '#a55eea' : 'rgba(255,255,255,0.2)',
                      cursor: selectedDecks.length > 0 && !launching ? 'pointer' : 'not-allowed',
                      fontSize: '0.72rem', fontWeight: '700',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >
                    <Play size={10} fill="currentColor" />
                    {launching ? '…' : `→ ${selectedDecks.length > 0 ? selectedDecks.map(d=>d.toUpperCase()).join('+') : '?'}`}
                  </button>
                </div>
              ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Music Requests Panel ─────────────────────── */
function MusicRequestsPanel() {
  const { musicRequests, toast, api } = useApp();

  const pending = musicRequests.filter(r => r.status === 'pending');

  const handleAccept = async (id) => {
    try {
      const result = await api.acceptRequest(id);
      toast.success(`Track loaded to Deck ${(result.loaded_to || 'A').toUpperCase()}`);
    } catch (err) { toast.error(err.message); }
  };

  const handleDismiss = async (id) => {
    try { await api.dismissRequest(id); } catch (err) { toast.error(err.message); }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all music requests?')) return;
    try { await api.clearAllRequests(); toast.info('All requests cleared'); }
    catch (err) { toast.error(err.message); }
  };

  const timeAgo = (isoStr) => {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Music2 size={16} /> Music Requests
          {pending.length > 0 && (
            <span style={{
              background: 'rgba(255,71,87,0.2)', color: '#ff4757', fontSize: '0.72rem',
              padding: '0.1rem 0.45rem', borderRadius: '10px', fontWeight: '700',
              animation: 'pulse 2s infinite',
            }}>
              {pending.length}
            </span>
          )}
        </h3>
        {pending.length > 0 && (
          <button onClick={handleClearAll} title="Clear all" style={{
            background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)',
            color: 'rgba(255,71,87,0.6)', borderRadius: '6px', padding: '0.25rem 0.5rem',
            cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: 'inherit',
          }}>
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>
          <Music2 size={28} style={{ opacity: 0.15, marginBottom: '0.5rem', display: 'block', margin: '0 auto 0.5rem' }} />
          No pending requests
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
          {pending.map(req => (
            <div key={req.id} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
              borderRadius: '10px', padding: '0.75rem 0.85rem',
              borderLeft: '3px solid var(--accent-blue)',
              animation: 'slideIn 0.25s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                {req.requester_photo ? (
                  <img src={req.requester_photo} alt="" style={{
                    width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid rgba(0,212,255,0.3)',
                  }} />
                ) : (
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)',
                  }}>
                    <User size={14} style={{ color: 'var(--accent-blue)' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '600' }}>{req.requester_name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    {req.requester_email && <span>{req.requester_email} · </span>}
                    {timeAgo(req.created_at)}
                  </div>
                </div>
              </div>

              <div style={{
                background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)',
                borderRadius: '6px', padding: '0.4rem 0.6rem', marginBottom: '0.5rem',
                fontSize: '0.85rem', fontWeight: '500',
              }}>
                🎵 {req.track.replace(/\.[^.]+$/, '')}
              </div>

              {req.message && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                  <MessageSquare size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontStyle: 'italic' }}>"{req.message}"</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => handleAccept(req.id)} style={{
                  flex: 1, padding: '0.4rem', borderRadius: '6px', border: 'none',
                  background: 'rgba(46,213,115,0.15)', color: '#2ed573',
                  cursor: 'pointer', fontWeight: '600', fontSize: '0.78rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                  <Check size={13} /> Accept & Load
                </button>
                <button onClick={() => handleDismiss(req.id)} style={{
                  padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,71,87,0.2)',
                  background: 'rgba(255,71,87,0.06)', color: 'rgba(255,71,87,0.65)',
                  cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.2rem',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MIXER PAGE
   ═══════════════════════════════════════════════════════════ */
export default function MixerPage() {
  const { canViewDeck, hasFeature } = useApp();

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Mixer Deck</h2>

      {/* 5 decks */}
      <div className="deck-grid">
        {canViewDeck('a') && <DeckPanel id="a" />}
        {canViewDeck('b') && <DeckPanel id="b" />}
        {canViewDeck('c') && <DeckPanel id="c" />}
        {canViewDeck('d') && <DeckPanel id="d" />}
        {canViewDeck('e') && <DeckPanel id="e" />}
      </div>

      {/* Bottom row: Playlist Launcher + On Air + Music Requests */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
        <BroadcastLauncher />
        {hasFeature('can_announce') && <OnAirButton />}
        {hasFeature('can_requests') && <MusicRequestsPanel />}
      </div>
    </div>
  );
}
