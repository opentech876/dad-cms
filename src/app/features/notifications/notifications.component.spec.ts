import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { NotificationService } from '../../core/notifications/notification.service';
import { TuiIcon } from '@taiga-ui/core';
import { Notification } from '../../models';

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'Indépendance du Congo', body: 'Le 15 août 1960…', category: 'editorial', created_at: '2026-05-04T10:00:00Z', read_at: '2026-05-05T08:00:00Z' },
  { id: 'n2', title: 'Nouvelle campagne AIRTEL', body: 'Forfait ya sika…', category: 'campaign',  created_at: '2026-05-03T09:00:00Z', read_at: null },
  { id: 'n3', title: 'Fête nationale 2025',    body: 'Événement éditorial…', category: 'editorial', created_at: '2026-05-01T07:00:00Z', read_at: null },
];

function makeServiceMock(
  notifications = MOCK_NOTIFICATIONS,
  markError: any = null,
) {
  return {
    listNotifications: jest.fn().mockReturnValue(of(notifications)),
    markAsRead:        jest.fn().mockReturnValue(markError ? throwError(() => markError) : of(undefined)),
    markAllAsRead:     jest.fn().mockReturnValue(of(undefined)),
    unreadCount:       jest.fn().mockReturnValue(of(notifications.filter(n => !n.read_at).length)),
  };
}

describe('NotificationsComponent', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: NotificationsComponent;
  let svcMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    svcMock = makeServiceMock();
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent, TuiIcon],
      providers: [{ provide: NotificationService, useValue: svcMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('devrait charger les notifications au démarrage', () => {
    expect(svcMock.listNotifications).toHaveBeenCalled();
    expect(component.notifications()).toHaveLength(3);
  });

  it('devrait calculer le nombre de non lues', () => {
    expect(component.unreadCount()).toBe(2);
  });

  it('devrait filtrer par catégorie editorial', () => {
    component.setFilter('editorial');
    expect(component.filtered()).toHaveLength(2);
  });

  it('devrait filtrer par catégorie campaign', () => {
    component.setFilter('campaign');
    expect(component.filtered()).toHaveLength(1);
  });

  it('devrait filtrer uniquement les non lues', () => {
    component.setFilter('unread');
    expect(component.filtered()).toHaveLength(2);
  });

  it('devrait afficher toutes les notifications quand filtre = all', () => {
    component.setFilter('all');
    expect(component.filtered()).toHaveLength(3);
  });

  it('devrait appeler markAsRead et mettre à jour la notification', async () => {
    await component.markAsRead('n2');
    expect(svcMock.markAsRead).toHaveBeenCalledWith('n2');
    const updated = component.notifications().find(n => n.id === 'n2');
    expect(updated?.read_at).toBeTruthy();
  });

  it('devrait appeler markAllAsRead avec les ids non lus', async () => {
    await component.markAllAsRead();
    expect(svcMock.markAllAsRead).toHaveBeenCalledWith(['n2', 'n3']);
  });

  it('devrait mettre à jour toutes les notifications comme lues après markAllAsRead', async () => {
    await component.markAllAsRead();
    expect(component.unreadCount()).toBe(0);
  });
});
