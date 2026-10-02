import { describe, expect, it } from 'vitest';
import { BLACK, KING, QUEEN, ROOK, WHITE } from '../src/engine/geometry';
import { legalMoves, inCheck } from '../src/engine/movegen';
import { moveTo } from '../src/engine/move';
import { parseSquare, squareName } from '../src/engine/notation';
import { Position } from '../src/engine/position';
import { evaluate } from '../src/ai/evaluate';
import { LEVELS, MATE_BOUND, Searcher } from '../src/ai/search';

function setup(pieces: [string, number][], turn: 1 | -1 = WHITE): Position {
  const pos = Position.empty();
  for (const [sq, piece] of pieces) pos.board[parseSquare(sq)] = piece;
  pos.turn = turn;
  pos.refresh();
  return pos;
}

describe('evaluation', () => {
  it('is symmetric in the initial position', () => {
    const pos = Position.initial();
    const white = evaluate(pos);
    pos.makeNull();
    expect(evaluate(pos)).toBe(white);
  });
});

describe('search', () => {
  it('finds a mate in one', () => {
    const pos = setup([['a1A1', -KING], ['c3C3', KING], ['b2B4', QUEEN]]);
    const res = new Searcher(14).search(pos, { timeMs: 2000, maxDepth: 4 });
    expect(res.score).toBeGreaterThan(MATE_BOUND);
    pos.make(res.move);
    expect(inCheck(pos)).toBe(true);
    expect(legalMoves(pos).length).toBe(0);
  });

  it('wins a hanging queen', () => {
    const pos = setup([['a1A1', KING], ['d4D4', -KING], ['a1D1', ROOK], ['a4D1', -QUEEN]]);
    const res = new Searcher(14).search(pos, { timeMs: 2000, maxDepth: 3 });
    expect(squareName(moveTo(res.move))).toBe('a4D1');
  });

  it('plays black too: grabs an undefended rook', () => {
    const pos = setup([['a1A1', KING], ['a1D1', ROOK], ['d4D4', -KING], ['a4D1', -QUEEN]], BLACK);
    const res = new Searcher(14).search(pos, { timeMs: 2000, maxDepth: 3 });
    expect(squareName(moveTo(res.move))).toBe('a1D1');
  });

  it('returns a legal move from the initial position within its time budget', () => {
    for (const level of ['easy', 'medium'] as const) {
      const pos = Position.initial();
      const limits = LEVELS[level];
      const t0 = performance.now();
      const res = new Searcher().search(pos, limits);
      const elapsed = performance.now() - t0;
      expect(legalMoves(pos)).toContain(res.move);
      expect(elapsed).toBeLessThan(limits.timeMs * 2 + 500);
    }
  }, 15_000);
});
