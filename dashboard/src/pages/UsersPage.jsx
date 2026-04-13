import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Key, ShieldCheck, Shield, Check, X, RefreshCw } from 'lucide-react';
import { useApp } from '../context/useApp';

const ROLE_CFG = {
  admin:    { label: 'Admin',    color: '#fd9644', bg: 'rgba(253,150,68,0.12)',  border: 'rgba(253,150,68,0.35)', icon: <ShieldCheck size={12} /> },
  operator: { label: 'Operator', color: '#00d4ff', bg: 'rgba(0,212,255,0.08)',  border: 'rgba(0,212,255,0.25)', icon: <Shield size={12} /> },
};

const EMPTY_FORM = { username: '', display_name: '', password: '', role: 'operator' };

// ── Generic Modal ─────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'rgba(20,20,28,0.97)', border: '1px solid var(--panel-border)', borderRadius: '14px', padding: '1.75rem 1.75rem 1.5rem', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px', borderRadius: '4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { api, toast, currentUser } = useApp();

  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);   // 'create' | 'edit' | false
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [pwForm,      setPwForm]      = useState({ password: '', confirm: '' });
  const [showPwModal, setShowPwModal] = useState(null);    // user object
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      toast.error('Failed to load users: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── open modals ───────────────────────────────────────────
  const openCreate = () => { setForm(EMPTY_FORM); setEditTarget(null); setShowForm('create'); };
  const openEdit   = (u) => { setForm({ username: u.username, display_name: u.display_name || '', password: '', role: u.role }); setEditTarget(u); setShowForm('edit'); };
  const closeForm  = () => { setShowForm(false); setEditTarget(null); };

  // ── submit create / edit ──────────────────────────────────
  const handleSubmit = async () => {
    if (!form.username.trim()) { toast.error('Username required'); return; }
    if (showForm === 'create' && form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      if (showForm === 'create') {
        await api.createUser({
          username:     form.username.trim(),
          display_name: form.display_name.trim() || form.username.trim(),
          password:     form.password,
          role:         form.role,
        });
        toast.success(`User "${form.username}" created!`);
      } else {
        await api.updateUser(editTarget.id, {
          display_name: form.display_name.trim() || editTarget.username,
          role:         form.role,
        });
        toast.success('User updated!');
      }
      closeForm();
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── toggle enabled ────────────────────────────────────────
  const toggleEnabled = async (u) => {
    if (!isAdmin) return;
    if (u.id === currentUser?.id) { toast.warning("You can't disable your own account"); return; }
    try {
      await api.updateUser(u.id, { enabled: !u.enabled });
      toast.success(`${u.username} ${!u.enabled ? 'enabled' : 'disabled'}`);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  // ── change password ───────────────────────────────────────
  const handleChangePassword = async () => {
    if (pwForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (pwForm.password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await api.updateUser(showPwModal.id, { password: pwForm.password });
      toast.success('Password updated!');
      setShowPwModal(null);
      setPwForm({ password: '', confirm: '' });
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── delete ────────────────────────────────────────────────
  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setDeleting(u.id);
    try {
      await api.deleteUser(u.id);
      toast.success(`User "${u.username}" deleted`);
      await load();
    } catch (e) { toast.error(e.message); }
    finally { setDeleting(null); }
  };

  // ── reusable styles ───────────────────────────────────────
  const inp = {
    width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--panel-border)',
    fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  };
  const lbl = {
    display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem',
  };
  const mkBtn = (color = 'blue') => {
    const map = {
      blue:  { bg: 'rgba(0,212,255,0.12)',  border: 'rgba(0,212,255,0.35)',  text: 'var(--accent-blue)' },
      green: { bg: 'rgba(46,213,115,0.12)', border: 'rgba(46,213,115,0.4)',  text: '#2ed573' },
      red:   { bg: 'rgba(255,71,87,0.1)',   border: 'rgba(255,71,87,0.35)',  text: '#ff4757' },
      amber: { bg: 'rgba(253,150,68,0.1)',  border: 'rgba(253,150,68,0.35)', text: '#fd9644' },
    };
    const c = map[color] || map.blue;
    return { padding: '0.4rem 0.85rem', borderRadius: '7px', border: `1px solid ${c.border}`, background: c.bg, color: c.text, cursor: 'pointer', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'inherit' };
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Users size={22} /> User Management
        </h2>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button onClick={load} style={mkBtn('blue')}><RefreshCw size={14} /> Refresh</button>
          {isAdmin && (
            <button onClick={openCreate} style={mkBtn('green')}><Plus size={14} /> New User</button>
          )}
        </div>
      </div>

      {/* ── Info banner for non-admins ── */}
      {!isAdmin && (
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          ℹ You can view users and change your own password. Contact an admin for other changes.
        </div>
      )}

      {/* ── User Table ── */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)' }}>
                  {['User', 'Role', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const rc    = ROLE_CFG[u.role] || ROLE_CFG.operator;
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: i < users.length - 1 ? '1px solid var(--panel-border)' : 'none', opacity: u.enabled ? 1 : 0.45, transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Avatar + name */}
                      <td style={{ padding: '0.9rem 1.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                            background: `linear-gradient(135deg, ${rc.color}33, ${rc.color}11)`,
                            border: `1px solid ${rc.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.95rem', fontWeight: '700', color: rc.color,
                          }}>
                            {(u.display_name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '500', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              {u.display_name || u.username}
                              {isSelf && (
                                <span style={{ fontSize: '0.68rem', background: 'rgba(0,212,255,0.12)', color: 'var(--accent-blue)', padding: '0.1rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(0,212,255,0.25)' }}>
                                  you
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td style={{ padding: '0.9rem 1.1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '600', background: rc.bg, border: `1px solid ${rc.border}`, color: rc.color }}>
                          {rc.icon}{rc.label}
                        </span>
                      </td>

                      {/* Status — clickable toggle for admin */}
                      <td style={{ padding: '0.9rem 1.1rem' }}>
                        {isAdmin && !isSelf ? (
                          <button
                            onClick={() => toggleEnabled(u)}
                            title={u.enabled ? 'Click to disable' : 'Click to enable'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                              padding: '0.25rem 0.65rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '600',
                              cursor: 'pointer', fontFamily: 'inherit',
                              background: u.enabled ? 'rgba(46,213,115,0.12)' : 'rgba(255,255,255,0.05)',
                              border: u.enabled ? '1px solid rgba(46,213,115,0.35)' : '1px solid var(--panel-border)',
                              color: u.enabled ? '#2ed573' : 'var(--text-secondary)',
                            }}
                          >
                            {u.enabled ? <><Check size={11} /> Active</> : <><X size={11} /> Disabled</>}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: u.enabled ? '#2ed573' : 'var(--text-secondary)' }}>
                            {u.enabled ? '● Active' : '○ Disabled'}
                          </span>
                        )}
                      </td>

                      {/* Created date */}
                      <td style={{ padding: '0.9rem 1.1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.9rem 1.1rem' }}>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {(isAdmin || isSelf) && (
                            <button onClick={() => openEdit(u)} style={mkBtn('blue')} title="Edit profile">
                              <Edit2 size={13} />
                            </button>
                          )}
                          {(isAdmin || isSelf) && (
                            <button onClick={() => { setShowPwModal(u); setPwForm({ password: '', confirm: '' }); }} style={mkBtn('amber')} title="Change password">
                              <Key size={13} />
                            </button>
                          )}
                          {isAdmin && !isSelf && (
                            <button
                              onClick={() => handleDelete(u)}
                              disabled={deleting === u.id}
                              style={{ ...mkBtn('red'), opacity: deleting === u.id ? 0.5 : 1 }}
                              title="Delete user"
                            >
                              <Trash2 size={13} />
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

      {/* ═══ Create / Edit Modal ═══ */}
      {showForm && (
        <Modal title={showForm === 'create' ? 'Create New User' : `Edit — @${editTarget?.username}`} onClose={closeForm}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={lbl}>
                Username
                {showForm === 'edit' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', textTransform: 'none', marginLeft: '0.4rem' }}>(cannot change)</span>}
              </label>
              <input
                style={{ ...inp, opacity: showForm === 'edit' ? 0.5 : 1, cursor: showForm === 'edit' ? 'not-allowed' : 'text' }}
                value={form.username}
                readOnly={showForm === 'edit'}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="e.g. djmike"
              />
            </div>

            <div>
              <label style={lbl}>Display Name</label>
              <input
                style={inp}
                value={form.display_name}
                onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                placeholder="Mike the DJ"
              />
            </div>

            {showForm === 'create' && (
              <div>
                <label style={lbl}>Password <span style={{ color: '#ff4757' }}>*</span></label>
                <input
                  type="password"
                  style={inp}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min 6 characters"
                />
                {form.password && form.password.length < 6 && (
                  <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#ff4757' }}>Too short</div>
                )}
              </div>
            )}

            {isAdmin && (
              <div>
                <label style={lbl}>Role</label>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  {['operator', 'admin'].map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio" name="role" value={r}
                        checked={form.role === r}
                        onChange={() => setForm(p => ({ ...p, role: r }))}
                        style={{ accentColor: ROLE_CFG[r].color }}
                      />
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: ROLE_CFG[r].color, fontSize: '0.88rem' }}>
                        {ROLE_CFG[r].icon} {ROLE_CFG[r].label}
                      </span>
                    </label>
                  ))}
                </div>
                {form.role === 'admin' && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'rgba(253,150,68,0.7)', padding: '0.4rem 0.65rem', background: 'rgba(253,150,68,0.06)', borderRadius: '6px', border: '1px solid rgba(253,150,68,0.2)' }}>
                    ⚠ Admin users have full access to all settings and user management.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem' }}>
              <button onClick={closeForm} style={mkBtn('blue')}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ ...mkBtn('green'), opacity: saving ? 0.6 : 1 }}>
                {saving ? '⟳ Saving…' : showForm === 'create' ? <><Plus size={14} /> Create User</> : <><Check size={14} /> Save Changes</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ Change Password Modal ═══ */}
      {showPwModal && (
        <Modal title={`Change Password — @${showPwModal.username}`} onClose={() => setShowPwModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={lbl}>New Password</label>
              <input
                type="password" style={inp} value={pwForm.password}
                onChange={e => setPwForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label style={lbl}>Confirm Password</label>
              <input
                type="password"
                style={{ ...inp, borderColor: pwForm.confirm && pwForm.confirm !== pwForm.password ? 'rgba(255,71,87,0.55)' : 'var(--panel-border)' }}
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat the password"
              />
              {pwForm.confirm && pwForm.confirm !== pwForm.password && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#ff4757' }}>Passwords do not match</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem' }}>
              <button onClick={() => setShowPwModal(null)} style={mkBtn('blue')}>Cancel</button>
              <button
                onClick={handleChangePassword}
                disabled={saving || !pwForm.password || pwForm.password !== pwForm.confirm}
                style={{ ...mkBtn('amber'), opacity: (saving || !pwForm.password || pwForm.password !== pwForm.confirm) ? 0.5 : 1 }}
              >
                {saving ? '⟳ Updating…' : <><Key size={14} /> Update Password</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
