export type Lang = 'ru' | 'en';

const en = {
  title: '4D Chess',
  tagline: 'Chess on a 4×4×4×4 tesseract',
  rules: 'Rules',
  newGame: 'New game',
  undo: 'Undo',
  flip: 'Flip',
  resign: 'Resign',
  offerDraw: 'Offer draw',
  record: 'Save / load',
  moves: 'Moves',
  noMoves: 'No moves yet. White starts.',
  captured: 'Captured',
  hints: 'Mark my pieces under attack',
  coords: 'Show coordinates',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  first: 'First move',
  prev: 'Previous move',
  next: 'Next move',
  last: 'Current position',
  whiteToMove: 'White to move',
  blackToMove: 'Black to move',
  yourMove: 'Your move',
  check: 'Check!',
  thinking: 'Computer is thinking…',
  viewing: 'Viewing the position after move {n}',
  viewingStart: 'Viewing the starting position',
  backToGame: 'Back to the game',
  vsComputer: 'You vs computer ({level})',
  vsHuman: 'Two players, one screen',
  engineInfo: 'Depth {depth} · {nodes} positions · {score}',
  mateIn: 'mate in {n}',
  white: 'White',
  black: 'Black',
  random: 'Random',
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  checkmate: 'Checkmate',
  draw: 'Draw',
  winsWhite: 'White wins',
  winsBlack: 'Black wins',
  youWin: 'You win!',
  youLose: 'The computer wins',
  resignedWhite: 'White resigned',
  resignedBlack: 'Black resigned',
  stalemate: 'Stalemate: the side to move has no legal move but is not in check.',
  repetition: 'The same position occurred three times.',
  fiftyMoves: '50 moves by each side without a capture or a pawn move.',
  insufficientMaterial: 'Neither side has enough material left to checkmate.',
  agreement: 'Draw agreed.',
  drawDeclined: 'The computer declines the draw.',
  close: 'Close',
  cancel: 'Cancel',
  start: 'Start',
  yes: 'Yes',
  no: 'No',
  confirmResign: 'Resign this game?',
  confirmDraw: 'Do both players agree to a draw?',
  confirmNew: 'Start a new game? The current one will be replaced.',
  newGameTitle: 'New game',
  opponent: 'Opponent',
  optComputer: 'Computer',
  optHuman: 'Friend on this device',
  playAs: 'Play as',
  level: 'Difficulty',
  levelEasy: 'Easy',
  levelMedium: 'Medium',
  levelHard: 'Hard',
  promoteTitle: 'Promote the pawn to',
  recordTitle: 'Game record',
  recordHint: 'Copy the record to keep the game, or paste a record and load it.',
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Select the text and copy it manually',
  load: 'Load',
  loadError: 'Move {n} cannot be played: “{move}”. Nothing was loaded.',
  loaded: 'Game loaded',
  language: 'Language',
  theme: 'Theme',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  legendSquare: 'b2C3 = square b2 on board C3',
  axisX: 'file',
  axisY: 'rank',
  axisZ: 'board column',
  axisW: 'board row',
  whitePawn: 'white pawn',
  whiteKnight: 'white knight',
  whiteBishop: 'white bishop',
  whiteRook: 'white rook',
  whiteQueen: 'white queen',
  whiteKing: 'white king',
  blackPawn: 'black pawn',
  blackKnight: 'black knight',
  blackBishop: 'black bishop',
  blackRook: 'black rook',
  blackQueen: 'black queen',
  blackKing: 'black king',
  movesAvailable: '{n} moves',
  emptySquare: 'empty',
  rulesHtml: `
<h3>The board</h3>
<p>The board is a 4×4×4×4 tesseract with 256 squares, drawn as a 4×4 grid of small 4×4 boards. Every square has four coordinates:</p>
<ul class="axes">
  <li><b class="ax-x">x</b> file inside a small board, <code>a–d</code></li>
  <li><b class="ax-y">y</b> rank inside a small board, <code>1–4</code></li>
  <li><b class="ax-z">z</b> column of boards, <code>A–D</code></li>
  <li><b class="ax-w">w</b> row of boards, <code>1–4</code></li>
</ul>
<p>A square is written with all four: <code>b2C3</code> is square b2 on board C3. Square colour follows the sum of all four coordinates, so a bishop stays on one colour, as in ordinary chess.</p>
<h3>Starting position</h3>
<p>Each side has 32 men: a king, a queen, 4 rooks, 4 knights, 6 bishops and 16 pawns. White’s pieces stand on rank 1 of boards A1–D1, its pawns on rank 2 of boards A2–D2. Black mirrors this: pieces on rank 4 of boards A4–D4, pawns on rank 3 of boards A3–D3.</p>
<p>Files a–d on each back board: <b>A</b> rook, knight, knight, rook · <b>B</b> bishop, queen, king, bishop · <b>C</b> four bishops · <b>D</b> rook, knight, knight, rook.</p>
<h3>How pieces move</h3>
<p>A direction changes each coordinate by −1, 0 or +1; there are 80 of them.</p>
<ul>
  <li><b>Rook</b> changes exactly one coordinate, any distance (8 directions).</li>
  <li><b>Bishop</b> changes exactly two coordinates by the same distance (24 directions).</li>
  <li><b>Queen</b> changes any set of coordinates by the same distance (all 80 directions).</li>
  <li><b>King</b> moves one square in any of the 80 directions.</li>
  <li><b>Knight</b> moves two squares along one axis and one along another, jumping over anything (up to 48 jumps).</li>
</ul>
<p>Rooks, bishops and queens cannot jump over pieces.</p>
<h3>Pawns</h3>
<ul>
  <li>A pawn has two forward directions: along the rank (y) and along the board rows (w). White heads for rank 4 and row 4, Black for rank 1 and row 1.</li>
  <li>It moves one square forward along y or w onto an empty square. There is no double step and no en passant.</li>
  <li>It captures one square forward (along y or w) combined with one square sideways (along x or z).</li>
  <li>A white pawn promotes on rank 4 of a board in row 4, a black pawn on rank 1 of a board in row 1, into a queen, rook, bishop or knight.</li>
</ul>
<h3>Check, mate and draws</h3>
<ul>
  <li>You may never leave your king attacked. A king in check with no move to escape is checkmated, and that side loses.</li>
  <li>No legal move without being in check is stalemate, a draw.</li>
  <li>The game is also drawn on threefold repetition, after 50 moves by each side without a capture or pawn move, and when neither side can mate (bare kings, a single minor piece, or only bishops of one colour).</li>
  <li>There is no castling.</li>
</ul>
<h3>Playing on this page</h3>
<ul>
  <li>Click one of your pieces: dots show where it can go, and boards with a move light up. Hover a target to trace the line across boards.</li>
  <li>An orange corner marks your piece that is attacked and either unprotected or attacked by a cheaper piece.</li>
  <li>Use ← and → to step through the game.</li>
</ul>`,
};

export type Key = keyof typeof en;

const ru: Record<Key, string> = {
  title: 'Шахматы 4D',
  tagline: 'Шахматы на тессеракте 4×4×4×4',
  rules: 'Правила',
  newGame: 'Новая игра',
  undo: 'Отменить ход',
  flip: 'Перевернуть',
  resign: 'Сдаться',
  offerDraw: 'Ничья?',
  record: 'Сохранить / загрузить',
  moves: 'Ходы',
  noMoves: 'Ходов пока нет. Начинают белые.',
  captured: 'Взято',
  hints: 'Отмечать мои фигуры под ударом',
  coords: 'Показывать координаты',
  zoomIn: 'Увеличить',
  zoomOut: 'Уменьшить',
  first: 'К началу',
  prev: 'Ход назад',
  next: 'Ход вперёд',
  last: 'Текущая позиция',
  whiteToMove: 'Ход белых',
  blackToMove: 'Ход чёрных',
  yourMove: 'Ваш ход',
  check: 'Шах!',
  thinking: 'Компьютер думает…',
  viewing: 'Позиция после хода {n}',
  viewingStart: 'Начальная позиция',
  backToGame: 'Вернуться к игре',
  vsComputer: 'Вы против компьютера ({level})',
  vsHuman: 'Двое за одним экраном',
  engineInfo: 'Глубина {depth} · {nodes} позиций · {score}',
  mateIn: 'мат в {n}',
  white: 'Белые',
  black: 'Чёрные',
  random: 'Случайно',
  easy: 'лёгкий',
  medium: 'средний',
  hard: 'сложный',
  checkmate: 'Мат',
  draw: 'Ничья',
  winsWhite: 'Победили белые',
  winsBlack: 'Победили чёрные',
  youWin: 'Вы победили!',
  youLose: 'Победил компьютер',
  resignedWhite: 'Белые сдались',
  resignedBlack: 'Чёрные сдались',
  stalemate: 'Пат: у стороны, чей ход, нет ходов, но шаха нет.',
  repetition: 'Одна и та же позиция повторилась трижды.',
  fiftyMoves: '50 ходов каждой стороны без взятий и ходов пешками.',
  insufficientMaterial: 'Ни у одной стороны не осталось материала для мата.',
  agreement: 'Ничья по соглашению.',
  drawDeclined: 'Компьютер отказался от ничьей.',
  close: 'Закрыть',
  cancel: 'Отмена',
  start: 'Начать',
  yes: 'Да',
  no: 'Нет',
  confirmResign: 'Сдать партию?',
  confirmDraw: 'Оба игрока согласны на ничью?',
  confirmNew: 'Начать новую игру? Текущая партия будет заменена.',
  newGameTitle: 'Новая игра',
  opponent: 'Соперник',
  optComputer: 'Компьютер',
  optHuman: 'Друг на этом устройстве',
  playAs: 'Играть за',
  level: 'Сложность',
  levelEasy: 'Лёгкая',
  levelMedium: 'Средняя',
  levelHard: 'Сложная',
  promoteTitle: 'Превратить пешку в',
  recordTitle: 'Запись партии',
  recordHint: 'Скопируйте запись, чтобы сохранить партию, или вставьте запись и загрузите её.',
  copy: 'Копировать',
  copied: 'Скопировано',
  copyFailed: 'Выделите текст и скопируйте вручную',
  load: 'Загрузить',
  loadError: 'Ход {n} невозможен: «{move}». Партия не загружена.',
  loaded: 'Партия загружена',
  language: 'Язык',
  theme: 'Тема',
  themeAuto: 'Авто',
  themeLight: 'Светлая',
  themeDark: 'Тёмная',
  legendSquare: 'b2C3 = поле b2 на доске C3',
  axisX: 'вертикаль',
  axisY: 'горизонталь',
  axisZ: 'столбец досок',
  axisW: 'ряд досок',
  whitePawn: 'белая пешка',
  whiteKnight: 'белый конь',
  whiteBishop: 'белый слон',
  whiteRook: 'белая ладья',
  whiteQueen: 'белый ферзь',
  whiteKing: 'белый король',
  blackPawn: 'чёрная пешка',
  blackKnight: 'чёрный конь',
  blackBishop: 'чёрный слон',
  blackRook: 'чёрная ладья',
  blackQueen: 'чёрный ферзь',
  blackKing: 'чёрный король',
  movesAvailable: 'ходов: {n}',
  emptySquare: 'пусто',
  rulesHtml: `
<h3>Доска</h3>
<p>Доска — тессеракт 4×4×4×4 из 256 клеток. Она нарисована как сетка 4×4 из маленьких досок 4×4. У каждой клетки четыре координаты:</p>
<ul class="axes">
  <li><b class="ax-x">x</b> вертикаль внутри доски, <code>a–d</code></li>
  <li><b class="ax-y">y</b> горизонталь внутри доски, <code>1–4</code></li>
  <li><b class="ax-z">z</b> столбец досок, <code>A–D</code></li>
  <li><b class="ax-w">w</b> ряд досок, <code>1–4</code></li>
</ul>
<p>Клетка записывается всеми четырьмя: <code>b2C3</code> — поле b2 на доске C3. Цвет клетки зависит от суммы всех координат, поэтому слон, как и в обычных шахматах, всегда остаётся на полях одного цвета.</p>
<h3>Начальная расстановка</h3>
<p>У каждой стороны 32 фигуры: король, ферзь, 4 ладьи, 4 коня, 6 слонов и 16 пешек. Фигуры белых стоят на 1-й горизонтали досок A1–D1, пешки — на 2-й горизонтали досок A2–D2. Чёрные расставлены зеркально: фигуры на 4-й горизонтали досок A4–D4, пешки на 3-й горизонтали досок A3–D3.</p>
<p>Вертикали a–d на досках первой линии: <b>A</b> ладья, конь, конь, ладья · <b>B</b> слон, ферзь, король, слон · <b>C</b> четыре слона · <b>D</b> ладья, конь, конь, ладья.</p>
<h3>Ходы фигур</h3>
<p>Направление меняет каждую координату на −1, 0 или +1; всего направлений 80.</p>
<ul>
  <li><b>Ладья</b> меняет ровно одну координату на любое расстояние (8 направлений).</li>
  <li><b>Слон</b> меняет ровно две координаты на одинаковое расстояние (24 направления).</li>
  <li><b>Ферзь</b> меняет любой набор координат на одинаковое расстояние (все 80 направлений).</li>
  <li><b>Король</b> ходит на одну клетку в любом из 80 направлений.</li>
  <li><b>Конь</b> ходит на две клетки по одной оси и на одну по другой и перепрыгивает через фигуры (до 48 прыжков).</li>
</ul>
<p>Ладья, слон и ферзь через фигуры не перепрыгивают.</p>
<h3>Пешки</h3>
<ul>
  <li>У пешки два направления «вперёд»: по горизонтали (y) и по рядам досок (w). Белые идут к 4-й горизонтали и 4-му ряду, чёрные — к 1-й горизонтали и 1-му ряду.</li>
  <li>Пешка ходит на одну клетку вперёд по y или по w на пустое поле. Двойного хода и взятия на проходе нет.</li>
  <li>Бьёт пешка на одну клетку вперёд (по y или w) и одновременно на одну клетку вбок (по x или z).</li>
  <li>Белая пешка превращается на 4-й горизонтали доски из 4-го ряда, чёрная — на 1-й горизонтали доски из 1-го ряда: в ферзя, ладью, слона или коня.</li>
</ul>
<h3>Шах, мат и ничья</h3>
<ul>
  <li>Нельзя оставлять своего короля под ударом. Если королю шах и спастись некуда, это мат: партия проиграна.</li>
  <li>Если ходов нет, а шаха нет, это пат и ничья.</li>
  <li>Ничья также при троекратном повторении позиции, после 50 ходов каждой стороны без взятий и ходов пешками и когда мат поставить нечем (одни короли, одна лёгкая фигура или только слоны одного цвета).</li>
  <li>Рокировки нет.</li>
</ul>
<h3>Как играть на этой странице</h3>
<ul>
  <li>Нажмите на свою фигуру: точки покажут, куда она может пойти, а доски с ходами подсветятся. Наведите курсор на цель, чтобы увидеть линию хода через доски.</li>
  <li>Оранжевый уголок отмечает вашу фигуру под ударом, если она не защищена или её атакует более дешёвая фигура.</li>
  <li>Клавиши ← и → листают партию.</li>
</ul>`,
};

const dictionaries: Record<Lang, Record<Key, string>> = { en, ru };

let current: Lang = 'en';

export function detectLang(): Lang {
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  return langs.some((l) => /^(ru|uk|be|kk)\b/i.test(l)) ? 'ru' : 'en';
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: Key, params?: Record<string, string | number>): string {
  let s = dictionaries[current][key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Fill every element carrying data-i18n (text), data-i18n-title or data-i18n-aria. */
export function applyStaticText(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml as Key)));
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle as Key);
    el.setAttribute('aria-label', el.title);
  });
}
