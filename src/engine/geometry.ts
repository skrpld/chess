/**
 * Geometry of the 4×4×4×4 board.
 *
 * A square is a single integer index = x + 4·y + 16·z + 64·w, where
 *   x — file inside a small board   (a–d)
 *   y — rank inside a small board   (1–4)
 *   z — column of small boards      (A–D)
 *   w — row of small boards         (1–4)
 *
 * All direction / ray / jump tables are precomputed once at module load so that
 * move generation and attack detection are plain array lookups.
 */

export const SIDE = 4;
export const SQUARES = 256;
export const AXES = 4;

export const WHITE = 1;
export const BLACK = -1;
export type Color = 1 | -1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

/** Index of a colour in two-element tables: white → 0, black → 1. */
export const colorIndex = (c: Color): 0 | 1 => (c === WHITE ? 0 : 1);

export const square = (x: number, y: number, z: number, w: number): number => x + 4 * y + 16 * z + 64 * w;
export const sqX = (s: number): number => s & 3;
export const sqY = (s: number): number => (s >> 2) & 3;
export const sqZ = (s: number): number => (s >> 4) & 3;
export const sqW = (s: number): number => (s >> 6) & 3;
export const coords = (s: number): [number, number, number, number] => [sqX(s), sqY(s), sqZ(s), sqW(s)];

/** Square seen from the other side: ranks (y) and board rows (w) are reversed. */
export const mirror = (s: number): number => square(sqX(s), 3 - sqY(s), sqZ(s), 3 - sqW(s));

/** 4D square colour: squares with an even coordinate sum are dark (a1A1 is dark, as a1 is in chess). */
export const isDarkSquare = (s: number): boolean => ((sqX(s) + sqY(s) + sqZ(s) + sqW(s)) & 1) === 0;

// ---------------------------------------------------------------------------
// Directions: every vector in {-1, 0, 1}^4 except zero — 80 in total.
// DIR_CLASS[d] = number of non-zero components (1 = rook line, 2 = bishop line,
// 3 and 4 = lines only the queen (and king, one step) can use).
// ---------------------------------------------------------------------------

export const DIR_COUNT = 80;
export const DIR_VEC: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const out: [number, number, number, number][] = [];
  for (let dw = -1; dw <= 1; dw++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz || dw) out.push([dx, dy, dz, dw]);
  return out;
})();

export const DIR_CLASS = Uint8Array.from(DIR_VEC, (v) => v.filter((c) => c !== 0).length);

export function dirIndex(dx: number, dy: number, dz: number, dw: number): number {
  return DIR_VEC.findIndex((v) => v[0] === dx && v[1] === dy && v[2] === dz && v[3] === dw);
}

export const ROOK_DIRS = Uint8Array.from(DIR_VEC.keys()).filter((d) => DIR_CLASS[d] === 1);
export const BISHOP_DIRS = Uint8Array.from(DIR_VEC.keys()).filter((d) => DIR_CLASS[d] === 2);
export const QUEEN_DIRS = Uint8Array.from(DIR_VEC.keys());

/** Number of squares along direction d from square s before leaving the board (0–3). */
export const RAY_LEN = new Uint8Array(SQUARES * DIR_COUNT);
/** RAY[(s·80 + d)·3 + k] — the (k+1)-th square along direction d from s. */
export const RAY = new Uint8Array(SQUARES * DIR_COUNT * 3);

for (let s = 0; s < SQUARES; s++) {
  const c = coords(s);
  for (let d = 0; d < DIR_COUNT; d++) {
    const v = DIR_VEC[d];
    let len = 0;
    for (let k = 1; k <= 3; k++) {
      const x = c[0] + v[0] * k;
      const y = c[1] + v[1] * k;
      const z = c[2] + v[2] * k;
      const w = c[3] + v[3] * k;
      if (x < 0 || x > 3 || y < 0 || y > 3 || z < 0 || z > 3 || w < 0 || w > 3) break;
      RAY[(s * DIR_COUNT + d) * 3 + len] = square(x, y, z, w);
      len++;
    }
    RAY_LEN[s * DIR_COUNT + d] = len;
  }
}

/** First square along direction d from s, or -1 when d leaves the board immediately. */
export function step(s: number, d: number): number {
  return RAY_LEN[s * DIR_COUNT + d] ? RAY[(s * DIR_COUNT + d) * 3] : -1;
}

// ---------------------------------------------------------------------------
// Knight jumps: two squares along one axis and one square along another.
// 4 · 3 ordered axis pairs · 4 sign combinations = 48 jump vectors.
// ---------------------------------------------------------------------------

export const KNIGHT_VEC: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const out: [number, number, number, number][] = [];
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      if (a === b) continue;
      for (const sa of [-2, 2])
        for (const sb of [-1, 1]) {
          const v: [number, number, number, number] = [0, 0, 0, 0];
          v[a] = sa;
          v[b] = sb;
          out.push(v);
        }
    }
  return out;
})();

/** Knight targets of square s are KNIGHT_TARGETS[KNIGHT_START[s] .. KNIGHT_START[s + 1]). */
export const KNIGHT_START = new Uint16Array(SQUARES + 1);
export const KNIGHT_TARGETS: Uint8Array = (() => {
  const list: number[] = [];
  for (let s = 0; s < SQUARES; s++) {
    KNIGHT_START[s] = list.length;
    const c = coords(s);
    for (const v of KNIGHT_VEC) {
      const x = c[0] + v[0];
      const y = c[1] + v[1];
      const z = c[2] + v[2];
      const w = c[3] + v[3];
      if (x < 0 || x > 3 || y < 0 || y > 3 || z < 0 || z > 3 || w < 0 || w > 3) continue;
      list.push(square(x, y, z, w));
    }
  }
  KNIGHT_START[SQUARES] = list.length;
  return Uint8Array.from(list);
})();

// ---------------------------------------------------------------------------
// Pawns. "Forward" has two axes: rank (y) and board row (w).
// White moves towards y = 4 and w = 4, Black towards y = 1 and w = 1.
//   push    — one step forward along y or along w, onto an empty square;
//   capture — one step forward along y or w combined with one step sideways
//             along x or z (8 possible capture directions).
// A pawn promotes on reaching the far corner of the y–w plane:
// rank 4 on board row 4 for White, rank 1 on board row 1 for Black.
// ---------------------------------------------------------------------------

export const PAWN_PUSH_DIRS: readonly [Uint8Array, Uint8Array] = [
  Uint8Array.of(dirIndex(0, 1, 0, 0), dirIndex(0, 0, 0, 1)),
  Uint8Array.of(dirIndex(0, -1, 0, 0), dirIndex(0, 0, 0, -1)),
];

function pawnCaptureDirs(f: number): Uint8Array {
  const dirs: number[] = [];
  for (const fwd of [
    [0, f, 0, 0],
    [0, 0, 0, f],
  ])
    for (const side of [
      [1, 0, 0, 0],
      [-1, 0, 0, 0],
      [0, 0, 1, 0],
      [0, 0, -1, 0],
    ])
      dirs.push(dirIndex(fwd[0] + side[0], fwd[1] + side[1], fwd[2] + side[2], fwd[3] + side[3]));
  return Uint8Array.from(dirs);
}

export const PAWN_CAPTURE_DIRS: readonly [Uint8Array, Uint8Array] = [pawnCaptureDirs(1), pawnCaptureDirs(-1)];

/** PAWN_ATTACK_FROM[ci][d] = 1 when a pawn of colour ci, one step away from a square in direction d, attacks it. */
export const PAWN_ATTACK_FROM: readonly [Uint8Array, Uint8Array] = [new Uint8Array(DIR_COUNT), new Uint8Array(DIR_COUNT)];
for (let ci = 0; ci < 2; ci++)
  for (const d of PAWN_CAPTURE_DIRS[ci]) {
    const v = DIR_VEC[d];
    PAWN_ATTACK_FROM[ci][dirIndex(-v[0], -v[1], -v[2], -v[3])] = 1;
  }

/** PROMOTION_ZONE[ci·256 + s] = 1 when a pawn of colour ci promotes on square s. */
export const PROMOTION_ZONE = new Uint8Array(SQUARES * 2);
for (let s = 0; s < SQUARES; s++) {
  if (sqY(s) === 3 && sqW(s) === 3) PROMOTION_ZONE[s] = 1;
  if (sqY(s) === 0 && sqW(s) === 0) PROMOTION_ZONE[SQUARES + s] = 1;
}

/**
 * LINE_DIR[a·256 + b] = index of the direction leading from a to b when both lie on one line
 * (rook, bishop or any queen line), otherwise −1. Used to spot pieces that might be pinned.
 */
export const LINE_DIR = new Int8Array(SQUARES * SQUARES).fill(-1);
for (let a = 0; a < SQUARES; a++)
  for (let d = 0; d < DIR_COUNT; d++) {
    const len = RAY_LEN[a * DIR_COUNT + d];
    for (let k = 0; k < len; k++) LINE_DIR[a * SQUARES + RAY[(a * DIR_COUNT + d) * 3 + k]] = d;
  }
