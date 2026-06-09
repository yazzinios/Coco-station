import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Check, RefreshCw, Lock,
  Link2, Users, RotateCcw, Mic2, Calendar,
  FolderOpen, Settings2, Music2, Play, Square,
  SkipForward, Volume2, ListMusic, Crosshair, Sliders,
  Eye, EyeOff, X, Shield,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ──────────────────────────────────────────────────────────────
const DECK_IDS    = ['a', 'b', 'c', 'd', 'e', 'f'];
const DECK_LABELS = { a: 'Deck A', b: 'Deck B', c: 'Deck C', d: 'Deck D', e: 'Deck E', f: 'Deck F' };

const FEATURE_DEFS = [
  { key: 'can_announce', label: 'Announcements', icon: <Mic2    size={13}/>, group: 'Features' },
  { key: 'can_schedule', label: 'Schedules',     icon: <Calendar size={13}/>, group: 'Features' },
  { key: 'can_library',  label: 'Library',       icon: <FolderOpen size={13}/>, group: 'Features' },
  { key: 'can_requests', label: 'Requests',      icon: <Music2  size={13}/>, group: 'Features' },
  { key: 'can_settings', label: 'Settings',      icon: <Settings2 size={13}/>, group: 'System' },
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

// Permission matrix rows — what's shown in the center panel
const PERM_MATRIX_ROWS = [
  { group: 'Deck control', key: 'deck.play',          label: 'deck.play / pause / stop', desc: 'Transport controls' },
  { group: 'Deck control', key: 'deck.volume',        label: 'deck.volume',              desc: 'Adjust fader level' },
  { group: 'Deck control', key: 'deck.load_playlist', label: 'deck.load_playlist',       desc: 'Load content to deck' },
  { group: 'Announcements', key: 'can_announce',      label: 'can_announce',             desc: 'Play announcements' },
  { group: 'Announcements', key: 'can_schedule',      label: 'can_schedule',             desc: 'Create/edit schedules' },
  { group: 'Library & requests', key: 'can_library',  label: 'can_library',              desc: 'Upload / manage files' },
  { group: 'Library & requests', key: 'can_requests', label: 'can_requests',             desc: 'Handle music requests' },
  { group: 'System', key: 'can_settings',             label: 'can_settings',             desc: 'System configuration' },
  { group: 'System', key: 'user_management',          label: 'user management',          desc: 'Create/edit users' },
  { group: 'System', key: 'audit_logs',               label: 'audit logs',               desc: 'View activity history' },
];

const SYSTEM_COLORS = { super_admin: '#DC2626', admin: '#D97706', operator: '#2563EB', viewer: '#6B7280' };

const DEFAULT_DECK_CONTROL   = { a:{view:true,control:true}, b:{view:true,control:true}, c:{view:true,control:true}, d:{view:true,control:true}, e:{view:true,control:true}, f:{view:true,control:true} };
const DEFAULT_DECK_ACTIONS   = ['deck.play','deck.pause','deck.stop','deck.next','deck.previous','deck.volume','deck.crossfader','deck.load_track','deck.load_playlist'];
const DEFAULT_PLAYLIST_PERMS = ['playlist.view','playlist.load'];

const EMPTY_ROLE_FORM = {
  name:'', display_name:'', description:'', color:'#2563EB',
  default_allowed_decks: DECK_IDS,
  default_deck_control: DEFAULT_DECK_CONTROL,
  default_deck_actions: DEFAULT_DECK_ACTIONS,
  default_playlist_perms: DEFAULT_PLAYLIST_PERMS,
  default_can_announce: true, default_can_schedule: true,
  default_can_library: true, default_can_requests: true, default_can_settings: false,
};

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
function mkBtn(color = 'blue', extra = {}) {
  const s = PALETTE[color] || PALETTE.blue;
  return {
    padding:'0.38rem 0.8rem', borderRadius:'7px', border:`1px solid ${s.bd}`,
    background:s.bg, color:s.tx, cursor:'pointer', fontSize:'0.8rem',
    display:'inline-flex', alignItems:'center', gap:'0.32rem',
    fontFamily:'inherit', ...extra,
  };
}

// ── Modal ──────────────────────────────────────────────────────────────────
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
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-secondary)',
            cursor:'pointer', fontSize:'1.1rem', padding:'2px 6px', borderRadius:'4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Toggle Row ─────────────────────────────────────────────────────────────
function ToggleRow({ icon, label, desc, on, onChange, color = '#2ed573' }) {
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

// ── Permission Editor (used in role create/edit modal) ─────────────────────
function PermEditor({ perms, setPerms, keyPrefix = '' }) {
  const [tab, setTab] = useState('decks');

  const setDeckPerm = (deckId, level, value) => {
    setPerms(p => ({
      ...p,
      [`${keyPrefix}deck_control`]: {
        ...(p[`${keyPrefix}deck_control`] || DEFAULT_DECK_CONTROL),
        [deckId]: {
          ...(p[`${keyPrefix}deck_control`]?.[deckId] || { view:false, control:false }),
          [level]: value,
          ...(level === 'control' && value  ? { view:true }    : {}),
          ...(level === 'view'    && !value ? { control:false } : {}),
        },
      },
    }));
  };

  const toggleAction = (action) => {
    const key = `${keyPrefix}deck_actions`;
    setPerms(p => ({
      ...p,
      [key]: p[key]?.includes(action) ? p[key].filter(a => a !== action) : [...(p[key] || []), action],
    }));
  };

  const togglePlaylistPerm = (perm) => {
    const key = `${keyPrefix}playlist_perms`;
    setPerms(p => ({
      ...p,
      [key]: p[key]?.includes(perm) ? p[key].filter(x => x !== perm) : [...(p[key] || []), perm],
    }));
  };

  const dc  = perms[`${keyPrefix}deck_control`]   || DEFAULT_DECK_CONTROL;
  const da  = perms[`${keyPrefix}deck_actions`]   || [];
  const plp = perms[`${keyPrefix}playlist_perms`] || [];

  const TABS = [
    { id:'decks',    label:'🎚 Decks' },
    { id:'actions',  label:'⚡ Actions' },
    { id:'features', label:'🧩 Features' },
  ];

  return (
    <div>
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--panel-border)', marginBottom:'1rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'0.5rem 1rem', background:'none', border:'none', fontFamily:'inherit',
              borderBottom: tab === t.id ? '2px solid var(--accent-blue)':'2px solid transparent',
              color: tab === t.id ? 'var(--accent-blue)':'var(--text-secondary)',
              cursor:'pointer', fontSize:'0.82rem', fontWeight: tab === t.id ? '600':'400', marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

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
                        {level === 'view' ? (on ? <Eye size={12}/> : <EyeOff size={12}/>) : <Sliders size={12}/>}
                        {label} {on ? '✓':'✕'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      {tab === 'features' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {FEATURE_DEFS.map(({ key, label, icon, desc }) => {
            const resolvedKey = keyPrefix ? `${keyPrefix}${key}` : key;
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

// ── LDAP Group Mapping Panel (lifted from UsersPage) ───────────────────────
function LdapGroupMappingPanel({ roles, api, toast, isAdmin }) {
  const [mappings,      setMappings]      = useState({});
  const [ldapGroups,    setLdapGroups]    = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [expanded,      setExpanded]      = useState(true);
  const [manualInput,   setManualInput]   = useState('');
  const [ldapEnabled,   setLdapEnabled]   = useState(false);
  const [groupSearch,   setGroupSearch]   = useState('');

  useEffect(() => { loadMappings(); fetchLdapGroups(); }, []); // eslint-disable-line

  const loadMappings = async () => {
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings');
      if (r.ok) { const d = await r.json(); setMappings(d.mappings || d || {}); setLdapEnabled(d.ldap_enabled ?? true); }
    } catch (_) {}
  };
  const fetchLdapGroups = async () => {
    setGroupsLoading(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/info');
      if (r.ok) { const d = await r.json(); setLdapGroups(d.groups || []); setLdapEnabled(!d.error); }
    } catch (_) {} finally { setGroupsLoading(false); }
  };
  const toggleGroup = (roleName, group) => {
    setMappings(prev => {
      const cur = prev[roleName] || [];
      return { ...prev, [roleName]: cur.includes(group) ? cur.filter(g => g !== group) : [...cur, group] };
    });
  };
  const addManualGroup = (roleName) => {
    const g = manualInput.trim(); if (!g) return;
    setMappings(prev => { const cur = prev[roleName] || []; if (cur.includes(g)) return prev; return { ...prev, [roleName]: [...cur, g] }; });
    setManualInput('');
  };
  const removeGroup = (roleName, group) => setMappings(prev => ({ ...prev, [roleName]: (prev[roleName] || []).filter(g => g !== group) }));
  const saveMappings = async () => {
    setSaving(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ mappings }) });
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || r.statusText);
      toast.success('LDAP group mappings saved!');
    } catch (e) { toast.error('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  const totalMappings = Object.values(mappings).reduce((acc, arr) => acc + (arr?.length || 0), 0);

  return (
    <div className="glass-panel" style={{ padding:'1.25rem', marginBottom:'1.5rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }} onClick={() => setExpanded(v => !v)}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
          <Link2 size={16} color="#a55eea"/>
          <div>
            <div style={{ fontSize:'0.95rem', fontWeight:'600', color:'white', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              LDAP Group → Role Mapping
              {totalMappings > 0 && <span style={{ fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'10px', background:'rgba(165,94,234,0.15)', border:'1px solid rgba(165,94,234,0.3)', color:'#a55eea' }}>{totalMappings} group{totalMappings !== 1 ? 's':''} mapped</span>}
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.1rem' }}>Automatically assign roles to LDAP users based on their directory groups</div>
          </div>
        </div>
        <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{expanded ? '▲':'▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop:'1.25rem' }}>
          {!ldapEnabled && (
            <div style={{ padding:'0.75rem 1rem', borderRadius:'8px', marginBottom:'1rem', background:'rgba(253,150,68,0.08)', border:'1px solid rgba(253,150,68,0.3)', fontSize:'0.82rem', color:'#fd9644' }}>
              ⚠ LDAP is not enabled or unreachable. You can still pre-configure mappings — they take effect once LDAP is active.
            </div>
          )}
          <div style={{ padding:'0.6rem 0.9rem', borderRadius:'8px', marginBottom:'1.25rem', background:'rgba(165,94,234,0.06)', border:'1px solid rgba(165,94,234,0.15)', fontSize:'0.78rem', color:'var(--text-secondary)' }}>
            📌 When a user logs in via LDAP, their groups are checked against this mapping. First match wins. No match → default operator role.
          </div>
          {groupsLoading && <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'1rem' }}>⟳ Loading LDAP groups…</div>}

          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {roles.map(role => {
              const selected  = mappings[role.name] || [];
              const roleColor = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
              const available = ldapGroups.filter(g => !selected.includes(g));
              return (
                <div key={role.name} style={{ borderRadius:'10px', border:`1px solid ${roleColor}33`, background:`${roleColor}08`, overflow:'hidden' }}>
                  <div style={{ padding:'0.7rem 1rem', borderBottom:`1px solid ${roleColor}22`, background:`${roleColor}10`, display:'flex', alignItems:'center', gap:'0.6rem' }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:roleColor, flexShrink:0 }}/>
                    <span style={{ fontWeight:'600', fontSize:'0.88rem', color:roleColor }}>{role.display_name}</span>
                    <span style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>/{role.name}</span>
                    {selected.length > 0 && <span style={{ marginLeft:'auto', fontSize:'0.7rem', padding:'0.1rem 0.45rem', borderRadius:'10px', background:`${roleColor}18`, border:`1px solid ${roleColor}40`, color:roleColor }}>{selected.length} group{selected.length !== 1 ? 's':''}</span>}
                  </div>
                  <div style={{ padding:'0.85rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                    {selected.length > 0 ? (
                      <div>
                        <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>Mapped groups</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem' }}>
                          {selected.map(g => (
                            <span key={g} style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.25rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', background:`${roleColor}18`, border:`1px solid ${roleColor}45`, color:roleColor }}>
                              🗂 {g}
                              {isAdmin && <button onClick={() => removeGroup(role.name, g)} style={{ background:'none', border:'none', color:roleColor, cursor:'pointer', padding:0, fontSize:'0.75rem', lineHeight:1, opacity:0.7 }}>✕</button>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.25)', fontStyle:'italic' }}>No groups mapped.</div>
                    )}
                    {isAdmin && (
                      <>
                        {ldapGroups.length > 0 && (
                          <div>
                            <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>Add from LDAP directory <span style={{ color:'rgba(255,255,255,0.25)', textTransform:'none', fontWeight:400 }}>({ldapGroups.length} groups)</span></div>
                            {ldapGroups.length > 5 && (
                              <div style={{ marginBottom:'0.45rem', position:'relative' }}>
                                <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Search groups…" style={{ ...INP_STYLE, paddingLeft:'2rem', padding:'0.45rem 0.75rem 0.45rem 2rem', fontSize:'0.8rem', background:'rgba(0,0,0,0.2)' }}/>
                              </div>
                            )}
                            <div style={{ maxHeight:'150px', overflowY:'auto', borderRadius:'8px', border:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.25)' }}>
                              {(() => {
                                const vis = available.filter(g => !groupSearch || g.toLowerCase().includes(groupSearch.toLowerCase()));
                                if (available.length === 0) return <div style={{ padding:'0.65rem 0.9rem', fontSize:'0.78rem', color:'var(--text-secondary)', fontStyle:'italic' }}>All detected groups already mapped.</div>;
                                if (vis.length === 0) return <div style={{ padding:'0.65rem 0.9rem', fontSize:'0.78rem', color:'var(--text-secondary)', fontStyle:'italic' }}>No groups match.</div>;
                                return vis.map(g => (
                                  <div key={g} onClick={() => toggleGroup(role.name, g)} style={{ padding:'0.5rem 0.9rem', cursor:'pointer', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:'0.5rem', borderBottom:'1px solid var(--panel-border)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = `${roleColor}15`}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <span style={{ fontSize:'0.75rem' }}>🗂</span><span style={{ flex:1 }}>{g}</span><span style={{ fontSize:'0.7rem', color:roleColor, opacity:0.7 }}>+ Add</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ ...LBL_STYLE, marginBottom:'0.45rem' }}>Or type manually</div>
                          <div style={{ display:'flex', gap:'0.5rem' }}>
                            <input value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addManualGroup(role.name); }} placeholder="CN=IT-Team,DC=company,DC=com" style={{ ...INP_STYLE, fontSize:'0.82rem', padding:'0.5rem 0.75rem' }}/>
                            <button onClick={() => addManualGroup(role.name)} style={{ ...mkBtn('purple'), whiteSpace:'nowrap', flexShrink:0 }}><Plus size={12}/> Add</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'1.25rem', paddingTop:'1rem', borderTop:'1px solid var(--panel-border)' }}>
              <button onClick={fetchLdapGroups} disabled={groupsLoading} style={mkBtn('blue')}><RefreshCw size={12}/> Refresh LDAP Groups</button>
              <button onClick={saveMappings} disabled={saving} style={{ ...mkBtn('green'), opacity:saving?0.6:1 }}>{saving ? '⟳ Saving…' : <><Check size={12}/> Save Mappings</>}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assignees Panel (right column) ─────────────────────────────────────────
function AssigneesPanel({ role, users, api, toast, isAdmin, onRefreshUsers }) {
  const [ldapGroups,   setLdapGroups]   = useState([]);
  const [ldapLoading,  setLdapLoading]  = useState(false);
  const [mappings,     setMappings]     = useState({});
  const [showAssign,   setShowAssign]   = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [saving,       setSaving]       = useState(false);

  const roleColor = role?.color || SYSTEM_COLORS[role?.name] || '#6B7280';
  const assignedUsers = users.filter(u => u.role === role?.name);

  useEffect(() => {
    if (!role) return;
    fetchLdapMappings();
  }, [role?.name]); // eslint-disable-line

  const fetchLdapMappings = async () => {
    setLdapLoading(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings');
      if (r.ok) { const d = await r.json(); setMappings(d.mappings || d || {}); }
    } catch (_) {} finally { setLdapLoading(false); }
  };

  const fetchLdapGroupDetails = async () => {
    try {
      const r = await api.authFetch('/api/settings/ldap/info');
      if (r.ok) { const d = await r.json(); setLdapGroups(d.groups || []); }
    } catch (_) {}
  };

  useEffect(() => { fetchLdapGroupDetails(); }, []); // eslint-disable-line

  const handleAssignUser = async () => {
    if (!assignUserId) return;
    setSaving(true);
    try {
      await api.updateUser(assignUserId, { role: role.name });
      toast.success('User assigned to role');
      setShowAssign(false);
      setAssignUserId('');
      await onRefreshUsers();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleRemoveUser = async (user) => {
    if (!window.confirm(`Remove ${user.display_name || user.username} from role "${role.display_name}"?`)) return;
    try {
      await api.updateUser(user.id, { role: 'operator' });
      toast.success('User role reset to operator');
      await onRefreshUsers();
    } catch (e) { toast.error(e.message); }
  };

  const mappedGroups = mappings[role?.name] || [];
  const unassignedUsers = users.filter(u => u.role !== role?.name && !['super_admin'].includes(u.role));

  if (!role) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-secondary)', fontSize:'0.85rem', padding:'2rem', textAlign:'center' }}>
        Select a role to see its assignees
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Panel header */}
      <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid var(--panel-border)', fontSize:'12px', fontWeight:500, color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span>Assigned to <strong style={{ color:'white' }}>{role.display_name}</strong></span>
      </div>

      <div style={{ overflowY:'auto', flex:1, padding:'0 14px 14px' }}>
        {/* Local users */}
        <div style={{ paddingTop:10 }}>
          <div style={{ fontSize:'11px', fontWeight:500, color:'var(--text-secondary)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            Local users
            <span style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid var(--panel-border)', borderRadius:10, padding:'1px 7px', fontSize:10 }}>{assignedUsers.length}</span>
          </div>

          {assignedUsers.length === 0 ? (
            <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.2)', fontStyle:'italic', marginBottom:8 }}>No users assigned</div>
          ) : (
            assignedUsers.map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'0.5px solid var(--panel-border)' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:500, flexShrink:0, background:`${roleColor}20`, color:roleColor }}>
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.display_name || u.username}</div>
                  <div style={{ fontSize:10, color:'var(--text-secondary)' }}>@{u.username} · {u.enabled ? 'active':'disabled'}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => handleRemoveUser(u)} style={{ background:'none', border:'none', color:'rgba(255,71,87,0.5)', cursor:'pointer', padding:'2px 4px', fontSize:'0.75rem', borderRadius:4 }} title="Remove from role">
                    <X size={12}/>
                  </button>
                )}
              </div>
            ))
          )}

          {isAdmin && (
            <>
              {showAssign ? (
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                  <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                    style={{ ...INP_STYLE, fontSize:'0.8rem', padding:'0.4rem 0.7rem', colorScheme:'dark' }}>
                    <option value="">Select user…</option>
                    {unassignedUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.display_name || u.username} (@{u.username})</option>
                    ))}
                  </select>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => setShowAssign(false)} style={{ ...mkBtn('gray'), flex:1, justifyContent:'center', fontSize:'0.75rem' }}>Cancel</button>
                    <button onClick={handleAssignUser} disabled={!assignUserId || saving} style={{ ...mkBtn('blue'), flex:1, justifyContent:'center', fontSize:'0.75rem', opacity: (!assignUserId || saving) ? 0.5:1 }}>
                      {saving ? '⟳':'Assign'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAssign(true)} style={{ width:'100%', border:'0.5px dashed var(--panel-border)', background:'none', borderRadius:6, padding:6, fontSize:11, cursor:'pointer', color:'var(--text-secondary)', marginTop:8 }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='white'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--text-secondary)'; }}>
                  + Assign user
                </button>
              )}
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ height:'0.5px', background:'var(--panel-border)', margin:'10px 0' }}/>

        {/* LDAP Groups */}
        <div>
          <div style={{ fontSize:'11px', fontWeight:500, color:'var(--text-secondary)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            LDAP groups
            <span style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid var(--panel-border)', borderRadius:10, padding:'1px 7px', fontSize:10 }}>{mappedGroups.length}</span>
          </div>

          {ldapLoading ? (
            <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Loading…</div>
          ) : mappedGroups.length === 0 ? (
            <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>No LDAP groups mapped</div>
          ) : (
            mappedGroups.map(g => (
              <div key={g} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'0.5px solid var(--panel-border)' }}>
                <div style={{ width:26, height:26, borderRadius:6, background:'rgba(253,150,68,0.12)', color:'#fd9644', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0 }}>
                  🗂
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                    <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8, background:'rgba(46,213,115,0.12)', color:'#2ed573' }}>mapped</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Divider */}
        <div style={{ height:'0.5px', background:'var(--panel-border)', margin:'10px 0' }}/>

        {/* Per-user overrides note */}
        <div>
          <div style={{ fontSize:'11px', fontWeight:500, color:'var(--text-secondary)', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
            <Shield size={11}/> Per-user overrides
          </div>
          <div style={{ fontSize:'11px', color:'var(--text-secondary)', lineHeight:1.5 }}>
            Override individual permissions regardless of role. Use the Permissions button (🔒) on a user in the Users tab.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers to evaluate a role's effective permission for a given perm key ─
function getRolePermValue(role, permKey) {
  if (!role) return false;
  // Super admin always has everything
  if (role.name === 'super_admin') return true;
  // Feature flags
  if (['can_announce','can_schedule','can_library','can_requests','can_settings'].includes(permKey)) {
    return !!role[`default_${permKey}`];
  }
  // Deck actions
  if (permKey.startsWith('deck.')) return (role.default_deck_actions || []).includes(permKey);
  // Admin-level system perms (user management, audit logs)
  if (['user_management','audit_logs'].includes(permKey)) {
    return ['admin','super_admin'].includes(role.name);
  }
  return false;
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RolesPage() {
  const { api, toast, currentUser } = useApp();

  const [roles,        setRoles]        = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [editMode,     setEditMode]     = useState(false);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editRole,     setEditRole]     = useState(null);
  const [roleForm,     setRoleForm]     = useState(EMPTY_ROLE_FORM);
  const [roleSaving,   setRoleSaving]   = useState(false);

  const [showLdap, setShowLdap] = useState(false);

  const isSuper = currentUser?.is_super_admin;
  const isAdmin = currentUser?.role === 'admin' || isSuper;

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([api.getRoles(), api.getUsers()]);
      setRoles(r);
      setUsers(u);
      // Keep selected role in sync
      setSelectedRole(prev => prev ? (r.find(x => x.id === prev.id) || r[0] || null) : (r[0] || null));
    } catch (e) { toast.error('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, [api, toast]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  // ── Role CRUD ─────────────────────────────────────────────────────────────
  const openCreateRole = () => {
    setRoleForm({ ...EMPTY_ROLE_FORM });
    setEditRole(null);
    setShowRoleForm(true);
  };

  const openEditRole = (role) => {
    setRoleForm({
      name: role.name, display_name: role.display_name, description: role.description || '', color: role.color || '#2563EB',
      default_allowed_decks:  role.default_allowed_decks  || DECK_IDS,
      default_deck_control:   role.default_deck_control   || DEFAULT_DECK_CONTROL,
      default_deck_actions:   role.default_deck_actions   || DEFAULT_DECK_ACTIONS,
      default_playlist_perms: role.default_playlist_perms || DEFAULT_PLAYLIST_PERMS,
      default_can_announce: role.default_can_announce ?? true,
      default_can_schedule: role.default_can_schedule ?? true,
      default_can_library:  role.default_can_library  ?? true,
      default_can_requests: role.default_can_requests ?? true,
      default_can_settings: role.default_can_settings ?? false,
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
          display_name: roleForm.display_name.trim(), description: roleForm.description, color: roleForm.color,
          default_allowed_decks: roleForm.default_allowed_decks, default_deck_control: roleForm.default_deck_control,
          default_deck_actions: roleForm.default_deck_actions, default_playlist_perms: roleForm.default_playlist_perms,
          default_can_announce: roleForm.default_can_announce, default_can_schedule: roleForm.default_can_schedule,
          default_can_library: roleForm.default_can_library, default_can_requests: roleForm.default_can_requests, default_can_settings: roleForm.default_can_settings,
        });
        toast.success(`Role "${roleForm.display_name}" updated!`);
      } else {
        await api.createRole({
          name: roleForm.name.trim().toLowerCase().replace(/\s+/g,'_'),
          display_name: roleForm.display_name.trim(), description: roleForm.description, color: roleForm.color,
          default_allowed_decks: roleForm.default_allowed_decks, default_deck_control: roleForm.default_deck_control,
          default_deck_actions: roleForm.default_deck_actions, default_playlist_perms: roleForm.default_playlist_perms,
          default_can_announce: roleForm.default_can_announce, default_can_schedule: roleForm.default_can_schedule,
          default_can_library: roleForm.default_can_library, default_can_requests: roleForm.default_can_requests, default_can_settings: roleForm.default_can_settings,
        });
        toast.success(`Role "${roleForm.display_name}" created!`);
      }
      setShowRoleForm(false); setEditRole(null);
      await loadAll();
    } catch (e) { toast.error(e.message); } finally { setRoleSaving(false); }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Delete role "${role.display_name}"? Users will need to be reassigned.`)) return;
    try { await api.deleteRole(role.id); toast.success(`Role "${role.display_name}" deleted`); await loadAll(); }
    catch (e) { toast.error(e.message); }
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  // Group permission matrix rows by group
  const permGroups = [...new Set(PERM_MATRIX_ROWS.map(r => r.group))];

  if (loading) return <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div>
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <div style={{ fontSize:'1.3rem', fontWeight:500, color:'white' }}>Roles &amp; Permissions</div>
          <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginTop:2 }}>Manage access control for local users and LDAP groups</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={loadAll} style={mkBtn('blue')}><RefreshCw size={13}/> Refresh</button>
          <button onClick={() => setShowLdap(v => !v)} style={{ ...mkBtn('purple'), background: showLdap ? 'rgba(165,94,234,0.2)':'rgba(165,94,234,0.1)' }}>
            <Link2 size={13}/> {showLdap ? 'Hide LDAP':'LDAP Mapping'}
          </button>
          {isAdmin && (
            <button onClick={openCreateRole} style={{ ...mkBtn('green') }}><Plus size={13}/> New Role</button>
          )}
        </div>
      </div>

      {/* LDAP mapping panel (expandable) */}
      {showLdap && roles.length > 0 && (
        <LdapGroupMappingPanel roles={roles} api={api} toast={toast} isAdmin={isAdmin}/>
      )}

      {/* 3-panel layout */}
      <div style={{
        display:'grid', gridTemplateColumns:'220px 1fr 260px', gap:0,
        border:'1px solid var(--panel-border)', borderRadius:12,
        overflow:'hidden', background:'rgba(10,10,16,0.8)',
        minHeight:520,
      }}>

        {/* ── LEFT: Role list ─────────────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', borderRight:'1px solid var(--panel-border)', overflow:'hidden' }}>
          <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid var(--panel-border)', fontSize:12, fontWeight:500, color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            Roles
            <span style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid var(--panel-border)', borderRadius:10, padding:'1px 7px', fontSize:10 }}>{roles.length}</span>
          </div>
          <div style={{ overflowY:'auto', flex:1 }}>
            {roles.map(role => {
              const roleColor  = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
              const userCount  = users.filter(u => u.role === role.name).length;
              const isActive   = selectedRole?.id === role.id;
              const isProtected = role.name === 'super_admin';
              return (
                <div key={role.id}
                  onClick={() => { setSelectedRole(role); setEditMode(false); }}
                  style={{
                    padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid var(--panel-border)',
                    background: isActive ? `${roleColor}15`:'transparent',
                    borderLeft: isActive ? `3px solid ${roleColor}`:'3px solid transparent',
                    transition:'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:roleColor, flexShrink:0 }}/>
                      <span style={{ fontWeight:600, fontSize:13, color: isActive ? roleColor:'white' }}>{role.display_name}</span>
                    </div>
                    {isAdmin && !isProtected && (
                      <div style={{ display:'flex', gap:3, opacity:0 }} className="role-actions"
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        ref={el => { if (el) el.parentElement.onmouseenter = () => el.style.opacity=1; if (el) el.parentElement.onmouseleave = () => el.style.opacity=0; }}>
                        <button onClick={e => { e.stopPropagation(); openEditRole(role); }} style={{ ...mkBtn('blue'), padding:'2px 5px' }} title="Edit"><Edit2 size={10}/></button>
                        {isSuper && !role.is_system && <button onClick={e => { e.stopPropagation(); handleDeleteRole(role); }} style={{ ...mkBtn('red'), padding:'2px 5px' }} title="Delete"><Trash2 size={10}/></button>}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, paddingLeft:14 }}>
                    {userCount} user{userCount !== 1 ? 's':''}{role.is_system ? ' · system':''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTER: Permission matrix ───────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', borderRight:'1px solid var(--panel-border)', overflow:'hidden' }}>
          <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid var(--panel-border)', fontSize:12, fontWeight:500, color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <span>Permission matrix{selectedRole && <> — <strong style={{ color:'white' }}>{selectedRole.display_name}</strong></>}</span>
            {isAdmin && selectedRole && !['super_admin'].includes(selectedRole?.name) && (
              <button onClick={() => { openEditRole(selectedRole); }} style={{ ...mkBtn('blue'), padding:'3px 8px', fontSize:11 }}><Edit2 size={11}/> Edit</button>
            )}
          </div>
          <div style={{ overflowY:'auto', flex:1 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:500, fontSize:11, color:'var(--text-secondary)', borderBottom:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.2)', position:'sticky', top:0, zIndex:2, width:200 }}>Permission</th>
                  {roles.map(role => {
                    const rc = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
                    const isActive = selectedRole?.id === role.id;
                    return (
                      <th key={role.id}
                        onClick={() => setSelectedRole(role)}
                        style={{
                          padding:'8px 10px', textAlign:'center', minWidth:70, fontSize:11,
                          color: isActive ? rc:'var(--text-secondary)',
                          borderBottom: isActive ? `2px solid ${rc}`:'1px solid var(--panel-border)',
                          background: isActive ? `${rc}10`:'rgba(0,0,0,0.2)',
                          position:'sticky', top:0, zIndex:2, cursor:'pointer',
                          transition:'background 0.15s',
                        }}>
                        {role.display_name.split(' ').map((w, i) => <div key={i}>{w}</div>)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {permGroups.map(group => (
                  <React.Fragment key={group}>
                    {/* Group header row */}
                    <tr>
                      <td colSpan={roles.length + 1} style={{ background:'rgba(255,255,255,0.04)', fontSize:11, fontWeight:500, color:'var(--text-secondary)', padding:'5px 10px 4px' }}>
                        {group}
                      </td>
                    </tr>
                    {PERM_MATRIX_ROWS.filter(r => r.group === group).map(row => (
                      <tr key={row.key}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid var(--panel-border)', verticalAlign:'middle' }}>
                          <div style={{ fontSize:12, color:'white', fontWeight:500 }}>{row.label}</div>
                          <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:1 }}>{row.desc}</div>
                        </td>
                        {roles.map(role => {
                          const rc = role.color || SYSTEM_COLORS[role.name] || '#6B7280';
                          const isActive = selectedRole?.id === role.id;
                          const hasPerm  = getRolePermValue(role, row.key);
                          return (
                            <td key={role.id}
                              style={{
                                padding:'6px 10px', borderBottom:'1px solid var(--panel-border)',
                                textAlign:'center', verticalAlign:'middle',
                                background: isActive ? `color-mix(in srgb, ${rc} 8%, transparent)`:'transparent',
                              }}>
                              {hasPerm
                                ? <span style={{ color: isActive ? rc:'#2ed573', fontSize:14, fontWeight:700 }}>✓</span>
                                : <span style={{ color:'rgba(255,255,255,0.15)', fontSize:13 }}>–</span>
                              }
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT: Assignees panel ──────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <AssigneesPanel
            role={selectedRole}
            users={users}
            api={api}
            toast={toast}
            isAdmin={isAdmin}
            onRefreshUsers={loadAll}
          />
        </div>

      </div>{/* end 3-panel grid */}

      {/* ── Create / Edit Role Modal ──────────────────────────────────────── */}
      {showRoleForm && (
        <Modal title={editRole ? `Edit Role — ${editRole.display_name}`:'Create Custom Role'} onClose={() => { setShowRoleForm(false); setEditRole(null); }} wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {!editRole && (
                <div>
                  <label style={LBL_STYLE}>Role ID <span style={{ fontSize:'0.65rem' }}>(slug, no spaces)</span></label>
                  <input style={INP_STYLE} value={roleForm.name}
                    onChange={e => setRoleForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))}
                    placeholder="studio_operator"/>
                </div>
              )}
              <div>
                <label style={LBL_STYLE}>Display Name</label>
                <input style={INP_STYLE} value={roleForm.display_name}
                  onChange={e => setRoleForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Studio Operator"/>
              </div>
            </div>

            <div>
              <label style={LBL_STYLE}>Description</label>
              <input style={INP_STYLE} value={roleForm.description}
                onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this role…"/>
            </div>

            <div>
              <label style={LBL_STYLE}>Color</label>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <input type="color" value={roleForm.color} onChange={e => setRoleForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width:40, height:34, padding:2, borderRadius:6, border:'1px solid var(--panel-border)', background:'rgba(0,0,0,0.3)', cursor:'pointer' }}/>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {['#DC2626','#D97706','#2563EB','#16A34A','#7C3AED','#DB2777','#0891B2','#6B7280'].map(c => (
                    <button key={c} onClick={() => setRoleForm(p => ({ ...p, color: c }))}
                      style={{ width:22, height:22, borderRadius:'50%', background:c, border:`2px solid ${roleForm.color === c ? 'white':'transparent'}`, cursor:'pointer' }}/>
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
                keyPrefix="default_"/>
            </div>

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', borderTop:'1px solid var(--panel-border)', paddingTop:'1rem' }}>
              <button onClick={() => { setShowRoleForm(false); setEditRole(null); }} style={mkBtn('gray')}>Cancel</button>
              <button onClick={handleRoleSubmit} disabled={roleSaving} style={{ ...mkBtn('purple'), opacity:roleSaving?0.6:1 }}>
                {roleSaving ? '⟳ Saving…' : editRole ? <><Check size={13}/> Save Role</>:<><Plus size={13}/> Create Role</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
