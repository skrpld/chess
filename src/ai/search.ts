import { LINE_DIR } from '../engine/geometry';
import { generateMoves, inCheck, isLegalAfterMake, legalMoves, MAX_MOVES } from '../engine/movegen';
import { moveFrom, movePromo, moveTo, NO_MOVE, type Move } from '../engine/move';
import type { Position } from '../engine/position';
import { evaluate, hasNonPawnMaterial, PIECE_VALUE } from './evaluate';

export interface SearchLimits {
  /** Soft time budget in milliseconds. */
  timeMs: number;
  /** Deepest iteration of iterative deepening. */
  maxDepth: number;
  /** When > 0, pick randomly among root moves scoring within this many centipawns of the best. */
  randomMargin?: number;
}

export interface SearchResult {
  move: Move;
  /** Score in centipawns from the mover's point of view; |score| > MATE_BOUND means a forced mate. */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export const MATE = 100_000;
export const MATE_BOUND = MATE - 1_000;
const INF = 1_000_000;
const MAX_PLY = 64;
const STACK = MAX_PLY * MAX_MOVES;

/** Late-move pruning: at shallow depth, quiet moves this far down the ordered list are skipped. */
const LMP_LIMIT = [0, 10, 24, 48];
/** Late-move reduction by depth and move number. */
const LMR = new Uint8Array(64 * 256);
for (let d = 1; d < 64; d++) for (let n = 1; n < 256; n++) LMR[d * 256 + n] = Math.floor(0.75 + (Math.log(d) * Math.log(n)) / 2.25);

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

const now = (): number => performance.now();

/**
 * Iterative-deepening principal-variation search with a transposition table, null-move pruning,
 * late-move reductions, killer / history move ordering and a capture-only quiescence search.
 */
export class Searcher {
  private readonly ttMask: number;
  private readonly ttLo: Int32Array;
  private readonly ttHi: Int32Array;
  private readonly ttMove: Int32Array;
  private readonly ttScore: Int32Array;
  private readonly ttDepth: Int8Array;
  private readonly ttFlag: Int8Array;

  private readonly moves = new Int32Array(STACK);
  private readonly order = new Int32Array(STACK);
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(256 * 256);

  private pos!: Position;
  private sp = 0;
  private nodes = 0;
  private deadline = 0;
  private stopped = false;

  constructor(ttBits = 18) {
    const size = 1 << ttBits;
    this.ttMask = size - 1;
    this.ttLo = new Int32Array(size);
    this.ttHi = new Int32Array(size);
    this.ttMove = new Int32Array(size);
    this.ttScore = new Int32Array(size);
    this.ttDepth = new Int8Array(size);
    this.ttFlag = new Int8Array(size);
  }

  search(pos: Position, limits: SearchLimits): SearchResult {
    const started = now();
    this.pos = pos;
    this.sp = 0;
    this.nodes = 0;
    this.stopped = false;
    this.deadline = started + limits.timeMs;
    this.killers.fill(0);
    this.history.fill(0);

    const rootMoves = legalMoves(pos);
    const result: SearchResult = { move: rootMoves[0] ?? NO_MOVE, score: 0, depth: 0, nodes: 0, timeMs: 0 };
    if (rootMoves.length <= 1) {
      result.score = evaluate(pos);
      result.timeMs = now() - started;
      return result;
    }

    // Root ordering: captures and promotions first, then by the previous iteration's scores.
    const rootScore = new Map<Move, number>(rootMoves.map((m) => [m, this.orderScore(m, NO_MOVE, 0)]));
    let best = NO_MOVE;
    for (let depth = 1; depth <= limits.maxDepth; depth++) {
      rootMoves.sort((a, b) => (a === best ? -1 : b === best ? 1 : rootScore.get(b)! - rootScore.get(a)!));
      let alpha = -INF;
      let iterBest = NO_MOVE;
      for (let i = 0; i < rootMoves.length; i++) {
        const m = rootMoves[i];
        pos.make(m);
        let score: number;
        if (i === 0) score = -this.negamax(depth - 1, -INF, -alpha, 1);
        else {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, 1);
          if (score > alpha && !this.stopped) score = -this.negamax(depth - 1, -INF, -alpha, 1);
        }
        pos.unmake(m);
        if (this.stopped) break;
        rootScore.set(m, score);
        if (score > alpha) {
          alpha = score;
          iterBest = m;
        }
      }
      // A move that finished searching is trustworthy even when the iteration was cut short.
      if (iterBest !== NO_MOVE) {
        best = iterBest;
        result.move = best;
        result.score = alpha;
      }
      if (this.stopped) break;
      result.depth = depth;
      if (Math.abs(alpha) > MATE_BOUND) break;
      if (now() - started > limits.timeMs * 0.5) break; // the next iteration would not finish
    }

    if (limits.randomMargin && limits.randomMargin > 0 && !this.stopped) {
      result.move = this.pickVaried(rootMoves, Math.max(1, Math.min(result.depth, 2)), limits.randomMargin, result.move);
    }
    result.nodes = this.nodes;
    result.timeMs = now() - started;
    return result;
  }

  /** Score every root move exactly at a shallow depth and choose randomly among the near-best. */
  private pickVaried(rootMoves: Move[], depth: number, margin: number, fallback: Move): Move {
    const scored: [Move, number][] = [];
    for (const m of rootMoves) {
      this.pos.make(m);
      const score = -this.negamax(depth - 1, -INF, INF, 1);
      this.pos.unmake(m);
      if (this.stopped) return fallback;
      scored.push([m, score]);
    }
    const top = Math.max(...scored.map(([, s]) => s));
    const pool = scored.filter(([, s]) => s >= top - margin);
    return pool[Math.floor(Math.random() * pool.length)][0];
  }

  private orderScore(m: Move, ttMove: Move, ply: number): number {
    if (m === ttMove) return 2_000_000;
    const b = this.pos.board;
    const victim = Math.abs(b[moveTo(m)]);
    const promo = movePromo(m);
    if (victim) return 1_000_000 + PIECE_VALUE[victim] * 8 - Math.abs(b[moveFrom(m)]) + (promo ? PIECE_VALUE[promo] : 0);
    if (promo) return 900_000 + PIECE_VALUE[promo];
    if (m === this.killers[ply * 2]) return 800_001;
    if (m === this.killers[ply * 2 + 1]) return 800_000;
    return Math.min(this.history[m & 0xffff], 700_000);
  }

  private checkTime(): void {
    if ((++this.nodes & 1023) === 0 && now() > this.deadline) this.stopped = true;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.checkTime();
    if (this.stopped) return 0;
    const pos = this.pos;
    if (pos.halfmove >= 100 || pos.repetitions() > 0) return 0;

    const checked = inCheck(pos);
    if (checked && ply < MAX_PLY - 8) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 0);
    if (ply >= MAX_PLY - 2) return evaluate(pos);

    // Transposition table probe.
    const slot = pos.hashLo & this.ttMask;
    let ttMove = NO_MOVE;
    if (this.ttLo[slot] === pos.hashLo && this.ttHi[slot] === pos.hashHi) {
      ttMove = this.ttMove[slot];
      if (this.ttDepth[slot] >= depth) {
        const s = fromTT(this.ttScore[slot], ply);
        const flag = this.ttFlag[slot];
        if (flag === EXACT || (flag === LOWER && s >= beta) || (flag === UPPER && s <= alpha)) return s;
      }
    }

    const pvNode = beta - alpha > 1;
    let staticEval = 0;
    if (!checked) {
      staticEval = evaluate(pos);
      // Reverse futility: close to the leaves and far above beta, assume the position holds.
      if (!pvNode && depth <= 2 && Math.abs(beta) < MATE_BOUND && staticEval - 150 * depth >= beta) return staticEval;
      // Null move: if passing still keeps us above beta, this node is very likely good enough.
      if (!pvNode && depth >= 3 && beta < MATE_BOUND && staticEval >= beta && hasNonPawnMaterial(pos, pos.turn)) {
        pos.makeNull();
        const score = -this.negamax(depth - 1 - (depth >= 6 ? 3 : 2), -beta, -beta + 1, ply + 1);
        pos.unmakeNull();
        if (this.stopped) return 0;
        if (score >= beta) return beta;
      }
    }
    // Futility: on the last ply a quiet move cannot lift a hopeless score up to alpha.
    const futile = !checked && depth === 1 && Math.abs(alpha) < MATE_BOUND && staticEval + 180 <= alpha;

    const start = this.sp;
    const end = generateMoves(pos, this.moves, start, false);
    this.sp = end;
    for (let i = start; i < end; i++) this.order[i] = this.orderScore(this.moves[i], ttMove, ply);

    const king = pos.kingSquare(pos.turn);
    const alphaOrig = alpha;
    let bestScore = -INF;
    let bestMove = NO_MOVE;
    let legal = 0;
    for (let i = start; i < end; i++) {
      const m = this.pickNext(i, end);
      const from = moveFrom(m);
      const quiet = pos.board[moveTo(m)] === 0 && movePromo(m) === 0;
      // Prune only once a legal move is known, so mate and stalemate are still detected.
      if (quiet && legal > 0 && !checked && (futile || (!pvNode && depth <= 3 && legal > LMP_LIMIT[depth]))) continue;
      pos.make(m);
      // Only king moves, check evasions and pieces on a line with the king can be illegal.
      if (king >= 0 && (checked || from === king || LINE_DIR[king * 256 + from] >= 0) && !isLegalAfterMake(pos)) {
        pos.unmake(m);
        continue;
      }
      legal++;
      let score: number;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      } else {
        let reduction = 0;
        if (depth >= 3 && quiet && !checked && legal > 3 && m !== this.killers[ply * 2] && m !== this.killers[ply * 2 + 1] && !inCheck(pos))
          reduction = Math.min(depth - 2, LMR[Math.min(depth, 63) * 256 + Math.min(legal, 255)] - (pvNode ? 1 : 0));
        score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && reduction && !this.stopped) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && score < beta && !this.stopped) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake(m);
      if (this.stopped) {
        this.sp = start;
        return 0;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
      if (score > alpha) {
        alpha = score;
        if (score >= beta) {
          if (quiet) {
            if (this.killers[ply * 2] !== m) {
              this.killers[ply * 2 + 1] = this.killers[ply * 2];
              this.killers[ply * 2] = m;
            }
            this.history[m & 0xffff] += depth * depth;
          }
          break;
        }
      }
    }
    this.sp = start;

    if (legal === 0) return checked ? -MATE + ply : 0;

    this.ttLo[slot] = pos.hashLo;
    this.ttHi[slot] = pos.hashHi;
    this.ttMove[slot] = bestMove;
    this.ttScore[slot] = toTT(bestScore, ply);
    this.ttDepth[slot] = depth;
    this.ttFlag[slot] = bestScore <= alphaOrig ? UPPER : bestScore >= beta ? LOWER : EXACT;
    return bestScore;
  }

  /** Captures-only search that settles tactical exchanges before trusting the static evaluation. */
  private quiesce(alpha: number, beta: number, ply: number, qdepth: number): number {
    this.checkTime();
    if (this.stopped) return 0;
    const pos = this.pos;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qdepth >= 8 || ply >= MAX_PLY - 1) return stand;

    const start = this.sp;
    const end = generateMoves(pos, this.moves, start, true);
    this.sp = end;
    for (let i = start; i < end; i++) this.order[i] = this.orderScore(this.moves[i], NO_MOVE, ply);

    let best = stand;
    for (let i = start; i < end; i++) {
      const m = this.pickNext(i, end);
      const victim = Math.abs(pos.board[moveTo(m)]);
      // Delta pruning: even winning this piece cannot lift the score to alpha.
      if (!movePromo(m) && stand + PIECE_VALUE[victim] + 150 < alpha) continue;
      pos.make(m);
      if (!isLegalAfterMake(pos)) {
        pos.unmake(m);
        continue;
      }
      const score = -this.quiesce(-beta, -alpha, ply + 1, qdepth + 1);
      pos.unmake(m);
      if (this.stopped) {
        this.sp = start;
        return 0;
      }
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (score >= beta) break;
      }
    }
    this.sp = start;
    return best;
  }

  /** Selection step: move the highest-ordered remaining move to index i and return it. */
  private pickNext(i: number, end: number): Move {
    let bestIdx = i;
    let bestVal = this.order[i];
    for (let j = i + 1; j < end; j++)
      if (this.order[j] > bestVal) {
        bestVal = this.order[j];
        bestIdx = j;
      }
    if (bestIdx !== i) {
      const m = this.moves[bestIdx];
      this.moves[bestIdx] = this.moves[i];
      this.moves[i] = m;
      this.order[bestIdx] = this.order[i];
      this.order[i] = bestVal;
    }
    return this.moves[i];
  }
}

function toTT(score: number, ply: number): number {
  if (score > MATE_BOUND) return score + ply;
  if (score < -MATE_BOUND) return score - ply;
  return score;
}

function fromTT(score: number, ply: number): number {
  if (score > MATE_BOUND) return score - ply;
  if (score < -MATE_BOUND) return score + ply;
  return score;
}

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: Record<Level, SearchLimits> = {
  easy: { timeMs: 700, maxDepth: 1, randomMargin: 120 },
  medium: { timeMs: 1500, maxDepth: 3 },
  hard: { timeMs: 4000, maxDepth: 32 },
};
