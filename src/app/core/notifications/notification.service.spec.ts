import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from './notification.service';
import { SupabaseService } from '../supabase/supabase.service';

function makeClientMock(
  listData: any[] = [],
  listError: any = null,
  upsertError: any = null,
) {
  const upsertMock   = jest.fn().mockResolvedValue({ error: upsertError });
  const orderMock    = jest.fn().mockResolvedValue({ data: listData, error: listError });
  const selectMock   = jest.fn().mockReturnValue({ order: orderMock });
  const notifFrom    = { select: selectMock };
  const notifReadsFrom = { upsert: upsertMock };

  const fromMock = jest.fn((table: string) => {
    if (table === 'notification_reads') return notifReadsFrom;
    return notifFrom;
  });

  return { from: fromMock, auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let clientMock: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    clientMock = makeClientMock([
      { id: 'n1', title: 'T1', body: 'B1', category: 'editorial', created_at: '2026-05-04T10:00:00Z', notification_reads: [{ read_at: '2026-05-05T08:00:00Z' }] },
      { id: 'n2', title: 'T2', body: 'B2', category: 'campaign',  created_at: '2026-05-03T09:00:00Z', notification_reads: [] },
    ]);

    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        {
          provide: SupabaseService,
          useValue: { client: clientMock },
        },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
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
      const readsResult = clientMock.from.mock.results.find(
        (r: any) => r?.value?.upsert,
      );
      expect(readsResult?.value.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ notification_id: 'n2' }),
        expect.objectContaining({ onConflict: 'notification_id,user_id' }),
      );
    });
  });

  describe('markAllAsRead()', () => {
    it('devrait appeler upsert avec tous les ids', async () => {
      await firstValueFrom(service.markAllAsRead(['n1', 'n2']));
      const readsResult = clientMock.from.mock.results.find(
        (r: any) => r?.value?.upsert,
      );
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
});
