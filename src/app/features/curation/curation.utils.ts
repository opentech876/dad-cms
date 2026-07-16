// Shared display helpers for the Espace Curation, mirroring the approved
// claude.design prototype (curateur.html).

/** Badge/label metadata per recommendation status. The DB knows two
 *  statuses today; 'withdrawn' arrives with its own migration later. */
export const REC_STATUS_META: Record<
  'pending' | 'applied',
  { label: string; badge: string; color: string; soft: string }
> = {
  pending: {
    label: 'En attente de publication',
    badge: 'badge-warning',
    color: 'var(--warning)',
    soft: 'var(--warning-soft)',
  },
  applied: {
    label: 'Publiée',
    badge: 'badge-success',
    color: 'var(--success)',
    soft: 'var(--success-soft)',
  },
};

export function positionLabel(position: 1 | 2): string {
  return position === 1 ? 'Événement principal' : "C'est aussi";
}

/** Deterministic tinted gradients used as placeholder art when an event
 *  has no illustration (same palette as the design prototype). */
const ART_GRADIENTS = [
  'linear-gradient(155deg, rgba(138,42,35,0.9), rgba(58,26,20,0.96)), repeating-linear-gradient(45deg, rgba(216,161,85,0.16) 0 2px, transparent 2px 9px)',
  'linear-gradient(155deg, rgba(140,102,32,0.92), rgba(58,42,18,0.96)), repeating-linear-gradient(135deg, rgba(216,161,85,0.18) 0 2px, transparent 2px 9px)',
  'linear-gradient(155deg, rgba(31,90,94,0.92), rgba(16,40,42,0.96)), repeating-linear-gradient(45deg, rgba(120,190,180,0.15) 0 2px, transparent 2px 9px)',
  'linear-gradient(155deg, rgba(45,74,94,0.92), rgba(18,30,42,0.96)), repeating-linear-gradient(135deg, rgba(150,180,200,0.14) 0 2px, transparent 2px 9px)',
  'linear-gradient(155deg, rgba(62,107,72,0.92), rgba(24,44,30,0.96)), repeating-linear-gradient(45deg, rgba(160,200,150,0.14) 0 2px, transparent 2px 9px)',
];

export function artFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return ART_GRADIENTS[Math.abs(hash) % ART_GRADIENTS.length];
}
