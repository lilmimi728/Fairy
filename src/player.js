/* player.js — the fairy: smooth pixel movement + facing direction. */

const Player = {
  x: 9,        // tile coords (float)
  y: 9,
  dir: 0,      // 0 down, 1 up, 2 left, 3 right
  speed: 4.2,  // tiles per second
  moving: false,

  reset() {
    this.x = 9; this.y = 9; this.dir = 0; this.moving = false;
  },

  update(dt) {
    let dx = 0, dy = 0;
    const k = Input.keys;
    if (k["a"] || k["arrowleft"]) dx -= 1;
    if (k["d"] || k["arrowright"]) dx += 1;
    if (k["w"] || k["arrowup"]) dy -= 1;
    if (k["s"] || k["arrowdown"]) dy += 1;

    this.moving = dx !== 0 || dy !== 0;
    if (dx < 0) this.dir = 2;
    else if (dx > 0) this.dir = 3;
    else if (dy < 0) this.dir = 1;
    else if (dy > 0) this.dir = 0;

    // normalize diagonal speed
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    const step = this.speed * dt;
    const nx = this.x + dx * step;
    const ny = this.y + dy * step;

    // axis-separated collision against tile centers
    if (World.walkable(Math.round(nx), Math.round(this.y))) this.x = nx;
    if (World.walkable(Math.round(this.x), Math.round(ny))) this.y = ny;

    // keep on the field
    this.x = Math.max(0.5, Math.min(World.cols - 1.5, this.x));
    this.y = Math.max(0.5, Math.min(World.rows - 1.5, this.y));
  },

  // the tile directly in front of the fairy
  facingTile() {
    const cx = Math.round(this.x);
    const cy = Math.round(this.y);
    const d = [[0, 1], [0, -1], [-1, 0], [1, 0]][this.dir];
    return { x: cx + d[0], y: cy + d[1] };
  },
};

window.Player = Player;
