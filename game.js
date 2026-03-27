// BlockWorld – mini monde ouvert 2D (version améliorée)

(function () {
  const TILE_SIZE = 32;
  const WORLD_WIDTH = 200;
  const WORLD_HEIGHT = 64;
  const GRAVITY = 0.35;
  const MOVE_SPEED = 0.18;
  const JUMP_SPEED = -7.5;
  const MAX_FALL_SPEED = 12;
  const SAVE_KEY = "blockworld-save-v2"; // v2 pour repartir sur une save propre

  const TILE = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAF: 5
  };

  const BLOCKS = [
    { id: TILE.AIR, name: "Air", emoji: "⬛", solid: false },
    { id: TILE.GRASS, name: "Herbe", emoji: "🟩", solid: true },
    { id: TILE.DIRT, name: "Terre", emoji: "🟫", solid: true },
    { id: TILE.STONE, name: "Pierre", emoji: "⬜", solid: true },
    { id: TILE.WOOD, name: "Bois", emoji: "🟫", solid: true },
    { id: TILE.LEAF, name: "Feuilles", emoji: "🟩", solid: false }
  ];

  const INVENTORY_SLOTS = [
    { id: TILE.DIRT },
    { id: TILE.STONE },
    { id: TILE.WOOD },
    { id: TILE.LEAF }
  ];

  let canvas, ctx;
  let width = 0;
  let height = 0;

  let world = null;
  let player = null;
  let camera = { x: 0, y: 0 };
  let keys = {};
  let mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
  let selectedSlot = 0;
  let lastTime = 0;
  let fps = 0;

  const ui = {
    fps: null,
    pos: null,
    inventory: null
  };

  // --- WORLD UTILS ----------------------------------------------------------

  function createEmptyWorld() {
    const arr = new Array(WORLD_WIDTH * WORLD_HEIGHT);
    arr.fill(TILE.AIR);
    return arr;
  }

  function index(x, y) {
    return y * WORLD_WIDTH + x;
  }

  function getTile(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return TILE.AIR;
    return world[index(x, y)];
  }

  function setTile(x, y, id) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    world[index(x, y)] = id;
  }

  function generateWorld() {
    world = createEmptyWorld();

    // Hauteur de base du sol (plus haut = plus de sol)
    let h = 45;

    for (let x = 0; x < WORLD_WIDTH; x++) {
      // Variation douce du terrain
      h += (Math.random() - 0.5) * 1.5;
      if (h < 35) h = 35;
      if (h > 55) h = 55;

      // Génération du sol
      for (let y = Math.floor(h); y < WORLD_HEIGHT; y++) {
        if (y === Math.floor(h)) {
          setTile(x, y, TILE.GRASS);
        } else if (y < h + 4) {
          setTile(x, y, TILE.DIRT);
        } else {
          setTile(x, y, TILE.STONE);
        }
      }

      // Arbres
      if (Math.random() < 0.07) {
        const trunkHeight = 3 + Math.floor(Math.random() * 3);
        const baseY = Math.floor(h) - 1;

        // Tronc
        for (let ty = 0; ty < trunkHeight; ty++) {
          setTile(x, baseY - ty, TILE.WOOD);
        }

        // Feuilles
        const topY = baseY - trunkHeight;
        for (let lx = -2; lx <= 2; lx++) {
          for (let ly = -2; ly <= 1; ly++) {
            if (Math.abs(lx) + Math.abs(ly) <= 3) {
              setTile(x + lx, topY + ly, TILE.LEAF);
            }
          }
        }
      }
    }
  }

  function findSurfaceX(x) {
    x = Math.max(0, Math.min(WORLD_WIDTH - 1, x));
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const id = getTile(x, y);
      const block = BLOCKS.find(b => b.id === id);
      if (block && block.solid) {
        return { x, y };
      }
    }
    return { x, y: WORLD_HEIGHT - 1 };
  }

  // --- PLAYER ---------------------------------------------------------------

  function createDefaultPlayer() {
    const centerX = Math.floor(WORLD_WIDTH / 2);
    const surface = findSurfaceX(centerX);

    const px = (surface.x + 0.5) * TILE_SIZE;
    const py = surface.y * TILE_SIZE; // on se place juste au-dessus du bloc

    return {
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      width: 20,
      height: 30,
      onGround: false,
      spawnX: px,
      spawnY: py,
      inventory: {
        [TILE.DIRT]: 20,
        [TILE.STONE]: 10,
        [TILE.WOOD]: 10,
        [TILE.LEAF]: 10
      }
    };
  }

  function respawnPlayer() {
    player.x = player.spawnX;
    player.y = player.spawnY;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
  }

  // --- SAVE / LOAD ----------------------------------------------------------

  function saveGame() {
    try {
      const data = {
        world,
        player,
        selectedSlot
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.world) || !data.player) return false;
      if (data.world.length !== WORLD_WIDTH * WORLD_HEIGHT) return false;
      world = data.world;
      player = data.player;
      selectedSlot = data.selectedSlot || 0;
      return true;
    } catch {
      return false;
    }
  }

  // --- CANVAS / INPUT -------------------------------------------------------

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    width = rect.width;
    height = rect.height;
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      keys[e.key.toLowerCase()] = true;

      if (e.key >= "1" && e.key <= "4") {
        selectedSlot = Number(e.key) - 1;
        updateInventoryUI();
      }
    });

    window.addEventListener("keyup", (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.worldX = camera.x + mouse.x;
      mouse.worldY = camera.y + mouse.y;
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        handleBreakBlock();
      } else if (e.button === 2) {
        handlePlaceBlock();
      }
    });
  }

  // --- INTERACTIONS ---------------------------------------------------------

  function handleBreakBlock() {
    const tx = Math.floor(mouse.worldX / TILE_SIZE);
    const ty = Math.floor(mouse.worldY / TILE_SIZE);
    const id = getTile(tx, ty);
    if (id === TILE.AIR) return;

    setTile(tx, ty, TILE.AIR);

    if (player.inventory[id] !== undefined) {
      player.inventory[id] += 1;
    }

    saveGame();
    updateInventoryUI();
  }

  function handlePlaceBlock() {
    const slot = INVENTORY_SLOTS[selectedSlot];
    if (!slot) return;
    const blockId = slot.id;
    if (!player.inventory[blockId] || player.inventory[blockId] <= 0) return;

    const tx = Math.floor(mouse.worldX / TILE_SIZE);
    const ty = Math.floor(mouse.worldY / TILE_SIZE);
    const id = getTile(tx, ty);
    if (id !== TILE.AIR) return;

    const px1 = player.x - player.width / 2;
    const px2 = player.x + player.width / 2;
    const py1 = player.y - player.height;
    const py2 = player.y;

    const bx1 = tx * TILE_SIZE;
    const bx2 = bx1 + TILE_SIZE;
    const by1 = ty * TILE_SIZE;
    const by2 = by1 + TILE_SIZE;

    if (!(bx2 <= px1 || bx1 >= px2 || by2 <= py1 || by1 >= py2)) {
      return;
    }

    setTile(tx, ty, blockId);
    player.inventory[blockId] -= 1;

    saveGame();
    updateInventoryUI();
  }

  // --- PHYSIQUE / MOUVEMENT -------------------------------------------------

  function updatePlayer(dt) {
    let move = 0;
    if (keys["a"] || keys["arrowleft"]) move -= 1;
    if (keys["d"] || keys["arrowright"]) move += 1;

    player.vx = move * MOVE_SPEED * dt * 60;

    const jumpPressed = keys["w"] || keys["arrowup"] || keys[" "];
    if (jumpPressed && player.onGround) {
      player.vy = JUMP_SPEED;
      player.onGround = false;
    }

    player.vy += GRAVITY * dt * 60;
    if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

    movePlayerAxis("x", player.vx * dt * 60);
    movePlayerAxis("y", player.vy * dt * 60);

    if (player.y > WORLD_HEIGHT * TILE_SIZE + 300) {
      respawnPlayer();
    }
  }

  function movePlayerAxis(axis, delta) {
    if (delta === 0) return;

    if (axis === "x") {
      player.x += delta;

      const halfW = player.width / 2;
      const top = player.y - player.height;
      const bottom = player.y;

      const leftTile = Math.floor((player.x - halfW) / TILE_SIZE);
      const rightTile = Math.floor((player.x + halfW - 1) / TILE_SIZE);
      const topTile = Math.floor(top / TILE_SIZE);
      const bottomTile = Math.floor((bottom - 1) / TILE_SIZE);

      for (let ty = topTile; ty <= bottomTile; ty++) {
        for (let tx = leftTile; tx <= rightTile; tx++) {
          const id = getTile(tx, ty);
          const block = BLOCKS.find(b => b.id === id);
          if (!block || !block.solid) continue;

          const bx1 = tx * TILE_SIZE;
          const bx2 = bx1 + TILE_SIZE;

          if (delta > 0) {
            const overlap = (player.x + halfW) - bx1;
            if (overlap > 0) {
              player.x -= overlap;
            }
          } else {
            const overlap = bx2 - (player.x - halfW);
            if (overlap > 0) {
              player.x += overlap;
            }
          }
        }
      }
    } else if (axis === "y") {
      player.y += delta;

      const halfW = player.width / 2;
      const top = player.y - player.height;
      const bottom = player.y;

      const leftTile = Math.floor((player.x - halfW) / TILE_SIZE);
      const rightTile = Math.floor((player.x + halfW - 1) / TILE_SIZE);
      const topTile = Math.floor(top / TILE_SIZE);
      const bottomTile = Math.floor((bottom - 1) / TILE_SIZE);

      player.onGround = false;

      for (let ty = topTile; ty <= bottomTile; ty++) {
        for (let tx = leftTile; tx <= rightTile; tx++) {
          const id = getTile(tx, ty);
          const block = BLOCKS.find(b => b.id === id);
          if (!block || !block.solid) continue;

          const by1 = ty * TILE_SIZE;
          const by2 = by1 + TILE_SIZE;

          if (delta > 0) {
            const overlap = bottom - by1;
            if (overlap > 0) {
              player.y -= overlap;
              player.vy = 0;
              player.onGround = true;
            }
          } else {
            const overlap = by2 - top;
            if (overlap > 0) {
              player.y += overlap;
              player.vy = 0;
            }
          }
        }
      }
    }
  }

  // --- CAMERA / RENDER ------------------------------------------------------

  function updateCamera() {
    camera.x = player.x - width / 2;
    camera.y = player.y - height / 2;

    const maxX = WORLD_WIDTH * TILE_SIZE - width;
    const maxY = WORLD_HEIGHT * TILE_SIZE - height;

    if (camera.x < 0) camera.x = 0;
    if (camera.y < 0) camera.y = 0;
    if (camera.x > maxX) camera.x = maxX;
    if (camera.y > maxY) camera.y = maxY;
  }

  function drawWorld() {
    const startX = Math.floor(camera.x / TILE_SIZE);
    const endX = Math.ceil((camera.x + width) / TILE_SIZE);
    const startY = Math.floor(camera.y / TILE_SIZE);
    const endY = Math.ceil((camera.y + height) / TILE_SIZE);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const id = getTile(x, y);
        if (id === TILE.AIR) continue;

        const sx = x * TILE_SIZE - camera.x;
        const sy = y * TILE_SIZE - camera.y;

        if (id === TILE.GRASS) {
          ctx.fillStyle = "#16a34a";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#166534";
          ctx.fillRect(sx, sy + TILE_SIZE - 6, TILE_SIZE, 6);
        } else if (id === TILE.DIRT) {
          ctx.fillStyle = "#854d0e";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        } else if (id === TILE.STONE) {
          ctx.fillStyle = "#6b7280";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#4b5563";
          ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (id === TILE.WOOD) {
          ctx.fillStyle = "#92400e";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = "#451a03";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx + TILE_SIZE * 0.3, sy);
          ctx.lineTo(sx + TILE_SIZE * 0.3, sy + TILE_SIZE);
          ctx.moveTo(sx + TILE_SIZE * 0.7, sy);
          ctx.lineTo(sx + TILE_SIZE * 0.7, sy + TILE_SIZE);
          ctx.stroke();
        } else if (id === TILE.LEAF) {
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "rgba(34,197,94,0.7)";
          ctx.beginPath();
          ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE / 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPlayer() {
    const sx = player.x - camera.x;
    const sy = player.y - camera.y;

    ctx.fillStyle = "#f97316";
    ctx.fillRect(
      sx - player.width / 2,
      sy - player.height,
      player.width,
      player.height
    );

    ctx.fillStyle = "#facc15";
    ctx.fillRect(
      sx - player.width / 2 + 4,
      sy - player.height + 4,
      player.width - 8,
      player.height / 3
    );
  }

  function drawCrosshair() {
    const size = 8;
    const x = mouse.x;
    const y = mouse.y;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, "#0f172a");
    skyGradient.addColorStop(1, "#020617");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    drawWorld();
    drawPlayer();
    drawCrosshair();
  }

  // --- UI -------------------------------------------------------------------

  function updateUI() {
    if (ui.fps) ui.fps.textContent = "FPS: " + fps.toFixed(0);
    if (ui.pos) {
      const tx = (player.x / TILE_SIZE).toFixed(1);
      const ty = (player.y / TILE_SIZE).toFixed(1);
      ui.pos.textContent = "X: " + tx + " Y: " + ty;
    }
  }

  function updateInventoryUI() {
    if (!ui.inventory) return;
    ui.inventory.innerHTML = "";

    INVENTORY_SLOTS.forEach((slot, i) => {
      const block = BLOCKS.find(b => b.id === slot.id);
      const div = document.createElement("div");
      div.className = "inv-slot";
      if (i === selectedSlot) div.classList.add("selected");

      const emoji = document.createElement("div");
      emoji.className = "inv-emoji";
      emoji.textContent = block ? block.emoji : "?";

      const name = document.createElement("div");
      name.className = "inv-name";
      name.textContent = block ? block.name : "Bloc";

      const count = document.createElement("div");
      count.className = "inv-count";
      const qty = player.inventory[slot.id] || 0;
      count.textContent = `x${qty} • ${i + 1}`;

      div.appendChild(emoji);
      div.appendChild(name);
      div.appendChild(count);

      ui.inventory.appendChild(div);
    });
  }

  // --- LOOP -----------------------------------------------------------------

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    const alpha = 0.1;
    const currentFps = 1 / Math.max(dt, 0.0001);
    fps = fps * (1 - alpha) + currentFps * alpha;

    updatePlayer(dt);
    updateCamera();
    saveGame();
    updateUI();
    render();

    requestAnimationFrame(loop);
  }

  // --- INIT -----------------------------------------------------------------

  function init() {
    canvas = document.getElementById("game-canvas");
    ctx = canvas.getContext("2d");

    ui.fps = document.getElementById("ui-fps");
    ui.pos = document.getElementById("ui-pos");
    ui.inventory = document.getElementById("ui-inventory");

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    if (!loadGame()) {
      generateWorld();
      player = createDefaultPlayer();
      saveGame();
    }

    setupInput();
    updateInventoryUI();
    updateUI();

    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
