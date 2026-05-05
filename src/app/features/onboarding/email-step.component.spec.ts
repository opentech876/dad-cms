import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Router } from '@angular/router';
import { EmailStepComponent } from './email-step.component';
import { SupabaseService } from '../../core/supabase/supabase.service';

describe('EmailStepComponent', () => {
  let component: EmailStepComponent;
  let fixture: ComponentFixture<EmailStepComponent>;
  let navigateSpy: jest.Mock;
  let sendOtpSpy: jest.Mock;

  beforeEach(async () => {
    sendOtpSpy = jest.fn().mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      imports: [EmailStepComponent],
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        { provide: SupabaseService, useValue: { sendOtp: sendOtpSpy } },
      ],
    }).compileComponents();

    navigateSpy = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as any;

    fixture = TestBed.createComponent(EmailStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait créer le composant', () => {
    expect(component).toBeTruthy();
  });

  // ─── Validation du formulaire ─────────────────────────────────────────────

  describe('Validation du formulaire', () => {
    it('est invalide quand le champ email est vide', () => {
      expect(component.form.invalid).toBe(true);
    });

    it('est invalide avec une adresse email mal formée', () => {
      component.form.setValue({ email: 'pasuneemail' });
      expect(component.form.invalid).toBe(true);
    });

    it('est invalide avec un email sans domaine', () => {
      component.form.setValue({ email: 'test@' });
      expect(component.form.invalid).toBe(true);
    });

    it('est valide avec une adresse email correcte', () => {
      component.form.setValue({ email: 'utilisateur@exemple.com' });
      expect(component.form.valid).toBe(true);
    });
  });

  // ─── submit() ─────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('ne navigue pas et ne appelle pas sendOtp quand le formulaire est invalide', async () => {
      await component.submit();
      expect(sendOtpSpy).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("appelle sendOtp() avec l'email et shouldCreateUser=true", async () => {
      component.form.setValue({ email: 'utilisateur@exemple.com' });
      await component.submit();
      expect(sendOtpSpy).toHaveBeenCalledWith('utilisateur@exemple.com', true);
    });

    it("navigue vers /verifier avec l'email et from=signup en query params après sendOtp réussi", async () => {
      component.form.setValue({ email: 'utilisateur@exemple.com' });
      await component.submit();
      expect(navigateSpy).toHaveBeenCalledWith(['/verifier'], {
        queryParams: { email: 'utilisateur@exemple.com', from: 'signup' },
      });
    });

    it("affiche un message d'erreur et ne navigue pas si Supabase retourne une erreur", async () => {
      sendOtpSpy.mockResolvedValueOnce({ error: { message: 'Rate limited' } });
      component.form.setValue({ email: 'utilisateur@exemple.com' });
      await component.submit();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBeTruthy();
    });

    it('ne soumet pas une deuxième fois pendant le chargement', async () => {
      component.form.setValue({ email: 'utilisateur@exemple.com' });
      component.loading.set(true);
      await component.submit();
      expect(sendOtpSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Connexions sociales ───────────────────────────────────────────────────

  describe('Connexions sociales', () => {
    it('loginWithGoogle() est une fonction sans erreur', () => {
      expect(() => component.loginWithGoogle()).not.toThrow();
    });

    it('loginWithApple() est une fonction sans erreur', () => {
      expect(() => component.loginWithApple()).not.toThrow();
    });
  });
});
