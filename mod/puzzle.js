// マガジンの容量マップ。ファイルは「マスがつながった形」（ポリオミノ）で、盤にはめる。画面にも本体にも触らない。
//   形は、名前とマス数から決まる（同じファイルは、いつも同じ形）。重いファイルほど、マスが多い。
import { makeRng, hashStr } from "./math.js";

// 盤の広さ。整備場で 1 段ずつ広がる
export const BOARD_SIZES = [[5, 4], [6, 4], [6, 5], [7, 5], [7, 6], [8, 6], [8, 7], [9, 7], [9, 8], [10, 8]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_EXTENT = 5;

export function normalize(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function bounds(cells) {
  return { w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
}

// 時計まわりに 90 度
export function rotate(cells) {
  return normalize(cells.map(([x, y]) => [-y, x]));
}

export function orientation(cells, rot) {
  let c = cells;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) c = rotate(c);
  return c;
}

const key = (c) => c.map((p) => p.join(",")).join(";");

// ちがう向きだけ（正方形に近い形は、回しても同じになる）
export function orientations(cells) {
  const out = [], seen = new Set();
  for (let r = 0; r < 4; r++) {
    const c = orientation(cells, r), k = key(c);
    if (!seen.has(k)) { seen.add(k); out.push({ rot: r, cells: c }); }
  }
  return out;
}

// マスが n 個の形を、ふくらんだかたまりになるように育てる
function grow(n, rng) {
  const cells = [[0, 0]], set = new Set(["0,0"]);
  let guard = 0;
  while (cells.length < n && guard++ < 500) {
    const cand = [];
    for (const [x, y] of cells) {
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (set.has(k)) continue;
        const xs = cells.map((c) => c[0]).concat(nx), ys = cells.map((c) => c[1]).concat(ny);
        if (Math.max(...xs) - Math.min(...xs) >= MAX_EXTENT || Math.max(...ys) - Math.min(...ys) >= MAX_EXTENT) continue;
        const adj = DIRS.filter(([ax, ay]) => set.has(`${nx + ax},${ny + ay}`)).length;
        cand.push({ x: nx, y: ny, w: adj * adj });
      }
    }
    if (!cand.length) break;
    let total = cand.reduce((s, c) => s + c.w, 0), r = rng() * total, pick = cand[0];
    for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break; } }
    cells.push([pick.x, pick.y]);
    set.add(`${pick.x},${pick.y}`);
  }
  return normalize(cells);
}

const cache = new Map();
// ファイル（ammo）の形。マス数は ammo.cells
export function shapeOf(ammo) {
  const n = Math.max(1, ammo.cells || 1), k = `${ammo.name}|${n}`;
  let s = cache.get(k);
  if (!s) { s = grow(n, makeRng(hashStr(ammo.name) ^ (n * 2654435761))); cache.set(k, s); if (cache.size > 2000) cache.clear(); }
  return s;
}

export class Board {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.grid = new Array(w * h).fill(0);
    this.pieces = new Map();
    this.nextId = 1;
  }

  get size() { return this.w * this.h; }
  used() { return this.grid.reduce((s, v) => s + (v ? 1 : 0), 0); }
  free() { return this.size - this.used(); }

  canPlace(cells, x, y) {
    for (const [cx, cy] of cells) {
      const px = x + cx, py = y + cy;
      if (px < 0 || py < 0 || px >= this.w || py >= this.h || this.grid[py * this.w + px]) return false;
    }
    return true;
  }

  // 置けたら 部品の番号を返す。置けなければ 0
  place(ammo, rot, x, y) {
    const cells = orientation(shapeOf(ammo), rot);
    if (!this.canPlace(cells, x, y)) return 0;
    const id = this.nextId++;
    for (const [cx, cy] of cells) this.grid[(y + cy) * this.w + (x + cx)] = id;
    this.pieces.set(id, { id, ammo, rot: ((rot % 4) + 4) % 4, x, y, cells });
    return id;
  }

  remove(id) {
    const p = this.pieces.get(id);
    if (!p) return null;
    for (const [cx, cy] of p.cells) this.grid[(p.y + cy) * this.w + (p.x + cx)] = 0;
    this.pieces.delete(id);
    return p.ammo;
  }

  idAt(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.grid[y * this.w + x]; }
  list() { return [...this.pieces.values()]; }
  ammos() { return this.list().map((p) => p.ammo); }
  has(uid) { return this.list().some((p) => p.ammo.uid === uid); }
  clear() { this.grid.fill(0); this.pieces.clear(); }

  // 盤を広げる・狭める：置いてあるものは、入るかぎり そのまま。入らないものは 外して返す
  resized(w, h) {
    const b = new Board(w, h), dropped = [];
    for (const p of this.list()) if (!b.place(p.ammo, p.rot, p.x, p.y)) dropped.push(p.ammo);
    return { board: b, dropped };
  }

  // ammo を置ける場所をさがす。まわりと すきまなく つまる所を選ぶ。なければ null
  findSpot(ammo) {
    let best = null, bs = -Infinity;
    for (const o of orientations(shapeOf(ammo))) {
      const { w, h } = bounds(o.cells);
      for (let y = 0; y + h <= this.h; y++) {
        for (let x = 0; x + w <= this.w; x++) {
          if (!this.canPlace(o.cells, x, y)) continue;
          let touch = 0;
          for (const [cx, cy] of o.cells) for (const [dx, dy] of DIRS) {
            const px = x + cx + dx, py = y + cy + dy;
            if (px < 0 || py < 0 || px >= this.w || py >= this.h || this.grid[py * this.w + px]) touch++;
          }
          const sc = touch * 10 - (y * this.w + x) * 0.01;
          if (sc > bs) { bs = sc; best = { rot: o.rot, x, y }; }
        }
      }
    }
    return best;
  }
}

// おまかせ詰め：威力が マスあたりで大きいものから、入る所へ。もう1つは 種類を順番に まわして取る。
// scoreFn（詰めた結果の ammo の並び → 点）が高いほうを使う
export function autoPack(board, candidates, scoreFn = (list) => list.reduce((s, a) => s + a.dmg, 0)) {
  const density = (a) => a.dmg / a.cells;
  const byDensity = candidates.slice().sort((a, b) => density(b) - density(a) || b.bytes - a.bytes);
  const groups = {};
  for (const a of byDensity) (groups[a.kind] ||= []).push(a);
  const robin = [];
  for (let more = true; more;) {
    more = false;
    for (const k of Object.keys(groups)) if (groups[k].length) { robin.push(groups[k].shift()); more = true; }
  }
  const run = (order) => {
    const b = new Board(board.w, board.h);
    for (const p of board.list()) b.place(p.ammo, p.rot, p.x, p.y);
    const added = [];
    for (const a of order) {
      if (b.free() < a.cells) continue;
      const spot = b.findSpot(a);
      if (!spot) continue;
      b.place(a, spot.rot, spot.x, spot.y);
      added.push(a);
    }
    return { b, added };
  };
  const r1 = run(byDensity), r2 = run(robin);
  const best = scoreFn(r2.b.ammos()) > scoreFn(r1.b.ammos()) ? r2 : r1;
  return best;
}
