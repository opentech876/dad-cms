import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { Observable } from 'rxjs';
import { curatorHomeGuard } from './curator-home.guard';
import { AuthService } from './auth.service';
import { AppRole } from '../../models';

describe('curatorHomeGuard', () => {
  let createUrlTree: jest.Mock;

  function run(role: AppRole | null) {
    createUrlTree = jest.fn().mockReturnValue('CURATION_URL_TREE');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentRole$: of(role) } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
    return TestBed.runInInjectionContext(
      () => curatorHomeGuard({} as any, {} as any) as Observable<unknown>,
    );
  }

  it('redirige presidence vers /curation — un seul tableau de bord', async () => {
    const result = await firstValueFrom(run('presidence'));

    expect(result).toBe('CURATION_URL_TREE');
    expect(createUrlTree).toHaveBeenCalledWith(['/curation']);
  });

  it('laisse passer owner sur le tableau de bord général', async () => {
    const result = await firstValueFrom(run('owner'));

    expect(result).toBe(true);
  });

  it('laisse passer les rôles éditoriaux et commerciaux', async () => {
    expect(await firstValueFrom(run('chef_equipe'))).toBe(true);
    expect(await firstValueFrom(run('editeur'))).toBe(true);
    expect(await firstValueFrom(run('charge_communication'))).toBe(true);
  });

  it("laisse passer quand le rôle n'est pas encore résolu (authGuard gère l'accès)", async () => {
    const result = await firstValueFrom(run(null));

    expect(result).toBe(true);
  });
});
