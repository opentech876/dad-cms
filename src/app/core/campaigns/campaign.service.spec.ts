import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CampaignService } from './campaign.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

describe('CampaignService', () => {
  let service: CampaignService;
  let mockSupabase: { client: any };
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock };

  let insertSpy: jest.Mock;
  let updateSpy: jest.Mock;
  let deleteSpy: jest.Mock;
  let eqCalls: Array<[string, unknown]>;

  const fakeCampaigns = [
    {
      id: 'c1', name: 'MTN Congo', advertiser: 'MTN', position: 'header',
      start_date: '2026-01-01', end_date: '2026-06-30',
      active: true, image_path: '', link_url: null, workspace_id: 'ws-1',
      created_by: null, deleted_at: null,
    },
  ];

  function buildClient(options: { campaigns?: any[]; newId?: string; simulateError?: string } = {}) {
    const { campaigns = fakeCampaigns, newId = 'camp-new', simulateError } = options;
    eqCalls = [];

    function makeQuery(data: any): any {
      const err = simulateError ? { message: simulateError } : null;
      const q: any = {
        then: (onFulfilled: any, onRejected?: any) =>
          Promise.resolve({ data, error: err }).then(onFulfilled, onRejected),
        select: () => makeQuery(data),
        eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return makeQuery(data); },
        is: () => makeQuery(data),
        order: () => makeQuery(data),
        single: () =>
          Promise.resolve({
            data: err ? null : (Array.isArray(data) ? data[0] ?? null : data),
            error: err,
          }),
      };
      return q;
    }

    insertSpy = jest.fn().mockImplementation(() => makeQuery([{ id: newId }]));
    updateSpy = jest.fn().mockImplementation(() => makeQuery(null));

    const storageMock = {
      upload: jest.fn().mockResolvedValue({ data: { path: 'camp-1/banner.jpg' }, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/banner.jpg' } }),
    };

    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table === 'ad_campaigns') {
          return {
            select: () => makeQuery(campaigns),
            insert: insertSpy,
            update: updateSpy,
          };
        }
        return makeQuery([]);
      },
      storage: { from: (_bucket: string) => storageMock },
    };
  }

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    mockWorkspaceContext = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };

    TestBed.configureTestingModule({
      providers: [
        CampaignService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
      ],
    });

    service = TestBed.inject(CampaignService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  // ── listCampaigns() ─────────────────────────────────────────────────────────

  describe('listCampaigns()', () => {
    it('retourne les campagnes non supprimées', async () => {
      const result = await firstValueFrom(service.listCampaigns());
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('c1');
    });

    it('filtre par workspace_id quand activeWorkspaceId est défini', async () => {
      await firstValueFrom(service.listCampaigns());
      expect(eqCalls).toContainEqual(['workspace_id', 'ws-1']);
    });

    it('ne filtre pas par workspace_id quand activeWorkspaceId est null', async () => {
      mockWorkspaceContext.activeWorkspaceId.mockReturnValue(null);
      await firstValueFrom(service.listCampaigns());
      expect(eqCalls.some(([col]) => col === 'workspace_id')).toBe(false);
    });

    it("retourne [] en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'DB error' });
      const result = await firstValueFrom(service.listCampaigns());
      expect(result).toEqual([]);
    });
  });

  // ── createCampaign() ────────────────────────────────────────────────────────

  describe('createCampaign()', () => {
    const dto = {
      name: 'Test', advertiser: 'MTN',
      start_date: '2026-01-01', end_date: '2026-06-30',
      position: 'header' as const,
    };

    it('inclut created_by dans le payload insert', async () => {
      await firstValueFrom(service.createCampaign(dto));
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'user-1' }),
      );
    });

    it('inclut workspace_id dans le payload insert', async () => {
      await firstValueFrom(service.createCampaign(dto));
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1' }),
      );
    });

    it('retourne success: true et l\'id retourné', async () => {
      mockSupabase.client = buildClient({ newId: 'camp-xyz' });
      const result = await firstValueFrom(service.createCampaign(dto));
      expect(result.success).toBe(true);
      expect(result.id).toBe('camp-xyz');
    });

    it("retourne success: false avec message en cas d'erreur", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Contrainte unique' });
      const result = await firstValueFrom(service.createCampaign(dto));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Contrainte unique');
    });

    it('utilise active: false par défaut', async () => {
      await firstValueFrom(service.createCampaign(dto));
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
      );
    });
  });

  // ── updateCampaign() ────────────────────────────────────────────────────────

  describe('updateCampaign()', () => {
    it('inclut updated_by dans le payload update', async () => {
      await firstValueFrom(service.updateCampaign('c1', { name: 'Nouveau nom' }));
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ updated_by: 'user-1', name: 'Nouveau nom' }),
      );
    });

    it('retourne success: true quand la mise à jour réussit', async () => {
      const result = await firstValueFrom(service.updateCampaign('c1', { name: 'X' }));
      expect(result.success).toBe(true);
    });

    it("retourne success: false en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Accès refusé' });
      const result = await firstValueFrom(service.updateCampaign('c1', { name: 'X' }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Accès refusé');
    });
  });

  // ── deleteCampaign() ────────────────────────────────────────────────────────

  describe('deleteCampaign()', () => {
    it('inclut deleted_at dans le payload (soft-delete)', async () => {
      await firstValueFrom(service.deleteCampaign('c1'));
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) }),
      );
    });

    it('inclut deleted_by dans le payload', async () => {
      await firstValueFrom(service.deleteCampaign('c1'));
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_by: 'user-1' }),
      );
    });

    it('retourne success: true quand la suppression réussit', async () => {
      const result = await firstValueFrom(service.deleteCampaign('c1'));
      expect(result.success).toBe(true);
    });

    it("retourne success: false en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Suppression impossible' });
      const result = await firstValueFrom(service.deleteCampaign('c1'));
      expect(result.success).toBe(false);
    });
  });

  // ── uploadBanner() ──────────────────────────────────────────────────────────

  describe('uploadBanner()', () => {
    it('uploade dans le bucket ads-banners et retourne le path', async () => {
      const file = new File(['data'], 'banner.jpg', { type: 'image/jpeg' });
      const result = await firstValueFrom(service.uploadBanner('camp-1', file));
      expect(result.path).toBe('camp-1/banner.jpg');
    });

    it("retourne path: null en cas d'erreur de stockage", async () => {
      const client = buildClient();
      client.storage.from = () => ({
        upload: jest.fn().mockResolvedValue({ data: null, error: { message: 'Upload failed' } }),
        getPublicUrl: jest.fn(),
      });
      mockSupabase.client = client;
      const file = new File(['data'], 'banner.jpg', { type: 'image/jpeg' });
      const result = await firstValueFrom(service.uploadBanner('camp-1', file));
      expect(result.path).toBeNull();
      expect(result.error).toBe('Upload failed');
    });
  });

  // ── getBannerUrl() ──────────────────────────────────────────────────────────

  describe('getBannerUrl()', () => {
    it('retourne l\'URL publique depuis le bucket ads-banners', () => {
      const url = service.getBannerUrl('camp-1/banner.jpg');
      expect(url).toBe('https://example.com/banner.jpg');
    });
  });

  // ── campaign_assignments helpers ────────────────────────────────────────────

  const fakeAssignments = [
    { id: 'a1', campaign_id: 'c1', calendar_id: 'cal-1', event_date: '2026-08-15', created_by: 'u1', created_at: '2026-01-01T00:00:00Z' },
  ];

  function buildAssignmentClient(options: { assignments?: any[]; simulateError?: string } = {}) {
    const { assignments = fakeAssignments, simulateError } = options;
    eqCalls = [];
    const err = simulateError ? { message: simulateError } : null;

    function makeQuery(data: any): any {
      const q: any = {
        then: (fn: any) => Promise.resolve({ data, error: err }).then(fn),
        select: () => makeQuery(data),
        eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return makeQuery(data); },
        is: () => makeQuery(data),
        order: () => makeQuery(data),
        single: () =>
          Promise.resolve({
            data: err ? null : (Array.isArray(data) ? data[0] ?? null : data),
            error: err,
          }),
      };
      return q;
    }

    insertSpy = jest.fn().mockImplementation(() => makeQuery([{ id: 'assign-new' }]));
    deleteSpy = jest.fn().mockImplementation(() => ({
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return Promise.resolve({ error: err });
      },
    }));

    return {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table === 'campaign_assignments') {
          return { select: () => makeQuery(assignments), insert: insertSpy, delete: deleteSpy };
        }
        return makeQuery([]);
      },
      storage: { from: () => ({ upload: jest.fn(), getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }) }) },
    };
  }

  // ── listCampaignAssignments() ───────────────────────────────────────────────

  describe('listCampaignAssignments()', () => {
    beforeEach(() => { mockSupabase.client = buildAssignmentClient(); });

    it('retourne les assignments pour le calendrier donné', async () => {
      const result = await firstValueFrom(service.listCampaignAssignments('cal-1'));
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('a1');
    });

    it('filtre par calendar_id', async () => {
      await firstValueFrom(service.listCampaignAssignments('cal-1'));
      expect(eqCalls).toContainEqual(['calendar_id', 'cal-1']);
    });

    it("retourne [] en cas d'erreur DB", async () => {
      mockSupabase.client = buildAssignmentClient({ simulateError: 'DB error' });
      const result = await firstValueFrom(service.listCampaignAssignments('cal-1'));
      expect(result).toEqual([]);
    });
  });

  // ── createCampaignAssignment() ──────────────────────────────────────────────

  describe('createCampaignAssignment()', () => {
    beforeEach(() => { mockSupabase.client = buildAssignmentClient(); });

    it('insère avec created_by dans le payload', async () => {
      await firstValueFrom(service.createCampaignAssignment({ campaign_id: 'c1', calendar_id: 'cal-1', event_date: '2026-08-15' }));
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'user-1', campaign_id: 'c1', calendar_id: 'cal-1', event_date: '2026-08-15' }),
      );
    });

    it("retourne success: true avec l'id inséré", async () => {
      const result = await firstValueFrom(service.createCampaignAssignment({ campaign_id: 'c1', calendar_id: 'cal-1', event_date: '2026-08-15' }));
      expect(result.success).toBe(true);
      expect(result.id).toBe('assign-new');
    });

    it("retourne success: false en cas d'erreur", async () => {
      mockSupabase.client = buildAssignmentClient({ simulateError: 'Conflit' });
      const result = await firstValueFrom(service.createCampaignAssignment({ campaign_id: 'c1', calendar_id: 'cal-1', event_date: '2026-08-15' }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Conflit');
    });
  });

  // ── deleteCampaignAssignment() ──────────────────────────────────────────────

  describe('deleteCampaignAssignment()', () => {
    beforeEach(() => { mockSupabase.client = buildAssignmentClient(); });

    it('hard-delete par id', async () => {
      await firstValueFrom(service.deleteCampaignAssignment('a1'));
      expect(eqCalls).toContainEqual(['id', 'a1']);
    });

    it('retourne success: true quand la suppression réussit', async () => {
      const result = await firstValueFrom(service.deleteCampaignAssignment('a1'));
      expect(result.success).toBe(true);
    });

    it("retourne success: false en cas d'erreur", async () => {
      mockSupabase.client = buildAssignmentClient({ simulateError: 'Interdit' });
      const result = await firstValueFrom(service.deleteCampaignAssignment('a1'));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Interdit');
    });
  });
});
