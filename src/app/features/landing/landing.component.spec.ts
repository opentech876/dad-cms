import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LandingComponent } from './landing.component';
import { SupabaseService } from '../../core/supabase/supabase.service';

describe('LandingComponent', () => {
  let router: { navigate: jest.Mock };

  function setup(session: any) {
    router = { navigate: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        LandingComponent,
        { provide: SupabaseService, useValue: { client: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session } }) } } } },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.inject(LandingComponent);
  }

  it('redirige vers /dashboard quand une session existe', async () => {
    const comp = setup({ user: { id: 'u1' } });
    await comp.ngOnInit();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirige vers /login sans session', async () => {
    const comp = setup(null);
    await comp.ngOnInit();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
