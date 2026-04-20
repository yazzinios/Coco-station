/**
 * SessionGuard.jsx — CocoStation
 * ──────────────────────────────────────────────────────────────
 * Watches the JWT expiry time and:
 *  1. Shows a countdown warning when ≤ 5 minutes remain
 *  2. Offers a "Stay signed in" button that calls POST /api/auth/refresh
 *  3. Auto-logs out when the token actually expires
 *
 * Usage — place INSIDE AppProvider, wrapping children:
 *   <AppProvider>
 *     <SessionGuard>
 *       {children}
 *     </SessionGuard>
 *   </AppProvider>
 *
 * Or simply drop <SessionGuard /> at the top of AppLayout in App.jsx.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Timer, RefreshCw, LogOut } from 'lucide-react';
import { useApp } from '../context/useApp';

// ── JWT decode helper (no library needed — just base64) ──────────────────────
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getTokenExpiry() {
  const token = localStorage.getItem('coco_token');
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000; // convert to ms
}

// ── Warning thresholds ────────────────────────────────────────────────────────
const WARN_AT_MS   = 5 * 60 * 1000;  // show warning at 5 minutes left
const DANGER_AT_MS = 1 * 60 * 1000;  // turn red at 1 minute left

// ── Countdown display ─────────────────────────────────────────────────────────
function formatCountdown(msLeft) {
  if (msLeft <= 0) return '0:00';
  const s = Math.floor(msLeft / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SessionGuard({ children }) {
  const { logout, login, currentUser, toast } = useApp();

  const [msLeft,      setMsLeft]      = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [dismissed,   setDismissed]   = useState(false);

  const tickRef  = useRef(null);
  const logoutScheduled = useRef(null);

  // ── Start/restart countdown whenever user changes ──────────
  const startCountdown = useCallback(() => {
    setDismissed(false);
    if (tickRef.current)        clearInterval(tickRef.current);
    if (logoutScheduled.current) clearTimeout(logoutScheduled.current);

    const expiry = getTokenExpiry();
    if (!expiry) return;

    const now    = Date.now();
    const left   = expiry - now;

    if (left <= 0) {
      logout();
      return;
    }

    setMsLeft(left);

    // Tick every second
    tickRef.current = setInterval(() => {
      const remaining = getTokenExpiry() - Date.now();
      if (remaining <= 0) {
        clearInterval(tickRef.current);
        logout();
        return;
      }
      setMsLeft(remaining);
    }, 1000);

    // Schedule forced logout exactly at expiry
    logoutScheduled.current = setTimeout(() => {
      clearInterval(tickRef.current);
      logout();
    }, left + 500);
  }, [logout]);

  useEffect(() => {
    if (currentUser) {
      startCountdown();
    } else {
      clearInterval(tickRef.current);
      clearTimeout(logoutScheduled.current);
      setMsLeft(null);
    }
    return () => {
      clearInterval(tickRef.current);
      clearTimeout(logoutScheduled.current);
    };
  }, [currentUser, startCountdown]);

  // ── Token refresh ───────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem('coco_token');
      const res   = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Refresh failed');

      const data = await res.json();
      localStorage.setItem('coco_token', data.access_token);
      localStorage.setItem('coco_user',  JSON.stringify(data.user));
      if (data.user?.permissions) {
        localStorage.setItem('coco_permissions', JSON.stringify(data.user.permissions));
      }

      // Update context and restart countdown
      login(data.user);
      setDismissed(true);
      toast.success('Session extended ✓');
    } catch (err) {
      toast.error('Could not refresh session: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Determine whether to show warning ──────────────────────
  const showWarning = !dismissed && msLeft !== null && msLeft <= WARN_AT_MS && msLeft > 0;
  const isDanger    = msLeft !== null && msLeft <= DANGER_AT_MS;

  return (
    <>
      {children}

      {/* ── Session expiry banner ── */}
      {showWarning && (
        <div style={{
          position:   'fixed',
          bottom:     '5rem',
          left:       '50%',
          transform:  'translateX(-50%)',
          zIndex:     8888,
          minWidth:   '320px',
          maxWidth:   '480px',
          background: isDanger ? 'rgba(255,71,87,0.12)' : 'rgba(253,150,68,0.10)',
          border:     `1px solid ${isDanger ? 'rgba(255,71,87,0.4)' : 'rgba(253,150,68,0.4)'}`,
          borderRadius: '12px',
          padding:    '1rem 1.25rem',
          backdropFilter: 'blur(16px)',
          boxShadow:  '0 8px 32px rgba(0,0,0,0.5)',
          animation:  'slideUp 0.3s ease',
          display:    'flex',
          alignItems: 'center',
          gap:        '1rem',
        }}>
          {/* Icon */}
          <div style={{
            flexShrink: 0,
            width: '36px', height: '36px', borderRadius: '50%',
            background: isDanger ? 'rgba(255,71,87,0.15)' : 'rgba(253,150,68,0.15)',
            border: `1px solid ${isDanger ? 'rgba(255,71,87,0.3)' : 'rgba(253,150,68,0.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Timer size={18} color={isDanger ? '#ff4757' : '#fd9644'} />
          </div>

          {/* Message */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.85rem', fontWeight: '600',
              color: isDanger ? '#ff6b7a' : '#fd9644',
              marginBottom: '0.15rem',
            }}>
              {isDanger ? '⚠️ Session expiring!' : '🕐 Session expiring soon'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {formatCountdown(msLeft)} remaining — save your work.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '0.4rem 0.8rem', borderRadius: '8px',
                background: isDanger ? 'rgba(255,71,87,0.15)' : 'rgba(253,150,68,0.15)',
                border:     `1px solid ${isDanger ? 'rgba(255,71,87,0.4)' : 'rgba(253,150,68,0.4)'}`,
                color:      isDanger ? '#ff6b7a' : '#fd9644',
                cursor:     refreshing ? 'not-allowed' : 'pointer',
                fontSize:   '0.78rem', fontWeight: '600',
                display:    'flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'inherit',
                opacity:    refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? 'Refreshing…' : 'Stay signed in'}
            </button>

            <button
              onClick={() => setDismissed(true)}
              title="Dismiss warning"
              style={{
                padding: '0.4rem 0.55rem', borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                border:     '1px solid var(--panel-border)',
                color:      'var(--text-secondary)',
                cursor:     'pointer', fontSize: '0.78rem',
                fontFamily: 'inherit',
                display:    'flex', alignItems: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
