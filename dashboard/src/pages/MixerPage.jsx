import React, { useState } from 'react';
import { ListMusic, Play, Repeat, Music2, User, MessageSquare, Check, X, Trash2 } from 'lucide-react';
import DeckPanel from '../components/DeckPanel';
import OnAirButton from '../components/OnAirButton';
import { useApp } from '../context/useApp';

const DECK_COLORS = { a: '#00d4ff', b: '#a55eea', c: '#26de81', d: '#fd9644' };

/* ─────────────────────── Playlist Launcher ─────────────────────── */
function PlaylistLauncher() {
  const { playlists, toast, api, canControlDeck } = useApp();
  const [loopState, setLoopState] = useState({});

  const handleLoad = async (playlistId, deckId) => {
    const loop = loopState[playlistId] ?? false;
    try {
      await api.loadPlaylist(deckId, playlistId, loop);
      toast.success(`Playlist → Deck ${deckId.toUpperCase()}${loop ? ' 🔁' : ''}`);
    } catch (err) { toast.error(err.message); }
  };

  if (playlists.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.75rem 0' }}>
          <ListMusic size={16} /> Playlists
        </h3>
        <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
          No playlists — create one in the Library page
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.85rem 0' }}>
        <ListMusic size={16} /> Quick Playlist Launcher
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {playlists.map(pl => (
          <div key={pl.id} style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)',
            borderRadius: '10px', padding: '0.7rem 0.85rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ListMusic size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pl.tracks.length} tracks</span>
              <div onClick={() => setLoopState(prev => ({ ...prev, [pl.id]: !prev[pl.id] }))} style={{
                width: '28px', height: '16px', borderRadius: '8px', position: 'relative', cursor: 'pointer',
                background: loopState[pl.id] ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{ position: 'absolute', top: '2px', left: loopState[pl.id] ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
              </div>
              <Repeat size={11} style={{ color: loopState[pl.id] ? 'var(--accent-blue)' : 'var(--text-secondary)', flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['a', 'b', 'c', 'd'].map(dId => {
                const allowed = canControlDeck(dId);
                return (
                  <button key={dId} onClick={() => handleLoad(pl.id, dId)}
                    disabled={!allowed}
                    style={{
                      flex: 1, padding: '0.3rem', borderRadius: '6px',
                      border: `1px solid ${DECK_COLORS[dId]}${allowed ? '40' : '20'}`,
                      background: `${DECK_COLORS[dId]}${allowed ? '15' : '05'}`,
                      color: DECK_COLORS[dId], cursor: allowed ? 'pointer' : 'not-allowed',
                      fontSize: '0.72rem', fontWeight: '700',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem',
                      fontFamily: 'inherit', transition: 'all 0.15s',
                      opacity: allowed ? 1 : 0.3,
                    }}>
                    <Play size={9} fill="currentColor" /> {dId.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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

      {/* 4 decks */}
      <div className="deck-grid">
        {canViewDeck('a') && <DeckPanel id="a" />}
        {canViewDeck('b') && <DeckPanel id="b" />}
        {canViewDeck('c') && <DeckPanel id="c" />}
        {canViewDeck('d') && <DeckPanel id="d" />}
      </div>

      {/* Bottom row: Playlist Launcher + On Air + Music Requests */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
        <PlaylistLauncher />
        {hasFeature('can_announce') && <OnAirButton />}
        {hasFeature('can_requests') && <MusicRequestsPanel />}
      </div>
    </div>
  );
}
