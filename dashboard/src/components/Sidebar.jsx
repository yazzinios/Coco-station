import React from 'react';
import { NavLink } from 'react-router-dom';
import { Sliders, Mic2, BarChart2, Settings, Calendar, Users, FolderOpen, LogOut, Lock, Music2 } from 'lucide-react';
import { useApp } from '../context/useApp';

export default function Sidebar({ onNavClick }) {
  const { currentUser, logout, hasFeature, isElevated } = useApp();

  // Build nav items with permission checks
  const allNavItems = [
    { name: 'Mixer',         path: '/',              icon: <Sliders size={20} />,    visible: true },
    { name: 'Library',       path: '/library',       icon: <FolderOpen size={20} />, visible: hasFeature('can_library') },
    { name: 'Announcements', path: '/announcements', icon: <Mic2 size={20} />,       visible: hasFeature('can_announce') },
    { name: 'Schedules',     path: '/schedules',     icon: <Calendar size={20} />,   visible: hasFeature('can_schedule') },
    { name: 'Requests',      path: '/stats',         icon: <BarChart2 size={20} />,  visible: hasFeature('can_requests') },
    { name: 'Settings',      path: '/settings',      icon: <Settings size={20} />,   visible: hasFeature('can_settings') || isElevated },
    { name: 'Users',         path: '/users',         icon: <Users size={20} />,      visible: isElevated },
  ];

  return (
    <nav className="glass-panel" style={{
      width: '100%',
      height: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem 1.5rem',
      borderRadius: 0,
      border: 'none',
      borderRight: '1px solid var(--panel-border)',
    }}>
      <div style={{ marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{
          width: '40px',
          height: '40px',
          background: 'linear-gradient(135deg, var(--accent-blue), #5f27cd)',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '1.2rem',
          boxShadow: '0 0 15px var(--accent-glow)',
          flexShrink: 0,
        }}>C</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '600', letterSpacing: '0.5px' }}>CocoStation</h2>
      </div>

      {/* Role badge */}
      {currentUser && (
        <div style={{
          marginBottom: '1.5rem', padding: '0.6rem 0.9rem', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            background: currentUser.is_super_admin ? 'rgba(255,215,0,0.15)' :
                        currentUser.role === 'admin' ? 'rgba(253,150,68,0.15)' :
                        'rgba(0,212,255,0.1)',
            border: `1px solid ${currentUser.is_super_admin ? 'rgba(255,215,0,0.4)' :
                                  currentUser.role === 'admin' ? 'rgba(253,150,68,0.35)' :
                                  'rgba(0,212,255,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: '700',
            color: currentUser.is_super_admin ? '#ffd700' :
                   currentUser.role === 'admin' ? '#fd9644' :
                   'var(--accent-blue)',
          }}>
            {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser.display_name || currentUser.username}
            </div>
            <div style={{
              fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px',
              color: currentUser.is_super_admin ? '#ffd700' :
                     currentUser.role === 'admin' ? '#fd9644' :
                     'var(--text-secondary)',
            }}>
              {currentUser.is_super_admin ? '⭐ Super Admin' : currentUser.role || 'operator'}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {allNavItems.map((item) => {
          if (!item.visible) return null;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavClick}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent-blue)' : '3px solid transparent',
                transition: 'all 0.2s ease',
                fontWeight: isActive ? '500' : '400',
              })}
            >
              {item.icon}
              {item.name}
            </NavLink>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--panel-border)' }}>
        <button
          onClick={() => { logout(); onNavClick?.(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            width: '100%',
            padding: '0.85rem 1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '1rem',
            fontFamily: 'inherit',
          }}
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </nav>
  );
}
