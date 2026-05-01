import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Edit2, Trash2, Key, Star,
  Check, X, RefreshCw, Lock, Activity, Sliders, Mic2, Calendar,
  FolderOpen, Settings2, Music2, Eye, EyeOff, Play, Square,
  SkipForward, Volume2, ListMusic, Crosshair, Layers,
  RotateCcw, Link2,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ──────────────────────────────────────────────────────────────
const DECK_IDS    = ['a', 'b', 'c', 'd'];
const DECK_LABELS = { a: 'Deck A', b: 'Deck B', c: 'Deck C', d: 'Deck D' };

const FEATURE_DEFS = [
  { key: 'can_announce', label: 'Announcements', icon: <Mic2   size={13}/>, desc: 'Play & manage announcements' },
  { key: 'can_schedule', label: 'Schedules',     icon: <Calendar size={13}/>, desc: 'Create & manage schedules' },
  { key: 'can_library',  label: 'Library',       icon: <FolderOpen size={13}/>, desc: 'Upload & delete tracks' },
  { key: 'can_requests', label: 'Requests',      icon: <Music2  size={13}/>, desc: 'Handle song requests' },
  { key: 'can_settings', label: 'Settings',      icon: <Settings2 size={13}/>, desc: 'Access station settings' },
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
  login:                 '🔑',
  login_failed:          '🚫',
  logout:                '🚪',
  token_refresh:         '🔄',
  'user.create':         '➕',
  'user.update':         '✏️',
  'user.delete':         '🗑️',
  'user.disable':        '🔴',
  'user.enable':         '🟢',
  'user.permissions':    '🔒',
  'role.create':         '🎭',
  'role.update':         '✏️',
  'role.delete':         '🗑️',
  'deck.play':           '▶️',
  'deck.stop':           '⏹️',
  'deck.pause':          '⏸️',
  'deck.load_track':     '📂',
  'deck.load_playlist':  '🎵',
  'deck.volume':         '🔊',
  'deck.load':           '📂',
  'mic.on':              '🎙️',
  'mic.off':             '🎙️',
  'announcement.play':   '📢',
  'library.upload':      '⬆️',
  'library.delete':      '🗑️',
  'settings.update':     '⚙️',
  'settings.ldap_save':  '🔐',
};

const DEFAULT_DECK_CONTROL   = { a:{view:true,control:true}, b:{view:true,control:true}, c:{view:true,control:true}, d:{view:true,control:true} };
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

const EMPTY_USER_FORM = { username:'', display_name:'', password:'', role:'operator' };
const EMPTY_ROLE_FORM = {
  name:'', display_name:'', description:'', color:'#2563EB',
  default_allowed_decks: DECK_IDS,
  default_deck_control: DEFAULT_DECK_CONTROL,
  default_deck_actions: DEFAULT_DECK_ACTIONS,
  default_playlist_perms: DEFAULT_PLAYLIST_PERMS,
  default_can_announce: true, default_can_schedule: true, default_can_library: true,
  default_can_requests: true, default_can_settings: false,
};

const SYSTEM_COLORS = { super_admin:'#DC2626', admin:'#D97706', operator:'#2563EB', viewer:'#6B7280' };

// ── Shared styles ──────────────────────────────────────────────────────────
const INP_STYLE = {
  width:'100%', padding:'0.65rem 0.9rem', borderRadius:'8px',
  background:'rgba(0,0,0,0.3)', color:'white', border:'1px solid var(--panel-border)',
  fontFamily:'inherit', fontSize:'0.9rem', outline:'none', boxSizing:'border-box',
};
const LBL_STYLE = {
  display:'block', fontSize:'0.74rem', color:'var(--text-secondary)',
  textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'0.4rem',
};

const PALETTE = {
  blue:   { bg:'rgba(0,212,255,0.12)',  bd:'rgba(0,212,255,0.35)',  tx:'var(--accent-blue)' },
  green:  { bg:'rgba(46,213,115,0.12)', bd:'rgba(46,213,115,0.40)', tx:'#2ed573' },
  red:    { bg:'rgba(255,71,87,0.10)',  bd:'rgba(255,71,87,0.35)',  tx:'#ff4757' },
  amber:  { bg:'rgba(253,150,68,0.10)', bd:'rgba(253,150,68,0.35)', tx:'#fd9644' },
  purple: { bg:'rgba(165,94,234,0.10)', bd:'rgba(165,94,234,0.35)', tx:'#a55eea' },
  gray:   { bg:'rgba(255,255,255,0.04)', bd:'var(--panel-border)',   tx:'var(--text-secondary)' },
};
function mkBtn(color='blue', extra={}) {
  const s = PALETTE[color] || PALETTE.blue;
  return {
    padding:'0.38rem 0.8rem', borderRadius:'7px', border:`1px solid ${s.bd}`,
    background:s.bg, color:s.tx, cursor:'pointer', fontSize:'0.8rem',
    display:'inline-flex', alignItems:'center', gap:'0.32rem',
    fontFamily:'inherit', ...extra,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',
        zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'rgba(18,18,26,0.98)', border:'1px solid var(--panel-border)',
        borderRadius:'14px', padding:'1.75rem', width:'100%', maxWidth: wide ? '700px':'490px',
        boxShadow:'0 24px 64px rgba(0,0,0,0.75)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:'600', margin:0 }}>{title}</h3>
          <button onClick={onClose}
            style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.1rem', padding:'2px 6px', borderRadius:'4px' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoleBadge({ role, isSuperAdmin, roles }) {
  const roleObj  = roles?.find(r => r.name === role);
  const color    = roleObj?.color || SYSTEM_COLORS[role] || '#6B7280';
  const label    = roleObj?.display_name || role;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
      <span style={{
        display:'inline-flex', alignItems:'center', gap:'0.3rem',
        padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'600',
        background:`${color}18`, border:`1px solid ${color}55`, color,
      }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block' }}/>
        {label}
      </span>
      {isSuperAdmin && (
        <span style={{
          display:'inline-flex', alignItems:'center', gap:'0.25rem',
          padding:'0.2rem 0.55rem', borderRadius:'20px', fontSize:'0.72rem', fontWeight:'700',
          background:'rgba(255,215,0,0.10)', border:'1px solid rgba(255,215,0,0.35)', color:'#ffd700',
        }}>
          <Star size={10} fill="#ffd700"/>SUPER
        </span>
      )}
    </div>
  );
}

function ToggleRow({ icon, label, desc, on, onChange, color='#2ed573' }) {
  return (
    <div onClick={onChange} style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0.65rem 0.9rem', borderRadius:'9px', cursor:'pointer',
      background: on ? 'rgba(46,213,115,0.05)':'rgba(255,255,255,0.02)',
      border: `1px solid ${on ? 'rgba(46,213,115,0.2)':'var(--panel-border)'}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
        <span style={{ color: on ? color:'var(--text-secondary)' }}>{icon}</span>
        <div>
          <div style={{ fontSize:'0.83rem', fontWeight:'500', color: on ? 'white':'var(--text-secondary)' }}>{label}</div>
          {desc && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>{desc}</div>}
        </div>
      </div>
      <div style={{ width:34, height:18, borderRadius:9, position:'relative',
        background: on ? color:'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0 }}>
        <div style={{ position:'absolute', top:3, left: on ? 17:3, width:12, height:12,
          borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
      </div>
    </div>
  );
}

// ── Permission Editor (shared by User Permissions modal + Role form) ────────

function PermEditor({ perms, setPerms, keyPrefix='' }) {
  const [tab, setTab] = useState('decks');

  const setDeckPerm = (deckId, level, value) => {
    setPerms(p => ({
      ...p,
      [`${keyPrefix}deck_control`]: {
        ...(p[`${keyPrefix}deck_control`] || DEFAULT_DECK_CONTROL),
        [deckId]: {
          ...(p[`${keyPrefix}deck_control`]?.[deckId] || { view:false, control:false }),
          [level]: value,
          ...(level==='control' && value  ? { view:true }    : {}),
          ...(level==='view'    && !value ? { control:false } : {}),
        },
      },
    }));
  };

  const toggleAction = (action) => {
    const key = `${keyPrefix}deck_actions`;
    setPerms(p => ({
      ...p,
      [key]: p[key]?.includes(action) ? p[key].filter(a => a!==action) : [...(p[key]||[]), action],
    }));
  };

  const togglePlaylistPerm = (perm) => {
    const key = `${keyPrefix}playlist_perms`;
    setPerms(p => ({
      ...p,
      [key]: p[key]?.includes(perm) ? p[key].filter(x => x!==perm) : [...(p[key]||[]), perm],
    }));
  };

  const dc   = perms[`${keyPrefix}deck_control`]   || DEFAULT_DECK_CONTROL;
  const da   = perms[`${keyPrefix}deck_actions`]   || [];
  const plp  = perms[`${keyPrefix}playlist_perms`] || [];

  const TABS = [
    { id:'decks',    label:'🎚 Decks' },
    { id:'actions',  label:'⚡ Actions' },
    { id:'features', label:'🧩 Features' },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--panel-border)', marginBottom:'1rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'0.5rem 1rem', background:'none', border:'none', fontFamily:'inherit',
              borderBottom: tab===t.id ? '2px solid var(--accent-blue)':'2px solid transparent',
              color: tab===t.id ? 'var(--accent-blue)':'var(--text-secondary)',
              cursor:'pointer', fontSize:'0.82rem', fontWeight: tab===t.id?'600':'400', marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Decks */}
      {tab === 'decks' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.55rem' }}>
          {DECK_IDS.map(d => {
            const cfg = dc[d] || { view:false, control:false };
            return (
              <div key={d} style={{ padding:'0.7rem 1rem', borderRadius:'10px',
                background:'rgba(0,0,0,0.15)', border:'1px solid var(--panel-border)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.45rem' }}>
                  <span style={{ fontWeight:'600', fontSize:'0.87rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <Sliders size={14} color={cfg.control ? 'var(--accent-blue)' : cfg.view ? '#ffd700':'rgba(255,255,255,0.25)'}/>
                    {DECK_LABELS[d]}
                  </span>
                  <span style={{ fontSize:'0.7rem', color: cfg.control?'var(--accent-blue)':cfg.view?'#ffd700':'rgba(255,255,255,0.25)' }}>
                    {cfg.control ? '🎛 Control' : cfg.view ? '👁 View only':'🚫 No access'}
                  </span>
                </div>
                <div style={{ display:'flex', gap:'0.45rem' }}>
                  {[{level:'view', label:'View', color:'#ffd700'}, {level:'control', label:'Control', color:'var(--accent-blue)'}].map(({ level, label, color }) => {
                    const on = cfg[level];
                    return (
                      <button key={level} onClick={() => setDeckPerm(d, level, !on)}
                        style={{ flex:1, padding:'0.38rem 0.6rem', borderRadius:'7px', cursor:'pointer',
                          fontFamily:'inherit', fontSize:'0.78rem', display:'flex', alignItems:'center',
                          justifyContent:'center', gap:'0.3rem',
                          background: on ? `${color}14`:'rgba(255,255,255,0.03)',
                          border: `1px solid ${on ? `${color}55`:'var(--panel-border)'}`,
                          color: on ? color:'var(--text-secondary)' }}>
                        {level==='view' ? (on?<Eye size={12}/>:<EyeOff size={12}/>):<Sliders size={12}/>}
                        {label} {on?'✓':'✕'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {tab === 'actions' && (
        <>
          <label style={{ ...LBL_STYLE, marginBottom:'0.55rem' }}>Deck Actions</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem', marginBottom:'1.25rem' }}>
            {DECK_ACTION_DEFS.map(({ key, label, icon }) => {
              const on = da.includes(key);
              return (
                <button key={key} onClick={() => toggleAction(key)}
                  style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem',
                    borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                    background: on ? 'rgba(0,212,255,0.08)':'rgba(255,255,255,0.02)',
                    border: `1px solid ${on ? 'rgba(0,212,255,0.3)':'var(--panel-border)'}`,
                    color: on ? 'var(--accent-blue)':'var(--text-secondary)', fontSize:'0.8rem' }}>
                  {icon}<span style={{ flex:1 }}>{label}</span>{on && <Check size={11}/>}
                </button>
              );
            })}
          </div>
          <label style={{ ...LBL_STYLE, marginBottom:'0.55rem' }}>Playlist Permissions</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
            {PLAYLIST_PERM_DEFS.map(({ key, label }) => {
              const on = plp.includes(key);
              return (
                <button key={key} onClick={() => togglePlaylistPerm(key)}
                  style={{ padding:'0.38rem 0.8rem', borderRadius:'20px', cursor:'pointer',
                    fontFamily:'inherit', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'0.3rem',
                    background: on ? 'rgba(165,94,234,0.12)':'rgba(255,255,255,0.03)',
                    border: `1px solid ${on ? 'rgba(165,94,234,0.4)':'var(--panel-border)'}`,
                    color: on ? '#a55eea':'var(--text-secondary)' }}>
                  {on && <Check size={10}/>}{label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Features */}
      {tab === 'features' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {FEATURE_DEFS.map(({ key, label, icon, desc }) => {
            const resolvedKey = keyPrefix ? `${keyPrefix}${key}`.replace('default_can_', 'default_can_') : key;
            return (
              <ToggleRow key={key} icon={icon} label={label} desc={desc}
                on={!!perms[resolvedKey]}
                onChange={() => setPerms(p => ({ ...p, [resolvedKey]: !p[resolvedKey] }))}/>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── LDAP Group Mapping Panel ───────────────────────────────────────────────

function LdapGroupMappingPanel({ roles, api, toast, isAdmin }) {
  const [mappings,      setMappings]      = useState({});
  const [ldapGroups,    setLdapGroups]    = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [expanded,      setExpanded]      = useState(true);
  const [manualInput,   setManualInput]   = useState('');
  const [ldapEnabled,   setLdapEnabled]   = useState(false);
  const [groupSearch,   setGroupSearch]   = useState('');

  useEffect(() => {
    loadMappings();
    fetchLdapGroups();
  }, []); // eslint-disable-line

  const loadMappings = async () => {
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings');
      if (r.ok) {
        const data = await r.json();
        setMappings(data.mappings || data || {});
        setLdapEnabled(data.ldap_enabled ?? true);
      }
    } catch (_) {}
  };

  const fetchLdapGroups = async () => {
    setGroupsLoading(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/info');
      if (r.ok) {
        const data = await r.json();
        setLdapGroups(data.groups || []);
        setLdapEnabled(!data.error);
      }
    } catch (_) {}
    finally { setGroupsLoading(false); }
  };

  const toggleGroup = (roleName, group) => {
    setMappings(prev => {
      const current = prev[roleName] || [];
      const updated = current.includes(group)
        ? current.filter(g => g !== group)
        : [...current, group];
      return { ...prev, [roleName]: updated };
    });
  };

  const addManualGroup = (roleName) => {
    const g = manualInput.trim();
    if (!g) return;
    setMappings(prev => {
      const current = prev[roleName] || [];
      if (current.includes(g)) return prev;
      return { ...prev, [roleName]: [...current, g] };
    });
    setManualInput('');
  };

  const removeGroup = (roleName, group) => {
    setMappings(prev => ({
      ...prev,
      [roleName]: (prev[roleName] || []).filter(g => g !== group),
    }));
  };

  const saveMappings = async () => {
    setSaving(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      toast.success('LDAP group mappings saved!');
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalMappings = Object.values(mappings).reduce((acc, arr) => acc + (arr?.length || 0), 0);

  return (
    <div className="glass-panel" style={{ padding:'1.25rem', marginBottom:'1.5rem' }}>
      {/* Header */}
      <div
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
          <Link2 size={16} color="#a55eea"/>
          <div>
            <div style={{ fontSize:'0.95rem', fontWeight:'600', color:'white', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              LDAP Group → Role Mapping
              {totalMappings > 0 && (
                <span style={{ fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'10px',
                  background:'rgba(165,94,234,0.15)', border:'1px solid rgba(165,94,234,0.3)', color:'#a55eea' }}>
                  {totalMappings} group{totalMappings !== 1 ? 's':''} mapped
                </span>
              )}
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.1rem' }}>
              Automatically assign roles to LDAP users based on their directory groups
            </div>
          </div>
        </div>
        <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop:'1.25rem' }}>

          {/* LDAP not enabled notice */}
          {!ldapEnabled && (
            <div style={{ padding:'0.75rem 1rem', borderRadius:'8px', marginBottom:'1rem',
              background:'rgba(253,150,68,0.08)', border:'1px solid rgba(253,150,68,0.3)',
              fontSize:'0.82rem', color:'#fd9644', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              ⚠ LDAP is not enabled or unreachable. You can still pre-configure mappings — they take effect once LDAP is active.
            </div>
          )}

          {/* Info row */}
          <div style={{ padding:'0.6rem 0.9rem', borderRadius:'8px', marginBottom:'1.25rem',
            background:'rgba(165,94,234,0.06)', border:'1px solid rgba(165,94,234,0.15)',
            fontSize:'0.78rem', color:'var(--text-secondary)' }}>
            📌 When a user logs in via LDAP, their groups are checked against this mapping. The first matching role is assigned.
            If no group matches, the user gets the <strong style={{ color:'white' }}>default operator role</strong>.
          </div>

          {/* Groups loading */}
          {groupsLoading && (
            <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'1rem' }}>
              ⟳ Loading LDAP groups…
            </div>
          )}

          {/* Per-role mapping rows */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {roles.map(role => {
              const selected  = mappings[role.name] || [];
              const roleColor = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
              const available = ldapGroups.filter(g => !selected.includes(g));

              return (
                <div key={role.name} style={{
                  borderRadius:'10px', border:`1px solid ${roleColor}33`,
                  background:`${roleColor}08`, overflow:'hidden',
                }}>
                  {/* Role header */}
                  <div style={{
                    padding:'0.7rem 1rem', borderBottom:`1px solid ${roleColor}22`,
                    background:`${roleColor}10`,
                    display:'flex', alignItems:'center', gap:'0.6rem',
                  }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:roleColor, flexShrink:0 }}/>
                    <span style={{ fontWeight:'600', fontSize:'0.88rem', color:roleColor }}>{role.display_name}</span>
                    <span style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>/{role.name}</span>
                    {selected.length > 0 && (
                      <span style={{ marginLeft:'auto', fontSize:'0.7rem', padding:'0.1rem 0.45rem', borderRadius:'10px',
                        background:`${roleColor}18`, border:`1px solid ${roleColor}40`, color:roleColor }}>
                        {selected.length} group{selected.length !== 1 ? 's':''}
                      </span>
                    )}
                  </div>

                  <div style={{ padding:'0.85rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                    {/* Currently mapped groups */}
                    {selected.length > 0 ? (
                      <div>
                        <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>Mapped groups</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem' }}>
                          {selected.map(g => (
                            <span key={g} style={{
                              display:'inline-flex', alignItems:'center', gap:'0.35rem',
                              padding:'0.25rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem',
                              background:`${roleColor}18`, border:`1px solid ${roleColor}45`, color:roleColor,
                            }}>
                              🗂 {g}
                              {isAdmin && (
                                <button
                                  onClick={() => removeGroup(role.name, g)}
                                  style={{ background:'none', border:'none', color:roleColor, cursor:'pointer',
                                    padding:0, fontSize:'0.75rem', lineHeight:1, opacity:0.7,
                                    display:'flex', alignItems:'center' }}
                                  title="Remove">
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.25)', fontStyle:'italic' }}>
                        No groups mapped — users in this role won't be auto-assigned via LDAP.
                      </div>
                    )}

                    {isAdmin && (
                      <>
                        {/* LDAP group listbox */}
                        {ldapGroups.length > 0 && (
                          <div>
                            <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>
                              Add from LDAP directory
                              <span style={{ marginLeft:'0.5rem', color:'rgba(255,255,255,0.25)', textTransform:'none', fontWeight:400 }}>
                                ({ldapGroups.length} groups detected)
                              </span>
                            </div>
                            {/* Group search box */}
                            {ldapGroups.length > 5 && (
                              <div style={{ marginBottom:'0.45rem', position:'relative' }}>
                                <span style={{ position:'absolute', left:'0.65rem', top:'50%', transform:'translateY(-50%)',
                                  fontSize:'0.75rem', color:'var(--text-secondary)', pointerEvents:'none' }}>🔍</span>
                                <input
                                  value={groupSearch}
                                  onChange={e => setGroupSearch(e.target.value)}
                                  placeholder="Search groups…"
                                  style={{ ...INP_STYLE, paddingLeft:'2rem', padding:'0.45rem 0.75rem 0.45rem 2rem',
                                    fontSize:'0.8rem', background:'rgba(0,0,0,0.2)' }}
                                />
                              </div>
                            )}
                            <div style={{
                              maxHeight:'150px', overflowY:'auto', borderRadius:'8px',
                              border:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.25)',
                            }}>
                              {(() => {
                                const visibleGroups = available.filter(g =>
                                  !groupSearch || g.toLowerCase().includes(groupSearch.toLowerCase())
                                );
                                if (available.length === 0) return (
                                  <div style={{ padding:'0.65rem 0.9rem', fontSize:'0.78rem', color:'var(--text-secondary)', fontStyle:'italic' }}>
                                    All detected groups already mapped to this role.
                                  </div>
                                );
                                if (visibleGroups.length === 0) return (
                                  <div style={{ padding:'0.65rem 0.9rem', fontSize:'0.78rem', color:'var(--text-secondary)', fontStyle:'italic' }}>
                                    No groups match "{groupSearch}".
                                  </div>
                                );
                                return visibleGroups.map(g => (
                                  <div key={g}
                                    onClick={() => toggleGroup(role.name, g)}
                                    style={{
                                      padding:'0.5rem 0.9rem', cursor:'pointer', fontSize:'0.82rem',
                                      display:'flex', alignItems:'center', gap:'0.5rem',
                                      borderBottom:'1px solid var(--panel-border)',
                                      transition:'background 0.12s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = `${roleColor}15`}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >
                                    <span style={{ fontSize:'0.75rem' }}>🗂</span>
                                    <span style={{ flex:1, color:'var(--text-primary)' }}>
                                      {groupSearch ? (
                                        // Highlight matching substring
                                        (() => {
                                          const idx = g.toLowerCase().indexOf(groupSearch.toLowerCase());
                                          if (idx === -1) return g;
                                          return <>{g.slice(0, idx)}<mark style={{ background:`${roleColor}35`, color:roleColor, borderRadius:'2px' }}>{g.slice(idx, idx + groupSearch.length)}</mark>{g.slice(idx + groupSearch.length)}</>;
                                        })()
                                      ) : g}
                                    </span>
                                    <span style={{ fontSize:'0.7rem', color:roleColor, opacity:0.7 }}>+ Add</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Manual entry */}
                        <div>
                          <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>Or type a group name manually</div>
                          <div style={{ display:'flex', gap:'0.5rem' }}>
                            <input
                              value={manualInput}
                              onChange={e => setManualInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') addManualGroup(role.name); }}
                              placeholder="e.g. CN=IT-Team,OU=Groups,DC=company,DC=com"
                              style={{ ...INP_STYLE, fontSize:'0.82rem', padding:'0.5rem 0.75rem' }}
                            />
                            <button
                              onClick={() => addManualGroup(role.name)}
                              style={{ ...mkBtn('purple'), whiteSpace:'nowrap', flexShrink:0 }}
                            >
                              <Plus size={12}/> Add
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          {isAdmin && (
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'1.25rem',
              paddingTop:'1rem', borderTop:'1px solid var(--panel-border)' }}>
              <button onClick={fetchLdapGroups} disabled={groupsLoading} style={mkBtn('blue')}>
                <RefreshCw size={12}/> Refresh LDAP Groups
              </button>
              <button onClick={saveMappings} disabled={saving} style={{ ...mkBtn('green'), opacity:saving?0.6:1 }}>
                {saving ? '⟳ Saving…' : <><Check size={12}/> Save Mappings</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LDAP User Mapping Panel ──────────────────────────────────────────────────

function LdapUserMappingPanel({ roles, api, toast, isAdmin }) {
  const [mappings,    setMappings]    = useState([]);  // [{ ldap_username, role, note }]
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [expanded,    setExpanded]    = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState({ ldap_username: '', role: '', note: '' });
  const [search,      setSearch]      = useState('');
  // LDAP user picker state
  const [ldapUsers,       setLdapUsers]       = useState([]);   // detected LDAP users
  const [ldapUsersLoading, setLdapUsersLoading] = useState(false);
  const [userPickerOpen,  setUserPickerOpen]  = useState(false);
  const [userPickerQuery, setUserPickerQuery] = useState('');

  useEffect(() => { loadMappings(); fetchLdapUsers(); }, []); // eslint-disable-line

  const fetchLdapUsers = async () => {
    setLdapUsersLoading(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/info');
      if (r.ok) {
        const data = await r.json();
        // API may return users under `users` or `user_list` — handle both
        setLdapUsers(data.users || data.user_list || []);
      }
    } catch (_) {}
    finally { setLdapUsersLoading(false); }
  };

  const loadMappings = async () => {
    setLoading(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/user-mappings');
      if (r.ok) {
        const data = await r.json();
        setMappings(data.user_mappings || []);
      }
    } catch (_) {}
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setForm({ ldap_username: '', role: roles[0]?.name || 'operator', note: '' });
    setUserPickerQuery('');
    setUserPickerOpen(false);
    setEditTarget(null);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ ldap_username: row.ldap_username, role: row.role, note: row.note || '' });
    setUserPickerQuery(row.ldap_username);
    setUserPickerOpen(false);
    setEditTarget(row);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.ldap_username.trim()) { toast.error('LDAP username required'); return; }
    if (!form.role)                  { toast.error('Role required'); return; }
    setSaving(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/user-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ldap_username: form.ldap_username.trim(), role: form.role, note: form.note }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      toast.success(`Mapping saved for ${form.ldap_username}`);
      setShowForm(false);
      await loadMappings();
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ldap_username) => {
    if (!window.confirm(`Remove mapping for "${ldap_username}"?`)) return;
    try {
      const r = await api.authFetch(
        `/api/settings/ldap/user-mappings/${encodeURIComponent(ldap_username)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      toast.info(`Mapping removed for ${ldap_username}`);
      await loadMappings();
    } catch (e) {
      toast.error('Delete failed: ' + e.message);
    }
  };

  const filtered = mappings.filter(m =>
    !search ||
    m.ldap_username?.toLowerCase().includes(search.toLowerCase()) ||
    m.role?.toLowerCase().includes(search.toLowerCase()) ||
    m.note?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Users size={16} color="#fd9644" />
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              LDAP User → Role Override
              {mappings.length > 0 && (
                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '10px',
                  background: 'rgba(253,150,68,0.15)', border: '1px solid rgba(253,150,68,0.3)', color: '#fd9644' }}>
                  {mappings.length} override{mappings.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
              Assign a specific role to an LDAP username, overriding group-based mapping
            </div>
          </div>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '1.25rem' }}>
          {/* Info banner */}
          <div style={{ padding: '0.6rem 0.9rem', borderRadius: '8px', marginBottom: '1.25rem',
            background: 'rgba(253,150,68,0.06)', border: '1px solid rgba(253,150,68,0.18)',
            fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            📌 Per-user overrides take priority over group-based mappings. Use this to give a specific LDAP user
            a different role than their directory group would assign.
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {isAdmin && (
              <button onClick={openCreate} style={mkBtn('amber')}>
                <Plus size={12} /> Add Override
              </button>
            )}
            <button onClick={() => { loadMappings(); fetchLdapUsers(); }} disabled={loading || ldapUsersLoading} style={mkBtn('blue')}>
              <RefreshCw size={12} /> Refresh
            </button>
            {mappings.length > 0 && (
              <input
                type="text"
                placeholder="Filter by username, role, note…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...INP_STYLE, maxWidth: '260px', padding: '0.42rem 0.8rem', fontSize: '0.82rem', marginLeft: 'auto' }}
              />
            )}
          </div>

          {/* Add / Edit form (inline) */}
          {showForm && (
            <div style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1rem',
              background: 'rgba(253,150,68,0.05)', border: '1px solid rgba(253,150,68,0.25)' }}>
              <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#fd9644', marginBottom: '0.85rem' }}>
                {editTarget ? `✏ Edit override — ${editTarget.ldap_username}` : '➕ New LDAP user override'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={LBL_STYLE}>
                    LDAP Username (sAMAccountName)
                    {ldapUsers.length > 0 && !editTarget && (
                      <span style={{ marginLeft: '0.5rem', color: 'rgba(255,255,255,0.25)', textTransform: 'none', fontWeight: 400 }}>
                        ({ldapUsers.length} detected)
                      </span>
                    )}
                  </label>

                  {editTarget ? (
                    // Read-only when editing
                    <input
                      style={{ ...INP_STYLE, opacity: 0.5, cursor: 'not-allowed' }}
                      readOnly
                      value={form.ldap_username}
                    />
                  ) : ldapUsers.length > 0 ? (
                    // ── Searchable combobox ──────────────────────────────────
                    <div style={{ position: 'relative' }}>
                      {/* Trigger / search input */}
                      <div style={{ position: 'relative' }}>
                        <span style={{
                          position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                          fontSize: '0.8rem', color: 'var(--text-secondary)', pointerEvents: 'none',
                        }}>👤</span>
                        <input
                          value={userPickerQuery}
                          onChange={e => {
                            setUserPickerQuery(e.target.value);
                            setForm(p => ({ ...p, ldap_username: e.target.value }));
                            setUserPickerOpen(true);
                          }}
                          onFocus={() => setUserPickerOpen(true)}
                          onBlur={() => setTimeout(() => setUserPickerOpen(false), 180)}
                          placeholder={ldapUsersLoading ? 'Loading LDAP users…' : 'Search or type username…'}
                          style={{ ...INP_STYLE, paddingLeft: '2.1rem', paddingRight: '2rem' }}
                        />
                        {/* Clear button */}
                        {userPickerQuery && (
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setUserPickerQuery(''); setForm(p => ({ ...p, ldap_username: '' })); setUserPickerOpen(true); }}
                            style={{
                              position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', color: 'var(--text-secondary)',
                              cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px',
                            }}
                          >✕</button>
                        )}
                      </div>

                      {/* Dropdown listbox */}
                      {userPickerOpen && (() => {
                        const q = userPickerQuery.toLowerCase();
                        const alreadyMapped = mappings.map(m => m.ldap_username);
                        const visible = ldapUsers.filter(u => {
                          const name = typeof u === 'string' ? u : (u.sAMAccountName || u.username || u.cn || '');
                          return (!q || name.toLowerCase().includes(q)) && !alreadyMapped.includes(name);
                        });
                        if (visible.length === 0 && !userPickerQuery) return null;
                        return (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                            background: 'rgba(18,18,26,0.98)', border: '1px solid rgba(253,150,68,0.35)',
                            borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                            maxHeight: '220px', overflowY: 'auto',
                          }}>
                            {visible.length === 0 ? (
                              <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                {userPickerQuery ? `No users match "${userPickerQuery}" — value will be used as-is.` : 'All detected users already mapped.'}
                              </div>
                            ) : (
                              visible.map((u, idx) => {
                                const name = typeof u === 'string' ? u : (u.sAMAccountName || u.username || u.cn || String(u));
                                const display = typeof u === 'object' ? (u.displayName || u.display_name || name) : name;
                                const hiIdx = q ? name.toLowerCase().indexOf(q) : -1;
                                return (
                                  <div
                                    key={name}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setForm(p => ({ ...p, ldap_username: name }));
                                      setUserPickerQuery(name);
                                      setUserPickerOpen(false);
                                    }}
                                    style={{
                                      padding: '0.55rem 1rem', cursor: 'pointer', fontSize: '0.83rem',
                                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                                      borderBottom: idx < visible.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(253,150,68,0.12)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >
                                    <span style={{
                                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                      background: 'rgba(253,150,68,0.15)', border: '1px solid rgba(253,150,68,0.3)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '0.75rem', fontWeight: '700', color: '#fd9644',
                                    }}>
                                      {name.charAt(0).toUpperCase()}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ color: 'white', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {hiIdx >= 0 ? (
                                          <>{name.slice(0, hiIdx)}<mark style={{ background: 'rgba(253,150,68,0.35)', color: '#fd9644', borderRadius: '2px', padding: '0 1px' }}>{name.slice(hiIdx, hiIdx + q.length)}</mark>{name.slice(hiIdx + q.length)}</>
                                        ) : name}
                                      </div>
                                      {display !== name && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {display}
                                        </div>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: '#fd9644', opacity: 0.6, flexShrink: 0 }}>↵ select</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    // Fallback plain input when no LDAP users detected
                    <input
                      style={INP_STYLE}
                      value={form.ldap_username}
                      onChange={e => setForm(p => ({ ...p, ldap_username: e.target.value }))}
                      placeholder="jdoe"
                    />
                  )}
                </div>
                <div>
                  <label style={LBL_STYLE}>Assign Role</label>
                  <select
                    style={{ ...INP_STYLE, cursor: 'pointer', colorScheme: 'dark' }}
                    value={form.role}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  >
                    {roles.map(r => (
                      <option key={r.name} value={r.name}>{r.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={LBL_STYLE}>Note <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input
                  style={INP_STYLE}
                  value={form.note}
                  onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                  placeholder="e.g. temp admin while on project"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} style={mkBtn('gray')}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ ...mkBtn('amber'), opacity: saving ? 0.6 : 1 }}>
                  {saving ? '⟳ Saving…' : <><Check size={12} /> Save Override</>}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.82rem', fontStyle: 'italic' }}>
              {search ? 'No matches.' : 'No per-user overrides configured.'}
            </div>
          ) : (
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--panel-border)' }}>
                    {['LDAP Username', 'Assigned Role', 'Note', 'Added', isAdmin ? 'Actions' : ''].map(h => h && (
                      <th key={h} style={{ padding: '0.65rem 0.9rem', textAlign: 'left', fontSize: '0.68rem',
                        textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const roleObj   = roles.find(r => r.name === row.role);
                    const roleColor = roleObj?.color || SYSTEM_COLORS[row.role] || '#6B7280';
                    const addedAt   = row.created_at ? new Date(row.created_at) : null;
                    return (
                      <tr key={row.ldap_username}
                        style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--panel-border)' : 'none',
                          transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '0.7rem 0.9rem', fontSize: '0.84rem', fontWeight: '500', fontFamily: 'monospace', color: '#fd9644' }}>
                          {row.ldap_username}
                        </td>
                        <td style={{ padding: '0.7rem 0.9rem' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.18rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600',
                            background: `${roleColor}18`, border: `1px solid ${roleColor}55`, color: roleColor,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleColor, display: 'inline-block' }} />
                            {roleObj?.display_name || row.role}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem 0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                          {row.note || <span style={{ opacity: 0.3 }}>—</span>}
                        </td>
                        <td style={{ padding: '0.7rem 0.9rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                          {addedAt ? addedAt.toLocaleDateString() : '—'}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: '0.7rem 0.9rem' }}>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button onClick={() => openEdit(row)} style={mkBtn('blue')} title="Edit">
                                <Edit2 size={12} />
                              </button>
                              <button onClick={() => handleDelete(row.ldap_username)} style={mkBtn('red')} title="Delete">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { api, toast, currentUser } = useApp();

  const [tab,          setTab]          = useState('users');
  const [users,        setUsers]        = useState([]);
  const [roles,        setRoles]        = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [logsLoading,  setLogsLoading]  = useState(false);

  const [showUserForm, setShowUserForm] = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [userForm,     setUserForm]     = useState(EMPTY_USER_FORM);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(null);

  const [pwModal, setPwModal] = useState(null);
  const [pwForm,  setPwForm]  = useState({ password:'', confirm:'' });

  const [permModal,   setPermModal]   = useState(null);
  const [perms,       setPerms]       = useState(DEFAULT_PERMS);
  const [permSaving,  setPermSaving]  = useState(false);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editRole,     setEditRole]     = useState(null);
  const [roleForm,     setRoleForm]     = useState(EMPTY_ROLE_FORM);
  const [roleSaving,   setRoleSaving]   = useState(false);

  const [logFilter, setLogFilter] = useState('');

  const isSuper = currentUser?.is_super_admin;
  const isAdmin = currentUser?.role === 'admin' || isSuper;

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.getUsers()); }
    catch (e) { toast.error('Failed to load users: ' + e.message); }
    finally   { setLoading(false); }
  }, [api, toast]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try { setRoles(await api.getRoles()); }
    catch (e) { toast.error('Failed to load roles: ' + e.message); }
    finally   { setRolesLoading(false); }
  }, [api, toast]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try { setLogs(await api.getLogs(300)); }
    catch (e) { toast.error('Failed to load logs: ' + e.message); }
    finally   { setLogsLoading(false); }
  }, [api, toast]);

  useEffect(() => { loadUsers(); loadRoles(); }, []); // eslint-disable-line
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]); // eslint-disable-line

  // ── Permissions modal ─────────────────────────────────────────────────────
  const openPerms = async (u) => {
    // Block editing permissions of a super-admin unless current user is also super-admin
    if ((u.is_super_admin || u.role === 'super_admin') && !isSuper) {
      toast.error('Only a super admin can edit another super admin\'s permissions');
      return;
    }
    try {
      const p = await api.getPermissions(u.id);
      setPerms({ ...DEFAULT_PERMS, ...p,
        deck_control:   p.deck_control   || DEFAULT_DECK_CONTROL,
        deck_actions:   p.deck_actions   || DEFAULT_DECK_ACTIONS,
        playlist_perms: p.playlist_perms || DEFAULT_PLAYLIST_PERMS,
      });
      setPermModal(u);
    } catch(e) { toast.error(e.message); }
  };

  const savePerms = async () => {
    setPermSaving(true);
    try {
      const allowed_decks = DECK_IDS.filter(d => perms.deck_control?.[d]?.view);
      await api.savePermissions(permModal.id, { ...perms, allowed_decks });
      toast.success(`Permissions saved for @${permModal.username}`);
      setPermModal(null);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setPermSaving(false); }
  };

  const applyRoleTemplate = async (u) => {
    if (!window.confirm(`Reset @${u.username}'s permissions to the "${u.role}" role defaults?`)) return;
    try {
      await api.applyRoleTemplate(u.id, null);
      toast.success(`Role template applied to @${u.username}`);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
  };

  // ── User form ─────────────────────────────────────────────────────────────
  const openCreateUser = () => {
    setUserForm({ ...EMPTY_USER_FORM, role:'operator' });
    setEditTarget(null);
    setShowUserForm('create');
  };
  const openEditUser = (u) => {
    setUserForm({ username:u.username, display_name:u.display_name||'', password:'', role:u.role });
    setEditTarget(u);
    setShowUserForm('edit');
  };

  const handleUserSubmit = async () => {
    if (!userForm.username.trim()) { toast.error('Username required'); return; }
    if (showUserForm==='create' && userForm.password.length < 6) { toast.error('Password min 6 chars'); return; }
    // Prevent editing a super admin account unless you are super admin
    if (showUserForm === 'edit' && (editTarget?.is_super_admin || editTarget?.role === 'super_admin') && !isSuper) {
      toast.error('Only a super admin can edit another super admin account'); return;
    }
    setSaving(true);
    try {
      if (showUserForm === 'create') {
        await api.createUser({
          username:     userForm.username.trim(),
          display_name: userForm.display_name.trim() || userForm.username.trim(),
          password:     userForm.password,
          role:         userForm.role,
        });
        toast.success(`User @${userForm.username} created!`);
      } else {
        await api.updateUser(editTarget.id, {
          display_name: userForm.display_name.trim() || editTarget.username,
          role:         userForm.role,
        });
        toast.success('User updated!');
      }
      setShowUserForm(false); setEditTarget(null);
      await loadUsers();
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async (u) => {
    if (u.id === currentUser?.id) { toast.warning("Can't disable yourself"); return; }
    if ((u.is_super_admin || u.role === 'super_admin') && !isSuper) { toast.error('Only a super admin can modify another super admin account'); return; }
    try { await api.updateUser(u.id, { enabled:!u.enabled }); await loadUsers(); }
    catch(e) { toast.error(e.message); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete @${u.username}? Cannot be undone.`)) return;
    setDeleting(u.id);
    try { await api.deleteUser(u.id); toast.success(`Deleted @${u.username}`); await loadUsers(); }
    catch(e) { toast.error(e.message); }
    finally { setDeleting(null); }
  };

  const handleChangePw = async () => {
    if (pwForm.password.length < 6)         { toast.error('Password min 6 chars'); return; }
    if (pwForm.password !== pwForm.confirm)  { toast.error('Passwords do not match'); return; }
    // Block non-super-admins from changing a super admin's password
    if ((pwModal?.is_super_admin || pwModal?.role === 'super_admin') && !isSuper) {
      toast.error('Only a super admin can change another super admin\'s password');
      return;
    }
    setSaving(true);
    try {
      await api.updateUser(pwModal.id, { password:pwForm.password });
      toast.success('Password updated!');
      setPwModal(null);
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── Role form ─────────────────────────────────────────────────────────────
  const openCreateRole = () => {
    setRoleForm({ ...EMPTY_ROLE_FORM });
    setEditRole(null);
    setShowRoleForm(true);
  };
  const openEditRole = (role) => {
    setRoleForm({
      name:          role.name,
      display_name:  role.display_name,
      description:   role.description || '',
      color:         role.color || '#2563EB',
      default_allowed_decks:  role.default_allowed_decks  || DECK_IDS,
      default_deck_control:   role.default_deck_control   || DEFAULT_DECK_CONTROL,
      default_deck_actions:   role.default_deck_actions   || DEFAULT_DECK_ACTIONS,
      default_playlist_perms: role.default_playlist_perms || DEFAULT_PLAYLIST_PERMS,
      default_can_announce:   role.default_can_announce   ?? true,
      default_can_schedule:   role.default_can_schedule   ?? true,
      default_can_library:    role.default_can_library    ?? true,
      default_can_requests:   role.default_can_requests   ?? true,
      default_can_settings:   role.default_can_settings   ?? false,
    });
    setEditRole(role);
    setShowRoleForm(true);
  };

  const handleRoleSubmit = async () => {
    if (!roleForm.display_name.trim()) { toast.error('Display name required'); return; }
    if (!editRole && !roleForm.name.trim()) { toast.error('Role name required'); return; }
    setRoleSaving(true);
    try {
      if (editRole) {
        await api.updateRole(editRole.id, {
          display_name:           roleForm.display_name.trim(),
          description:            roleForm.description,
          color:                  roleForm.color,
          default_allowed_decks:  roleForm.default_allowed_decks,
          default_deck_control:   roleForm.default_deck_control,
          default_deck_actions:   roleForm.default_deck_actions,
          default_playlist_perms: roleForm.default_playlist_perms,
          default_can_announce:   roleForm.default_can_announce,
          default_can_schedule:   roleForm.default_can_schedule,
          default_can_library:    roleForm.default_can_library,
          default_can_requests:   roleForm.default_can_requests,
          default_can_settings:   roleForm.default_can_settings,
        });
        toast.success(`Role "${roleForm.display_name}" updated!`);
      } else {
        await api.createRole({
          name:                   roleForm.name.trim().toLowerCase().replace(/\s+/g,'_'),
          display_name:           roleForm.display_name.trim(),
          description:            roleForm.description,
          color:                  roleForm.color,
          default_allowed_decks:  roleForm.default_allowed_decks,
          default_deck_control:   roleForm.default_deck_control,
          default_deck_actions:   roleForm.default_deck_actions,
          default_playlist_perms: roleForm.default_playlist_perms,
          default_can_announce:   roleForm.default_can_announce,
          default_can_schedule:   roleForm.default_can_schedule,
          default_can_library:    roleForm.default_can_library,
          default_can_requests:   roleForm.default_can_requests,
          default_can_settings:   roleForm.default_can_settings,
        });
        toast.success(`Role "${roleForm.display_name}" created!`);
      }
      setShowRoleForm(false); setEditRole(null);
      await loadRoles();
    } catch(e) { toast.error(e.message); }
    finally { setRoleSaving(false); }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Delete role "${role.display_name}"? Users with this role must be reassigned first.`)) return;
    try {
      await api.deleteRole(role.id);
      toast.success(`Role "${role.display_name}" deleted`);
      await loadRoles();
    } catch(e) { toast.error(e.message); }
  };

  const filteredLogs = logs.filter(l =>
    !logFilter || l.username?.includes(logFilter) || l.action?.includes(logFilter) ||
    JSON.stringify(l.details||{}).includes(logFilter)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const PAGE_TABS = [
    { id:'users', label:'Users',        icon:<Users size={14}/> },
    { id:'roles', label:'Roles',        icon:<Layers size={14}/> },
    { id:'logs',  label:'Activity Log', icon:<Activity size={14}/> },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <h2 style={{ fontSize:'1.5rem', fontWeight:'500', display:'flex', alignItems:'center', gap:'0.6rem', margin:0 }}>
          <Users size={22}/> User Management
        </h2>
        <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap' }}>
          <button onClick={() => { if(tab==='users') loadUsers(); else if(tab==='roles') loadRoles(); else loadLogs(); }}
            style={mkBtn('blue')}><RefreshCw size={13}/> Refresh</button>
          {isAdmin && tab === 'users' && (
            <button onClick={openCreateUser} style={mkBtn('green')}><Plus size={13}/> New User</button>
          )}
          {isAdmin && tab === 'roles' && (
            <button onClick={openCreateRole} style={mkBtn('purple')}><Plus size={13}/> New Role</button>
          )}
        </div>
      </div>

      {/* Page tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:'1.5rem', borderBottom:'1px solid var(--panel-border)' }}>
        {PAGE_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.65rem 1.2rem',
              background:'none', border:'none',
              borderBottom: tab===t.id ? '2px solid var(--accent-blue)':'2px solid transparent',
              color: tab===t.id ? 'var(--accent-blue)':'var(--text-secondary)',
              cursor:'pointer', fontFamily:'inherit', fontSize:'0.88rem',
              fontWeight: tab===t.id ? '600':'400', marginBottom:'-1px' }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══ USERS TAB ══════════════════════════════════════════════════════ */}
      {tab === 'users' && (
        <div className="glass-panel" style={{ padding:0, overflow:'hidden' }}>
          {loading ? (
            <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading…</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'700px' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.2)' }}>
                    {['User','Role','Deck Access','Status','Actions'].map(h => (
                      <th key={h} style={{ padding:'0.8rem 1rem', textAlign:'left', fontSize:'0.7rem',
                        textTransform:'uppercase', letterSpacing:'0.5px',
                        color:'var(--text-secondary)', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const isSelf         = u.id === currentUser?.id;
                    const isSuperAdminUser = u.is_super_admin || u.role === 'super_admin';
                    // Super admin accounts can only be touched by other super admins
                    const canEdit        = isSelf || (isSuperAdminUser ? isSuper : isAdmin);
                    const dc        = u.permissions?.deck_control || {};
                    const roleColor = roles.find(r=>r.name===u.role)?.color || SYSTEM_COLORS[u.role] || '#6B7280';
                    return (
                      <tr key={u.id}
                        style={{ borderBottom: i<users.length-1 ? '1px solid var(--panel-border)':'none',
                          opacity:u.enabled?1:0.45, transition:'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                        <td style={{ padding:'0.85rem 1rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.7rem' }}>
                            <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0,
                              background:`${roleColor}22`, border:`1px solid ${roleColor}44`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:'0.9rem', fontWeight:'700', color:roleColor }}>
                              {(u.display_name||u.username).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight:'500', fontSize:'0.88rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                                {u.display_name||u.username}
                                {isSelf && <span style={{ fontSize:'0.65rem', background:'rgba(0,212,255,0.12)', color:'var(--accent-blue)',
                                  padding:'0.08rem 0.4rem', borderRadius:'4px', border:'1px solid rgba(0,212,255,0.25)' }}>you</span>}
                              </div>
                              <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>@{u.username}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding:'0.85rem 1rem' }}>
                          <RoleBadge role={u.role} isSuperAdmin={u.is_super_admin} roles={roles}/>
                        </td>

                        <td style={{ padding:'0.85rem 1rem' }}>
                          {(u.role==='super_admin' || u.is_super_admin || u.role==='admin') ? (
                            <span style={{ fontSize:'0.72rem', color:'#ffd700' }}>⭐ All decks</span>
                          ) : (
                            <div style={{ display:'flex', gap:'0.3rem', flexWrap:'wrap' }}>
                              {DECK_IDS.map(d => {
                                const cfg = dc[d] || {};
                                if (!cfg.view && !cfg.control) return (
                                  <span key={d} style={{ padding:'0.1rem 0.45rem', borderRadius:'5px', fontSize:'0.7rem',
                                    background:'rgba(255,255,255,0.03)', border:'1px solid var(--panel-border)',
                                    color:'rgba(255,255,255,0.2)' }}>{d.toUpperCase()}</span>
                                );
                                return (
                                  <span key={d} title={cfg.control?'View + Control':'View only'}
                                    style={{ padding:'0.1rem 0.55rem', borderRadius:'5px', fontSize:'0.7rem', fontWeight:'600',
                                      background: cfg.control ? 'rgba(0,212,255,0.12)':'rgba(255,215,0,0.06)',
                                      border:`1px solid ${cfg.control?'rgba(0,212,255,0.3)':'rgba(255,215,0,0.2)'}`,
                                      color: cfg.control ? 'var(--accent-blue)':'#ffd700' }}>
                                    {d.toUpperCase()} {cfg.control ? '🎛':'👁'}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td style={{ padding:'0.85rem 1rem' }}>
                          {isAdmin && !isSelf && !isSuperAdminUser ? (
                            <button onClick={() => toggleEnabled(u)}
                              style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem',
                                padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem',
                                fontWeight:'600', cursor:'pointer', fontFamily:'inherit',
                                background:u.enabled?'rgba(46,213,115,0.12)':'rgba(255,255,255,0.05)',
                                border:u.enabled?'1px solid rgba(46,213,115,0.35)':'1px solid var(--panel-border)',
                                color:u.enabled?'#2ed573':'var(--text-secondary)' }}>
                              {u.enabled ? <><Check size={10}/>Active</>:<><X size={10}/>Disabled</>}
                            </button>
                          ) : (
                            <span style={{ fontSize:'0.8rem', color:u.enabled?'#2ed573':'var(--text-secondary)' }}>
                              {u.enabled?'● Active':'○ Off'}
                            </span>
                          )}
                        </td>

                        <td style={{ padding:'0.85rem 1rem' }}>
                          <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                            {canEdit && (
                              <button onClick={() => openEditUser(u)} style={mkBtn('blue')} title="Edit user">
                                <Edit2 size={12}/>
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => { setPwModal(u); setPwForm({ password:'', confirm:'' }); }}
                                style={mkBtn('amber')} title="Change password">
                                <Key size={12}/>
                              </button>
                            )}
                            {/* Permissions and role-reset only for non-super-admin targets (or if current user IS super-admin) */}
                            {isAdmin && !isSelf && (!isSuperAdminUser || isSuper) && (
                              <button onClick={() => openPerms(u)} style={mkBtn('purple')} title={isSuperAdminUser ? 'Edit super-admin permissions (super-admin only)' : 'Edit permissions'}>
                                <Lock size={12}/>
                              </button>
                            )}
                            {isAdmin && !isSelf && !isSuperAdminUser && (
                              <button onClick={() => applyRoleTemplate(u)} style={mkBtn('gray')} title="Reset to role defaults">
                                <RotateCcw size={12}/>
                              </button>
                            )}
                            {!isSelf && (isSuperAdminUser ? isSuper : isAdmin) && (
                              <button onClick={() => handleDeleteUser(u)} disabled={deleting===u.id}
                                style={{ ...mkBtn('red'), opacity:deleting===u.id?0.4:1 }} title="Delete user">
                                <Trash2 size={12}/>
                              </button>
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
      )}

      {/* ══ ROLES TAB ══════════════════════════════════════════════════════ */}
      {tab === 'roles' && (
        <>
          {!isAdmin && (
            <div style={{ marginBottom:'1rem', padding:'0.7rem 1rem', borderRadius:'8px',
              background:'rgba(0,212,255,0.06)', border:'1px solid rgba(0,212,255,0.2)',
              fontSize:'0.82rem', color:'var(--text-secondary)' }}>
              ℹ Roles are view-only for non-admins.
            </div>
          )}

          {/* ── LDAP Group → Role Mapping panel ── */}
          {roles.length > 0 && (
            <LdapGroupMappingPanel roles={roles} api={api} toast={toast} isAdmin={isAdmin}/>
          )}

          {/* ── LDAP User → Role Override panel ── */}
          {roles.length > 0 && (
            <LdapUserMappingPanel roles={roles} api={api} toast={toast} isAdmin={isAdmin}/>
          )}

          {/* ── Roles cards ── */}
          {rolesLoading ? (
            <div className="glass-panel" style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading…</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {roles.map(role => {
                const roleColor  = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
                const userCount  = users.filter(u => u.role === role.name).length;
                const featureOn  = key => role[`default_${key}`] ?? false;
                const isProtectedSystem = ['super_admin'].includes(role.name);
                // Actions count for preview bar
                const actionCount = (role.default_deck_actions || []).length;
                const featureCount = FEATURE_DEFS.filter(f => role[`default_${f.key}`]).length;
                return (
                  <div key={role.id} style={{
                    borderRadius:'12px', border:`1px solid ${roleColor}30`,
                    background:`linear-gradient(135deg, ${roleColor}06 0%, rgba(0,0,0,0.15) 100%)`,
                    overflow:'hidden',
                    transition:'border-color 0.2s, box-shadow 0.2s',
                    boxShadow:`0 2px 12px ${roleColor}08`,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${roleColor}60`; e.currentTarget.style.boxShadow = `0 4px 24px ${roleColor}18`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `${roleColor}30`; e.currentTarget.style.boxShadow = `0 2px 12px ${roleColor}08`; }}
                  >
                    {/* Card header */}
                    <div style={{
                      padding:'0.9rem 1.2rem',
                      background:`linear-gradient(90deg, ${roleColor}14 0%, ${roleColor}06 100%)`,
                      borderBottom:`1px solid ${roleColor}22`,
                      display:'flex', alignItems:'center', gap:'0.85rem',
                    }}>
                      {/* Color swatch + name */}
                      <div style={{
                        width:36, height:36, borderRadius:'10px', flexShrink:0,
                        background:`${roleColor}20`, border:`2px solid ${roleColor}50`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'1rem', fontWeight:'800', color:roleColor,
                      }}>
                        {role.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                          <span style={{ fontWeight:'700', fontSize:'0.92rem', color:roleColor }}>{role.display_name}</span>
                          <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.3)', fontFamily:'monospace' }}>/{role.name}</span>
                          {role.is_system ? (
                            <span style={{ fontSize:'0.65rem', padding:'0.1rem 0.45rem', borderRadius:'10px',
                              background:'rgba(255,215,0,0.08)', border:'1px solid rgba(255,215,0,0.25)', color:'#ffd700' }}>⚙ System</span>
                          ) : (
                            <span style={{ fontSize:'0.65rem', padding:'0.1rem 0.45rem', borderRadius:'10px',
                              background:'rgba(165,94,234,0.1)', border:'1px solid rgba(165,94,234,0.3)', color:'#a55eea' }}>✦ Custom</span>
                          )}
                          {isProtectedSystem && (
                            <span style={{ fontSize:'0.65rem', padding:'0.1rem 0.45rem', borderRadius:'10px',
                              background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.3)', color:'#ef4444',
                              display:'flex', alignItems:'center', gap:'0.25rem' }}>🔒 Protected</span>
                          )}
                        </div>
                        {role.description && (
                          <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.15rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {role.description}
                          </div>
                        )}
                      </div>
                      {/* User count chip */}
                      <div style={{ textAlign:'center', flexShrink:0 }}>
                        <div style={{ fontSize:'1.1rem', fontWeight:'700', color:roleColor, lineHeight:1 }}>{userCount}</div>
                        <div style={{ fontSize:'0.62rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.4px' }}>user{userCount!==1?'s':''}</div>
                      </div>
                      {/* Actions */}
                      <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
                        {isAdmin && !isProtectedSystem && (
                          <button onClick={() => openEditRole(role)} style={mkBtn('blue')} title="Edit role">
                            <Edit2 size={12}/>
                          </button>
                        )}
                        {isSuper && !role.is_system && !isProtectedSystem && (
                          <button onClick={() => handleDeleteRole(role)} style={mkBtn('red')} title="Delete role">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ padding:'0.85rem 1.2rem', display:'flex', gap:'1.5rem', flexWrap:'wrap', alignItems:'flex-start', borderTop: `1px solid ${roleColor}10` }}>
                      {/* Stats chips */}
                      <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', width:'100%', marginBottom:'0.1rem' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.12rem 0.55rem', borderRadius:'12px', fontSize:'0.68rem',
                          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-secondary)' }}>
                          ⚡ {actionCount} action{actionCount!==1?'s':''}
                        </span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.12rem 0.55rem', borderRadius:'12px', fontSize:'0.68rem',
                          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text-secondary)' }}>
                          🧩 {featureCount}/{FEATURE_DEFS.length} features
                        </span>
                        {isProtectedSystem && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.12rem 0.55rem', borderRadius:'12px', fontSize:'0.68rem',
                            background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.25)', color:'#ef4444' }}>
                            🛡 Immutable — protected from all modifications
                          </span>
                        )}
                      </div>
                      {/* Deck access */}
                      <div>
                        <div style={{ fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'0.35rem' }}>Deck Access</div>
                        <div style={{ display:'flex', gap:'0.25rem' }}>
                          {DECK_IDS.map(d => {
                            const ctrl = role.default_deck_control?.[d];
                            const hasCtrl = ctrl?.control;
                            const hasView = ctrl?.view;
                            return (
                              <span key={d} title={hasCtrl?'View + Control':hasView?'View only':'No access'}
                                style={{ padding:'0.15rem 0.5rem', borderRadius:'6px', fontSize:'0.7rem', fontWeight:'700',
                                  background: hasCtrl?'rgba(0,212,255,0.12)':hasView?'rgba(255,215,0,0.08)':'rgba(255,255,255,0.03)',
                                  border:`1px solid ${hasCtrl?'rgba(0,212,255,0.3)':hasView?'rgba(255,215,0,0.2)':'rgba(255,255,255,0.06)'}`,
                                  color: hasCtrl?'var(--accent-blue)':hasView?'#ffd700':'rgba(255,255,255,0.2)' }}>
                                  {d.toUpperCase()}{hasCtrl?' 🎛':hasView?' 👁':''}
                                </span>
                            );
                          })}
                        </div>
                      </div>
                      {/* Features */}
                      <div>
                        <div style={{ fontSize:'0.65rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'0.35rem' }}>Features</div>
                        <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                          {FEATURE_DEFS.map(({ key, label, icon }) => {
                            const on = featureOn(key);
                            return (
                              <span key={key} style={{
                                display:'inline-flex', alignItems:'center', gap:'0.25rem',
                                padding:'0.15rem 0.5rem', borderRadius:'6px', fontSize:'0.7rem',
                                background: on ? `${roleColor}12`:'rgba(255,255,255,0.03)',
                                border:`1px solid ${on ? `${roleColor}35`:'rgba(255,255,255,0.06)'}`,
                                color: on ? roleColor:'rgba(255,255,255,0.2)',
                              }}>
                                {icon}{label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══ LOGS TAB ═══════════════════════════════════════════════════════ */}
      {tab === 'logs' && (
        <>
          <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', alignItems:'center', flexWrap:'wrap' }}>
            <input type="text" placeholder="Filter by user, action, details…" value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              style={{ ...INP_STYLE, maxWidth:'320px', padding:'0.5rem 0.85rem' }}/>
            <span style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginLeft:'auto' }}>
              {filteredLogs.length} event{filteredLogs.length!==1?'s':''}
            </span>
          </div>
          <div className="glass-panel" style={{ padding:0, overflow:'hidden' }}>
            {logsLoading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading…</div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>No activity yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'580px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.2)' }}>
                      {['Time','User','Action','Details','IP'].map(h => (
                        <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontSize:'0.7rem',
                          textTransform:'uppercase', letterSpacing:'0.5px',
                          color:'var(--text-secondary)', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, i) => {
                      const dt      = log.created_at ? new Date(log.created_at) : null;
                      const details = typeof log.details === 'object' ? log.details : {};
                      const emoji   = ACTION_ICONS[log.action] || '•';
                      const isUser  = log.action?.startsWith('user.');
                      const isRole  = log.action?.startsWith('role.');
                      const isMic   = log.action?.startsWith('mic');
                      const isLogin = log.action === 'login';
                      return (
                        <tr key={log.id}
                          style={{ borderBottom: i<filteredLogs.length-1?'1px solid var(--panel-border)':'none', transition:'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.75rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
                            {dt ? <><div>{dt.toLocaleDateString()}</div><div style={{ opacity:0.6 }}>{dt.toLocaleTimeString()}</div></> : '—'}
                          </td>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.82rem', fontWeight:'500' }}>{log.username}</td>
                          <td style={{ padding:'0.7rem 1rem' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', fontSize:'0.8rem',
                              padding:'0.18rem 0.6rem', borderRadius:'12px',
                              background: isLogin?'rgba(46,213,115,0.10)':isUser?'rgba(253,150,68,0.10)':isRole?'rgba(165,94,234,0.10)':isMic?'rgba(255,71,87,0.10)':'rgba(255,255,255,0.05)',
                              border: isLogin?'1px solid rgba(46,213,115,0.25)':isUser?'1px solid rgba(253,150,68,0.25)':isRole?'1px solid rgba(165,94,234,0.25)':isMic?'1px solid rgba(255,71,87,0.25)':'1px solid var(--panel-border)',
                              color: isLogin?'#2ed573':isUser?'#fd9644':isRole?'#a55eea':isMic?'#ff4757':'var(--text-primary)' }}>
                              {emoji} {log.action}
                            </span>
                          </td>
                          <td style={{ padding:'0.7rem 1rem', fontSize:'0.75rem', color:'var(--text-secondary)', maxWidth:'220px' }}>
                            {Object.keys(details).length > 0
                              ? <span style={{ wordBreak:'break-all' }}>{Object.entries(details).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join(' · ')}</span>
                              : '—'}
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

      {/* ══ Create / Edit User Modal ════════════════════════════════════════ */}
      {showUserForm && (
        <Modal title={showUserForm==='create' ? 'Create New User':`Edit — @${editTarget?.username}`}
          onClose={() => { setShowUserForm(false); setEditTarget(null); }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={LBL_STYLE}>Username
                {showUserForm==='edit' && <span style={{ color:'var(--text-secondary)', fontSize:'0.65rem', textTransform:'none', marginLeft:'0.4rem' }}>(cannot change)</span>}
              </label>
              <input style={{ ...INP_STYLE, opacity:showUserForm==='edit'?0.5:1, cursor:showUserForm==='edit'?'not-allowed':'text' }}
                value={userForm.username} readOnly={showUserForm==='edit'}
                onChange={e => setUserForm(p=>({...p, username:e.target.value}))} placeholder="djmike"/>
            </div>
            <div>
              <label style={LBL_STYLE}>Display Name</label>
              <input style={INP_STYLE} value={userForm.display_name}
                onChange={e => setUserForm(p=>({...p, display_name:e.target.value}))} placeholder="Mike the DJ"/>
            </div>
            {showUserForm === 'create' && (
              <div>
                <label style={LBL_STYLE}>Password <span style={{ color:'#ff4757' }}>*</span></label>
                <input type="password" style={INP_STYLE} value={userForm.password}
                  onChange={e => setUserForm(p=>({...p, password:e.target.value}))} placeholder="Min 6 characters"/>
                {userForm.password && userForm.password.length < 6 &&
                  <div style={{ marginTop:'0.3rem', fontSize:'0.73rem', color:'#ff4757' }}>Too short</div>}
              </div>
            )}
            {isAdmin && (
              <div>
                <label style={LBL_STYLE}>Role</label>
                <select style={{ ...INP_STYLE, cursor:'pointer' }}
                  value={userForm.role}
                  onChange={e => setUserForm(p=>({...p, role:e.target.value}))}>
                  {roles
                    .filter(r => isSuper || !['super_admin','admin'].includes(r.name))
                    .map(r => (
                      <option key={r.name} value={r.name}>{r.display_name}</option>
                    ))}
                </select>
              </div>
            )}
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => { setShowUserForm(false); setEditTarget(null); }} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleUserSubmit} disabled={saving}
                style={{ ...mkBtn('green'), opacity:saving?0.6:1 }}>
                {saving ? '⟳ Saving…' : showUserForm==='create' ? <><Plus size={13}/>Create</> : <><Check size={13}/>Save</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Password Modal ═══════════════════════════════════════════════════ */}
      {pwModal && (
        <Modal title={`Change Password — @${pwModal.username}`} onClose={() => setPwModal(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={LBL_STYLE}>New Password</label>
              <input type="password" style={INP_STYLE} value={pwForm.password}
                onChange={e => setPwForm(p=>({...p, password:e.target.value}))} placeholder="Min 6 characters"/>
            </div>
            <div>
              <label style={LBL_STYLE}>Confirm Password</label>
              <input type="password"
                style={{ ...INP_STYLE, borderColor:pwForm.confirm&&pwForm.confirm!==pwForm.password?'rgba(255,71,87,0.55)':'var(--panel-border)' }}
                value={pwForm.confirm}
                onChange={e => setPwForm(p=>({...p, confirm:e.target.value}))} placeholder="Repeat password"/>
              {pwForm.confirm && pwForm.confirm!==pwForm.password &&
                <div style={{ marginTop:'0.3rem', fontSize:'0.73rem', color:'#ff4757' }}>Passwords do not match</div>}
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => setPwModal(null)} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleChangePw}
                disabled={saving || pwForm.password!==pwForm.confirm || !pwForm.password}
                style={{ ...mkBtn('amber'), opacity:(saving||pwForm.password!==pwForm.confirm||!pwForm.password)?0.5:1 }}>
                {saving ? '⟳ Updating…' : <><Key size={13}/>Update Password</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Permissions Modal ════════════════════════════════════════════════ */}
      {permModal && (
        <Modal title={`🔐 Permissions — @${permModal.username}`} onClose={() => setPermModal(null)} wide>
          <div style={{ marginBottom:'0.75rem', padding:'0.55rem 0.9rem', borderRadius:'8px',
            background:'rgba(0,212,255,0.05)', border:'1px solid rgba(0,212,255,0.18)',
            fontSize:'0.8rem', color:'var(--text-secondary)' }}>
            Current role: <strong style={{ color:'var(--accent-blue)' }}>{roles.find(r=>r.name===permModal.role)?.display_name || permModal.role}</strong>.
            Changes here override the role's defaults for this individual user.
          </div>
          <PermEditor perms={perms} setPerms={setPerms} keyPrefix=""/>
          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem', marginTop:'1rem' }}>
            <button onClick={() => applyRoleTemplate(permModal).then(() => setPermModal(null))} style={mkBtn('gray')}>
              <RotateCcw size={12}/> Reset to Role
            </button>
            <button onClick={() => setPermModal(null)} style={mkBtn('gray')}>Cancel</button>
            <button onClick={savePerms} disabled={permSaving}
              style={{ ...mkBtn('green'), opacity:permSaving?0.6:1 }}>
              {permSaving ? '⟳ Saving…' : <><Check size={13}/>Save Permissions</>}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ Create / Edit Role Modal ═════════════════════════════════════════ */}
      {showRoleForm && (
        <Modal title={editRole ? `Edit Role — ${editRole.display_name}`:'Create Custom Role'}
          onClose={() => { setShowRoleForm(false); setEditRole(null); }} wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {!editRole && (
                <div>
                  <label style={LBL_STYLE}>Role ID <span style={{ fontSize:'0.65rem' }}>(slug, no spaces)</span></label>
                  <input style={INP_STYLE} value={roleForm.name}
                    onChange={e => setRoleForm(p=>({...p, name:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')}))}
                    placeholder="studio_operator"/>
                </div>
              )}
              <div>
                <label style={LBL_STYLE}>Display Name</label>
                <input style={INP_STYLE} value={roleForm.display_name}
                  onChange={e => setRoleForm(p=>({...p, display_name:e.target.value}))}
                  placeholder="Studio Operator"/>
              </div>
            </div>

            <div>
              <label style={LBL_STYLE}>Description</label>
              <input style={INP_STYLE} value={roleForm.description}
                onChange={e => setRoleForm(p=>({...p, description:e.target.value}))}
                placeholder="Brief description of this role…"/>
            </div>

            <div>
              <label style={LBL_STYLE}>Color</label>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <input type="color" value={roleForm.color}
                  onChange={e => setRoleForm(p=>({...p, color:e.target.value}))}
                  style={{ width:40, height:34, padding:2, borderRadius:6, border:'1px solid var(--panel-border)',
                    background:'rgba(0,0,0,0.3)', cursor:'pointer' }}/>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {['#DC2626','#D97706','#2563EB','#16A34A','#7C3AED','#DB2777','#0891B2','#6B7280'].map(c => (
                    <button key={c} onClick={() => setRoleForm(p=>({...p, color:c}))}
                      style={{ width:22, height:22, borderRadius:'50%', background:c, border:`2px solid ${roleForm.color===c?'white':'transparent'}`, cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>
                🎭 <strong style={{ color:'white' }}>Default permissions</strong> — applied to new users assigned this role.
              </div>
              <PermEditor
                perms={{
                  default_deck_control:   roleForm.default_deck_control,
                  default_deck_actions:   roleForm.default_deck_actions,
                  default_playlist_perms: roleForm.default_playlist_perms,
                  default_can_announce:   roleForm.default_can_announce,
                  default_can_schedule:   roleForm.default_can_schedule,
                  default_can_library:    roleForm.default_can_library,
                  default_can_requests:   roleForm.default_can_requests,
                  default_can_settings:   roleForm.default_can_settings,
                }}
                setPerms={(updater) => {
                  setRoleForm(prev => {
                    const merged = typeof updater === 'function' ? updater(prev) : updater;
                    return { ...prev, ...merged };
                  });
                }}
                keyPrefix="default_"
              />
            </div>

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => { setShowRoleForm(false); setEditRole(null); }} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleRoleSubmit} disabled={roleSaving}
                style={{ ...mkBtn('purple'), opacity:roleSaving?0.6:1 }}>
                {roleSaving ? '⟳ Saving…' : editRole ? <><Check size={13}/>Save Role</>:<><Plus size={13}/>Create Role</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
