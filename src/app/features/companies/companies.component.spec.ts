import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { CompaniesComponent } from './companies.component';
import { CompanyService } from '../../core/companies/company.service';
import { CompanyTypeService } from '../../core/companies/company-type.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';

const FAKE_COMPANIES = [
  { id: 'c1', name: 'MTN Congo',    type: 'Télécommunications',
    workspace_id: 'ws-1', website: 'https://mtn.cg', contact_email: null, contact_phone: null,
    notes: null, logo_url: null, created_by: 'u1', created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z', updated_by: null, deleted_at: null, deleted_by: null },
  { id: 'c2', name: 'SG Congo',     type: 'Banque & Finance',
    workspace_id: 'ws-1', website: null, contact_email: 'rh@sg.cg', contact_phone: '+242 06 000',
    notes: null, logo_url: null, created_by: 'u1', created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z', updated_by: null, deleted_at: null, deleted_by: null },
];

const FAKE_TYPES = [
  { id: 't1', workspace_id: 'ws-1', label: 'Télécommunications', sort_order: 1, created_at: '', deleted_at: null },
  { id: 't2', workspace_id: 'ws-1', label: 'Banque & Finance',   sort_order: 2, created_at: '', deleted_at: null },
  { id: 't3', workspace_id: 'ws-1', label: 'Énergie',            sort_order: 3, created_at: '', deleted_at: null },
];

describe('CompaniesComponent', () => {
  let component: CompaniesComponent;
  let fixture: ComponentFixture<CompaniesComponent>;
  let mockCompany: { listCompanies: jest.Mock; createCompany: jest.Mock; updateCompany: jest.Mock; deleteCompany: jest.Mock };
  let mockCompanyType: { listTypes: jest.Mock; createType: jest.Mock; renameType: jest.Mock; deleteType: jest.Mock };
  let mockAuth: { hasRoleAtLeast: jest.Mock };
  let mockToast: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };

  beforeEach(async () => {
    mockCompany = {
      listCompanies: jest.fn().mockReturnValue(of(FAKE_COMPANIES)),
      createCompany: jest.fn().mockReturnValue(of({ success: true, id: 'new-id' })),
      updateCompany: jest.fn().mockReturnValue(of({ success: true })),
      deleteCompany: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockCompanyType = {
      listTypes:  jest.fn().mockReturnValue(of(FAKE_TYPES)),
      createType: jest.fn().mockReturnValue(of({ success: true })),
      renameType: jest.fn().mockReturnValue(of({ success: true })),
      deleteType: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockAuth = { hasRoleAtLeast: jest.fn().mockReturnValue(of(true)) };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [CompaniesComponent],
      providers: [
        { provide: CompanyService,     useValue: mockCompany },
        { provide: CompanyTypeService, useValue: mockCompanyType },
        { provide: AuthService,        useValue: mockAuth },
        { provide: ToastService,       useValue: mockToast },
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

  it('charge les compagnies et les types au démarrage', async () => {
    await component.ngOnInit();
    expect(mockCompany.listCompanies).toHaveBeenCalled();
    expect(mockCompanyType.listTypes).toHaveBeenCalled();
    expect(component.companies().length).toBe(2);
    expect(component.types().length).toBe(3);
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

    it('filtre par type (libellé géré)', () => {
      component.setFilterType('Banque & Finance');
      expect(component.filteredCompanies().length).toBe(1);
      expect(component.filteredCompanies()[0].id).toBe('c2');
    });
  });

  describe('typeOptions', () => {
    it('reflète les types gérés quand ils existent', async () => {
      await component.ngOnInit();
      expect(component.typeOptions()).toEqual(['Télécommunications', 'Banque & Finance', 'Énergie']);
    });

    it('retombe sur les libellés par défaut quand aucun type géré', async () => {
      mockCompanyType.listTypes.mockReturnValue(of([]));
      const fix = TestBed.createComponent(CompaniesComponent);
      const comp = fix.componentInstance;
      await comp.ngOnInit();
      expect(comp.typeOptions().length).toBe(10);
      expect(comp.typeOptions()).toContain('Autre');
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
      expect(component.editorType()).toBe('Télécommunications');
      expect(component.editorWebsite()).toBe('https://mtn.cg');
    });

    it("n'ouvre pas l'éditeur quand canWrite est faux", () => {
      mockAuth.hasRoleAtLeast.mockReturnValue(of(false));
      const fix2 = TestBed.createComponent(CompaniesComponent);
      const comp2 = fix2.componentInstance;
      comp2.openEditor('c1');
      expect(comp2.editorOpen()).toBe(false);
    });
  });

  describe('saveEditor()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('appelle createCompany() avec le type choisi, sans business_domain', async () => {
      component.openEditor();
      component.editorName.set('TotalEnergies');
      component.editorType.set('Énergie');
      await component.saveEditor();
      expect(mockCompany.createCompany).toHaveBeenCalledWith(expect.objectContaining({
        name: 'TotalEnergies', type: 'Énergie',
      }));
      const payload = mockCompany.createCompany.mock.calls[0][0];
      expect(payload).not.toHaveProperty('business_domain');
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

    it('affiche message sur duplicate_name', async () => {
      mockCompany.createCompany.mockReturnValue(of({ success: false, error: 'duplicate_name' }));
      component.openEditor();
      component.editorName.set('MTN Congo');
      await component.saveEditor();
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('porte déjà ce nom'));
    });
  });

  describe('types manager', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('addType() crée un type puis recharge la liste', async () => {
      component.openTypesManager();
      component.newTypeLabel.set('Assurance');
      await component.addType();
      expect(mockCompanyType.createType).toHaveBeenCalledWith('Assurance');
      expect(mockCompanyType.listTypes).toHaveBeenCalledTimes(2); // ngOnInit + reloadTypes
    });

    it('removeType() supprime le type après confirmation', async () => {
      window.confirm = jest.fn(() => true);
      await component.removeType(FAKE_TYPES[2] as any);
      expect(mockCompanyType.deleteType).toHaveBeenCalledWith('t3');
    });
  });
});
