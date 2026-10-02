import { describe, expect, it } from 'vitest';
import {
  BISHOP,
  BISHOP_DIRS,
  BLACK,
  DIR_COUNT,
  KING,
  KNIGHT,
  KNIGHT_VEC,
  PAWN,
  QUEEN,
  QUEEN_DIRS,
  ROOK,
  ROOK_DIRS,
  WHITE,
  isDarkSquare,
  square,
} from '../src/engine/geometry';
import { Game, insufficientMaterial } from '../src/engine/game';
import { encodeMove, moveFrom, movePromo, moveTo } from '../src/engine/move';
import { attackers, generateMoves, inCheck, isAttacked, legalMoves, MAX_MOVES } from '../src/engine/movegen';
import { parseMoveText, parseSquare, squareName } from '../src/engine/notation';
import { Position } from '../src/engine/position';

/** Position with only the given pieces, `turn` to move. */
function setup(pieces: [string, number][], turn: 1 | -1 = WHITE): Position {
  const pos = Position.empty();
  for (const [sq, piece] of pieces) pos.board[parseSquare(sq)] = piece;
  pos.turn = turn;
  pos.refresh();
  return pos;
}

function movesFrom(pos: Position, sq: string): number[] {
  const from = parseSquare(sq);
  return legalMoves(pos).filter((m) => moveFrom(m) === from);
}

describe('geometry', () => {
  it('has 80 directions: 8 rook, 24 bishop, 80 queen; 48 knight jumps', () => {
    expect(DIR_COUNT).toBe(80);
    expect(ROOK_DIRS.length).toBe(8);
    expect(BISHOP_DIRS.length).toBe(24);
    expect(QUEEN_DIRS.length).toBe(80);
    expect(KNIGHT_VEC.length).toBe(48);
  });

  it('names and parses squares', () => {
    expect(squareName(0)).toBe('a1A1');
    expect(squareName(255)).toBe('d4D4');
    expect(squareName(square(1, 2, 3, 0))).toBe('b3D1');
    for (let s = 0; s < 256; s++) expect(parseSquare(squareName(s))).toBe(s);
    expect(parseSquare('e1A1')).toBe(-1);
  });

  it('colours a1A1 dark and alternates along every axis', () => {
    expect(isDarkSquare(0)).toBe(true);
    for (const s of [1, 4, 16, 64]) expect(isDarkSquare(s)).toBe(false);
  });
});

describe('piece movement on an empty board', () => {
  const corner = 'a1A1';
  const king = (sq: string) => [sq === 'd4D4' ? 'a1A1' : 'd4D4', KING] as [string, number];

  it('rook reaches 12 squares from anywhere', () => {
    for (const sq of ['a1A1', 'b2B2', 'c3A4']) {
      const pos = setup([[sq, ROOK], king(sq), ['d4A1', -KING]]);
      // the black king may block nothing on these lines
      expect(movesFrom(pos, sq).length).toBe(12);
    }
  });

  it('bishop reaches 18 squares from a corner (6 planes × 3)', () => {
    const pos = setup([[corner, BISHOP], ['d4D4', KING], ['d1D1', -KING]]);
    expect(movesFrom(pos, corner).length).toBe(18);
  });

  it('queen reaches 45 squares from a corner (15 lines × 3)', () => {
    const pos = setup([[corner, QUEEN], ['a2D4', KING], ['d1D1', -KING]]);
    expect(movesFrom(pos, corner).length).toBe(45);
  });

  it('knight has 12 jumps from a corner', () => {
    const pos = setup([[corner, KNIGHT], ['d4D4', KING], ['d1D1', -KING]]);
    expect(movesFrom(pos, corner).length).toBe(12);
  });

  it('king has 15 moves in a corner and 80 neighbours in the middle', () => {
    expect(movesFrom(setup([[corner, KING], ['d4D4', -KING]]), corner).length).toBe(15);
    // c3C3 touches both kings, so one of the 80 neighbours is off limits
    expect(movesFrom(setup([['b2B2', KING], ['d4D4', -KING]]), 'b2B2').length).toBe(79);
  });
});

describe('pawns', () => {
  it('push forward along rank (y) or board row (w), never sideways', () => {
    const pos = setup([['b2B2', PAWN], ['a1A1', KING], ['d4D4', -KING]]);
    const targets = movesFrom(pos, 'b2B2').map((m) => squareName(moveTo(m))).sort();
    expect(targets).toEqual(['b2B3', 'b3B2']);
  });

  it('capture one step forward plus one step along x or z', () => {
    const enemies: [string, number][] = ['a3B2', 'c3B2', 'b3A2', 'b3C2', 'a2B3', 'c2B3', 'b2A3', 'b2C3'].map((s) => [s, -KNIGHT]);
    // the y+w diagonal and a pure sideways step are not captures
    const decoys: [string, number][] = [['b3B3', -KNIGHT], ['a2B2', -KNIGHT]];
    const pos = setup([['b2B2', PAWN], ['a1A1', KING], ['d4D4', -KING], ...enemies, ...decoys]);
    const caps = movesFrom(pos, 'b2B2').filter((m) => pos.board[moveTo(m)] !== 0);
    expect(caps.map((m) => squareName(moveTo(m))).sort()).toEqual(enemies.map(([s]) => s).sort());
  });

  it('black pawns move towards rank 1 and row 1', () => {
    const pos = setup([['b3B3', -PAWN], ['a1A1', KING], ['d4D4', -KING]], BLACK);
    expect(movesFrom(pos, 'b3B3').map((m) => squareName(moveTo(m))).sort()).toEqual(['b2B3', 'b3B2']);
  });

  it('promote only on rank 4 of row 4 (white), choosing Q, N, R or B', () => {
    const pos = setup([['b3A4', PAWN], ['b4A3', PAWN], ['d1D1', KING], ['a1D2', -KING]]);
    const promos = movesFrom(pos, 'b3A4');
    expect(promos.length).toBe(4);
    expect(promos.map(movePromo).sort()).toEqual([KNIGHT, BISHOP, ROOK, QUEEN].sort());
    const fromRank4 = movesFrom(pos, 'b4A3');
    expect(fromRank4.length).toBe(4);
    expect(fromRank4.every((m) => squareName(moveTo(m)) === 'b4A4' && movePromo(m) !== 0)).toBe(true);
  });
});

describe('initial position', () => {
  const pos = Position.initial();

  it('has 32 pieces per side, mirrored', () => {
    let white = 0;
    let black = 0;
    for (let s = 0; s < 256; s++) {
      if (pos.board[s] > 0) white++;
      if (pos.board[s] < 0) black++;
    }
    expect([white, black]).toEqual([32, 32]);
    expect(pos.board[parseSquare('c1B1')]).toBe(KING);
    expect(pos.board[parseSquare('c4B4')]).toBe(-KING);
    expect(pos.board[parseSquare('b1B1')]).toBe(QUEEN);
  });

  it('offers 222 legal moves and no captures to either side', () => {
    const moves = legalMoves(pos);
    expect(moves.length).toBe(222);
    expect(moves.some((m) => pos.board[moveTo(m)] !== 0)).toBe(false);
    pos.makeNull();
    const black = legalMoves(pos);
    pos.unmakeNull();
    expect(black.length).toBe(222);
    expect(black.some((m) => pos.board[moveTo(m)] !== 0)).toBe(false);
  });
});

describe('check, mate and draws', () => {
  it('detects attacks along all line types and by knights', () => {
    const k = parseSquare('a1A1');
    expect(isAttacked(setup([['a1A4', -ROOK]]).board, k, BLACK)).toBe(true);
    expect(isAttacked(setup([['a3A3', -BISHOP]]).board, k, BLACK)).toBe(true);
    expect(isAttacked(setup([['a3A3', -ROOK]]).board, k, BLACK)).toBe(false);
    expect(isAttacked(setup([['c3C3', -QUEEN]]).board, k, BLACK)).toBe(true);
    expect(isAttacked(setup([['c3C3', -QUEEN], ['b2B2', PAWN]]).board, k, BLACK)).toBe(false);
    expect(isAttacked(setup([['a3A2', -KNIGHT]]).board, k, BLACK)).toBe(true);
    expect(isAttacked(setup([['b2A1', -PAWN]]).board, k, BLACK)).toBe(true);
    expect(isAttacked(setup([['a2B1', -PAWN]]).board, k, BLACK)).toBe(true);
    // a pawn never captures along the y–w diagonal
    expect(isAttacked(setup([['a2A2', -PAWN]]).board, k, BLACK)).toBe(false);
  });

  it('pinned pieces cannot expose their king', () => {
    const pos = setup([['a1A1', KING], ['a1A2', ROOK], ['a1A4', -ROOK], ['d4D4', -KING]]);
    const moves = movesFrom(pos, 'a1A2');
    expect(moves.every((m) => squareName(moveTo(m)).startsWith('a1A'))).toBe(true);
    expect(moves.length).toBe(2);
  });

  it('recognises checkmate', () => {
    const pos = setup([['a1A1', -KING], ['b2B2', QUEEN], ['c3C3', KING]], BLACK);
    expect(inCheck(pos)).toBe(true);
    expect(legalMoves(pos).length).toBe(0);
  });

  it('recognises stalemate', () => {
    const pos = setup([['a1A1', -KING], ['c2A1', QUEEN], ['a3B1', ROOK], ['a1A3', KING]], BLACK);
    expect(inCheck(pos)).toBe(false);
    expect(legalMoves(pos).length).toBe(0);
  });

  it('declares a draw on threefold repetition', () => {
    const game = new Game();
    const shuffle = ['Nb1A1-b3A2', 'Nb4A4-b2A3', 'Nb3A2-b1A1', 'Nb2A3-b4A4'];
    for (let i = 0; i < 8; i++) {
      const m = parseMoveText(game.pos, shuffle[i % 4]);
      expect(m, shuffle[i % 4]).not.toBeNull();
      game.play(m!);
    }
    expect(game.outcome).toEqual({ kind: 'draw', reason: 'repetition' });
    expect(game.resultTag()).toBe('1/2-1/2');
  });

  it('knows insufficient material', () => {
    expect(insufficientMaterial(setup([['a1A1', KING], ['d4D4', -KING]]).board)).toBe(true);
    expect(insufficientMaterial(setup([['a1A1', KING], ['b1A1', KNIGHT], ['d4D4', -KING]]).board)).toBe(true);
    expect(insufficientMaterial(setup([['a1A1', KING], ['b1A2', BISHOP], ['c1A1', -BISHOP], ['d4D4', -KING]]).board)).toBe(true);
    expect(insufficientMaterial(setup([['a1A1', KING], ['b1A1', BISHOP], ['c1A1', -BISHOP], ['d4D4', -KING]]).board)).toBe(false);
    expect(insufficientMaterial(setup([['a1A1', KING], ['b1A1', PAWN], ['d4D4', -KING]]).board)).toBe(false);
  });

  it('resignation and agreed draws end the game', () => {
    const g1 = new Game();
    g1.resign(WHITE);
    expect(g1.outcome).toEqual({ kind: 'resignation', winner: BLACK });
    expect(g1.play(g1.legal()[0] ?? 0)).toBe(false);
    const g2 = new Game();
    g2.agreeDraw();
    expect(g2.resultTag()).toBe('1/2-1/2');
  });
});

describe('make / unmake and hashing', () => {
  it('restore the position exactly and keep the incremental hash correct over random games', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let g = 0; g < 6; g++) {
      const game = new Game();
      for (let ply = 0; ply < 120 && !game.isOver; ply++) {
        const moves = game.legal();
        const before = game.pos.board.slice();
        const [lo, hi] = [game.pos.hashLo, game.pos.hashHi];
        for (const m of moves.slice(0, 30)) {
          game.pos.make(m);
          game.pos.unmake(m);
        }
        expect(game.pos.board).toEqual(before);
        expect([game.pos.hashLo, game.pos.hashHi]).toEqual([lo, hi]);
        game.play(moves[Math.floor(rnd() * moves.length)]);
        const fresh = Position.empty();
        fresh.board.set(game.pos.board);
        fresh.turn = game.pos.turn;
        fresh.refresh();
        expect([fresh.hashLo, fresh.hashHi]).toEqual([game.pos.hashLo, game.pos.hashHi]);
        expect(inCheck(game.pos, -game.pos.turn as 1 | -1)).toBe(false);
      }
    }
  });

  it('never generates more than MAX_MOVES and only legal moves are kept', () => {
    const pos = Position.initial();
    const buf = new Int32Array(MAX_MOVES);
    expect(generateMoves(pos, buf)).toBeLessThan(MAX_MOVES);
    expect(legalMoves(pos)).toContain(encodeMove(parseSquare('a2A2'), parseSquare('a3A2')));
  });
});

describe('game record', () => {
  it('round-trips through text', () => {
    const game = new Game();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40 && !game.isOver; i++) {
      const moves = game.legal();
      game.play(moves[Math.floor(rnd() * moves.length)]);
    }
    const parsed = Game.fromRecord(game.record());
    expect('game' in parsed).toBe(true);
    if ('game' in parsed) expect(parsed.game.moves).toEqual(game.moves);
  });

  it('reports the first illegal move', () => {
    const parsed = Game.fromRecord('1. a2A2-a3A2 a3C3-a2C3 2. a3A2-a1A2');
    expect(parsed).toEqual({ error: { ply: 2, token: 'a3A2-a1A2' } });
  });

  it('writes checks and mates', () => {
    const game = new Game();
    expect(game.notation).toEqual([]);
    const m = parseMoveText(game.pos, 'Nb1A1-b3A2');
    expect(m).not.toBeNull();
    game.play(m!);
    expect(game.notation[0]).toBe('Nb1A1-b3A2');
  });
});

describe('attackers', () => {
  it('lists every attacker of a square', () => {
    const pos = setup([['a1A1', KING], ['a1A4', -ROOK], ['a3A3', -BISHOP], ['a3A2', -KNIGHT], ['b2A1', -PAWN], ['d4D4', -KING]]);
    const list = attackers(pos.board, parseSquare('a1A1'), BLACK).map(squareName).sort();
    expect(list).toEqual(['a1A4', 'a3A2', 'a3A3', 'b2A1'].sort());
  });
});
