import { Component, ElementRef, inject, OnInit, QueryList, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Component({
  selector: 'app-otp-step',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './otp-step.component.html',
  styleUrl: './otp-step.component.scss',
})
export class OtpStepComponent implements OnInit {
  @ViewChildren('otpInput') inputRefs!: QueryList<ElementRef<HTMLInputElement>>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  email = '';
  from = '';
  digits = ['', '', '', '', '', ''];
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.email = params.get('email') ?? '';
    this.from = params.get('from') ?? '';
  }

  onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(-1);
    this.digits[index] = val;
    input.value = val;
    if (val && index < 5) {
      this.inputs[index + 1].focus();
    } else if (val && index === 5) {
      this.verify();
    }
  }

  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
      this.inputs[index - 1].focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const chars = text.replace(/\D/g, '').slice(0, 6).split('');
    chars.forEach((char, i) => {
      this.digits[i] = char;
      this.inputs[i].value = char;
    });
    if (chars.length === 6) {
      this.verify();
    } else {
      this.inputs[Math.min(chars.length, 5)].focus();
    }
  }

  async resendCode(): Promise<void> {
    this.digits = ['', '', '', '', '', ''];
    this.inputs.forEach((input) => (input.value = ''));
    this.errorMessage = '';
    await this.supabase.sendOtp(this.email, this.from !== 'login');
    this.inputs[0]?.focus();
  }

  // private async verify(): Promise<void> {
  //   if (this.isLoading) return;

  //   const token = this.digits.join('');
  //   if (token.length < 6) return;

  //   this.isLoading = true;
  //   this.errorMessage = '';

  //   // ✅ Appel corrigé
  //   const { data, error } = await this.supabase.verifyOtp(
  //     this.email,
  //     token,
  //     'signup', // ← Important pour le premier signup
  //   );

  //   if (error) {
  //     console.error('Verify OTP error:', error);
  //     this.errorMessage =
  //       'Code invalide ou expiré. Vérifiez votre e-mail ou demandez un nouveau code.';
  //     this.isLoading = false;
  //     this.digits = ['', '', '', '', '', ''];
  //     this.inputs.forEach((input) => (input.value = ''));
  //     this.inputs[0]?.focus();
  //     return;
  //   }

  //   console.log('✅ OTP vérifié avec succès', data);
  //   this.router.navigate(['/espaces']);
  // }
  //////////////////////////////////////////////////////////////////////////////////////
  private async verify(): Promise<void> {
    if (this.isLoading) return;

    const token = this.digits.join('');
    if (token.length < 6) return;

    this.isLoading = true;
    this.errorMessage = '';

    const { data, error } = await this.supabase.verifyOtp(this.email, token, 'signup');

    if (error) {
      this.errorMessage = 'Code invalide ou expiré.';
      this.isLoading = false;
      this.digits = ['', '', '', '', '', ''];
      this.inputs.forEach((input) => (input.value = ''));
      this.inputs[0]?.focus();
      return;
    }

    console.log('✅ OTP validé (bypass ou réel)');
    this.router.navigate(['/espaces']); // ou '/workspace-step'
  }

  ///////////////////////////////////////////////////////////////////////////////////
  private get inputs(): HTMLInputElement[] {
    return this.inputRefs.toArray().map((r) => r.nativeElement);
  }
}
