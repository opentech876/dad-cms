import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { EventService } from './event.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { CreateEventDto, Event } from '../../models';

const MOCK_EVENT: Event = {
  id: 'evt-1',
  event_date: '1960-08-15',
  title: 'Indépendance du Congo',
  status: 'published',
  workspace_id: 'ws-1',
  description: null,
  image_path: null,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
  deleted_at: null,
  deleted_by: null,
};

const MOCK_EVENT_OTHER: Event = {
  ...MOCK_EVENT,
  id: 'evt-2',
  event_date: '1963-06-15', // different mmdd: '06-15'
  title: 'Autre événement',
};

const MOCK_CREATE_DTO: CreateEventDto = {
  event_date: '1960-08-15',
  title: 'Indépendance du Congo',
};

describe('EventService', () => {
  let service: EventService;
  let mockSupabase: any;
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock };

  function buildSelectChain(result: any) {
    const chain: any = {};
    Object.assign(chain, {
      select: jest.fn().mockReturnValue(chain),
      eq: jest.fn().mockReturnValue(chain),
      is: jest.fn().mockReturnValue(chain),
      order: jest.fn().mockReturnValue(chain),
      range: jest.fn().mockResolvedValue(result),
      then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    });
    return chain;
  }

  function buildInsertChain(result: any) {
    return {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(result),
    };
  }

  function buildUpdateChain(result: any) {
    return {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue(result),
    };
  }

  let mockStorage: any;

  beforeEach(() => {
    mockStorage = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: { path: 'evt-1/cover.jpg' }, error: null }),
        getPublicUrl: jest
          .fn()
          .mockReturnValue({ data: { publicUrl: 'https://example.com/img.jpg' } }),
      }),
    };

    mockSupabase = {
      client: {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        },
        from: jest.fn(),
        storage: mockStorage,
      },
    };

    mockWorkspaceContext = {
      activeWorkspaceId: jest.fn().mockReturnValue('ws-1'),
    };

    TestBed.configureTestingModule({
      providers: [
        EventService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
      ],
    });

    service = TestBed.inject(EventService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  // ─── listEvents() ───────────────────────────────────────────

  describe('listEvents()', () => {
    it('retourne les événements de la bibliothèque depuis Supabase', async () => {
      const chain = buildSelectChain({ data: [MOCK_EVENT], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEvents());

      expect(mockSupabase.client.from).toHaveBeenCalledWith('events');
      expect(result).toEqual([MOCK_EVENT]);
    });

    it('filtre les événements soft-deletés', async () => {
      const chain = buildSelectChain({ data: [], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.listEvents());

      expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it("retourne [] en cas d'erreur Supabase", async () => {
      const chain = buildSelectChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEvents());
      expect(result).toEqual([]);
    });

    it('filtre par workspace_id quand activeWorkspaceId est défini', async () => {
      const chain = buildSelectChain({ data: [MOCK_EVENT], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.listEvents());

      expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    });

    it('pagine au-delà de 1000 lignes (limite PostgREST par défaut)', async () => {
      // Page 1: 1000 rows ; Page 2: 35 rows → total 1035
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ ...MOCK_EVENT, id: `evt-${i + 1}` }));
      const page2 = Array.from({ length: 35 }, (_, i) => ({
        ...MOCK_EVENT,
        id: `evt-${1001 + i}`,
      }));

      // Build a chain whose .range() resolves with different pages on each call
      const results = [
        { data: page1, error: null },
        { data: page2, error: null },
      ];
      const chain: any = {};
      Object.assign(chain, {
        select: jest.fn().mockReturnValue(chain),
        eq: jest.fn().mockReturnValue(chain),
        is: jest.fn().mockReturnValue(chain),
        order: jest.fn().mockReturnValue(chain),
        range: jest.fn().mockImplementation(() => {
          const next = results.shift() ?? { data: [], error: null };
          return Promise.resolve(next);
        }),
      });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEvents());

      expect(result).toHaveLength(1035);
      expect(chain.range).toHaveBeenCalledTimes(2);
      expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it("s'arrête dès qu'une page renvoie moins de 1000 lignes", async () => {
      // Single page of 500 rows → only one .range() call
      const page1 = Array.from({ length: 500 }, (_, i) => ({ ...MOCK_EVENT, id: `evt-${i + 1}` }));
      const chain: any = {};
      Object.assign(chain, {
        select: jest.fn().mockReturnValue(chain),
        eq: jest.fn().mockReturnValue(chain),
        is: jest.fn().mockReturnValue(chain),
        order: jest.fn().mockReturnValue(chain),
        range: jest.fn().mockResolvedValue({ data: page1, error: null }),
      });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEvents());

      expect(result).toHaveLength(500);
      expect(chain.range).toHaveBeenCalledTimes(1);
    });
  });

  // ─── listEventsByMmdd() ─────────────────────────────────────

  describe('listEventsByMmdd()', () => {
    it('retourne uniquement les événements dont le MM-DD correspond', async () => {
      const chain = buildSelectChain({ data: [MOCK_EVENT, MOCK_EVENT_OTHER], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEventsByMmdd('08-15'));

      expect(result).toEqual([MOCK_EVENT]);
      expect(result.every((e) => e.event_date.slice(5) === '08-15')).toBe(true);
    });

    it('retourne un tableau vide quand aucun événement ne correspond au MM-DD', async () => {
      const chain = buildSelectChain({ data: [MOCK_EVENT], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.listEventsByMmdd('01-01'));
      expect(result).toEqual([]);
    });
  });

  // ─── createEvent() ──────────────────────────────────────────

  describe('createEvent()', () => {
    it('insère un nouvel événement dans la table events', async () => {
      const chain = buildInsertChain({ data: { id: 'evt-new' }, error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.createEvent(MOCK_CREATE_DTO));

      expect(mockSupabase.client.from).toHaveBeenCalledWith('events');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Indépendance du Congo',
          event_date: '1960-08-15',
          status: 'draft',
        }),
      );
    });

    it("renseigne l'historien avec le nom du profil du créateur (jamais un simple rôle)", async () => {
      const insertChain = buildInsertChain({ data: { id: 'evt-new' }, error: null });
      const profileChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { full_name: 'Marie Mvondo' }, error: null }),
      };
      mockSupabase.client.from.mockImplementation((table: string) =>
        table === 'profiles' ? profileChain : insertChain,
      );

      await firstValueFrom(service.createEvent(MOCK_CREATE_DTO));

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ historian: 'Marie Mvondo' }),
      );
    });

    it("respecte l'historien fourni explicitement par l'appelant", async () => {
      const insertChain = buildInsertChain({ data: { id: 'evt-new' }, error: null });
      mockSupabase.client.from.mockReturnValue(insertChain);

      await firstValueFrom(service.createEvent({ ...MOCK_CREATE_DTO, historian: 'Import Excel' }));

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ historian: 'Import Excel' }),
      );
    });

    it('retourne success:true et id quand la création réussit', async () => {
      const chain = buildInsertChain({ data: { id: 'evt-new' }, error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.createEvent(MOCK_CREATE_DTO));
      expect(result).toEqual({ success: true, id: 'evt-new' });
    });

    it("retourne success:false avec message en cas d'erreur", async () => {
      const chain = buildInsertChain({ data: null, error: { message: 'Contrainte violée' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.createEvent(MOCK_CREATE_DTO));
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ─── updateEvent() ──────────────────────────────────────────

  describe('updateEvent()', () => {
    it('met à jour la ligne events avec updated_by', async () => {
      const chain = buildUpdateChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.updateEvent('evt-1', { title: 'Nouveau titre' }));

      expect(mockSupabase.client.from).toHaveBeenCalledWith('events');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nouveau titre', updated_by: 'user-1' }),
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'evt-1');
    });

    it('retourne success:true quand la mise à jour réussit', async () => {
      const chain = buildUpdateChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.updateEvent('evt-1', { title: 'X' }));
      expect(result).toEqual({ success: true });
    });

    it("retourne success:false en cas d'erreur", async () => {
      const chain = buildUpdateChain({ error: { message: 'Erreur' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.updateEvent('evt-1', { title: 'X' }));
      expect(result.success).toBe(false);
    });
  });

  // ─── uploadImage() ──────────────────────────────────────────

  describe('uploadImage()', () => {
    it('uploade vers le bucket historical-images', async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const storageMock = {
        upload: jest.fn().mockResolvedValue({ data: { path: 'evt-1/cover.jpg' }, error: null }),
        getPublicUrl: jest.fn(),
      };
      mockStorage.from.mockReturnValue(storageMock);

      await firstValueFrom(service.uploadImage('evt-1', file));

      expect(mockStorage.from).toHaveBeenCalledWith('historical-images');
      expect(storageMock.upload).toHaveBeenCalledWith('evt-1/cover.jpg', file, { upsert: true });
    });

    it('retourne le path du fichier uploadé', async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      mockStorage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: { path: 'evt-1/cover.jpg' }, error: null }),
        getPublicUrl: jest.fn(),
      });
      const result = await firstValueFrom(service.uploadImage('evt-1', file));
      expect(result.path).toBe('evt-1/cover.jpg');
    });

    it("retourne path:null et error en cas d'erreur", async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      mockStorage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: null, error: { message: 'Bucket absent' } }),
        getPublicUrl: jest.fn(),
      });
      const result = await firstValueFrom(service.uploadImage('evt-1', file));
      expect(result.path).toBeNull();
      expect(result.error).toBe('Bucket absent');
    });

    it("utilise l'extension du fichier dans le chemin de stockage", async () => {
      const file = new File(['data'], 'photo.png', { type: 'image/png' });
      const storageMock = {
        upload: jest.fn().mockResolvedValue({ data: { path: 'evt-1/cover.png' }, error: null }),
        getPublicUrl: jest.fn(),
      };
      mockStorage.from.mockReturnValue(storageMock);

      await firstValueFrom(service.uploadImage('evt-1', file));

      expect(storageMock.upload).toHaveBeenCalledWith(
        expect.stringMatching(/evt-1\/cover\.png$/),
        file,
        { upsert: true },
      );
    });
  });

  // ─── getImageUrl() ──────────────────────────────────────────

  describe('getImageUrl()', () => {
    it('retourne la publicUrl depuis le bucket historical-images', () => {
      const storageMock = {
        upload: jest.fn(),
        getPublicUrl: jest
          .fn()
          .mockReturnValue({ data: { publicUrl: 'https://example.com/img.jpg' } }),
      };
      mockStorage.from.mockReturnValue(storageMock);

      const url = service.getImageUrl('evt-1/cover.jpg');

      expect(mockStorage.from).toHaveBeenCalledWith('historical-images');
      expect(url).toBe('https://example.com/img.jpg');
    });
  });

  // ─── deleteEvent() ──────────────────────────────────────────

  describe('deleteEvent()', () => {
    it('effectue un soft-delete en mettant deleted_at et deleted_by', async () => {
      const chain = buildUpdateChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.deleteEvent('evt-1'));

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_by: 'user-1' }));
      const updateCall = chain.update.mock.calls[0][0];
      expect(updateCall.deleted_at).toBeDefined();
    });

    it('retourne success:true après suppression', async () => {
      const chain = buildUpdateChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.deleteEvent('evt-1'));
      expect(result).toEqual({ success: true });
    });

    it("retourne success:false en cas d'erreur", async () => {
      const chain = buildUpdateChain({ error: { message: 'Erreur' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.deleteEvent('evt-1'));
      expect(result.success).toBe(false);
    });
  });
});
