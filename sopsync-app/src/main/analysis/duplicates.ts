/**
 * Near-duplicate screenshot detection via perceptual hashing (aHash/dHash-style).
 *
 * The image-decode step (turning a PNG into a small grayscale matrix) lives
 * behind `GrayscaleSampler` so the clustering logic is fully unit-testable
 * without native image libraries. The production sampler uses `sharp`.
 */

export interface GrayscaleSample {
  width: number;
  height: number;
  /** row-major luminance values 0..255, length = width*height */
  pixels: number[];
}

export interface GrayscaleSampler {
  /** Downscale an image at `path` to `size`x`size` grayscale. */
  sample(path: string, size: number): Promise<GrayscaleSample>;
}

/** dHash: compare each pixel to its right neighbor → 64-bit hash as hex string. */
export function dHash(sample: GrayscaleSample): string {
  const { width, height, pixels } = sample;
  let bits = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = pixels[y * width + x] ?? 0;
      const b = pixels[y * width + x + 1] ?? 0;
      bits += a > b ? '1' : '0';
    }
  }
  // pack bits into hex
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
  }
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hash length mismatch');
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** 1.0 == identical; 0.0 == maximally different. */
export function similarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  const bits = a.length * 4;
  return 1 - hammingDistance(a, b) / bits;
}

export interface HashedShot {
  id: string;
  number: number;
  hash: string;
}

export interface DuplicateCluster {
  representativeId: string;
  memberIds: string[];
  reason: 'near_duplicate';
}

/**
 * Greedy single-link clustering: walk shots in capture order; a shot joins the
 * most recent cluster whose representative is within `threshold` similarity,
 * otherwise starts a new cluster. Capture order is preserved so clusters map to
 * contiguous workflow moments. The FIRST shot of a cluster is the representative
 * (the earliest evidence of that screen state) — the reviewer may override.
 */
export function clusterByHash(shots: HashedShot[], threshold: number): DuplicateCluster[] {
  const clusters: DuplicateCluster[] = [];
  const reps: { id: string; hash: string; clusterIdx: number }[] = [];
  for (const shot of shots) {
    let best = -1;
    let bestSim = 0;
    reps.forEach((r, i) => {
      const sim = similarity(r.hash, shot.hash);
      if (sim >= threshold && sim > bestSim) {
        bestSim = sim;
        best = i;
      }
    });
    if (best >= 0) {
      clusters[reps[best]!.clusterIdx]!.memberIds.push(shot.id);
    } else {
      const clusterIdx = clusters.length;
      clusters.push({ representativeId: shot.id, memberIds: [shot.id], reason: 'near_duplicate' });
      reps.push({ id: shot.id, hash: shot.hash, clusterIdx });
    }
  }
  return clusters;
}

/** Similarity of each shot to the previously-kept shot, for the metadata field. */
export function sequentialSimilarities(shots: HashedShot[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < shots.length; i++) {
    out.set(shots[i]!.id, i === 0 ? 0 : similarity(shots[i - 1]!.hash, shots[i]!.hash));
  }
  return out;
}
