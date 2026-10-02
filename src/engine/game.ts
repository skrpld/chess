import { BISHOP, KING, KNIGHT, SQUARES, WHITE, isDarkSquare, type Color } from './geometry';
import { moveTo, type Move } from './move';
import { inCheck, legalMoves } from './movegen';
import { moveToText, parseMoveText } from './notation';
import { Position } from './position';

export type DrawReason = 'stalemate' | 'repetition' | 'fifty-moves' | 'insufficient-material' | 'agreement';

export type Outcome =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'resignation'; winner: Color }
  | { kind: 'draw'; reason: DrawReason };

const ONGOING: Outcome = { kind: 'ongoing' };

/** Neither side can possibly checkmate: bare kings, a single minor piece, or only same-coloured bishops. */
export function insufficientMaterial(board: Int8Array): boolean {
  let knights = 0;
  let bishops = 0;
  let darkBishops = 0;
  for (let s = 0; s < SQUARES; s++) {
    const t = Math.abs(board[s]);
    if (t === 0 || t === KING) continue;
    if (t === KNIGHT) knights++;
    else if (t === BISHOP) {
      bishops++;
      if (isDarkSquare(s)) darkBishops++;
    } else return false;
  }
  if (knights + bishops <= 1) return true;
  return knights === 0 && (darkBishops === 0 || darkBishops === bishops);
}

/** A game: the position plus its move list, notation and outcome. */
export class Game {
  readonly pos: Position = Position.initial();
  readonly moves: Move[] = [];
  readonly notation: string[] = [];
  /** Piece captured by each move (signed board value, 0 when nothing was captured). */
  readonly captures: number[] = [];
  outcome: Outcome = ONGOING;
  private legalCache: Move[] | null = null;

  static fromMoves(moves: readonly Move[]): Game {
    const game = new Game();
    for (const m of moves) if (!game.play(m)) break;
    return game;
  }

  get turn(): Color {
    return this.pos.turn;
  }

  get isOver(): boolean {
    return this.outcome.kind !== 'ongoing';
  }

  legal(): Move[] {
    if (!this.legalCache) this.legalCache = this.isOver ? [] : legalMoves(this.pos);
    return this.legalCache;
  }

  inCheck(): boolean {
    return inCheck(this.pos);
  }

  /** Play a move if it is legal and the game is still on. Returns whether the move was played. */
  play(m: Move): boolean {
    if (this.isOver || !this.legal().includes(m)) return false;
    this.notation.push(moveToText(this.pos, m));
    this.captures.push(this.pos.board[moveTo(m)]);
    this.pos.make(m);
    this.moves.push(m);
    this.legalCache = null;
    this.outcome = this.detectOutcome();
    return true;
  }

  /** Take back the last move (also reopens a finished game). */
  undo(): Move | undefined {
    const m = this.moves.pop();
    if (m === undefined) return undefined;
    this.pos.unmake(m);
    this.notation.pop();
    this.captures.pop();
    this.legalCache = null;
    this.outcome = ONGOING;
    return m;
  }

  resign(loser: Color): void {
    if (!this.isOver) this.outcome = { kind: 'resignation', winner: -loser as Color };
  }

  agreeDraw(): void {
    if (!this.isOver) this.outcome = { kind: 'draw', reason: 'agreement' };
  }

  private detectOutcome(): Outcome {
    if (this.legal().length === 0) {
      return this.inCheck() ? { kind: 'checkmate', winner: -this.pos.turn as Color } : { kind: 'draw', reason: 'stalemate' };
    }
    if (insufficientMaterial(this.pos.board)) return { kind: 'draw', reason: 'insufficient-material' };
    if (this.pos.repetitions() >= 2) return { kind: 'draw', reason: 'repetition' };
    if (this.pos.halfmove >= 100) return { kind: 'draw', reason: 'fifty-moves' };
    return ONGOING;
  }

  /** Standard result tag: "1-0", "0-1", "1/2-1/2" or "*". */
  resultTag(): string {
    const o = this.outcome;
    if (o.kind === 'ongoing') return '*';
    if (o.kind === 'draw') return '1/2-1/2';
    return o.winner === WHITE ? '1-0' : '0-1';
  }

  /** Position after the first `ply` moves. */
  positionAt(ply: number): Position {
    return Position.fromMoves(this.moves.slice(0, ply));
  }

  /** Text record of the game: a header and numbered moves in long notation. */
  record(): string {
    const lines = ['[Variant "4D Chess 4x4x4x4"]', `[Result "${this.resultTag()}"]`, ''];
    for (let i = 0; i < this.notation.length; i += 2) {
      const black = this.notation[i + 1] ? ` ${this.notation[i + 1]}` : '';
      lines.push(`${i / 2 + 1}. ${this.notation[i]}${black}`);
    }
    if (this.isOver) lines.push(this.resultTag());
    return lines.join('\n');
  }

  /**
   * Rebuild a game from a text record. Headers in [brackets], {comments}, move numbers and
   * result tags are ignored. On an illegal or unreadable move, returns its index and text.
   */
  static fromRecord(text: string): { game: Game } | { error: { ply: number; token: string } } {
    const body = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
    const tokens = body
      .split(/\s+/)
      .map((t) => t.replace(/^\d+\.+/, ''))
      .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
    const game = new Game();
    for (const token of tokens) {
      const m = game.isOver ? null : parseMoveText(game.pos, token);
      if (m === null || !game.play(m)) return { error: { ply: game.moves.length, token } };
    }
    return { game };
  }
}
