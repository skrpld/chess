import {
  BISHOP,
  DIR_COUNT,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  RAY,
  RAY_LEN,
  ROOK,
  SQUARES,
  mirror,
  sqW,
  sqX,
  sqY,
  sqZ,
} from '../engine/geometry';
import type { Color } from '../engine/geometry';
import type { Position } from '../engine/position';

/**
 * Piece values in centipawns. In four dimensions the bishop (24 line directions, ~21 squares
 * on average) out-ranges the rook (8 directions, always 12 squares), so it is valued higher.
 */
export const PIECE_VALUE = [0, 100, 320, 430, 360, 1150, 0];

const inner = (c: number): number => (c === 1 || c === 2 ? 1 : 0);
/** Number of coordinates (0–4) that are not on the edge of the board. */
const centrality = (s: number): number => inner(sqX(s)) + inner(sqY(s)) + inner(sqZ(s)) + inner(sqW(s));

/**
 * PSQ[(p + 6)·256 + s] — material plus placement bonus of piece p on square s, signed
 * from White's point of view (black pieces use the mirrored square and count negative).
 * Kings are scored separately because their best squares change as material comes off.
 */
const PSQ = new Int16Array(13 * SQUARES);
/** Non-pawn material carried by a piece code (+ or −), for the game phase. */
const PHASE_WEIGHT = new Int16Array(13);
const KING_MIDDLE = new Int16Array(SQUARES);
const KING_END = new Int16Array(SQUARES);

for (let s = 0; s < SQUARES; s++) {
  const c = centrality(s);
  const advance = sqY(s) + sqW(s); // 2 at the start, 5 one step before promotion
  const bonus = [0, 0, 0, 0, 0, 0, 0];
  bonus[PAWN] = [0, 0, 0, 10, 24, 50, 0][advance] + 3 * (inner(sqX(s)) + inner(sqZ(s)));
  bonus[KNIGHT] = 8 * c - 12;
  bonus[BISHOP] = 5 * c - 6;
  bonus[ROOK] = 2 * c;
  bonus[QUEEN] = 3 * c - 4;
  for (let t = PAWN; t < KING; t++) {
    PSQ[(t + 6) * SQUARES + s] = PIECE_VALUE[t] + bonus[t];
    PSQ[(-t + 6) * SQUARES + mirror(s)] = -(PIECE_VALUE[t] + bonus[t]);
  }
  KING_MIDDLE[s] = -12 * advance;
  KING_END[s] = 10 * c - 10;
}
for (let t = KNIGHT; t < KING; t++) PHASE_WEIGHT[t + 6] = PHASE_WEIGHT[-t + 6] = PIECE_VALUE[t];

/** Non-pawn material of both sides at the start of the game. */
const OPENING_MATERIAL = 2 * (4 * PIECE_VALUE[ROOK] + 4 * PIECE_VALUE[KNIGHT] + 6 * PIECE_VALUE[BISHOP] + PIECE_VALUE[QUEEN]);

/** Friendly pieces next to the king, a cheap proxy for its shelter. */
function kingShelter(board: Int8Array, k: number, side: Color): number {
  let friends = 0;
  const base = k * DIR_COUNT;
  for (let d = 0; d < DIR_COUNT; d++) if (RAY_LEN[base + d] && board[RAY[(base + d) * 3]] * side > 0) friends++;
  return Math.min(friends, 10) * 4;
}

/** Static evaluation in centipawns from the point of view of the side to move. */
export function evaluate(pos: Position): number {
  const b = pos.board;
  let score = 0;
  let material = 0;
  for (let s = 0; s < SQUARES; s++) {
    const p = b[s];
    if (p === 0) continue;
    score += PSQ[(p + 6) * SQUARES + s];
    material += PHASE_WEIGHT[p + 6];
  }
  const phase = Math.min(1, material / (OPENING_MATERIAL * 0.6));
  const wk = pos.kings[0];
  const bk = pos.kings[1];
  if (wk >= 0) score += phase * (KING_MIDDLE[wk] + kingShelter(b, wk, 1)) + (1 - phase) * KING_END[wk];
  if (bk >= 0) {
    const m = mirror(bk);
    score -= phase * (KING_MIDDLE[m] + kingShelter(b, bk, -1)) + (1 - phase) * KING_END[m];
  }
  return Math.round(score * pos.turn) + 12;
}

export function hasNonPawnMaterial(pos: Position, side: Color): boolean {
  const b = pos.board;
  for (let s = 0; s < SQUARES; s++) {
    const p = b[s] * side;
    if (p > PAWN && p < KING) return true;
  }
  return false;
}
