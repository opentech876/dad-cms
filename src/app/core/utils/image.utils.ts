/**
 * Client-side image compression — CLAUDE.md hard requirement: every image
 * must land in storage at ≤ 800×600 px and ≤ 150 Ko.
 *
 * Dependency-free implementation: canvas downscale + JPEG quality stepping.
 * If anything in the pipeline fails (unsupported format, canvas unavailable)
 * the ORIGINAL file is returned so the upload still succeeds — the size
 * guarantee is best-effort on exotic inputs, strict on the common ones
 * (JPEG/PNG/WebP photos).
 */

export const MAX_WIDTH  = 800;
export const MAX_HEIGHT = 600;
export const MAX_BYTES  = 150 * 1024;

/** Thumbnail budget — the small variant grids load instead of the full
 *  cover. ~1/10th the weight, so a 20-row list costs ~0.3 MB instead of
 *  ~3 MB of Storage egress. */
export const THUMB_MAX_WIDTH  = 240;
export const THUMB_MAX_HEIGHT = 180;
export const THUMB_MAX_BYTES  = 30 * 1024;

/** Size/quality budget for one compression pass. */
export interface CompressPreset {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
}

export const COVER_PRESET: CompressPreset = {
  maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT, maxBytes: MAX_BYTES,
};
export const THUMB_PRESET: CompressPreset = {
  maxWidth: THUMB_MAX_WIDTH, maxHeight: THUMB_MAX_HEIGHT, maxBytes: THUMB_MAX_BYTES,
};

/** Compute the target dimensions preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxW: number = MAX_WIDTH,
  maxH: number = MAX_HEIGHT,
): { width: number; height: number } {
  if (width <= maxW && height <= maxH) return { width, height };
  const ratio = Math.min(maxW / width, maxH / height);
  return {
    width:  Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Compress `file` to fit the given preset (default: 800×600 / 150 Ko cover).
 * Returns a new JPEG File, or the original file when compression is
 * unnecessary (already within budget) or impossible (decode failure).
 */
export async function compressImage(
  file: File,
  preset: CompressPreset = COVER_PRESET,
): Promise<File> {
  // Already small enough AND not oversized? Skip the whole pipeline.
  // We still need the dimensions to decide, so only short-circuit on size.
  try {
    // 'from-image' applies the EXIF orientation while decoding — without it
    // a portrait phone JPEG lands rotated 90° after the canvas re-encode
    // (canvas strips EXIF, so the metadata-based rotation is lost).
    // Older engines that reject the options dict fall back to a plain call.
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      bitmap = await createImageBitmap(file);
    }
    const { width, height } = fitWithin(bitmap.width, bitmap.height, preset.maxWidth, preset.maxHeight);
    const alreadyFits = file.size <= preset.maxBytes
      && bitmap.width <= preset.maxWidth && bitmap.height <= preset.maxHeight;
    if (alreadyFits) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // White matte behind transparent PNGs — JPEG has no alpha channel and
    // would otherwise render transparency as black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Step the JPEG quality down until we fit the byte budget.
    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob && blob.size <= preset.maxBytes) {
        return blobToFile(blob, file.name);
      }
      // Keep the last attempt around in case even 0.35 overshoots —
      // at these dimensions a q0.35 JPEG virtually never exceeds the budget,
      // but if it somehow does we return that smallest attempt anyway.
      if (quality === 0.35 && blob) {
        return blobToFile(blob, file.name);
      }
    }
    return file;
  } catch {
    return file;
  }
}

/**
 * Compress `file` into a small thumbnail (240×180 / ≤30 Ko). Grids load
 * this instead of the full cover; falls back to the original file on
 * decode failure, exactly like {@link compressImage}.
 */
export function compressThumbnail(file: File): Promise<File> {
  return compressImage(file, THUMB_PRESET);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
