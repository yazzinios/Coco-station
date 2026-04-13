import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Edit2, Trash2, Key, ShieldCheck, Shield, Star,
  Check, X, RefreshCw, Lock, Activity, ChevronDown, ChevronUp,
  Sliders, Mic2, Calendar, FolderOpen, Settings2, Music2,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ─────────────────────────────────────────────
const ROLE_CFG = {
  admin:    { label: 'Admin',    color: '#fd9644', bg: 'rgba(253,150,68,0.12)', border: 'rgba(253,150,68,0.35)', Icon: ShieldCheck },
  operator: { label: 'Operator', color: '#00d4ff', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.25)', Icon: Shield },
};
const DECK_LABELS = { a: 'Deck A', b: 'Deck B', c: 'Deck C', d: 'Deck D' };
const PERM_DEFS = [
  { key: 'can_announce', label: 'Announcements', icon: <Mic2 size={13} />, desc: 'Play & create announcements' },
  { key: 'can_schedule', label: 'Schedules',     icon: <Calendar size={13} />, desc: 'Create & manage schedules' },
  { key: 'can_library',  label: 'Library',       icon: <FolderOpen size={13} />, desc: 'Upload & delete tracks' },
  { key: 'can_requests', label: 'Requests',      icon: <Music2 size={13} />, desc: 'Handle song requests' },
  { key: 'can_settings', label: 'Settings',      icon: <Settings2 size={13} />, desc: 'Access station settings' },
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
const DEFAULT_PERMS = { allowed_decks: ['a','b','c','d'], can_announce: true, can_schedule: true, can_library: true, can_requests: true, can_settings: false };

// ── Generic Modal ─────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(18,18,26,0.98)', border:'1px solid var(--panel-border)', borderRadius:'14px', padding:'1.75rem', width:'100%', maxWidth: wide ? '640px' : '480px', boxShadow:'0 24px 64px rgba(0,0,0,0.75)', maxHeight:'90vh', overflowY:'auto' }}>
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

// ════════════════════════════════════════════════════════
export default function UsersPage() {
  const { api, toast, currentUser } = useApp();

  const [tab,         setTab]         = useState('users'); // 'users' | 'logs'
  const [users,       setUsers]       = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // User form
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);

  // Password modal
  const [pwModal,     setPwModal]     = useState(null);
  const [pwForm,      setPwForm]      = useState({ password:'', confirm:'' });

  // Permissions modal
  const [permModal,   setPermModal]   = useState(null);
  const [perms,       setPerms]       = useState(DEFAULT_PERMS);
  const [permSaving,  setPermSaving]  = useState(false);

  // Logs filter
  const [logFilter,   setLogFilter]   = useState('');

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
      setPerms({ ...DEFAULT_PERMS, ...p });
      setPermModal(u);
    } catch(e) { toast.error(e.message); }
  };

  // ── save permissions ───────────────────────────────────
  const savePerms = async () => {
    setPermSaving(true);
    try {
      await api.savePermissions(permModal.id, perms);
      toast.success(`Permissions saved for @${permModal.username}`);
      setPermModal(null);
    } catch(e) { toast.error(e.message); }
    finally { setPermSaving(false); }
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
    !logFilter || l.username.includes(logFilter) || l.action.includes(logFilter) || JSON.stringify(l.details||{}).includes(logFilter)
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
                      {['User','Role','Decks','Status','Actions'].map(h => (
                        <th key={h} style={{ padding:'0.8rem 1rem', textAlign:'left', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--text-secondary)', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => {
                      const isSelf = u.id === currentUser?.id;
                      const canEdit = isSuper || (isAdmin && !u.is_super_admin) || isSelf;
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

                          {/* Allowed decks preview */}
                          <td style={{ padding:'0.85rem 1rem' }}>
                            <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                              {(u.role==='admin'||u.is_super_admin) ? (
                                <span style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>All decks</span>
                              ) : (
                                ['a','b','c','d'].map(d => (
                                  <span key={d} style={{ padding:'0.1rem 0.45rem', borderRadius:'5px', fontSize:'0.72rem', fontWeight:'600',
                                    background: (u.permissions?.allowed_decks||['a','b','c','d']).includes(d) ? 'rgba(0,212,255,0.12)':'rgba(255,255,255,0.04)',
                                    border:`1px solid ${(u.permissions?.allowed_decks||['a','b','c','d']).includes(d)?'rgba(0,212,255,0.3)':'var(--panel-border)'}`,
                                    color:(u.permissions?.allowed_decks||['a','b','c','d']).includes(d)?'var(--accent-blue)':'rgba(255,255,255,0.25)'}}>
                                    {d.toUpperCase()}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>

                          {/* Status toggle */}
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
                              {canEdit && (
                                <button onClick={() => openEdit(u)} style={mkBtn('blue')} title="Edit"><Edit2 size={12}/></button>
                              )}
                              {canEdit && (
                                <button onClick={() => { setPwModal(u); setPwForm({password:'',confirm:''}); }} style={mkBtn('amber')} title="Password"><Key size={12}/></button>
                              )}
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
                            {dt ? (
                              <div>
                                <div>{dt.toLocaleDateString()}</div>
                                <div style={{ opacity:0.6 }}>{dt.toLocaleTimeString()}</div>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding:'0.7rem 1rem' }}>
                            <span style={{ fontSize:'0.82rem', fontWeight:'500' }}>{log.username}</span>
                          </td>
                          <td style={{ padding:'0.7rem 1rem' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', fontSize:'0.8rem',
                              padding:'0.18rem 0.6rem', borderRadius:'12px',
                              background: log.action==='login' ? 'rgba(46,213,115,0.1)' :
                                          log.action.startsWith('user.') ? 'rgba(253,150,68,0.1)' :
                                          log.action.startsWith('mic') ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.05)',
                              border: log.action==='login' ? '1px solid rgba(46,213,115,0.25)' :
                                      log.action.startsWith('user.') ? '1px solid rgba(253,150,68,0.25)' :
                                      log.action.startsWith('mic') ? '1px solid rgba(255,71,87,0.25)' : '1px solid var(--panel-border)',
                              color: log.action==='login' ? '#2ed573' :
                                     log.action.startsWith('user.') ? '#fd9644' :
                                     log.action.startsWith('mic') ? '#ff4757' : 'var(--text-primary)',
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
            {/* Role — only super can assign admin */}
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

      {/* ════ Permissions Modal ════ */}
      {permModal && (
        <Modal title={`Permissions — @${permModal.username}`} onClose={() => setPermModal(null)} wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
            {/* Deck access */}
            <div>
              <label style={{ ...lbl, marginBottom:'0.75rem' }}>Deck Access</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                {['a','b','c','d'].map(d => {
                  const on = perms.allowed_decks?.includes(d);
                  return (
                    <button key={d} onClick={() => setPerms(p => ({ ...p, allowed_decks: on ? p.allowed_decks.filter(x=>x!==d) : [...(p.allowed_decks||[]),d] }))}
                      style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', borderRadius:'10px', cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                        background: on?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)',
                        border: `1px solid ${on?'rgba(0,212,255,0.35)':'var(--panel-border)'}`,
                        color: on?'var(--accent-blue)':'var(--text-secondary)' }}>
                      <Sliders size={15}/>
                      <div>
                        <div style={{ fontWeight:'600', fontSize:'0.85rem' }}>{DECK_LABELS[d]}</div>
                        <div style={{ fontSize:'0.72rem', opacity:0.7 }}>{on?'✓ Allowed':'✕ Blocked'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feature permissions */}
            <div>
              <label style={{ ...lbl, marginBottom:'0.75rem' }}>Feature Access</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {PERM_DEFS.map(({ key, label, icon, desc }) => {
                  const on = perms[key];
                  return (
                    <div key={key} onClick={() => setPerms(p=>({...p,[key]:!p[key]}))}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.7rem 1rem', borderRadius:'9px', cursor:'pointer',
                        background: on?'rgba(46,213,115,0.06)':'rgba(255,255,255,0.02)',
                        border:`1px solid ${on?'rgba(46,213,115,0.25)':'var(--panel-border)'}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.7rem' }}>
                        <span style={{ color: on?'#2ed573':'var(--text-secondary)' }}>{icon}</span>
                        <div>
                          <div style={{ fontSize:'0.85rem', fontWeight:'500', color: on?'white':'var(--text-secondary)' }}>{label}</div>
                          <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>{desc}</div>
                        </div>
                      </div>
                      <div style={{ width:'36px', height:'20px', borderRadius:'10px', position:'relative',
                        background: on?'#2ed573':'rgba(255,255,255,0.12)', transition:'background 0.2s' }}>
                        <div style={{ position:'absolute', top:'3px', left: on?'19px':'3px', width:'14px', height:'14px', borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
