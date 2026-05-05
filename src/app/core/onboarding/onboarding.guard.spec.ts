import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { onboardingGuard } from './onboarding.guard';
import { SupabaseService } from '../supabase/supabase.service';

describe('onboardingGuard', () => {
  let router: { createUrlTree: jest.Mock };

  const FAKE_USER_ID = 'user-abc';

  function buildClient(roleData: any, workspaceCount: number) {
    return {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: FAKE_USER_ID } } }),
      },
      from: (table: string) => ({
        select: (_cols: string, _opts?: any) => {
          if (table === 'user_roles') {
            return {
              eq: (_col: string, _val: string) => ({
                single: () => Promise.resolve({ data: roleData }),
              }),
            };
          }
          return Promise.resolve({ count: workspaceCount });
        },
      }),
    };
  }

  function setup(roleData: any, workspaceCount = 0) {
    router = { createUrlTree: jest.fn((cmds: any[]) => cmds as any) };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: SupabaseService,
          useValue: { client: buildClient(roleData, workspaceCount) },
        },
      ],
    });
  }

  it('returns true when user is not owner', async () => {
    setup({ role: 'editeur', expires_at: null });
    const result = await TestBed.runInInjectionContext(() =>
      onboardingGuard({} as any, {} as any),
    );
    expect(result).toBe(true);
  });

  it('returns true when user has no role', async () => {
    setup(null);
    const result = await TestBed.runInInjectionContext(() =>
      onboardingGuard({} as any, {} as any),
    );
    expect(result).toBe(true);
  });

  it('returns true when owner role is expired', async () => {
    setup({ role: 'owner', expires_at: '2020-01-01T00:00:00Z' });
    const result = await TestBed.runInInjectionContext(() =>
      onboardingGuard({} as any, {} as any),
    );
    expect(result).toBe(true);
  });

  it('redirects to /espaces when active owner has no workspace', async () => {
    setup({ role: 'owner', expires_at: null }, 0);
    const result = await TestBed.runInInjectionContext(() =>
      onboardingGuard({} as any, {} as any),
    );
    expect(result).toEqual(['/espaces']);
  });

  it('returns true when active owner already has a workspace', async () => {
    setup({ role: 'owner', expires_at: null }, 1);
    const result = await TestBed.runInInjectionContext(() =>
      onboardingGuard({} as any, {} as any),
    );
    expect(result).toBe(true);
  });
});
