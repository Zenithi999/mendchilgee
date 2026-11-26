// ═══════════════════════════════════════════════════════════════
// Procedural pixel Christmas tree. More letters → more tiers → bigger tree.
// Returns everything in "pixel" units; PixelTree draws it in an SVG.
// ═══════════════════════════════════════════════════════════════

const LAYERS_BY_CAPACITY = { 10: 3, 15: 4, 20: 5, 25: 6, 30: 7 };
const LAYER_H = 9;
const LAYER_STEP = 6;
const TOP_PAD = 7; // room for the star

const GREEN = {
  edge: "#0b3b1c",
  dark: "#14532d",
  mid: "#1f7a3a",
  light: "#2fa04b",
  shine: "#6cc04a",
  snow: "#f2fbff",
};

// small deterministic hash → [0,1)
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const cache = new Map();

export function buildTree(capacity) {
  if (cache.has(capacity)) return cache.get(capacity);
  const L = LAYERS_BY_CAPACITY[capacity] ?? Math.max(3, Math.min(7, Math.round(capacity / 5) + 1));

  const layers = Array.from({ length: L }, (_, i) => ({
    y0: TOP_PAD + i * LAYER_STEP,
    top: 1.5 + i * 2.2,
    bot: 7.5 + i * 3.6,
  }));
  const maxHw = layers[L - 1].bot + 1;
  const W = Math.ceil(maxHw * 2) + 6;
  const cx = W / 2;
  const foliageBottom = layers[L - 1].y0 + LAYER_H;
  const trunkH = 3;
  const potH = 6;
  const H = foliageBottom + trunkH + potH + 1;

  // ── foliage mask: which layer (if any) owns each pixel; later (lower) layers drawn first
  const owner = Array.from({ length: H }, () => new Array(W).fill(-1));
  const hwAt = (layer, r) => layer.top + ((layer.bot - layer.top) * r) / (LAYER_H - 1);
  // draw bottom layer first so upper layers' skirts sit on top
  for (let i = L - 1; i >= 0; i--) {
    const ly = layers[i];
    for (let r = 0; r < LAYER_H + 1; r++) {
      const y = ly.y0 + r;
      if (y >= H) continue;
      const hw = r < LAYER_H ? hwAt(ly, r) : ly.bot;
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx;
        if (Math.abs(dx) > hw) continue;
        // jagged / scalloped skirt on the last two rows
        if (r === LAYER_H - 1 && (Math.floor(x + i) % 4) === 0) continue;
        if (r === LAYER_H && (Math.floor(x + i) % 4) !== 2) continue;
        // keep the fringe tips attached to the branch above them
        if (r === LAYER_H && Math.abs(dx) > hw - 1) continue;
        owner[y][x] = i;
      }
    }
  }

  // ── colour each foliage pixel
  const pixels = []; // {x,y,fill}
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = owner[y][x];
      if (i < 0) continue;
      const ly = layers[i];
      const r = y - ly.y0;
      const left = x === 0 || owner[y][x - 1] < 0;
      const right = x === W - 1 || owner[y][x + 1] < 0;
      const below = y === H - 1 || owner[y + 1][x] < 0;
      const above = y === 0 || owner[y - 1][x] < 0;
      const hw = r < LAYER_H ? hwAt(ly, Math.min(r, LAYER_H - 1)) : ly.bot;
      const u = (x + 0.5 - cx) / Math.max(hw, 1); // -1 left … 1 right
      const n = hash(x, y, 7);
      let fill;
      if (left || right || below) fill = GREEN.edge;
      else if (above && n < 0.55) fill = GREEN.snow; // snow on the tips
      else if (r <= 1 && i > 0) fill = GREEN.dark; // shadow under the tier above
      else if (u > 0.45) fill = n < 0.2 ? GREEN.mid : GREEN.dark;
      else if (u < -0.35) fill = n < 0.25 ? GREEN.shine : GREEN.light;
      else fill = n < 0.12 ? GREEN.light : n > 0.9 ? GREEN.dark : GREEN.mid;
      pixels.push({ x, y, fill });
    }
  }

  // ── garland (tinsel swag + blinking bulbs) on each tier
  const tinsel = [];
  const bulbs = [];
  const BULB_COLORS = ["#ff3b3b", "#ffd23f", "#3ec5ff", "#7dff6a", "#ff6fd8", "#ff9f1c"];
  layers.forEach((ly, i) => {
    const yBase = ly.y0 + 3;
    const hw = hwAt(ly, 4) - 1.5;
    let k = 0;
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      const u = (x + 0.5 - cx) / hw;
      const y = Math.round(yBase + 3 * (1 - u * u) + (i % 2 ? u : -u));
      if (owner[y]?.[x] !== i) continue;
      tinsel.push({ x, y });
      if (k % 4 === 1) {
        bulbs.push({ x, y: y + 1, color: BULB_COLORS[(bulbs.length + i) % BULB_COLORS.length], group: bulbs.length % 3 });
      }
      k++;
    }
  });

  // ── ornament spots: farthest-point sampling over candidate points, so the
  //    tree fills evenly whichever order letters arrive in.
  const candidates = [];
  for (let y = TOP_PAD + 5; y <= foliageBottom - 4; y += 2) {
    for (let x = 3; x < W - 3; x += 2) {
      const ok = [-3, 0, 3].every((d) => owner[y][x + d] >= 0 && owner[y + 2]?.[x + d] >= 0);
      if (ok && owner[y - 3]?.[x] >= 0) candidates.push({ x: x + 0.5, y });
    }
  }
  const slots = [];
  const minD = candidates.map(() => Infinity);
  // first spot: lower-middle of the tree
  let pick = 0;
  let best = Infinity;
  const target = { x: cx, y: foliageBottom - (foliageBottom - TOP_PAD) * 0.35 };
  candidates.forEach((c, j) => {
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < best) { best = d; pick = j; }
  });
  while (slots.length < capacity && candidates.length) {
    const c = candidates[pick];
    slots.push({ x: c.x, y: c.y });
    let far = -1;
    candidates.forEach((p, j) => {
      // vertical distance counts a bit more so rows don't bunch up
      const d = Math.hypot(p.x - c.x, (p.y - c.y) * 1.25);
      if (d < minD[j]) minD[j] = d;
      if (minD[j] > far) { far = minD[j]; pick = j; }
    });
    if (far <= 0) break;
  }

  const trunk = { x: Math.round(cx - 3), y: foliageBottom - 1, w: 6, h: trunkH + 1 };
  const pot = { x: Math.round(cx - 7), y: foliageBottom + trunkH, w: 14, h: potH };

  const tree = {
    W, H, cx, layers: L, pixels: mergeRuns(pixels), tinsel, bulbs, slots, trunk, pot,
    star: { x: cx, y: TOP_PAD - 1 },
  };
  cache.set(capacity, tree);
  return tree;
}

function mergeRuns(pixels) {
  const out = [];
  let cur = null;
  for (const p of pixels) {
    if (cur && cur.y === p.y && cur.fill === p.fill && cur.x + cur.w === p.x) cur.w++;
    else {
      cur = { x: p.x, y: p.y, w: 1, fill: p.fill };
      out.push(cur);
    }
  }
  return out;
}
