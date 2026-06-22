import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ForgotPasswordComponent } from './forgot-password.component';
import { SupabaseService } from '../../../core/supabase/supabase.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockSupabase: { resetPasswordForEmail: jest.Mock };

  beforeEach(async () => {
    mockSupabase = {
      resetPasswordForEmail: jest.fn().mockResolvedValue({ data: {}, error: null }),
    };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [{ provide: SupabaseService, useValue: mockSupabase }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(ForgotPasswordComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('sent démarre à false', () => {
    expect(component.sent()).toBe(false);
  });

  it('loading démarre à false', () => {
    expect(component.loading()).toBe(false);
  });

  describe('submit()', () => {
    it('ne fait rien si le champ email est vide', async () => {
      component.email.setValue('');
      await component.submit();
      expect(mockSupabase.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('ne fait rien si l\'email est invalide', async () => {
      component.email.setValue('pasunemail');
      await component.submit();
      expect(mockSupabase.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('appelle resetPasswordForEmail avec l\'email saisi', async () => {
      component.email.setValue('alice@open-tech.cg');
      await component.submit();
      expect(mockSupabase.resetPasswordForEmail).toHaveBeenCalledWith('alice@open-tech.cg');
    });

    it('passe sent à true après succès', async () => {
      component.email.setValue('alice@open-tech.cg');
      await component.submit();
      expect(component.sent()).toBe(true);
    });

    it('affiche un message d\'erreur en cas d\'échec Supabase', async () => {
      mockSupabase.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      component.email.setValue('alice@open-tech.cg');
      await component.submit();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.sent()).toBe(false);
    });

    it('ne soumet pas quand loading est true', async () => {
      component.loading.set(true);
      component.email.setValue('alice@open-tech.cg');
      await component.submit();
      expect(mockSupabase.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });
});
