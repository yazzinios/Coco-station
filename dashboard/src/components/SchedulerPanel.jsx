import React, { useState } from 'react';
import { Clock, Calendar, Play, Trash2, Music, ListMusic, TriangleAlert, ShieldCheck, Activity, Timer } from 'lucide-react';
import { useApp } from '../context/useApp';

const DECK_OPTIONS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
];

export default function SchedulerPanel() {
  const { library, playlists, musicSchedules, decks, toast, api, schedulerStatus } = useApp();

  const [schedType,   setSchedType]   = useState('track');   // 'track' | 'playlist'
  const [deckId,      setDeckId]      = useState('a');
  const [targetId,    setTargetId]    = useState('');
  const [schedName,   setSchedName]   = useState('');
  const [schedTime,   setSchedTime]   = useState('');
  const [loop,        setLoop]        = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white',
    border: '1px solid var(--panel-border)', fontFamily: 'inherit',
    fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
  };

  const btnBase = (active) => ({
    flex: 1, padding: '0.45rem 0.5rem', borderRadius: '6px', border: 'none',
    background: active ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
    color: active ? '#000' : 'var(--text-secondary)',
    cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', transition: 'all 0.2s',
  });

  const label = (text) => (
    <label style={{
      display: 'block', marginBottom: '0.4rem',
      fontSize: '0.75rem', color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>{text}</label>
  );

  // Auto-fill name when target changes
  const handleTargetChange = (val) => {
    setTargetId(val);
    if (!schedName) {
      if (schedType === 'track') {
        setSchedName(val.replace(/\.[^.]+$/, ''));
      } else {
        const pl = playlists.find(p => p.id === val);
        if (pl) setSchedName(pl.name);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetId) { toast.error('Please select a track or playlist'); return; }
    if (!schedTime) { toast.error('Please set a date and time'); return; }
    const isoTime = new Date(schedTime).toISOString();
    if (new Date(isoTime) <= new Date()) { toast.error('Scheduled time must be in the future'); return; }

    setSubmitting(true);
    try {
      await api.createMusicSchedule({
        name:         schedName || targetId,
        deck_id:      deckId,
        type:         schedType,
        target_id:    targetId,
        scheduled_at: isoTime,
        loop,
      });
      toast.success('⏰ Schedule created!');
      setSchedName(''); setTargetId(''); setSchedTime(''); setLoop(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    try {
      await api.deleteMusicSchedule(id);
      toast.info(`Removed: ${name}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleTrigger = async (id, name) => {
    try {
      await api.triggerMusicSchedule(id);
      toast.success(`▶ Triggered: ${name}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const statusStyle = (status) => {
    if (status === 'Played')    return { bg: 'rgba(46,213,115,0.1)',   color: '#2ed573' };
    if (status === 'Scheduled') return { bg: 'rgba(0,212,255,0.1)',    color: '#00d4ff' };
    return                             { bg: 'rgba(255,255,255,0.06)', color: '#a0a0a0' };
  };

  const deckName = (id) => decks[id]?.name || `Deck ${id.toUpperCase()}`;

  const upcoming = musicSchedules.filter(s => s.status === 'Scheduled');
  const past     = musicSchedules.filter(s => s.status !== 'Scheduled');

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <h3 style={{
        marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '1rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <Calendar size={16} /> Schedule Music Auto-Start
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

        {/* ── Form ────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Type */}
          <div>
            {label('Type')}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { val: 'track',    icon: <Music size={13} />,     txt: 'Single Track' },
                { val: 'playlist', icon: <ListMusic size={13} />, txt: 'Playlist' },
              ].map(o => (
                <button key={o.val} type="button" onClick={() => { setSchedType(o.val); setTargetId(''); setSchedName(''); }}
                  style={btnBase(schedType === o.val)}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    {o.icon} {o.txt}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Deck */}
          <div>
            {label('Deck')}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {DECK_OPTIONS.map(d => (
                <button key={d.id} type="button" onClick={() => setDeckId(d.id)}
                  style={{ ...btnBase(deckId === d.id), flex: 'none', padding: '0.45rem 0.9rem' }}>
                  {d.label} — {deckName(d.id)}
                </button>
              ))}
            </div>
          </div>

          {/* Target */}
          <div>
            {label(schedType === 'track' ? 'Track' : 'Playlist')}
            <select value={targetId} onChange={e => handleTargetChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} required>
              <option value="">— Select {schedType === 'track' ? 'a track' : 'a playlist'} —</option>
              {schedType === 'track'
                ? library.map(f => <option key={f.filename} value={f.filename}>{f.filename}</option>)
                : playlists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tracks?.length ?? 0} tracks)</option>)
              }
            </select>
            {schedType === 'track' && library.length === 0 && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#ff4757', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <TriangleAlert size={11} /> No tracks in library yet
              </div>
            )}
            {schedType === 'playlist' && playlists.length === 0 && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#ff4757', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <TriangleAlert size={11} /> No playlists created yet
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            {label('Label (optional)')}
            <input
              type="text" value={schedName} onChange={e => setSchedName(e.target.value)}
              placeholder="e.g. Morning Playlist, Opening Track…"
              style={inputStyle}
            />
          </div>

          {/* Date & Time */}
          <div>
            {label('Start Date & Time')}
            <input
              type="datetime-local" value={schedTime}
              onChange={e => setSchedTime(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
              required
            />
            {schedTime && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
                ⏰ Will auto-start at {new Date(schedTime).toLocaleString()}
              </div>
            )}
          </div>

          {/* Loop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button type="button" onClick={() => setLoop(v => !v)} style={{
              width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
              background: loop ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <span style={{
                position: 'absolute', top: '3px',
                left: loop ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </button>
            <span style={{ fontSize: '0.875rem', color: loop ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
              Loop {schedType === 'playlist' ? 'playlist' : 'track'} after start
            </span>
          </div>

          <button type="submit" disabled={submitting} style={{
            marginTop: '0.25rem', padding: '0.8rem',
            background: submitting ? 'rgba(0,212,255,0.3)' : 'var(--accent-blue)',
            color: '#000', border: 'none', borderRadius: '8px',
            fontWeight: 'bold', cursor: submitting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            fontSize: '0.9rem', transition: 'all 0.2s',
          }}>
            <Clock size={15} />
            {submitting ? 'Scheduling…' : 'Schedule Auto-Start'}
          </button>
        </form>

        {/* ── Schedule List ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Upcoming */}
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={11} /> Upcoming ({upcoming.length})
            </div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', padding: '1rem 0' }}>
                No scheduled plays yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {upcoming.map(s => <ScheduleRow key={s.id} s={s} deckName={deckName} statusStyle={statusStyle} onDelete={handleDelete} onTrigger={handleTrigger} />)}
              </div>
            )}
          </div>

          {/* Past */}
          {past.length > 0 && (
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                History ({past.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {past.map(s => <ScheduleRow key={s.id} s={s} deckName={deckName} statusStyle={statusStyle} onDelete={handleDelete} onTrigger={handleTrigger} past />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Scheduler Engine Status ─────────────────────── */}
      <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <h4 style={{
          fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase',
          letterSpacing: '1px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem'
        }}>
          <Activity size={14} /> Live Scheduler Engine
        </h4>

        {!schedulerStatus ? (
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
            Connecting to scheduler engine…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            
            {/* System Metrics */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 'bold' }}>SYSTEM HEALTH</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <Metric label="Trigger Lock" value={schedulerStatus.trigger_lock_held ? 'LOCKED (Busy)' : 'IDLE (Ready)'} 
                        color={schedulerStatus.trigger_lock_held ? '#ff4757' : '#2ed573'} icon={<ShieldCheck size={14}/>} />
                <Metric label="Ducking Level" value={schedulerStatus.duck_refcount > 0 ? `ACTIVE (${schedulerStatus.duck_refcount})` : 'Inactive'} 
                        color={schedulerStatus.duck_refcount > 0 ? '#ffa502' : 'var(--text-secondary)'} icon={<Activity size={14}/>} />
                <Metric label="Server Time" value={schedulerStatus.time_now} color="var(--accent-blue)" icon={<Clock size={14}/>} />
              </div>
            </div>

            {/* Active Cron Jobs */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 'bold' }}>APScheduler LIVE JOBS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {schedulerStatus.active_jobs?.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.15)' }}>No active recurring jobs registered.</div>
                ) : (
                  schedulerStatus.active_jobs?.map(job => (
                    <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                         <Timer size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} /> 
                         <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {job.name.replace('Recurring:', '').replace('Mixer:', '')}
                         </span>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                        <span style={{ color: '#2ed573', fontWeight: '600', fontFamily: 'monospace' }}>
                          in {job.time_left || '...'}
                        </span>
                        <button 
                          onClick={async () => {
                            try {
                              const id = job.id.split('_')[1];
                              if (job.id.startsWith('recurring_')) await api.triggerRecurringSchedule(id);
                              else await api.triggerRecurringMixerSchedule(id);
                              toast.success(`▶ Manually fired: ${job.name}`);
                            } catch (e) { toast.error(e.message); }
                          }}
                          style={{
                            width: '24px', height: '24px', borderRadius: '50%', border: 'none',
                            background: 'rgba(0,212,255,0.1)', color: 'var(--accent-blue)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="Trigger manually now"
                        >
                          <Play size={10} fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Next Up Summary */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 'bold' }}>NEXT UP TODAY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {(() => {
                  const upcoming = [
                    ...schedulerStatus.recurring_schedules.filter(s => s.will_run_today),
                    ...schedulerStatus.recurring_mixer_schedules.filter(s => s.will_run_today)
                  ].sort((a,b) => a.start_time.localeCompare(b.start_time));

                  if (upcoming.length === 0) return <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.15)' }}>No more tasks scheduled for today.</div>;

                  return upcoming.slice(0, 3).map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{s.name}</span>
                      <span style={{ color: 'var(--accent-blue)', opacity: 0.8 }}>{s.start_time}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color, icon }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: '0.82rem', fontWeight: '600', color }}>{value}</span>
    </div>
  );
}

function ScheduleRow({ s, deckName, statusStyle, onDelete, onTrigger, past }) {
  const sc = statusStyle(s.status);
  const typeIcon = s.type === 'playlist'
    ? <ListMusic size={11} style={{ flexShrink: 0 }} />
    : <Music size={11} style={{ flexShrink: 0 }} />;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
      borderRadius: '10px', padding: '0.7rem 0.85rem',
      display: 'flex', alignItems: 'center', gap: '0.65rem',
      opacity: past ? 0.6 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.name || s.target_id}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {typeIcon}
          <span>Deck {s.deck_id.toUpperCase()} — {deckName(s.deck_id)}</span>
          <span style={{ color: 'var(--accent-blue)' }}>
            {new Date(s.scheduled_at).toLocaleString()}
          </span>
          {s.loop && <span style={{ color: '#a55eea' }}>↻ loop</span>}
        </div>
      </div>
      <span style={{
        padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', flexShrink: 0,
        background: sc.bg, color: sc.color,
      }}>{s.status}</span>
      {!past && (
        <button onClick={() => onTrigger(s.id, s.name || s.target_id)} title="Play now" style={{
          width: '28px', height: '28px', borderRadius: '50%', border: 'none', flexShrink: 0,
          background: 'rgba(46,213,115,0.15)', color: '#2ed573',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <Play size={11} fill="currentColor" />
        </button>
      )}
      <button onClick={() => onDelete(s.id, s.name || s.target_id)} title="Delete" style={{
        width: '28px', height: '28px', borderRadius: '50%', border: 'none', flexShrink: 0,
        background: 'rgba(255,71,87,0.1)', color: '#ff4757',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}
