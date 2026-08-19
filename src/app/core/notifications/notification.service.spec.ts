import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { NotificationService } from './notification.service';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

function makeClientMock(listData: any[] = [], listError: any = null, upsertError: any = null) {
  const upsertMock = jest.fn().mockResolvedValue({ error: upsertError });
  const orderMock = jest.fn().mockResolvedValue({ data: listData, error: listError });
  const selectMock = jest.fn().mockReturnValue({ order: orderMock });
  const notifFrom = { select: selectMock };
  const notifReadsFrom = { upsert: upsertMock };

  const fromMock = jest.fn((table: string) => {
    if (table === 'notification_reads') return notifReadsFrom;
    return notifFrom;
  });

  return {
    from: fromMock,
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let clientMock: ReturnType<typeof makeClientMock>;
  let supabaseValue: { client: any };
  let mockAuth: { currentRole$: any };

  beforeEach(() => {
    clientMock = makeClientMock([
      {
        id: 'n1',
        title: 'T1',
        body: 'B1',
        category: 'editorial',
        created_at: '2026-05-04T10:00:00Z',
        notification_reads: [{ read_at: '2026-05-05T08:00:00Z' }],
      },
      {
        id: 'n2',
        title: 'T2',
        body: 'B2',
        category: 'campaign',
        created_at: '2026-05-03T09:00:00Z',
        notification_reads: [],
      },
    ]);
    supabaseValue = { client: clientMock };
    mockAuth = { currentRole$: of('owner') };

    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        {
          provide: SupabaseService,
          useValue: supabaseValue,
        },
        { provide: AuthService, useValue: mockAuth },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  describe('filtre Espace Curation (presidence)', () => {
    const ROWS = [
      {
        id: 'c1',
        title: 'Campagne',
        body: 'B',
        category: 'campaign',
        created_at: '2026-07-01T09:00:00Z',
        table_name: 'ad_campaigns',
        notification_reads: [],
      },
      {
        id: 'r1',
        title: 'Recommandation publiée',
        body: 'B',
        category: 'editorial',
        created_at: '2026-07-02T09:00:00Z',
        table_name: 'presidency_recommendations',
        notification_reads: [],
      },
      {
        id: 'e1',
        title: 'Événement modifié',
        body: 'B',
        category: 'editorial',
        created_at: '2026-07-03T09:00:00Z',
        table_name: 'events',
        notification_reads: [],
      },
    ];

    it('la Curatrice ne voit que le flux de curation, rien d autre', async () => {
      supabaseValue.client = makeClientMock(ROWS);
      mockAuth.currentRole$ = of('presidence');

      const result = await firstValueFrom(service.listNotifications());

      expect(result.map((n) => n.id)).toEqual(['r1']);
    });

    it('les autres rôles voient toutes les notifications', async () => {
      supabaseValue.client = makeClientMock(ROWS);
      mockAuth.currentRole$ = of('chef_equipe');

      const result = await firstValueFrom(service.listNotifications());

      expect(result).toHaveLength(3);
    });

    it('le badge non-lu de la Curatrice ne compte que la curation', async () => {
      supabaseValue.client = makeClientMock(ROWS);
      mockAuth.currentRole$ = of('presidence');

      await service.refreshUnread();

      expect(service.unreadCount()).toBe(1);
    });
  });

  describe('listNotifications()', () => {
    it('devrait retourner les notifications avec read_at aplati', async () => {
      const result = await firstValueFrom(service.listNotifications());
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('n1');
      expect(result[0].read_at).toBe('2026-05-05T08:00:00Z');
    });

    it('devrait mapper read_at à null pour les notifications non lues', async () => {
      const result = await firstValueFrom(service.listNotifications());
      expect(result[1].read_at).toBeNull();
    });

    it('devrait interroger notifications avec jointure notification_reads!left', async () => {
      await firstValueFrom(service.listNotifications());
      expect(clientMock.from).toHaveBeenCalledWith('notifications');
      const selectArg = clientMock.from.mock.results[0].value.select.mock.calls[0][0];
      expect(selectArg).toContain('notification_reads!left');
    });
  });

  describe('unreadCount signal', () => {
    it('démarre à 0 avant tout appel', () => {
      expect(service.unreadCount()).toBe(0);
    });

    it('refreshUnread() remplit le signal depuis le serveur', async () => {
      await service.refreshUnread();
      expect(service.unreadCount()).toBe(1);
    });

    it('markAsRead décrémente le signal', async () => {
      await service.refreshUnread();
      expect(service.unreadCount()).toBe(1);
      await firstValueFrom(service.markAsRead('n2'));
      expect(service.unreadCount()).toBe(0);
    });

    it('markAsRead ne descend jamais sous zéro', async () => {
      // Force the signal to 0 without calling refresh, then mark another.
      expect(service.unreadCount()).toBe(0);
      await firstValueFrom(service.markAsRead('n1'));
      expect(service.unreadCount()).toBe(0);
    });

    it('markAllAsRead met le signal à 0 même si des notifications restaient', async () => {
      await service.refreshUnread();
      expect(service.unreadCount()).toBe(1);
      await firstValueFrom(service.markAllAsRead(['n1', 'n2']));
      expect(service.unreadCount()).toBe(0);
    });
  });

  describe('markAsRead()', () => {
    it('devrait appeler upsert sur notification_reads avec onConflict', async () => {
      await firstValueFrom(service.markAsRead('n2'));
      expect(clientMock.from).toHaveBeenCalledWith('notification_reads');
      const readsResult = clientMock.from.mock.results.find((r: any) => r?.value?.upsert);
      expect(readsResult?.value.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ notification_id: 'n2' }),
        expect.objectContaining({ onConflict: 'notification_id,user_id' }),
      );
    });
  });

  describe('markAllAsRead()', () => {
    it('devrait appeler upsert avec tous les ids', async () => {
      await firstValueFrom(service.markAllAsRead(['n1', 'n2']));
      const readsResult = clientMock.from.mock.results.find((r: any) => r?.value?.upsert);
      expect(readsResult?.value.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ notification_id: 'n1' }),
          expect.objectContaining({ notification_id: 'n2' }),
        ]),
        expect.objectContaining({ onConflict: 'notification_id,user_id' }),
      );
    });

    it('devrait retourner void sans erreur', async () => {
      const result = await firstValueFrom(service.markAllAsRead(['n1']));
      expect(result).toBeUndefined();
    });
  });

  describe('getActorProfile()', () => {
    function stubProfiles(result: { data: any; error: any }) {
      const maybeSingle = jest.fn().mockResolvedValue(result);
      const eq2 = jest.fn().mockReturnValue({ maybeSingle });
      const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
      const select = jest.fn().mockReturnValue({ eq: eq1 });
      clientMock.from = jest.fn().mockReturnValue({ select });
    }

    it('renvoie null sans acteur ou sans workspace', async () => {
      expect(await firstValueFrom(service.getActorProfile(null, 'ws-1'))).toBeNull();
      expect(await firstValueFrom(service.getActorProfile('u1', null))).toBeNull();
    });

    it('renvoie le profil quand il existe', async () => {
      stubProfiles({ data: { full_name: 'Elvis', avatar_url: 'a.jpg' }, error: null });
      expect(await firstValueFrom(service.getActorProfile('u1', 'ws-1'))).toEqual({
        full_name: 'Elvis',
        avatar_url: 'a.jpg',
      });
    });

    it('renvoie null en cas d\'erreur ou de profil absent', async () => {
      stubProfiles({ data: null, error: { message: 'rls' } });
      expect(await firstValueFrom(service.getActorProfile('u1', 'ws-1'))).toBeNull();
    });
  });
});
