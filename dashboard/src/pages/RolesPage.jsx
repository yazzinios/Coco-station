import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Check, RefreshCw,
  Mic2, Calendar, FolderOpen, Settings2, Music2,
  Play, Square, SkipForward, Volume2, ListMusic,
  Crosshair, Sliders, Eye, EyeOff, X, Shield,
} from 'lucide-react';
import { useApp } from '../context/useApp';

// ── Constants ─────────────────────────────────────────────────────────────
const DECK_IDS    = ['a','b','c','d','e','f'];
const DECK_LABELS = { a:'Deck A', b:'Deck B', c:'Deck C', d:'Deck D', e:'Deck E', f:'Deck F' };

const FEATURE_DEFS = [
  { key:'can_announce', label:'Announcements', icon:<Mic2 size={13}/> },
  { key:'can_schedule', label:'Schedules',     icon:<Calendar size={13}/> },
  { key:'can_library',  label:'Library',       icon:<FolderOpen size={13}/> },
  { key:'can_requests', label:'Requests',      icon:<Music2 size={13}/> },
  { key:'can_settings', label:'Settings',      icon:<Settings2 size={13}/> },
];

const DECK_ACTION_DEFS = [
  { key:'deck.play',          label:'Play',          icon:<Play size={12}/> },
  { key:'deck.pause',         label:'Pause',         icon:<span>⏸</span> },
  { key:'deck.stop',          label:'Stop',          icon:<Square size={12}/> },
  { key:'deck.next',          label:'Next Track',    icon:<SkipForward size={12}/> },
  { key:'deck.previous',      label:'Prev Track',    icon:<span>⏮</span> },
  { key:'deck.volume',        label:'Volume',        icon:<Volume2 size={12}/> },
  { key:'deck.crossfader',    label:'Crossfader',    icon:<Crosshair size={12}/> },
  { key:'deck.load_track',    label:'Load Track',    icon:<FolderOpen size={12}/> },
  { key:'deck.load_playlist', label:'Load Playlist', icon:<ListMusic size={12}/> },
];

const PLAYLIST_PERM_DEFS = [
  { key:'playlist.view',   label:'View'   },
  { key:'playlist.load',   label:'Load'   },
  { key:'playlist.create', label:'Create' },
  { key:'playlist.edit',   label:'Edit'   },
  { key:'playlist.delete', label:'Delete' },
];

const PERM_MATRIX_ROWS = [
  { group:'Deck control',       key:'deck.play',          label:'deck.play / pause / stop', desc:'Transport controls'    },
  { group:'Deck control',       key:'deck.volume',        label:'deck.volume',               desc:'Adjust fader level'    },
  { group:'Deck control',       key:'deck.load_playlist', label:'deck.load_playlist',        desc:'Load content to deck'  },
  { group:'Announcements',      key:'can_announce',       label:'can_announce',              desc:'Play announcements'    },
  { group:'Announcements',      key:'can_schedule',       label:'can_schedule',              desc:'Create/edit schedules' },
  { group:'Library & requests', key:'can_library',        label:'can_library',               desc:'Upload / manage files' },
  { group:'Library & requests', key:'can_requests',       label:'can_requests',              desc:'Handle music requests' },
  { group:'System',             key:'can_settings',       label:'can_settings',              desc:'System configuration'  },
  { group:'System',             key:'user_management',    label:'user management',           desc:'Create/edit users'     },
  { group:'System',             key:'audit_logs',         label:'audit logs',                desc:'View activity history' },
];

const PERM_GROUPS = [...new Set(PERM_MATRIX_ROWS.map(r => r.group))];

const SYSTEM_COLORS = {
  super_admin: '#A32D2D',
  admin:       '#185FA5',
  operator:    '#27500A',
  dj:          '#854F0B',
  viewer:      '#888780',
};

const DEFAULT_DECK_CONTROL   = Object.fromEntries(DECK_IDS.map(d => [d, { view:true, control:true }]));
const DEFAULT_DECK_ACTIONS   = ['deck.play','deck.pause','deck.stop','deck.next','deck.previous','deck.volume','deck.crossfader','deck.load_track','deck.load_playlist'];
const DEFAULT_PLAYLIST_PERMS = ['playlist.view','playlist.load'];

const EMPTY_FORM = {
  name:'', display_name:'', description:'', color:'#185FA5',
  default_allowed_decks:  DECK_IDS,
  default_deck_control:   DEFAULT_DECK_CONTROL,
  default_deck_actions:   DEFAULT_DECK_ACTIONS,
  default_playlist_perms: DEFAULT_PLAYLIST_PERMS,
  default_can_announce: true,  default_can_schedule: true,
  default_can_library:  true,  default_can_requests: true,
  default_can_settings: false,
};

// ── Design tokens ─────────────────────────────────────────────────────────
const BD   = 'var(--panel-border, rgba(255,255,255,0.10))';
const TXS  = 'var(--text-secondary, rgba(255,255,255,0.45))';
const INP  = { width:'100%', padding:'0.6rem 0.85rem', borderRadius:'8px', background:'rgba(0,0,0,0.35)', color:'white', border:'1px solid rgba(255,255,255,0.12)', fontFamily:'inherit', fontSize:'0.88rem', outline:'none', boxSizing:'border-box' };
const LBL  = { display:'block', fontSize:'0.72rem', color:TXS, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'0.38rem' };

const BTN_COLORS = {
  blue:   { bg:'rgba(0,212,255,0.10)',   bd:'rgba(0,212,255,0.30)',   tx:'#00d4ff' },
  green:  { bg:'rgba(46,213,115,0.10)',  bd:'rgba(46,213,115,0.35)',  tx:'#2ed573' },
  red:    { bg:'rgba(255,71,87,0.10)',   bd:'rgba(255,71,87,0.30)',   tx:'#ff4757' },
  purple: { bg:'rgba(165,94,234,0.10)',  bd:'rgba(165,94,234,0.30)',  tx:'#a55eea' },
  gray:   { bg:'rgba(255,255,255,0.04)', bd:'rgba(255,255,255,0.12)', tx:'rgba(255,255,255,0.45)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────
const roleColor = r => r?.color || SYSTEM_COLORS[r?.name] || '#888780';

function roleHasPerm(role, permKey) {
  if (!role) return false;
  if (role.name === 'super_admin') return true;
  if (['can_announce','can_schedule','can_library','can_requests','can_settings'].includes(permKey))
    return !!role[`default_${permKey}`];
  if (permKey.startsWith('deck.'))
    return (role.default_deck_actions || []).includes(permKey);
  if (['user_management','audit_logs'].includes(permKey))
    return ['admin','super_admin'].includes(role.name);
  return false;
}

// ── Primitive components ──────────────────────────────────────────────────
function Btn({ color='blue', sm, onClick, disabled, children, style={} }) {
  const s = BTN_COLORS[color] || BTN_COLORS.blue;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: sm ? '3px 8px' : '0.38rem 0.85rem',
      borderRadius:'6px', border:`0.5px solid ${s.bd}`,
      background:s.bg, color:s.tx,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: sm ? '11px' : '0.8rem',
      display:'inline-flex', alignItems:'center', gap:'0.32rem',
      fontFamily:'inherit', opacity: disabled ? 0.5 : 1, ...style,
    }}>
      {children}
    </button>
  );
}

function AddBtn({ onClick, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width:'100%', border:`0.5px dashed rgba(255,255,255,${hov ? '0.25' : '0.12'})`,
        background: hov ? 'rgba(255,255,255,0.04)' : 'none',
        borderRadius:'6px', padding:'6px', fontSize:'11px', cursor:'pointer',
        color: hov ? '#e8e8e8' : TXS, marginTop:'8px',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
        fontFamily:'inherit',
      }}>
      {children}
    </button>
  );
}

function PanelHeader({ left, right }) {
  return (
    <div style={{
      padding:'12px 14px 10px', borderBottom:`0.5px solid ${BD}`,
      fontSize:'12px', fontWeight:500, color:TXS,
      display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
    }}>
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function Badge({ n }) {
  return (
    <span style={{
      fontSize:'10px', background:'rgba(255,255,255,0.06)',
      border:`0.5px solid ${BD}`, borderRadius:'10px', padding:'1px 7px',
    }}>{n}</span>
  );
}

const Divider = () => <div style={{ height:'0.5px', background:BD, margin:'10px 0' }}/>;

function Modal({ title, onClose, children, wide }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.78)',
      backdropFilter:'blur(6px)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
    }}>
      <div style={{
        background:'rgba(14,14,22,0.98)', border:`1px solid ${BD}`,
        borderRadius:'14px', padding:'1.75rem', width:'100%',
        maxWidth: wide ? '700px' : '490px',
        boxShadow:'0 24px 64px rgba(0,0,0,0.8)', maxHeight:'90vh', overflowY:'auto',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, margin:0, color:'white' }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:TXS, cursor:'pointer', fontSize:'1.1rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Permission Editor (modal tabs) ────────────────────────────────────────
function PermEditor({ perms, setPerms, kp = '' }) {
  const [tab, setTab] = useState('decks');
  const dc  = perms[`${kp}deck_control`]   || DEFAULT_DECK_CONTROL;
  const da  = perms[`${kp}deck_actions`]   || [];
  const plp = perms[`${kp}playlist_perms`] || [];

  const setDeckPerm = (d, level, val) => setPerms(p => ({
    ...p,
    [`${kp}deck_control`]: {
      ...(p[`${kp}deck_control`] || DEFAULT_DECK_CONTROL),
      [d]: {
        ...(p[`${kp}deck_control`]?.[d] || { view:false, control:false }),
        [level]: val,
        ...(level === 'control' && val  ? { view:true }    : {}),
        ...(level === 'view'    && !val ? { control:false } : {}),
      },
    },
  }));

  const toggleAction = a => {
    const k = `${kp}deck_actions`;
    setPerms(p => ({ ...p, [k]: p[k]?.includes(a) ? p[k].filter(x => x !== a) : [...(p[k] || []), a] }));
  };

  const togglePP = pp => {
    const k = `${kp}playlist_perms`;
    setPerms(p => ({ ...p, [k]: p[k]?.includes(pp) ? p[k].filter(x => x !== pp) : [...(p[k] || []), pp] }));
  };

  const TABS = [
    { id:'decks',    label:'🎚 Decks'    },
    { id:'actions',  label:'⚡ Actions'  },
    { id:'features', label:'🧩 Features' },
  ];

  return (
    <div>
      <div style={{ display:'flex', borderBottom:`1px solid ${BD}`, marginBottom:'1rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'0.48rem 1rem', background:'none', border:'none', fontFamily:'inherit',
            borderBottom: tab === t.id ? '2px solid #00d4ff' : '2px solid transparent',
            color: tab === t.id ? '#00d4ff' : TXS,
            cursor:'pointer', fontSize:'0.82rem', fontWeight: tab === t.id ? 600 : 400, marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'decks' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {DECK_IDS.map(d => {
            const cfg = dc[d] || { view:false, control:false };
            return (
              <div key={d} style={{ padding:'0.65rem 0.95rem', borderRadius:'9px', background:'rgba(0,0,0,0.18)', border:`1px solid ${BD}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                  <span style={{ fontWeight:600, fontSize:'0.86rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <Sliders size={13} color={cfg.control ? '#00d4ff' : cfg.view ? '#ffd700' : 'rgba(255,255,255,0.2)'}/>
                    {DECK_LABELS[d]}
                  </span>
                  <span style={{ fontSize:'0.7rem', color: cfg.control ? '#00d4ff' : cfg.view ? '#ffd700' : 'rgba(255,255,255,0.2)' }}>
                    {cfg.control ? '🎛 Control' : cfg.view ? '👁 View only' : '🚫 No access'}
                  </span>
                </div>
                <div style={{ display:'flex', gap:'0.4rem' }}>
                  {[{ level:'view', label:'View', color:'#ffd700' }, { level:'control', label:'Control', color:'#00d4ff' }].map(({ level, label, color }) => {
                    const on = cfg[level];
                    return (
                      <button key={level} onClick={() => setDeckPerm(d, level, !on)} style={{
                        flex:1, padding:'0.36rem 0.5rem', borderRadius:'7px', cursor:'pointer',
                        fontFamily:'inherit', fontSize:'0.78rem',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem',
                        background: on ? `${color}14` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${on ? `${color}55` : BD}`,
                        color: on ? color : TXS,
                      }}>
                        {level === 'view' ? (on ? <Eye size={12}/> : <EyeOff size={12}/>) : <Sliders size={12}/>}
                        {label} {on ? '✓' : '✕'}
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
          <label style={LBL}>Deck Actions</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.38rem', marginBottom:'1.2rem' }}>
            {DECK_ACTION_DEFS.map(({ key, label, icon }) => {
              const on = da.includes(key);
              return (
                <button key={key} onClick={() => toggleAction(key)} style={{
                  display:'flex', alignItems:'center', gap:'0.48rem', padding:'0.48rem 0.7rem',
                  borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                  background: on ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${on ? 'rgba(0,212,255,0.3)' : BD}`,
                  color: on ? '#00d4ff' : TXS, fontSize:'0.8rem',
                }}>
                  {icon}<span style={{ flex:1 }}>{label}</span>{on && <Check size={11}/>}
                </button>
              );
            })}
          </div>
          <label style={LBL}>Playlist Permissions</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.38rem' }}>
            {PLAYLIST_PERM_DEFS.map(({ key, label }) => {
              const on = plp.includes(key);
              return (
                <button key={key} onClick={() => togglePP(key)} style={{
                  padding:'0.36rem 0.75rem', borderRadius:'20px', cursor:'pointer',
                  fontFamily:'inherit', fontSize:'0.78rem',
                  display:'flex', alignItems:'center', gap:'0.28rem',
                  background: on ? 'rgba(165,94,234,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? 'rgba(165,94,234,0.4)' : BD}`,
                  color: on ? '#a55eea' : TXS,
                }}>
                  {on && <Check size={10}/>}{label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'features' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem' }}>
          {FEATURE_DEFS.map(({ key, label, icon }) => {
            const rk = kp ? `${kp}${key}` : key;
            const on = !!perms[rk];
            return (
              <div key={key} onClick={() => setPerms(p => ({ ...p, [rk]: !p[rk] }))} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'0.62rem 0.88rem', borderRadius:'9px', cursor:'pointer',
                background: on ? 'rgba(46,213,115,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${on ? 'rgba(46,213,115,0.2)' : BD}`,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.55rem' }}>
                  <span style={{ color: on ? '#2ed573' : TXS }}>{icon}</span>
                  <span style={{ fontSize:'0.83rem', fontWeight:500, color: on ? 'white' : TXS }}>{label}</span>
                </div>
                <div style={{ width:33, height:17, borderRadius:9, position:'relative', background: on ? '#2ed573' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:2.5, left: on ? 17 : 3, width:12, height:12, borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── LDAP mapping panel ────────────────────────────────────────────────────
function LdapPanel({ roles, api, toast, isAdmin }) {
  const [mappings, setMappings] = useState({});
  const [groups,   setGroups]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [manual,   setManual]   = useState('');
  const [ldapOk,   setLdapOk]   = useState(true);

  useEffect(() => {
    api.authFetch('/api/settings/ldap/role-mappings')
      .then(r => r.ok ? r.json() : {})
      .then(d => { setMappings(d.mappings || d || {}); setLdapOk(d.ldap_enabled ?? true); })
      .catch(() => {});
    setLoading(true);
    api.authFetch('/api/settings/ldap/info')
      .then(r => r.ok ? r.json() : {})
      .then(d => { setGroups(d.groups || []); setLdapOk(!d.error); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const toggle    = (rn, g) => setMappings(p => { const c = p[rn] || []; return { ...p, [rn]: c.includes(g) ? c.filter(x => x !== g) : [...c, g] }; });
  const removeGrp = (rn, g) => setMappings(p => ({ ...p, [rn]: (p[rn] || []).filter(x => x !== g) }));
  const addManual = (rn) => {
    const g = manual.trim(); if (!g) return;
    setMappings(p => { const c = p[rn] || []; return c.includes(g) ? p : { ...p, [rn]: [...c, g] }; });
    setManual('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.authFetch('/api/settings/ldap/role-mappings', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ mappings }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      toast.success('LDAP mappings saved');
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ background:'rgba(165,94,234,0.04)', border:'1px solid rgba(165,94,234,0.18)', borderRadius:'10px', padding:'1.1rem 1.25rem', marginBottom:'1.25rem' }}>
      {!ldapOk && (
        <div style={{ padding:'0.6rem 0.9rem', borderRadius:'8px', marginBottom:'1rem', background:'rgba(253,150,68,0.08)', border:'1px solid rgba(253,150,68,0.3)', fontSize:'0.8rem', color:'#fd9644' }}>
          ⚠ LDAP not reachable — you can still configure mappings.
        </div>
      )}
      <div style={{ fontSize:'0.78rem', color:TXS, marginBottom:'1rem' }}>
        📌 At login, a user's LDAP groups are matched here. First match wins. No match → default operator role.
      </div>
      {loading && <div style={{ fontSize:'0.8rem', color:TXS }}>Loading LDAP groups…</div>}
      <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
        {roles.map(role => {
          const color = roleColor(role);
          const sel   = mappings[role.name] || [];
          return (
            <div key={role.name} style={{ borderRadius:'9px', border:`1px solid ${color}33`, background:`${color}08`, overflow:'hidden' }}>
              <div style={{ padding:'0.6rem 0.9rem', borderBottom:`1px solid ${color}22`, background:`${color}10`, display:'flex', alignItems:'center', gap:'0.55rem' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:color, flexShrink:0 }}/>
                <span style={{ fontWeight:600, fontSize:'0.86rem', color }}>{role.display_name}</span>
                {sel.length > 0 && <span style={{ marginLeft:'auto', fontSize:'0.7rem', padding:'0.1rem 0.45rem', borderRadius:'10px', background:`${color}18`, border:`1px solid ${color}40`, color }}>{sel.length} mapped</span>}
              </div>
              <div style={{ padding:'0.75rem 0.9rem', display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                {sel.length > 0 ? (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem' }}>
                    {sel.map(g => (
                      <span key={g} style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.22rem 0.55rem', borderRadius:'20px', fontSize:'0.74rem', background:`${color}18`, border:`1px solid ${color}45`, color }}>
                        🗂 {g}
                        {isAdmin && <button onClick={() => removeGrp(role.name, g)} style={{ background:'none', border:'none', color, cursor:'pointer', padding:0, fontSize:'0.7rem', opacity:0.7 }}>✕</button>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:'0.77rem', color:'rgba(255,255,255,0.22)', fontStyle:'italic' }}>No groups mapped.</div>
                )}
                {isAdmin && groups.filter(g => !sel.includes(g)).length > 0 && (
                  <div style={{ maxHeight:'120px', overflowY:'auto', borderRadius:'7px', border:`1px solid ${BD}`, background:'rgba(0,0,0,0.22)' }}>
                    {groups.filter(g => !sel.includes(g)).map(g => (
                      <div key={g} onClick={() => toggle(role.name, g)}
                        style={{ padding:'0.45rem 0.8rem', cursor:'pointer', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.45rem', borderBottom:`1px solid ${BD}` }}
                        onMouseEnter={e => e.currentTarget.style.background = `${color}14`}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize:'0.73rem' }}>🗂</span>
                        <span style={{ flex:1 }}>{g}</span>
                        <span style={{ fontSize:'0.69rem', color, opacity:0.7 }}>+ Add</span>
                      </div>
                    ))}
                  </div>
                )}
                {isAdmin && (
                  <div style={{ display:'flex', gap:'0.45rem' }}>
                    <input value={manual} onChange={e => setManual(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addManual(role.name)}
                      placeholder="CN=IT,DC=company,DC=com"
                      style={{ ...INP, fontSize:'0.8rem', padding:'0.42rem 0.7rem' }}/>
                    <Btn color="purple" onClick={() => addManual(role.name)} style={{ whiteSpace:'nowrap', flexShrink:0 }}>
                      <Plus size={11}/> Add
                    </Btn>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.65rem', marginTop:'1rem', paddingTop:'0.9rem', borderTop:`1px solid ${BD}` }}>
          <Btn color="blue" onClick={() => {
            setLoading(true);
            api.authFetch('/api/settings/ldap/info').then(r => r.ok ? r.json() : {}).then(d => setGroups(d.groups || [])).catch(() => {}).finally(() => setLoading(false));
          }} disabled={loading}><RefreshCw size={12}/> Refresh</Btn>
          <Btn color="green" onClick={save} disabled={saving}>{saving ? '⟳ Saving…' : <><Check size={12}/> Save mappings</>}</Btn>
        </div>
      )}
    </div>
  );
}

// ── Right panel — Assignees + LDAP groups + per-user overrides ────────────
function AssigneesPanel({ role, users, api, toast, isAdmin, onRefresh }) {
  const color = roleColor(role);
  const [mappings,    setMappings]    = useState({});
  const [ldapLoading, setLdapLoading] = useState(false);
  const [showAssign,  setShowAssign]  = useState(false);
  const [assignId,    setAssignId]    = useState('');
  const [saving,      setSaving]      = useState(false);

  const assigned  = users.filter(u => u.role === role?.name);
  const mapped    = mappings[role?.name] || [];
  const available = users.filter(u => u.role !== role?.name && u.role !== 'super_admin');

  // per-user overrides: users in this role who have permission_overrides set
  const withOverrides = assigned.filter(u => u.permission_overrides && Object.keys(u.permission_overrides).length > 0);

  useEffect(() => {
    if (!role) return;
    setLdapLoading(true);
    api.authFetch('/api/settings/ldap/role-mappings')
      .then(r => r.ok ? r.json() : {})
      .then(d => setMappings(d.mappings || d || {}))
      .catch(() => {})
      .finally(() => setLdapLoading(false));
  }, [role?.name]); // eslint-disable-line

  const doAssign = async () => {
    if (!assignId) return;
    setSaving(true);
    try {
      await api.updateUser(assignId, { role: role.name });
      toast.success('User assigned');
      setShowAssign(false); setAssignId('');
      await onRefresh();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const doRemove = async (user) => {
    if (!window.confirm(`Remove ${user.display_name || user.username} from "${role.display_name}"?`)) return;
    try {
      await api.updateUser(user.id, { role:'operator' });
      toast.success('Role reset to operator');
      await onRefresh();
    } catch(e) { toast.error(e.message); }
  };

  if (!role) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:TXS, fontSize:'0.85rem', padding:'2rem', textAlign:'center' }}>
      Select a role to see its assignees
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <PanelHeader left={<>Assigned to <strong style={{ color:'white' }}>{role.display_name}</strong></>}/>

      <div style={{ overflowY:'auto', flex:1, padding:'0 14px 14px' }}>

        {/* Local users */}
        <div style={{ paddingTop:10 }}>
          <div style={{ fontSize:'11px', fontWeight:500, color:TXS, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            Local users <Badge n={assigned.length}/>
          </div>

          {assigned.length === 0
            ? <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)', fontStyle:'italic', marginBottom:6 }}>No users assigned</div>
            : assigned.map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`0.5px solid ${BD}` }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, flexShrink:0, background:`${color}22`, color }}>
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.display_name || u.username}</div>
                  <div style={{ fontSize:10, color:TXS }}>@{u.username} · {u.enabled ? 'active' : 'disabled'}</div>
                </div>
                {isAdmin && (
                  <button onClick={() => doRemove(u)} style={{ background:'none', border:'none', color:'rgba(255,71,87,0.45)', cursor:'pointer', padding:'2px 4px', borderRadius:4 }}>
                    <X size={11}/>
                  </button>
                )}
              </div>
            ))
          }

          {isAdmin && (
            showAssign ? (
              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                <select value={assignId} onChange={e => setAssignId(e.target.value)}
                  style={{ ...INP, fontSize:'0.8rem', padding:'0.38rem 0.65rem', colorScheme:'dark' }}>
                  <option value="">Select user…</option>
                  {available.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name || u.username} (@{u.username})</option>
                  ))}
                </select>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn color="gray" onClick={() => setShowAssign(false)} style={{ flex:1, justifyContent:'center', fontSize:'0.75rem' }}>Cancel</Btn>
                  <Btn color="blue" onClick={doAssign} disabled={!assignId || saving} style={{ flex:1, justifyContent:'center', fontSize:'0.75rem' }}>
                    {saving ? '⟳' : 'Assign'}
                  </Btn>
                </div>
              </div>
            ) : (
              <AddBtn onClick={() => setShowAssign(true)}>+ Assign user</AddBtn>
            )
          )}
        </div>

        <Divider/>

        {/* LDAP groups */}
        <div>
          <div style={{ fontSize:'11px', fontWeight:500, color:TXS, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            🗄 LDAP groups <Badge n={mapped.length}/>
          </div>

          {ldapLoading
            ? <div style={{ fontSize:'11px', color:TXS }}>Loading…</div>
            : mapped.length === 0
              ? <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>No LDAP groups mapped</div>
              : mapped.map(g => (
                <div key={g} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`0.5px solid ${BD}` }}>
                  {/* Amber rounded square icon — exact mockup look */}
                  <div style={{ width:26, height:26, borderRadius:'6px', background:'rgba(253,150,68,0.14)', color:'#fd9644', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                    👥
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                      <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8, background:'rgba(46,213,115,0.13)', color:'#2ed573' }}>synced</span>
                    </div>
                  </div>
                </div>
              ))
          }
          {isAdmin && <AddBtn onClick={() => {}}>+ Map LDAP group</AddBtn>}
        </div>

        <Divider/>

        {/* Per-user overrides */}
        <div>
          <div style={{ fontSize:'11px', fontWeight:500, color:TXS, marginBottom:6, display:'flex', alignItems:'center', gap:5 }}>
            <Shield size={11}/> Per-user overrides
          </div>
          <div style={{ fontSize:'11px', color:TXS, marginBottom:6 }}>
            Override individual permissions regardless of role
          </div>

          {withOverrides.length === 0
            ? <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.18)', fontStyle:'italic' }}>No overrides set</div>
            : withOverrides.map(u => {
              const ov = u.permission_overrides || {};
              return Object.entries(ov).slice(0, 4).map(([perm, val]) => (
                <div key={`${u.id}-${perm}`} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, flexShrink:0, background:'rgba(253,150,68,0.15)', color:'#fd9644' }}>
                    {(u.display_name || u.username).charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize:'11px', color:TXS, flex:1 }}>
                    {u.username} {u.ldap_dn ? '(LDAP)' : '(local)'}
                  </span>
                  {/* +can_settings / –can_library badges matching mockup */}
                  <span style={{
                    fontSize:'10px', padding:'1px 6px', borderRadius:'8px',
                    background: val ? 'rgba(46,213,115,0.12)' : 'rgba(255,71,87,0.10)',
                    color: val ? '#2ed573' : '#ff4757',
                  }}>{val ? '+' : '–'}{perm}</span>
                </div>
              ));
            })
          }
          {isAdmin && <AddBtn onClick={() => {}}>+ Add override</AddBtn>}
        </div>

      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function RolesPage() {
  const { api, toast, currentUser } = useApp();

  const [roles,        setRoles]        = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showLdap,     setShowLdap]     = useState(false);

  const [showForm,   setShowForm]   = useState(false);
  const [editRole,   setEditRole]   = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);

  const isSuper = currentUser?.is_super_admin;
  const isAdmin = currentUser?.role === 'admin' || isSuper;

  // ── Loaders ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([api.getRoles(), api.getUsers()]);
      setRoles(r); setUsers(u);
      setSelectedRole(prev => prev ? (r.find(x => x.id === prev.id) || r[0] || null) : (r[0] || null));
    } catch(e) { toast.error('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, [api, toast]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  // ── CRUD ──
  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditRole(null); setShowForm(true); };

  const openEdit = (role) => {
    setForm({
      name: role.name, display_name: role.display_name,
      description: role.description || '', color: role.color || '#185FA5',
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
    setEditRole(role); setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.display_name.trim()) { toast.error('Display name required'); return; }
    setFormSaving(true);
    try {
      const payload = {
        display_name: form.display_name.trim(), description: form.description, color: form.color,
        default_allowed_decks: form.default_allowed_decks,
        default_deck_control: form.default_deck_control,
        default_deck_actions: form.default_deck_actions,
        default_playlist_perms: form.default_playlist_perms,
        default_can_announce: form.default_can_announce,
        default_can_schedule: form.default_can_schedule,
        default_can_library:  form.default_can_library,
        default_can_requests: form.default_can_requests,
        default_can_settings: form.default_can_settings,
      };
      if (editRole) {
        await api.updateRole(editRole.id, payload);
        toast.success(`Role "${form.display_name}" updated`);
      } else {
        await api.createRole({ name: form.name.trim().toLowerCase().replace(/\s+/g,'_'), ...payload });
        toast.success(`Role "${form.display_name}" created`);
      }
      setShowForm(false); setEditRole(null); await loadAll();
    } catch(e) { toast.error(e.message); } finally { setFormSaving(false); }
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Delete "${role.display_name}"?`)) return;
    try { await api.deleteRole(role.id); toast.success('Role deleted'); await loadAll(); }
    catch(e) { toast.error(e.message); }
  };

  // Inline checkbox toggle for selected role's editable cells
  const toggleInlinePerm = async (role, permKey) => {
    if (!isAdmin || role.name === 'super_admin') return;
    const cur = roleHasPerm(role, permKey);
    const update = {};
    if (['can_announce','can_schedule','can_library','can_requests','can_settings'].includes(permKey)) {
      update[`default_${permKey}`] = !cur;
    } else if (permKey.startsWith('deck.')) {
      const da = role.default_deck_actions || [];
      update.default_deck_actions = cur ? da.filter(a => a !== permKey) : [...da, permKey];
    } else return;
    try { await api.updateRole(role.id, update); await loadAll(); }
    catch(e) { toast.error(e.message); }
  };

  if (loading) return (
    <div style={{ padding:'3rem', textAlign:'center', color:TXS }}>Loading…</div>
  );

  return (
    <div>

      {/* ── Page header — exact mockup layout ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 2px 12px', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <div style={{ fontSize:'16px', fontWeight:500, color:'white' }}>Roles &amp; permissions</div>
          <div style={{ fontSize:'12px', color:TXS, marginTop:2 }}>Manage access control for local users and LDAP groups</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {/* Sync LDAP — toggles the LDAP panel, matches mockup button */}
          <Btn color="gray" sm onClick={() => setShowLdap(v => !v)} style={{ fontSize:'12px', padding:'5px 12px' }}>
            <RefreshCw size={12}/> Sync LDAP
          </Btn>
          {isAdmin && (
            <Btn color="blue" sm onClick={openCreate} style={{ fontSize:'12px', padding:'5px 12px' }}>
              <Plus size={12}/> New role
            </Btn>
          )}
        </div>
      </div>

      {/* LDAP panel */}
      {showLdap && roles.length > 0 && (
        <LdapPanel roles={roles} api={api} toast={toast} isAdmin={isAdmin}/>
      )}

      {/* ── 3-panel grid — 220 | flex | 260, height 600 ── */}
      <div style={{
        display:'grid', gridTemplateColumns:'220px 1fr 260px',
        border:`0.5px solid ${BD}`,
        borderRadius:'var(--border-radius-lg, 10px)',
        overflow:'hidden',
        background:'rgba(8,8,14,0.85)',
        height:600,
      }}>

        {/* ── LEFT: Role list ── */}
        <div style={{ display:'flex', flexDirection:'column', borderRight:`0.5px solid ${BD}`, overflow:'hidden' }}>
          <PanelHeader left={<>Roles <Badge n={roles.length}/></>}/>
          <div style={{ overflowY:'auto', flex:1 }}>
            {roles.map(role => {
              const color    = roleColor(role);
              const count    = users.filter(u => u.role === role.name).length;
              const isActive = selectedRole?.id === role.id;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  style={{
                    padding:'9px 14px', cursor:'pointer',
                    borderBottom:`0.5px solid ${BD}`,
                    // Active state matches mockup: blue wash background, blue text
                    background: isActive
                      ? 'var(--color-background-info, rgba(24,95,165,0.18))'
                      : 'transparent',
                    color: isActive
                      ? 'var(--color-text-info, #4fa3e8)'
                      : 'inherit',
                    transition:'background 0.1s',
                    position:'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-background-secondary, rgba(255,255,255,0.035))'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>

                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:500, fontSize:'13px', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }}/>
                      {role.display_name}
                    </div>
                    {/* Edit/delete — shown on row hover via inline ref trick */}
                    {isAdmin && role.name !== 'super_admin' && (
                      <div style={{ display:'flex', gap:3 }}
                        ref={el => {
                          if (!el) return;
                          el.style.opacity = '0';
                          const row = el.parentElement?.parentElement;
                          if (row) {
                            row.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
                            row.addEventListener('mouseleave', () => { el.style.opacity = '0'; });
                          }
                        }}>
                        <Btn color="blue" sm onClick={e => { e.stopPropagation(); openEdit(role); }} style={{ padding:'2px 5px' }}>
                          <Edit2 size={9}/>
                        </Btn>
                        {isSuper && !role.is_system && (
                          <Btn color="red" sm onClick={e => { e.stopPropagation(); deleteRole(role); }} style={{ padding:'2px 5px' }}>
                            <Trash2 size={9}/>
                          </Btn>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize:'11px', color: isActive ? 'var(--color-text-info, #4fa3e8)' : TXS, opacity: isActive ? 0.75 : 1, marginTop:2, paddingLeft:14 }}>
                    {role.description || `${count} user${count !== 1 ? 's' : ''}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTER: Permission matrix ── */}
        <div style={{ display:'flex', flexDirection:'column', borderRight:`0.5px solid ${BD}`, overflow:'hidden' }}>
          <PanelHeader
            left={<>Permission matrix{selectedRole && <> — <strong style={{ color:'white' }}>{selectedRole.display_name}</strong></>}</>}
            right={isAdmin && selectedRole && selectedRole.name !== 'super_admin' && (
              <Btn color="blue" sm onClick={() => openEdit(selectedRole)} style={{ fontSize:'11px', padding:'3px 8px' }}>
                <Edit2 size={10}/> Edit
              </Btn>
            )}
          />
          <div style={{ overflowY:'auto', flex:1 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr>
                  <th style={{
                    padding:'8px 10px', textAlign:'left', fontWeight:500, fontSize:'11px',
                    color:TXS, borderBottom:`0.5px solid ${BD}`,
                    background:'var(--color-background-secondary, rgba(0,0,0,0.22))',
                    position:'sticky', top:0, zIndex:2, width:200,
                  }}>Permission</th>

                  {roles.map(role => {
                    const color    = roleColor(role);
                    const isActive = selectedRole?.id === role.id;
                    return (
                      <th key={role.id} onClick={() => setSelectedRole(role)} style={{
                        padding:'8px 10px', textAlign:'center', minWidth:70,
                        fontSize:'11px', maxWidth:80, overflow:'hidden',
                        cursor:'pointer',
                        color: isActive ? color : TXS,
                        // Active column: highlighted border-bottom matches mockup
                        borderBottom: isActive ? `2px solid ${color}` : `0.5px solid ${BD}`,
                        background: isActive
                          ? `color-mix(in srgb, ${color} 10%, transparent)`
                          : 'var(--color-background-secondary, rgba(0,0,0,0.22))',
                        position:'sticky', top:0, zIndex:2,
                      }}>
                        {role.display_name.split(' ').map((w, i) => <div key={i}>{w}</div>)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {PERM_GROUPS.map(group => (
                  <React.Fragment key={group}>
                    {/* Group header row — matches .perm-group in mockup */}
                    <tr>
                      <td colSpan={roles.length + 1} style={{
                        background:'var(--color-background-secondary, rgba(255,255,255,0.04))',
                        fontSize:'11px', fontWeight:500, color:TXS, padding:'5px 10px 4px',
                      }}>{group}</td>
                    </tr>

                    {PERM_MATRIX_ROWS.filter(r => r.group === group).map(row => (
                      <tr key={row.key}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary, rgba(255,255,255,0.025))'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                        <td style={{ padding:'6px 10px', borderBottom:`0.5px solid ${BD}`, verticalAlign:'middle' }}>
                          <div style={{ fontSize:'12px', color:'white', fontWeight:500 }}>{row.label}</div>
                          <div style={{ fontSize:'11px', color:TXS, marginTop:1 }}>{row.desc}</div>
                        </td>

                        {roles.map(role => {
                          const color    = roleColor(role);
                          const isActive = selectedRole?.id === role.id;
                          const hasPerm  = roleHasPerm(role, row.key);
                          // Editable checkbox only for: selected non-super role, feature/deck perms, admin user
                          const editable = isActive && isAdmin
                            && role.name !== 'super_admin'
                            && !['user_management','audit_logs'].includes(row.key);

                          return (
                            <td key={role.id} style={{
                              padding:'6px 10px', borderBottom:`0.5px solid ${BD}`,
                              textAlign:'center', verticalAlign:'middle',
                              background: isActive
                                ? `color-mix(in srgb, ${color} 8%, transparent)`
                                : 'transparent',
                            }}>
                              {editable ? (
                                // Interactive checkbox — matches mockup .ck cells
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={hasPerm}
                                    onChange={() => toggleInlinePerm(role, row.key)}
                                    style={{ width:14, height:14, cursor:'pointer', accentColor:color }}
                                  />
                                </div>
                              ) : hasPerm ? (
                                // ✓ — green for non-active roles, role-color for active
                                <span style={{ color: isActive ? color : '#2ed573', fontSize:'13px', fontWeight:700 }}>✓</span>
                              ) : (
                                <span style={{ color:'rgba(255,255,255,0.15)', fontSize:'13px' }}>–</span>
                              )}
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

        {/* ── RIGHT: Assignees ── */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <AssigneesPanel
            role={selectedRole}
            users={users}
            api={api}
            toast={toast}
            isAdmin={isAdmin}
            onRefresh={loadAll}
          />
        </div>

      </div>{/* end grid */}

      {/* ── Create / Edit Role Modal ── */}
      {showForm && (
        <Modal
          title={editRole ? `Edit — ${editRole.display_name}` : 'New role'}
          onClose={() => { setShowForm(false); setEditRole(null); }}
          wide>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {!editRole && (
                <div>
                  <label style={LBL}>Role ID <span style={{ textTransform:'none', opacity:.6 }}>(slug)</span></label>
                  <input style={INP} value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))}
                    placeholder="studio_operator"/>
                </div>
              )}
              <div>
                <label style={LBL}>Display name</label>
                <input style={INP} value={form.display_name}
                  onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Studio Operator"/>
              </div>
            </div>

            <div>
              <label style={LBL}>Description</label>
              <input style={INP} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description…"/>
            </div>

            <div>
              <label style={LBL}>Color</label>
              <div style={{ display:'flex', alignItems:'center', gap:'0.7rem' }}>
                <input type="color" value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width:38, height:32, padding:2, borderRadius:6, border:`1px solid ${BD}`, background:'rgba(0,0,0,0.3)', cursor:'pointer' }}/>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {['#A32D2D','#D97706','#185FA5','#27500A','#7C3AED','#854F0B','#0891B2','#888780'].map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      style={{ width:20, height:20, borderRadius:'50%', background:c, border:`2px solid ${form.color===c?'white':'transparent'}`, cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ borderTop:`1px solid ${BD}`, paddingTop:'1rem' }}>
              <div style={{ fontSize:'0.8rem', color:TXS, marginBottom:'0.7rem' }}>
                🎭 <strong style={{ color:'white' }}>Default permissions</strong> — applied to new users assigned this role.
              </div>
              <PermEditor
                perms={{
                  default_deck_control:   form.default_deck_control,
                  default_deck_actions:   form.default_deck_actions,
                  default_playlist_perms: form.default_playlist_perms,
                  default_can_announce:   form.default_can_announce,
                  default_can_schedule:   form.default_can_schedule,
                  default_can_library:    form.default_can_library,
                  default_can_requests:   form.default_can_requests,
                  default_can_settings:   form.default_can_settings,
                }}
                setPerms={updater => setForm(prev => {
                  const merged = typeof updater === 'function' ? updater(prev) : updater;
                  return { ...prev, ...merged };
                })}
                kp="default_"
              />
            </div>

            <div style={{ display:'flex', gap:'0.7rem', justifyContent:'flex-end', borderTop:`1px solid ${BD}`, paddingTop:'1rem' }}>
              <Btn color="gray" onClick={() => { setShowForm(false); setEditRole(null); }}>Cancel</Btn>
              <Btn color="blue" onClick={submitForm} disabled={formSaving}>
                {formSaving ? '⟳ Saving…' : editRole ? <><Check size={13}/> Save role</> : <><Plus size={13}/> Create role</>}
              </Btn>
            </div>

          </div>
        </Modal>
      )}

    </div>
  );
}
