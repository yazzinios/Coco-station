import React, { useState } from 'react';
import { Clock, Calendar, Volume2, Settings2, Trash2, Edit3, Plus, Mic, Play, Pause, Save, X, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DAYS_OF_WEEK = [
  { id: 0, label: 'Mon', full: 'Monday' },
  { id: 1, label: 'Tue', full: 'Tuesday' },
  { id: 2, label: 'Wed', full: 'Wednesday' },
  { id: 3, label: 'Thu', full: 'Thursday' },
  { id: 4, label: 'Fri', full: 'Friday' },
  { id: 5, label: 'Sat', full: 'Saturday' },
  { id: 6, label: 'Sun', full: 'Sunday' },
];

const DECK_OPTIONS = ['A', 'B', 'C', 'D'];

export default function AnnouncementSchedules() {
  const { announcements, recurringSchedules, toast, api } = useApp();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    type: 'Announcement', // 'Announcement' | 'Microphone'
    announcement_id: '',
    start_time: '09:00',
    stop_time: '09:05',
    active_days: [0, 1, 2, 3, 4, 5, 6],
    fade_duration: 5,
    music_volume: 10,
    target_decks: ['A'],
    enabled: true
  });

  const handleResetForm = () => {
    setFormData({
      name: '',
      type: 'Announcement',
      announcement_id: '',
      start_time: '09:00',
      stop_time: '09:05',
      active_days: [0, 1, 2, 3, 4, 5, 6],
      fade_duration: 5,
      music_volume: 10,
      target_decks: ['A'],
      enabled: true
    });
    setEditingId(null);
    setIsAdding(false);
  };

  const handleEdit = (schedule) => {
    setFormData({ ...schedule });
    setEditingId(schedule.id);
    setIsAdding(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      try {
        await api.deleteRecurringSchedule(id);
        toast.info('Schedule removed');
      } catch (err) {
        toast.error(err.message);
      }
    }
  };

  const toggleStatus = async (schedule) => {
    try {
      const updated = { ...schedule, enabled: !schedule.enabled };
      await api.updateRecurringSchedule(schedule.id, updated);
      toast.success(updated.enabled ? 'Schedule enabled' : 'Schedule disabled');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.type === 'Announcement' && !formData.announcement_id) {
      toast.error('Please select an announcement');
      return;
    }

    try {
      if (editingId) {
        await api.updateRecurringSchedule(editingId, formData);
        toast.success('Schedule updated');
      } else {
        await api.createRecurringSchedule(formData);
        toast.success('Schedule created');
      }
      handleResetForm();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleDay = (dayId) => {
    const active_days = formData.active_days.includes(dayId)
      ? formData.active_days.filter(d => d !== dayId)
      : [...formData.active_days, dayId].sort();
    setFormData({ ...formData, active_days });
  };

  const toggleDeck = (deck) => {
    const target_decks = formData.target_decks.includes(deck)
      ? formData.target_decks.filter(d => d !== deck)
      : [...formData.target_decks, deck].sort();
    setFormData({ ...formData, target_decks });
  };

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

  return (
    <div className="glass-panel" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Clock size={16} /> Recurring Announcement Schedules
        </h3>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} style={{
            padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none',
            background: 'var(--accent-blue)', color: '#000',
            cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem'
          }}>
            <Plus size={14} /> New Schedule
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} style={{ 
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)',
          borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            
            {/* Basic Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Schedule Name</label>
                <input 
                  type="text" value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Daily Greeting" style={inputStyle} required 
                />
              </div>

              <div>
                <label style={labelStyle}>Source Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['Announcement', 'Microphone'].map(t => (
                    <button key={t} type="button" onClick={() => setFormData({...formData, type: t})}
                      style={{
                        flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none',
                        background: formData.type === t ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                        color: formData.type === t ? '#000' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                      }}>
                      {t === 'Announcement' ? <Play size={12} /> : <Mic size={12} />} {t}
                    </button>
                  ))}
                </div>
              </div>

              {formData.type === 'Announcement' && (
                <div>
                  <label style={labelStyle}>Select Announcement</label>
                  <select 
                    value={formData.announcement_id} 
                    onChange={e => setFormData({...formData, announcement_id: e.target.value})}
                    style={inputStyle} required
                  >
                    <option value="">— Choose from library —</option>
                    {announcements.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start Time</label>
                  <input 
                    type="time" value={formData.start_time} 
                    onChange={e => setFormData({...formData, start_time: e.target.value})}
                    style={{...inputStyle, colorScheme: 'dark'}} required 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Stop Time</label>
                  <input 
                    type="time" value={formData.stop_time} 
                    onChange={e => setFormData({...formData, stop_time: e.target.value})}
                    style={{...inputStyle, colorScheme: 'dark'}} required 
                  />
                </div>
              </div>
            </div>

            {/* Config & Targets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Active Days</label>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(day => (
                    <button key={day.id} type="button" onClick={() => toggleDay(day.id)}
                      style={{
                        padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', fontSize: '0.75rem',
                        background: formData.active_days.includes(day.id) ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                        color: formData.active_days.includes(day.id) ? 'var(--accent-blue)' : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: formData.active_days.includes(day.id) ? '1px solid rgba(0,212,255,0.4)' : '1px solid transparent',
                      }}>
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Audio Ducking (Fade Out Music)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fade Duration</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>{formData.fade_duration}s</span>
                    </div>
                    <input 
                      type="range" min="0" max="30" step="1"
                      value={formData.fade_duration}
                      onChange={e => setFormData({...formData, fade_duration: parseInt(e.target.value)})}
                      style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Music Volume</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>{formData.music_volume}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="1"
                      value={formData.music_volume}
                      onChange={e => setFormData({...formData, music_volume: parseInt(e.target.value)})}
                      style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Target Decks</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {DECK_OPTIONS.map(d => (
                    <button key={d} type="button" onClick={() => toggleDeck(d)} style={{
                      padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                      background: formData.target_decks.includes(d) ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                      color: formData.target_decks.includes(d) ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      border: `1px solid ${formData.target_decks.includes(d) ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)'}`,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}>{d}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                <button type="submit" style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none',
                  background: 'var(--accent-blue)', color: '#000', fontWeight: 'bold',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}>
                  <Save size={16} /> {editingId ? 'Update Schedule' : 'Save Schedule'}
                </button>
                <button type="button" onClick={handleResetForm} style={{
                  padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--panel-border)',
                  background: 'transparent', color: 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {recurringSchedules.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '1rem', padding: '3rem 1rem',
          background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--panel-border)'
        }}>
          <Calendar size={40} style={{ opacity: 0.15 }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontWeight: '500' }}>No recurring schedules</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Automate your announcements and mic feeds by creating a schedule.</p>
          </div>
          {!isAdding && (
            <button onClick={() => setIsAdding(true)} style={{
              marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--accent-blue)',
              background: 'rgba(0,212,255,0.05)', color: 'var(--accent-blue)',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500'
            }}>Create your first schedule</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {recurringSchedules.map(s => (
            <div key={s.id} style={{
              background: s.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
              border: '1px solid var(--panel-border)', borderRadius: '12px',
              padding: '1rem', position: 'relative', overflow: 'hidden',
              transition: 'all 0.3s ease',
              opacity: s.enabled ? 1 : 0.6
            }}>
              {/* Status Indicator */}
              <div style={{ 
                position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
                background: s.enabled ? 'var(--accent-blue)' : '#555'
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {s.type === 'announcement' ? <Play size={13} fill="currentColor" /> : <Mic size={13} />}
                    {s.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={12} /> {s.start_time} — {s.stop_time}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => toggleStatus(s)} title={s.enabled ? 'Disable' : 'Enable'} style={{
                    width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                    background: s.enabled ? 'rgba(46,213,115,0.1)' : 'rgba(255,255,255,0.05)',
                    color: s.enabled ? '#2ed573' : 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {s.enabled ? <Check size={14} /> : <Pause size={14} />}
                  </button>
                  <button onClick={() => handleEdit(s)} title="Edit" style={{
                    width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(s.id)} title="Delete" style={{
                    width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                    background: 'rgba(255,71,87,0.1)', color: '#ff4757',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Days */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {DAYS_OF_WEEK.map(d => (
                    <span key={d.id} style={{
                      fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '4px',
                      background: s.active_days.includes(d.id) ? 'rgba(0,212,255,0.15)' : 'transparent',
                      color: s.active_days.includes(d.id) ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)',
                      border: `1px solid ${s.active_days.includes(d.id) ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                      fontWeight: s.active_days.includes(d.id) ? '600' : '400'
                    }}>
                      {d.label[0]}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <Volume2 size={10} /> {s.music_volume}%
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <Settings2 size={10} /> {s.fade_duration}s
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    {s.target_decks.map(d => (
                      <span key={d} style={{
                        fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)',
                        padding: '0.05rem 0.3rem', borderRadius: '4px', fontWeight: 'bold'
                      }}>{d}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
