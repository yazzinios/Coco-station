/**
 * PermissionGate.jsx — CocoStation
 * ──────────────────────────────────────────────────────────────
 * Conditionally renders children based on the current user's permissions.
 *
 * Props (use ONE at a time, or combine):
 *   feature="can_settings"          — checks a feature flag
 *   perm="deck.play"                — checks a deck/playlist action permission
 *   deck="a" level="control"|"view" — checks deck-level access
 *   elevated                        — requires admin or super_admin
 *   fallback={<SomeElement />}      — what to render if access is denied (default: null)
 *
 * Examples:
 *   <PermissionGate feature="can_settings">
 *     <SettingsPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate perm="deck.play" fallback={<DisabledButton />}>
 *     <PlayButton />
 *   </PermissionGate>
 *
 *   <PermissionGate elevated>
 *     <AdminOnlySection />
 *   </PermissionGate>
 *
 *   <PermissionGate deck="a" level="control">
 *     <DeckControls />
 *   </PermissionGate>
 */

import React from 'react';
import { useApp } from '../context/useApp';

export default function PermissionGate({
  children,
  feature   = null,   // e.g. "can_settings"
  perm      = null,   // e.g. "deck.play"
  deck      = null,   // e.g. "a"
  level     = 'view', // "view" | "control"
  elevated  = false,  // require admin / super_admin
  fallback  = null,   // what to show if denied
}) {
  const { hasPermission, hasFeature, canViewDeck, canControlDeck, isElevated, currentUser } = useApp();

  if (!currentUser) return fallback;

  // Elevated check
  if (elevated && !isElevated) return fallback;

  // Feature flag check
  if (feature && !hasFeature(feature)) return fallback;

  // Action permission check
  if (perm && !hasPermission(perm)) return fallback;

  // Deck access check
  if (deck) {
    if (level === 'control' && !canControlDeck(deck)) return fallback;
    if (level === 'view'    && !canViewDeck(deck))    return fallback;
  }

  return <>{children}</>;
}
