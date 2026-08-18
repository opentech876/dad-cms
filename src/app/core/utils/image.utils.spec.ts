import {
  fitWithin,
  MAX_BYTES,
  MAX_HEIGHT,
  MAX_WIDTH,
  THUMB_MAX_WIDTH,
  THUMB_MAX_HEIGHT,
  THUMB_MAX_BYTES,
  compressImage,
  compressThumbnail,
} from './image.utils';

// compressImage's canvas pipeline can't run in jsdom (no real canvas /
// createImageBitmap). We test the pure geometry helper exhaustively and
// verify the fallback contract of compressImage (returns the original
// file when decoding is impossible).

describe('image.utils', () => {
  describe('fitWithin', () => {
    it('ne redimensionne pas une image déjà dans le budget', () => {
      expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
      expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    });

    it('réduit une image paysage trop large en conservant le ratio', () => {
      expect(fitWithin(1600, 1200)).toEqual({ width: 800, height: 600 });
      expect(fitWithin(2000, 1000)).toEqual({ width: 800, height: 400 });
    });

    it('réduit une image portrait trop haute en conservant le ratio', () => {
      expect(fitWithin(600, 1200)).toEqual({ width: 300, height: 600 });
    });

    it("n'agrandit jamais une petite image", () => {
      expect(fitWithin(100, 80)).toEqual({ width: 100, height: 80 });
    });

    it('garantit une dimension minimale de 1px', () => {
      expect(fitWithin(10000, 1).width).toBeGreaterThanOrEqual(1);
      expect(fitWithin(10000, 1).height).toBeGreaterThanOrEqual(1);
    });

    it('expose les constantes du budget (800×600, 150 Ko)', () => {
      expect(MAX_WIDTH).toBe(800);
      expect(MAX_HEIGHT).toBe(600);
      expect(MAX_BYTES).toBe(150 * 1024);
    });

    it('expose le budget vignette (240×180, 30 Ko)', () => {
      expect(THUMB_MAX_WIDTH).toBe(240);
      expect(THUMB_MAX_HEIGHT).toBe(180);
      expect(THUMB_MAX_BYTES).toBe(30 * 1024);
    });

    it('réduit selon les dimensions vignette fournies', () => {
      expect(fitWithin(800, 600, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT)).toEqual({
        width: 240,
        height: 180,
      });
      expect(fitWithin(1000, 500, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT)).toEqual({
        width: 240,
        height: 120,
      });
    });
  });

  describe('compressImage — contrat de repli', () => {
    it("renvoie le fichier original quand le décodage échoue (pas de canvas en test)", async () => {
      const file = new File(['not-actually-an-image'], 'x.jpg', { type: 'image/jpeg' });
      const out = await compressImage(file);
      expect(out).toBe(file);
    });

    it('compressThumbnail renvoie aussi le fichier original en cas d\'échec', async () => {
      const file = new File(['not-actually-an-image'], 'x.jpg', { type: 'image/jpeg' });
      const out = await compressThumbnail(file);
      expect(out).toBe(file);
    });
  });

  describe('compressImage — pipeline (canvas mockée)', () => {
    let origCreateBitmap: any;
    let origCreateElement: any;

    function mockCanvas(blobSize: number, hasCtx = true): any {
      const ctx = hasCtx ? { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() } : null;
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toBlob: (cb: (b: Blob | null) => void) =>
          cb(blobSize >= 0 ? new Blob([new Uint8Array(blobSize)], { type: 'image/jpeg' }) : null),
      };
    }

    function setup(bitmap: { width: number; height: number }, canvas: any) {
      (global as any).createImageBitmap = jest.fn().mockResolvedValue({ ...bitmap, close: jest.fn() });
      document.createElement = jest.fn((tag: string) =>
        tag === 'canvas' ? canvas : origCreateElement.call(document, tag),
      ) as any;
    }

    beforeEach(() => {
      origCreateBitmap = (global as any).createImageBitmap;
      origCreateElement = document.createElement;
    });
    afterEach(() => {
      (global as any).createImageBitmap = origCreateBitmap;
      document.createElement = origCreateElement;
    });

    const oversized = () => new File([new Uint8Array(300 * 1024)], 'photo.png', { type: 'image/png' });

    it('renvoie le fichier tel quel si déjà dans le budget', async () => {
      const file = new File([new Uint8Array(1000)], 'x.jpg', { type: 'image/jpeg' });
      setup({ width: 400, height: 300 }, mockCanvas(500));
      expect(await compressImage(file)).toBe(file);
    });

    it('renvoie le fichier si le contexte 2D est indisponible', async () => {
      const file = oversized();
      setup({ width: 1600, height: 1200 }, mockCanvas(500, false));
      expect(await compressImage(file)).toBe(file);
    });

    it('compresse et renvoie un nouveau JPEG quand ça dépasse le budget', async () => {
      const file = oversized();
      setup({ width: 1600, height: 1200 }, mockCanvas(50 * 1024));
      const out = await compressImage(file);
      expect(out).not.toBe(file);
      expect(out.name).toBe('photo.jpg');
      expect(out.type).toBe('image/jpeg');
    });

    it('retombe sur createImageBitmap sans options si la 1ère forme échoue', async () => {
      const file = oversized();
      (global as any).createImageBitmap = jest.fn()
        .mockRejectedValueOnce(new Error('options rejetées'))
        .mockResolvedValueOnce({ width: 1600, height: 1200, close: jest.fn() });
      document.createElement = jest.fn((tag: string) =>
        tag === 'canvas' ? mockCanvas(50 * 1024) : origCreateElement.call(document, tag),
      ) as any;
      const out = await compressImage(file);
      expect((global as any).createImageBitmap).toHaveBeenCalledTimes(2);
      expect(out).not.toBe(file);
    });

    it('renvoie la dernière tentative même si tout dépasse le budget', async () => {
      const file = oversized();
      setup({ width: 1600, height: 1200 }, mockCanvas(500 * 1024));
      const out = await compressImage(file);
      expect(out).not.toBe(file);
      expect(out.type).toBe('image/jpeg');
    });

    it('renvoie le fichier original si toBlob échoue (null)', async () => {
      const file = oversized();
      setup({ width: 1600, height: 1200 }, mockCanvas(-1));
      expect(await compressImage(file)).toBe(file);
    });
  });
});
