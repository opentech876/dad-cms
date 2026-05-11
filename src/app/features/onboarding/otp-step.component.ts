import { Component, computed, ElementRef, inject, OnInit, QueryList, signal, ViewChildren } from '@angular/core';
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

  readonly email = signal('');
  readonly from = signal('');
  readonly isSignupMode = computed(() => this.from() !== 'login');
  readonly digits = signal(['', '', '', '', '', '']);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.email.set(params.get('email') ?? '');
    this.from.set(params.get('from') ?? '');
  }

  onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(-1);
    this.digits.update(d => { const copy = [...d]; copy[index] = val; return copy; });
    input.value = val;
    if (val && index < 5) {
      this.inputs[index + 1].focus();
    } else if (val && index === 5) {
      this.verify();
    }
  }

  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.inputs[index - 1].focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const chars = text.replace(/\D/g, '').slice(0, 6).split('');
    this.digits.update(d => {
      const copy = [...d];
      chars.forEach((char, i) => { copy[i] = char; this.inputs[i].value = char; });
      return copy;
    });
    if (chars.length === 6) {
      this.verify();
    } else {
      this.inputs[Math.min(chars.length, 5)].focus();
    }
  }

  async resendCode(): Promise<void> {
    this.digits.set(['', '', '', '', '', '']);
    this.errorMessage.set('');
    await this.supabase.sendOtp(this.email(), this.isSignupMode());
    if (!this.isSignupMode()) {
      this.inputs.forEach(input => (input.value = ''));
      this.inputs[0]?.focus();
    }
  }

  private async verify(): Promise<void> {
    if (this.isLoading()) return;
    const token = this.digits().join('');
    if (token.length < 6) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { error } = await this.supabase.verifyOtp(this.email(), token, 'email');

    if (error) {
      const msg = ((error as any).message ?? '').toLowerCase();
      if (msg.includes('ban')) {
        this.errorMessage.set('Votre compte a été suspendu. Contactez l\'administrateur.');
      } else {
        this.errorMessage.set('Code invalide ou expiré.');
      }
      this.isLoading.set(false);
      this.digits.set(['', '', '', '', '', '']);
      this.inputs.forEach(input => (input.value = ''));
      this.inputs[0]?.focus();
      return;
    }

    const hasRole = await this.supabase.hasWorkspaceRole();
    if (!hasRole) {
      await this.supabase.signOut();
      this.errorMessage.set('Votre accès à cet espace de travail a été révoqué. Contactez l\'administrateur.');
      this.isLoading.set(false);
      this.digits.set(['', '', '', '', '', '']);
      this.inputs.forEach(input => (input.value = ''));
      this.inputs[0]?.focus();
      return;
    }

    this.router.navigate(['/dashboard']);
  }

  private get inputs(): HTMLInputElement[] {
    return this.inputRefs.toArray().map(r => r.nativeElement);
  }
}
