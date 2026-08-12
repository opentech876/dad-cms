import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, TuiIcon, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private supabase = inject(SupabaseService);

  email = new FormControl('', [Validators.required, Validators.email]);

  readonly loading      = signal(false);
  readonly sent         = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    if (this.loading()) return;
    const addr = this.email.value ?? '';
    if (!addr || this.email.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');

    const { error } = await this.supabase.resetPasswordForEmail(addr);
    if (error) {
      this.errorMessage.set('Impossible d\'envoyer l\'e-mail. Vérifiez l\'adresse saisie.');
    } else {
      this.sent.set(true);
    }
    this.loading.set(false);
  }
}
