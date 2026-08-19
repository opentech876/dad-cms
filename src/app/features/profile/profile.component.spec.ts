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
  let mockAuth: { getCurrentUser: jest.Mock; currentRole$: any; isSystemAdmin: jest.Mock };
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
      isSystemAdmin: jest.fn().mockReturnValue(of(false)),
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

  // ── system_admin specific rendering + persistence ────────────────────────

  describe('profil pour un system_admin', () => {
    async function makeSysadmin(userMeta: Record<string, unknown> = {}, updateUserResult: any = { data: { user: {} }, error: null }) {
      // Wipe call history from the beforeEach owner-role ngOnInit run so
      // assertions about "was/wasn't called" only see the sysadmin pass.
      mockWorkspace.getMyProfile.mockClear();
      mockWorkspace.upsertProfile.mockClear();
      mockToast.success.mockClear();
      mockToast.error.mockClear();
      mockAuth.getCurrentUser = jest.fn().mockReturnValue(of({
        id: 'admin-1',
        email: 'admin@test.com',
        user_metadata: userMeta,
      }));
      mockAuth.currentRole$ = of('system_admin');
      mockAuth.isSystemAdmin = jest.fn().mockReturnValue(of(true));
      mockSupabase.client = { auth: { updateUser: jest.fn().mockResolvedValue(updateUserResult) } };
      // Re-instantiate so ngOnInit re-runs with the new mocks
      fixture = TestBed.createComponent(ProfileComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await component.ngOnInit();
    }

    it("isSysadmin() retourne true quand isSystemAdmin() renvoie true", async () => {
      await makeSysadmin();
      expect(component.isSysadmin()).toBe(true);
    });

    it("hydrate fullName depuis user_metadata quand le sysadmin n'a pas de profil workspace", async () => {
      // Le sysadmin n'a en général pas de ligne profiles : getMyProfile renvoie
      // null, donc le nom affiché vient du user_metadata global.
      mockWorkspace.getMyProfile.mockReturnValue(of(null));
      await makeSysadmin({ full_name: 'Elvis Destin OLEMBE' });
      expect(component.fullName()).toBe('Elvis Destin OLEMBE');
    });

    it("saveProfile écrit dans user_metadata via updateUser, pas dans profiles", async () => {
      await makeSysadmin({ full_name: '' });
      component.fullName.set('Nouveau Nom');
      await component.saveProfile();
      expect(mockSupabase.client.auth.updateUser).toHaveBeenCalledWith({
        data: { full_name: 'Nouveau Nom' },
      });
      expect(mockWorkspace.upsertProfile).not.toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it("saveProfile affiche un toast d'erreur quand updateUser échoue", async () => {
      await makeSysadmin({ full_name: '' }, { data: null, error: { message: 'rate limited' } });
      component.fullName.set('Nom');
      await component.saveProfile();
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('rate limited'),
      );
    });
  });

  describe('avatar / secondary email / MFA', () => {
    beforeEach(async () => {
      global.URL.createObjectURL = jest.fn(() => 'blob:x');
      global.URL.revokeObjectURL = jest.fn();
      (mockWorkspace as any).uploadAvatar = jest.fn().mockReturnValue(of({ success: true, avatarUrl: 'http://cdn/a.png' }));
      await component.ngOnInit();
    });

    it('onAvatarChange stocke le fichier + preview', () => {
      const file = new File([new Uint8Array(3)], 'a.png', { type: 'image/png' });
      component.onAvatarChange({ target: { files: [file] } } as any);
      expect(component.avatarFile()).toBe(file);
      expect(component.avatarPreview()).toBeTruthy();
    });

    it('uploadAvatar: succès puis erreur', async () => {
      component.avatarFile.set(new File([new Uint8Array(3)], 'a.png', { type: 'image/png' }));
      await component.uploadAvatar();
      expect(component.avatarUrl()).toBe('http://cdn/a.png');
      expect(mockToast.success).toHaveBeenCalled();

      (mockWorkspace as any).uploadAvatar = jest.fn().mockReturnValue(of({ success: false, error: 'boom' }));
      component.avatarFile.set(new File([new Uint8Array(3)], 'a.png', { type: 'image/png' }));
      await component.uploadAvatar();
      expect(mockToast.error).toHaveBeenCalledWith('boom');
    });

    it('saveSecondaryEmail: invalide / identique / succès / suppression', async () => {
      component.secondaryEmail.set('pas-un-email');
      await component.saveSecondaryEmail();
      expect(component.secondaryEmailError()).toContain('invalide');

      component.secondaryEmail.set(component.userEmail());
      await component.saveSecondaryEmail();
      expect(component.secondaryEmailError()).toContain('différente');

      component.secondaryEmail.set('secours@test.com');
      await component.saveSecondaryEmail();
      expect(mockSupabase.updateSecondaryEmail).toHaveBeenCalledWith('secours@test.com');

      component.secondaryEmail.set('');
      await component.saveSecondaryEmail();
      expect(mockSupabase.updateSecondaryEmail).toHaveBeenCalledWith(null);
    });

    it('saveSecondaryEmail: erreur DB', async () => {
      mockSupabase.updateSecondaryEmail.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
      component.secondaryEmail.set('secours@test.com');
      await component.saveSecondaryEmail();
      expect(component.secondaryEmailError()).toContain('Erreur');
    });

    it('mfaEnrolled computed', () => {
      component.mfaFactors.set([{ status: 'verified' }]);
      expect(component.mfaEnrolled()).toBe(true);
      component.mfaFactors.set([{ status: 'unverified' }]);
      expect(component.mfaEnrolled()).toBe(false);
    });

    it('startMfaEnrollment: nettoie un facteur pending puis enrôle', async () => {
      mockSupabase.listMfaFactors.mockResolvedValueOnce({ data: { totp: [{ id: 'old', status: 'unverified' }] }, error: null });
      mockSupabase.enrollTotp.mockResolvedValueOnce({ data: { id: 'f1', totp: { qr_code: 'qr', secret: 's' } }, error: null });
      await component.startMfaEnrollment();
      expect(mockSupabase.unenrollTotp).toHaveBeenCalledWith('old');
      expect(component.mfaPendingFactor()?.id).toBe('f1');
    });

    it('startMfaEnrollment: erreur enroll', async () => {
      mockSupabase.enrollTotp.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
      await component.startMfaEnrollment();
      expect(component.mfaError()).toContain('enrôlement');
    });

    it('confirmMfaEnrollment: code court / succès / erreur', async () => {
      component.mfaPendingFactor.set({ id: 'f1', qr: 'q', secret: 's' });
      component.mfaCode.set('123');
      await component.confirmMfaEnrollment();
      expect(mockSupabase.verifyTotpEnrollment).not.toHaveBeenCalled();

      component.mfaCode.set('123456');
      await component.confirmMfaEnrollment();
      expect(mockSupabase.verifyTotpEnrollment).toHaveBeenCalledWith('f1', '123456');
      expect(component.mfaPendingFactor()).toBeNull();

      component.mfaPendingFactor.set({ id: 'f1', qr: 'q', secret: 's' });
      component.mfaCode.set('000000');
      mockSupabase.verifyTotpEnrollment.mockResolvedValueOnce({ data: null, error: { message: 'bad' } });
      await component.confirmMfaEnrollment();
      expect(component.mfaError()).toContain('invalide');
    });

    it('cancelMfaEnrollment nettoie le facteur', () => {
      component.mfaPendingFactor.set({ id: 'f1', qr: 'q', secret: 's' });
      component.cancelMfaEnrollment();
      expect(mockSupabase.unenrollTotp).toHaveBeenCalledWith('f1');
      expect(component.mfaPendingFactor()).toBeNull();
    });

    it('disableMfa: succès puis erreur', async () => {
      await component.disableMfa('f1');
      expect(mockSupabase.unenrollTotp).toHaveBeenCalledWith('f1');
      mockSupabase.unenrollTotp.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
      await component.disableMfa('f2');
      expect(mockToast.error).toHaveBeenCalled();
    });

    it('cancelEmailChange + toggleShowNewPassword', () => {
      component.pendingNewEmail.set('x@y.com');
      component.cancelEmailChange();
      expect(component.pendingNewEmail()).toBe('');
      const before = component.showNewPassword();
      component.toggleShowNewPassword();
      expect(component.showNewPassword()).toBe(!before);
    });
  });

  describe('computeds d\'affichage', () => {
    it('initials: initiales du nom, sinon 1re lettre de l\'e-mail, sinon ?', () => {
      component.fullName.set('Elvis Olembe');
      expect(component.initials()).toBe('EO');
      component.fullName.set('');
      component.userEmail.set('alice@test.com');
      expect(component.initials()).toBe('A');
      component.userEmail.set('');
      expect(component.initials()).toBe('?');
    });

    it('roleLabel: libellé du rôle ou chaîne vide', () => {
      component.role.set('owner');
      expect(component.roleLabel()).toBeTruthy();
      component.role.set(null);
      expect(component.roleLabel()).toBe('');
    });

    it('displayName: nom complet sinon e-mail', () => {
      component.fullName.set('Elvis');
      expect(component.displayName()).toBe('Elvis');
      component.fullName.set('   ');
      component.userEmail.set('a@b.co');
      expect(component.displayName()).toBe('a@b.co');
    });
  });
});
