import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CompanyService } from './company.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

const FAKE_COMPANIES = [
  { id: 'c1', workspace_id: 'ws-1', name: 'MTN Congo',    type: 'telecom', business_domain: 'Téléphonie mobile' },
  { id: 'c2', workspace_id: 'ws-1', name: 'AIRTEL Congo', type: 'telecom', business_domain: 'Téléphonie mobile' },
  { id: 'c3', workspace_id: 'ws-1', name: 'SG Congo',     type: 'banque',  business_domain: 'Banque retail' },
];

describe('CompanyService', () => {
  let service: CompanyService;
  let mockSupabase: { client: any };
  let workspaceCtx: { activeWorkspaceId: jest.Mock };
  let eqCalls: Array<[string, unknown]>;
  let insertSpy: jest.Mock;
  let updateSpy: jest.Mock;

  function buildClient(opts: { rows?: any[]; error?: any } = {}) {
    eqCalls = [];
    const err = opts.error ?? null;

    function makeQuery(data: any): any {
      const q: any = {
        then: (fn: any) => Promise.resolve({ data, error: err }).then(fn),
        select: () => makeQuery(data),
        eq:    (col: string, val: unknown) => { eqCalls.push([col, val]); return makeQuery(data); },
        is:    () => makeQuery(data),
        order: () => makeQuery(data),
        single: () => Promise.resolve({ data: err ? null : (Array.isArray(data) ? data[0] ?? null : data), error: err }),
      };
      return q;
    }

    insertSpy = jest.fn().mockImplementation(() => makeQuery([{ id: 'new-id' }]));
    updateSpy = jest.fn().mockImplementation(() => ({
      eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return Promise.resolve({ error: err }); },
    }));

    return {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
      from: (_table: string) => ({
        select: () => makeQuery(opts.rows ?? []),
        insert: insertSpy,
        update: updateSpy,
      }),
    };
  }

  beforeEach(() => {
    mockSupabase = { client: buildClient({ rows: FAKE_COMPANIES }) };
    workspaceCtx = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };
    TestBed.configureTestingModule({
      providers: [
        CompanyService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: workspaceCtx },
      ],
    });
    service = TestBed.inject(CompanyService);
  });

  describe('listCompanies()', () => {
    it('retourne les compagnies non-supprimées du workspace actif', async () => {
      const result = await firstValueFrom(service.listCompanies());
      expect(result.length).toBe(3);
      expect(eqCalls).toContainEqual(['workspace_id', 'ws-1']);
    });

    it("retourne [] en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ rows: null, error: { message: 'fail' } });
      const result = await firstValueFrom(service.listCompanies());
      expect(result).toEqual([]);
    });
  });

  describe('createCompany()', () => {
    it("insère avec workspace_id, created_by et le type fourni", async () => {
      const res = await firstValueFrom(service.createCompany({
        name: '  TotalEnergies  ', type: 'Énergie',
      }));
      expect(res.success).toBe(true);
      expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
        workspace_id: 'ws-1',
        name: 'TotalEnergies',
        type: 'Énergie',
        created_by: 'u-1',
      }));
    });

    it("retourne 'duplicate_name' quand le code Postgres est 23505", async () => {
      mockSupabase.client = buildClient({ rows: null, error: { code: '23505', message: 'unique violation' } });
      const res = await firstValueFrom(service.createCompany({ name: 'MTN', type: 'telecom' }));
      expect(res.success).toBe(false);
      expect(res.error).toBe('duplicate_name');
    });
  });

  describe('updateCompany()', () => {
    it('met à jour avec updated_by et appelle .eq("id", ...)', async () => {
      const res = await firstValueFrom(service.updateCompany('c1', { name: 'MTN Group' }));
      expect(res.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'MTN Group', updated_by: 'u-1',
      }));
      expect(eqCalls).toContainEqual(['id', 'c1']);
    });
  });

  describe('deleteCompany()', () => {
    it('soft-delete via deleted_at + deleted_by', async () => {
      const res = await firstValueFrom(service.deleteCompany('c1'));
      expect(res.success).toBe(true);
      const payload = updateSpy.mock.calls[0][0];
      expect(payload.deleted_at).toBeDefined();
      expect(payload.deleted_by).toBe('u-1');
    });
  });
});
