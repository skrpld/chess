import { KING, KNIGHT, BISHOP, ROOK, QUEEN, square, sqW, sqX, sqY, sqZ } from './geometry';
import { encodeMove, moveFrom, movePromo, moveTo, type Move } from './move';
import { hasLegalMove, inCheck, legalMoves } from './movegen';
import type { Position } from './position';

/**
 * Square names: file a–d, rank 1–4, board column A–D, board row 1–4 — e.g. "b2C3"
 * is square b2 on the board in column C, row 3.
 */
export const FILES = 'abcd';
export const COLUMNS = 'ABCD';

export function squareName(s: number): string {
  return `${FILES[sqX(s)]}${sqY(s) + 1}${COLUMNS[sqZ(s)]}${sqW(s) + 1}`;
}

/** Board label of a square, e.g. "C3". */
export function boardName(s: number): string {
  return `${COLUMNS[sqZ(s)]}${sqW(s) + 1}`;
}

export function parseSquare(text: string): number {
  const m = /^([a-d])([1-4])([A-D])([1-4])$/.exec(text);
  if (!m) return -1;
  return square(FILES.indexOf(m[1]), +m[2] - 1, COLUMNS.indexOf(m[3]), +m[4] - 1);
}

export const PIECE_LETTERS = ['', '', 'N', 'B', 'R', 'Q', 'K'];
const LETTER_TYPES: Record<string, number> = { N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };

/**
 * Long algebraic notation for a legal move in `pos` (before it is played):
 * piece letter (none for pawns), origin, "-" or "x", destination, "=Q" on promotion, "+" / "#".
 */
export function moveToText(pos: Position, m: Move): string {
  const from = moveFrom(m);
  const to = moveTo(m);
  const promo = movePromo(m);
  const piece = Math.abs(pos.board[from]);
  const capture = pos.board[to] !== 0;
  let text = `${PIECE_LETTERS[piece]}${squareName(from)}${capture ? 'x' : '-'}${squareName(to)}`;
  if (promo) text += `=${PIECE_LETTERS[promo]}`;
  pos.make(m);
  if (inCheck(pos)) text += hasLegalMove(pos) ? '+' : '#';
  pos.unmake(m);
  return text;
}

/** Find the legal move in `pos` written as `text` (long notation as produced by moveToText). */
export function parseMoveText(pos: Position, text: string): Move | null {
  const m = /^([NBRQK]?)([a-d][1-4][A-D][1-4])[-x:]?([a-d][1-4][A-D][1-4])(?:=?([NBRQ]))?[+#!?]*$/.exec(text.trim());
  if (!m) return null;
  const from = parseSquare(m[2]);
  const to = parseSquare(m[3]);
  const promo = m[4] ? LETTER_TYPES[m[4]] : 0;
  if (m[1] && Math.abs(pos.board[from]) !== LETTER_TYPES[m[1]]) return null;
  const legal = legalMoves(pos);
  const exact = encodeMove(from, to, promo);
  if (legal.includes(exact)) return exact;
  // A promotion written without its piece defaults to a queen.
  if (!promo && legal.includes(encodeMove(from, to, QUEEN))) return encodeMove(from, to, QUEEN);
  return null;
}
