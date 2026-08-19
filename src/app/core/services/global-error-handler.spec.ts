import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandler } from './global-error-handler';
import { ToastService } from './toast.service';

describe('GlobalErrorHandler', () => {
  it("journalise l'erreur et affiche un toast d'erreur", () => {
    const toast = { error: jest.fn() };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: ToastService, useValue: toast }],
    });
    const handler = TestBed.inject(GlobalErrorHandler);

    handler.handleError(new Error('boom'));

    expect(consoleSpy).toHaveBeenCalledWith('[GlobalErrorHandler]', expect.any(Error));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('erreur inattendue'));
    consoleSpy.mockRestore();
  });
});
