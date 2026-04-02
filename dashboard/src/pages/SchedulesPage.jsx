import React, { useState } from 'react';
import {
  Calendar, Clock, Music, ListMusic, Mic, Play, Trash2, Edit3,
  Plus, Save, X, Check, Pause, Volume2, Settings2, TriangleAlert,
  Radio, Music2,
} from 'lucide-react';
import { useApp } from '../context/useApp';

/* ─────────────────────── Constants ─────────────────────── */
const DAYS_OF_WEEK = [
  { id: 0, label: 'Mon', full: 'Monday' },
  { id: 1, label: 'Tue', full: 'Tuesday' },
  { id: 2, label: 'Wed', full: 'Wednesday' },
  { id: 3, label: 'Thu', full: 'Thursday' },
  { id: 4, label: 'Fri', full: 'Friday' },
  { id: 5, label: 'Sat', full: 'Saturday' },
  { id: 6, label: 'Sun', full: 'Sunday' },
];

const DECK_OPTIONS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
];

/* ─────────────────────── Shared styles ─────────────────── */
const inputStyle = {
  width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
  background: 'rgba(0,0,0,0.3)', color: 'white',
  border: '1px solid var(--panel-border)', fontFamily: 'inherit',
  fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', marginBottom: '0.4rem',
  fontSize: '0.75rem', color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const chipBtn = (active, accent = 'var(--accent-blue)') => ({
  padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', fontSize: '0.75rem',
  background: active ? `rgba(0,212,255,0.18)` : 'rgba(255,255,255,0.05)',
  color: active ? accent : 'var(--text-secondary)',
  outline: active ? `1px solid rgba(0,212,255,0.4)` : '1px solid transparent',
  cursor: 'pointer', transition: 'all 0.15s', fontWeight: active ? '600' : '400',
});

const tabBtn = (active) => ({
  flex: 1, padding: '0.65rem 0.5rem', borderRadius: '8px', border: 'none',
  background: active ? 'var(--accent-blue)' : 'rgba(255,255,255,0.04)',
  color: active ? '#000' : 'var(--text-secondary)',
  cursor: 'pointer', fontWeight: '700', fontSize: '0.88rem', transition: 'all 0.2s',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
});

/* ─────────────────────── Jingle Picker ─────────────────── */
// Jingles are ALWAYS required — no "None" option
function JinglePicker({ label: lbl, value, onChange, library }) {
  return (
    <div>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Music2 size={11} /> {lbl}
          <span style={{ color: '#ff4757', marginLeft: '2px' }}>*</span>
        </span>
      </label>
      {library.length === 0 ? (
        <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#ffa502',
          background: 'rgba(255,165,2,0.08)', borderRadius: '6px', border: '1px solid rgba(255,165,2,0.2)' }}>
          ⚠ Upload a jingle track to the library first
        </div>
      ) : (
        <select
          value={value || library[0]?.filename || ''}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer',
            outline: '1px solid rgba(165,94,234,0.5)',
            borderColor: 'rgba(165,94,234,0.4)' }}
          required
        >
          {library.map(f => (
            <option key={f.filename} value={f.filename}>{f.filename.replace(/\.[^.]+$/, '')}</option>
          ))}
        </select>
      )}
      {value && (
        <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: '#a55eea', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Music2 size={10} /> {value.replace(/\.[^.]+$/, '')}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MIXER DECK SCHEDULES — recurring music / playlist
════════════════════════════════════════════════════════════ */
const MIXER_DEFAULT = {
  name: '',
  type: 'track',
  target_id: '',
  deck_ids: ['a'],   // multi-deck: play the same content on multiple decks simultaneously
  start_time: '09:00',
  // stop_time removed — music plays until end of track/playlist naturally
  active_days: [0, 1, 2, 3, 4, 5, 6],
  excluded_days: [],
  fade_in: 3,
  fade_out: 3,
  volume: 80,
  loop: true,
  jingle_start: null,   // populated from library[0] on mount
  jingle_end: null,
  multi_tracks: [],
  enabled: true,
};

function MixerSchedules() {
  const { library, playlists, recurringMixerSchedules = [], toast, api } = useApp();
  const [isAdding, setIsAdding]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(MIXER_DEFAULT);
  const [excludeInput, setExcludeInput] = useState('');

  // Auto-fill jingles from first library track when library loads
  React.useEffect(() => {
    if (library.length > 0 && !form.jingle_start) {
      setForm(f => ({ ...f,
        jingle_start: f.jingle_start || library[0].filename,
        jingle_end:   f.jingle_end   || library[0].filename,
      }));
    }
  }, [library]); // eslint-disable-line

  const reset = () => {
    setForm({ ...MIXER_DEFAULT,
      jingle_start: library[0]?.filename || null,
      jingle_end:   library[0]?.filename || null,
    });
    setEditingId(null); setIsAdding(false); setExcludeInput('');
  };
  const startEdit = (s) => {
    setForm({
      ...MIXER_DEFAULT, ...s,
      // Normalise: old records may have deck_id (string) instead of deck_ids (array)
      deck_ids: s.deck_ids ?? (s.deck_id ? [s.deck_id] : ['a']),
      jingle_start: s.jingle_start || library[0]?.filename || null,
      jingle_end:   s.jingle_end   || library[0]?.filename || null,
    });
    setEditingId(s.id); setIsAdding(true);
  };

  const toggleDay = (id) => {
    const days = form.active_days.includes(id)
      ? form.active_days.filter(d => d !== id)
      : [...form.active_days, id].sort();
    setForm({ ...form, active_days: days });
  };

  const addExcluded = () => {
    if (!excludeInput) return;
    if (form.excluded_days.includes(excludeInput)) return;
    setForm({ ...form, excluded_days: [...form.excluded_days, excludeInput] });
    setExcludeInput('');
  };
  const removeExcluded = (d) => setForm({ ...form, excluded_days: form.excluded_days.filter(x => x !== d) });
  // Multi-deck toggle: at least one deck must stay selected
  const toggleDeck = (id) => {
    const next = form.deck_ids.includes(id)
      ? form.deck_ids.filter(d => d !== id)
      : [...form.deck_ids, id].sort();
    if (next.length === 0) return; // prevent deselecting all
    setForm({ ...form, deck_ids: next });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.type === 'track' && !form.target_id) { toast.error('Please select a track'); return; }
    if (form.type === 'playlist' && !form.target_id) { toast.error('Please select a playlist'); return; }
    if (form.type === 'multi_track' && form.multi_tracks.length === 0) { toast.error('Please select at least one track'); return; }
    try {
      if (editingId) {
        await api.updateRecurringMixerSchedule(editingId, form);
        toast.success('Mixer schedule updated');
      } else {
        await api.createRecurringMixerSchedule(form);
        toast.success('Mixer schedule created');
      }
      reset();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    try { await api.deleteRecurringMixerSchedule(id); toast.info('Schedule removed'); }
    catch (err) { toast.error(err.message); }
  };

  const toggleStatus = async (s) => {
    try {
      await api.updateRecurringMixerSchedule(s.id, { ...s, enabled: !s.enabled });
      toast.success(s.enabled ? 'Schedule disabled' : 'Schedule enabled');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Music size={16} /> Mixer Deck Schedules
        </h3>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} style={{
            padding: '0.4rem 0.85rem', borderRadius: '6px', border: 'none',
            background: 'var(--accent-blue)', color: '#000', cursor: 'pointer',
            fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem'
          }}>
            <Plus size={14} /> New Schedule
          </button>
        )}
      </div>

      {/* Form */}
      {isAdding && (
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
          borderRadius: '14px', padding: '1.5rem', marginBottom: '1.75rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>

            {/* Col 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div>
                <label style={labelStyle}>Schedule Name</label>
                <input type="text" value={form.name} required
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Morning Jazz" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Source Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { val: 'track',       icon: <Music size={12} />,     txt: 'Single' },
                    { val: 'multi_track', icon: <Play size={12} />,      txt: 'Multi-Track' },
                    { val: 'playlist',    icon: <ListMusic size={12} />, txt: 'Playlist' },
                  ].map(o => (
                    <button key={o.val} type="button"
                      onClick={() => setForm({ ...form, type: o.val, target_id: '' })}
                      style={{ ...tabBtn(form.type === o.val), fontSize: '0.74rem', padding: '0.45rem 0.25rem' }}>
                      {o.icon} {o.txt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  {form.type === 'track' ? 'Select Track' : form.type === 'playlist' ? 'Select Playlist' : 'Add Tracks'}
                </label>

                {form.type === 'multi_track' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <select value=""
                        onChange={e => {
                          if (e.target.value && !form.multi_tracks.includes(e.target.value)) {
                            setForm({ ...form, multi_tracks: [...form.multi_tracks, e.target.value] });
                          }
                        }}
                        style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                        <option value="">— Add a track —</option>
                        {library.map(f => <option key={f.filename} value={f.filename}>{f.filename}</option>)}
                      </select>
                    </div>
                    {form.multi_tracks.length > 0 && (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: '0.25rem',
                        maxHeight: '120px', overflowY: 'auto', padding: '0.5rem',
                        background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--panel-border)'
                      }}>
                        {form.multi_tracks.map((t, idx) => (
                          <div key={`${t}-${idx}`} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: '0.75rem', color: 'var(--text-secondary)',
                            padding: '0.2rem 0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px'
                          }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{idx + 1}. {t}</span>
                            <button type="button" onClick={() => setForm({ ...form, multi_tracks: form.multi_tracks.filter((_, i) => i !== idx) })}
                              style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', padding: '2px' }}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <select value={form.target_id} required
                    onChange={e => setForm({ ...form, target_id: e.target.value })}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">— Select {form.type === 'track' ? 'a track' : 'a playlist'} —</option>
                    {form.type === 'track'
                      ? library.map(f => <option key={f.filename} value={f.filename}>{f.filename}</option>)
                      : playlists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tracks?.length ?? 0} tracks)</option>)
                    }
                  </select>
                )}

                {library.length === 0 && (
                  <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#ff4757', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <TriangleAlert size={11} /> No tracks in library yet
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Target Decks <span style={{ color: 'var(--text-secondary)', fontWeight: '400', textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>(select one or more)</span></label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {DECK_OPTIONS.map(d => (
                    <button key={d.id} type="button" onClick={() => toggleDeck(d.id)}
                      style={{ ...chipBtn(form.deck_ids.includes(d.id)), padding: '0.4rem 0.75rem', fontWeight: '700', fontSize: '0.82rem' }}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {form.deck_ids.length > 1 && (
                  <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--accent-blue)' }}>
                    ✓ Playing on Decks {form.deck_ids.map(d => d.toUpperCase()).join(' + ')}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Start Time</label>
                <input type="time" value={form.start_time} required
                  onChange={e => setForm({ ...form, start_time: e.target.value })}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
                <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Music plays until the track / playlist ends naturally.
                </div>
              </div>

              {/* ── Jingles (always required) ────────────── */}
              <div style={{
                padding: '0.85rem', borderRadius: '10px',
                background: 'rgba(165,94,234,0.08)', border: '1px solid rgba(165,94,234,0.35)',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '0.72rem', color: '#a55eea', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Music2 size={11} /> Jingles — played before &amp; after every feed
                </div>
                <JinglePicker
                  label="Intro Jingle (plays before music starts)"
                  value={form.jingle_start || library[0]?.filename}
                  onChange={v => setForm({ ...form, jingle_start: v })}
                  library={library}
                />
                <JinglePicker
                  label="Outro Jingle (plays when music stops)"
                  value={form.jingle_end || library[0]?.filename}
                  onChange={v => setForm({ ...form, jingle_end: v })}
                  library={library}
                />
              </div>
            </div>

            {/* Col 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div>
                <label style={labelStyle}>Active Days</label>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(d => (
                    <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                      style={chipBtn(form.active_days.includes(d.id))}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Excluded Dates (holidays / exceptions)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="date" value={excludeInput}
                    onChange={e => setExcludeInput(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark', flex: 1 }} />
                  <button type="button" onClick={addExcluded} style={{
                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                    background: 'rgba(0,212,255,0.15)', color: 'var(--accent-blue)',
                    cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0,
                  }}>
                    <Plus size={13} /> Add
                  </button>
                </div>
                {form.excluded_days.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                    {form.excluded_days.map(d => (
                      <span key={d} style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.15rem 0.5rem', borderRadius: '20px', fontSize: '0.72rem',
                        background: 'rgba(255,71,87,0.12)', color: '#ff6b7a',
                        border: '1px solid rgba(255,71,87,0.25)',
                      }}>
                        {d}
                        <button type="button" onClick={() => removeExcluded(d)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b7a', padding: 0, lineHeight: 1 }}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Audio Settings</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  {[
                    { key: 'fade_in',  label: 'Fade In',  max: 30,  unit: 's' },
                    { key: 'fade_out', label: 'Fade Out', max: 30,  unit: 's' },
                    { key: 'volume',   label: 'Volume',   max: 100, unit: '%' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-blue)' }}>{form[f.key]}{f.unit}</span>
                      </div>
                      <input type="range" min={0} max={f.max} step={1}
                        value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: parseInt(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, loop: !f.loop }))} style={{
                  width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                  background: form.loop ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <span style={{
                    position: 'absolute', top: '3px', left: form.loop ? '21px' : '3px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <span style={{ fontSize: '0.85rem', color: form.loop ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                  Loop {form.type === 'playlist' ? 'playlist' : 'track'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                <button type="submit" style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none',
                  background: 'var(--accent-blue)', color: '#000', fontWeight: 'bold',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}>
                  <Save size={15} /> {editingId ? 'Update' : 'Save Schedule'}
                </button>
                <button type="button" onClick={reset} style={{
                  padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Cards */}
      {recurringMixerSchedules.length === 0 ? (
        <EmptyState icon={<Music size={40} />} title="No mixer schedules" sub="Automate music playback on any deck." onAdd={() => setIsAdding(true)} show={!isAdding} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {recurringMixerSchedules.map(s => (
            <MixerCard key={s.id} s={s}
              onEdit={startEdit} onDelete={handleDelete} onToggle={toggleStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function MixerCard({ s, onEdit, onDelete, onToggle }) {
  return (
    <div style={{
      background: s.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
      border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem',
      position: 'relative', overflow: 'hidden', opacity: s.enabled ? 1 : 0.6, transition: 'all 0.3s',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
        background: s.enabled ? 'var(--accent-blue)' : '#555',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {s.type === 'playlist' ? <ListMusic size={13} /> : s.type === 'multi_track' ? <Play size={13} /> : <Music size={13} />} {s.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={11} /> {s.start_time}</span>
            <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>
              {(s.deck_ids ?? (s.deck_id ? [s.deck_id] : [])).map(d => `Deck ${d.toUpperCase()}`).join(' + ')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <ActionBtn onClick={() => onToggle(s)} color={s.enabled ? '#2ed573' : 'var(--text-secondary)'}
            bg={s.enabled ? 'rgba(46,213,115,0.12)' : 'rgba(255,255,255,0.05)'}
            icon={s.enabled ? <Check size={13} /> : <Pause size={13} />} />
          <ActionBtn onClick={() => onEdit(s)} color="var(--text-secondary)" bg="rgba(255,255,255,0.05)" icon={<Edit3 size={13} />} />
          <ActionBtn onClick={() => onDelete(s.id)} color="#ff4757" bg="rgba(255,71,87,0.1)" icon={<Trash2 size={13} />} />
        </div>
      </div>

      <DaysRow days={s.active_days} />

      {s.excluded_days?.length > 0 && (
        <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {s.excluded_days.map(d => (
            <span key={d} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'rgba(255,71,87,0.1)', color: '#ff6b7a' }}>
              ✕ {d}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <StatChip icon={<Volume2 size={10} />} val={`${s.volume ?? 80}%`} />
          <StatChip icon={<Settings2 size={10} />} val={`↑${s.fade_in}s ↓${s.fade_out}s`} />
          {s.loop && <StatChip icon={null} val="↻ loop" color="#a55eea" />}
          {s.jingle_start && <StatChip icon={<Music2 size={10} />} val="Intro ♪" color="#a55eea" />}
          {s.jingle_end   && <StatChip icon={<Music2 size={10} />} val="Outro ♪" color="#a55eea" />}
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
          {s.type === 'playlist' ? <ListMusic size={11} /> : s.type === 'multi_track' ? <Play size={11} /> : <Music size={11} />}
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MIC & ANNOUNCEMENT SCHEDULES
════════════════════════════════════════════════════════════ */
const ANN_DEFAULT = {
  name: '',
  type: 'Announcement',
  announcement_id: '',
  deck_id: 'a',
  start_time: '09:00',
  // stop_time removed — announcement runs until it ends naturally
  active_days: [0, 1, 2, 3, 4, 5, 6],
  excluded_days: [],
  fade_duration: 5,
  music_volume: 10,
  target_decks: ['a'],
  jingle_start: null,
  jingle_end: null,
  enabled: true,
};

function AnnSchedules() {
  const { library, announcements, recurringSchedules = [], toast, api } = useApp();
  const [isAdding, setIsAdding]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(ANN_DEFAULT);
  const [excludeInput, setExcludeInput] = useState('');

  // Auto-fill jingles from first library track when library loads
  React.useEffect(() => {
    if (library.length > 0 && !form.jingle_start) {
      setForm(f => ({ ...f,
        jingle_start: f.jingle_start || library[0].filename,
        jingle_end:   f.jingle_end   || library[0].filename,
      }));
    }
  }, [library]); // eslint-disable-line

  const reset = () => {
    setForm({ ...ANN_DEFAULT,
      jingle_start: library[0]?.filename || null,
      jingle_end:   library[0]?.filename || null,
    });
    setEditingId(null); setIsAdding(false); setExcludeInput('');
  };
  const startEdit = (s) => {
    setForm({
      ...ANN_DEFAULT, ...s,
      jingle_start: s.jingle_start || library[0]?.filename || null,
      jingle_end:   s.jingle_end   || library[0]?.filename || null,
    });
    setEditingId(s.id); setIsAdding(true);
  };

  const toggleDay = (id) => {
    const days = form.active_days.includes(id)
      ? form.active_days.filter(d => d !== id)
      : [...form.active_days, id].sort();
    setForm({ ...form, active_days: days });
  };

  const addExcluded = () => {
    if (!excludeInput || form.excluded_days.includes(excludeInput)) return;
    setForm({ ...form, excluded_days: [...form.excluded_days, excludeInput] });
    setExcludeInput('');
  };
  const removeExcluded = (d) => setForm({ ...form, excluded_days: form.excluded_days.filter(x => x !== d) });

  const toggleTargetDeck = (id) => {
    const target_decks = form.target_decks.includes(id)
      ? form.target_decks.filter(d => d !== id)
      : [...form.target_decks, id].sort();
    setForm({ ...form, target_decks });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.type === 'Announcement' && !form.announcement_id) {
      toast.error('Please select an announcement'); return;
    }
    try {
      if (editingId) {
        await api.updateRecurringSchedule(editingId, form);
        toast.success('Schedule updated');
      } else {
        await api.createRecurringSchedule(form);
        toast.success('Schedule created');
      }
      reset();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    try { await api.deleteRecurringSchedule(id); toast.info('Schedule removed'); }
    catch (err) { toast.error(err.message); }
  };

  const toggleStatus = async (s) => {
    try {
      await api.updateRecurringSchedule(s.id, { ...s, enabled: !s.enabled });
      toast.success(s.enabled ? 'Disabled' : 'Enabled');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Mic size={16} /> Mic & Announcement Schedules
        </h3>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} style={{
            padding: '0.4rem 0.85rem', borderRadius: '6px', border: 'none',
            background: 'var(--accent-blue)', color: '#000', cursor: 'pointer',
            fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem'
          }}>
            <Plus size={14} /> New Schedule
          </button>
        )}
      </div>

      {/* Form */}
      {isAdding && (
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
          borderRadius: '14px', padding: '1.5rem', marginBottom: '1.75rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>

            {/* Col 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Schedule Name</label>
                <input type="text" value={form.name} required
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Daily Greeting" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Source Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { val: 'Announcement', icon: <Radio size={12} />, txt: 'Announcement' },
                    { val: 'Microphone',   icon: <Mic size={12} />,   txt: 'Microphone' },
                  ].map(o => (
                    <button key={o.val} type="button"
                      onClick={() => setForm({ ...form, type: o.val, announcement_id: '' })}
                      style={{ ...tabBtn(form.type === o.val), fontSize: '0.8rem', padding: '0.45rem 0.5rem' }}>
                      {o.icon} {o.txt}
                    </button>
                  ))}
                </div>
              </div>

              {form.type === 'Announcement' && (
                <div>
                  <label style={labelStyle}>Select Announcement</label>
                  <select value={form.announcement_id} required
                    onChange={e => setForm({ ...form, announcement_id: e.target.value })}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">— Choose from library —</option>
                    {announcements.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {announcements.length === 0 && (
                    <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: '#ff4757', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <TriangleAlert size={11} /> No announcements in library yet
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle}>Start Time</label>
                <input type="time" value={form.start_time} required
                  onChange={e => setForm({ ...form, start_time: e.target.value })}
                  style={{ ...inputStyle, colorScheme: 'dark' }} />
                <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Announcement plays until it ends, then music restores.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Duck These Decks (Music Fade)</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {DECK_OPTIONS.map(d => (
                    <button key={d.id} type="button" onClick={() => toggleTargetDeck(d.id)}
                      style={{ ...chipBtn(form.target_decks.includes(d.id)), padding: '0.4rem 0.7rem', fontWeight: '700', fontSize: '0.82rem' }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Jingles (always required) ────────────── */}
              <div style={{
                padding: '0.85rem', borderRadius: '10px',
                background: 'rgba(165,94,234,0.08)', border: '1px solid rgba(165,94,234,0.35)',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '0.72rem', color: '#a55eea', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Music2 size={11} /> Jingles — played before &amp; after every feed
                </div>
                <JinglePicker
                  label="Intro Jingle (plays before mic / announcement)"
                  value={form.jingle_start || library[0]?.filename}
                  onChange={v => setForm({ ...form, jingle_start: v })}
                  library={library}
                />
                <JinglePicker
                  label="Outro Jingle (plays after mic / announcement)"
                  value={form.jingle_end || library[0]?.filename}
                  onChange={v => setForm({ ...form, jingle_end: v })}
                  library={library}
                />
              </div>
            </div>

            {/* Col 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div>
                <label style={labelStyle}>Active Days</label>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(d => (
                    <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                      style={chipBtn(form.active_days.includes(d.id))}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Excluded Dates</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="date" value={excludeInput}
                    onChange={e => setExcludeInput(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark', flex: 1 }} />
                  <button type="button" onClick={addExcluded} style={{
                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                    background: 'rgba(0,212,255,0.15)', color: 'var(--accent-blue)',
                    cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0,
                  }}>
                    <Plus size={13} /> Add
                  </button>
                </div>
                {form.excluded_days.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                    {form.excluded_days.map(d => (
                      <span key={d} style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.15rem 0.5rem', borderRadius: '20px', fontSize: '0.72rem',
                        background: 'rgba(255,71,87,0.12)', color: '#ff6b7a',
                        border: '1px solid rgba(255,71,87,0.25)',
                      }}>
                        {d}
                        <button type="button" onClick={() => removeExcluded(d)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b7a', padding: 0 }}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Audio Ducking</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {[
                    { key: 'fade_duration', label: 'Fade Duration', max: 30,  unit: 's' },
                    { key: 'music_volume',  label: 'Music Level',   max: 100, unit: '%' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-blue)' }}>{form[f.key]}{f.unit}</span>
                      </div>
                      <input type="range" min={0} max={f.max} step={1} value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: parseInt(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                <button type="submit" style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none',
                  background: 'var(--accent-blue)', color: '#000', fontWeight: 'bold',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}>
                  <Save size={15} /> {editingId ? 'Update' : 'Save Schedule'}
                </button>
                <button type="button" onClick={reset} style={{
                  padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Cards */}
      {recurringSchedules.length === 0 ? (
        <EmptyState icon={<Mic size={40} />} title="No mic / announcement schedules" sub="Automate announcements and microphone activation." onAdd={() => setIsAdding(true)} show={!isAdding} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {recurringSchedules.map(s => (
            <AnnCard key={s.id} s={s} onEdit={startEdit} onDelete={handleDelete} onToggle={toggleStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnCard({ s, onEdit, onDelete, onToggle }) {
  return (
    <div style={{
      background: s.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
      border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem',
      position: 'relative', overflow: 'hidden', opacity: s.enabled ? 1 : 0.6, transition: 'all 0.3s',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
        background: s.enabled ? '#a55eea' : '#555',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {s.type === 'Announcement' ? <Radio size={13} /> : <Mic size={13} />} {s.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={11} /> {s.start_time}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <ActionBtn onClick={() => onToggle(s)} color={s.enabled ? '#2ed573' : 'var(--text-secondary)'}
            bg={s.enabled ? 'rgba(46,213,115,0.12)' : 'rgba(255,255,255,0.05)'}
            icon={s.enabled ? <Check size={13} /> : <Pause size={13} />} />
          <ActionBtn onClick={() => onEdit(s)} color="var(--text-secondary)" bg="rgba(255,255,255,0.05)" icon={<Edit3 size={13} />} />
          <ActionBtn onClick={() => onDelete(s.id)} color="#ff4757" bg="rgba(255,71,87,0.1)" icon={<Trash2 size={13} />} />
        </div>
      </div>

      <DaysRow days={s.active_days} />

      {s.excluded_days?.length > 0 && (
        <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {s.excluded_days.map(d => (
            <span key={d} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'rgba(255,71,87,0.1)', color: '#ff6b7a' }}>
              ✕ {d}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <StatChip icon={<Volume2 size={10} />} val={`Music ${s.music_volume}%`} />
          <StatChip icon={<Settings2 size={10} />} val={`Fade ${s.fade_duration}s`} />
          {s.jingle_start && <StatChip icon={<Music2 size={10} />} val="Intro ♪" color="#a55eea" />}
          {s.jingle_end   && <StatChip icon={<Music2 size={10} />} val="Outro ♪" color="#a55eea" />}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {(s.target_decks || []).map(d => (
            <span key={d} style={{
              fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
              padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 'bold',
            }}>{d.toUpperCase()}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Shared helpers ─────────────────── */
function DaysRow({ days }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {DAYS_OF_WEEK.map(d => (
        <span key={d.id} style={{
          fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px',
          background: days?.includes(d.id) ? 'rgba(0,212,255,0.15)' : 'transparent',
          color: days?.includes(d.id) ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)',
          border: `1px solid ${days?.includes(d.id) ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
          fontWeight: days?.includes(d.id) ? '600' : '400',
        }}>
          {d.label[0]}
        </span>
      ))}
    </div>
  );
}

function ActionBtn({ onClick, color, bg, icon }) {
  return (
    <button onClick={onClick} style={{
      width: '32px', height: '32px', borderRadius: '8px', border: 'none',
      background: bg, color, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {icon}
    </button>
  );
}

function StatChip({ icon, val, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: color || 'var(--text-secondary)' }}>
      {icon} {val}
    </div>
  );
}

function EmptyState({ icon, title, sub, onAdd, show }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '1rem', padding: '3rem 1rem',
      background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
      border: '1px dashed var(--panel-border)',
    }}>
      <div style={{ opacity: 0.15 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 0.25rem 0', fontWeight: '500' }}>{title}</p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sub}</p>
      </div>
      {show && (
        <button onClick={onAdd} style={{
          marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px',
          border: '1px solid var(--accent-blue)', background: 'rgba(0,212,255,0.05)',
          color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500'
        }}>
          Create your first schedule
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PAGE ROOT
════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'mixer', label: 'Mixer Deck',         icon: <Music size={16} /> },
  { id: 'ann',   label: 'Mic & Announcements', icon: <Mic size={16} /> },
];

export default function SchedulesPage() {
  const [tab, setTab] = useState('mixer');

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <Calendar size={22} /> Schedules
      </h2>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="glass-panel">
        {tab === 'mixer' ? <MixerSchedules /> : <AnnSchedules />}
      </div>
    </div>
  );
}
