/* game.js — main loop, rendering, day/night, tools and HUD. */

(function () {
  const { TILE, SCALE, PX, drawGrass, drawPath, drawSoil, drawWater, drawTree,
          drawCrop, drawFairy } = window.Art;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ---- tools ----
  const TOOLS = [
    { id: "hoe",     name: "Hoe",     icon: "⛏️", key: "1" },
    { id: "seeds",   name: "Seeds",   icon: "🌱", key: "2" },
    { id: "water",   name: "Water",   icon: "🪣", key: "3" },
    { id: "harvest", name: "Harvest", icon: "🧺", key: "4" },
  ];

  const state = {
    running: false,
    time: 0,           // animation clock (seconds)
    selected: 0,       // tool index
    dust: 0,
    water: 10,
    waterMax: 10,
    seedHue: 0,        // cycles flower colors as you plant
    // day/night: a full day is DAY_LEN seconds, starts at 06:00
    clock: 6 * 60,     // minutes since midnight
    day: 1,
  };
  const DAY_LEN = 90;            // seconds of real time per in-game day
  const MIN_PER_SEC = (24 * 60) / DAY_LEN;

  // ---- HUD ----
  const hotbar = document.getElementById("hotbar");
  const elClock = document.getElementById("clock");
  const elPhase = document.getElementById("phase");
  const elDust = document.getElementById("dust");
  const elWater = document.getElementById("water");
  const elToast = document.getElementById("toast");

  function buildHotbar() {
    hotbar.innerHTML = "";
    TOOLS.forEach((tool, i) => {
      const slot = document.createElement("div");
      slot.className = "slot" + (i === state.selected ? " active" : "");
      slot.innerHTML =
        `<span class="key">${tool.key}</span>` +
        `<span class="icon">${tool.icon}</span>` +
        `<span class="label">${tool.name}</span>`;
      slot.addEventListener("click", () => { state.selected = i; buildHotbar(); });
      hotbar.appendChild(slot);
    });
  }

  let toastTimer = 0;
  function toast(msg) {
    if (!msg) return;
    elToast.textContent = msg;
    elToast.classList.add("show");
    toastTimer = 2;
  }

  function phaseOf(min) {
    if (min < 5 * 60) return ["Night", 0.55];
    if (min < 8 * 60) return ["Morning", 0.12];
    if (min < 17 * 60) return ["Day", 0.0];
    if (min < 20 * 60) return ["Evening", 0.22];
    return ["Night", 0.5];
  }

  function fmtClock(min) {
    const h = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60 / 10) * 10;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function isDayTime() {
    return state.clock >= 6 * 60 && state.clock < 19 * 60;
  }

  // ---- actions ----
  function useToolAt(tx, ty) {
    const tool = TOOLS[state.selected].id;
    let msg = null;
    if (tool === "hoe") {
      msg = World.till(tx, ty);
    } else if (tool === "seeds") {
      msg = World.plant(tx, ty, state.seedHue);
      if (msg) state.seedHue = (state.seedHue + 1) % 3;
    } else if (tool === "water") {
      if (state.water <= 0) { toast("Watering can is empty — press R at the pond."); return; }
      msg = World.water(tx, ty);
      if (msg) { state.water--; }
    } else if (tool === "harvest") {
      const reward = World.harvest(tx, ty);
      if (reward) { state.dust += reward; msg = `Harvested a glowing bloom! +${reward} ✨`; }
    }
    toast(msg);
  }

  function tryRefill() {
    // refill if standing next to a water tile
    const cx = Math.round(Player.x), cy = Math.round(Player.y);
    const near = [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
      World.isWaterTile(cx + dx, cy + dy));
    if (near) {
      state.water = state.waterMax;
      toast("Refilled the watering can. 💧");
    } else {
      toast("Stand by the pond to refill.");
    }
  }

  // ---- rendering ----
  function render() {
    // terrain
    for (let y = 0; y < World.rows; y++) {
      for (let x = 0; x < World.cols; x++) {
        const ox = x * TILE, oy = y * TILE;
        const t = World.terrain[y][x];
        const s = World.tiles[y][x];
        switch (t) {
          case T.GRASS: drawGrass(ctx, ox, oy, x, y); break;
          case T.PATH:  drawPath(ctx, ox, oy, x, y); break;
          case T.WATER: drawWater(ctx, ox, oy, x, y, state.time); break;
          case T.TREE:  drawGrass(ctx, ox, oy, x, y); drawTree(ctx, ox, oy); break;
          case T.SOIL:  drawSoil(ctx, ox, oy, x, y, s.watered); break;
        }
        if (s.crop) drawCrop(ctx, ox, oy, s.crop.stage, state.time, s.crop.hue);
      }
    }

    // highlight the tile the fairy faces
    const f = Player.facingTile();
    if (World.inBounds(f.x, f.y)) {
      ctx.strokeStyle = "rgba(255,233,168,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x * PX + 2, f.y * PX + 2, PX - 4, PX - 4);
    }

    // the fairy
    drawFairy(ctx, Player.x * TILE, Player.y * TILE, Player.dir, state.time, Player.moving);

    // day/night tint
    const [, darkness] = phaseOf(state.clock);
    if (darkness > 0) {
      ctx.fillStyle = `rgba(20,15,50,${darkness})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ---- main loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (state.running) {
      state.time += dt;

      // time of day
      state.clock += dt * MIN_PER_SEC;
      if (state.clock >= 24 * 60) {
        state.clock -= 24 * 60;
        state.day++;
        toast(`A new day dawns — Day ${state.day}.`);
      }

      Player.update(dt);
      World.update(dt, isDayTime());

      // tool switching
      TOOLS.forEach((tool, i) => {
        if (Input.takePress(tool.key)) { state.selected = i; buildHotbar(); }
      });
      if (Input.takePress("r")) tryRefill();

      // use tool: keyboard on facing tile
      if (Input.takePress(" ") || Input.takePress("e")) {
        const f = Player.facingTile();
        useToolAt(f.x, f.y);
      }
      // use tool: mouse click within range
      if (Input.takeClick()) {
        const tx = Math.floor(Input.mouse.x / PX);
        const ty = Math.floor(Input.mouse.y / PX);
        const dist = Math.abs(tx - Player.x) + Math.abs(ty - Player.y);
        if (dist <= 2.5) useToolAt(tx, ty);
        else toast("Too far away — fly closer.");
      }

      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) elToast.classList.remove("show");
      }

      Input.endFrame();
    }

    render();

    // HUD
    const [phase] = phaseOf(state.clock);
    elClock.textContent = `Day ${state.day} · ${fmtClock(state.clock)}`;
    elPhase.textContent = phase;
    elDust.textContent = `✨ ${state.dust}`;
    elWater.textContent = `💧 ${state.water}/${state.waterMax}`;

    requestAnimationFrame(frame);
  }

  // ---- boot ----
  function start() {
    World.init();
    Player.reset();
    buildHotbar();
    state.running = true;
    document.getElementById("overlay").classList.add("hidden");
  }

  Input.init(canvas);
  document.getElementById("startBtn").addEventListener("click", start);
  World.init();      // so the garden is visible behind the title overlay
  Player.reset();
  buildHotbar();
  render();
  requestAnimationFrame(frame);
})();
