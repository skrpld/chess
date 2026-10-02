import { Position } from '../engine/position';
import type { Move } from '../engine/move';
import { Searcher, type SearchLimits, type SearchResult } from './search';

export interface SearchRequest {
  id: number;
  moves: Move[];
  limits: SearchLimits;
}

export interface SearchResponse {
  id: number;
  result: SearchResult;
}

// One searcher per worker keeps its transposition table warm between moves.
const searcher = new Searcher();

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SearchRequest>) => void) | null;
  postMessage(data: SearchResponse): void;
};

ctx.onmessage = (e) => {
  const { id, moves, limits } = e.data;
  ctx.postMessage({ id, result: searcher.search(Position.fromMoves(moves), limits) });
};
