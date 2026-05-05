import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdCampaignsComponent } from './ad-campaigns.component';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { ToastService } from '../../core/services/toast.service';
import { AdCampaign } from '../../models';

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const TOMORROW  = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function makeCampaign(override: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: 'c1', name: 'MTN Congo', advertiser: 'MTN',
    start_date: YESTERDAY, end_date: TOMORROW,
    position: 'header', active: true,
    image_path: '', link_url: null, workspace_id: 'ws-1',
    created_by: null, created_at: '', updated_at: '',
    updated_by: null, deleted_at: null, deleted_by: null,
    ...override,
  };
}

describe('AdCampaignsComponent', () => {
  let component: AdCampaignsComponent;
  let fixture: ComponentFixture<AdCampaignsComponent>;
  let mockService: jest.Mocked<Pick<CampaignService,
    'listCampaigns' | 'createCampaign' | 'updateCampaign' | 'deleteCampaign' |
    'uploadBanner' | 'getBannerUrl'>>;
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
    };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AdCampaignsComponent],
      providers: [
        { provide: CampaignService, useValue: mockService },
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
      expect(component.stats().scheduled).toBe(1);
    });

    it('compte les campagnes terminées (end_date < today)', async () => {
      mockService.listCampaigns.mockReturnValue(of([makeCampaign({ end_date: YESTERDAY, start_date: YESTERDAY })]));
      await component['_reload']();
      expect(component.stats().ended).toBe(1);
    });

    it('décompose les actives par position header/footer', async () => {
      mockService.listCampaigns.mockReturnValue(of([
        makeCampaign({ id: 'h1', position: 'header' }),
        makeCampaign({ id: 'f1', position: 'footer' }),
      ]));
      await component['_reload']();
      expect(component.stats().header).toBe(1);
      expect(component.stats().footer).toBe(1);
    });
  });

  // ── listRows filtering ─────────────────────────────────────────────────────

  describe('listRows()', () => {
    beforeEach(async () => {
      mockService.listCampaigns.mockReturnValue(of([
        makeCampaign({ id: 'h1', name: 'Alpha', advertiser: 'MTN', position: 'header' }),
        makeCampaign({ id: 'f1', name: 'Beta',  advertiser: 'Airtel', position: 'footer' }),
      ]));
      await component['_reload']();
    });

    it('retourne toutes les campagnes sans filtre', () => {
      expect(component.listRows().length).toBe(2);
    });

    it('filtre par position header', () => {
      component.setSelectedPosition('header');
      expect(component.listRows().every(r => r.position === 'header')).toBe(true);
    });

    it('filtre par position footer', () => {
      component.setSelectedPosition('footer');
      expect(component.listRows().every(r => r.position === 'footer')).toBe(true);
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
      expect(component.editorAdvertiser()).toBe('');
      expect(component.editorCampaignId()).toBeNull();
    });

    it('pré-remplit les champs avec les données de la campagne existante', async () => {
      const camp = makeCampaign({ name: 'MTN Congo', advertiser: 'MTN', position: 'footer' });
      mockService.listCampaigns.mockReturnValue(of([camp]));
      await component['_reload']();
      component.openEditor('c1');
      expect(component.editorName()).toBe('MTN Congo');
      expect(component.editorPosition()).toBe('footer');
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
    it('retourne inactive quand active est false', () => {
      component.editorActive.set(false);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('inactive');
    });

    it('retourne active quand active=true et dates encadrant aujourd\'hui', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('active');
    });

    it('retourne scheduled quand start_date > today', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(TOMORROW);
      component.editorEndDate.set(TOMORROW);
      expect(component.editorCurrentStatus()).toBe('scheduled');
    });

    it('retourne ended quand end_date < today', () => {
      component.editorActive.set(true);
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(YESTERDAY);
      expect(component.editorCurrentStatus()).toBe('ended');
    });
  });

  // ── save() ─────────────────────────────────────────────────────────────────

  describe('save()', () => {
    beforeEach(() => {
      component.editorName.set('Airtel Back to School');
      component.editorAdvertiser.set('Airtel Congo');
      component.editorStartDate.set(YESTERDAY);
      component.editorEndDate.set(TOMORROW);
      component.editorPosition.set('footer');
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
      await component.save(false);
      expect(component.editorView()).toBe(false);
    });

    it('conserve l\'éditeur ouvert et affiche un toast d\'erreur si createCampaign() échoue', async () => {
      mockService.createCampaign.mockReturnValue(of({ success: false, error: 'Erreur DB' }));
      component.openEditor();
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

  // ── advertiserInitials() ──────────────────────────────────────────────────

  describe('advertiserInitials()', () => {
    it('retourne les initiales en majuscule', () => {
      expect(component.advertiserInitials('MTN Congo')).toBe('MC');
    });

    it('retourne une seule lettre pour un mot', () => {
      expect(component.advertiserInitials('Airtel')).toBe('A');
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
});
