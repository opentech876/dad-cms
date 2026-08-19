import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  it('ajoute un toast avec le type et le message corrects', () => {
    service.show('Opération réussie', 'success');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Opération réussie');
    expect(service.toasts()[0].type).toBe('success');
  });

  it('retire le toast automatiquement après la durée', () => {
    service.show('Msg', 'info', 3000);
    expect(service.toasts().length).toBe(1);
    jest.advanceTimersByTime(3000);
    expect(service.toasts().length).toBe(0);
  });

  it('ne retire pas le toast avant la durée', () => {
    service.show('Msg', 'info', 3000);
    jest.advanceTimersByTime(2999);
    expect(service.toasts().length).toBe(1);
  });

  it('dismiss() retire le toast par id', () => {
    service.show('A', 'success');
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts().length).toBe(0);
  });

  it('success() crée un toast de type success', () => {
    service.success('Enregistré');
    expect(service.toasts()[0].type).toBe('success');
  });

  it('error() crée un toast de type error', () => {
    service.error('Erreur réseau');
    expect(service.toasts()[0].type).toBe('error');
  });

  it('warning() crée un toast de type warning', () => {
    service.warning('Attention');
    expect(service.toasts()[0].type).toBe('warning');
  });

  it('info() crée un toast de type info', () => {
    service.info('Information');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('génère un id de repli quand crypto.randomUUID est indisponible', () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    service.show('Sans crypto', 'info');
    expect(service.toasts()[0].id).toBeTruthy();
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  });

  it('gère plusieurs toasts indépendants', () => {
    service.show('A', 'success', 1000);
    service.show('B', 'error', 2000);
    expect(service.toasts().length).toBe(2);
    jest.advanceTimersByTime(1000);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('B');
    jest.advanceTimersByTime(1000);
    expect(service.toasts().length).toBe(0);
  });
});
