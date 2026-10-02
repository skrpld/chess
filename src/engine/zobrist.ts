/**
 * Zobrist hashing keys. Two independent 32-bit halves give a 64-bit position key.
 * A fixed seed keeps hashes identical between the page and the AI worker.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}

const rand = mulberry32(0x4d4d4d4);

/** Key of piece p (−6…6) on square s is Z_LO/Z_HI[(p + 6)·256 + s]. */
export const Z_LO = new Int32Array(13 * 256);
export const Z_HI = new Int32Array(13 * 256);
for (let i = 0; i < Z_LO.length; i++) {
  Z_LO[i] = rand();
  Z_HI[i] = rand();
}

export const Z_SIDE_LO = rand();
export const Z_SIDE_HI = rand();

export const zIndex = (piece: number, s: number): number => (piece + 6) * 256 + s;
