(function () {
  const THREE = window.THREE;
  if (!THREE) {
    window.alert("Three.js failed to load.");
    return;
  }

  const W = 5;
  const D = 5;
  const H = 14;

  const MIN_SPEED_LEVEL = 1;
  const MAX_SPEED_LEVEL = 10;
  const START_SPEED_LEVEL = 5;
  const SOFT_DROP_POINTS_PER_LINE = 1;
  const HARD_DROP_POINTS_PER_LINE = 2;
  const LAYER_CLEAR_POINTS = 200;
  /** Extra score as % of points for that clear (2→10%, 3→20%, 4→30%). */
  const COMBO_BONUS_PERCENT = { 2: 10, 3: 20, 4: 30 };
  const COMBO_TOAST_FALLBACK_MS = 1050;

  function normalizeCells(cells) {
    const uniq = new Map();
    for (const c of cells) {
      const key = c[0] + "," + c[1] + "," + c[2];
      if (!uniq.has(key)) {
        uniq.set(key, [c[0], c[1], c[2]]);
      }
    }
    const list = Array.from(uniq.values());
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    for (const [x, y, z] of list) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
    }
    return list.map(([x, y, z]) => [x - minX, y - minY, z - minZ]);
  }

  function rotY([x, y, z]) {
    return [z, y, -x];
  }
  function rotX([x, y, z]) {
    return [x, -z, y];
  }
  function rotXNeg([x, y, z]) {
    return [x, z, -y];
  }
  function rotZ([x, y, z]) {
    return [-y, x, z];
  }
  function rotZNeg([x, y, z]) {
    return [y, -x, z];
  }

  function rotateCells(cells, rotFn) {
    return normalizeCells(cells.map(rotFn));
  }

  /** Face-connected polycubes with 1, 2, 3, or 4 unit cubes only. */
  const PIECE_TEMPLATES = [
    { name: "Mono", color: 0xf4d35e, cells: normalizeCells([[0, 0, 0]]) },
    {
      name: "DominoX",
      color: 0x4cc9f0,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
      ]),
    },
    {
      name: "DominoY",
      color: 0x4895ef,
      cells: normalizeCells([
        [0, 0, 0],
        [0, 1, 0],
      ]),
    },
    {
      name: "TriLine",
      color: 0x5dd39e,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
    },
    {
      name: "TriL",
      color: 0xff9f1c,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
    },
    {
      name: "TriCorner",
      color: 0xb388eb,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
      ]),
    },
    {
      name: "TetLine",
      color: 0x4cc9f0,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ]),
    },
    {
      name: "TetFlatXZ",
      color: 0xf4d35e,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
        [1, 0, 1],
      ]),
    },
    {
      name: "TetFlatXY",
      color: 0x5dd39e,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ]),
    },
    {
      name: "TetL",
      color: 0xff9f1c,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [0, 1, 0],
      ]),
    },
    {
      name: "TetT",
      color: 0xff6b6b,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [1, 0, 1],
      ]),
    },
    {
      name: "TetS",
      color: 0x9ef01a,
      cells: normalizeCells([
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [2, 0, 1],
      ]),
    },
  ];

  const container = document.getElementById("board3d");
  const scoreEl = document.getElementById("score3d");
  const linesEl = document.getElementById("lines3d");
  const speedLevelEl = document.getElementById("speed-level-3d");
  const speedSelectEl = document.getElementById("speed-select-3d");
  const statusEl = document.getElementById("status3d");
  const restartBtn = document.getElementById("restart-3d");
  const pauseBtn = document.getElementById("pause-3d");
  const nextCanvas = document.getElementById("next3d");
  const nextCtx = nextCanvas.getContext("2d");
  const comboToastEl = document.getElementById("combo-toast-3d");

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
  let sceneDirty = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d16);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(9, 11, 13);
  camera.lookAt(0, -4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0x8899ff, 0x222233, 0.55);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(6, 12, 8);
  scene.add(dir);

  const pitGroup = new THREE.Group();
  scene.add(pitGroup);

  const sharedGeom = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2d3557 });

  function fitRenderer() {
    const w = Math.max(container.clientWidth, 320);
    const h = Math.max(container.clientHeight, 400);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function createEmptyBoard() {
    return Array.from({ length: H }, () =>
      Array.from({ length: W }, () => Array(D).fill(null))
    );
  }

  function getDropIntervalMs(level) {
    const clamped = Math.max(MIN_SPEED_LEVEL, Math.min(MAX_SPEED_LEVEL, level));
    const slowestMs = 1000;
    const fastestMs = 120;
    const progress =
      (clamped - MIN_SPEED_LEVEL) / (MAX_SPEED_LEVEL - MIN_SPEED_LEVEL);
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

  function gridToWorld(x, y, z) {
    const ox = x - (W - 1) / 2;
    const oz = z - (D - 1) / 2;
    const oy = -y;
    return new THREE.Vector3(ox, oy, oz);
  }

  function rebuildMeshes() {
    while (pitGroup.children.length > 0) {
      const ch = pitGroup.children[0];
      pitGroup.remove(ch);
      if (ch.material) {
        ch.material.dispose();
      }
    }

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        for (let z = 0; z < D; z += 1) {
          const col = board[y][x][z];
          if (col) {
            const mesh = new THREE.Mesh(
              sharedGeom,
              new THREE.MeshLambertMaterial({ color: col })
            );
            mesh.position.copy(gridToWorld(x, y, z));
            pitGroup.add(mesh);
          }
        }
      }
    }

    if (current) {
      for (const [dx, dy, dz] of current.cells) {
        const gx = current.x + dx;
        const gy = current.y + dy;
        const gz = current.z + dz;
        if (gy < 0 || gy >= H) {
          continue;
        }
        const mesh = new THREE.Mesh(
          sharedGeom,
          new THREE.MeshLambertMaterial({
            color: current.color,
            emissive: 0x111111,
          })
        );
        mesh.position.copy(gridToWorld(gx, gy, gz));
        pitGroup.add(mesh);
      }
    }
  }

  function randomTemplate() {
    return PIECE_TEMPLATES[
      Math.floor(Math.random() * PIECE_TEMPLATES.length)
    ];
  }

  function pieceFromTemplate(t) {
    const cells = t.cells.map((c) => [c[0], c[1], c[2]]);
    return {
      name: t.name,
      color: t.color,
      cells,
      x: 0,
      y: 0,
      z: 0,
    };
  }

  function collides(p, ox, oy, oz, cells) {
    const c = cells || p.cells;
    for (let i = 0; i < c.length; i += 1) {
      const [dx, dy, dz] = c[i];
      const gx = p.x + dx + ox;
      const gy = p.y + dy + oy;
      const gz = p.z + dz + oz;
      if (gx < 0 || gx >= W || gz < 0 || gz >= D || gy >= H) {
        return true;
      }
      if (gy >= 0 && board[gy][gx][gz]) {
        return true;
      }
    }
    return false;
  }

  function mergePiece(p) {
    for (let i = 0; i < p.cells.length; i += 1) {
      const [dx, dy, dz] = p.cells[i];
      const gy = p.y + dy;
      const gx = p.x + dx;
      const gz = p.z + dz;
      if (gy >= 0 && gy < H && gx >= 0 && gx < W && gz >= 0 && gz < D) {
        board[gy][gx][gz] = p.color;
      }
    }
  }

  function layerFull(y) {
    for (let x = 0; x < W; x += 1) {
      for (let z = 0; z < D; z += 1) {
        if (!board[y][x][z]) {
          return false;
        }
      }
    }
    return true;
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

  function clearLayers() {
    let cleared = 0;
    for (let y = H - 1; y >= 0; y -= 1) {
      if (layerFull(y)) {
        board.splice(y, 1);
        board.unshift(
          Array.from({ length: W }, () => Array(D).fill(null))
        );
        cleared += 1;
        y += 1;
      }
    }
    if (cleared > 0) {
      lines += cleared;
      const base = cleared * LAYER_CLEAR_POINTS;
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
      nextPiece = pieceFromTemplate(randomTemplate());
    }
    current = nextPiece;
    const maxX = Math.max(...current.cells.map((c) => c[0]));
    const maxZ = Math.max(...current.cells.map((c) => c[2]));
    current.x = Math.floor((W - (maxX + 1)) / 2);
    current.z = Math.floor((D - (maxZ + 1)) / 2);
    current.y = 0;
    nextPiece = pieceFromTemplate(randomTemplate());
    drawNextPreview();
    sceneDirty = true;

    if (collides(current, 0, 0, 0)) {
      gameOver = true;
      paused = false;
      statusEl.textContent = "Game Over - Press Restart";
      syncPauseButton();
    }
  }

  function lockAndContinue() {
    mergePiece(current);
    clearLayers();
    spawnPiece();
  }

  function tryMove(ox, oy, oz) {
    if (!current || gameOver || paused) {
      return;
    }
    if (!collides(current, ox, oy, oz)) {
      current.x += ox;
      current.y += oy;
      current.z += oz;
      sceneDirty = true;
    }
  }

  function softDrop(withPoints = false) {
    if (!current || gameOver || paused) {
      return;
    }
    if (!collides(current, 0, 1, 0)) {
      current.y += 1;
      if (withPoints) {
        score += SOFT_DROP_POINTS_PER_LINE;
        updateHud();
      }
      sceneDirty = true;
    } else {
      lockAndContinue();
      sceneDirty = true;
    }
  }

  function hardDrop() {
    if (!current || gameOver || paused) {
      return;
    }
    let droppedLines = 0;
    while (!collides(current, 0, 1, 0)) {
      current.y += 1;
      droppedLines += 1;
    }
    score += droppedLines * HARD_DROP_POINTS_PER_LINE;
    updateHud();
    lockAndContinue();
    sceneDirty = true;
  }

  function tryRotate(rotFn) {
    if (!current || gameOver || paused) {
      return;
    }
    const nextCells = rotateCells(current.cells, rotFn);
    if (!collides(current, 0, 0, 0, nextCells)) {
      current.cells = nextCells;
      sceneDirty = true;
      return;
    }
    const kicks = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [1, 0, 1],
      [-1, 0, -1],
    ];
    for (let k = 0; k < kicks.length; k += 1) {
      const [kx, ky, kz] = kicks[k];
      if (!collides(current, kx, ky, kz, nextCells)) {
        current.x += kx;
        current.y += ky;
        current.z += kz;
        current.cells = nextCells;
        sceneDirty = true;
        return;
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    speedLevelEl.textContent = String(speedLevel);
  }

  function drawNextPreview() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) {
      return;
    }
    const cells = nextPiece.cells;
    const colorHex = "#" + new THREE.Color(nextPiece.color).getHexString();
    const k = 10;
    const cx = nextCanvas.width / 2;
    const cy = nextCanvas.height / 2 + 8;
    const sorted = [...cells].sort(
      (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2])
    );
    for (let i = 0; i < sorted.length; i += 1) {
      const [x, y, z] = sorted[i];
      const u = (x - z) * k + cx;
      const v = (x + z) * (k * 0.5) - y * k + cy;
      nextCtx.fillStyle = colorHex;
      nextCtx.strokeStyle = "#101427";
      nextCtx.beginPath();
      nextCtx.moveTo(u, v - k * 0.55);
      nextCtx.lineTo(u + k * 0.65, v);
      nextCtx.lineTo(u, v + k * 0.55);
      nextCtx.lineTo(u - k * 0.65, v);
      nextCtx.closePath();
      nextCtx.fill();
      nextCtx.stroke();
    }
  }

  function startGame() {
    if (comboToastCleanupId !== null) {
      window.clearTimeout(comboToastCleanupId);
      comboToastCleanupId = null;
    }
    hideComboToast();
    board = createEmptyBoard();
    score = 0;
    lines = 0;
    setSpeedLevel(Number(speedSelectEl.value) || START_SPEED_LEVEL);
    nextPiece = pieceFromTemplate(randomTemplate());
    updateHud();
    gameOver = false;
    paused = false;
    lastTick = 0;
    statusEl.textContent = "Running";
    spawnPiece();
    sceneDirty = true;
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

  function tick(timestamp) {
    if (!lastTick) {
      lastTick = timestamp;
    }
    const delta = timestamp - lastTick;
    if (!gameOver && !paused && delta >= dropInterval) {
      softDrop();
      lastTick = timestamp;
    }
    if (sceneDirty) {
      rebuildMeshes();
      sceneDirty = false;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && gameOver) {
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
      event.preventDefault();
      tryMove(-1, 0, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      tryMove(1, 0, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      tryMove(0, 0, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      tryMove(0, 0, 1);
    } else if (event.key === "s" || event.key === "S") {
      softDrop(true);
      sceneDirty = true;
    } else if (event.key === "q" || event.key === "Q") {
      tryRotate(rotX);
    } else if (event.key === "w" || event.key === "W") {
      tryRotate(rotY);
    } else if (event.key === "e" || event.key === "E") {
      tryRotate(rotZ);
    } else if (event.code === "Space") {
      event.preventDefault();
      hardDrop();
    }
  }

  function onResize() {
    fitRenderer();
  }

  restartBtn.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", function () {
    togglePause();
  });
  speedSelectEl.addEventListener("change", function () {
    setSpeedLevel(Number(speedSelectEl.value) || START_SPEED_LEVEL);
    lastTick = 0;
  });
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeyDown);

  (function addPitWireframe() {
    const pitGeom = new THREE.BoxGeometry(W, H, D);
    const edges = new THREE.EdgesGeometry(pitGeom);
    const line = new THREE.LineSegments(edges, wireMat);
    line.position.set(0, -(H - 1) / 2, 0);
    line.name = "pitWire";
    scene.add(line);
  })();

  fitRenderer();
  setSpeedLevel(Number(speedSelectEl.value) || START_SPEED_LEVEL);
  updateHud();
  drawNextPreview();
  syncPauseButton();
  requestAnimationFrame(tick);
})();
