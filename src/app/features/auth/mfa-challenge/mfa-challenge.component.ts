import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/**
 * Login-time TOTP challenge. After signInWithPassword leaves the user at
 * AAL1, the LoginComponent — or the systemAdminGuard — redirects here if a
 * verified TOTP factor exists on the account. The user enters a 6-digit
 * code; on success Supabase elevates the session to AAL2.
 *
 * Honors a `returnTo` query param so callers can route the user back to the
 * page they originally wanted (e.g. /admin/utilisateurs after the AAL2
 * gate kicks in). To prevent open-redirect, only same-origin paths
 * (starting with a single `/`) are accepted; anything else falls back to
 * `/dashboard`.
 */
@Component({
  selector: 'app-mfa-challenge',
  standalone: true,
  imports: [TuiIcon, RouterLink],
  templateUrl: './mfa-challenge.component.html',
  styleUrl: './mfa-challenge.component.scss',
})
export class MfaChallengeComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);

  readonly factorId     = signal<string | null>(null);
  readonly code         = signal('');
  readonly loading      = signal(false);
  readonly errorMessage = signal('');

  async ngOnInit(): Promise<void> {
    const { data } = await this.supabase.listMfaFactors();
    const verifiedTotp = (data?.totp ?? []).find((f: any) => f.status === 'verified');
    if (!verifiedTotp) {
      // User landed here without a verified factor — nothing to verify, bounce out.
      this.router.navigate(['/login']);
      return;
    }
    this.factorId.set(verifiedTotp.id);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    const factorId = this.factorId();
    const code = this.code().trim();
    if (!factorId || code.length < 6) return;

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const { data: ch, error: chErr } = await this.supabase.challengeTotp(factorId);
      if (chErr || !ch) {
        this.errorMessage.set('Impossible de créer un défi : ' + (chErr?.message ?? '?'));
        return;
      }
      const { error: vErr } = await this.supabase.verifyTotpChallenge(factorId, ch.id, code);
      if (vErr) {
        this.errorMessage.set('Code invalide. Réessayez avec le code courant.');
        return;
      }
      this.router.navigate([this._safeReturnTo()]);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Read `returnTo` from the URL and accept only same-origin paths.
   * Anything that doesn't look like `/foo` (a single leading slash, no
   * `//` scheme-relative) falls back to `/dashboard`.
   */
  private _safeReturnTo(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnTo') ?? '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/dashboard';
  }
}
