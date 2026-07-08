import { AppRole } from '../../models';

/** Minimum role required to apply Curateur recommendations and directly
 *  write to calendar_entries. Mirrors the SECURITY DEFINER RPC gate. */
export const APPLY_TIER: AppRole = 'chef_equipe';

export const ROLE_LABELS: Record<AppRole, string> = {
  owner:                   'Administrateur',
  chef_equipe:             "Chef d'équipe",
  editeur:                 'Éditeur',
  charge_communication:    'Commercial',
  presidence:              'Curateur',
  chef_equipe_commerciale: "Chef d'équipe commerciale",
  system_admin:            'Administrateur plateforme',
};

/**
 * Returns a 1–2 letter uppercase initials string from a full name.
 * Falls back to `fallback` (default '?') when the name is empty.
 */
export function getInitials(fullName: string, fallback = '?'): string {
  const name = fullName.trim();
  if (!name) return fallback;
  const parts = name.split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
}
