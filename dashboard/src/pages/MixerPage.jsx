import LibraryManager from '../components/LibraryManager';
import DeckPanel from '../components/DeckPanel';
import OnAirButton from '../components/OnAirButton';

export default function MixerPage() {
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>Mixer Deck</h2>

      {/* 4 decks → 2 on tablet → 1 on mobile, via .deck-grid CSS class */}
      <div className="deck-grid">
        <DeckPanel id="a" />
        <DeckPanel id="b" />
        <DeckPanel id="c" />
        <DeckPanel id="d" />
      </div>

      {/* Library + OnAir button: side-by-side → stacked on mobile */}
      <div className="mixer-bottom">
        <LibraryManager />
        <OnAirButton />
      </div>
    </div>
  );
}
