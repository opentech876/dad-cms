import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { systemAdminGuard } from './system-admin.guard';
import { AuthService } from './auth.service';

describe('systemAdminGuard', () => {
  let mockAuth: { isSystemAdmin: jest.Mock };
  let mockRouter: { createUrlTree: jest.Mock };

  function run() {
    // CanActivateFn injects services via inject(); TestBed.runInInjectionContext
    // is the recommended way to invoke it under test.
    return TestBed.runInInjectionContext(() => systemAdminGuard({} as any, {} as any));
  }

  beforeEach(() => {
    mockAuth = { isSystemAdmin: jest.fn() };
    mockRouter = { createUrlTree: jest.fn().mockReturnValue('URL_TREE') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('autorise quand isSystemAdmin retourne true', async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(true));
    await expect(run()).resolves.toBe(true);
  });

  it('redirige vers /dashboard quand le rôle système n\'est pas system_admin', async () => {
    mockAuth.isSystemAdmin.mockReturnValue(of(false));
    const result = await run();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });
});
