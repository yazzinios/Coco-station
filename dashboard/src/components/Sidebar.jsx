import React from 'react';
import { NavLink } from 'react-router-dom';
import { Sliders, Mic2, BarChart2, Settings, LogOut } from 'lucide-react';

export default function Sidebar({ onNavClick }) {
  const navItems = [
    { name: 'Mixer',         path: '/',              icon: <Sliders size={20} /> },
    { name: 'Announcements', path: '/announcements', icon: <Mic2 size={20} /> },
    { name: 'Statistics',    path: '/stats',         icon: <BarChart2 size={20} /> },
    { name: 'Settings',      path: '/settings',      icon: <Settings size={20} /> },
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {navItems.map((item) => (
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
        ))}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--panel-border)' }}>
        <button
          onClick={() => { console.log('Logout'); onNavClick?.(); }}
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
