const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PREVIEW_BLOCK = 24;
const MIN_SPEED_LEVEL = 1;
const MAX_SPEED_LEVEL = 10;
const START_SPEED_LEVEL = 5;
const SOFT_DROP_POINTS_PER_LINE = 1;
const HARD_DROP_POINTS_PER_LINE = 2;
const LINE_CLEAR_POINTS = 100;
/** Extra score as % of points earned for that clear (2→10%, 3→20%, 4→30%). */
const COMBO_BONUS_PERCENT = { 2: 10, 3: 20, 4: 30 };
/** Toast visibility matches CSS `combo-toast-lifecycle` (1s). */
const COMBO_TOAST_FALLBACK_MS = 1050;

const TETROMINOES = [
  {
    name: "I",
    color: "#4cc9f0",
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    name: "O",
    color: "#f4d35e",
    shape: [
      [1, 1],
      [1, 1],
    ],
  },
  {
    name: "T",
    color: "#b388eb",
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    name: "S",
    color: "#5dd39e",
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    name: "Z",
    color: "#ff6b6b",
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    name: "J",
    color: "#4895ef",
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    name: "L",
    color: "#ff9f1c",
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
];

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const previewCanvas = document.getElementById("next");
const previewCtx = previewCanvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const speedLevelEl = document.getElementById("speed-level");
const speedSelectEl = document.getElementById("speed-select");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const pauseBtn = document.getElementById("pause");
const top10Dialog = document.getElementById("top10-dialog");
const top10Summary = document.getElementById("top10-summary");
const top10Body = document.getElementById("top10-body");
const top10Empty = document.getElementById("top10-empty");
const top10Table = document.getElementById("top10-table");
const top10OpenBtn = document.getElementById("top10-open");
const comboToastEl = document.getElementById("combo-toast-2d");

/** Merged Top 10 rows (nick, score, date); persisted in localStorage, seeded from #top10-data in index.html. */
const TOP10_STORAGE_KEY = "tetrisTop10";
const NICK_STORAGE_KEY = "tetrisNick";

let board = createEmptyBoard();
let current = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let speedLevel = START_SPEED_LEVEL;
let gameOver = true;
let paused = false;
let lastTick = 0;
let dropInterval = getDropIntervalMs(START_SPEED_LEVEL);
let comboToastCleanupId = null;

function top10DisplayNick(row) {
  if (row && typeof row.nick === "string" && row.nick.trim()) {
    return row.nick.trim();
  }
  return "Legacy";
}

function normalizeTop10Entries(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < data.length; i += 1) {
    const e = data[i];
    if (!e || typeof e.score !== "number" || typeof e.date !== "string") {
      continue;
    }
    if (typeof e.nick === "string" && e.nick.trim()) {
      out.push({
        nick: e.nick.trim().slice(0, 24),
        score: e.score,
        date: e.date,
      });
    } else if (typeof e.lines === "number") {
      out.push({
        nick: "Legacy",
        score: e.score,
        date: e.date,
      });
    }
  }
  return out;
}

function getStoredNick() {
  try {
    const n = sessionStorage.getItem(NICK_STORAGE_KEY);
    if (n && typeof n === "string" && n.trim()) {
      return n.trim().slice(0, 24);
    }
  } catch {
    // ignore
  }
  return "Player";
}

function readTop10SeedFromIndex() {
  const el = document.getElementById("top10-data");
  if (!el || typeof el.textContent !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(el.textContent.trim());
    return normalizeTop10Entries(parsed);
  } catch {
    return [];
  }
}

function loadTop10() {
  try {
    const raw = localStorage.getItem(TOP10_STORAGE_KEY);
    if (raw != null && raw !== "") {
      return normalizeTop10Entries(JSON.parse(raw));
    }
  } catch {
    // fall through to embedded seed
  }
  return readTop10SeedFromIndex();
}

function saveTop10(entries) {
  try {
    localStorage.setItem(
      TOP10_STORAGE_KEY,
      JSON.stringify(entries.slice(0, 10))
    );
    return true;
  } catch {
    return false;
  }
}

function mergeNewScore(finalScore, finalLines) {
  const entry = {
    nick: getStoredNick(),
    score: finalScore,
    date: new Date().toISOString(),
  };
  const existing = loadTop10();
  const merged = [...existing, entry];
  merged.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.date) - new Date(a.date);
  });
  const top = merged.slice(0, 10);
  const saved = saveTop10(top);
  return { entry, top, saved };
}

function formatScoreDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function findEntryRank(top, entry) {
  return top.findIndex(
    (e) =>
      e.date === entry.date &&
      e.score === entry.score &&
      top10DisplayNick(e) === top10DisplayNick(entry)
  );
}

function fillTop10Table(top, highlightEntry) {
  top10Body.innerHTML = "";
  const highlightIdx = highlightEntry ? findEntryRank(top, highlightEntry) : -1;

  if (!top.length) {
    top10Table.hidden = true;
    top10Empty.hidden = false;
    return;
  }

  top10Table.hidden = false;
  top10Empty.hidden = true;

  for (let i = 0; i < top.length; i += 1) {
    const row = top[i];
    const tr = document.createElement("tr");
    if (highlightIdx === i) {
      tr.className = "top10-row-highlight";
    }
    const rank = document.createElement("td");
    rank.textContent = String(i + 1);
    const nickCell = document.createElement("td");
    nickCell.textContent = top10DisplayNick(row);
    const scoreCell = document.createElement("td");
    scoreCell.textContent = String(row.score);
    const dateCell = document.createElement("td");
    dateCell.textContent = formatScoreDate(row.date);
    tr.append(rank, nickCell, scoreCell, dateCell);
    top10Body.appendChild(tr);
  }
}

function openTop10ReadOnly() {
  const top = loadTop10();
  top10Summary.textContent = "";
  top10Summary.hidden = true;
  fillTop10Table(top, null);
  top10Dialog.showModal();
}

function openTop10AfterGameOver() {
  const finalScore = score;
  const finalLines = lines;
  const { entry, top, saved } = mergeNewScore(finalScore, finalLines);
  const rank = findEntryRank(top, entry);
  let summary = `This game: ${finalScore} points, ${finalLines} lines cleared.`;
  if (rank >= 0) {
    summary += ` You placed #${rank + 1}.`;
  } else {
    summary += " Not in the top 10.";
  }
  if (!saved) {
    summary +=
      " Scores were not saved (browser storage may be full or disabled).";
  }
  top10Summary.textContent = summary;
  top10Summary.hidden = false;
  fillTop10Table(top, entry);
  top10Dialog.showModal();
}

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function rotateClockwise(matrix) {
  return matrix[0].map((_, i) => matrix.map((row) => row[i]).reverse());
}

function getDropIntervalMs(level) {
  const clamped = Math.max(MIN_SPEED_LEVEL, Math.min(MAX_SPEED_LEVEL, level));
  const slowestMs = 1000;
  const fastestMs = 120;
  const progress = (clamped - MIN_SPEED_LEVEL) / (MAX_SPEED_LEVEL - MIN_SPEED_LEVEL);
  return Math.round(slowestMs - (slowestMs - fastestMs) * progress);
}

function setSpeedLevel(level) {
  speedLevel = Math.max(MIN_SPEED_LEVEL, Math.min(MAX_SPEED_LEVEL, level));
  dropInterval = getDropIntervalMs(speedLevel);
  speedLevelEl.textContent = String(speedLevel);
  if (Number(speedSelectEl.value) !== speedLevel) {
    speedSelectEl.value = String(speedLevel);
  }
}

function randomPiece() {
  const base = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
  return {
    x: Math.floor(COLS / 2) - Math.ceil(base.shape[0].length / 2),
    y: 0,
    name: base.name,
    shape: cloneMatrix(base.shape),
    color: base.color,
  };
}

function collides(piece, offsetX = 0, offsetY = 0, nextShape = piece.shape) {
  for (let y = 0; y < nextShape.length; y += 1) {
    for (let x = 0; x < nextShape[y].length; x += 1) {
      if (!nextShape[y][x]) {
        continue;
      }

      const nx = piece.x + x + offsetX;
      const ny = piece.y + y + offsetY;

      if (nx < 0 || nx >= COLS || ny >= ROWS) {
        return true;
      }
      if (ny >= 0 && board[ny][nx]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const by = piece.y + y;
      const bx = piece.x + x;
      if (by >= 0) {
        board[by][bx] = piece.color;
      }
    });
  });
}

function comboPercentForClearCount(cleared) {
  if (cleared <= 1) {
    return 0;
  }
  if (cleared >= 4) {
    return COMBO_BONUS_PERCENT[4];
  }
  return COMBO_BONUS_PERCENT[cleared] || 0;
}

function hideComboToast() {
  if (!comboToastEl) {
    return;
  }
  comboToastEl.hidden = true;
  comboToastEl.classList.remove("combo-toast--anim");
}

function showComboToast(percent) {
  if (!comboToastEl) {
    return;
  }
  if (comboToastCleanupId !== null) {
    window.clearTimeout(comboToastCleanupId);
    comboToastCleanupId = null;
  }
  comboToastEl.hidden = false;
  comboToastEl.textContent = "+" + String(percent) + "%";
  comboToastEl.classList.remove("combo-toast--anim");
  void comboToastEl.offsetWidth;
  comboToastEl.classList.add("combo-toast--anim");
  comboToastEl.addEventListener("animationend", hideComboToast, { once: true });
  comboToastCleanupId = window.setTimeout(function () {
    comboToastCleanupId = null;
    hideComboToast();
  }, COMBO_TOAST_FALLBACK_MS);
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every((cell) => cell !== null)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    lines += cleared;
    const base = cleared * LINE_CLEAR_POINTS;
    const pct = comboPercentForClearCount(cleared);
    const bonus = pct > 0 ? Math.round((base * pct) / 100) : 0;
    score += base + bonus;
    if (pct > 0) {
      showComboToast(pct);
    }
    updateHud();
  }
}

function spawnPiece() {
  if (!nextPiece) {
    nextPiece = randomPiece();
  }

  current = nextPiece;
  current.x = Math.floor(COLS / 2) - Math.ceil(current.shape[0].length / 2);
  current.y = 0;
  nextPiece = randomPiece();
  drawNextPiece();

  if (collides(current)) {
    gameOver = true;
    paused = false;
    statusEl.textContent = "Game Over - Press Restart";
    syncPauseButton();
    void openTop10AfterGameOver();
  }
}

function lockAndContinue() {
  mergePiece(current);
  clearLines();
  spawnPiece();
}

function move(dx) {
  if (!current || gameOver || paused) {
    return;
  }
  if (!collides(current, dx, 0)) {
    current.x += dx;
  }
}

function softDrop(withPoints = false) {
  if (!current || gameOver || paused) {
    return;
  }

  if (!collides(current, 0, 1)) {
    current.y += 1;
    if (withPoints) {
      score += SOFT_DROP_POINTS_PER_LINE;
      updateHud();
    }
  } else {
    lockAndContinue();
  }
}

function hardDrop() {
  if (!current || gameOver || paused) {
    return;
  }
  let droppedLines = 0;
  while (!collides(current, 0, 1)) {
    current.y += 1;
    droppedLines += 1;
  }
  score += droppedLines * HARD_DROP_POINTS_PER_LINE;
  updateHud();
  lockAndContinue();
}

function rotate() {
  if (!current || gameOver || paused) {
    return;
  }
  const rotated = rotateClockwise(current.shape);
  if (!collides(current, 0, 0, rotated)) {
    current.shape = rotated;
    return;
  }

  if (!collides(current, -1, 0, rotated)) {
    current.x -= 1;
    current.shape = rotated;
    return;
  }

  if (!collides(current, 1, 0, rotated)) {
    current.x += 1;
    current.shape = rotated;
  }
}

function updateHud() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  speedLevelEl.textContent = String(speedLevel);
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  ctx.strokeStyle = "#101427";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = board[y][x];
      if (cell) {
        drawCell(x, y, cell);
      } else {
        ctx.strokeStyle = "#161b31";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      }
    }
  }

  if (!current) {
    return;
  }

  current.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const px = current.x + x;
      const py = current.y + y;
      if (py >= 0) {
        drawCell(px, py, current.color);
      }
    });
  });
}

function drawNextPiece() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  if (!nextPiece) {
    return;
  }

  const shape = nextPiece.shape;
  const pieceWidth = shape[0].length * PREVIEW_BLOCK;
  const pieceHeight = shape.length * PREVIEW_BLOCK;
  const offsetX = Math.floor((previewCanvas.width - pieceWidth) / 2);
  const offsetY = Math.floor((previewCanvas.height - pieceHeight) / 2);

  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) {
        continue;
      }
      previewCtx.fillStyle = nextPiece.color;
      previewCtx.fillRect(
        offsetX + x * PREVIEW_BLOCK,
        offsetY + y * PREVIEW_BLOCK,
        PREVIEW_BLOCK,
        PREVIEW_BLOCK
      );
      previewCtx.strokeStyle = "#101427";
      previewCtx.strokeRect(
        offsetX + x * PREVIEW_BLOCK,
        offsetY + y * PREVIEW_BLOCK,
        PREVIEW_BLOCK,
        PREVIEW_BLOCK
      );
    }
  }
}

function tick(timestamp) {
  if (!lastTick) {
    lastTick = timestamp;
  }

  const delta = timestamp - lastTick;
  if (!gameOver && !paused && delta >= dropInterval) {
    softDrop();
    lastTick = timestamp;
  }

  drawBoard();
  requestAnimationFrame(tick);
}

function startGame() {
  if (top10Dialog.open) {
    top10Dialog.close();
  }
  if (comboToastCleanupId !== null) {
    window.clearTimeout(comboToastCleanupId);
    comboToastCleanupId = null;
  }
  hideComboToast();
  board = createEmptyBoard();
  score = 0;
  lines = 0;
  setSpeedLevel(Number(speedSelectEl.value) || START_SPEED_LEVEL);
  nextPiece = randomPiece();
  updateHud();
  gameOver = false;
  paused = false;
  lastTick = 0;
  statusEl.textContent = "Running";
  spawnPiece();
  syncPauseButton();
}

function syncPauseButton() {
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  pauseBtn.disabled = gameOver;
}

function togglePause() {
  if (gameOver) {
    return;
  }
  paused = !paused;
  statusEl.textContent = paused ? "Paused" : "Running";
  syncPauseButton();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && gameOver) {
    if (top10Dialog.open) {
      return;
    }
    startGame();
    return;
  }

  if (event.key === "p" || event.key === "P") {
    togglePause();
    return;
  }

  if (gameOver || paused) {
    return;
  }

  if (event.key === "ArrowLeft") {
    move(-1);
  } else if (event.key === "ArrowRight") {
    move(1);
  } else if (event.key === "ArrowDown") {
    softDrop(true);
  } else if (event.key === "ArrowUp") {
    rotate();
  } else if (event.code === "Space") {
    event.preventDefault();
    hardDrop();
  }
});

restartBtn.addEventListener("click", startGame);
top10OpenBtn.addEventListener("click", () => {
  void openTop10ReadOnly();
});
pauseBtn.addEventListener("click", () => {
  togglePause();
});
speedSelectEl.addEventListener("change", () => {
  setSpeedLevel(Number(speedSelectEl.value) || START_SPEED_LEVEL);
  lastTick = 0;
});

updateHud();
drawBoard();
drawNextPiece();
syncPauseButton();
requestAnimationFrame(tick);
