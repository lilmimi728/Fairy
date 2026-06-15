/* sprites.js
 * Procedural pixel-art drawing helpers. Everything is rendered from code at a
 * base resolution of TILE px and then the whole canvas is scaled up with
 * image-rendering: pixelated, giving a crisp Stardew-ish look without any
 * external image assets.
 */

const TILE = 16;        // logical pixels per tile
const SCALE = 3;        // on-screen scale factor
const PX = TILE * SCALE; // 48px tiles on screen

// A tiny deterministic hash so each tile's speckles stay put frame to frame.
function tileRand(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695040) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draw a single logical pixel (in tile space) onto the scaled canvas.
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x * SCALE), Math.round(y * SCALE),
               Math.ceil(w * SCALE), Math.ceil(h * SCALE));
}

const Palette = {
  grass1: "#5fa64a", grass2: "#6fb858", grass3: "#4f9440", grassTip: "#8fd07a",
  dirt1: "#7a5230", dirt2: "#6a4526", dirtDark: "#553617",
  wet1: "#4f351f", wet2: "#3f2a17",
  water1: "#3f8fd6", water2: "#5aa6e6", waterFoam: "#bfe6ff",
  path1: "#c8b58c", path2: "#b8a378", pathEdge: "#9c8961",
  trunk: "#6b4a2b", trunkDark: "#4f3520",
  leaf1: "#3f7d3a", leaf2: "#4f9947", leaf3: "#2f5f2d",
  stem: "#4f9440",
  petalPink: "#ff9ed8", petalGold: "#ffd86b", petalBlue: "#8fb8ff",
  glow: "#fff4c2",
};

// ---- Terrain tiles -------------------------------------------------------

function drawGrass(ctx, ox, oy, x, y) {
  px(ctx, ox, oy, TILE, TILE, Palette.grass1);
  for (let i = 0; i < 10; i++) {
    const r = tileRand(x, y, i);
    const r2 = tileRand(x, y, i + 50);
    const gx = Math.floor(r * TILE);
    const gy = Math.floor(r2 * TILE);
    const c = r > 0.7 ? Palette.grassTip : r > 0.4 ? Palette.grass2 : Palette.grass3;
    px(ctx, ox + gx, oy + gy, 1, r > 0.7 ? 2 : 1, c);
  }
}

function drawPath(ctx, ox, oy, x, y) {
  px(ctx, ox, oy, TILE, TILE, Palette.path1);
  for (let i = 0; i < 8; i++) {
    const r = tileRand(x, y, i + 7);
    const gx = Math.floor(tileRand(x, y, i) * TILE);
    const gy = Math.floor(r * TILE);
    px(ctx, ox + gx, oy + gy, 2, 2, r > 0.5 ? Palette.path2 : Palette.pathEdge);
  }
}

function drawSoil(ctx, ox, oy, x, y, watered) {
  const base = watered ? Palette.wet1 : Palette.dirt1;
  const dark = watered ? Palette.wet2 : Palette.dirtDark;
  px(ctx, ox, oy, TILE, TILE, base);
  // tilled furrows
  for (let row = 2; row < TILE; row += 4) {
    px(ctx, ox + 1, oy + row, TILE - 2, 1, dark);
  }
  // crumbly speckles
  for (let i = 0; i < 6; i++) {
    const gx = Math.floor(tileRand(x, y, i) * TILE);
    const gy = Math.floor(tileRand(x, y, i + 3) * TILE);
    px(ctx, ox + gx, oy + gy, 1, 1, watered ? Palette.wet2 : Palette.dirt2);
  }
  px(ctx, ox, oy, TILE, 1, dark);
  px(ctx, ox, oy, 1, TILE, dark);
}

function drawWater(ctx, ox, oy, x, y, t) {
  px(ctx, ox, oy, TILE, TILE, Palette.water1);
  const wave = Math.sin(t * 2 + (x + y) * 0.7);
  for (let row = 0; row < TILE; row += 3) {
    const off = Math.round(Math.sin(t * 2.5 + row * 0.6 + x) * 2);
    px(ctx, ox + 2 + off, oy + row + 1, 5, 1, Palette.water2);
  }
  if (wave > 0.6) px(ctx, ox + 3, oy + 4, 3, 1, Palette.waterFoam);
  if (wave < -0.6) px(ctx, ox + 9, oy + 10, 3, 1, Palette.waterFoam);
}

function drawTree(ctx, ox, oy) {
  // trunk
  px(ctx, ox + 6, oy + 9, 4, 6, Palette.trunk);
  px(ctx, ox + 6, oy + 9, 1, 6, Palette.trunkDark);
  // canopy
  const blob = (cx, cy, r, c) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r)
          px(ctx, ox + cx + dx, oy + cy + dy, 1, 1, c);
  };
  blob(8, 6, 6, Palette.leaf3);
  blob(8, 5, 5, Palette.leaf1);
  blob(6, 4, 3, Palette.leaf2);
  blob(11, 6, 3, Palette.leaf2);
}

// ---- Crops ---------------------------------------------------------------
// stage 0..4 : seed -> sprout -> bush -> bud -> bloom
function drawCrop(ctx, ox, oy, stage, t, hue) {
  const petal = hue === 1 ? Palette.petalGold : hue === 2 ? Palette.petalBlue : Palette.petalPink;
  if (stage === 0) {
    px(ctx, ox + 7, oy + 12, 2, 1, Palette.dirtDark);
    return;
  }
  // stem
  const h = [0, 2, 5, 8, 9][stage];
  px(ctx, ox + 7, oy + 14 - h, 2, h, Palette.stem);
  if (stage >= 2) { // leaves
    px(ctx, ox + 5, oy + 13 - h + 2, 2, 1, Palette.leaf2);
    px(ctx, ox + 9, oy + 12 - h + 2, 2, 1, Palette.leaf2);
  }
  if (stage === 3) { // bud
    px(ctx, ox + 6, oy + 13 - h, 4, 3, Palette.leaf1);
    px(ctx, ox + 7, oy + 13 - h, 2, 2, petal);
  }
  if (stage === 4) { // bloom + sparkle
    const cx = ox + 8, cy = oy + 13 - h;
    px(ctx, cx - 2, cy - 1, 2, 2, petal);
    px(ctx, cx, cy - 3, 2, 2, petal);
    px(ctx, cx, cy + 1, 2, 2, petal);
    px(ctx, cx + 2, cy - 1, 2, 2, petal);
    px(ctx, cx, cy - 1, 2, 2, Palette.glow);
    const tw = (Math.sin(t * 4) + 1) / 2;
    if (tw > 0.6) px(ctx, cx + 4, cy - 4, 1, 1, "#ffffff");
    if (tw < 0.4) px(ctx, cx - 4, cy - 2, 1, 1, "#fff4c2");
  }
}

// ---- The fairy -----------------------------------------------------------
// dir: 0 down, 1 up, 2 left, 3 right
function drawFairy(ctx, ox, oy, dir, t, moving) {
  const flap = Math.sin(t * (moving ? 16 : 6));
  const bob = Math.round(Math.sin(t * 4) * (moving ? 1 : 0.6));
  const y = oy + bob;

  const skin = "#ffdcc2", hair = "#7b4fd6", dress = "#ff9ed8", dressDk = "#e873bd";
  const wing = "rgba(220,235,255,0.78)", wingEdge = "rgba(255,255,255,0.9)";

  // soft glow aura
  const g = ctx.createRadialGradient(
    (ox + 8) * SCALE, (y + 8) * SCALE, 2,
    (ox + 8) * SCALE, (y + 8) * SCALE, 14 * SCALE);
  g.addColorStop(0, "rgba(255,244,194,0.35)");
  g.addColorStop(1, "rgba(255,244,194,0)");
  ctx.fillStyle = g;
  ctx.fillRect((ox - 6) * SCALE, (y - 6) * SCALE, 28 * SCALE, 28 * SCALE);

  // wings (behind body), flap by stretching width
  const wspread = 3 + Math.round((flap + 1) * 1.5);
  ctx.globalAlpha = 0.85;
  px(ctx, ox + 2 - wspread, y + 4, wspread, 5, wing);
  px(ctx, ox + 12, y + 4, wspread, 5, wing);
  px(ctx, ox + 2 - wspread, y + 4, 1, 5, wingEdge);
  px(ctx, ox + 11 + wspread, y + 4, 1, 5, wingEdge);
  ctx.globalAlpha = 1;

  // body / dress
  px(ctx, ox + 6, y + 9, 4, 4, dress);
  px(ctx, ox + 6, y + 12, 4, 1, dressDk);
  // head
  px(ctx, ox + 6, y + 4, 4, 5, skin);
  // hair
  px(ctx, ox + 5, y + 3, 6, 3, hair);
  px(ctx, ox + 5, y + 5, 1, 3, hair);
  px(ctx, ox + 10, y + 5, 1, 3, hair);

  // face by direction
  if (dir === 1) {
    // facing up: back of head
    px(ctx, ox + 6, y + 4, 4, 4, hair);
  } else {
    const eyeY = y + 6;
    if (dir === 2) { // left
      px(ctx, ox + 6, eyeY, 1, 1, "#3a2a55");
    } else if (dir === 3) { // right
      px(ctx, ox + 9, eyeY, 1, 1, "#3a2a55");
    } else { // down
      px(ctx, ox + 6, eyeY, 1, 1, "#3a2a55");
      px(ctx, ox + 9, eyeY, 1, 1, "#3a2a55");
      px(ctx, ox + 7, y + 7, 2, 1, "#e873bd"); // tiny smile
    }
  }

  // little legs / sparkle trail
  px(ctx, ox + 6, y + 13, 1, 2, skin);
  px(ctx, ox + 9, y + 13, 1, 2, skin);
  if (moving && Math.sin(t * 10) > 0.5)
    px(ctx, ox + 8, y + 15, 1, 1, "#fff4c2");
}

// expose to global scope for the non-module scripts
window.Art = {
  TILE, SCALE, PX, Palette, tileRand, px,
  drawGrass, drawPath, drawSoil, drawWater, drawTree, drawCrop, drawFairy,
};
