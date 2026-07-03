import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { NotificationService } from '../../core/notifications/notification.service';
import { TuiIcon } from '@taiga-ui/core';
import { Notification } from '../../models';

const routerMock = { navigateByUrl: jest.fn().mockResolvedValue(true) };

// Register 'fr' locale for DatePipe used in the template.
registerLocaleData(localeFr);

// Helper so we don't repeat the seven detail-modal fields on every fixture.
function makeNotif(overrides: Partial<Notification>): Notification {
  return {
    id: 'n',
    title: 'Titre',
    body:  'Corps',
    category: 'editorial',
    created_at: '2026-05-01T00:00:00Z',
    read_at: null,
    workspace_id: 'ws-1',
    actor_id:     'u-1',
    action:       'INSERT',
    table_name:   'events',
    record_id:    'ev-1',
    link_path:    '/evenements',
    ...overrides,
  };
}

const MOCK_NOTIFICATIONS: Notification[] = [
  makeNotif({ id: 'n1', title: 'Indépendance du Congo',    body: 'Le 15 août 1960…',    created_at: '2026-05-04T10:00:00Z', read_at: '2026-05-05T08:00:00Z' }),
  makeNotif({ id: 'n2', title: 'Nouvelle campagne AIRTEL', body: 'Forfait ya sika…',    created_at: '2026-05-03T09:00:00Z', category: 'campaign' }),
  makeNotif({ id: 'n3', title: 'Fête nationale 2025',      body: 'Événement éditorial…', created_at: '2026-05-01T07:00:00Z' }),
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
    // New detail-modal helper. Default returns a fake actor; specific tests
    // override with mockReturnValueOnce.
    getActorProfile:   jest.fn().mockReturnValue(of({ full_name: 'Alice Martin', avatar_url: null })),
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
      providers: [
        { provide: NotificationService, useValue: svcMock },
        { provide: Router,              useValue: routerMock },
      ],
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

  describe('openDetail() — détail modal', () => {
    it('ouvre le modal avec la notification sélectionnée', async () => {
      const n = component.notifications()[0];
      await component.openDetail(n);
      expect(component.selectedNotif()?.id).toBe(n.id);
    });

    it('marque comme lu si la notification était non lue', async () => {
      const unread = component.notifications().find(n => !n.read_at)!;
      await component.openDetail(unread);
      expect(svcMock.markAsRead).toHaveBeenCalledWith(unread.id);
    });

    it("n'appelle pas markAsRead si la notification était déjà lue", async () => {
      const alreadyRead = component.notifications().find(n => !!n.read_at)!;
      await component.openDetail(alreadyRead);
      expect(svcMock.markAsRead).not.toHaveBeenCalledWith(alreadyRead.id);
    });

    it('récupère le profil de l\'auteur en tâche de fond', async () => {
      const n = component.notifications()[0];
      await component.openDetail(n);
      expect(svcMock.getActorProfile).toHaveBeenCalledWith(n.actor_id, n.workspace_id);
      expect(component.selectedActor()).toEqual({ full_name: 'Alice Martin', avatar_url: null });
    });

    it("ne récupère pas l'auteur si actor_id est null (notification système)", async () => {
      const systemNotif = { ...component.notifications()[0], actor_id: null };
      await component.openDetail(systemNotif);
      expect(svcMock.getActorProfile).not.toHaveBeenCalled();
    });

    it('closeDetail() réinitialise le state', () => {
      component.selectedNotif.set(component.notifications()[0]);
      component.selectedActor.set({ full_name: 'X', avatar_url: null });
      component.closeDetail();
      expect(component.selectedNotif()).toBeNull();
      expect(component.selectedActor()).toBeNull();
    });

    it('openLink() navigue vers le link_path puis ferme', async () => {
      const n = component.notifications()[0];
      await component.openDetail(n);
      await component.openLink();
      expect(routerMock.navigateByUrl).toHaveBeenCalledWith(n.link_path);
      expect(component.selectedNotif()).toBeNull();
    });

    it("actionLabel mappe les opérations SQL en français", () => {
      expect(component.actionLabel('INSERT')).toBe('Créé');
      expect(component.actionLabel('UPDATE')).toBe('Modifié');
      expect(component.actionLabel('DELETE')).toBe('Supprimé');
      expect(component.actionLabel(null)).toBe('');
    });

    it("tableLabel mappe les tables en libellés lisibles", () => {
      expect(component.tableLabel('events')).toBe('Événement');
      expect(component.tableLabel('calendars')).toBe('Calendrier');
      expect(component.tableLabel('ad_campaigns')).toBe('Campagne publicitaire');
      expect(component.tableLabel(null)).toBe('');
    });
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
