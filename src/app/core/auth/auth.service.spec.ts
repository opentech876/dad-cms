import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AuthService', () => {
  let service: AuthService;
  let router: jasmine.SpyObj<Router>;
  let mockSupabase: any;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigate']);

    // currentUser$ starts as null so listenToRoleChanges never hits the DB
    const userSubject = new BehaviorSubject<any>(null);
    mockSupabase = {
      currentUser$: userSubject.asObservable(),
      signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null }),
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── isOwner() ──────────────────────────────────────────────────────────────

  describe('isOwner()', () => {
    it('returns true when role is owner', (done) => {
      (service as any).currentRoleSubject.next('owner');
      service.isOwner().subscribe((v) => { expect(v).toBeTrue(); done(); });
    });

    it('returns false for editeur', (done) => {
      (service as any).currentRoleSubject.next('editeur');
      service.isOwner().subscribe((v) => { expect(v).toBeFalse(); done(); });
    });

    it('returns false when no role', (done) => {
      (service as any).currentRoleSubject.next(null);
      service.isOwner().subscribe((v) => { expect(v).toBeFalse(); done(); });
    });
  });

  // ── hasRoleAtLeast() ───────────────────────────────────────────────────────

  describe('hasRoleAtLeast()', () => {
    it('owner passes every role check', (done) => {
      (service as any).currentRoleSubject.next('owner');
      service.hasRoleAtLeast('charge_communication').subscribe((v) => {
        expect(v).toBeTrue(); done();
      });
    });

    it('chef_equipe passes editeur check', (done) => {
      (service as any).currentRoleSubject.next('chef_equipe');
      service.hasRoleAtLeast('editeur').subscribe((v) => { expect(v).toBeTrue(); done(); });
    });

    it('chef_equipe passes charge_communication check', (done) => {
      (service as any).currentRoleSubject.next('chef_equipe');
      service.hasRoleAtLeast('charge_communication').subscribe((v) => {
        expect(v).toBeTrue(); done();
      });
    });

    it('editeur fails charge_communication check', (done) => {
      (service as any).currentRoleSubject.next('editeur');
      service.hasRoleAtLeast('charge_communication').subscribe((v) => {
        expect(v).toBeFalse(); done();
      });
    });

    it('charge_communication fails editeur check', (done) => {
      (service as any).currentRoleSubject.next('charge_communication');
      service.hasRoleAtLeast('editeur').subscribe((v) => { expect(v).toBeFalse(); done(); });
    });

    it('no role returns false', (done) => {
      (service as any).currentRoleSubject.next(null);
      service.hasRoleAtLeast('editeur').subscribe((v) => { expect(v).toBeFalse(); done(); });
    });
  });

  // ── signOut() ──────────────────────────────────────────────────────────────

  describe('signOut()', () => {
    it('calls supabaseService.signOut and navigates to /login', (done) => {
      service.signOut().subscribe(() => {
        expect(mockSupabase.signOut).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
        done();
      });
    });
  });
});
