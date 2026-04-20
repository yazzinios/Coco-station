/**
 * api_auth_patch.js — CocoStation
 * ──────────────────────────────────────────────────────────────
 * This file documents the two API calls to add to the `api` object
 * in AppContext.jsx (inside the AppProvider function, in the `api` block).
 *
 * ADD THESE inside the `const api = { ... }` object in AppContext.jsx:
 *
 *   // ── Auth ──
 *   refreshToken: async () => {
 *     const token = getStoredToken();
 *     const r = await fetch('/api/auth/refresh', {
 *       method: 'POST',
 *       headers: { Authorization: `Bearer ${token}` },
 *     });
 *     if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Refresh failed');
 *     return r.json();
 *   },
 *
 *   logout: async () => {
 *     // Optional — audits the logout on the server
 *     try {
 *       await authFetch('/api/auth/logout', { method: 'POST' });
 *     } catch { }
 *   },
 *
 * The SessionGuard component already calls these via its own fetch()
 * call, so no changes to SessionGuard.jsx are required.
 */

// This file is documentation only — no code needs to run from here.
export {};
