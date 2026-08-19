import { LOCALE_ID, NO_ERRORS_SCHEMA } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminLogsComponent } from './admin-logs.component';
import { AdminService, AdminAuditEntry } from '../../core/admin/admin.service';

registerLocaleData(localeFr);

function makeEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: 'e-1',
    table_name: 'workspaces',
    action: 'INSERT',
    record_id: 'ws-1',
    actor_id: 'u-1',
    actor_email: 'admin@open-tech.cg',
    actor_name: 'Elvis O.',
    workspace_id: 'ws-1',
    workspace_name: 'Nouvel espace',
    old_data: null,
    new_data: { name: 'Nouvel espace' },
    changed_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

describe('AdminLogsComponent', () => {
  let component: AdminLogsComponent;
  let fixture: ComponentFixture<AdminLogsComponent>;
  let admin: jest.Mocked<Pick<AdminService, 'listAuditLog'>>;

  beforeEach(async () => {
    admin = { listAuditLog: jest.fn().mockReturnValue(of([makeEntry()])) };

    await TestBed.configureTestingModule({
      imports: [AdminLogsComponent],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: LOCALE_ID, useValue: 'fr' },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(AdminLogsComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(AdminLogsComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('charge les entrées au démarrage', async () => {
    await component.ngOnInit();
    expect(admin.listAuditLog).toHaveBeenCalledWith(50, null, null);
    expect(component.entries().length).toBe(1);
  });

  it('remplit la bannière d\'erreur si le RPC échoue', async () => {
    admin.listAuditLog.mockReturnValueOnce(throwError(() => new Error('nope')));
    await component.ngOnInit();
    expect(component.error()).toBe('nope');
    expect(component.entries()).toEqual([]);
  });

  it('recharge avec le filtre sélectionné', async () => {
    await component.ngOnInit();
    admin.listAuditLog.mockReturnValueOnce(of([makeEntry({ id: 'e-2', table_name: 'user_roles' })]));
    await component.setFilter('user_roles');
    expect(admin.listAuditLog).toHaveBeenLastCalledWith(50, null, 'user_roles');
    expect(component.activeFilter()).toBe('user_roles');
    expect(component.entries()[0].table_name).toBe('user_roles');
  });

  it('loadMore paginate avant le dernier changed_at', async () => {
    await component.ngOnInit(); // 1 entry, hasMore auto-false since < PAGE_SIZE
    // Force hasMore for the pagination assertion — real backends would only
    // set it false when the last page returns less than PAGE_SIZE.
    component.hasMore.set(true);
    admin.listAuditLog.mockReturnValueOnce(of([makeEntry({ id: 'e-2', changed_at: '2026-06-30T10:00:00Z' })]));
    await component.loadMore();
    expect(admin.listAuditLog).toHaveBeenLastCalledWith(50, '2026-07-01T10:00:00Z', null);
    expect(component.entries().length).toBe(2);
  });

  it('hasMore devient false quand la dernière page renvoie moins que PAGE_SIZE', async () => {
    admin.listAuditLog.mockReturnValueOnce(of([makeEntry()])); // 1 < 50
    await component.reload();
    expect(component.hasMore()).toBe(false);
  });

  describe('describe()', () => {
    it('workspaces INSERT → "a créé l\'espace de travail"', () => {
      const d = component.describe(makeEntry({ action: 'INSERT' }));
      expect(d.verb).toContain('créé');
      expect(d.tone).toBe('created');
    });

    it('workspaces UPDATE avec deleted_at set → tone deleted', () => {
      const d = component.describe(makeEntry({
        action: 'UPDATE',
        old_data: { deleted_at: null },
        new_data: { deleted_at: '2026-07-01T10:00:00Z' },
      }));
      expect(d.verb).toContain('supprimé');
      expect(d.tone).toBe('deleted');
    });

    it('workspaces UPDATE avec deleted_at clear → tone restored', () => {
      const d = component.describe(makeEntry({
        action: 'UPDATE',
        old_data: { deleted_at: '2026-07-01T10:00:00Z' },
        new_data: { deleted_at: null },
      }));
      expect(d.verb).toContain('restauré');
      expect(d.tone).toBe('restored');
    });

    it('workspaces UPDATE avec name change → renommage avec ancien → nouveau', () => {
      const d = component.describe(makeEntry({
        action: 'UPDATE',
        old_data: { name: 'Ancien' },
        new_data: { name: 'Nouveau' },
      }));
      expect(d.verb).toContain('renommé');
      expect(d.target).toBe('Ancien → Nouveau');
    });

    it('workspace_members INSERT → tone created + rôle dans le target', () => {
      const d = component.describe(makeEntry({
        table_name: 'workspace_members',
        action: 'INSERT',
        new_data: { role: 'editeur' },
      }));
      expect(d.tone).toBe('created');
      expect(d.target).toContain('editeur');
    });

    it('user_roles UPDATE → tone updated + ancien → nouveau', () => {
      const d = component.describe(makeEntry({
        table_name: 'user_roles',
        action: 'UPDATE',
        old_data: { role: 'editeur' },
        new_data: { role: 'chef_equipe' },
      }));
      expect(d.target).toBe('editeur → chef_equipe');
    });
  });

  describe('actorLabel()', () => {
    it('renvoie le nom si présent', () => {
      expect(component.actorLabel(makeEntry())).toBe('Elvis O.');
    });
    it('fallback sur email', () => {
      expect(component.actorLabel(makeEntry({ actor_name: null }))).toBe('admin@open-tech.cg');
    });
    it('fallback sur "Système" si aucun', () => {
      expect(component.actorLabel(makeEntry({ actor_name: null, actor_email: null }))).toBe('Système');
    });

    it('actorInitial met la première lettre en majuscule (ou ? si vide)', () => {
      expect(component.actorInitial(makeEntry({ actor_name: 'elvis' }))).toBe('E');
      expect(component.actorInitial(makeEntry({ actor_name: '', actor_email: '' }))).toBe('?');
    });
  });

  describe('describe() — verbe/cible/ton par table et action', () => {
    it('workspaces: création, suppression définitive, soft-delete, restauration, renommage, MAJ', () => {
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'INSERT' })).tone).toBe('created');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'DELETE' })).tone).toBe('deleted');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'UPDATE', old_data: {}, new_data: { deleted_at: 'x' } })).verb).toContain('supprimé l’espace');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'UPDATE', old_data: { deleted_at: 'x' }, new_data: {} })).tone).toBe('restored');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'UPDATE', old_data: { name: 'A' }, new_data: { name: 'B' } })).verb).toContain('renommé');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'UPDATE', old_data: { name: 'A' }, new_data: { name: 'A' } })).verb).toContain('mis à jour');
    });

    it('workspace_members: ajout, retrait, changement de rôle, MAJ générique', () => {
      expect(component.describe(makeEntry({ table_name: 'workspace_members', action: 'INSERT', new_data: { role: 'editeur' } })).tone).toBe('created');
      expect(component.describe(makeEntry({ table_name: 'workspace_members', action: 'INSERT', new_data: {} })).target).toContain('—');
      expect(component.describe(makeEntry({ table_name: 'workspace_members', action: 'DELETE' })).tone).toBe('deleted');
      expect(component.describe(makeEntry({ table_name: 'workspace_members', action: 'UPDATE', old_data: { role: 'editeur' }, new_data: { role: 'owner' } })).verb).toContain('modifié le rôle');
      expect(component.describe(makeEntry({ table_name: 'workspace_members', action: 'UPDATE', old_data: {}, new_data: {} })).verb).toContain('mis à jour un membre');
    });

    it('user_roles: assignation, révocation, modification, MAJ générique', () => {
      expect(component.describe(makeEntry({ table_name: 'user_roles', action: 'INSERT', new_data: { role: 'system_admin' } })).tone).toBe('created');
      expect(component.describe(makeEntry({ table_name: 'user_roles', action: 'DELETE', old_data: { role: 'system_admin' } })).tone).toBe('deleted');
      expect(component.describe(makeEntry({ table_name: 'user_roles', action: 'DELETE', old_data: {} })).target).toBe('—');
      expect(component.describe(makeEntry({ table_name: 'user_roles', action: 'UPDATE', old_data: { role: 'a' }, new_data: { role: 'b' } })).verb).toContain('modifié un rôle');
      expect(component.describe(makeEntry({ table_name: 'user_roles', action: 'UPDATE', old_data: {}, new_data: {} })).verb).toContain('mis à jour un rôle');
    });

    it('table inconnue: retombe sur action/table brutes', () => {
      const r = component.describe(makeEntry({ table_name: 'autre' as any, action: 'UPDATE' }));
      expect(r).toEqual({ verb: 'UPDATE', target: 'autre', icon: '@tui.circle', tone: 'updated' });
    });

    it('workspaceLabel retombe sur new_data/old_data/inconnu', () => {
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'INSERT', workspace_name: null, new_data: { name: 'DepuisNew' } })).target).toBe('DepuisNew');
      expect(component.describe(makeEntry({ table_name: 'workspaces', action: 'DELETE', workspace_name: null, new_data: null, old_data: null })).target).toBe('(espace inconnu)');
    });
  });
});
