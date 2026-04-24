import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
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
    const { error } = await this.supabase.sendOtp(email, false);

    if (error) {
      this.errorMessage =
        "Cette adresse e-mail n'a pas été invitée. Contactez votre administrateur.";
      this.loading = false;
      return;
    }

    this.router.navigate(['/verifier'], { queryParams: { email, from: 'login' } });
  }
}
