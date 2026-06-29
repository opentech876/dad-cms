import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { systemAdminGuard } from './system-admin.guard';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('systemAdminGuard', () => {
  let mockAuth: { isSystemAdmin: jest.Mock };
  let mockSupabase: { getMfaAssuranceLevel: jest.Mock };
  let mockRouter: { createUrlTree: jest.Mock };

  function run(url: string = '/admin') {
    return TestBed.runInInjectionContext(() =>
      systemAdminGuard({} as any, { url } as any),
    );
  }

  beforeEach(() => {
    mockAuth = { isSystemAdmin: jest.fn() };
    mockSupabase = {
      getMfaAssuranceLevel: jest.fn().mockResolvedValue({
        data: { currentLevel: 'aal2', nextLevel: 'aal2' },
        error: null,
      }),
    };
    mockRouter = { createUrlTree: jest.fn().mockReturnValue('URL_TREE') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('autorise un system_admin déjà à AAL2', async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(true));
    await expect(run()).resolves.toBe(true);
  });

  it("redirige vers /dashboard quand l'utilisateur n'est pas system_admin", async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(false));
    const result = await run();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });

  it('redirige un system_admin sans TOTP enrôlé vers /profil avec mfa_required=1', async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(true));
    mockSupabase.getMfaAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' }, // pas de facteur vérifié
      error: null,
    });
    const result = await run();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(
      ['/profil'],
      { queryParams: { mfa_required: '1' } },
    );
    expect(result).toBe('URL_TREE');
  });

  it("redirige un system_admin avec TOTP enrôlé mais session AAL1 vers /verifier-2fa en préservant l'URL demandée", async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(true));
    mockSupabase.getMfaAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    const result = await run('/admin/utilisateurs');
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(
      ['/verifier-2fa'],
      { queryParams: { returnTo: '/admin/utilisateurs' } },
    );
    expect(result).toBe('URL_TREE');
  });

  it("redirige vers /dashboard si l'appel d'AAL échoue (état inconnu, on échoue fermé)", async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(true));
    mockSupabase.getMfaAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const result = await run();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });
});
