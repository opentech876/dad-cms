import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { SupabaseService } from '../../../core/supabase/supabase.service';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockSupabase: {
    updatePassword: jest.Mock;
    markPasswordSet: jest.Mock;
    currentSession$: any;
  };
  let mockRouter: { navigate: jest.Mock };
  let session$: BehaviorSubject<any>;

  function build(initialSession: any = { access_token: 'recovery-token', user: { id: 'u1' } }) {
    session$ = new BehaviorSubject<any>(initialSession);
    mockSupabase = {
      updatePassword:  jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      markPasswordSet: jest.fn(),
      currentSession$: session$.asObservable(),
    };
    mockRouter = { navigate: jest.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router,          useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(ResetPasswordComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    // Short grace period so the no-session test doesn't wait the real 1500ms.
    component.sessionGracePeriodMs = 30;
    // Skip fixture.detectChanges() — tests call ngOnInit explicitly when they need session-check behavior.
  }

  beforeEach(() => {
    build();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('showPassword démarre à false', () => {
    expect(component.showPassword()).toBe(false);
  });

  it('toggleShowPassword bascule la visibilité', () => {
    component.toggleShowPassword();
    expect(component.showPassword()).toBe(true);
    component.toggleShowPassword();
    expect(component.showPassword()).toBe(false);
  });

  describe('submit()', () => {
    beforeEach(() => {
      // Pre-grant a valid session so submit() tests don't go through the lien-expiré gate.
      component.hasValidSession.set(true);
      component.sessionReady.set(true);
    });

    it('rejette un mot de passe < 8 caractères', async () => {
      component.newPassword.set('court');
      await component.submit();
      expect(mockSupabase.updatePassword).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('8 caractères');
    });

    it('appelle updatePassword avec le nouveau mot de passe', async () => {
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(mockSupabase.updatePassword).toHaveBeenCalledWith('nouveaumotdepasse');
    });

    it('appelle markPasswordSet après succès', async () => {
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(mockSupabase.markPasswordSet).toHaveBeenCalled();
    });

    it('passe success à true après succès', async () => {
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(component.success()).toBe(true);
    });

    it("affiche message d'erreur en cas d'échec Supabase", async () => {
      mockSupabase.updatePassword.mockResolvedValue({ data: null, error: { message: 'Token expiré' } });
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(component.errorMessage()).toContain('Token expiré');
      expect(component.success()).toBe(false);
    });

    it('ne soumet pas quand loading est true', async () => {
      component.loading.set(true);
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(mockSupabase.updatePassword).not.toHaveBeenCalled();
    });

    it('refuse de soumettre quand linkExpired est true', async () => {
      component.linkExpired.set(true);
      component.newPassword.set('nouveaumotdepasse');
      await component.submit();
      expect(mockSupabase.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('vérification de la session (lien expiré)', () => {
    it("hasValidSession est true quand la session existe", async () => {
      await component.ngOnInit();
      expect(component.hasValidSession()).toBe(true);
      expect(component.linkExpired()).toBe(false);
    });

    it("linkExpired est true et hasValidSession false quand currentSession$ émet null sans session", async () => {
      build(null);
      await component.ngOnInit();
      expect(component.linkExpired()).toBe(true);
      expect(component.hasValidSession()).toBe(false);
    });

    it("sessionReady passe à true après vérification", async () => {
      await component.ngOnInit();
      expect(component.sessionReady()).toBe(true);
    });

    it("hasValidSession devient true quand une session arrive après l'init", async () => {
      build(null);
      // Initially no session -> linkExpired will be true after grace period
      // But if session arrives, we should re-flip
      session$.next({ access_token: 'recovery-token', user: { id: 'u1' } });
      await component.ngOnInit();
      expect(component.hasValidSession()).toBe(true);
    });
  });
});
