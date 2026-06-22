import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Router } from '@angular/router';
import { firstValueFrom, race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [TuiIcon, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router   = inject(Router);

  /** Grace period to give Supabase time to parse the deep-link hash and emit a session. */
  sessionGracePeriodMs = 1500;

  readonly newPassword     = signal('');
  readonly showPassword    = signal(false);
  readonly loading         = signal(false);
  readonly errorMessage    = signal('');
  readonly success         = signal(false);
  readonly sessionReady    = signal(false);
  readonly hasValidSession = signal(false);
  readonly linkExpired     = signal(false);

  toggleShowPassword(): void { this.showPassword.update(v => !v); }

  async ngOnInit(): Promise<void> {
    // Wait for the first non-null session emission OR a timeout. Supabase parses
    // the URL hash (#access_token=…) on client init and pushes the recovery
    // session via onAuthStateChange — usually within ~hundreds of ms. If no
    // session arrives within graceMs, the link is invalid or expired.
    const session = await firstValueFrom(
      race(
        this.supabase.currentSession$.pipe(filter((s: any) => !!s), take(1), map(s => s)),
        timer(this.sessionGracePeriodMs).pipe(map(() => null)),
      ),
    );
    this.sessionReady.set(true);
    this.hasValidSession.set(!!session);
    this.linkExpired.set(!session);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    if (this.linkExpired() || !this.hasValidSession()) return;
    const pwd = this.newPassword();
    this.errorMessage.set('');

    if (pwd.length < 8) {
      this.errorMessage.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }

    this.loading.set(true);
    const { error } = await this.supabase.updatePassword(pwd);
    if (error) {
      this.errorMessage.set('Erreur : ' + error.message);
      this.loading.set(false);
      return;
    }

    this.supabase.markPasswordSet();
    this.success.set(true);
    this.loading.set(false);
    setTimeout(() => this.router.navigate(['/login']), 2500);
  }
}
