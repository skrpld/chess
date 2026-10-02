import SearchWorker from './worker?worker&inline';
import type { Move } from '../engine/move';
import { Position } from '../engine/position';
import { Searcher, type SearchLimits, type SearchResult } from './search';
import type { SearchResponse } from './worker';

interface Pending {
  id: number;
  moves: Move[];
  limits: SearchLimits;
  resolve: (r: SearchResult | null) => void;
}

/**
 * Runs the search in a Web Worker so the page stays responsive. If workers are unavailable
 * (blocked by the host page, very old browser), the search runs on the main thread instead.
 */
export class EngineClient {
  private worker: Worker | null = null;
  private fallback: Searcher | null = null;
  private pending: Pending | null = null;
  private nextId = 1;

  constructor() {
    this.spawn();
  }

  private spawn(): void {
    try {
      const worker = new SearchWorker();
      worker.onmessage = (e: MessageEvent<SearchResponse>) => this.finish(e.data.id, e.data.result);
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        if (this.pending) this.runOnMainThread(this.pending.id);
      };
      this.worker = worker;
    } catch {
      this.worker = null;
    }
  }

  /** Best move for the position after `moves`; resolves to null if cancelled. */
  think(moves: Move[], limits: SearchLimits): Promise<SearchResult | null> {
    this.cancel();
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending = { id, moves: moves.slice(), limits, resolve };
      if (this.worker) this.worker.postMessage({ id, moves: this.pending.moves, limits });
      else this.runOnMainThread(id);
    });
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  /** Abandon the current search (its promise resolves to null). */
  cancel(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    p.resolve(null);
    if (this.worker) {
      // A worker cannot be interrupted mid-search, so replace it.
      this.worker.terminate();
      this.spawn();
    }
  }

  private finish(id: number, result: SearchResult): void {
    const p = this.pending;
    if (!p || p.id !== id) return;
    this.pending = null;
    p.resolve(result);
  }

  private runOnMainThread(id: number): void {
    // Give the browser a moment to paint the "thinking" state before blocking.
    setTimeout(() => {
      const p = this.pending;
      if (!p || p.id !== id) return;
      this.fallback ??= new Searcher(16);
      this.finish(id, this.fallback.search(Position.fromMoves(p.moves), p.limits));
    }, 60);
  }
}
