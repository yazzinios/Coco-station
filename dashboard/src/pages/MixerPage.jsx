import React from 'react';
import DeckPanel from '../components/DeckPanel';
import OnAirButton from '../components/OnAirButton';

export default function MixerPage() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Mixer Deck</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <DeckPanel id="a" name="Castle" />
        <DeckPanel id="b" name="Deck B" />
        <DeckPanel id="c" name="Karting" />
        <DeckPanel id="d" name="Deck D" />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ height: '400px' }}>
          <h3>Library Manager</h3>
          <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Drag & drop MP3s here
          </div>
        </div>
        <div>
          <OnAirButton />
        </div>
      </div>
    </div>
  );
}
