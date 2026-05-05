import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { ToastService } from '../../core/services/toast.service';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let mockAuth: { getCurrentUser: jest.Mock; currentRole$: any };
  let mockWorkspace: { getMyProfile: jest.Mock; upsertProfile: jest.Mock };
  let mockRouter: { navigate: jest.Mock };
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error'>>;

  const MOCK_PROFILE = { full_name: 'Elvis Destin', phone: '+242 06 000 0001', avatar_url: null };

  beforeEach(async () => {
    mockAuth = {
      getCurrentUser: jest.fn().mockReturnValue(of({ id: 'user-1', email: 'elvis@test.com' })),
      currentRole$: of('owner'),
    };
    mockWorkspace = {
      getMyProfile: jest.fn().mockReturnValue(of(MOCK_PROFILE)),
      upsertProfile: jest.fn().mockReturnValue(of(undefined)),
    };
    mockRouter = { navigate: jest.fn() };
    mockToast  = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: AuthService,    useValue: mockAuth },
        { provide: WorkspaceService, useValue: mockWorkspace },
        { provide: Router,         useValue: mockRouter },
        { provide: ToastService,   useValue: mockToast },
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
});
