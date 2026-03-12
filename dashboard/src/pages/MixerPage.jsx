import LibraryManager from '../components/LibraryManager';

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
        <LibraryManager />
        <div>
          <OnAirButton />
        </div>
      </div>
    </div>
  );
}
