/**
 * ProtectedRoute.jsx — CocoStation
 * ──────────────────────────────────────────────────────────────
 * Route-level permission guard. Wraps a page component and shows
 * an "Access Denied" screen if the user lacks the required permission.
 *
 * Props (use ONE):
 *   feature="can_settings"   — checks a feature flag
 *   elevated                 — requires admin or super_admin
 *
 * Examples (in App.jsx):
 *   <Route path="/settings" element={
 *     <ProtectedRoute feature="can_settings"><SettingsPage /></ProtectedRoute>
 *   } />
 *
 *   <Route path="/users" element={
 *     <ProtectedRoute elevated><UsersPage /></ProtectedRoute>
 *   } />
 */

import React from 'react';
import { ShieldOff } from 'lucide-react';
import { useApp } from '../context/useApp';

// ─── Access Denied screen ────────────────────────────────────────────────────

function AccessDenied({ requiredRole }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '60vh',
      gap:            '1.5rem',
      textAlign:      'center',
      padding:        '2rem',
    }}>
      {/* Icon */}
      <div style={{
        width:      '72px',
        height:     '72px',
        borderRadius: '50%',
        background: 'rgba(255,71,87,0.1)',
        border:     '1px solid rgba(255,71,87,0.3)',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <ShieldOff size={32} color="#ff4757" />
      </div>

      {/* Title */}
      <div>
        <h2 style={{
          fontSize:    '1.4rem',
          fontWeight:  '700',
          color:       '#fff',
          margin:      '0 0 0.5rem',
        }}>
          Access Denied
        </h2>
        <p style={{
          fontSize: '0.9rem',
          color:    'var(--text-secondary)',
          margin:   0,
          maxWidth: '340px',
          lineHeight: 1.6,
        }}>
          You don't have permission to access this page.
          {requiredRole && (
            <> This area requires <strong style={{ color: '#fd9644' }}>{requiredRole}</strong> access.</>
          )}
        </p>
      </div>

      {/* Role hint */}
      <div style={{
        padding:      '0.6rem 1.2rem',
        borderRadius: '8px',
        background:   'rgba(255,255,255,0.03)',
        border:       '1px solid var(--panel-border)',
        fontSize:     '0.8rem',
        color:        'var(--text-secondary)',
      }}>
        Contact your system administrator to request access.
      </div>
    </div>
  );
}

// ─── ProtectedRoute component ────────────────────────────────────────────────

export default function ProtectedRoute({
  children,
  feature  = null,   // e.g. "can_settings"
  elevated = false,  // require admin or super_admin
}) {
  const { hasFeature, isElevated, currentUser } = useApp();

  // Not logged in at all — the outer ProtectedLayout handles this
  if (!currentUser) return null;

  // Elevated check
  if (elevated && !isElevated) {
    return <AccessDenied requiredRole="Admin or Super Admin" />;
  }

  // Feature flag check
  if (feature && !hasFeature(feature)) {
    const labelMap = {
      can_settings:   'Settings',
      can_library:    'Library',
      can_announce:   'Announcements',
      can_schedule:   'Schedules',
      can_requests:   'Requests',
    };
    return <AccessDenied requiredRole={labelMap[feature] || feature} />;
  }

  return <>{children}</>;
}
