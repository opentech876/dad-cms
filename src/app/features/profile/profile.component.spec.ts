import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ToastService } from '../../core/services/toast.service';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let mockAuth: { getCurrentUser: jest.Mock; currentRole$: any };
  let mockWorkspace: { getMyProfile: jest.Mock; upsertProfile: jest.Mock };
  let mockSupabase: any;
  let mockRouter: { navigate: jest.Mock };
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error'>>;
  let queryParams: Record<string, string | null>;

  const MOCK_PROFILE = { full_name: 'Elvis Destin', phone: '+242 06 000 0001', avatar_url: null };

  beforeEach(async () => {
    mockAuth = {
      getCurrentUser: jest.fn().mockReturnValue(of({ id: 'user-1', email: 'elvis@test.com' })),
      currentRole$: of('owner'),
    };
    mockWorkspace = {
      getMyProfile: jest.fn().mockReturnValue(of(MOCK_PROFILE)),
      upsertProfile: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockSupabase = {
      updatePassword:        jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      markPasswordSet:       jest.fn(),
      updateEmail:           jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      updateSecondaryEmail:  jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      listMfaFactors:        jest.fn().mockResolvedValue({ data: { totp: [], phone: [] }, error: null }),
      enrollTotp:            jest.fn().mockResolvedValue({
        data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;base64,xxx', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } },
        error: null,
      }),
      verifyTotpEnrollment:  jest.fn().mockResolvedValue({ data: { success: true }, error: null }),
      unenrollTotp:          jest.fn().mockResolvedValue({ data: null, error: null }),
    } as any;
    mockRouter = { navigate: jest.fn() };
    mockToast  = { success: jest.fn(), error: jest.fn() };
    queryParams = {};

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: AuthService,    useValue: mockAuth },
        { provide: WorkspaceService, useValue: mockWorkspace },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router,         useValue: mockRouter },
        { provide: ToastService,   useValue: mockToast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (key: string) => queryParams[key] ?? null },
            },
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(ProfileComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.ngOnInit();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── chargement ─────────────────────────────────────────────────────────────

  describe('chargement du profil', () => {
    it('appelle getMyProfile avec le userId courant', () => {
      expect(mockWorkspace.getMyProfile).toHaveBeenCalledWith('user-1');
    });

    it('initialise fullName depuis le profil', () => {
      expect(component.fullName()).toBe('Elvis Destin');
    });

    it('initialise phone depuis le profil', () => {
      expect(component.phone()).toBe('+242 06 000 0001');
    });

    it('initialise userEmail depuis l\'utilisateur courant', () => {
      expect(component.userEmail()).toBe('elvis@test.com');
    });
  });

  // ── bannière MFA requise ──────────────────────────────────────────────────

  describe('bannière "MFA requise" (?mfa_required=1)', () => {
    async function recreateWithParam(value: string | null) {
      queryParams['mfa_required'] = value;
      fixture = TestBed.createComponent(ProfileComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
    }

    it("n'apparaît pas par défaut", () => {
      expect(component.mfaRequiredBanner()).toBe(false);
    });

    it('apparaît quand ?mfa_required=1', async () => {
      await recreateWithParam('1');
      expect(component.mfaRequiredBanner()).toBe(true);
    });

    it("n'apparaît PAS pour une valeur autre que '1'", async () => {
      await recreateWithParam('yes');
      expect(component.mfaRequiredBanner()).toBe(false);
    });

    it("disparaît après une activation TOTP réussie", async () => {
      await recreateWithParam('1');
      expect(component.mfaRequiredBanner()).toBe(true);
      // Set up a pending enrollment so confirmMfaEnrollment proceeds
      component.mfaPendingFactor.set({ id: 'f1', qr: 'data:', secret: 'X' } as any);
      component.mfaCode.set('123456');
      await component.confirmMfaEnrollment();
      expect(component.mfaRequiredBanner()).toBe(false);
    });

    it('initialise role depuis currentRole$', () => {
      expect(component.role()).toBe('owner');
    });
  });

  // ── saveProfile ────────────────────────────────────────────────────────────

  describe('saveProfile()', () => {
    it('appelle upsertProfile avec userId, fullName et phone', async () => {
      component.fullName.set('Elvis O.');
      component.phone.set('+242 05 111 2222');

      await component.saveProfile();

      expect(mockWorkspace.upsertProfile).toHaveBeenCalledWith(
        'user-1',
        'Elvis O.',
        '+242 05 111 2222',
      );
    });

    it('met saving à false après la sauvegarde', async () => {
      await component.saveProfile();
      expect(component.saving()).toBe(false);
    });

    it('affiche un toast de succès après la sauvegarde', async () => {
      await component.saveProfile();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('ne sauvegarde pas quand saving est true', async () => {
      component.saving.set(true);
      await component.saveProfile();
      expect(mockWorkspace.upsertProfile).not.toHaveBeenCalled();
    });
  });

  // ── branches getMyProfile null / champs null ──────────────────────────────

  describe('profil null ou champs null', () => {
    it('ne modifie pas fullName si getMyProfile retourne null', async () => {
      mockWorkspace.getMyProfile.mockReturnValueOnce(of(null));
      await component.ngOnInit();
      expect(component.fullName()).toBe('Elvis Destin'); // valeur non écrasée
    });

    it('initialise fullName à vide si full_name du profil est null', async () => {
      mockWorkspace.getMyProfile.mockReturnValueOnce(
        of({ full_name: null, phone: '+242 06 000 0001', avatar_url: null }),
      );
      await component.ngOnInit();
      expect(component.fullName()).toBe('');
    });

    it('initialise phone à vide si phone du profil est null', async () => {
      mockWorkspace.getMyProfile.mockReturnValueOnce(
        of({ full_name: 'Elvis Destin', phone: null, avatar_url: null }),
      );
      await component.ngOnInit();
      expect(component.phone()).toBe('');
    });
  });

  // ── navigation ─────────────────────────────────────────────────────────────

  describe('goBack()', () => {
    it('navigue vers /dashboard', () => {
      component.goBack();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  // ── changePassword() ───────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('rejette un mot de passe < 8 caractères', async () => {
      component.newPassword.set('court');
      await component.changePassword();
      expect(mockSupabase.updatePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toContain('8 caractères');
    });

    it('appelle updatePassword et markPasswordSet en cas de succès', async () => {
      component.newPassword.set('motdepasse123');
      await component.changePassword();
      expect(mockSupabase.updatePassword).toHaveBeenCalledWith('motdepasse123');
      expect(mockSupabase.markPasswordSet).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('efface le champ après succès', async () => {
      component.newPassword.set('motdepasse123');
      await component.changePassword();
      expect(component.newPassword()).toBe('');
    });

    it("affiche message d'erreur en cas d'échec Supabase", async () => {
      mockSupabase.updatePassword.mockResolvedValue({ data: null, error: { message: 'Network error' } });
      component.newPassword.set('motdepasse123');
      await component.changePassword();
      expect(component.passwordError()).toContain('Network error');
      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  // ── changement d'e-mail ─────────────────────────────────────────────────────

  describe('changeEmail()', () => {
    it("ne fait rien quand le nouvel e-mail est vide", async () => {
      component.newEmail.set('');
      await component.changeEmail();
      expect(mockSupabase.updateEmail).not.toHaveBeenCalled();
    });

    it("rejette un format e-mail invalide", async () => {
      component.newEmail.set('pasunemail');
      await component.changeEmail();
      expect(mockSupabase.updateEmail).not.toHaveBeenCalled();
      expect(component.emailError()).toContain('valide');
    });

    it("rejette quand le nouvel e-mail est identique à l'actuel", async () => {
      component.newEmail.set('elvis@test.com'); // same as userEmail from MOCK_PROFILE setup
      await component.changeEmail();
      expect(mockSupabase.updateEmail).not.toHaveBeenCalled();
      expect(component.emailError()).toContain('différent');
    });

    it("appelle updateEmail et passe pendingNewEmail en cas de succès", async () => {
      component.newEmail.set('elvis2@test.com');
      await component.changeEmail();
      expect(mockSupabase.updateEmail).toHaveBeenCalledWith('elvis2@test.com');
      expect(component.pendingNewEmail()).toBe('elvis2@test.com');
      expect(mockToast.success).toHaveBeenCalled();
    });

    it("affiche message d'erreur en cas d'échec Supabase", async () => {
      mockSupabase.updateEmail.mockResolvedValue({ data: null, error: { message: 'rate_limit' } });
      component.newEmail.set('elvis2@test.com');
      await component.changeEmail();
      expect(component.emailError()).toBeTruthy();
      expect(component.pendingNewEmail()).toBe('');
    });

    it("ne soumet pas quand emailChanging est true", async () => {
      component.emailChanging.set(true);
      component.newEmail.set('elvis2@test.com');
      await component.changeEmail();
      expect(mockSupabase.updateEmail).not.toHaveBeenCalled();
    });
  });

  // ── visibilité du mot de passe ──────────────────────────────────────────────

  describe('visibilité du mot de passe', () => {
    it('showNewPassword démarre à false', () => {
      expect(component.showNewPassword()).toBe(false);
    });

    it('toggleShowNewPassword bascule la visibilité', () => {
      component.toggleShowNewPassword();
      expect(component.showNewPassword()).toBe(true);
      component.toggleShowNewPassword();
      expect(component.showNewPassword()).toBe(false);
    });
  });
});
