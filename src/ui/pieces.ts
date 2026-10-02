import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '../engine/geometry';
import type { Key } from './i18n';

// U+FE0E asks for the text (not emoji) presentation of the glyph.
const VS = '︎';
/** Solid glyphs (♟♞♝♜♛♚) are used as the piece body, outlined ones (♙♘♗♖♕♔) as its contour. */
const SOLID = ['', '♟', '♞', '♝', '♜', '♛', '♚'];
const OUTLINE = ['', '♙', '♘', '♗', '♖', '♕', '♔'];

const NAMES: Record<number, [Key, Key]> = {
  [PAWN]: ['whitePawn', 'blackPawn'],
  [KNIGHT]: ['whiteKnight', 'blackKnight'],
  [BISHOP]: ['whiteBishop', 'blackBishop'],
  [ROOK]: ['whiteRook', 'blackRook'],
  [QUEEN]: ['whiteQueen', 'blackQueen'],
  [KING]: ['whiteKing', 'blackKing'],
};

/** Translation key naming a piece (board value: + white, − black). */
export function pieceNameKey(piece: number): Key {
  return NAMES[Math.abs(piece)][piece > 0 ? 0 : 1];
}

/** Markup for a piece (board value: + white, − black). */
export function pieceHtml(piece: number): string {
  if (!piece) return '';
  const t = Math.abs(piece);
  const side = piece > 0 ? 'w' : 'b';
  return `<span class="pc pc-${side}" aria-hidden="true"><span class="pc-body">${SOLID[t]}${VS}</span><span class="pc-line">${OUTLINE[t]}${VS}</span></span>`;
}
