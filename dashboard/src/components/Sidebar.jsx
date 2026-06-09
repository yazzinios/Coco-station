import React from 'react';
import { NavLink } from 'react-router-dom';
import { Sliders, Mic2, BarChart2, Settings, Calendar, Users, FolderOpen, LogOut, Music2, ListMusic, Disc3, Shield } from 'lucide-react';
import { useApp } from '../context/useApp';

export default function Sidebar({ onNavClick, collapsed }) {
  const { currentUser, logout, hasFeature, isElevated, settings, api } = useApp();

  // ── Live company branding from database (same source as AppHeader) ──
  const companyName = settings?.company_name || 'CocoStation';
  const companyLogoUrl = settings?.company_logo
    ? `${api?.baseUrl || ''}/api/settings/company/logo?t=${Math.floor(Date.now() / 60000)}`
    : null;

  // Build nav items with permission checks
  const allNavItems = [
    { name: 'Mixer',         path: '/',              icon: <Sliders size={20} />,    visible: true },
    { name: 'DJ Controller',  path: '/dj',            icon: <Disc3 size={20} />,      visible: true },
    { name: 'Library',       path: '/library',       icon: <FolderOpen size={20} />, visible: hasFeature('can_library') },
    { name: 'Announcements', path: '/announcements', icon: <Mic2 size={20} />,       visible: hasFeature('can_announce') },
    { name: 'Schedules',     path: '/schedules',     icon: <Calendar size={20} />,   visible: hasFeature('can_schedule') },
    { name: 'Analytics',     path: '/stats',         icon: <BarChart2 size={20} />,  visible: hasFeature('can_requests') },
    { name: 'Requests',      path: '/requests',      icon: <ListMusic size={20} />,  visible: hasFeature('can_requests') },
    { name: 'Settings',      path: '/settings',      icon: <Settings size={20} />,   visible: hasFeature('can_settings') || isElevated },
    { name: 'Users',         path: '/users',         icon: <Users size={20} />,      visible: isElevated },
    { name: 'Roles',         path: '/roles',         icon: <Shield size={20} />,     visible: isElevated },
  ];

  return (
    <nav className="glass-panel" style={{
      width: '100%',
      height: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: collapsed ? '2rem 0.75rem' : '2rem 1.5rem',
      borderRadius: 0,
      border: 'none',
      borderRight: '1px solid var(--panel-border)',
      overflow: 'hidden',
      transition: 'padding 0.25s ease',
    }}>
      {/* ── Company Branding Section ── */}
      <div style={{ marginBottom: '3rem', marginTop: '0.5rem', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : '0.75rem', overflow: 'hidden' }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: companyLogoUrl ? 'transparent' : 'linear-gradient(135deg, var(--accent-blue), #5f27cd)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.2rem',
            boxShadow: companyLogoUrl ? 'none' : '0 0 15px var(--accent-glow)',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            {companyLogoUrl
              ? <img src={companyLogoUrl} alt={companyName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : companyName.charAt(0).toUpperCase()
            }
          </div>
          {!collapsed && (
            <h2 style={{ fontSize: '1.4rem', fontWeight: '600', letterSpacing: '0.5px', margin: 0, whiteSpace: 'nowrap' }}>
              {companyName}
            </h2>
          )}
        </div>
      </div>
      {/* ── End Company Branding ── */}

      {/* Role badge */}
      {currentUser && !collapsed && (
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
      {/* Collapsed: avatar only */}
      {currentUser && collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
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
            title: currentUser.display_name || currentUser.username,
          }}>
            {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {allNavItems.map((item) => {
          if (!item.visible) return null;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavClick}
              title={collapsed ? item.name : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '1rem',
                padding: collapsed ? '0.85rem 0' : '0.85rem 1rem',
                borderRadius: '8px',
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                borderLeft: collapsed ? 'none' : (isActive ? '3px solid var(--accent-blue)' : '3px solid transparent'),
                borderBottom: collapsed && isActive ? '2px solid var(--accent-blue)' : collapsed ? '2px solid transparent' : 'none',
                transition: 'all 0.2s ease',
                fontWeight: isActive ? '500' : '400',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              })}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.name}
            </NavLink>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--panel-border)' }}>
        <button
          onClick={() => { logout(); onNavClick?.(); }}
          title={collapsed ? 'Logout' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '1rem',
            width: '100%',
            padding: collapsed ? '0.85rem 0' : '0.85rem 1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '1rem',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <LogOut size={20} />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </nav>
  );
}
