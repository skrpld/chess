/**
 * A move is packed into one integer: from (bits 0–7) | to (bits 8–15) | promotion piece type (bits 16–18).
 * Plain numbers keep the search allocation-free and make moves trivial to send to the worker.
 */

export type Move = number;

export const encodeMove = (from: number, to: number, promo = 0): Move => from | (to << 8) | (promo << 16);
export const moveFrom = (m: Move): number => m & 255;
export const moveTo = (m: Move): number => (m >> 8) & 255;
export const movePromo = (m: Move): number => (m >> 16) & 7;

export const NO_MOVE: Move = 0;
