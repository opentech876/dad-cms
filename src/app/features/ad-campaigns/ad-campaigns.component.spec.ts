import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdCampaignsComponent } from './ad-campaigns.component';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { CompanyService } from '../../core/companies/company.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AdCampaign } from '../../models';

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const TOMORROW  = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function makeCampaign(override: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: 'c1', name: 'MTN Congo', company_id: 'co-mtn',
    company: { id: 'co-mtn', name: 'MTN', type: 'telecom', business_domain: 'Téléphonie mobile' } as any,
    start_date: YESTERDAY, end_date: TOMORROW,
    position: 'header', active: true,
    image_path: '', link_url: null, workspace_id: 'ws-1',
    paid_at: '2026-01-01T00:00:00Z', paid_by: 'u1',
    manager_confirmed_at: '2026-01-01T00:00:00Z', manager_confirmed_by: 'u1',
    validated_at: '2026-01-01T00:00:00Z',
    created_by: null, created_at: '', updated_at: '',
    updated_by: null, deleted_at: null, deleted_by: null,
    ...override,
  };
}

const FAKE_COMPANIES = [
  { id: 'co-mtn', name: 'MTN', type: 'telecom', business_domain: 'Téléphonie mobile' },
  { id: 'co-sg',  name: 'SG Congo', type: 'banque',  business_domain: 'Banque retail' },
];

describe('AdCampaignsComponent', () => {
  let component: AdCampaignsComponent;
  let fixture: ComponentFixture<AdCampaignsComponent>;
  let mockService: jest.Mocked<Pick<CampaignService,
    'listCampaigns' | 'createCampaign' | 'updateCampaign' | 'deleteCampaign' |
    'uploadBanner' | 'getBannerUrl' | 'findOverlappingCampaigns'>>;
  let mockServiceFull: jest.Mocked<CampaignService>;
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error' | 'warning'>>;

  beforeEach(async () => {
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:fake-url');
    global.URL.revokeObjectURL = jest.fn();

    mockService = {
      listCampaigns:  jest.fn().mockReturnValue(of([])),
      createCampaign: jest.fn().mockReturnValue(of({ success: true, id: 'new-id' })),
      updateCampaign: jest.fn().mockReturnValue(of({ success: true })),
      deleteCampaign: jest.fn().mockReturnValue(of({ success: true })),
      uploadBanner:   jest.fn().mockReturnValue(of({ path: 'new-id/banner.jpg' })),
      getBannerUrl:   jest.fn().mockReturnValue('https://example.com/banner.jpg'),
      findOverlappingCampaigns: jest.fn().mockReturnValue(of([])),
    };
    mockServiceFull = mockService as any;
    (mockServiceFull as any).markPaid = jest.fn().mockReturnValue(of({ success: true }));
    (mockServiceFull as any).confirmCampaign = jest.fn().mockReturnValue(of({ success: true }));
    (mockServiceFull as any).unmarkPaid = jest.fn().mockReturnValue(of({ success: true }));
    (mockServiceFull as any).unconfirmCampaign = jest.fn().mockReturnValue(of({ success: true }));
    const mockCompanyService = {
      listCompanies: jest.fn().mockReturnValue(of(FAKE_COMPANIES)),
    };
    const mockAuth = {
      hasRoleAtLeast: jest.fn().mockReturnValue(of(true)),
    };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AdCampaignsComponent],
      providers: [
        provideRouter([]),
        { provide: CampaignService, useValue: mockService },
        { provide: CompanyService,  useValue: mockCompanyService },
        { provide: AuthService,     useValue: mockAuth },
        { provide: ToastService,    useValue: mockToast },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(AdCampaignsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit — data loading ────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('appelle listCampaigns() au démarrage', () => {
      expect(mockService.listCampaigns).toHaveBeenCalled();
    });

    it('stocke les campagnes dans le signal campaigns()', async () => {
      const camp = makeCampaign();
      mockService.listCampaigns.mockReturnValue(of([camp]));
      await component['_reload']();
      expect(component.campaigns().length).toBe(1);
      expect(component.campaigns()[0].id).toBe('c1');
    });

    it('met loading à false après le chargement', async () => {
      await component['_reload']();
      expect(component.loading()).toBe(false);
    });
  });

  // ── stats computed ─────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('compte les campagnes actives (active=true, dates encadrant aujourd\'hui)', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign()]));
      await component['_reload']();
      expect(component.stats().active).toBe(1);
    });

    it('compte les campagnes planifiées (start_date > today)', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign({ start_date: TOMORROW, end_date: TOMORROW })]));
      await component['_reload']();
      expect(component.stats().planifiee).toBe(1);
    });

    it('compte les campagnes terminées (end_date < today)', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign({ end_date: YESTERDAY, start_date: YESTERDAY })]));
      await component['_reload']();
      expect(component.stats().terminee).toBe(1);
    });

    it('compte les campagnes désactivées comme terminées', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign({ active: false })]));
      await component['_reload']();
      expect(component.stats().terminee).toBe(1);
    });
  });

  // ── listRows filtering ─────────────────────────────────────────────────────

  describe('listRows()', () => {
    beforeEach(async () => {
      mockService.listCampaigns.mockReturnValue(of([
        makeCampaign({ id: 'h1', name: 'Alpha', company_id: 'co-mtn',    company: { id: 'co-mtn',    name: 'MTN',    type: 'telecom' } as any, position: 'header' }),
        makeCampaign({ id: 'f1', name: 'Beta',  company_id: 'co-airtel', company: { id: 'co-airtel', name: 'Airtel', type: 'telecom' } as any, position: 'footer' }),
      ]));
      await component['_reload']();
    });

    it('retourne toutes les campagnes sans filtre', () => {
      expect(component.listRows().length).toBe(2);
    });

    it('filtre par nom (insensible à la casse)', () => {
      component.setSearchQuery('alpha');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].id).toBe('h1');
    });

    it('filtre par annonceur', () => {
      component.setSearchQuery('Airtel');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].id).toBe('f1');
    });

    it('filtre par statut active', () => {
      component.setSelectedStatus('active');
      expect(component.listRows().every(r => r.status === 'active')).toBe(true);
    });

    it('réinitialise la page à 0 lors d\'un changement de filtre', () => {
      component.currentPage.set(3);
      component.setSearchQuery('x');
      expect(component.currentPage()).toBe(0);
    });
  });

  // ── openEditor ─────────────────────────────────────────────────────────────

  describe('openEditor()', () => {
    it('passe editorView à true', () => {
      component.openEditor();
      expect(component.editorView()).toBe(true);
    });

    it('initialise les champs vides pour une nouvelle campagne', () => {
      component.openEditor();
      expect(component.editorName()).toBe('');
      expect(component.editorCompanyId()).toBeNull();
      expect(component.editorCampaignId()).toBeNull();
    });

    it('pré-remplit les champs avec les données de la campagne existante', async () => {
      const camp = makeCampaign({ name: 'MTN Congo', company_id: 'co-mtn' });
      mockService.listCampaigns.mockReturnValue(of([camp]));
      await component['_reload']();
      component.openEditor('c1');
      expect(component.editorName()).toBe('MTN Congo');
      expect(component.editorCompanyId()).toBe('co-mtn');
      expect(component.editorCampaignId()).toBe('c1');
    });
  });

  // ── closeEditor ────────────────────────────────────────────────────────────

  describe('closeEditor()', () => {
    it('passe editorView à false', () => {
      component.openEditor();
      component.closeEditor();
      expect(component.editorView()).toBe(false);
    });

    it('efface la prévisualisation locale', () => {
      component.editorLocalPreview.set('blob:fake');
      component.closeEditor();
      expect(component.editorLocalPreview()).toBeNull();
    });
  });

  // ── editorCurrentStatus computed ───────────────────────────────────────────

  describe('editorCurrentStatus()', () => {
    it('retourne terminee quand active est false', () => {
      component.editorActive.set(false);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('terminee');
    });

    it('retourne active quand active=true et dates encadrant aujourd\'hui', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('active');
    });

    it('retourne planifiee quand start_date > today', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(TOMORROW);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('planifiee');
    });

    it('retourne terminee quand end_date < today', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(YESTERDAY);
      expect(component.editorCurrentStatus()).toBe('terminee');
    });
  });

  // ── save() ─────────────────────────────────────────────────────────────────

  describe('save()', () => {
    beforeEach(() => {
      component.editorName.set('Airtel Back to School');
      component.editorCompanyId.set('co-airtel');
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
    });

    it('appelle createCampaign() pour une nouvelle campagne', async () => {
      component.editorCampaignId.set(null);
      await component.save(false);
      expect(mockService.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Airtel Back to School', active: false }),
      );
    });

    it('appelle updateCampaign() pour une campagne existante', async () => {
      component.editorCampaignId.set('c1');
      await component.save(true);
      expect(mockService.updateCampaign).toHaveBeenCalledWith('c1',
        expect.objectContaining({ name: 'Airtel Back to School', active: true }),
      );
    });

    it('ferme l\'éditeur après une sauvegarde réussie', async () => {
      component.openEditor();
      component.editorName.set('Airtel Back to School');
      component.editorCompanyId.set('co-airtel');
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      await component.save(false);
      expect(component.editorView()).toBe(false);
    });

    it('conserve l\'éditeur ouvert et affiche un toast d\'erreur si createCampaign() échoue', async () => {
      mockService.createCampaign.mockReturnValue(of({ success: false, error: 'Erreur DB' }));
      component.openEditor();
      component.editorName.set('Airtel Back to School');
      component.editorCompanyId.set('co-airtel');
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      await component.save(false);
      expect(component.editorView()).toBe(true);
      expect(mockToast.error).toHaveBeenCalledWith('Erreur DB.');
    });

    it('uploade la bannière si un fichier est sélectionné', async () => {
      mockService.createCampaign.mockReturnValue(of({ success: true, id: 'new-id' }));
      const file = new File(['data'], 'banner.jpg', { type: 'image/jpeg' });
      component.editorImageFile.set(file);
      await component.save(false);
      expect(mockService.uploadBanner).toHaveBeenCalledWith('new-id', file);
    });

    it('ne déclenche PAS la vérification de chevauchement quand on sauvegarde en brouillon', async () => {
      await component.save(false);
      expect(mockService.findOverlappingCampaigns).not.toHaveBeenCalled();
    });

    it('déclenche la vérification de chevauchement quand on active', async () => {
      await component.save(true);
      expect(mockService.findOverlappingCampaigns).toHaveBeenCalledWith(
        YESTERDAY, TOMORROW, undefined,
      );
    });

    it('exclut la campagne en cours d\'édition de la vérification', async () => {
      component.editorCampaignId.set('c-existing');
      await component.save(true);
      expect(mockService.findOverlappingCampaigns).toHaveBeenCalledWith(
        YESTERDAY, TOMORROW, 'c-existing',
      );
    });
  });

  // ── overlap confirmation dialog ────────────────────────────────────────────

  describe('overlap warning', () => {
    const conflict = makeCampaign({ id: 'c-mtn', name: 'MTN' });

    beforeEach(() => {
      component.editorName.set('Airtel');
      component.editorCompanyId.set('co-airtel');
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
    });

    it('ouvre le dialogue et n\'enregistre PAS quand un chevauchement est détecté', async () => {
      mockService.findOverlappingCampaigns.mockReturnValue(of([conflict]));
      await component.save(true);
      expect(component.overlapDialogVisible()).toBe(true);
      expect(component.overlapList()).toEqual([conflict]);
      expect(mockService.createCampaign).not.toHaveBeenCalled();
      expect(mockService.updateCampaign).not.toHaveBeenCalled();
    });

    it('enregistre normalement après confirmation', async () => {
      mockService.findOverlappingCampaigns.mockReturnValue(of([conflict]));
      await component.save(true);
      await component.confirmOverlap();
      expect(mockService.createCampaign).toHaveBeenCalled();
      expect(component.overlapDialogVisible()).toBe(false);
    });

    it('annule sans enregistrer quand cancelOverlap est appelé', async () => {
      mockService.findOverlappingCampaigns.mockReturnValue(of([conflict]));
      await component.save(true);
      component.cancelOverlap();
      expect(component.overlapDialogVisible()).toBe(false);
      expect(component.overlapList()).toEqual([]);
      expect(mockService.createCampaign).not.toHaveBeenCalled();
      expect(mockService.updateCampaign).not.toHaveBeenCalled();
    });

    it('passe directement à la sauvegarde quand aucun chevauchement', async () => {
      mockService.findOverlappingCampaigns.mockReturnValue(of([]));
      await component.save(true);
      expect(component.overlapDialogVisible()).toBe(false);
      expect(mockService.createCampaign).toHaveBeenCalled();
    });
  });

  // ── deleteCampaign() ───────────────────────────────────────────────────────

  describe('deleteCampaign()', () => {
    it('appelle deleteCampaign() avec l\'id en cours', async () => {
      component.editorCampaignId.set('c1');
      await component.deleteCampaign();
      expect(mockService.deleteCampaign).toHaveBeenCalledWith('c1');
    });

    it('ferme l\'éditeur après la suppression', async () => {
      component.editorCampaignId.set('c1');
      component.editorView.set(true);
      await component.deleteCampaign();
      expect(component.editorView()).toBe(false);
    });

    it('ne fait rien si editorCampaignId est null', async () => {
      component.editorCampaignId.set(null);
      await component.deleteCampaign();
      expect(mockService.deleteCampaign).not.toHaveBeenCalled();
    });
  });

  // ── onBannerChange() ───────────────────────────────────────────────────────

  describe('onBannerChange()', () => {
    it('met à jour editorImageName et editorImageSizeKb', () => {
      const file = new File(['x'.repeat(2048)], 'pub.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as unknown as Event;
      component.onBannerChange(event);
      expect(component.editorImageName()).toBe('pub.jpg');
      expect(component.editorImageSizeKb()).toBe(2);
    });

    it('ne fait rien si aucun fichier n\'est sélectionné', () => {
      const event = { target: { files: [] } } as unknown as Event;
      component.onBannerChange(event);
      expect(component.editorImageName()).toBeNull();
    });
  });

  // ── durationDays() ────────────────────────────────────────────────────────

  describe('durationDays()', () => {
    it('retourne 1 pour une campagne d\'un seul jour', () => {
      expect(component.durationDays('2026-01-01', '2026-01-01')).toBe(1);
    });

    it('retourne 7 pour une semaine', () => {
      expect(component.durationDays('2026-01-01', '2026-01-07')).toBe(7);
    });
  });

  // ── formatDate() ──────────────────────────────────────────────────────────

  describe('formatDate()', () => {
    it('formate une date ISO en JJ/MM/AAAA', () => {
      expect(component.formatDate('2026-08-15')).toBe('15/08/2026');
    });

    it('retourne — pour une chaîne vide', () => {
      expect(component.formatDate('')).toBe('—');
    });
  });

  // ── Validation workflow (Round 3) ─────────────────────────────────────────

  describe('validation workflow', () => {
    function unvalidatedCampaign(): AdCampaign {
      return makeCampaign({
        id: 'c-unval',
        paid_at: null, paid_by: null,
        manager_confirmed_at: null, manager_confirmed_by: null,
        validated_at: null,
      });
    }

    it('campaignValidationState computes "pending" when nothing is set', async () => {
      mockService.listCampaigns.mockReturnValue(of([unvalidatedCampaign()]));
      await component.ngOnInit();
      expect(component.listRows()[0].validation).toBe('pending');
    });

    it('computes "paid" when paid_at set but manager not confirmed', async () => {
      const c = makeCampaign({
        id: 'c-paid',
        paid_at: '2026-01-01T00:00:00Z', paid_by: 'u1',
        manager_confirmed_at: null, manager_confirmed_by: null,
        validated_at: null,
      });
      mockService.listCampaigns.mockReturnValue(of([c]));
      await component.ngOnInit();
      expect(component.listRows()[0].validation).toBe('paid');
    });

    it('computes "confirmed" when manager confirmed but not paid', async () => {
      const c = makeCampaign({
        id: 'c-conf',
        paid_at: null, paid_by: null,
        manager_confirmed_at: '2026-01-01T00:00:00Z', manager_confirmed_by: 'u1',
        validated_at: null,
      });
      mockService.listCampaigns.mockReturnValue(of([c]));
      await component.ngOnInit();
      expect(component.listRows()[0].validation).toBe('confirmed');
    });

    it('computes "validated" when both keys + validated_at set', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign()]));
      await component.ngOnInit();
      expect(component.listRows()[0].validation).toBe('validated');
    });

    it('filterValidation = "pending" garde uniquement les campagnes non validées', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign({ id: 'c-ok' }), unvalidatedCampaign()]));
      await component.ngOnInit();
      component.setFilterValidation('pending');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].id).toBe('c-unval');
    });

    it('stats.pendingValidation compte les campagnes non validées', async () => {
      mockService.listCampaigns.mockReturnValue(of([
        unvalidatedCampaign(),
        makeCampaign({ id: 'c-ok' }),
      ]));
      await component.ngOnInit();
      expect(component.stats().pendingValidation).toBe(1);
    });

    describe('markPaidRow()', () => {
      it('appelle markPaid sur le service quand canValidate est true', async () => {
        mockService.listCampaigns.mockReturnValue(of([unvalidatedCampaign()]));
        await component.ngOnInit();
        await component.markPaidRow('c-unval');
        expect(mockServiceFull.markPaid).toHaveBeenCalledWith('c-unval');
        expect(mockToast.success).toHaveBeenCalled();
      });

      it("ne fait rien quand canValidate est false", async () => {
        // Re-create with role-restricted auth
        TestBed.resetTestingModule();
        await TestBed.configureTestingModule({
          imports: [AdCampaignsComponent],
          providers: [
            provideRouter([]),
            { provide: CampaignService, useValue: mockService },
            { provide: CompanyService,  useValue: { listCompanies: jest.fn().mockReturnValue(of([])) } },
            { provide: AuthService,     useValue: { hasRoleAtLeast: jest.fn().mockReturnValue(of(false)) } },
            { provide: ToastService,    useValue: mockToast },
          ],
        }).compileComponents();
        const fix2 = TestBed.createComponent(AdCampaignsComponent);
        const comp2 = fix2.componentInstance;
        fix2.detectChanges();
        await comp2.markPaidRow('c-unval');
        expect(mockServiceFull.markPaid).not.toHaveBeenCalled();
      });

      it("affiche une erreur quand le service renvoie un échec", async () => {
        (mockServiceFull as any).markPaid = jest.fn().mockReturnValue(of({ success: false, error: 'Refusé.' }));
        await component.markPaidRow('c-unval');
        expect(mockToast.error).toHaveBeenCalledWith('Refusé.');
      });
    });

    describe('confirmRow()', () => {
      it('appelle confirmCampaign et affiche un toast de succès', async () => {
        await component.confirmRow('c-unval');
        expect(mockServiceFull.confirmCampaign).toHaveBeenCalledWith('c-unval');
        expect(mockToast.success).toHaveBeenCalled();
      });
    });

    describe('validationLabel()', () => {
      it('retourne le libellé FR pour chaque état', () => {
        expect(component.validationLabel('pending')).toBe('À valider');
        expect(component.validationLabel('paid')).toBe('Payée');
        expect(component.validationLabel('confirmed')).toBe('Confirmée');
        expect(component.validationLabel('validated')).toBe('Validée');
      });
    });
  });
});
