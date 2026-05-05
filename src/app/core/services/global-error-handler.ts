import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);
    this.toast.error('Une erreur inattendue s\'est produite. Veuillez réessayer.');
  }
}
