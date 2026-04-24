import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Component({
  selector: 'app-email-step',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './email-step.component.html',
  styleUrl: './email-step.component.scss',
})
export class EmailStepComponent {
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  loading = false;
  errorMessage = '';

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.errorMessage = '';

    const email = this.form.value.email!;
    const { error } = await this.supabase.sendOtp(email, true);

    if (error) {
      this.errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
      this.loading = false;
      return;
    }

    this.router.navigate(['/verifier'], { queryParams: { email } });
  }

  loginWithGoogle(): void {}

  loginWithApple(): void {}
}
