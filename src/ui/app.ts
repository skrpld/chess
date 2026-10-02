import { EngineClient } from '../ai/engine-client';
import { PIECE_VALUE } from '../ai/evaluate';
import { LEVELS, MATE, MATE_BOUND, type Level, type SearchResult } from '../ai/search';
import { Game, type Outcome } from '../engine/game';
import {
  BISHOP,
  BLACK,
  KING,
  KNIGHT,
  LINE_DIR,
  QUEEN,
  RAY,
  ROOK,
  SQUARES,
  WHITE,
  type Color,
} from '../engine/geometry';
import { moveFrom, movePromo, moveTo, type Move } from '../engine/move';
import { attackers, inCheck, isAttacked } from '../engine/movegen';
import { squareName } from '../engine/notation';
import type { Position } from '../engine/position';
import { BoardView } from './board-view';
import { applyStaticText, detectLang, setLang, t, type Lang } from './i18n';
import { pieceHtml, pieceNameKey } from './pieces';
import { load, save } from './storage';

type Mode = 'ai' | 'local';

interface Settings {
  mode: Mode;
  /** The human's colour when playing the computer. */
  human: Color;
  level: Level;
  flipped: boolean;
  hints: boolean;
  coords: boolean;
  zoom: number;
  lang: Lang;
}

interface SavedGame {
  moves: Move[];
  /** Endings that cannot be replayed from the moves alone. */
  ending?: Outcome;
}

const ZOOMS = [1, 1.5, 2, 2.5];
const DRAW_ACCEPT_THRESHOLD = -150;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class App {
  private game = new Game();
  private readonly settings: Settings;
  private readonly view: BoardView;
  private readonly engine = new EngineClient();

  private selected = -1;
  private targets = new Map<number, Move[]>();
  /** Ply shown on the board when browsing the game; null = the live position. */
  private viewPly: number | null = null;
  private hover = -1;
  private thinking = false;
  /** The computer's last search, from its own point of view. */
  private lastSearch: SearchResult | null = null;
  private toastTimer = 0;

  constructor() {
    const defaults: Settings = {
      mode: 'ai',
      human: WHITE,
      level: 'medium',
      flipped: false,
      hints: true,
      coords: true,
      zoom: 1,
      lang: detectLang(),
    };
    this.settings = { ...defaults, ...(load<Partial<Settings>>('settings') ?? {}) };
    if (!ZOOMS.includes(this.settings.zoom)) this.settings.zoom = 1;

    const saved = load<SavedGame>('game');
    if (saved && Array.isArray(saved.moves)) {
      this.game = Game.fromMoves(saved.moves);
      if (saved.ending?.kind === 'resignation') this.game.resign(-saved.ending.winner as Color);
      else if (saved.ending?.kind === 'draw' && saved.ending.reason === 'agreement') this.game.agreeDraw();
    }

    setLang(this.settings.lang);
    applyStaticText();

    this.view = new BoardView($('hyper'), {
      onSquare: (s) => this.onSquare(s),
      onHover: (s) => this.onHover(s),
    });
    this.view.build(this.settings.flipped);

    this.bindControls();
    this.applyOptions();
    this.render();
    this.maybeComputerMove();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindControls(): void {
    $('btn-new').addEventListener('click', () => this.openNewGame());
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-flip').addEventListener('click', () => {
      this.settings.flipped = !this.settings.flipped;
      this.persistSettings();
      this.view.build(this.settings.flipped);
      this.render();
    });
    $('btn-resign').addEventListener('click', () => this.resign());
    $('btn-draw').addEventListener('click', () => this.offerDraw());
    $('btn-rules').addEventListener('click', () => $<HTMLDialogElement>('dlg-rules').showModal());
    $('btn-record').addEventListener('click', () => this.openRecord());
    $('btn-live').addEventListener('click', () => this.setViewPly(null));

    $('nav-first').addEventListener('click', () => this.setViewPly(0));
    $('nav-prev').addEventListener('click', () => this.step(-1));
    $('nav-next').addEventListener('click', () => this.step(1));
    $('nav-last').addEventListener('click', () => this.setViewPly(null));

    $('btn-zoom-in').addEventListener('click', () => this.zoom(1));
    $('btn-zoom-out').addEventListener('click', () => this.zoom(-1));

    const hints = $<HTMLInputElement>('opt-hints');
    hints.addEventListener('change', () => {
      this.settings.hints = hints.checked;
      this.persistSettings();
      this.render();
    });
    const coords = $<HTMLInputElement>('opt-coords');
    coords.addEventListener('change', () => {
      this.settings.coords = coords.checked;
      this.persistSettings();
      this.applyOptions();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.settings.lang = btn.dataset.lang as Lang;
        this.persistSettings();
        setLang(this.settings.lang);
        applyStaticText();
        this.applyOptions();
        this.render();
      }),
    );

    $('sheet').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ply]');
      if (btn) this.setViewPly(Number(btn.dataset.ply));
    });

    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        this.step(-1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        this.step(1);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.clearSelection();
        this.render();
      }
    });

    $('btn-copy').addEventListener('click', () => this.copyRecord());
    $('btn-load').addEventListener('click', () => this.loadRecord());
  }

  private onSquare(s: number): void {
    if (this.viewPly !== null) {
      this.setViewPly(null);
      return;
    }
    if (!this.humanCanMove()) return;

    const moves = this.targets.get(s);
    if (this.selected >= 0 && moves) {
      void this.playHumanMove(moves);
      return;
    }
    const piece = this.game.pos.board[s];
    if (s !== this.selected && piece * this.game.turn > 0) this.select(s);
    else this.clearSelection();
    this.render();
  }

  private onHover(s: number): void {
    if (s === this.hover) return;
    this.hover = s;
    const { ply, live, pos } = this.shown();
    this.renderBoard(pos, ply, live);
  }

  private select(s: number): void {
    this.selected = s;
    this.targets = new Map();
    for (const m of this.game.legal()) {
      if (moveFrom(m) !== s) continue;
      const to = moveTo(m);
      const list = this.targets.get(to);
      if (list) list.push(m);
      else this.targets.set(to, [m]);
    }
  }

  private clearSelection(): void {
    this.selected = -1;
    this.targets = new Map();
  }

  private async playHumanMove(moves: Move[]): Promise<void> {
    let move = moves[0];
    if (moves.length > 1) {
      const promo = await this.choosePromotion(this.game.turn);
      if (!promo) return;
      move = moves.find((m) => movePromo(m) === promo) ?? move;
    }
    this.applyMove(move);
  }

  private humanCanMove(): boolean {
    return (
      !this.game.isOver &&
      !this.thinking &&
      this.viewPly === null &&
      (this.settings.mode === 'local' || this.game.turn === this.settings.human)
    );
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------

  private applyMove(m: Move): void {
    if (!this.game.play(m)) return;
    this.clearSelection();
    this.viewPly = null;
    this.persistGame();
    this.render();
    this.view.pulse(moveTo(m));
    if (this.game.isOver) this.showResult();
    else this.maybeComputerMove();
  }

  private maybeComputerMove(): void {
    if (this.settings.mode !== 'ai' || this.game.isOver || this.game.turn === this.settings.human || this.thinking) return;
    this.thinking = true;
    this.render();
    const ply = this.game.moves.length;
    void this.engine.think(this.game.moves, LEVELS[this.settings.level]).then((res) => {
      if (!res || this.game.moves.length !== ply || !this.thinking) return;
      this.thinking = false;
      this.lastSearch = res;
      if (res.move) this.applyMove(res.move);
      else this.render();
    });
  }

  private stopThinking(): void {
    this.engine.cancel();
    this.thinking = false;
  }

  private undo(): void {
    this.stopThinking();
    this.viewPly = null;
    this.clearSelection();
    if (this.settings.mode === 'local') {
      this.game.undo();
    } else {
      // Take back the human's last move together with the computer's reply.
      const parity = this.settings.human === WHITE ? 0 : 1;
      let last = this.game.moves.length - 1;
      while (last >= 0 && last % 2 !== parity) last--;
      if (last >= 0) while (this.game.moves.length > last) this.game.undo();
    }
    this.lastSearch = null;
    this.persistGame();
    this.render();
    this.maybeComputerMove();
  }

  private async resign(): Promise<void> {
    if (this.game.isOver) return;
    if (!(await this.confirm(t('confirmResign')))) return;
    this.stopThinking();
    this.game.resign(this.settings.mode === 'ai' ? this.settings.human : this.game.turn);
    this.persistGame();
    this.render();
    this.showResult();
  }

  private async offerDraw(): Promise<void> {
    if (this.game.isOver || this.thinking) return;
    if (this.settings.mode === 'local') {
      if (!(await this.confirm(t('confirmDraw')))) return;
    } else if (!this.lastSearch || this.lastSearch.score > DRAW_ACCEPT_THRESHOLD) {
      this.toast(t('drawDeclined'));
      return;
    }
    this.game.agreeDraw();
    this.persistGame();
    this.render();
    this.showResult();
  }

  private openNewGame(): void {
    const dlg = $<HTMLDialogElement>('dlg-new');
    const s = this.settings;
    $<HTMLInputElement>(`mode-${s.mode}`).checked = true;
    $<HTMLInputElement>(`color-${s.human === WHITE ? 'white' : 'black'}`).checked = true;
    $<HTMLInputElement>(`level-${s.level}`).checked = true;
    const form = dlg.querySelector('form')!;
    const syncMode = () => {
      const ai = $<HTMLInputElement>('mode-ai').checked;
      $<HTMLFieldSetElement>('fs-color').disabled = !ai;
      $<HTMLFieldSetElement>('fs-level').disabled = !ai;
    };
    form.onchange = syncMode;
    syncMode();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'start') return;
      const data = new FormData(form);
      const mode = data.get('mode') as Mode;
      const color = data.get('color') as string;
      const human: Color = color === 'black' ? BLACK : color === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : WHITE;
      this.startGame(mode, human, (data.get('level') as Level) ?? 'medium');
    };
    dlg.returnValue = '';
    dlg.showModal();
  }

  private startGame(mode: Mode, human: Color, level: Level): void {
    this.stopThinking();
    Object.assign(this.settings, { mode, human, level, flipped: mode === 'ai' && human === BLACK });
    this.persistSettings();
    this.game = new Game();
    this.lastSearch = null;
    this.viewPly = null;
    this.clearSelection();
    this.persistGame();
    this.view.build(this.settings.flipped);
    this.render();
    this.maybeComputerMove();
  }

  private setViewPly(ply: number | null): void {
    const total = this.game.moves.length;
    this.viewPly = ply === null || ply >= total ? null : Math.max(0, ply);
    this.clearSelection();
    this.render();
  }

  private step(delta: number): void {
    const current = this.viewPly ?? this.game.moves.length;
    this.setViewPly(current + delta);
  }

  private zoom(dir: number): void {
    const i = ZOOMS.indexOf(this.settings.zoom);
    this.settings.zoom = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    this.persistSettings();
    this.applyOptions();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private applyOptions(): void {
    const s = this.settings;
    $<HTMLInputElement>('opt-hints').checked = s.hints;
    $<HTMLInputElement>('opt-coords').checked = s.coords;
    $('hyper').classList.toggle('no-coords', !s.coords);
    $('hyper').style.setProperty('--zoom', String(s.zoom));
    $<HTMLButtonElement>('btn-zoom-out').disabled = s.zoom === ZOOMS[0];
    $<HTMLButtonElement>('btn-zoom-in').disabled = s.zoom === ZOOMS[ZOOMS.length - 1];
    document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === s.lang)));
    document.title = t('title');
  }

  /** Ply on the board and the position there. */
  private shown(): { ply: number; live: boolean; pos: Position } {
    const live = this.viewPly === null;
    const ply = this.viewPly ?? this.game.moves.length;
    return { ply, live, pos: live ? this.game.pos : this.game.positionAt(ply) };
  }

  private render(): void {
    const game = this.game;
    const { ply, live, pos } = this.shown();
    this.renderBoard(pos, ply, live);
    this.renderStatus(pos, inCheck(pos), live, ply);
    this.renderSheet(ply);
    this.renderCaptures(ply);

    const humanMoves =
      this.settings.mode === 'local' ? game.moves.length : game.moves.filter((_, i) => i % 2 === (this.settings.human === WHITE ? 0 : 1)).length;
    $<HTMLButtonElement>('btn-undo').disabled = humanMoves === 0;
    $<HTMLButtonElement>('btn-resign').disabled = game.isOver;
    $<HTMLButtonElement>('btn-draw').disabled = game.isOver || this.thinking;
    $<HTMLButtonElement>('nav-first').disabled = ply === 0;
    $<HTMLButtonElement>('nav-prev').disabled = ply === 0;
    $<HTMLButtonElement>('nav-next').disabled = live;
    $<HTMLButtonElement>('nav-last').disabled = live;
  }

  private renderBoard(pos: Position, ply: number, live: boolean): void {
    const game = this.game;
    const lastMove = ply > 0 ? game.moves[ply - 1] : -1;
    const humanTurn = live && this.humanCanMove();
    const hoverTarget = live && this.targets.has(this.hover) ? this.hover : -1;

    this.view.render({
      board: pos.board,
      selected: live ? this.selected : -1,
      targets: live ? new Set(this.targets.keys()) : new Set(),
      lastFrom: lastMove >= 0 ? moveFrom(lastMove) : -1,
      lastTo: lastMove >= 0 ? moveTo(lastMove) : -1,
      check: inCheck(pos) ? pos.kingSquare(pos.turn) : -1,
      threats: humanTurn && this.settings.hints ? threatenedPieces(pos.board, pos.turn) : new Set(),
      path: hoverTarget >= 0 ? new Set(pathBetween(this.selected, hoverTarget)) : new Set(),
      hoverTarget,
      movable: humanTurn ? new Set(game.legal().map(moveFrom)) : new Set(),
      describe: (s, piece) => `${squareName(s)}, ${describePiece(piece)}`,
    });
    this.renderReadout(pos);
  }

  private renderStatus(pos: Position, checked: boolean, live: boolean, ply: number): void {
    const game = this.game;
    const chip = $('turn-chip');
    const text = $('status-text');
    const sub = $('status-sub');
    sub.className = 'status-sub';
    $('spinner').hidden = !(this.thinking && live);
    $('btn-live').hidden = live;
    chip.className = `turn-chip ${pos.turn === WHITE ? 'is-white' : 'is-black'}`;

    const s = this.settings;
    $('status-mode').textContent = s.mode === 'ai' ? t('vsComputer', { level: t(s.level) }) : t('vsHuman');

    if (!live) {
      text.textContent = ply === 0 ? t('viewingStart') : t('viewing', { n: `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${game.notation[ply - 1]}` });
      sub.textContent = '';
      return;
    }
    if (game.isOver) {
      const { title, detail } = this.describeOutcome(game.outcome);
      chip.className = 'turn-chip is-over';
      text.textContent = title;
      sub.textContent = detail;
      return;
    }
    const side = pos.turn === WHITE ? t('whiteToMove') : t('blackToMove');
    text.textContent = this.thinking ? t('thinking') : s.mode === 'ai' && pos.turn === s.human ? `${t('yourMove')} · ${side}` : side;
    sub.className = checked ? 'status-sub is-check' : 'status-sub';
    sub.textContent = checked ? t('check') : this.engineLine();
  }

  private engineLine(): string {
    const r = this.lastSearch;
    if (!r || this.settings.mode !== 'ai' || !r.depth) return '';
    // Report the score from White's side, like most chess software.
    const aiColor = -this.settings.human;
    const score = r.score * aiColor;
    let scoreText: string;
    if (Math.abs(score) > MATE_BOUND) {
      const plies = MATE - Math.abs(score);
      scoreText = `${score > 0 ? '+' : '−'}${t('mateIn', { n: Math.ceil(plies / 2) })}`;
    } else scoreText = `${score >= 0 ? '+' : '−'}${(Math.abs(score) / 100).toFixed(2)}`;
    const nodes = r.nodes >= 1e6 ? `${(r.nodes / 1e6).toFixed(1)}M` : r.nodes >= 1e3 ? `${Math.round(r.nodes / 1e3)}k` : String(r.nodes);
    return t('engineInfo', { depth: r.depth, nodes, score: scoreText });
  }

  private describeOutcome(o: Outcome): { title: string; detail: string } {
    const vsAi = this.settings.mode === 'ai';
    const winnerText = (w: Color) => (vsAi ? (w === this.settings.human ? t('youWin') : t('youLose')) : w === WHITE ? t('winsWhite') : t('winsBlack'));
    switch (o.kind) {
      case 'checkmate':
        return { title: t('checkmate'), detail: winnerText(o.winner) };
      case 'resignation':
        return { title: o.winner === WHITE ? t('resignedBlack') : t('resignedWhite'), detail: winnerText(o.winner) };
      case 'draw': {
        const reasons = {
          stalemate: t('stalemate'),
          repetition: t('repetition'),
          'fifty-moves': t('fiftyMoves'),
          'insufficient-material': t('insufficientMaterial'),
          agreement: t('agreement'),
        };
        return { title: t('draw'), detail: reasons[o.reason] };
      }
      default:
        return { title: '', detail: '' };
    }
  }

  private renderSheet(ply: number): void {
    const list = $('sheet');
    const notation = this.game.notation;
    if (notation.length === 0) {
      setHtml(list, `<li class="sheet-empty">${t('noMoves')}</li>`);
      return;
    }
    let html = '';
    for (let i = 0; i < notation.length; i += 2) {
      const cell = (j: number) =>
        j < notation.length ? `<button type="button" class="mv${j + 1 === ply ? ' cur' : ''}" data-ply="${j + 1}">${notation[j]}</button>` : '<span></span>';
      html += `<li><span class="no">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</li>`;
    }
    if (this.game.isOver) html += `<li class="sheet-result">${this.game.resultTag()}</li>`;
    setHtml(list, html);
    // Keep the highlighted move in view without scrolling the page itself.
    const cur = list.querySelector<HTMLElement>('.cur');
    if (cur) {
      const r = cur.getBoundingClientRect();
      const box = list.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) list.scrollTop += r.top - box.top - box.height / 2;
    }
  }

  private renderCaptures(ply: number): void {
    const byWhite: number[] = [];
    const byBlack: number[] = [];
    for (const p of this.game.captures.slice(0, ply)) {
      if (p < 0) byWhite.push(p);
      else if (p > 0) byBlack.push(p);
    }
    const value = (list: number[]) => list.reduce((sum, p) => sum + PIECE_VALUE[Math.abs(p)], 0);
    const diff = Math.round((value(byWhite) - value(byBlack)) / 100);
    const row = (list: number[], label: string, lead: number) => {
      const pieces = list
        .slice()
        .sort((a, b) => PIECE_VALUE[Math.abs(b)] - PIECE_VALUE[Math.abs(a)])
        .map((p) => pieceHtml(p))
        .join('');
      return `<span class="cap-label">${label}</span><span class="cap-pieces">${pieces || '–'}</span>${lead > 0 ? `<span class="cap-lead">+${lead}</span>` : ''}`;
    };
    setHtml($('cap-white'), row(byWhite, t('white'), diff));
    setHtml($('cap-black'), row(byBlack, t('black'), -diff));
  }

  private renderReadout(pos: Position): void {
    const out = $('readout');
    const s = this.hover >= 0 ? this.hover : this.selected;
    if (s < 0) {
      out.innerHTML = `<span class="muted">${t('legendSquare')}</span>`;
      return;
    }
    const name = squareName(s);
    const parts = `<code class="sq"><span class="ax-x">${name[0]}</span><span class="ax-y">${name[1]}</span><span class="ax-z">${name[2]}</span><span class="ax-w">${name[3]}</span></code>`;
    let info = describePiece(pos.board[s]);
    if (s === this.selected && this.hover < 0) info += ` · ${t('movesAvailable', { n: this.targets.size })}`;
    out.innerHTML = `${parts} <span>${info}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Dialogs and messages
  // ---------------------------------------------------------------------------

  private showResult(): void {
    const { title, detail } = this.describeOutcome(this.game.outcome);
    $('result-title').textContent = title;
    $('result-text').textContent = detail;
    const dlg = $<HTMLDialogElement>('dlg-result');
    dlg.onclose = () => {
      if (dlg.returnValue === 'new') this.openNewGame();
    };
    dlg.returnValue = '';
    if (!dlg.open) dlg.showModal();
  }

  private confirm(message: string): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('dlg-confirm');
    $('confirm-text').textContent = message;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => (dlg.onclose = () => resolve(dlg.returnValue === 'yes')));
  }

  private choosePromotion(color: Color): Promise<number> {
    const dlg = $<HTMLDialogElement>('dlg-promo');
    const row = $('promo-row');
    row.innerHTML = [QUEEN, ROOK, BISHOP, KNIGHT]
      .map((p) => `<button class="promo" value="${p}" aria-label="${describePiece(p * color)}">${pieceHtml(p * color)}</button>`)
      .join('');
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => (dlg.onclose = () => resolve(Number(dlg.returnValue) || 0)));
  }

  private openRecord(): void {
    $<HTMLTextAreaElement>('record-text').value = this.game.record();
    $('record-error').hidden = true;
    $<HTMLDialogElement>('dlg-record').showModal();
  }

  private copyRecord(): void {
    const area = $<HTMLTextAreaElement>('record-text');
    const fallback = () => {
      area.focus();
      area.select();
      this.toast(t('copyFailed'));
    };
    try {
      navigator.clipboard.writeText(area.value).then(() => this.toast(t('copied')), fallback);
    } catch {
      fallback();
    }
  }

  private loadRecord(): void {
    const parsed = Game.fromRecord($<HTMLTextAreaElement>('record-text').value);
    const err = $('record-error');
    if ('error' in parsed) {
      err.textContent = t('loadError', { n: parsed.error.ply + 1, move: parsed.error.token });
      err.hidden = false;
      return;
    }
    this.stopThinking();
    this.game = parsed.game;
    this.lastSearch = null;
    this.viewPly = null;
    this.clearSelection();
    this.persistGame();
    $<HTMLDialogElement>('dlg-record').close();
    this.render();
    this.toast(t('loaded'));
    this.maybeComputerMove();
  }

  private toast(message: string): void {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el.hidden = true), 2600);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private persistGame(): void {
    const o = this.game.outcome;
    const ending = o.kind === 'resignation' || (o.kind === 'draw' && o.reason === 'agreement') ? o : undefined;
    save('game', { moves: this.game.moves, ending } satisfies SavedGame);
  }

  private persistSettings(): void {
    save('settings', this.settings);
  }
}

/** Replace an element's markup only when it actually changed. */
function setHtml(el: HTMLElement, html: string): void {
  if (el.dataset.html === html) return;
  el.innerHTML = html;
  el.dataset.html = html;
}

function describePiece(piece: number): string {
  return piece ? t(pieceNameKey(piece)) : t('emptySquare');
}

/** Squares strictly between two squares on one line (empty for knight jumps and single steps). */
function pathBetween(from: number, to: number): number[] {
  const d = LINE_DIR[from * SQUARES + to];
  if (d < 0) return [];
  const out: number[] = [];
  for (let k = 0; k < 3; k++) {
    const s = RAY[(from * 80 + d) * 3 + k];
    if (s === to) break;
    out.push(s);
  }
  return out;
}

/** Pieces of `side` that are attacked and either undefended or attacked by something cheaper. */
function threatenedPieces(board: Int8Array, side: Color): Set<number> {
  const out = new Set<number>();
  for (let s = 0; s < SQUARES; s++) {
    const p = board[s] * side;
    if (p <= 0 || p === KING) continue;
    const enemies = attackers(board, s, -side as Color);
    if (enemies.length === 0) continue;
    const cheapest = Math.min(...enemies.map((e) => PIECE_VALUE[Math.abs(board[e])] || 10_000));
    if (cheapest < PIECE_VALUE[p] || !isAttacked(board, s, side)) out.add(s);
  }
  return out;
}
