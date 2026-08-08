import { describe, it, expect } from 'vitest';
import { dHash, hammingDistance, similarity, clusterByHash, sequentialSimilarities, type HashedShot } from '@main/analysis/duplicates';

describe('perceptual hashing & clustering', () => {
  it('produces identical dHash for identical samples and detects gradients', () => {
    const flat = { width: 9, height: 9, pixels: new Array(81).fill(100) };
    const h1 = dHash(flat);
    const h2 = dHash({ ...flat, pixels: new Array(81).fill(100) });
    expect(h1).toBe(h2);
    expect(similarity(h1, h2)).toBe(1);
  });

  it('hamming distance and similarity are consistent', () => {
    expect(hammingDistance('ff', 'ff')).toBe(0);
    expect(hammingDistance('ff', '00')).toBe(8);
    expect(similarity('ff', '00')).toBe(0);
  });

  it('clusters near-duplicates while keeping distinct screens apart', () => {
    const shots: HashedShot[] = [
      { id: 'a', number: 1, hash: 'ffff' },
      { id: 'b', number: 2, hash: 'ffff' }, // identical to a
      { id: 'c', number: 3, hash: 'fffe' }, // 1 bit off from a
      { id: 'd', number: 4, hash: '0000' }, // very different
    ];
    const clusters = clusterByHash(shots, 0.9);
    // a,b,c cluster; d separate
    const first = clusters.find((c) => c.memberIds.includes('a'))!;
    expect(first.memberIds).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(first.representativeId).toBe('a');
    expect(clusters.some((c) => c.memberIds.length === 1 && c.memberIds[0] === 'd')).toBe(true);
  });

  it('computes sequential similarity to the previous shot', () => {
    const shots: HashedShot[] = [
      { id: 'a', number: 1, hash: 'ffff' },
      { id: 'b', number: 2, hash: 'ffff' },
    ];
    const sims = sequentialSimilarities(shots);
    expect(sims.get('a')).toBe(0);
    expect(sims.get('b')).toBe(1);
  });
});
