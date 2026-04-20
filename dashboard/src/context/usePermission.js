/**
 * usePermission.js — CocoStation
 * ──────────────────────────────────────────────────────────────
 * Convenience hook that bundles all permission checks in one place.
 *
 * Usage:
 *   const { can, canDeck, hasFeature, isElevated, role } = usePermission();
 *
 *   can('deck.play')           → true/false
 *   canDeck('a', 'control')    → true/false
 *   hasFeature('can_settings') → true/false
 *   isElevated                 → true/false (admin or super_admin)
 *   role                       → 'super_admin' | 'admin' | 'operator' | 'viewer' | null
 */

import { useApp } from './useApp';

export function usePermission() {
  const {
    currentUser,
    hasPermission,
    hasFeature,
    canViewDeck,
    canControlDeck,
    isElevated,
  } = useApp();

  const role = currentUser?.is_super_admin
    ? 'super_admin'
    : currentUser?.role || null;

  /**
   * Check a deck action or playlist permission.
   * @param {string} perm  e.g. "deck.play", "playlist.edit"
   */
  const can = (perm) => hasPermission(perm);

  /**
   * Check deck-level view or control access.
   * @param {string} deckId   e.g. "a"
   * @param {'view'|'control'} level
   */
  const canDeck = (deckId, level = 'view') =>
    level === 'control' ? canControlDeck(deckId) : canViewDeck(deckId);

  return {
    can,
    canDeck,
    hasFeature,
    isElevated,
    role,
    currentUser,
    isSuperAdmin: !!currentUser?.is_super_admin,
    isAdmin: currentUser?.role === 'admin' || !!currentUser?.is_super_admin,
    isLoggedIn: !!currentUser,
  };
}
