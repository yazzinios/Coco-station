import LibraryManager from '../components/LibraryManager';
import DeckPanel from '../components/DeckPanel';
import OnAirButton from '../components/OnAirButton';

export default function MixerPage() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Mixer Deck</h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1.25rem',
        marginBottom: '2rem'
      }}>
        <DeckPanel id="a" />
        <DeckPanel id="b" />
        <DeckPanel id="c" />
        <DeckPanel id="d" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: '1.5rem' }}>
        <LibraryManager />
        <OnAirButton />
      </div>
    </div>
  );
}
