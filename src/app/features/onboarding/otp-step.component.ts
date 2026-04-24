import { Component, ElementRef, inject, OnInit, QueryList, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

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

  email = '';
  digits = ['', '', '', '', '', ''];

  ngOnInit(): void {
    this.email = this.route.snapshot.queryParamMap.get('email') ?? '';
  }

  onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(-1);
    this.digits[index] = val;
    input.value = val;
    if (val && index < 5) {
      this.inputs[index + 1].focus();
    } else if (val && index === 5) {
      this.advance();
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
      this.advance();
    } else {
      this.inputs[Math.min(chars.length, 5)].focus();
    }
  }

  resendCode(): void {
    this.digits = ['', '', '', '', '', ''];
    this.inputs.forEach((input) => (input.value = ''));
    this.inputs[0].focus();
  }

  private advance(): void {
    this.router.navigate(['/espaces']);
  }

  private get inputs(): HTMLInputElement[] {
    return this.inputRefs.toArray().map((r) => r.nativeElement);
  }
}
