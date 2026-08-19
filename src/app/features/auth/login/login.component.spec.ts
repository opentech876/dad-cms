import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { LoginComponent } from './login.component';
import { SupabaseService } from '../../../core/supabase/supabase.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockSupabase: {
    signInWithPassword: jest.Mock;
    sendOtp: jest.Mock;
    markPasswordSet: jest.Mock;
    listMfaFactors: jest.Mock;
  };
  let mockRouter: { navigate: jest.Mock };

  beforeEach(async () => {
    mockSupabase = {
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      sendOtp:            jest.fn().mockResolvedValue({ data: {}, error: null }),
      markPasswordSet:    jest.fn(),
      listMfaFactors:     jest.fn().mockResolvedValue({ data: { totp: [], phone: [] }, error: null }),
    };
    mockRouter = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router,          useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(LoginComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('démarre en mode "password" par défaut', () => {
    expect(component.mode()).toBe('password');
  });

  describe('mode password', () => {
    beforeEach(() => {
      component.form.controls.email.setValue('a@b.cg');
      component.form.controls.password.setValue('motdepasse123');
    });

    it('appelle signInWithPassword avec email + mot de passe', async () => {
      await component.submit();
      expect(mockSupabase.signInWithPassword).toHaveBeenCalledWith('a@b.cg', 'motdepasse123');
    });

    it('navigue vers /dashboard après succès', async () => {
      await component.submit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('marque le mot de passe comme défini après succès', async () => {
      await component.submit();
      expect(mockSupabase.markPasswordSet).toHaveBeenCalled();
    });

    it('rejette un mot de passe trop court', async () => {
      component.form.controls.password.setValue('court');
      await component.submit();
      expect(mockSupabase.signInWithPassword).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('8 caractères');
    });

    it('affiche message FR sur Invalid login credentials', async () => {
      mockSupabase.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
      await component.submit();
      expect(component.errorMessage()).toContain('incorrect');
    });

    it('affiche message rate-limit sur erreur "rate"', async () => {
      mockSupabase.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'rate limit exceeded' } });
      await component.submit();
      expect(component.errorMessage()).toContain('Trop de tentatives');
    });
  });

  describe('mode OTP', () => {
    beforeEach(() => {
      component.setMode('otp');
      component.form.controls.email.setValue('a@b.cg');
    });

    it('appelle sendOtp et navigue vers /verifier', async () => {
      await component.submit();
      expect(mockSupabase.sendOtp).toHaveBeenCalledWith('a@b.cg');
      expect(mockRouter.navigate).toHaveBeenCalledWith(
        ['/verifier'],
        { queryParams: { email: 'a@b.cg', from: 'login' } },
      );
    });

    it("n'appelle PAS signInWithPassword", async () => {
      await component.submit();
      expect(mockSupabase.signInWithPassword).not.toHaveBeenCalled();
    });

    it('affiche un message de limite quand sendOtp signale un rate-limit', async () => {
      mockSupabase.sendOtp.mockResolvedValue({ data: null, error: { message: 'For security purposes, you can only request this after 60s' } });
      await component.submit();
      expect(component.errorMessage()).toContain('Trop de tentatives');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('affiche un message "non invitée" pour une autre erreur sendOtp', async () => {
      mockSupabase.sendOtp.mockResolvedValue({ data: null, error: { message: 'user not found' } });
      await component.submit();
      expect(component.errorMessage()).toContain('invitée');
    });
  });

  describe('setMode()', () => {
    it('change le mode et efface le message d\'erreur', () => {
      component.errorMessage.set('erreur précédente');
      component.setMode('otp');
      expect(component.mode()).toBe('otp');
      expect(component.errorMessage()).toBe('');
    });
  });

  describe('après connexion par mot de passe', () => {
    beforeEach(() => {
      component.form.controls.email.setValue('a@b.cg');
      component.form.controls.password.setValue('motdepasse123');
    });

    // MFA is currently disabled. Password sign-in always goes to /dashboard.
    it("navigue toujours vers /dashboard (pas de détour /verifier-2fa)", async () => {
      await component.submit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('visibilité du mot de passe', () => {
    it('showPassword démarre à false', () => {
      expect(component.showPassword()).toBe(false);
    });

    it('toggleShowPassword bascule la visibilité à true puis à false', () => {
      component.toggleShowPassword();
      expect(component.showPassword()).toBe(true);
      component.toggleShowPassword();
      expect(component.showPassword()).toBe(false);
    });
  });
});
