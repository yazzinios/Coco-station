import { useState, useEffect, useCallback } from 'react';
import { Music, Check, X, Trash2, RefreshCw, Inbox, User, Phone, MessageSquare, Play } from 'lucide-react';
import { useApp } from '../context/useApp';

const DECK_IDS = ['a', 'b', 'c', 'd'];

export default function RequestsManagementPage() {
  const { api, toast, musicRequests, decks } = useApp();
  const [loading,    setLoading]    = useState(false);
  const [accepting,  setAccepting]  = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [clearing,   setClearing]   = useState(false);
  const [filter,     setFilter]     = useState('pending');

  const requests = musicRequests || [];

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Data comes via WebSocket (musicRequests), but we can trigger a refetch if needed
      await new Promise(r => setTimeout(r, 300));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAccept = async (req) => {
    setAccepting(req.id);
    try {
      await api.acceptRequest(req.id);
      toast.success(`"${req.track}" queued for ${req.target_deck ? `Deck ${req.target_deck.toUpperCase()}` : 'a deck'}!`);
    } catch (e) {
      toast.error('Failed to accept: ' + e.message);
    } finally {
      setAccepting(null);
    }
  };

  const handleDismiss = async (req) => {
    setDismissing(req.id);
    try {
      await api.dismissRequest(req.id);
      toast.info('Request dismissed');
    } catch (e) {
      toast.error('Failed to dismiss: ' + e.message);
    } finally {
      setDismissing(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all requests? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.clearAllRequests();
      toast.success('All requests cleared');
    } catch (e) {
      toast.error('Failed to clear: ' + e.message);
    } finally {
      setClearing(false);
    }
  };

  const filtered = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter);

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    accepted: requests.filter(r => r.status === 'accepted').length,
  };

  const FILTERS = [
    { id: 'pending',  label: 'Pending',  color: '#fd9644' },
    { id: 'accepted', label: 'Accepted', color: '#2ed573' },
    { id: 'all',      label: 'All',      color: 'var(--text-secondary)' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
          <Music size={24} style={{ color: 'var(--accent-blue)' }} /> Song Requests
          {counts.pending > 0 && (
            <span style={{
              padding: '0.15rem 0.6rem', borderRadius: '999px', fontSize: '0.8rem',
              fontWeight: '700', background: 'rgba(253,150,68,0.15)',
              border: '1px solid rgba(253,150,68,0.4)', color: '#fd9644',
            }}>
              {counts.pending} new
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={refresh} disabled={loading}
            style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.08)', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          {requests.length > 0 && (
            <button onClick={handleClearAll} disabled={clearing}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.08)', color: '#ff4757', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', opacity: clearing ? 0.6 : 1 }}>
              <Trash2 size={13} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--panel-border)', marginBottom: '1.25rem' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '0.55rem 1.1rem', background: 'none', border: 'none',
              borderBottom: filter === f.id ? `2px solid ${f.color}` : '2px solid transparent',
              color: filter === f.id ? f.color : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem',
              fontWeight: filter === f.id ? '600' : '400', marginBottom: '-1px',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
            {f.label}
            <span style={{
              padding: '0.05rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem',
              background: filter === f.id ? `${f.color}22` : 'rgba(255,255,255,0.06)',
              color: filter === f.id ? f.color : 'var(--text-secondary)',
            }}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
          <Inbox size={40} style={{ margin: '0 auto 1rem', opacity: 0.3, display: 'block' }} />
          <div style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.4rem' }}>No requests</div>
          <div style={{ fontSize: '0.82rem', opacity: 0.6 }}>
            {filter === 'pending' ? 'No pending song requests from listeners' : `No ${filter} requests`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(req => {
            const isPending  = req.status === 'pending';
            const isAccepted = req.status === 'accepted';
            const trackName  = (req.track || 'Unknown Track').replace(/\.[^.]+$/, '');
            const timeAgo    = req.created_at ? formatTimeAgo(req.created_at) : '';

            return (
              <div key={req.id} className="glass-panel"
                style={{
                  padding: '1.1rem 1.25rem',
                  borderLeft: `3px solid ${isPending ? '#fd9644' : isAccepted ? '#2ed573' : 'var(--panel-border)'}`,
                  opacity: isAccepted ? 0.75 : 1,
                  transition: 'opacity 0.2s',
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>

                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(95,39,205,0.2))',
                    border: '1px solid rgba(0,212,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '700', fontSize: '1rem', color: 'var(--accent-blue)',
                    overflow: 'hidden',
                  }}>
                    {req.requester_photo
                      ? <img src={req.requester_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (req.requester_name || '?').charAt(0).toUpperCase()
                    }
                  </div>

                  {/* Main content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Track */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <Music size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                      <span style={{ fontWeight: '600', fontSize: '0.95rem', color: 'white' }}>{trackName}</span>
                      {req.target_deck && (
                        <span style={{
                          padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600',
                          background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: 'var(--accent-blue)',
                        }}>
                          Deck {req.target_deck.toUpperCase()}
                        </span>
                      )}
                      {isAccepted && (
                        <span style={{
                          padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600',
                          background: 'rgba(46,213,115,0.1)', border: '1px solid rgba(46,213,115,0.25)', color: '#2ed573',
                        }}>
                          ✓ Accepted
                        </span>
                      )}
                    </div>

                    {/* Requester info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: req.message ? '0.4rem' : 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <User size={12} /> {req.requester_name || 'Anonymous'}
                      </span>
                      {req.requester_phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <Phone size={12} /> {req.requester_phone}
                        </span>
                      )}
                      {timeAgo && (
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>
                          {timeAgo}
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    {req.message && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginTop: '0.35rem',
                        padding: '0.45rem 0.7rem', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <MessageSquare size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: '1.4' }}>
                          "{req.message}"
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignSelf: 'center' }}>
                      <button
                        onClick={() => handleAccept(req)}
                        disabled={accepting === req.id}
                        style={{
                          padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(46,213,115,0.4)',
                          background: 'rgba(46,213,115,0.12)', color: '#2ed573',
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem',
                          display: 'flex', alignItems: 'center', gap: '0.35rem',
                          opacity: accepting === req.id ? 0.5 : 1, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(46,213,115,0.22)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(46,213,115,0.12)'}
                      >
                        {accepting === req.id ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleDismiss(req)}
                        disabled={dismissing === req.id}
                        style={{
                          padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,71,87,0.3)',
                          background: 'rgba(255,71,87,0.08)', color: '#ff4757',
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem',
                          display: 'flex', alignItems: 'center', gap: '0.35rem',
                          opacity: dismissing === req.id ? 0.5 : 1, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,71,87,0.08)'}
                      >
                        <X size={13} /> Dismiss
                      </button>
                    </div>
                  )}
                  {!isPending && (
                    <button
                      onClick={() => handleDismiss(req)}
                      disabled={dismissing === req.id}
                      style={{
                        padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid var(--panel-border)',
                        background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        alignSelf: 'center', flexShrink: 0,
                        opacity: dismissing === req.id ? 0.5 : 1,
                      }}>
                      <X size={12} /> Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function formatTimeAgo(dateStr) {
  try {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}
