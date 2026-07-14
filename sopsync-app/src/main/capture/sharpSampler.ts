import type { GrayscaleSampler, GrayscaleSample } from '../analysis/duplicates';

/**
 * Production GrayscaleSampler backed by `sharp`. Downscales a PNG to a small
 * grayscale matrix for perceptual hashing. Loaded lazily so the pure-logic test
 * suite (which injects its own sampler) never requires the native module.
 */
export class SharpSampler implements GrayscaleSampler {
  async sample(path: string, size: number): Promise<GrayscaleSample> {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(path)
      .resize(size, size, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, pixels: Array.from(data) };
  }
}
