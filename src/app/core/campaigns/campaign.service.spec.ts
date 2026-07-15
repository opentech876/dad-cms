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
  let eqCalls: Array<[string, unknown]>;

  const fakeCampaigns = [
    {
      id: 'c1', name: 'MTN Congo', company_id: 'co-mtn',
      company: { id: 'co-mtn', name: 'MTN Congo', type: 'telecom', business_domain: 'Téléphonie mobile' },
      position: 'footer',
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
        range: () => Promise.resolve({ data, error: err }),
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

    it('pagine au-delà de 1000 lignes (limite PostgREST par défaut)', async () => {
      // Set up a client whose .range() returns two pages of data:
      // page 1 = 1000 campaigns, page 2 = 35 campaigns → total 1035
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ ...fakeCampaigns[0], id: `c-${i + 1}` }));
      const page2 = Array.from({ length: 35 },   (_, i) => ({ ...fakeCampaigns[0], id: `c-${1001 + i}` }));
      const pages = [page1, page2];
      const rangeSpy = jest.fn().mockImplementation(() => {
        const next = pages.shift() ?? [];
        return Promise.resolve({ data: next, error: null });
      });
      const chain: any = {};
      Object.assign(chain, {
        select: jest.fn().mockReturnValue(chain),
        eq:     jest.fn().mockReturnValue(chain),
        is:     jest.fn().mockReturnValue(chain),
        order:  jest.fn().mockReturnValue(chain),
        range:  rangeSpy,
      });
      mockSupabase.client = {
        auth: { getUser: jest.fn() },
        from: jest.fn().mockReturnValue(chain),
        storage: { from: jest.fn() },
      };

      // Re-inject service with the new client
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CampaignService,
          { provide: SupabaseService, useValue: mockSupabase },
          { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
        ],
      });
      service = TestBed.inject(CampaignService);

      const result = await firstValueFrom(service.listCampaigns());

      expect(result).toHaveLength(1035);
      expect(rangeSpy).toHaveBeenCalledTimes(2);
      expect(rangeSpy).toHaveBeenNthCalledWith(1, 0, 999);
      expect(rangeSpy).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it("s'arrête dès qu'une page renvoie moins de 1000 lignes", async () => {
      const page1 = Array.from({ length: 500 }, (_, i) => ({ ...fakeCampaigns[0], id: `c-${i + 1}` }));
      const rangeSpy = jest.fn().mockResolvedValue({ data: page1, error: null });
      const chain: any = {};
      Object.assign(chain, {
        select: jest.fn().mockReturnValue(chain),
        eq:     jest.fn().mockReturnValue(chain),
        is:     jest.fn().mockReturnValue(chain),
        order:  jest.fn().mockReturnValue(chain),
        range:  rangeSpy,
      });
      mockSupabase.client = {
        auth: { getUser: jest.fn() },
        from: jest.fn().mockReturnValue(chain),
        storage: { from: jest.fn() },
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CampaignService,
          { provide: SupabaseService, useValue: mockSupabase },
          { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
        ],
      });
      service = TestBed.inject(CampaignService);

      const result = await firstValueFrom(service.listCampaigns());

      expect(result).toHaveLength(500);
      expect(rangeSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── createCampaign() ────────────────────────────────────────────────────────

  describe('createCampaign()', () => {
    const dto = {
      name: 'Test', company_id: 'co-mtn',
      start_date: '2026-01-01', end_date: '2026-06-30',
      position: 'footer' as const,
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

  // ── findOverlappingCampaigns() ──────────────────────────────────────────────

  describe('findOverlappingCampaigns()', () => {
    const otherCampaigns = [
      { id: 'c2', name: 'MTN', company_id: 'co-mtn', company: { id: 'co-mtn', name: 'MTN Congo' }, start_date: '2026-08-10', end_date: '2026-08-20', position: 'footer', active: true, deleted_at: null, workspace_id: 'ws-1' },
      { id: 'c3', name: 'SG',  company_id: 'co-sg',  company: { id: 'co-sg',  name: 'SG Congo' },  start_date: '2026-09-01', end_date: '2026-09-30', position: 'footer', active: true, deleted_at: null, workspace_id: 'ws-1' },
    ];

    function buildOverlapClient(rows: any[]) {
      eqCalls = [];
      const lteCalls: Array<[string, unknown]> = [];
      const gteCalls: Array<[string, unknown]> = [];
      const neqCalls: Array<[string, unknown]> = [];

      function makeQuery(data: any): any {
        const q: any = {
          then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
          select: () => makeQuery(data),
          eq:  (col: string, val: unknown) => { eqCalls.push([col, val]);   return makeQuery(data); },
          is:  () => makeQuery(data),
          lte: (col: string, val: unknown) => { lteCalls.push([col, val]);  return makeQuery(data); },
          gte: (col: string, val: unknown) => { gteCalls.push([col, val]);  return makeQuery(data); },
          neq: (col: string, val: unknown) => { neqCalls.push([col, val]);  return makeQuery(data); },
          order: () => makeQuery(data),
        };
        return q;
      }

      return {
        client: {
          from: (table: string) => (table === 'ad_campaigns' ? { select: () => makeQuery(rows) } : makeQuery([])),
        },
        lteCalls,
        gteCalls,
        neqCalls,
      };
    }

    it('retourne les campagnes actives dont la période chevauche', async () => {
      const { client } = buildOverlapClient(otherCampaigns);
      mockSupabase.client = client;
      const result = await firstValueFrom(
        service.findOverlappingCampaigns('2026-08-15', '2026-08-25'),
      );
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('c2');
    });

    it('filtre par active=true et workspace', async () => {
      const { client } = buildOverlapClient([]);
      mockSupabase.client = client;
      await firstValueFrom(service.findOverlappingCampaigns('2026-08-15', '2026-08-25'));
      expect(eqCalls).toContainEqual(['active', true]);
      expect(eqCalls).toContainEqual(['workspace_id', 'ws-1']);
      expect(eqCalls.some(([col]) => col === 'position')).toBe(false);
    });

    it('teste le chevauchement: start_date <= end ET end_date >= start', async () => {
      const built = buildOverlapClient([]);
      mockSupabase.client = built.client;
      await firstValueFrom(service.findOverlappingCampaigns('2026-08-15', '2026-08-25'));
      expect(built.lteCalls).toContainEqual(['start_date', '2026-08-25']);
      expect(built.gteCalls).toContainEqual(['end_date', '2026-08-15']);
    });

    it('exclut la campagne en cours d\'édition quand excludeId est fourni', async () => {
      const built = buildOverlapClient([]);
      mockSupabase.client = built.client;
      await firstValueFrom(service.findOverlappingCampaigns('2026-08-15', '2026-08-25', 'c1'));
      expect(built.neqCalls).toContainEqual(['id', 'c1']);
    });

    it("retourne [] en cas d'erreur DB", async () => {
      mockSupabase.client = {
        from: () => ({
          select: () => ({
            is: () => ({ eq: () => ({ lte: () => ({ gte: () => ({ order: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'fail' } }) }) }) }) }) }),
          }),
        }),
      };
      const result = await firstValueFrom(service.findOverlappingCampaigns('2026-08-15', '2026-08-25'));
      expect(result).toEqual([]);
    });
  });

  // ── Validation workflow (Round 3) ──────────────────────────────────────────

  describe('validation workflow', () => {
    let rpcSpy: jest.Mock;

    function rebuildWithRpc(error: { code?: string; message?: string } | null = null): void {
      rpcSpy = jest.fn().mockResolvedValue({ data: null, error });
      mockSupabase.client = { rpc: rpcSpy };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CampaignService,
          { provide: SupabaseService, useValue: mockSupabase },
          { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
        ],
      });
      service = TestBed.inject(CampaignService);
    }

    describe('markPaid()', () => {
      it('appelle mark_campaign_paid avec le bon paramètre', async () => {
        rebuildWithRpc();
        const res = await firstValueFrom(service.markPaid('c1'));
        expect(rpcSpy).toHaveBeenCalledWith('mark_campaign_paid', { p_campaign_id: 'c1' });
        expect(res.success).toBe(true);
      });

      it('mappe l\'erreur de privilège 42501 vers un message FR', async () => {
        rebuildWithRpc({ code: '42501', message: 'insufficient_privilege' });
        const res = await firstValueFrom(service.markPaid('c1'));
        expect(res.success).toBe(false);
        expect(res.error).toContain('droits');
      });

      it('mappe l\'erreur P0002 vers "Campagne introuvable"', async () => {
        rebuildWithRpc({ code: 'P0002', message: 'campaign_not_found' });
        const res = await firstValueFrom(service.markPaid('c1'));
        expect(res.success).toBe(false);
        expect(res.error).toBe('Campagne introuvable.');
      });
    });

    describe('confirmCampaign()', () => {
      it('appelle confirm_campaign avec le bon paramètre', async () => {
        rebuildWithRpc();
        const res = await firstValueFrom(service.confirmCampaign('c1'));
        expect(rpcSpy).toHaveBeenCalledWith('confirm_campaign', { p_campaign_id: 'c1' });
        expect(res.success).toBe(true);
      });

      it('retourne success: false en cas d\'erreur DB', async () => {
        rebuildWithRpc({ message: 'boom' });
        const res = await firstValueFrom(service.confirmCampaign('c1'));
        expect(res.success).toBe(false);
        expect(res.error).toBe('boom');
      });
    });

    describe('unmarkPaid()', () => {
      it('appelle unmark_campaign_paid', async () => {
        rebuildWithRpc();
        await firstValueFrom(service.unmarkPaid('c1'));
        expect(rpcSpy).toHaveBeenCalledWith('unmark_campaign_paid', { p_campaign_id: 'c1' });
      });
    });

    describe('unconfirmCampaign()', () => {
      it('appelle unconfirm_campaign', async () => {
        rebuildWithRpc();
        await firstValueFrom(service.unconfirmCampaign('c1'));
        expect(rpcSpy).toHaveBeenCalledWith('unconfirm_campaign', { p_campaign_id: 'c1' });
      });
    });
  });
});
