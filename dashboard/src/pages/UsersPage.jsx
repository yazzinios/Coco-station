import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Edit2, Trash2, Key, ShieldCheck, Shield, Star,
  Check, X, RefreshCw, Lock, Activity, Sliders, Mic2, Calendar,
  FolderOpen, Settings2, Music2, Eye, EyeOff, Play, Square, SkipForward,
  Volume2, ListMusic,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ─────────────────────────────────────────────
const ROLE_CFG = {
  admin:    { label: 'Admin',    color: '#fd9644', bg: 'rgba(253,150,68,0.12)', border: 'rgba(253,150,68,0.35)', Icon: ShieldCheck },
  operator: { label: 'Operator', color: '#00d4ff', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.25)', Icon: Shield },
};
const DECK_LABELS = { a: 'Deck A', b: 'Deck B', c: 'Deck C', d: 'Deck D' };
const DECK_IDS    = ['a','b','c','d'];

const FEATURE_DEFS = [
  { key: 'can_announce', label: 'Announcements', icon: <Mic2 size={13} />, desc: 'Play & create announcements' },
  { key: 'can_schedule', label: 'Schedules',     icon: <Calendar size={13} />, desc: 'Create & manage schedules' },
  { key: 'can_library',  label: 'Library',       icon: <FolderOpen size={13} />, desc: 'Upload & delete tracks' },
  { key: 'can_requests', label: 'Requests',      icon: <Music2 size={13} />, desc: 'Handle song requests' },
  { key: 'can_settings', label: 'Settings',      icon: <Settings2 size={13} />, desc: 'Access station settings' },
];

const DECK_ACTION_DEFS = [
  { key: 'deck.play',          label: 'Play',         icon: <Play size={12} /> },
  { key: 'deck.pause',         label: 'Pause',        icon: <span style={{fontSize:'0.8rem'}}>⏸</span> },
  { key: 'deck.stop',          label: 'Stop',         icon: <Square size={12} /> },
  { key: 'deck.next',          label: 'Next Track',   icon: <SkipForward size={12} /> },
  { key: 'deck.previous',      label: 'Prev Track',   icon: <span style={{fontSize:'0.8rem'}}>⏮</span> },
  { key: 'deck.volume',        label: 'Volume',       icon: <Volume2 size={12} /> },
  { key: 'deck.load_track',    label: 'Load Track',   icon: <FolderOpen size={12} /> },
  { key: 'deck.load_playlist', label: 'Load Playlist',icon: <ListMusic size={12} /> },
];

const PLAYLIST_PERM_DEFS = [
  { key: 'playlist.view',   label: 'View' },
  { key: 'playlist.load',   label: 'Load' },
  { key: 'playlist.edit',   label: 'Edit' },
  { key: 'playlist.delete', label: 'Delete' },
  { key: 'playlist.create', label: 'Create' },
];

const ACTION_ICONS = {
  'login':            '🔑',
  'user.create':      '➕',
  'user.update':      '✏️',
  'user.delete':      '🗑️',
  'user.permissions': '🔒',
  'deck.play':        '▶️',
  'deck.stop':        '⏹️',
  'deck.load':        '📂',
  'mic.on':           '🎙️',
  'mic.off':          '🎙️',
  'announcement.play':'📢',
};

const EMPTY_FORM = { username: '', display_name: '', password: '', role: 'operator' };

const DEFAULT_DECK_CONTROL   = { a:{view:true,control:true}, b:{view:true,control:true}, c:{view:true,control:true}, d:{view:true,control:true} };
const DEFAULT_DECK_ACTIONS   = ['deck.play','deck.pause','deck.stop','deck.next','deck.previous','deck.volume','deck.load_track','deck.load_playlist'];
const DEFAULT_PLAYLIST_PERMS = ['playlist.view','playlist.load'];

const DEFAULT_PERMS = {
  allowed_decks:  ['a','b','c','d'],
  deck_control:   DEFAULT_DECK_CONTROL,
  deck_actions:   DEFAULT_DECK_ACTIONS,
  playlist_perms: DEFAULT_PLAYLIST_PERMS,
  can_announce:   true,
  can_schedule:   true,
  can_library:    true,
  can_requests:   true,
  can_settings:   false,
};

// ── Generic Modal ─────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(18,18,26,0.98)', border:'1px solid var(--panel-border)', borderRadius:'14px', padding:'1.75rem', width:'100%', maxWidth: wide ? '700px' : '480px', boxShadow:'0 24px 64px rgba(0,0,0,0.75)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:'600', margin:0 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.1rem', padding:'2px 6px', borderRadius:'4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Role Badge ────────────────────────────────────────────
function RoleBadge({ role, isSuperAdmin }) {
  const rc = ROLE_CFG[role] || ROLE_CFG.operator;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'600', background:rc.bg, border:`1px solid ${rc.border}`, color:rc.color }}>
        <rc.Icon size={11}/>{rc.label}
      </span>
      {isSuperAdmin && (
        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', padding:'0.2rem 0.55rem', borderRadius:'20px', fontSize:'0.72rem', fontWeight:'700', background:'rgba(255,215,0,0.1)', border:'1px solid rgba(255,215,0,0.35)', color:'#ffd700' }}>
          <Star size={10} fill="#ffd700"/>SUPER
        </span>
      )}
    </div>
  );
}

// ── Toggle Row ────────────────────────────────────────────
function ToggleRow({ icon, label, desc, on, onChange, color='#2ed573' }) {
  return (
    <div onClick={onChange}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.65rem 0.9rem', borderRadius:'9px', cursor:'pointer',
        background: on ? `rgba(46,213,115,0.05)` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${on ? 'rgba(46,213,115,0.2)' : 'var(--panel-border)'}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
        <span style={{ color: on ? color : 'var(--text-secondary)' }}>{icon}</span>
        <div>
          <div style={{ fontSize:'0.83rem', fontWeight:'500', color: on ? 'white' : 'var(--text-secondary)' }}>{label}</div>
          {desc && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>{desc}</div>}
        </div>
      </div>
      <div style={{ width:'34px', height:'18px', borderRadius:'9px', position:'relative',
        background: on ? color : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0 }}>
        <div style={{ position:'absolute', top:'3px', left: on ? '17px' : '3px', width:'12px', height:'12px', borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
export default function UsersPage() {
  const { api, toast, currentUser } = useApp();

  const [tab,         setTab]         = useState('users');
  const [users,       setUsers]       = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);

  const [pwModal,     setPwModal]     = useState(null);
  const [pwForm,      setPwForm]      = useState({ password:'', confirm:'' });

  const [permModal,   setPermModal]   = useState(null);
  const [perms,       setPerms]       = useState(DEFAULT_PERMS);
  const [permSaving,  setPermSaving]  = useState(false);

  const [logFilter,   setLogFilter]   = useState('');
  const [permTab,     setPermTab]     = useState('decks'); // 'decks' | 'actions' | 'features'

  const isSuper = currentUser?.is_super_admin;
  const isAdmin = currentUser?.role === 'admin' || isSuper;

  // ── loaders ────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.getUsers()); }
    catch (e) { toast.error('Failed to load users: ' + e.message); }
    finally { setLoading(false); }
  }, [api, toast]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try { setLogs(await api.getLogs(300)); }
    catch (e) { toast.error('Failed to load logs: ' + e.message); }
    finally { setLogsLoading(false); }
  }, [api, toast]);

  useEffect(() => { loadUsers(); }, []); // eslint-disable-line
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]); // eslint-disable-line

  // ── open permissions modal ─────────────────────────────
  const openPerms = async (u) => {
    try {
      const p = await api.getPermissions(u.id);
      setPerms({
        ...DEFAULT_PERMS,
        ...p,
        deck_control:   p.deck_control   || DEFAULT_DECK_CONTROL,
        deck_actions:   p.deck_actions   || DEFAULT_DECK_ACTIONS,
        playlist_perms: p.playlist_perms || DEFAULT_PLAYLIST_PERMS,
      });
      setPermModal(u);
      setPermTab('decks');
    } catch(e) { toast.error(e.message); }
  };

  // ── save permissions ───────────────────────────────────
  const savePerms = async () => {
    setPermSaving(true);
    try {
      // Sync allowed_decks from deck_control (view=true)
      const allowed_decks = DECK_IDS.filter(d => perms.deck_control?.[d]?.view);
      await api.savePermissions(permModal.id, { ...perms, allowed_decks });
      toast.success(`Permissions saved for @${permModal.username}`);
      setPermModal(null);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setPermSaving(false); }
  };

  // ── deck_control helpers ───────────────────────────────
  const setDeckPerm = (deckId, level, value) => {
    setPerms(p => ({
      ...p,
      deck_control: {
        ...p.deck_control,
        [deckId]: {
          ...(p.deck_control?.[deckId] || { view: false, control: false }),
          [level]: value,
          // If enabling control, also enable view
          ...(level === 'control' && value ? { view: true } : {}),
          // If disabling view, also disable control
          ...(level === 'view' && !value ? { control: false } : {}),
        },
      },
    }));
  };

  const toggleDeckAction = (action) => {
    setPerms(p => ({
      ...p,
      deck_actions: p.deck_actions?.includes(action)
        ? p.deck_actions.filter(a => a !== action)
        : [...(p.deck_actions || []), action],
    }));
  };

  const togglePlaylistPerm = (perm) => {
    setPerms(p => ({
      ...p,
      playlist_perms: p.playlist_perms?.includes(perm)
        ? p.playlist_perms.filter(x => x !== perm)
        : [...(p.playlist_perms || []), perm],
    }));
  };

  // ── user form ──────────────────────────────────────────
  const openCreate = () => { setForm(EMPTY_FORM); setEditTarget(null); setShowForm('create'); };
  const openEdit   = (u) => { setForm({ username:u.username, display_name:u.display_name||'', password:'', role:u.role }); setEditTarget(u); setShowForm('edit'); };
  const closeForm  = () => { setShowForm(false); setEditTarget(null); };

  const handleSubmit = async () => {
    if (!form.username.trim()) { toast.error('Username required'); return; }
    if (showForm === 'create' && form.password.length < 6) { toast.error('Password ≥ 6 chars'); return; }
    setSaving(true);
    try {
      if (showForm === 'create') {
        await api.createUser({ username:form.username.trim(), display_name:form.display_name.trim()||form.username.trim(), password:form.password, role:form.role });
        toast.success(`User "${form.username}" created!`);
      } else {
        await api.updateUser(editTarget.id, { display_name:form.display_name.trim()||editTarget.username, role:form.role });
        toast.success('User updated!');
      }
      closeForm(); await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async (u) => {
    if (u.id === currentUser?.id) { toast.warning("Can't disable yourself"); return; }
    try { await api.updateUser(u.id, { enabled:!u.enabled }); await loadUsers(); }
    catch(e) { toast.error(e.message); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete "${u.username}"? Cannot be undone.`)) return;
    setDeleting(u.id);
    try { await api.deleteUser(u.id); toast.success(`Deleted @${u.username}`); await loadUsers(); }
    catch(e) { toast.error(e.message); }
    finally { setDeleting(null); }
  };

  const handleChangePw = async () => {
    if (pwForm.password.length < 6) { toast.error('Password ≥ 6 chars'); return; }
    if (pwForm.password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try { await api.updateUser(pwModal.id, { password:pwForm.password }); toast.success('Password updated!'); setPwModal(null); }
    catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── styles ─────────────────────────────────────────────
  const inp = { width:'100%', padding:'0.65rem 0.9rem', borderRadius:'8px', background:'rgba(0,0,0,0.3)', color:'white', border:'1px solid var(--panel-border)', fontFamily:'inherit', fontSize:'0.9rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.74rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'0.4rem' };
  const mkBtn = (c='blue', extra={}) => {
    const M = { blue:{bg:'rgba(0,212,255,0.12)',bd:'rgba(0,212,255,0.35)',tx:'var(--accent-blue)'}, green:{bg:'rgba(46,213,115,0.12)',bd:'rgba(46,213,115,0.4)',tx:'#2ed573'}, red:{bg:'rgba(255,71,87,0.1)',bd:'rgba(255,71,87,0.35)',tx:'#ff4757'}, amber:{bg:'rgba(253,150,68,0.1)',bd:'rgba(253,150,68,0.35)',tx:'#fd9644'}, purple:{bg:'rgba(165,94,234,0.1)',bd:'rgba(165,94,234,0.35)',tx:'#a55eea'} };
    const s = M[c]||M.blue;
    return { padding:'0.38rem 0.8rem', borderRadius:'7px', border:`1px solid ${s.bd}`, background:s.bg, color:s.tx, cursor:'pointer', fontSize:'0.8rem', display:'inline-flex', alignItems:'center', gap:'0.32rem', fontFamily:'inherit', ...extra };
  };

  const filteredLogs = logs.filter(l =>
    !logFilter || l.username?.includes(logFilter) || l.action?.includes(logFilter) || JSON.stringify(l.details||{}).includes(logFilter)
  );

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <h2 style={{ fontSize:'1.5rem', fontWeight:'500', display:'flex', alignItems:'center', gap:'0.6rem' }}>
          <Users size={22}/> User Management
        </h2>
        <div style={{ display:'flex', gap:'0.6rem' }}>
          <button onClick={tab==='users' ? loadUsers : loadLogs} style={mkBtn('blue')}><RefreshCw size={13}/> Refresh</button>
          {isAdmin && tab==='users' && (
            <button onClick={openCreate} style={mkBtn('green')}><Plus size={13}/> New User</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:'0', marginBottom:'1.5rem', borderBottom:'1px solid var(--panel-border)' }}>
        {[
          { id:'users', label:'Users', icon:<Users size={14}/> },
          { id:'logs',  label:'Activity Log', icon:<Activity size={14}/> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.65rem 1.2rem', background:'none', border:'none', borderBottom: tab===t.id ? '2px solid var(--accent-blue)' : '2px solid transparent', color: tab===t.id ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit', fontSize:'0.88rem', fontWeight: tab===t.id ? '600':'400', marginBottom:'-1px' }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ════════════ USERS TAB ════════════ */}
      {tab === 'users' && (
        <>
          {!isAdmin && (
            <div style={{ marginBottom:'1.25rem', padding:'0.7rem 1rem', borderRadius:'8px', background:'rgba(0,212,255,0.06)', border:'1px solid rgba(0,212,255,0.2)', fontSize:'0.82rem', color:'var(--text-secondary)' }}>
              ℹ You can change your own password. Contact an admin for other changes.
            </div>
          )}

          <div className="glass-panel" style={{ padding:0, overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading…</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'700px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.2)' }}>
                      {['User','Role','Deck Access','Status','Actions'].map(h => (
                        <th key={h} style={{ padding:'0.8rem 1rem', textAlign:'left', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--text-secondary)', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => {
                      const isSelf = u.id === currentUser?.id;
                      const canEdit = isSuper || (isAdmin && !u.is_super_admin) || isSelf;
                      const dc = u.permissions?.deck_control || {};
                      return (
                        <tr key={u.id}
                          style={{ borderBottom: i<users.length-1 ? '1px solid var(--panel-border)':'none', opacity:u.enabled?1:0.4, transition:'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                          {/* Avatar + name */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.7rem' }}>
                              <div style={{ width:'34px', height:'34px', borderRadius:'50%', flexShrink:0, background:`linear-gradient(135deg,${(ROLE_CFG[u.role]||ROLE_CFG.operator).color}33,${(ROLE_CFG[u.role]||ROLE_CFG.operator).color}0a)`, border:`1px solid ${(ROLE_CFG[u.role]||ROLE_CFG.operator).border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', fontWeight:'700', color:(ROLE_CFG[u.role]||ROLE_CFG.operator).color }}>
                                {(u.display_name||u.username).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:'500', fontSize:'0.88rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                                  {u.display_name||u.username}
                                  {isSelf && <span style={{ fontSize:'0.65rem', background:'rgba(0,212,255,0.12)', color:'var(--accent-blue)', padding:'0.08rem 0.4rem', borderRadius:'4px', border:'1px solid rgba(0,212,255,0.25)' }}>you</span>}
                                </div>
                                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>@{u.username}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            <RoleBadge role={u.role} isSuperAdmin={u.is_super_admin}/>
                          </td>

                          {/* Deck access — show V/C per deck */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            {(u.role==='admin'||u.is_super_admin) ? (
                              <span style={{ fontSize:'0.72rem', color:'#ffd700' }}>⭐ All decks</span>
                            ) : (
                              <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap' }}>
                                {DECK_IDS.map(d => {
                                  const cfg = dc[d] || {};
                                  const hasControl = cfg.control;
                                  const hasView    = cfg.view;
                                  if (!hasView && !hasControl) return (
                                    <span key={d} style={{ padding:'0.1rem 0.45rem', borderRadius:'5px', fontSize:'0.7rem', background:'rgba(255,255,255,0.03)', border:'1px solid var(--panel-border)', color:'rgba(255,255,255,0.2)' }}>
                                      {d.toUpperCase()}
                                    </span>
                                  );
                                  return (
                                    <span key={d} style={{ padding:'0.1rem 0.55rem', borderRadius:'5px', fontSize:'0.7rem', fontWeight:'600',
                                      background: hasControl ? 'rgba(0,212,255,0.12)' : 'rgba(255,215,0,0.06)',
                                      border:`1px solid ${hasControl ? 'rgba(0,212,255,0.3)' : 'rgba(255,215,0,0.2)'}`,
                                      color: hasControl ? 'var(--accent-blue)' : '#ffd700',
                                    }}
                                    title={hasControl ? 'View + Control' : 'View only'}>
                                      {d.toUpperCase()} {hasControl ? '🎛' : '👁'}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            {isAdmin && !isSelf && !u.is_super_admin ? (
                              <button onClick={() => toggleEnabled(u)}
                                style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit',
                                  background:u.enabled?'rgba(46,213,115,0.12)':'rgba(255,255,255,0.05)',
                                  border:u.enabled?'1px solid rgba(46,213,115,0.35)':'1px solid var(--panel-border)',
                                  color:u.enabled?'#2ed573':'var(--text-secondary)' }}>
                                {u.enabled?<><Check size={10}/>Active</>:<><X size={10}/>Disabled</>}
                              </button>
                            ) : (
                              <span style={{ fontSize:'0.8rem', color:u.enabled?'#2ed573':'var(--text-secondary)' }}>
                                {u.enabled?'● Active':'○ Off'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                              {canEdit && <button onClick={() => openEdit(u)} style={mkBtn('blue')} title="Edit"><Edit2 size={12}/></button>}
                              {canEdit && <button onClick={() => { setPwModal(u); setPwForm({password:'',confirm:''}); }} style={mkBtn('amber')} title="Password"><Key size={12}/></button>}
                              {isAdmin && !isSelf && !u.is_super_admin && (
                                <button onClick={() => openPerms(u)} style={mkBtn('purple')} title="Permissions"><Lock size={12}/></button>
                              )}
                              {(isSuper || (isAdmin && !u.is_super_admin && !isSelf)) && (
                                <button onClick={() => handleDelete(u)} disabled={deleting===u.id}
                                  style={{ ...mkBtn('red'), opacity:deleting===u.id?0.4:1 }} title="Delete"><Trash2 size={12}/></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════ LOGS TAB ════════════ */}
      {tab === 'logs' && (
        <>
          <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', alignItems:'center', flexWrap:'wrap' }}>
            <input type="text" placeholder="Filter by user, action…" value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              style={{ ...inp, maxWidth:'320px', padding:'0.5rem 0.85rem' }}/>
            <span style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginLeft:'auto' }}>
              {filteredLogs.length} event{filteredLogs.length!==1?'s':''}
            </span>
          </div>

          <div className="glass-panel" style={{ padding:0, overflow:'hidden' }}>
            {logsLoading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading logs…</div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>No activity yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'580px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.2)' }}>
                      {['Time','User','Action','Details','IP'].map(h => (
                        <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--text-secondary)', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, i) => {
                      const dt = log.created_at ? new Date(log.created_at) : null;
                      const details = typeof log.details === 'object' ? log.details : {};
                      const emoji = ACTION_ICONS[log.action] || '•';
                      return (
                        <tr key={log.id}
                          style={{ borderBottom: i<filteredLogs.length-1?'1px solid var(--panel-border)':'none', transition:'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.75rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
                            {dt ? <div><div>{dt.toLocaleDateString()}</div><div style={{ opacity:0.6 }}>{dt.toLocaleTimeString()}</div></div> : '—'}
                          </td>
                          <td style={{ padding:'0.7rem 1rem' }}><span style={{ fontSize:'0.82rem', fontWeight:'500' }}>{log.username}</span></td>
                          <td style={{ padding:'0.7rem 1rem' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', fontSize:'0.8rem',
                              padding:'0.18rem 0.6rem', borderRadius:'12px',
                              background: log.action==='login' ? 'rgba(46,213,115,0.1)' : log.action?.startsWith('user.') ? 'rgba(253,150,68,0.1)' : log.action?.startsWith('mic') ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.05)',
                              border: log.action==='login' ? '1px solid rgba(46,213,115,0.25)' : log.action?.startsWith('user.') ? '1px solid rgba(253,150,68,0.25)' : log.action?.startsWith('mic') ? '1px solid rgba(255,71,87,0.25)' : '1px solid var(--panel-border)',
                              color: log.action==='login' ? '#2ed573' : log.action?.startsWith('user.') ? '#fd9644' : log.action?.startsWith('mic') ? '#ff4757' : 'var(--text-primary)',
                            }}>
                              {emoji} {log.action}
                            </span>
                          </td>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.75rem', color:'var(--text-secondary)', maxWidth:'220px' }}>
                            {Object.keys(details).length > 0 ? (
                              <span style={{ wordBreak:'break-all' }}>
                                {Object.entries(details).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.72rem', color:'rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>
                            {log.ip_address || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════ Create / Edit Modal ════ */}
      {showForm && (
        <Modal title={showForm==='create'?'Create New User':`Edit — @${editTarget?.username}`} onClose={closeForm}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={lbl}>Username{showForm==='edit'&&<span style={{ color:'var(--text-secondary)', fontSize:'0.65rem', textTransform:'none', marginLeft:'0.4rem' }}>(cannot change)</span>}</label>
              <input style={{ ...inp, opacity:showForm==='edit'?0.5:1, cursor:showForm==='edit'?'not-allowed':'text' }}
                value={form.username} readOnly={showForm==='edit'}
                onChange={e => setForm(p=>({...p, username:e.target.value}))} placeholder="djmike"/>
            </div>
            <div>
              <label style={lbl}>Display Name</label>
              <input style={inp} value={form.display_name} onChange={e => setForm(p=>({...p, display_name:e.target.value}))} placeholder="Mike the DJ"/>
            </div>
            {showForm==='create' && (
              <div>
                <label style={lbl}>Password <span style={{ color:'#ff4757' }}>*</span></label>
                <input type="password" style={inp} value={form.password} onChange={e => setForm(p=>({...p, password:e.target.value}))} placeholder="Min 6 characters"/>
                {form.password && form.password.length<6 && <div style={{ marginTop:'0.3rem', fontSize:'0.73rem', color:'#ff4757' }}>Too short</div>}
              </div>
            )}
            {isAdmin && (
              <div>
                <label style={lbl}>Role</label>
                <div style={{ display:'flex', gap:'1.5rem' }}>
                  {['operator','admin'].map(r => (
                    <label key={r} style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor: r==='admin'&&!isSuper ? 'not-allowed':'pointer', opacity: r==='admin'&&!isSuper ? 0.4:1 }}>
                      <input type="radio" name="role" value={r} checked={form.role===r}
                        disabled={r==='admin'&&!isSuper}
                        onChange={() => setForm(p=>({...p, role:r}))}
                        style={{ accentColor:(ROLE_CFG[r]||ROLE_CFG.operator).color }}/>
                      <span style={{ display:'flex', alignItems:'center', gap:'0.3rem', color:(ROLE_CFG[r]||ROLE_CFG.operator).color, fontSize:'0.87rem' }}>
                        {r==='admin'?<ShieldCheck size={13}/>:<Shield size={13}/>} {ROLE_CFG[r]?.label||r}
                        {r==='admin'&&!isSuper&&<span style={{ fontSize:'0.65rem', color:'var(--text-secondary)' }}>(super-admin only)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={closeForm} style={mkBtn('blue')}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ ...mkBtn('green'), opacity:saving?0.6:1 }}>
                {saving?'⟳ Saving…':showForm==='create'?<><Plus size={13}/>Create</>:<><Check size={13}/>Save</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ════ Change Password Modal ════ */}
      {pwModal && (
        <Modal title={`Change Password — @${pwModal.username}`} onClose={() => setPwModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={lbl}>New Password</label>
              <input type="password" style={inp} value={pwForm.password} onChange={e => setPwForm(p=>({...p, password:e.target.value}))} placeholder="Min 6 characters"/>
            </div>
            <div>
              <label style={lbl}>Confirm Password</label>
              <input type="password" style={{ ...inp, borderColor:pwForm.confirm&&pwForm.confirm!==pwForm.password?'rgba(255,71,87,0.55)':'var(--panel-border)' }}
                value={pwForm.confirm} onChange={e => setPwForm(p=>({...p, confirm:e.target.value}))} placeholder="Repeat password"/>
              {pwForm.confirm&&pwForm.confirm!==pwForm.password&&<div style={{ marginTop:'0.3rem', fontSize:'0.73rem', color:'#ff4757' }}>Passwords do not match</div>}
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => setPwModal(null)} style={mkBtn('blue')}>Cancel</button>
              <button onClick={handleChangePw} disabled={saving||pwForm.password!==pwForm.confirm||!pwForm.password}
                style={{ ...mkBtn('amber'), opacity:(saving||pwForm.password!==pwForm.confirm||!pwForm.password)?0.5:1 }}>
                {saving?'⟳ Updating…':<><Key size={13}/>Update Password</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ════ Permissions Modal — GRANULAR ════ */}
      {permModal && (
        <Modal title={`🔐 Permissions — @${permModal.username}`} onClose={() => setPermModal(null)} wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

            {/* Sub-tabs */}
            <div style={{ display:'flex', gap:'0', borderBottom:'1px solid var(--panel-border)' }}>
              {[
                { id:'decks',    label:'🎚️ Decks',    desc:'View & control per deck' },
                { id:'actions',  label:'⚡ Actions',   desc:'Deck & playlist actions' },
                { id:'features', label:'🧩 Features',  desc:'Page access' },
              ].map(t => (
                <button key={t.id} onClick={() => setPermTab(t.id)}
                  style={{ padding:'0.55rem 1rem', background:'none', border:'none', borderBottom: permTab===t.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    color: permTab===t.id ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor:'pointer', fontFamily:'inherit', fontSize:'0.82rem', fontWeight: permTab===t.id?'600':'400', marginBottom:'-1px' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB: Deck view/control ── */}
            {permTab === 'decks' && (
              <div>
                <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:'0 0 0.85rem 0' }}>
                  Choose what this user can do on each deck.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                  {DECK_IDS.map(d => {
                    const cfg = perms.deck_control?.[d] || { view:false, control:false };
                    return (
                      <div key={d} style={{ padding:'0.75rem 1rem', borderRadius:'10px', background:'rgba(0,0,0,0.15)', border:'1px solid var(--panel-border)' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:'600', fontSize:'0.88rem' }}>
                            <Sliders size={14} color={cfg.control ? 'var(--accent-blue)' : cfg.view ? '#ffd700' : 'rgba(255,255,255,0.3)'}/>
                            {DECK_LABELS[d]}
                          </div>
                          <span style={{ fontSize:'0.7rem', color: cfg.control ? 'var(--accent-blue)' : cfg.view ? '#ffd700' : 'rgba(255,255,255,0.25)' }}>
                            {cfg.control ? '🎛 Control' : cfg.view ? '👁 View only' : '🚫 No access'}
                          </span>
                        </div>
                        <div style={{ display:'flex', gap:'0.5rem' }}>
                          {/* View toggle */}
                          <button onClick={() => setDeckPerm(d, 'view', !cfg.view)}
                            style={{ flex:1, padding:'0.4rem 0.6rem', borderRadius:'7px', border:`1px solid ${cfg.view ? 'rgba(255,215,0,0.4)' : 'var(--panel-border)'}`,
                              background: cfg.view ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
                              color: cfg.view ? '#ffd700' : 'var(--text-secondary)',
                              cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
                            {cfg.view ? <Eye size={12}/> : <EyeOff size={12}/>}
                            View {cfg.view ? '✓' : '✕'}
                          </button>
                          {/* Control toggle */}
                          <button onClick={() => setDeckPerm(d, 'control', !cfg.control)}
                            style={{ flex:1, padding:'0.4rem 0.6rem', borderRadius:'7px', border:`1px solid ${cfg.control ? 'rgba(0,212,255,0.4)' : 'var(--panel-border)'}`,
                              background: cfg.control ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
                              color: cfg.control ? 'var(--accent-blue)' : 'var(--text-secondary)',
                              cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}>
                            <Sliders size={12}/>
                            Control {cfg.control ? '✓' : '✕'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: Deck & Playlist Actions ── */}
            {permTab === 'actions' && (
              <div>
                {/* Deck Actions */}
                <label style={{ ...lbl, marginBottom:'0.6rem' }}>Deck Actions</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem', marginBottom:'1.25rem' }}>
                  {DECK_ACTION_DEFS.map(({ key, label, icon }) => {
                    const on = perms.deck_actions?.includes(key);
                    return (
                      <button key={key} onClick={() => toggleDeckAction(key)}
                        style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                          background: on ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${on ? 'rgba(0,212,255,0.3)' : 'var(--panel-border)'}`,
                          color: on ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize:'0.8rem' }}>
                        <span>{icon}</span>
                        <span>{label}</span>
                        {on && <Check size={11} style={{ marginLeft:'auto' }}/>}
                      </button>
                    );
                  })}
                </div>

                {/* Playlist Permissions */}
                <label style={{ ...lbl, marginBottom:'0.6rem' }}>Playlist Permissions</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
                  {PLAYLIST_PERM_DEFS.map(({ key, label }) => {
                    const on = perms.playlist_perms?.includes(key);
                    return (
                      <button key={key} onClick={() => togglePlaylistPerm(key)}
                        style={{ padding:'0.38rem 0.8rem', borderRadius:'20px', cursor:'pointer', fontFamily:'inherit', fontSize:'0.78rem',
                          background: on ? 'rgba(165,94,234,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${on ? 'rgba(165,94,234,0.4)' : 'var(--panel-border)'}`,
                          color: on ? '#a55eea' : 'var(--text-secondary)',
                          display:'flex', alignItems:'center', gap:'0.3rem' }}>
                        {on && <Check size={10}/>}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: Feature Access ── */}
            {permTab === 'features' && (
              <div>
                <p style={{ fontSize:'0.78rem', color:'var(--text-secondary)', margin:'0 0 0.85rem 0' }}>
                  Control which pages this user can access.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {FEATURE_DEFS.map(({ key, label, icon, desc }) => (
                    <ToggleRow key={key} icon={icon} label={label} desc={desc}
                      on={perms[key]} onChange={() => setPerms(p=>({...p,[key]:!p[key]}))}/>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => setPermModal(null)} style={mkBtn('blue')}>Cancel</button>
              <button onClick={savePerms} disabled={permSaving} style={{ ...mkBtn('green'), opacity:permSaving?0.6:1 }}>
                {permSaving?'⟳ Saving…':<><Check size={13}/>Save Permissions</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
