import React, { useState } from 'react';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Invalid credentials');
        return;
      }
      localStorage.setItem('coco_token', data.access_token);
      localStorage.setItem('coco_user',  JSON.stringify(data.user));
      if (onLogin) onLogin(data.user);
    } catch (err) {
      setError('Connection error — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const inp = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '8px',
    border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.3)',
    color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.95rem',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', width: '100vw',
      background: 'radial-gradient(ellipse at 30% 40%, rgba(0,212,255,0.07) 0%, transparent 60%), #0d0d0d',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', padding: '2.5rem 2.25rem',
        background: 'rgba(20,20,26,0.92)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px', margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05))',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(0,212,255,0.15)',
          }}>
            <span style={{ fontSize: '1.6rem' }}>📻</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', marginBottom: '0.3rem', color: '#fff' }}>
            CocoStation
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Sign in to access the mixer dashboard
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '8px',
            background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.35)',
            color: '#ff6b7a', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span>✕</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.78rem',
              color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="cocoadmin"
              autoComplete="username"
              required
              style={inp}
              onFocus={e => e.target.style.borderColor = 'rgba(0,212,255,0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--panel-border)'}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.78rem',
              color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{ ...inp, paddingRight: '2.75rem' }}
                onFocus={e => e.target.style.borderColor = 'rgba(0,212,255,0.5)'}
                onBlur={e => e.target.style.borderColor = 'var(--panel-border)'}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', padding: '2px', display: 'flex',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem', width: '100%', padding: '0.85rem',
              borderRadius: '10px', border: 'none',
              background: loading ? 'rgba(0,212,255,0.4)' : 'var(--accent-blue)',
              color: '#000', fontWeight: '700', fontSize: '0.95rem',
              cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              boxShadow: loading ? 'none' : '0 0 20px rgba(0,212,255,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                Signing in…
              </>
            ) : (
              <>
                <LogIn size={16} /> Sign In
              </>
            )}
          </button>
        </form>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
