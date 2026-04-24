import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-email-step',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './email-step.component.html',
  styleUrl: './email-step.component.scss',
})
export class EmailStepComponent {
  private router = inject(Router);

  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  submit(): void {
    if (this.form.invalid) return;
    this.router.navigate(['/verifier'], {
      queryParams: { email: this.form.value.email },
    });
  }

  loginWithGoogle(): void {
    this.router.navigate(['/espaces']);
  }

  loginWithApple(): void {
    this.router.navigate(['/espaces']);
  }
}
