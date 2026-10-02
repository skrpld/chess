import {
  BISHOP,
  BLACK,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  SQUARES,
  WHITE,
  colorIndex,
  square,
  type Color,
} from './geometry';
import { moveFrom, movePromo, moveTo, type Move } from './move';
import { Z_HI, Z_LO, Z_SIDE_HI, Z_SIDE_LO, zIndex } from './zobrist';

/**
 * Back-rank layout of each side, one string per board column z = A…D, files a…d.
 * White stands on rank 1 of the boards in row 1, Black mirrors it on rank 4 of row 4.
 */
export const BACK_RANK: readonly string[] = ['RNNR', 'BQKB', 'BBBB', 'RNNR'];

const LETTER_TO_TYPE: Record<string, number> = { P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };

/**
 * Mutable game position with make / unmake. Board values: 0 = empty,
 * +type = white piece, −type = black piece.
 */
export class Position {
  readonly board = new Int8Array(SQUARES);
  turn: Color = WHITE;
  /** Half-moves since the last capture or pawn move (50-move rule). */
  halfmove = 0;
  /** King squares, indexed by colorIndex. */
  readonly kings = new Int16Array(2);
  hashLo = 0;
  hashHi = 0;

  // Undo stacks, one entry per move made.
  private readonly undoCaptured: number[] = [];
  private readonly undoHalfmove: number[] = [];
  /** Hash of every earlier position, oldest first — also used for repetition detection. */
  readonly historyLo: number[] = [];
  readonly historyHi: number[] = [];

  static empty(): Position {
    return new Position();
  }

  static initial(): Position {
    const pos = new Position();
    for (let z = 0; z < 4; z++)
      for (let x = 0; x < 4; x++) {
        const type = LETTER_TO_TYPE[BACK_RANK[z][x]];
        pos.board[square(x, 0, z, 0)] = type;
        pos.board[square(x, 1, z, 1)] = PAWN;
        pos.board[square(x, 3, z, 3)] = -type;
        pos.board[square(x, 2, z, 2)] = -PAWN;
      }
    pos.refresh();
    return pos;
  }

  /** Build the position reached after playing `moves` from the initial setup (moves are trusted). */
  static fromMoves(moves: readonly Move[]): Position {
    const pos = Position.initial();
    for (const m of moves) pos.make(m);
    return pos;
  }

  /** Recompute king squares and hash after editing the board directly. */
  refresh(): void {
    this.kings[0] = -1;
    this.kings[1] = -1;
    let lo = 0;
    let hi = 0;
    for (let s = 0; s < SQUARES; s++) {
      const p = this.board[s];
      if (p === 0) continue;
      if (p === KING) this.kings[0] = s;
      else if (p === -KING) this.kings[1] = s;
      lo ^= Z_LO[zIndex(p, s)];
      hi ^= Z_HI[zIndex(p, s)];
    }
    if (this.turn === BLACK) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  get plies(): number {
    return this.historyLo.length;
  }

  kingSquare(c: Color): number {
    return this.kings[colorIndex(c)];
  }

  make(m: Move): void {
    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const b = this.board;
    const piece = b[from];
    const captured = b[to];
    const placed = promo ? promo * this.turn : piece;

    this.undoCaptured.push(captured);
    this.undoHalfmove.push(this.halfmove);
    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);

    let lo = this.hashLo ^ Z_LO[zIndex(piece, from)] ^ Z_LO[zIndex(placed, to)] ^ Z_SIDE_LO;
    let hi = this.hashHi ^ Z_HI[zIndex(piece, from)] ^ Z_HI[zIndex(placed, to)] ^ Z_SIDE_HI;
    if (captured) {
      lo ^= Z_LO[zIndex(captured, to)];
      hi ^= Z_HI[zIndex(captured, to)];
    }
    this.hashLo = lo;
    this.hashHi = hi;

    b[to] = placed;
    b[from] = 0;
    if (piece === KING) this.kings[0] = to;
    else if (piece === -KING) this.kings[1] = to;

    this.halfmove = captured || piece === PAWN || piece === -PAWN ? 0 : this.halfmove + 1;
    this.turn = -this.turn as Color;
  }

  unmake(m: Move): void {
    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const b = this.board;
    this.turn = -this.turn as Color;
    const piece = promo ? PAWN * this.turn : b[to];

    b[from] = piece;
    b[to] = this.undoCaptured.pop()!;
    if (piece === KING) this.kings[0] = from;
    else if (piece === -KING) this.kings[1] = from;

    this.halfmove = this.undoHalfmove.pop()!;
    this.hashLo = this.historyLo.pop()!;
    this.hashHi = this.historyHi.pop()!;
  }

  /** Pass the turn without moving (used by null-move pruning in the search). */
  makeNull(): void {
    this.undoCaptured.push(0);
    this.undoHalfmove.push(this.halfmove);
    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
    this.halfmove = 0;
    this.turn = -this.turn as Color;
  }

  unmakeNull(): void {
    this.turn = -this.turn as Color;
    this.undoCaptured.pop();
    this.halfmove = this.undoHalfmove.pop()!;
    this.hashLo = this.historyLo.pop()!;
    this.hashHi = this.historyHi.pop()!;
  }

  /**
   * How many earlier positions are identical to the current one. Only positions since the last
   * irreversible move with the same side to move can match.
   */
  repetitions(): number {
    let count = 0;
    const n = this.historyLo.length;
    const limit = Math.max(0, n - this.halfmove);
    for (let i = n - 2; i >= limit; i -= 2)
      if (this.historyLo[i] === this.hashLo && this.historyHi[i] === this.hashHi) count++;
    return count;
  }
}
