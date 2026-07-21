import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Edit2, Trash2, Key, Star, Shield, ShieldOff,
  Check, X, RefreshCw, Lock, Activity, Sliders, Mic2, Calendar,
  FolderOpen, Settings2, Music2, Eye, EyeOff, Play, Square,
  SkipForward, Volume2, ListMusic, Crosshair, RotateCcw,
  UserCheck, Clock, AlertTriangle, Server,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ───────────────────────────────────────────────────────────────
const DECK_IDS    = ['a', 'b', 'c', 'd', 'e', 'f'];
const DECK_LABELS = { a: 'Deck A', b: 'Deck B', c: 'Deck C', d: 'Deck D', e: 'Deck E', f: 'Deck F' };

const FEATURE_DEFS = [
  { key: 'can_announce', label: 'Announcements', icon: <Mic2   size={13}/>, desc: 'Play & manage announcements' },
  { key: 'can_schedule', label: 'Schedules',     icon: <Calendar size={13}/>, desc: 'Create & manage schedules' },
  { key: 'can_library',  label: 'Library',       icon: <FolderOpen size={13}/>, desc: 'Upload & delete tracks' },
  { key: 'can_requests', label: 'Requests',      icon: <Music2  size={13}/>, desc: 'Handle song requests' },
  { key: 'can_settings', label: 'Settings',      icon: <Settings2 size={13}/>, desc: 'Access station settings (super-admin only)' },
];

const DECK_ACTION_DEFS = [
  { key: 'deck.play',          label: 'Play',          icon: <Play size={12}/> },
  { key: 'deck.pause',         label: 'Pause',         icon: <span style={{ fontSize:'0.8rem' }}>⏸</span> },
  { key: 'deck.stop',          label: 'Stop',          icon: <Square size={12}/> },
  { key: 'deck.next',          label: 'Next Track',    icon: <SkipForward size={12}/> },
  { key: 'deck.previous',      label: 'Prev Track',    icon: <span style={{ fontSize:'0.8rem' }}>⏮</span> },
  { key: 'deck.volume',        label: 'Volume',        icon: <Volume2 size={12}/> },
  { key: 'deck.crossfader',    label: 'Crossfader',    icon: <Crosshair size={12}/> },
  { key: 'deck.load_track',    label: 'Load Track',    icon: <FolderOpen size={12}/> },
  { key: 'deck.load_playlist', label: 'Load Playlist', icon: <ListMusic size={12}/> },
];

const PLAYLIST_PERM_DEFS = [
  { key: 'playlist.view',   label: 'View' },
  { key: 'playlist.load',   label: 'Load' },
  { key: 'playlist.create', label: 'Create' },
  { key: 'playlist.edit',   label: 'Edit' },
  { key: 'playlist.delete', label: 'Delete' },
];

const ACTION_ICONS = {
  login: '🔑', login_failed: '🚫', logout: '🚪', token_refresh: '🔄',
  'user.create': '➕', 'user.update': '✏️', 'user.delete': '🗑️',
  'user.disable': '🔴', 'user.enable': '🟢', 'user.permissions': '🔒',
  'deck.play': '▶️', 'deck.stop': '⏹️', 'deck.pause': '⏸️',
  'deck.load_track': '📂', 'deck.volume': '🔊', 'mic.on': '🎙️',
  'announcement.play': '📢', 'library.upload': '⬆️', 'settings.update': '⚙️',
};

const DEFAULT_DECK_CONTROL   = { a:{view:true,control:true}, b:{view:true,control:true}, c:{view:true,control:true}, d:{view:true,control:true}, e:{view:true,control:true}, f:{view:true,control:true} };
const DEFAULT_DECK_ACTIONS   = ['deck.play','deck.pause','deck.stop','deck.next','deck.previous','deck.volume','deck.crossfader','deck.load_track','deck.load_playlist'];
const DEFAULT_PLAYLIST_PERMS = ['playlist.view','playlist.load'];

const DEFAULT_PERMS = {
  allowed_decks:  DECK_IDS,
  deck_control:   DEFAULT_DECK_CONTROL,
  deck_actions:   DEFAULT_DECK_ACTIONS,
  playlist_perms: DEFAULT_PLAYLIST_PERMS,
  can_announce: true, can_schedule: true, can_library: true,
  can_requests: true, can_settings: false,
};

const EMPTY_USER_FORM = { username:'', display_name:'', password:'', role:'viewer' };

// Role colour palette
const ROLE_COLORS = {
  super_admin: '#DC2626',
  admin:       '#D97706',
  operator:    '#2563EB',
  viewer:      '#6B7280',
  pending:     '#9333EA',
};

// ── Style helpers ────────────────────────────────────────────────────────────
const TXS = 'var(--text-secondary)';
const mkBtn = (col) => {
  const map = {
    blue:   ['rgba(0,212,255,0.12)', 'rgba(0,212,255,0.4)', 'var(--accent-blue)'],
    red:    ['rgba(255,71,87,0.12)',  'rgba(255,71,87,0.4)',  '#ff4757'],
    amber:  ['rgba(253,150,68,0.12)', 'rgba(253,150,68,0.4)', '#fd9644'],
    purple: ['rgba(165,94,234,0.12)', 'rgba(165,94,234,0.4)', '#a55eea'],
    gray:   ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)', TXS],
    green:  ['rgba(46,213,115,0.12)', 'rgba(46,213,115,0.4)',  '#2ed573'],
  };
  const [bg, bdr, clr] = map[col] || map.gray;
  return {
    padding: '0.3rem 0.55rem', borderRadius: '6px', border: `1px solid ${bdr}`,
    background: bg, color: clr, cursor: 'pointer', fontSize: '0.75rem',
    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center',
    gap: '0.3rem', transition: 'all 0.15s',
  };
};
const LBL = { fontSize:'0.8rem', color:TXS, fontWeight:'600', marginBottom:'0.4rem', display:'block' };
const INPUT = {
  width:'100%', padding:'0.6rem 0.8rem', borderRadius:'8px',
  border:'1px solid var(--panel-border)', background:'rgba(255,255,255,0.04)',
  color:'white', fontFamily:'inherit', fontSize:'0.88rem', boxSizing:'border-box',
};

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, wide, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'#141820', border:'1px solid var(--panel-border)', borderRadius:'16px',
        width: wide ? 'min(780px,95vw)' : 'min(460px,95vw)',
        maxHeight:'90vh', overflow:'auto', padding:'1.8rem',
        boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.4rem' }}>
          <span style={{ fontWeight:'700', fontSize:'1rem' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:TXS, cursor:'pointer', padding:'0.2rem', lineHeight:1 }}>
            <X size={18}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role, isSuperAdmin, source }) {
  const color = isSuperAdmin ? ROLE_COLORS.super_admin : (ROLE_COLORS[role] || '#6B7280');
  const label = isSuperAdmin ? '⭐ Super Admin' : role || 'unknown';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
      <span style={{
        padding:'0.2rem 0.55rem', borderRadius:'99px', fontSize:'0.72rem',
        fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px',
        background:`${color}18`, border:`1px solid ${color}40`, color,
      }}>{label}</span>
      {source === 'ldap' && (
        <span style={{
          padding:'0.15rem 0.45rem', borderRadius:'99px', fontSize:'0.68rem',
          fontWeight:'600', background:'rgba(165,94,234,0.12)',
          border:'1px solid rgba(165,94,234,0.35)', color:'#a55eea',
          display:'flex', alignItems:'center', gap:'0.25rem',
        }}>
          <Server size={9}/> LDAP
        </span>
      )}
    </div>
  );
}

// ── Permission Editor ─────────────────────────────────────────────────────────
function PermissionEditor({ perms, onChange }) {
  const allowed_decks  = perms.allowed_decks  || DECK_IDS;
  const deck_control   = perms.deck_control   || DEFAULT_DECK_CONTROL;
  const deck_actions   = perms.deck_actions   || [];
  const playlist_perms = perms.playlist_perms || [];

  const toggleDeck = (d) => {
    const next = allowed_decks.includes(d)
      ? allowed_decks.filter(x => x !== d)
      : [...allowed_decks, d];
    onChange({ ...perms, allowed_decks: next });
  };
  const toggleDeckCtrl = (d, field) => {
    const cur = deck_control[d] || { view:false, control:false };
    onChange({ ...perms, deck_control: { ...deck_control, [d]: { ...cur, [field]: !cur[field] } } });
  };
  const toggleAction = (k) => {
    const next = deck_actions.includes(k) ? deck_actions.filter(x=>x!==k) : [...deck_actions, k];
    onChange({ ...perms, deck_actions: next });
  };
  const togglePl = (k) => {
    const next = playlist_perms.includes(k) ? playlist_perms.filter(x=>x!==k) : [...playlist_perms, k];
    onChange({ ...perms, playlist_perms: next });
  };
  const toggleFeature = (k) => onChange({ ...perms, [k]: !perms[k] });

  const chip = (active, onClick, label, accentCol) => (
    <button key={label} onClick={onClick} style={{
      padding:'0.2rem 0.6rem', borderRadius:'99px', fontSize:'0.75rem', fontWeight:'600',
      border:`1px solid ${active ? `${accentCol}50` : 'var(--panel-border)'}`,
      background: active ? `${accentCol}15` : 'transparent',
      color: active ? accentCol : TXS, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
    }}>{label}</button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.2rem' }}>
      {/* Decks */}
      <div>
        <span style={LBL}>Allowed Decks</span>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {DECK_IDS.map(d => chip(
            allowed_decks.includes(d), () => toggleDeck(d), DECK_LABELS[d], 'var(--accent-blue)'
          ))}
        </div>
      </div>
      {/* Deck Control */}
      <div>
        <span style={LBL}>Deck View / Control</span>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'0.5rem' }}>
          {DECK_IDS.map(d => {
            const cfg = deck_control[d] || {};
            const isAllowed = allowed_decks.includes(d);
            return (
              <div key={d} style={{
                padding:'0.5rem 0.7rem', borderRadius:'8px',
                border:'1px solid var(--panel-border)',
                background: isAllowed ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                opacity: isAllowed ? 1 : 0.4,
              }}>
                <div style={{ fontSize:'0.78rem', fontWeight:'600', marginBottom:'0.35rem' }}>{DECK_LABELS[d]}</div>
                <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap' }}>
                  {chip(cfg.view,    () => isAllowed && toggleDeckCtrl(d,'view'),    'View',    '#ffd700')}
                  {chip(cfg.control, () => isAllowed && toggleDeckCtrl(d,'control'), 'Control', 'var(--accent-blue)')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Deck Actions */}
      <div>
        <span style={LBL}>Deck Actions</span>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {DECK_ACTION_DEFS.map(a => chip(
            deck_actions.includes(a.key), () => toggleAction(a.key), a.label, 'var(--accent-blue)'
          ))}
        </div>
      </div>
      {/* Playlist Permissions */}
      <div>
        <span style={LBL}>Playlist Permissions</span>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {PLAYLIST_PERM_DEFS.map(p => chip(
            playlist_perms.includes(p.key), () => togglePl(p.key), p.label, '#2ed573'
          ))}
        </div>
      </div>
      {/* Feature Permissions */}
      <div>
        <span style={LBL}>Feature Access</span>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
          {FEATURE_DEFS.map(f => (
            <label key={f.key} style={{
              display:'flex', alignItems:'center', gap:'0.7rem', cursor:'pointer',
              padding:'0.5rem 0.7rem', borderRadius:'8px',
              border:`1px solid ${perms[f.key] ? 'rgba(0,212,255,0.25)' : 'var(--panel-border)'}`,
              background: perms[f.key] ? 'rgba(0,212,255,0.05)' : 'transparent',
              transition:'all 0.15s',
            }}>
              <input type="checkbox" checked={!!perms[f.key]} onChange={() => toggleFeature(f.key)}
                style={{ accentColor:'var(--accent-blue)', width:'14px', height:'14px' }}/>
              <span style={{ color: perms[f.key] ? 'white' : TXS, fontSize:'0.83rem', fontWeight:'500' }}>
                {f.icon} {f.label}
              </span>
              <span style={{ fontSize:'0.72rem', color:TXS, marginLeft:'auto' }}>{f.desc}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type='info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  const toast = {
    success: (m) => add(m, 'success'),
    error:   (m) => add(m, 'error'),
    info:    (m) => add(m, 'info'),
  };
  return { toasts, toast };
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:9999, display:'flex', flexDirection:'column', gap:'0.5rem', pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding:'0.7rem 1.1rem', borderRadius:'10px', fontSize:'0.85rem', fontWeight:'600',
          backdropFilter:'blur(12px)',
          background: t.type==='success' ? 'rgba(46,213,115,0.15)' : t.type==='error' ? 'rgba(255,71,87,0.15)' : 'rgba(0,212,255,0.12)',
          border:`1px solid ${t.type==='success' ? 'rgba(46,213,115,0.4)' : t.type==='error' ? 'rgba(255,71,87,0.4)' : 'rgba(0,212,255,0.3)'}`,
          color: t.type==='success' ? '#2ed573' : t.type==='error' ? '#ff4757' : 'var(--accent-blue)',
          boxShadow:'0 4px 20px rgba(0,0,0,0.4)', pointerEvents:'auto',
          animation:'fadeIn 0.2s ease',
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { currentUser, api } = useApp();
  const { toasts, toast } = useToast();

  const isSuper = currentUser?.is_super_admin;
  const isAdmin = currentUser?.role === 'admin' || isSuper;

  // State
  const [users,    setUsers]    = useState([]);
  const [roles,    setRoles]    = useState([]);
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [tab,      setTab]      = useState('users'); // 'users' | 'logs'

  // Modals
  const [showUserForm, setShowUserForm] = useState(false); // false | 'add' | 'edit'
  const [editTarget,   setEditTarget]   = useState(null);
  const [userForm,     setUserForm]     = useState(EMPTY_USER_FORM);
  const [pwModal,      setPwModal]      = useState(null);
  const [pwForm,       setPwForm]       = useState({ password:'', confirm:'' });
  const [pwVisible,    setPwVisible]    = useState(false);
  const [permModal,    setPermModal]    = useState(null);
  const [perms,        setPerms]        = useState(DEFAULT_PERMS);
  const [permSaving,   setPermSaving]   = useState(false);

  // Filter
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all'); // 'all' | 'local' | 'ldap'

  // ── Data Fetchers ─────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      const [uRes, rRes] = await Promise.all([
        api.authFetch('/api/users'),
        api.authFetch('/api/roles'),
      ]);
      const uData = await uRes.json().catch(() => []);
      const rData = await rRes.json().catch(() => []);

      // Attach permissions to each user
      const usersWithPerms = await Promise.all(
        (Array.isArray(uData) ? uData : []).map(async (u) => {
          try {
            const pRes = await api.authFetch(`/api/users/${u.id}/permissions`);
            if (pRes.ok) u.permissions = await pRes.json();
          } catch {}
          return u;
        })
      );
      setUsers(usersWithPerms);
      setRoles(Array.isArray(rData) ? rData : (rData.roles || []));
    } catch (e) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadLogs = useCallback(async () => {
    try {
      const res  = await api.authFetch('/api/logs?limit=150');
      const data = await res.json().catch(() => []);
      setLogs(Array.isArray(data) ? data : []);
    } catch {}
  }, [api]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  // ── Filtered Users ────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
    const matchSrc = filterSource === 'all' || u.source === filterSource;
    return matchQ && matchSrc;
  });

  // Separate LDAP pending users from others
  const pendingLdap = filteredUsers.filter(u => u.source === 'ldap' && u.role === 'pending');
  const activeUsers = filteredUsers.filter(u => !(u.source === 'ldap' && u.role === 'pending'));

  // ── User Actions ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null);
    setUserForm(EMPTY_USER_FORM);
    setShowUserForm('add');
  };

  const openEdit = (u) => {
    if ((u.is_super_admin || u.role === 'super_admin') && !isSuper) {
      toast.error('Only a super-admin can modify another super-admin account');
      return;
    }
    setEditTarget(u);
    setUserForm({ username: u.username, display_name: u.display_name || '', password: '', role: u.role || 'viewer' });
    setShowUserForm('edit');
  };

  const handleSaveUser = async () => {
    if (showUserForm === 'add') {
      if (!userForm.username.trim()) { toast.error('Username required'); return; }
      if (userForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
      setSaving(true);
      try {
        const res = await api.authFetch('/api/users', {
          method:'POST',
          body: JSON.stringify({ username: userForm.username.trim(), display_name: userForm.display_name || userForm.username.trim(), password: userForm.password, role: userForm.role }),
        });
        if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed to create user'); }
        toast.success(`User @${userForm.username} created`);
        setShowUserForm(false);
        await loadUsers();
      } catch(e) { toast.error(e.message); }
      finally { setSaving(false); }
    } else {
      if ((editTarget?.is_super_admin || editTarget?.role === 'super_admin') && (userForm.role || userForm.enabled !== undefined)) {
        if (!isSuper) { toast.error('Only a super-admin can change super-admin account details'); return; }
      }
      setSaving(true);
      try {
        const body = {};
        if (userForm.display_name !== editTarget.display_name) body.display_name = userForm.display_name;
        if (userForm.role !== editTarget.role) body.role = userForm.role;
        if (userForm.password?.length >= 6) body.password = userForm.password;
        if (!Object.keys(body).length) { toast.info('No changes'); setShowUserForm(false); return; }
        const res = await api.authFetch(`/api/users/${editTarget.id}`, { method:'PUT', body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed to update user'); }
        toast.success(`@${editTarget.username} updated`);
        setShowUserForm(false);
        await loadUsers();
      } catch(e) { toast.error(e.message); }
      finally { setSaving(false); }
    }
  };

  const toggleEnabled = async (u) => {
    if (u.is_super_admin || u.role === 'super_admin') { toast.error('Super-admin status cannot be changed'); return; }
    try {
      const res = await api.authFetch(`/api/users/${u.id}`, { method:'PUT', body: JSON.stringify({ enabled: !u.enabled }) });
      if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed'); }
      await loadUsers();
    } catch(e) { toast.error(e.message); }
  };

  const handleDeleteUser = async (u) => {
    if (u.is_super_admin || u.role === 'super_admin') { toast.error('Super-admin accounts cannot be deleted'); return; }
    if (!window.confirm(`Delete @${u.username}? This cannot be undone.`)) return;
    setDeleting(u.id);
    try {
      const res = await api.authFetch(`/api/users/${u.id}`, { method:'DELETE' });
      if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed to delete'); }
      toast.success(`Deleted @${u.username}`);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setDeleting(null); }
  };

  const handleChangePw = async () => {
    if (pwForm.password.length < 6) { toast.error('Password min 6 chars'); return; }
    if (pwForm.password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      const res = await api.authFetch(`/api/users/${pwModal.id}`, { method:'PUT', body: JSON.stringify({ password: pwForm.password }) });
      if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed'); }
      toast.success(`Password changed for @${pwModal.username}`);
      setPwModal(null);
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const openPerms = async (u) => {
    if (u.is_super_admin || u.role === 'super_admin') { toast.error('Super-admin permissions are fixed and cannot be edited'); return; }
    try {
      const res = await api.authFetch(`/api/users/${u.id}/permissions`);
      const p = res.ok ? await res.json() : { ...DEFAULT_PERMS };
      setPerms({ ...DEFAULT_PERMS, ...p });
      setPermModal(u);
    } catch(e) { toast.error('Failed to load permissions'); }
  };

  const savePerms = async () => {
    setPermSaving(true);
    const allowed_decks = (perms.allowed_decks || DECK_IDS).filter(d => DECK_IDS.includes(d));
    try {
      const res = await api.authFetch(`/api/users/${permModal.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ ...perms, allowed_decks }),
      });
      if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed'); }
      toast.success(`Permissions saved for @${permModal.username}`);
      setPermModal(null);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setPermSaving(false); }
  };

  const applyRoleTemplate = async (u) => {
    if (u.is_super_admin || u.role === 'super_admin') return;
    if (!window.confirm(`Reset @${u.username}'s permissions to the "${u.role}" role defaults?`)) return;
    try {
      const res = await api.authFetch(`/api/users/${u.id}/apply-role-template`, { method:'POST', body: JSON.stringify({ role_name: u.role }) });
      if (!res.ok) { const d = await res.json().catch(()=>{}); throw new Error(d?.detail || 'Failed'); }
      toast.success(`Permissions reset to ${u.role} defaults`);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
  };

  // ── Render User Card ──────────────────────────────────────────────────────
  const renderUserRow = (u, isPending) => {
    const isSelf          = u.id === currentUser?.id;
    const isSuperUser     = u.is_super_admin || u.role === 'super_admin';
    const isLdap          = u.source === 'ldap';
    const canEdit         = isSelf || (isSuperUser ? isSuper : isAdmin);
    const canAdminOps     = isAdmin && !isSelf && !isSuperUser;
    const canSuperOps     = isSuper && isSuperUser && !isSelf;
    const roleColor       = isSuperUser ? ROLE_COLORS.super_admin : (ROLE_COLORS[u.role] || ROLE_COLORS.viewer);
    const initials        = (u.display_name || u.username || '?').charAt(0).toUpperCase();

    return (
      <div key={u.id} style={{
        display:'flex', alignItems:'center', gap:'1rem', padding:'0.9rem 1.1rem',
        borderRadius:'12px', border:`1px solid ${isPending ? 'rgba(147,51,234,0.3)' : 'var(--panel-border)'}`,
        background: isPending ? 'rgba(147,51,234,0.04)' : isSuperUser ? 'rgba(220,38,38,0.04)' : 'rgba(255,255,255,0.02)',
        opacity: u.enabled ? 1 : 0.5, transition:'all 0.15s', flexWrap:'wrap',
      }}
        onMouseEnter={e => e.currentTarget.style.background = isPending ? 'rgba(147,51,234,0.07)' : isSuperUser ? 'rgba(220,38,38,0.07)' : 'rgba(255,255,255,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background = isPending ? 'rgba(147,51,234,0.04)' : isSuperUser ? 'rgba(220,38,38,0.04)' : 'rgba(255,255,255,0.02)'}
      >
        {/* Avatar */}
        <div style={{
          width:'40px', height:'40px', borderRadius:'50%', flexShrink:0,
          background: `${roleColor}20`, border: `2px solid ${roleColor}50`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'1rem', fontWeight:'700', color: roleColor,
        }}>{initials}</div>

        {/* Identity */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
            <span style={{ fontWeight:'600', fontSize:'0.9rem' }}>
              {u.display_name || u.username}
            </span>
            {isSelf && <span style={{ fontSize:'0.7rem', color:TXS, padding:'0.1rem 0.4rem', border:'1px solid var(--panel-border)', borderRadius:'99px' }}>you</span>}
            {isSuperUser && <span title="Super-admin: immutable account"><Star size={12} color="#ffd700" fill="#ffd700"/></span>}
          </div>
          <div style={{ fontSize:'0.78rem', color:TXS }}>@{u.username}</div>
          {u.email && <div style={{ fontSize:'0.72rem', color:TXS }}>{u.email}</div>}
        </div>

        {/* Role Badge */}
        <div style={{ flexShrink:0 }}>
          <RoleBadge role={u.role} isSuperAdmin={u.is_super_admin} source={u.source}/>
        </div>

        {/* Status */}
        <div style={{ flexShrink:0 }}>
          {isSuperUser ? (
            <span style={{ fontSize:'0.75rem', color:'#ffd700', fontWeight:'600' }}>● Always Active</span>
          ) : canAdminOps ? (
            <button onClick={() => toggleEnabled(u)} style={{
              padding:'0.2rem 0.65rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'600',
              cursor:'pointer', fontFamily:'inherit',
              background: u.enabled ? 'rgba(46,213,115,0.12)' : 'rgba(255,255,255,0.05)',
              border: u.enabled ? '1px solid rgba(46,213,115,0.35)' : '1px solid var(--panel-border)',
              color: u.enabled ? '#2ed573' : TXS,
            }}>
              {u.enabled ? <><Check size={10}/> Active</> : <><X size={10}/> Disabled</>}
            </button>
          ) : (
            <span style={{ fontSize:'0.8rem', color: u.enabled ? '#2ed573' : TXS }}>
              {u.enabled ? '● Active' : '○ Disabled'}
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
          {/* Edit user */}
          {canEdit && !isSuperUser && (
            <button onClick={() => openEdit(u)} style={mkBtn('blue')} title="Edit user">
              <Edit2 size={12}/>
            </button>
          )}
          {/* Change password — local accounts only */}
          {canEdit && u.source === 'local' && (
            <button onClick={() => { setPwModal(u); setPwForm({ password:'', confirm:'' }); setPwVisible(false); }}
              style={mkBtn('amber')} title="Change password">
              <Key size={12}/>
            </button>
          )}
          {/* Edit permissions — non-super-admin targets */}
          {isAdmin && !isSelf && !isSuperUser && (
            <button onClick={() => openPerms(u)} style={mkBtn('purple')} title="Edit permissions">
              <Lock size={12}/>
            </button>
          )}
          {/* Reset to role defaults */}
          {isAdmin && !isSelf && !isSuperUser && (
            <button onClick={() => applyRoleTemplate(u)} style={mkBtn('gray')} title="Reset to role defaults">
              <RotateCcw size={12}/>
            </button>
          )}
          {/* Delete — not for super-admin, not for self */}
          {!isSelf && !isSuperUser && (isAdmin) && (
            <button onClick={() => handleDeleteUser(u)} disabled={deleting === u.id}
              style={{ ...mkBtn('red'), opacity: deleting===u.id ? 0.4 : 1 }} title="Delete user">
              <Trash2 size={12}/>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Page Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:'1100px', margin:'0 auto' }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <ToastContainer toasts={toasts}/>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.8rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 style={{ fontSize:'1.6rem', fontWeight:'700', margin:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <Users size={24} color="var(--accent-blue)"/> User Manager
          </h1>
          <p style={{ margin:'0.3rem 0 0', color:TXS, fontSize:'0.85rem' }}>
            Manage access and permissions for CocoStation users
          </p>
        </div>
        <div style={{ display:'flex', gap:'0.6rem' }}>
          <button onClick={() => { setLoading(true); loadUsers(); }} style={mkBtn('gray')} title="Refresh">
            <RefreshCw size={14}/>
          </button>
          {isAdmin && (
            <button onClick={openAdd} style={{ ...mkBtn('blue'), padding:'0.45rem 1rem', fontSize:'0.85rem' }}>
              <Plus size={14}/> Add User
            </button>
          )}
        </div>
      </div>

      {/* LDAP pending banner */}
      {pendingLdap.length > 0 && (
        <div style={{
          display:'flex', alignItems:'flex-start', gap:'0.8rem', padding:'0.9rem 1.1rem',
          borderRadius:'12px', background:'rgba(147,51,234,0.08)', border:'1px solid rgba(147,51,234,0.3)',
          marginBottom:'1.2rem',
        }}>
          <AlertTriangle size={18} color="#a55eea" style={{ flexShrink:0, marginTop:'0.1rem' }}/>
          <div>
            <div style={{ fontWeight:'700', color:'#a55eea', fontSize:'0.9rem', marginBottom:'0.2rem' }}>
              {pendingLdap.length} LDAP user{pendingLdap.length>1?'s':''} awaiting role assignment
            </div>
            <div style={{ fontSize:'0.8rem', color:TXS }}>
              These domain users logged in and have been provisioned with <strong>no access</strong>. Assign them a role below to grant access.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.2rem' }}>
        {[
          { id:'users', label:'Users', icon:<Users size={14}/> },
          { id:'logs',  label:'Activity Log', icon:<Activity size={14}/> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'0.5rem 1rem', borderRadius:'8px', fontSize:'0.83rem', fontWeight:'600',
            cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.4rem',
            border: tab===t.id ? '1px solid rgba(0,212,255,0.4)' : '1px solid var(--panel-border)',
            background: tab===t.id ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
            color: tab===t.id ? 'var(--accent-blue)' : TXS,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          {/* Filters */}
          <div style={{ display:'flex', gap:'0.7rem', marginBottom:'1rem', flexWrap:'wrap' }}>
            <input
              placeholder="Search users…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...INPUT, width:'220px', padding:'0.5rem 0.8rem' }}
            />
            <div style={{ display:'flex', gap:'0.3rem' }}>
              {['all','local','ldap'].map(s => (
                <button key={s} onClick={() => setFilterSource(s)} style={{
                  padding:'0.4rem 0.75rem', borderRadius:'8px', fontSize:'0.8rem', fontWeight:'600',
                  cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize',
                  border: filterSource===s ? '1px solid rgba(0,212,255,0.4)' : '1px solid var(--panel-border)',
                  background: filterSource===s ? 'rgba(0,212,255,0.08)' : 'transparent',
                  color: filterSource===s ? 'var(--accent-blue)' : TXS,
                }}>{s === 'ldap' ? '🔗 LDAP' : s === 'local' ? '💻 Local' : 'All'}</button>
              ))}
            </div>
            <span style={{ fontSize:'0.8rem', color:TXS, lineHeight:'2.2', marginLeft:'auto' }}>
              {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'3rem', color:TXS }}>Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', color:TXS }}>
              {search ? 'No users match your search.' : 'No users found.'}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {/* Pending LDAP section */}
              {pendingLdap.length > 0 && (
                <>
                  <div style={{ fontSize:'0.78rem', fontWeight:'700', color:'#a55eea', textTransform:'uppercase', letterSpacing:'0.8px', padding:'0.4rem 0', marginTop:'0.3rem' }}>
                    🕐 Pending Authorization
                  </div>
                  {pendingLdap.map(u => renderUserRow(u, true))}
                  <div style={{ borderBottom:'1px solid var(--panel-border)', margin:'0.5rem 0' }}/>
                </>
              )}
              {/* Active users */}
              {activeUsers.map(u => renderUserRow(u, false))}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <span style={{ fontSize:'0.85rem', color:TXS }}>Recent activity (last 150 events)</span>
            <button onClick={loadLogs} style={mkBtn('gray')}><RefreshCw size={12}/> Refresh</button>
          </div>
          {logs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', color:TXS }}>No activity logged yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
              {logs.map(l => (
                <div key={l.id} style={{
                  display:'flex', alignItems:'center', gap:'0.8rem', padding:'0.65rem 1rem',
                  borderRadius:'8px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--panel-border)',
                  fontSize:'0.8rem',
                }}>
                  <span style={{ fontSize:'1rem', flexShrink:0 }}>{ACTION_ICONS[l.action] || '📋'}</span>
                  <span style={{ color:TXS, flexShrink:0, whiteSpace:'nowrap', fontSize:'0.75rem' }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                  </span>
                  <span style={{ fontWeight:'600' }}>@{l.username}</span>
                  <span style={{ color:TXS }}>{l.action}</span>
                  {l.ip_address && <span style={{ color:TXS, marginLeft:'auto', fontSize:'0.72rem', whiteSpace:'nowrap' }}>{l.ip_address}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Add / Edit User Modal ══════════════════════════════════════════════ */}
      {showUserForm && (
        <Modal title={showUserForm==='add' ? '➕ Add User' : `✏️ Edit @${editTarget?.username}`} onClose={() => setShowUserForm(false)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {showUserForm === 'add' && (
              <div>
                <span style={LBL}>Username</span>
                <input style={INPUT} placeholder="e.g. john.doe" value={userForm.username}
                  onChange={e => setUserForm(p => ({ ...p, username: e.target.value }))}/>
              </div>
            )}
            <div>
              <span style={LBL}>Display Name</span>
              <input style={INPUT} placeholder="John Doe" value={userForm.display_name}
                onChange={e => setUserForm(p => ({ ...p, display_name: e.target.value }))}/>
            </div>
            {showUserForm === 'add' && (
              <div>
                <span style={LBL}>Password</span>
                <input style={INPUT} type="password" placeholder="Min 6 characters" value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}/>
              </div>
            )}
            {isAdmin && !(editTarget?.is_super_admin || editTarget?.role === 'super_admin') && (
              <div>
                <span style={LBL}>Role</span>
                <select style={{ ...INPUT, appearance:'none' }} value={userForm.role}
                  onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}>
                  {roles
                    .filter(r => isSuper || !['super_admin'].includes(r.name))
                    .map(r => <option key={r.name} value={r.name}>{r.display_name || r.name}</option>)
                  }
                </select>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.6rem', marginTop:'0.5rem' }}>
              <button onClick={() => setShowUserForm(false)} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleSaveUser} disabled={saving} style={mkBtn('blue')}>
                {saving ? '⟳ Saving…' : <><Check size={13}/> {showUserForm==='add' ? 'Create User' : 'Save Changes'}</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Change Password Modal ══════════════════════════════════════════════ */}
      {pwModal && (
        <Modal title={`🔑 Change Password — @${pwModal.username}`} onClose={() => setPwModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <span style={LBL}>New Password</span>
              <div style={{ position:'relative' }}>
                <input style={{ ...INPUT, paddingRight:'2.5rem' }} type={pwVisible ? 'text' : 'password'}
                  placeholder="Min 6 characters" value={pwForm.password}
                  onChange={e => setPwForm(p => ({ ...p, password: e.target.value }))}/>
                <button onClick={() => setPwVisible(v => !v)} style={{
                  position:'absolute', right:'0.7rem', top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', color:TXS, padding:0,
                }}>
                  {pwVisible ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
            <div>
              <span style={LBL}>Confirm Password</span>
              <input style={INPUT} type={pwVisible ? 'text' : 'password'} placeholder="Repeat password"
                value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}/>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.6rem', marginTop:'0.5rem' }}>
              <button onClick={() => setPwModal(null)} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleChangePw} disabled={saving} style={mkBtn('amber')}>
                {saving ? '⟳ Saving…' : <><Key size={13}/> Change Password</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Permissions Modal ══════════════════════════════════════════════════ */}
      {permModal && (
        <Modal title={`🔐 Permissions — @${permModal.username}`} onClose={() => setPermModal(null)} wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1.2rem' }}>
            <div style={{ padding:'0.7rem 1rem', borderRadius:'8px', background:'rgba(0,212,255,0.06)', border:'1px solid rgba(0,212,255,0.2)', fontSize:'0.8rem', color:TXS }}>
              Customise <strong style={{ color:'white' }}>@{permModal.username}</strong>'s granular permissions. These override the role defaults.
            </div>
            <PermissionEditor perms={perms} onChange={setPerms}/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.6rem', marginTop:'0.5rem' }}>
              <button onClick={() => setPermModal(null)} style={mkBtn('gray')}>Cancel</button>
              <button onClick={savePerms} disabled={permSaving} style={mkBtn('blue')}>
                {permSaving ? '⟳ Saving…' : <><Check size={13}/> Save Permissions</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
