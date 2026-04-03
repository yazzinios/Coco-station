import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Music, Search, Send, CheckCircle, User, Phone, X, Headphones, Heart } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC REQUEST PAGE — No login required for DJ dashboard
   Listeners land here, sign in with Google, and request songs
   ═══════════════════════════════════════════════════════════════════ */
export default function RequestPage() {
  // User info (from Google sign-in or manual)
  const [user, setUser] = useState(null);
  const [manualName, setManualName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhoneField, setShowPhoneField] = useState(false);

  // Library & request flow
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const googleBtnRef = useRef(null);

  // ── Load library ─────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/library/public`)
      .then(r => r.ok ? r.json() : [])
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, []);

  // ── Google Sign-In ───────────────────────────────────────
  const handleGoogleResponse = useCallback((response) => {
    try {
      // Decode the JWT credential (payload is the second part)
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      setUser({
        name: payload.name || payload.email,
        email: payload.email,
        photo: payload.picture || null,
      });
      setShowPhoneField(true);
    } catch (err) {
      console.error('Google sign-in decode error:', err);
    }
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    // Load GSI script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
      });
      if (googleBtnRef.current) {
        window.google?.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
        });
      }
    };
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
  }, [handleGoogleResponse]);

  // ── Continue as guest ────────────────────────────────────
  const handleGuestContinue = () => {
    if (!manualName.trim()) return;
    setUser({ name: manualName.trim(), email: null, photo: null });
    setShowPhoneField(true);
  };

  // ── Submit request ───────────────────────────────────────
  const handleSubmit = async () => {
    if (!user || !selectedTrack) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_name: user.name,
          requester_email: user.email || null,
          requester_phone: phone || null,
          requester_photo: user.photo || null,
          track: selectedTrack,
          message: message || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to submit request');
      }
      setSubmitted(true);
      setSelectedTrack(null);
      setMessage('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLib = library.filter(t =>
    !search || t.filename.toLowerCase().includes(search.toLowerCase())
  );

  // ── Styles ───────────────────────────────────────────────
  const pageStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 30%, #0d1b2a 60%, #0a0a1a 100%)',
    color: 'white',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '2rem 1rem',
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    padding: '2rem',
    width: '100%', maxWidth: '480px',
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit',
    fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
  };

  // ────────────────────────────────────────────────────────
  // STEP 1: Sign in / identify
  // ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={pageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, #00d4ff, #5f27cd)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 30px rgba(0,212,255,0.3)',
          }}>
            <Headphones size={32} />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.3rem' }}>CocoStation</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem' }}>Request your favorite song 🎵</p>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1.5rem', textAlign: 'center' }}>
            How would you like to continue?
          </h2>

          {/* Google Sign-In */}
          {GOOGLE_CLIENT_ID && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.5rem' }}>
                Your email helps us keep you updated on events
              </p>
            </div>
          )}

          {/* Divider */}
          {GOOGLE_CLIENT_ID && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            </div>
          )}

          {/* Guest entry */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              value={manualName} onChange={e => setManualName(e.target.value)}
              placeholder="Enter your name"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleGuestContinue()}
            />
            <button onClick={handleGuestContinue} disabled={!manualName.trim()} style={{
              padding: '0.85rem', borderRadius: '12px', border: 'none',
              background: manualName.trim() ? 'linear-gradient(135deg, #00d4ff, #5f27cd)' : 'rgba(255,255,255,0.08)',
              color: manualName.trim() ? 'white' : 'rgba(255,255,255,0.3)',
              fontWeight: '600', fontSize: '0.95rem', cursor: manualName.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              transition: 'all 0.2s', fontFamily: 'inherit',
            }}>
              <User size={16} /> Continue as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  // STEP 1.5: Phone number (optional, after Google or guest)
  // ────────────────────────────────────────────────────────
  if (showPhoneField) {
    return (
      <div style={pageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {user.photo ? (
            <img src={user.photo} alt="" style={{ width: '56px', height: '56px', borderRadius: '50%', border: '3px solid rgba(0,212,255,0.3)', marginBottom: '0.75rem' }} />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 0.75rem', background: 'linear-gradient(135deg, #00d4ff, #5f27cd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: '700' }}>
              {user.name[0].toUpperCase()}
            </div>
          )}
          <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.2rem' }}>Welcome, {user.name}!</h2>
          {user.email && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{user.email}</p>}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Phone size={16} style={{ color: 'var(--accent-blue, #00d4ff)' }} />
            <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Add your phone number</span>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>Optional</span>
          </div>

          <input
            value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="+212 6XX XXX XXX" type="tel"
            style={{ ...inputStyle, marginBottom: '1rem' }}
          />
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginBottom: '1.25rem' }}>
            We'll use this to send you event updates & exclusive offers
          </p>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setShowPhoneField(false)} style={{
              flex: 1, padding: '0.85rem', borderRadius: '12px', border: 'none',
              background: 'linear-gradient(135deg, #00d4ff, #5f27cd)',
              color: 'white', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              Continue →
            </button>
            <button onClick={() => { setPhone(''); setShowPhoneField(false); }} style={{
              padding: '0.85rem 1.2rem', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.88rem',
            }}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  // STEP 3: Submitted confirmation
  // ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={pageStyle}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ ...cardStyle, textAlign: 'center', maxWidth: '420px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.5rem',
            background: 'rgba(46,213,115,0.15)', border: '2px solid rgba(46,213,115,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle size={32} style={{ color: '#2ed573' }} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>Request Sent! 🎶</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2rem', lineHeight: '1.5' }}>
            The DJ has received your song request.<br />
            They'll play it as soon as possible!
          </p>
          <button onClick={() => setSubmitted(false)} style={{
            padding: '0.85rem 2rem', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg, #00d4ff, #5f27cd)',
            color: 'white', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            margin: '0 auto', fontFamily: 'inherit',
          }}>
            <Heart size={16} /> Request Another Song
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  // STEP 2: Browse library & submit request
  // ────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* User header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', width: '100%', maxWidth: '480px' }}>
        {user.photo ? (
          <img src={user.photo} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid rgba(0,212,255,0.3)' }} />
        ) : (
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #5f27cd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.95rem', flexShrink: 0 }}>
            {user.name[0].toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{user.name}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>Song Request</div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Music size={18} /> Choose a Song
        </h2>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search songs…"
            style={{ ...inputStyle, paddingLeft: '2.2rem' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Track list */}
        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {filteredLib.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.9rem' }}>
              {search ? 'No songs found' : 'No songs available'}
            </div>
          ) : (
            filteredLib.map(track => {
              const isSelected = selectedTrack === track.filename;
              const displayName = track.filename.replace(/\.[^.]+$/, '');
              return (
                <div key={track.filename} onClick={() => setSelectedTrack(track.filename)}
                  style={{
                    padding: '0.65rem 0.85rem', borderRadius: '10px', cursor: 'pointer',
                    background: isSelected ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                    border: isSelected ? '1px solid rgba(0,212,255,0.35)' : '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    transition: 'all 0.15s',
                  }}>
                  <Music size={14} style={{ color: isSelected ? '#00d4ff' : 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: isSelected ? '600' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName}
                  </span>
                  {isSelected && <CheckCircle size={16} style={{ color: '#00d4ff', flexShrink: 0 }} />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Message + Submit */}
      {selectedTrack && (
        <div style={{ ...cardStyle, animation: 'slideIn 0.25s ease' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.3rem' }}>Selected Song</div>
            <div style={{ fontWeight: '600', fontSize: '1rem', color: '#00d4ff' }}>
              🎵 {selectedTrack.replace(/\.[^.]+$/, '')}
            </div>
          </div>

          <textarea
            value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Add a message for the DJ (optional)…"
            rows={2}
            style={{ ...inputStyle, resize: 'none', marginBottom: '1rem' }}
          />

          {error && (
            <div style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: '10px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#ff4757' }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: '0.9rem', borderRadius: '12px', border: 'none',
            background: submitting ? 'rgba(0,212,255,0.2)' : 'linear-gradient(135deg, #00d4ff, #5f27cd)',
            color: 'white', fontWeight: '700', fontSize: '1rem', cursor: submitting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
            fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: submitting ? 'none' : '0 0 20px rgba(0,212,255,0.2)',
          }}>
            <Send size={18} /> {submitting ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}
