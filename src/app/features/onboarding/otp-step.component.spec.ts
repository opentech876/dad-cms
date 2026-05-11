import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { OtpStepComponent } from './otp-step.component';
import { SupabaseService } from '../../core/supabase/supabase.service';

const MOCK_ROUTE = {
  snapshot: {
    queryParamMap: {
      get: (key: string) =>
        ({ email: 'test@exemple.com', from: 'login' } as Record<string, string>)[key] ?? null,
    },
  },
};

describe('OtpStepComponent', () => {
  let component: OtpStepComponent;
  let fixture: ComponentFixture<OtpStepComponent>;
  let navigateSpy: jest.Mock;
  let verifyOtpSpy: jest.Mock;
  let sendOtpSpy: jest.Mock;
  let hasWorkspaceRoleSpy: jest.Mock;
  let signOutSpy: jest.Mock;

  beforeEach(async () => {
    verifyOtpSpy = jest.fn().mockResolvedValue({ error: null });
    sendOtpSpy = jest.fn().mockResolvedValue({ error: null });
    hasWorkspaceRoleSpy = jest.fn().mockResolvedValue(true);
    signOutSpy = jest.fn().mockResolvedValue({});

    await TestBed.configureTestingModule({
      imports: [OtpStepComponent],
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        { provide: ActivatedRoute, useValue: MOCK_ROUTE },
        {
          provide: SupabaseService,
          useValue: { verifyOtp: verifyOtpSpy, sendOtp: sendOtpSpy, hasWorkspaceRole: hasWorkspaceRoleSpy, signOut: signOutSpy },
        },
      ],
    }).compileComponents();

    navigateSpy = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as any;

    fixture = TestBed.createComponent(OtpStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait créer le composant', () => {
    expect(component).toBeTruthy();
  });

  it('initialise 6 slots de chiffres vides au démarrage', () => {
    expect(component.digits().length).toBe(6);
    expect(component.digits().every((d) => d === '')).toBe(true);
  });

  // ─── ngOnInit ─────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it("charge l'email depuis les query params", () => {
      expect(component.email()).toBe('test@exemple.com');
    });

    it('charge la provenance (from) depuis les query params', () => {
      expect(component.from()).toBe('login');
    });
  });

  // ─── isSignupMode() ───────────────────────────────────────────────────────

  describe('isSignupMode()', () => {
    it('retourne true quand from vaut "signup"', () => {
      component.from.set('signup');
      expect(component.isSignupMode()).toBe(true);
    });

    it('retourne false quand from vaut "login"', () => {
      component.from.set('login');
      expect(component.isSignupMode()).toBe(false);
    });
  });

  // ─── verify() via onPaste() ────────────────────────────────────────────────

  describe('verify()', () => {
    function paste(code: string): void {
      const event = {
        preventDefault: jest.fn(),
        clipboardData: { getData: () => code },
      } as unknown as ClipboardEvent;
      component.onPaste(event);
    }

    it("appelle verifyOtp avec l'email, le token et le type 'email'", async () => {
      paste('123456');
      await fixture.whenStable();
      expect(verifyOtpSpy).toHaveBeenCalledWith('test@exemple.com', '123456', 'email');
    });

    it('navigue vers /dashboard après vérification réussie', async () => {
      paste('123456');
      await fixture.whenStable();
      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it("affiche un message d'erreur et réinitialise les chiffres si verifyOtp échoue", async () => {
      verifyOtpSpy.mockResolvedValueOnce({ error: { message: 'Code invalide' } });
      paste('999999');
      await fixture.whenStable();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.digits().every((d) => d === '')).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('ne soumet pas une deuxième fois pendant le chargement', async () => {
      component.isLoading.set(true);
      paste('123456');
      await fixture.whenStable();
      expect(verifyOtpSpy).not.toHaveBeenCalled();
    });
  });

  // ─── verify() — compte banni ──────────────────────────────────────────────

  describe('verify() — compte banni', () => {
    function paste(code: string): void {
      const event = {
        preventDefault: jest.fn(),
        clipboardData: { getData: () => code },
      } as unknown as ClipboardEvent;
      component.onPaste(event);
    }

    it('affiche un message de suspension quand Supabase retourne "User is banned"', async () => {
      verifyOtpSpy.mockResolvedValueOnce({ error: { message: 'User is banned' } });
      paste('123456');
      await fixture.whenStable();
      expect(component.errorMessage()).toContain('suspendu');
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('déconnecte et affiche un message si l\'utilisateur n\'a plus de rôle', async () => {
      hasWorkspaceRoleSpy.mockResolvedValueOnce(false);
      paste('123456');
      await fixture.whenStable();
      expect(signOutSpy).toHaveBeenCalled();
      expect(component.errorMessage()).toContain('révoqué');
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ─── resendCode() ─────────────────────────────────────────────────────────

  describe('resendCode()', () => {
    it("appelle sendOtp avec shouldCreateUser=true pour le flux onboarding (from=signup)", async () => {
      component.from.set('signup');
      await component.resendCode();
      expect(sendOtpSpy).toHaveBeenCalledWith('test@exemple.com', true);
    });

    it("appelle sendOtp avec shouldCreateUser=false pour le flux login", async () => {
      component.from.set('login');
      await component.resendCode();
      expect(sendOtpSpy).toHaveBeenCalledWith('test@exemple.com', false);
    });

    it('vide tous les slots de chiffres', async () => {
      component.digits.set(['1', '2', '3', '4', '5', '6']);
      await component.resendCode();
      expect(component.digits().every((d) => d === '')).toBe(true);
    });
  });

  // ─── onPaste() ────────────────────────────────────────────────────────────

  describe('onPaste()', () => {
    function fakePaste(text: string): ClipboardEvent {
      return {
        preventDefault: jest.fn(),
        clipboardData: { getData: (_fmt: string) => text },
      } as unknown as ClipboardEvent;
    }

    it('remplit tous les slots avec 6 chiffres collés', () => {
      component.onPaste(fakePaste('123456'));
      expect(component.digits()).toEqual(['1', '2', '3', '4', '5', '6']);
    });

    it('filtre les lettres lors du collage', () => {
      component.onPaste(fakePaste('1a2b3c'));
      expect(component.digits().slice(0, 3)).toEqual(['1', '2', '3']);
    });

    it('ne navigue pas si le code collé est incomplet', async () => {
      component.onPaste(fakePaste('123'));
      await fixture.whenStable();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('appelle preventDefault pour neutraliser la saisie native', () => {
      const event = fakePaste('123456');
      component.onPaste(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });
});
