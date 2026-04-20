/**
 * LoginPage.jsx — CocoStation
 * ──────────────────────────────────────────────────────────────
 * Features:
 *  • Auto-detects LDAP availability via GET /api/auth/methods
 *  • Domain / Local account toggle when LDAP is enabled
 *  • JWT login via POST /api/auth/login
 *  • "Remember me" — persists username in localStorage
 *  • Role badge shown briefly after successful login
 */

import React, { useState, useEffect } from 'react';
import { LogIn, Eye, EyeOff, ShieldCheck, Building2, User } from 'lucide-react';

// ── Role display config ────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  super_admin: { label: '⭐ Super Admin', color: '#ffd700', bg: 'rgba(255,215,0,0.12)',   border: 'rgba(255,215,0,0.3)' },
  admin:       { label: '🛡 Admin',       color: '#fd9644', bg: 'rgba(253,150,68,0.12)',  border: 'rgba(253,150,68,0.3)' },
  operator:    { label: '🎛 Operator',    color: '#00d4ff', bg: 'rgba(0,212,255,0.10)',   border: 'rgba(0,212,255,0.25)' },
  viewer:      { label: '👁 Viewer',      color: '#a0aec0', bg: 'rgba(160,174,192,0.10)', border: 'rgba(160,174,192,0.25)' },
};
function getRoleConfig(user) {
  if (user?.is_super_admin) return ROLE_CONFIG.super_admin;
  return ROLE_CONFIG[user?.role] || ROLE_CONFIG.operator;
}

// ── Success overlay ───────────────────────────────────────────────────────────
function LoginSuccess({ user }) {
  const rc = getRoleConfig(user);
  return (
    <div style={{ textAlign: 'center', animation: 'fadeIn 0.35s ease forwards', padding: '1rem 0' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.25rem',
        background: rc.bg, border: `1px solid ${rc.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 24px ${rc.border}`,
      }}>
        <ShieldCheck size={28} color={rc.color} />
      </div>
      <p style={{ fontSize: '1rem', fontWeight: '600', color: '#fff', margin: '0 0 0.4rem' }}>
        Welcome, {user.display_name || user.username}!
      </p>
      <span style={{
        display: 'inline-block', padding: '0.25rem 0.8rem', borderRadius: '999px',
        fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
        color: rc.color, background: rc.bg, border: `1px solid ${rc.border}`,
      }}>
        {rc.label}
      </span>
      <p style={{ marginTop: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        Loading dashboard…
      </p>
    </div>
  );
}

// ── Method Selector (shown when LDAP is available) ────────────────────────────
function MethodToggle({ method, setMethod, domain }) {
  const opts = [
    { value: 'local', label: 'Local Account', icon: <User size={14} />,     desc: 'CocoStation DB' },
    { value: 'ldap',  label: 'Domain',        icon: <Building2 size={14} />, desc: domain || 'Active Directory' },
  ];
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{
        display: 'block', marginBottom: '0.45rem', fontSize: '0.78rem',
        color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        Sign in with
      </label>
      <div style={{ display: 'flex', gap: 0, borderRadius: '9px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
        {opts.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => setMethod(o.value)}
            style={{
              flex: 1, padding: '0.6rem 0.5rem',
              background: method === o.value ? 'rgba(0,212,255,0.15)' : 'rgba(0,0,0,0.25)',
              border: 'none',
              borderRight: o.value === 'local' ? '1px solid var(--panel-border)' : 'none',
              color: method === o.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: method === o.value ? '600' : '400' }}>
              {o.icon} {o.label}
            </span>
            <span style={{ fontSize: '0.67rem', opacity: 0.65 }}>{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main LoginPage ─────────────────────────────────────────────────────────────
export default function LoginPage({ onLogin }) {
  const [username,    setUsername]    = useState('');
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [rememberMe,  setRememberMe]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [loggedUser,  setLoggedUser]  = useState(null);

  // Auth methods
  const [method,      setMethod]      = useState('local'); // 'local' | 'ldap'
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapDomain,  setLdapDomain]  = useState('');
  const [methodsLoaded, setMethodsLoaded] = useState(false);

  // Detect available login methods
  useEffect(() => {
    fetch('/api/auth/methods')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.ldap) {
          setLdapEnabled(true);
          setLdapDomain(data.domain || '');
          // Default to local so admins aren't locked out
          setMethod('local');
        }
      })
      .catch(() => {})
      .finally(() => setMethodsLoaded(true));
  }, []);

  // Restore remembered username
  useEffect(() => {
    const saved = localStorage.getItem('coco_remembered_username');
    if (saved) { setUsername(saved); setRememberMe(true); }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          username:     username.trim(),
          password,
          login_method: method,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Invalid username or password');
        return;
      }

      localStorage.setItem('coco_token', data.access_token);
      localStorage.setItem('coco_user',  JSON.stringify(data.user));
      if (data.user?.permissions) {
        localStorage.setItem('coco_permissions', JSON.stringify(data.user.permissions));
      }

      if (rememberMe) {
        localStorage.setItem('coco_remembered_username', username.trim());
      } else {
        localStorage.removeItem('coco_remembered_username');
      }

      setLoggedUser(data.user);
      setTimeout(() => { if (onLogin) onLogin(data.user); }, 1400);

    } catch {
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

  const usernamePlaceholder = method === 'ldap'
    ? (ldapDomain ? `user@${ldapDomain}` : 'domain\\username')
    : 'cocoadmin';

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

        {loggedUser ? <LoginSuccess user={loggedUser} /> : (
          <>
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
                animation: 'shake 0.3s ease',
              }}>
                <span style={{ flexShrink: 0 }}>✕</span> {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

              {/* Method toggle — only shown when LDAP is available */}
              {ldapEnabled && methodsLoaded && (
                <MethodToggle method={method} setMethod={m => { setMethod(m); setError(''); }} domain={ldapDomain} />
              )}

              {/* LDAP domain banner */}
              {method === 'ldap' && (
                <div style={{
                  padding: '0.55rem 0.9rem', borderRadius: '8px', marginTop: '-0.4rem',
                  background: 'rgba(165,94,234,0.08)', border: '1px solid rgba(165,94,234,0.25)',
                  fontSize: '0.78rem', color: '#a55eea', display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <Building2 size={13} />
                  Signing in with <strong>{ldapDomain || 'Active Directory'}</strong>
                </div>
              )}

              {/* Username */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.78rem',
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {method === 'ldap' ? 'Domain Username' : 'Username'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={usernamePlaceholder}
                  autoComplete="username"
                  required
                  style={inp}
                  onFocus={e => e.target.style.borderColor = method === 'ldap' ? 'rgba(165,94,234,0.5)' : 'rgba(0,212,255,0.5)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--panel-border)'}
                />
              </div>

              {/* Password */}
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
                    onFocus={e => e.target.style.borderColor = method === 'ldap' ? 'rgba(165,94,234,0.5)' : 'rgba(0,212,255,0.5)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--panel-border)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', padding: '2px', display: 'flex',
                    }}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setRememberMe(v => !v)}
                  style={{
                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                    border: `1.5px solid ${rememberMe ? 'var(--accent-blue)' : 'var(--panel-border)'}`,
                    background: rememberMe ? 'rgba(0,212,255,0.2)' : 'rgba(0,0,0,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s', cursor: 'pointer',
                  }}
                >
                  {rememberMe && <span style={{ color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                  Remember my username
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.5rem', width: '100%', padding: '0.85rem',
                  borderRadius: '10px', border: 'none',
                  background: loading
                    ? 'rgba(0,212,255,0.4)'
                    : method === 'ldap'
                      ? 'linear-gradient(135deg, #7c3aed, #a55eea)'
                      : 'var(--accent-blue)',
                  color: '#fff', fontWeight: '700', fontSize: '0.95rem',
                  cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  boxShadow: loading ? 'none' : method === 'ldap'
                    ? '0 0 20px rgba(165,94,234,0.35)'
                    : '0 0 20px rgba(0,212,255,0.3)',
                  transition: 'all 0.2s',
                }}
              >
                {loading ? (
                  <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Signing in…</>
                ) : method === 'ldap' ? (
                  <><Building2 size={16} /> Sign in with Domain</>
                ) : (
                  <><LogIn size={16} /> Sign In</>
                )}
              </button>
            </form>

            {/* Footer */}
            <p style={{
              textAlign: 'center', marginTop: '1.75rem', fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.2)', lineHeight: 1.5,
            }}>
              CocoStation · Radio Management System
            </p>
          </>
        )}

        <style>{`
          @keyframes spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes shake  { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-4px); } 40%,80% { transform: translateX(4px); } }
        `}</style>
      </div>
    </div>
  );
}
