import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { NotificationService } from '../../core/notifications/notification.service';
import { TuiIcon } from '@taiga-ui/core';
import { Notification } from '../../models';

// Register 'fr' locale for DatePipe used in the template.
registerLocaleData(localeFr);

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

  describe('pagination', () => {
    // Build 45 notifications so we cross multiple pages (20 per page → 3 pages).
    const LARGE_SET: Notification[] = Array.from({ length: 45 }, (_, i) => ({
      id: `n${i + 1}`,
      title: `Notification ${i + 1}`,
      body:  'body',
      category: 'editorial',
      created_at: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      read_at: i % 2 === 0 ? '2026-05-05T08:00:00Z' : null,
    }));

    beforeEach(async () => {
      // Outer beforeEach already instantiated TestBed with the small mock;
      // reset so we can re-configure it with the large 45-item dataset.
      TestBed.resetTestingModule();
      svcMock = makeServiceMock(LARGE_SET);
      await TestBed.configureTestingModule({
        imports: [NotificationsComponent, TuiIcon],
        providers: [
          { provide: NotificationService, useValue: svcMock },
          { provide: LOCALE_ID, useValue: 'fr' },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(NotificationsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('devrait paginer par tranches de 20', () => {
      expect(component.paged()).toHaveLength(20);
      expect(component.totalPages()).toBe(3);
      expect(component.currentPage()).toBe(1);
    });

    it('devrait avancer à la page suivante', () => {
      component.goToPage(2);
      expect(component.currentPage()).toBe(2);
      expect(component.paged()).toHaveLength(20);
    });

    it('devrait afficher le reliquat sur la dernière page', () => {
      component.goToPage(3);
      expect(component.paged()).toHaveLength(5); // 45 - 40 = 5
    });

    it('devrait borner goToPage entre 1 et totalPages', () => {
      component.goToPage(-2);
      expect(component.currentPage()).toBe(1);
      component.goToPage(99);
      expect(component.currentPage()).toBe(3);
    });

    it('devrait revenir en page 1 quand on change de filtre', () => {
      component.goToPage(3);
      component.setFilter('unread');
      fixture.detectChanges();
      expect(component.currentPage()).toBe(1);
    });

    it('devrait exposer un libellé de plage lisible', () => {
      component.goToPage(2);
      expect(component.pageRangeLabel()).toBe('21–40 sur 45');
    });
  });
});
