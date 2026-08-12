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
});
