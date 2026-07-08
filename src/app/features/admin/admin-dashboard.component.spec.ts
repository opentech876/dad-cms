import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminService, AdminDashboardStats } from '../../core/admin/admin.service';

const FAKE_STATS: AdminDashboardStats = {
  workspaces: { active: 3, deleted: 1 },
  users: { total: 10, confirmed: 7, pending: 3, system_admins: 1 },
  recent_workspaces: [
    { id: 'w-1', name: 'Atelier A', created_at: '2026-06-01T08:00:00Z', deleted_at: null,                          member_count: 4 },
    { id: 'w-2', name: 'Atelier B', created_at: '2026-05-15T08:00:00Z', deleted_at: '2026-06-20T08:00:00Z',         member_count: 2 },
  ],
  pending_invitations: [
    { id: 'u-1', email: 'foo@bar.com', created_at: '2026-06-22T09:00:00Z', invited_role: 'editeur', workspace_id: 'w-1' },
  ],
};

describe('AdminDashboardComponent', () => {
  let component: AdminDashboardComponent;
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let admin: { dashboardStats: jest.Mock };

  beforeEach(async () => {
    admin = { dashboardStats: jest.fn().mockReturnValue(of(FAKE_STATS)) };
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [{ provide: AdminService, useValue: admin }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(AdminDashboardComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
  });

  it('charge les stats au démarrage', async () => {
    await component.ngOnInit();
    expect(admin.dashboardStats).toHaveBeenCalled();
    expect(component.stats()).toEqual(FAKE_STATS);
    expect(component.loading()).toBe(false);
  });

  it('totalMemberships somme member_count à travers recent_workspaces', async () => {
    await component.ngOnInit();
    expect(component.totalMemberships()).toBe(6);
  });

  it("expose une erreur si dashboardStats échoue", async () => {
    admin.dashboardStats.mockReturnValueOnce(throwError(() => new Error('boom')));
    await component.ngOnInit();
    expect(component.error()).toContain('boom');
    expect(component.stats()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  it("reload() réinitialise loading et recharge", async () => {
    await component.ngOnInit();
    admin.dashboardStats.mockClear();
    await component.reload();
    expect(admin.dashboardStats).toHaveBeenCalledTimes(1);
  });
});
