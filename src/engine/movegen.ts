import {
  BISHOP,
  BISHOP_DIRS,
  DIR_CLASS,
  DIR_COUNT,
  KING,
  KNIGHT,
  KNIGHT_START,
  KNIGHT_TARGETS,
  PAWN,
  PAWN_ATTACK_FROM,
  PAWN_CAPTURE_DIRS,
  PAWN_PUSH_DIRS,
  PROMOTION_ZONE,
  QUEEN,
  QUEEN_DIRS,
  RAY,
  RAY_LEN,
  ROOK,
  ROOK_DIRS,
  SQUARES,
  colorIndex,
  type Color,
} from './geometry';
import { encodeMove, type Move } from './move';
import type { Position } from './position';

/** Upper bound on pseudo-legal moves in any reachable position (a queen has at most 95). */
export const MAX_MOVES = 4096;

const PROMOTION_ORDER = [QUEEN, KNIGHT, ROOK, BISHOP] as const;

/** Is square `target` attacked by any piece of colour `by`? */
export function isAttacked(board: Int8Array, target: number, by: Color): boolean {
  const base = target * DIR_COUNT;
  const pawnFrom = PAWN_ATTACK_FROM[colorIndex(by)];
  for (let d = 0; d < DIR_COUNT; d++) {
    const len = RAY_LEN[base + d];
    const rb = (base + d) * 3;
    for (let k = 0; k < len; k++) {
      const p = board[RAY[rb + k]];
      if (p === 0) continue;
      if (p * by > 0) {
        const t = p > 0 ? p : -p;
        if (t === QUEEN) return true;
        const cls = DIR_CLASS[d];
        if (t === ROOK) {
          if (cls === 1) return true;
        } else if (t === BISHOP) {
          if (cls === 2) return true;
        } else if (k === 0) {
          if (t === KING) return true;
          if (t === PAWN && pawnFrom[d]) return true;
        }
      }
      break;
    }
  }
  const knight = KNIGHT * by;
  for (let i = KNIGHT_START[target], end = KNIGHT_START[target + 1]; i < end; i++)
    if (board[KNIGHT_TARGETS[i]] === knight) return true;
  return false;
}

export function inCheck(pos: Position, side: Color = pos.turn): boolean {
  const k = pos.kingSquare(side);
  return k >= 0 && isAttacked(pos.board, k, -side as Color);
}

function slide(b: Int8Array, from: number, us: Color, dirs: Uint8Array, out: Int32Array, n: number, capturesOnly: boolean): number {
  const base = from * DIR_COUNT;
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const len = RAY_LEN[base + d];
    const rb = (base + d) * 3;
    for (let k = 0; k < len; k++) {
      const to = RAY[rb + k];
      const p = b[to];
      if (p === 0) {
        if (!capturesOnly) out[n++] = encodeMove(from, to);
        continue;
      }
      if (p * us < 0) out[n++] = encodeMove(from, to);
      break;
    }
  }
  return n;
}

function pushPawnMove(out: Int32Array, n: number, from: number, to: number, promotes: boolean, capturesOnly: boolean): number {
  if (!promotes) {
    out[n++] = encodeMove(from, to);
    return n;
  }
  if (capturesOnly) {
    out[n++] = encodeMove(from, to, QUEEN);
    return n;
  }
  for (const t of PROMOTION_ORDER) out[n++] = encodeMove(from, to, t);
  return n;
}

/**
 * Write pseudo-legal moves (own king may be left in check) for the side to move into
 * `out` starting at index `start`; returns the new end index. With `capturesOnly`, only
 * captures and queen promotions are produced (for quiescence search).
 */
export function generateMoves(pos: Position, out: Int32Array, start = 0, capturesOnly = false): number {
  const b = pos.board;
  const us = pos.turn;
  const ci = colorIndex(us);
  let n = start;
  for (let s = 0; s < SQUARES; s++) {
    const p = b[s] * us;
    if (p <= 0) continue;
    switch (p) {
      case PAWN: {
        const base = s * DIR_COUNT;
        const zone = ci * SQUARES;
        const push = PAWN_PUSH_DIRS[ci];
        for (let i = 0; i < push.length; i++) {
          const d = push[i];
          if (!RAY_LEN[base + d]) continue;
          const to = RAY[(base + d) * 3];
          if (b[to] !== 0) continue;
          const promotes = PROMOTION_ZONE[zone + to] === 1;
          if (capturesOnly && !promotes) continue;
          n = pushPawnMove(out, n, s, to, promotes, capturesOnly);
        }
        const caps = PAWN_CAPTURE_DIRS[ci];
        for (let i = 0; i < caps.length; i++) {
          const d = caps[i];
          if (!RAY_LEN[base + d]) continue;
          const to = RAY[(base + d) * 3];
          if (b[to] * us >= 0) continue;
          n = pushPawnMove(out, n, s, to, PROMOTION_ZONE[zone + to] === 1, capturesOnly);
        }
        break;
      }
      case KNIGHT:
        for (let i = KNIGHT_START[s], end = KNIGHT_START[s + 1]; i < end; i++) {
          const to = KNIGHT_TARGETS[i];
          const q = b[to] * us;
          if (q < 0 || (q === 0 && !capturesOnly)) out[n++] = encodeMove(s, to);
        }
        break;
      case BISHOP:
        n = slide(b, s, us, BISHOP_DIRS, out, n, capturesOnly);
        break;
      case ROOK:
        n = slide(b, s, us, ROOK_DIRS, out, n, capturesOnly);
        break;
      case QUEEN:
        n = slide(b, s, us, QUEEN_DIRS, out, n, capturesOnly);
        break;
      case KING: {
        const base = s * DIR_COUNT;
        for (let d = 0; d < DIR_COUNT; d++) {
          if (!RAY_LEN[base + d]) continue;
          const to = RAY[(base + d) * 3];
          const q = b[to] * us;
          if (q < 0 || (q === 0 && !capturesOnly)) out[n++] = encodeMove(s, to);
        }
        break;
      }
    }
  }
  return n;
}

/** Call right after make(): did the move just made leave the mover's own king safe? */
export function isLegalAfterMake(pos: Position): boolean {
  const mover = -pos.turn as Color;
  const k = pos.kingSquare(mover);
  return k < 0 || !isAttacked(pos.board, k, pos.turn);
}

const scratch = new Int32Array(MAX_MOVES);

/** All legal moves for the side to move. */
export function legalMoves(pos: Position): Move[] {
  const n = generateMoves(pos, scratch, 0, false);
  const pseudo = scratch.slice(0, n);
  const result: Move[] = [];
  for (let i = 0; i < n; i++) {
    const m = pseudo[i];
    pos.make(m);
    if (isLegalAfterMake(pos)) result.push(m);
    pos.unmake(m);
  }
  return result;
}

/** Does the side to move have at least one legal move? */
export function hasLegalMove(pos: Position): boolean {
  const n = generateMoves(pos, scratch, 0, false);
  const pseudo = scratch.slice(0, n);
  for (let i = 0; i < n; i++) {
    const m = pseudo[i];
    pos.make(m);
    const ok = isLegalAfterMake(pos);
    pos.unmake(m);
    if (ok) return true;
  }
  return false;
}

/** Squares of all pieces of colour `by` that attack `target`. */
export function attackers(board: Int8Array, target: number, by: Color): number[] {
  const out: number[] = [];
  const base = target * DIR_COUNT;
  const pawnFrom = PAWN_ATTACK_FROM[colorIndex(by)];
  for (let d = 0; d < DIR_COUNT; d++) {
    const len = RAY_LEN[base + d];
    const rb = (base + d) * 3;
    for (let k = 0; k < len; k++) {
      const s = RAY[rb + k];
      const p = board[s];
      if (p === 0) continue;
      if (p * by > 0) {
        const t = p > 0 ? p : -p;
        const cls = DIR_CLASS[d];
        if (
          t === QUEEN ||
          (t === ROOK && cls === 1) ||
          (t === BISHOP && cls === 2) ||
          (k === 0 && (t === KING || (t === PAWN && pawnFrom[d])))
        )
          out.push(s);
      }
      break;
    }
  }
  const knight = KNIGHT * by;
  for (let i = KNIGHT_START[target], end = KNIGHT_START[target + 1]; i < end; i++)
    if (board[KNIGHT_TARGETS[i]] === knight) out.push(KNIGHT_TARGETS[i]);
  return out;
}
