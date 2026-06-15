/* world.js — the tile map, terrain and crop state. */

const COLS = 20;
const ROWS = 15;

// terrain ids
const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, SOIL: 4 };

const World = {
  cols: COLS,
  rows: ROWS,
  terrain: [],   // 2D array of T.*
  tiles: [],     // 2D array of per-tile state { watered, crop }

  init() {
    this.terrain = [];
    this.tiles = [];
    for (let y = 0; y < ROWS; y++) {
      const trow = [];
      const srow = [];
      for (let x = 0; x < COLS; x++) {
        let t = T.GRASS;
        // leafy border of trees
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) t = T.TREE;
        trow.push(t);
        srow.push({ watered: false, crop: null });
      }
      this.terrain.push(trow);
      this.tiles.push(srow);
    }

    // a little stone path down the middle-ish
    for (let x = 2; x < COLS - 2; x++) this.terrain[7][x] = T.PATH;
    for (let y = 2; y < 7; y++) this.terrain[y][10] = T.PATH;

    // a pond in the lower-left
    const pond = [
      [3, 10], [4, 10], [5, 10], [3, 11], [4, 11], [5, 11],
      [4, 12], [3, 12], [2, 11],
    ];
    pond.forEach(([x, y]) => { this.terrain[y][x] = T.WATER; });

    // a couple of decorative trees inside
    [[15, 3], [16, 3], [15, 11], [3, 3]].forEach(([x, y]) => {
      this.terrain[y][x] = T.TREE;
    });
  },

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  },

  // can the fairy occupy this tile? (she floats, but not over trees/water/border)
  walkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const t = this.terrain[y][x];
    return t !== T.TREE && t !== T.WATER;
  },

  isTillable(x, y) {
    return this.inBounds(x, y) && this.terrain[y][x] === T.GRASS;
  },

  isWaterTile(x, y) {
    return this.inBounds(x, y) && this.terrain[y][x] === T.WATER;
  },

  tileAt(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : null;
  },

  // crops grow when watered; this is called each frame with dt seconds
  update(dt, isDay) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const s = this.tiles[y][x];
        if (!s.crop) continue;
        if (s.watered && s.crop.stage < 4 && isDay) {
          s.crop.growth += dt;
          if (s.crop.growth >= s.crop.perStage) {
            s.crop.growth = 0;
            s.crop.stage++;
            s.watered = false; // needs watering again to advance
            this.terrain[y][x] = T.SOIL;
          }
        }
      }
    }
  },

  // --- actions, return a result string for the toast (or null) ---

  till(x, y) {
    if (!this.isTillable(x, y)) return null;
    this.terrain[y][x] = T.SOIL;
    return "Tilled the soil.";
  },

  plant(x, y, hue) {
    if (!this.inBounds(x, y)) return null;
    if (this.terrain[y][x] !== T.SOIL) return null;
    const s = this.tiles[y][x];
    if (s.crop) return null;
    s.crop = { stage: 0, growth: 0, perStage: 6, hue };
    return "Planted a magic seed.";
  },

  water(x, y) {
    if (!this.inBounds(x, y)) return null;
    if (this.terrain[y][x] !== T.SOIL) return null;
    const s = this.tiles[y][x];
    if (s.watered) return null;
    s.watered = true;
    return "Watered the soil.";
  },

  // returns dust value if harvested, else null
  harvest(x, y) {
    if (!this.inBounds(x, y)) return null;
    const s = this.tiles[y][x];
    if (s.crop && s.crop.stage >= 4) {
      s.crop = null;
      s.watered = false;
      return 5; // fairy dust reward
    }
    return null;
  },
};

window.World = World;
window.T = T;
