import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CompanyTypeService } from './company-type.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

const FAKE_TYPES = [
  { id: 't1', workspace_id: 'ws-1', label: 'Télécommunications', sort_order: 1, created_at: '', deleted_at: null },
  { id: 't2', workspace_id: 'ws-1', label: 'Banque & Finance',   sort_order: 2, created_at: '', deleted_at: null },
];

describe('CompanyTypeService', () => {
  let service: CompanyTypeService;
  let mockSupabase: { client: any };
  let workspaceCtx: { activeWorkspaceId: jest.Mock };
  let eqCalls: Array<[string, unknown]>;
  let insertSpy: jest.Mock;
  let updateSpy: jest.Mock;

  function buildClient(opts: { rows?: any[]; error?: any } = {}) {
    eqCalls = [];
    const err = opts.error ?? null;

    function makeQuery(data: any): any {
      return {
        then: (fn: any) => Promise.resolve({ data, error: err }).then(fn),
        select: () => makeQuery(data),
        eq:     (col: string, val: unknown) => { eqCalls.push([col, val]); return makeQuery(data); },
        is:     () => makeQuery(data),
        order:  () => makeQuery(data),
      };
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
    mockSupabase = { client: buildClient({ rows: FAKE_TYPES }) };
    workspaceCtx = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };
    TestBed.configureTestingModule({
      providers: [
        CompanyTypeService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: workspaceCtx },
      ],
    });
    service = TestBed.inject(CompanyTypeService);
  });

  describe('listTypes()', () => {
    it('retourne les types non-supprimés du workspace actif', async () => {
      const result = await firstValueFrom(service.listTypes());
      expect(result.length).toBe(2);
      expect(eqCalls).toContainEqual(['workspace_id', 'ws-1']);
    });

    it('retourne [] si la table est absente (pré-migration) ou en erreur', async () => {
      mockSupabase.client = buildClient({ rows: null, error: { message: 'relation does not exist' } });
      const result = await firstValueFrom(service.listTypes());
      expect(result).toEqual([]);
    });
  });

  describe('createType()', () => {
    it('insère avec workspace_id, label trimé, sort_order et created_by', async () => {
      const res = await firstValueFrom(service.createType('  Assurance  ', 5));
      expect(res.success).toBe(true);
      expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
        workspace_id: 'ws-1',
        label: 'Assurance',
        sort_order: 5,
        created_by: 'u-1',
      }));
    });

    it("retourne 'duplicate_label' sur le code Postgres 23505", async () => {
      mockSupabase.client = buildClient({ error: { code: '23505', message: 'unique violation' } });
      const res = await firstValueFrom(service.createType('Assurance'));
      expect(res).toEqual({ success: false, error: 'duplicate_label' });
    });
  });

  describe('renameType()', () => {
    it('met à jour le label (trimé) + updated_by et cible le bon id', async () => {
      const res = await firstValueFrom(service.renameType('t1', '  Télécom  '));
      expect(res.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ label: 'Télécom', updated_by: 'u-1' }));
      expect(eqCalls).toContainEqual(['id', 't1']);
    });
  });

  describe('deleteType()', () => {
    it('soft-delete: pose deleted_at + deleted_by sur le bon id', async () => {
      const res = await firstValueFrom(service.deleteType('t2'));
      expect(res.success).toBe(true);
      const patch = updateSpy.mock.calls[0][0];
      expect(patch.deleted_at).toBeTruthy();
      expect(patch.deleted_by).toBe('u-1');
      expect(eqCalls).toContainEqual(['id', 't2']);
    });

    it("remonte le message d'erreur en cas d'échec DB", async () => {
      mockSupabase.client = buildClient({ error: { message: 'boom' } });
      const res = await firstValueFrom(service.deleteType('t2'));
      expect(res).toEqual({ success: false, error: 'boom' });
    });
  });
});
