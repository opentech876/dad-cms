import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AdminUsersComponent } from './admin-users.component';
import { AdminService, AdminUser } from '../../core/admin/admin.service';

const FAKE_USERS: AdminUser[] = [
  {
    user_id: 'u1', email: 'admin@open-tech.cg', display_name: 'Elvis O.',
    global_role: 'system_admin', email_confirmed_at: '2026-01-01T08:00:00Z',
    banned: false, created_at: '2026-01-01T08:00:00Z',
    memberships: [{ workspace_id: 'ws-1', workspace_name: 'DIOUGA-DIOP Media', role: 'owner', joined_at: '2026-01-01T08:00:00Z', deleted: false }],
  },
  {
    user_id: 'u2', email: 'editor@test.com', display_name: 'Alice Martin',
    global_role: 'editeur', email_confirmed_at: '2026-02-01T08:00:00Z',
    banned: false, created_at: '2026-02-01T08:00:00Z',
    memberships: [{ workspace_id: 'ws-1', workspace_name: 'DIOUGA-DIOP Media', role: 'editeur', joined_at: '2026-02-01T08:00:00Z', deleted: false }],
  },
  {
    user_id: 'u3', email: 'pending@test.com', display_name: null,
    global_role: 'editeur', email_confirmed_at: null,
    banned: false, created_at: '2026-06-20T14:00:00Z',
    memberships: [{ workspace_id: 'ws-1', workspace_name: 'DIOUGA-DIOP Media', role: 'editeur', joined_at: '2026-06-20T14:00:00Z', deleted: false }],
  },
];

describe('AdminUsersComponent', () => {
  let component: AdminUsersComponent;
  let fixture: ComponentFixture<AdminUsersComponent>;
  let admin: jest.Mocked<Pick<AdminService, 'listAllUsers'>>;

  beforeEach(async () => {
    admin = { listAllUsers: jest.fn().mockReturnValue(of(FAKE_USERS)) };

    await TestBed.configureTestingModule({
      imports: [AdminUsersComponent],
      providers: [{ provide: AdminService, useValue: admin }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(AdminUsersComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(AdminUsersComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('charge la liste globale des utilisateurs au démarrage', async () => {
    await component.ngOnInit();
    expect(admin.listAllUsers).toHaveBeenCalled();
    expect(component.users().length).toBe(3);
  });

  it('filtre par recherche (email ou nom)', async () => {
    await component.ngOnInit();
    component.searchQuery.set('alice');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].user_id).toBe('u2');

    component.searchQuery.set('@open-tech');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].user_id).toBe('u1');
  });

  it('compte les utilisateurs en attente (sans email_confirmed_at)', async () => {
    await component.ngOnInit();
    expect(component.pendingCount()).toBe(1);
  });

  it('compte les system_admin', async () => {
    await component.ngOnInit();
    expect(component.systemAdminCount()).toBe(1);
  });

  it('remplit la bannière d\'erreur et vide la liste si le RPC échoue', async () => {
    admin.listAllUsers.mockReturnValueOnce(throwError(() => new Error('boom')));
    await component.ngOnInit();
    expect(component.error()).toBe('boom');
    expect(component.users()).toEqual([]);
    expect(component.loading()).toBe(false);
  });

  it('reload() efface l\'erreur et recharge les données', async () => {
    admin.listAllUsers.mockReturnValueOnce(throwError(() => new Error('boom')));
    await component.ngOnInit();
    expect(component.error()).toBe('boom');

    admin.listAllUsers.mockReturnValueOnce(of(FAKE_USERS));
    await component.reload();
    expect(component.error()).toBeNull();
    expect(component.users().length).toBe(3);
  });
});
