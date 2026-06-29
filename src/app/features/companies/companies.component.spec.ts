import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { CompaniesComponent } from './companies.component';
import { CompanyService } from '../../core/companies/company.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';

const FAKE_COMPANIES = [
  { id: 'c1', name: 'MTN Congo',    type: 'telecom', business_domain: 'Téléphonie mobile',
    workspace_id: 'ws-1', website: 'https://mtn.cg', contact_email: null, contact_phone: null,
    notes: null, logo_url: null, created_by: 'u1', created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z', updated_by: null, deleted_at: null, deleted_by: null },
  { id: 'c2', name: 'SG Congo',     type: 'banque',  business_domain: 'Banque retail',
    workspace_id: 'ws-1', website: null, contact_email: 'rh@sg.cg', contact_phone: '+242 06 000',
    notes: null, logo_url: null, created_by: 'u1', created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z', updated_by: null, deleted_at: null, deleted_by: null },
];

describe('CompaniesComponent', () => {
  let component: CompaniesComponent;
  let fixture: ComponentFixture<CompaniesComponent>;
  let mockCompany: { listCompanies: jest.Mock; createCompany: jest.Mock; updateCompany: jest.Mock; deleteCompany: jest.Mock };
  let mockAuth: { hasRoleAtLeast: jest.Mock };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    mockCompany = {
      listCompanies: jest.fn().mockReturnValue(of(FAKE_COMPANIES)),
      createCompany: jest.fn().mockReturnValue(of({ success: true, id: 'new-id' })),
      updateCompany: jest.fn().mockReturnValue(of({ success: true })),
      deleteCompany: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockAuth = { hasRoleAtLeast: jest.fn().mockReturnValue(of(true)) };
    mockToast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [CompaniesComponent],
      providers: [
        { provide: CompanyService, useValue: mockCompany },
        { provide: AuthService,    useValue: mockAuth },
        { provide: ToastService,   useValue: mockToast },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(CompaniesComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(CompaniesComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('charge les compagnies au démarrage', async () => {
    await component.ngOnInit();
    expect(mockCompany.listCompanies).toHaveBeenCalled();
    expect(component.companies().length).toBe(2);
  });

  describe('filteredCompanies', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('retourne tout sans filtre', () => {
      expect(component.filteredCompanies().length).toBe(2);
    });

    it('filtre par recherche dans le nom', () => {
      component.setSearchQuery('mtn');
      expect(component.filteredCompanies().length).toBe(1);
      expect(component.filteredCompanies()[0].id).toBe('c1');
    });

    it('filtre par type', () => {
      component.setFilterType('banque');
      expect(component.filteredCompanies().length).toBe(1);
      expect(component.filteredCompanies()[0].id).toBe('c2');
    });

    it('filtre par domaine', () => {
      component.setFilterDomain('Téléphonie mobile');
      expect(component.filteredCompanies().length).toBe(1);
    });
  });

  describe('availableDomains', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('retourne la liste distincte triée', () => {
      expect(component.availableDomains()).toEqual(['Banque retail', 'Téléphonie mobile']);
    });
  });

  describe('openEditor()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it("ouvre l'éditeur vide pour une nouvelle compagnie", () => {
      component.openEditor();
      expect(component.editorOpen()).toBe(true);
      expect(component.editorId()).toBeNull();
      expect(component.editorName()).toBe('');
    });

    it('pré-remplit les champs pour une compagnie existante', () => {
      component.openEditor('c1');
      expect(component.editorId()).toBe('c1');
      expect(component.editorName()).toBe('MTN Congo');
      expect(component.editorType()).toBe('telecom');
      expect(component.editorWebsite()).toBe('https://mtn.cg');
    });

    it("n'ouvre pas l'éditeur quand canWrite est faux", () => {
      mockAuth.hasRoleAtLeast.mockReturnValue(of(false));
      // Re-construct component to pick up new auth state
      const fix2 = TestBed.createComponent(CompaniesComponent);
      const comp2 = fix2.componentInstance;
      comp2.openEditor('c1');
      expect(comp2.editorOpen()).toBe(false);
    });
  });

  describe('saveEditor()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('appelle createCompany() en mode création', async () => {
      component.openEditor();
      component.editorName.set('TotalEnergies');
      component.editorType.set('energie');
      component.editorDomain.set('Hydrocarbures');
      await component.saveEditor();
      expect(mockCompany.createCompany).toHaveBeenCalledWith(expect.objectContaining({
        name: 'TotalEnergies', type: 'energie', business_domain: 'Hydrocarbures',
      }));
    });

    it('appelle updateCompany() en mode édition', async () => {
      component.openEditor('c1');
      component.editorName.set('MTN Group');
      await component.saveEditor();
      expect(mockCompany.updateCompany).toHaveBeenCalledWith('c1', expect.objectContaining({
        name: 'MTN Group',
      }));
    });

    it("ferme l'éditeur après succès", async () => {
      component.openEditor();
      component.editorName.set('Nouvelle');
      await component.saveEditor();
      expect(component.editorOpen()).toBe(false);
    });

    it("affiche message sur duplicate_name", async () => {
      mockCompany.createCompany.mockReturnValue(of({ success: false, error: 'duplicate_name' }));
      component.openEditor();
      component.editorName.set('MTN Congo');
      await component.saveEditor();
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('porte déjà ce nom'));
    });
  });
});
