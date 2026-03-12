import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    console.log("Login submitted", email, password);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, rgba(0,0,0,0.9), rgba(15,20,30,0.9))'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>CocoStation</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to access the mixer deck</p>
        </div>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--panel-border)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--panel-border)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              required
            />
          </div>
          <button 
            type="submit"
            style={{
              marginTop: '1rem',
              width: '100%',
              padding: '0.85rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-blue)',
              color: '#000',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              boxShadow: '0 0 15px var(--accent-glow)'
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
