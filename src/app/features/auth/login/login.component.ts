import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

type LoginMode = 'password' | 'otp';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TuiIcon, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  /** Default to password (faster, no email burnt on the free plan). */
  readonly mode = signal<LoginMode>('password');

  readonly showPassword = signal(false);
  toggleShowPassword(): void { this.showPassword.update(v => !v); }

  form = new FormGroup({
    email:    new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.minLength(8)]),
  });

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  setMode(m: LoginMode): void {
    this.mode.set(m);
    this.errorMessage.set('');
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    const email = this.form.controls.email.value ?? '';
    if (!email || this.form.controls.email.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');

    if (this.mode() === 'password') {
      const password = this.form.controls.password.value ?? '';
      if (password.length < 8) {
        this.errorMessage.set('Le mot de passe doit comporter au moins 8 caractères.');
        this.loading.set(false);
        return;
      }
      const { error } = await this.supabase.signInWithPassword(email, password);
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        this.errorMessage.set(
          msg.includes('invalid login')
            ? 'Email ou mot de passe incorrect.'
            : msg.includes('rate') || msg.includes('limit')
              ? 'Trop de tentatives. Veuillez patienter quelques minutes.'
              : 'Connexion impossible. Vérifiez vos identifiants.',
        );
        this.loading.set(false);
        return;
      }
      // Mark that this user has a password — saves the /profil prompt later.
      this.supabase.markPasswordSet();

      // MFA is currently disabled — password sign-in goes straight to the
      // dashboard with no /verifier-2fa detour. The listMfaFactors helper
      // and the route/component are still in the codebase in case we
      // re-enable it later.
      this.router.navigate(['/dashboard']);
      return;
    }

    // OTP fallback (existing behavior).
    const { error } = await this.supabase.sendOtp(email);
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      this.errorMessage.set(
        msg.includes('rate') || msg.includes('security purposes') || msg.includes('limit')
          ? 'Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.'
          : "Cette adresse e-mail n'a pas été invitée. Contactez votre administrateur.",
      );
      this.loading.set(false);
      return;
    }
    this.router.navigate(['/verifier'], { queryParams: { email, from: 'login' } });
  }
}
