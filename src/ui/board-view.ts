import { SQUARES, isDarkSquare, square, sqW, sqZ } from '../engine/geometry';
import { COLUMNS, FILES } from '../engine/notation';
import { pieceHtml } from './pieces';

/** Everything the board needs to draw one frame. */
export interface BoardState {
  board: Int8Array;
  selected: number;
  /** Destinations of the selected piece. */
  targets: ReadonlySet<number>;
  lastFrom: number;
  lastTo: number;
  /** Square of a king in check, or −1. */
  check: number;
  /** Own pieces worth a warning marker. */
  threats: ReadonlySet<number>;
  /** Squares crossed by the hovered move. */
  path: ReadonlySet<number>;
  hoverTarget: number;
  /** Squares whose pieces may be picked up right now. */
  movable: ReadonlySet<number>;
  /** Text for each cell's accessible label. */
  describe: (s: number, piece: number) => string;
}

export interface BoardHandlers {
  onSquare: (s: number) => void;
  onHover: (s: number) => void;
}

/**
 * The hyperboard: a 4×4 grid of 4×4 boards. Board rows are w (row 4 at the top for White),
 * board columns are z (A on the left); inside a board, ranks y run upwards and files x rightwards.
 * Flipping turns the whole picture around, as when sitting on Black's side.
 */
export class BoardView {
  private readonly cells: HTMLButtonElement[] = new Array(SQUARES);
  private readonly boards: HTMLElement[] = new Array(16);
  private readonly drawn = new Int8Array(SQUARES).fill(99);
  private readonly labels: string[] = new Array(SQUARES).fill('');

  constructor(
    private readonly root: HTMLElement,
    handlers: BoardHandlers,
  ) {
    root.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (cell) handlers.onSquare(Number(cell.dataset.sq));
    });
    root.addEventListener('pointerover', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      handlers.onHover(cell ? Number(cell.dataset.sq) : -1);
    });
    root.addEventListener('pointerleave', () => handlers.onHover(-1));
    root.addEventListener('focusin', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (cell) handlers.onHover(Number(cell.dataset.sq));
    });
  }

  build(flipped: boolean): void {
    const order = flipped ? [0, 1, 2, 3] : [3, 2, 1, 0]; // top-to-bottom for y and w
    const across = flipped ? [3, 2, 1, 0] : [0, 1, 2, 3]; // left-to-right for x and z
    const frag = document.createDocumentFragment();

    frag.append(div('hyper-corner'));
    for (const z of across) frag.append(div('hyper-label hyper-col ax-z', COLUMNS[z]));

    order.forEach((w, row) => {
      frag.append(div('hyper-label hyper-row ax-w', String(w + 1)));
      across.forEach((z, col) => {
        const board = div('board');
        board.dataset.board = `${COLUMNS[z]}${w + 1}`;
        order.forEach((y, r) => {
          across.forEach((x, c) => {
            const s = square(x, y, z, w);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = `cell ${isDarkSquare(s) ? 'dark' : 'light'}`;
            cell.dataset.sq = String(s);
            // File letters along the bottom edge, rank numbers along the left edge of the hyperboard.
            if (row === 3 && r === 3) cell.append(div('co co-file ax-x', FILES[x]));
            if (col === 0 && c === 0) cell.append(div('co co-rank ax-y', String(y + 1)));
            cell.append(div('pc-slot'));
            board.append(cell);
            this.cells[s] = cell;
          });
        });
        this.boards[z + 4 * w] = board;
        frag.append(board);
      });
    });

    this.root.replaceChildren(frag);
    this.drawn.fill(99);
    this.labels.fill('');
  }

  render(st: BoardState): void {
    const boardTargets = new Uint8Array(16);
    for (const s of st.targets) boardTargets[sqZ(s) + 4 * sqW(s)] = 1;

    for (let s = 0; s < SQUARES; s++) {
      const cell = this.cells[s];
      const piece = st.board[s];
      if (this.drawn[s] !== piece) {
        cell.lastElementChild!.innerHTML = pieceHtml(piece);
        this.drawn[s] = piece;
      }
      const label = st.describe(s, piece);
      if (this.labels[s] !== label) {
        cell.setAttribute('aria-label', label);
        this.labels[s] = label;
      }
      const target = st.targets.has(s);
      const cl = cell.classList;
      cl.toggle('sel', s === st.selected);
      cl.toggle('tgt', target && piece === 0);
      cl.toggle('cap', target && piece !== 0);
      cl.toggle('last', s === st.lastFrom || s === st.lastTo);
      cl.toggle('chk', s === st.check);
      cl.toggle('thr', st.threats.has(s));
      cl.toggle('path', st.path.has(s));
      cl.toggle('hov', s === st.hoverTarget);
      cl.toggle('movable', st.movable.has(s));
    }
    for (let b = 0; b < 16; b++) {
      this.boards[b].classList.toggle('b-tgt', boardTargets[b] === 1);
      this.boards[b].classList.toggle('b-sel', st.selected >= 0 && sqZ(st.selected) + 4 * sqW(st.selected) === b);
    }
  }

  /** Brief landing animation on a square. */
  pulse(s: number): void {
    const cell = this.cells[s];
    if (!cell) return;
    cell.classList.remove('land');
    void cell.offsetWidth;
    cell.classList.add('land');
  }
}

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
