// 世界の絵。ゲームの状態（sim）を読んで、描画器（render）に 板と線を並べる。状態は変えない。
// 一人称（目の位置から見る。手もとに 砲身が見える）と、三人称（勇者のうしろの上から）。
import { BULLET_COLORS } from "./stages.js";
import { SHAPES } from "./shapes.js";
import { ARENA_R, CEIL_Y } from "./consts.js";
import { KINDS } from "./ammo.js";
import { basisOf } from "./sim.js";
import { makeRng, clamp, TAU } from "./math.js";

export const BG = [0.012, 0.01, 0.035];
const GOLD = [1, 0.85, 0.25];

// カメラ。mode は "first"（一人称）か "third"（三人称）
export function cameraOf(g, mode = "first", shake = 0) {
  const p = g.p, { f, r, u } = basisOf(p.yaw, p.pitch);
  const j = () => (Math.random() - 0.5) * shake;
  if (mode === "third") {
    const back = 8.5;
    return {
      eye: [p.x - f.x * back + u.x * 2.2 + j(), Math.max(0.6, p.y - f.y * back + u.y * 2.2) + j(), p.z - f.z * back + u.z * 2.2 + j()],
      target: [p.x + f.x * 10, p.y + f.y * 10, p.z + f.z * 10],
      f, r, u,
    };
  }
  return { eye: [p.x + j(), p.y + j(), p.z + j()], target: [p.x + f.x, p.y + f.y, p.z + f.z], f, r, u };
}

// ---- 動かない床・天井・縁 -------------------------------------------------------
export function buildGrid() {
  const out = [];
  const L = (x0, y0, z0, x1, y1, z1, r, g, b, a, w) => out.push(x0, y0, z0, x1, y1, z1, r, g, b, a, w);
  const circle = (rad, y, r, g, b, a, w, segs = 72) => {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
      L(Math.sin(a0) * rad, y, Math.cos(a0) * rad, Math.sin(a1) * rad, y, Math.cos(a1) * rad, r, g, b, a, w);
    }
  };
  for (let k = 1; k <= 5; k++) circle(k * 6, 0, 0.25, 0.55, 1, 0.4, 1.4);
  circle(ARENA_R, 0, 0.45, 0.85, 1, 0.95, 3, 120);
  circle(ARENA_R + 0.7, 0, 0.3, 0.5, 1, 0.35, 1.5, 120);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU, s = Math.sin(a), c = Math.cos(a);
    L(s * 6, 0, c * 6, s * ARENA_R, 0, c * ARENA_R, 0.25, 0.5, 1, 0.24, 1.2);
    // 縁の柱：床から天井まで
    L(s * ARENA_R, 0, c * ARENA_R, s * ARENA_R, CEIL_Y, c * ARENA_R, 0.5, 0.9, 1, 0.3, 1.6);
    L(s * 12, CEIL_Y, c * 12, s * ARENA_R, CEIL_Y, c * ARENA_R, 0.4, 0.7, 1, 0.12, 1);
  }
  // 天井の輪と、縁の高さの印
  for (const k of [12, 24]) circle(k, CEIL_Y, 0.4, 0.7, 1, 0.16, 1.2, 96);
  circle(ARENA_R, CEIL_Y, 0.45, 0.85, 1, 0.55, 2.2, 120);
  for (const y of [6, 12, 18]) circle(ARENA_R, y, 0.4, 0.7, 1, 0.12, 1, 120);
  for (let rr = 40; rr <= 100; rr += 20) circle(rr, -0.5, 0.2, 0.4, 0.9, 0.1, 1.2, 96);
  for (let v = -144; v <= 144; v += 12) {
    L(v, -12, -144, v, -12, 144, 0.2, 0.3, 0.8, 0.07, 1.2);
    L(-144, -12, v, 144, -12, v, 0.2, 0.3, 0.8, 0.07, 1.2);
  }
  return out;
}

// ---- 飛び回るファイルの箱（景色）---------------------------------------------------
const rngBox = makeRng(20241024);
const BOXES = Array.from({ length: 34 }, () => {
  const a = rngBox() * TAU, d = 50 + rngBox() * 80;
  return { x: Math.sin(a) * d, y: -4 + rngBox() * 50, z: Math.cos(a) * d, s: 1.5 + rngBox() * 4.5, sp: (rngBox() - 0.5) * 0.9, ph: rngBox() * TAU, col: rngBox() };
});
const rngStar = makeRng(777);
const STARS = Array.from({ length: 320 }, () => {
  const u = rngStar() * 2 - 1, th = rngStar() * TAU, rad = Math.sqrt(1 - u * u);
  return { x: Math.cos(th) * rad, y: u, z: Math.sin(th) * rad, s: 1 + rngStar() * 1.8, a: 0.3 + rngStar() * 0.6 };
});

// ---- 小さな図形の道具 -----------------------------------------------------------
// 平面 plane（0：水平　1：縦 xy　2：縦 yz）の円
function circle(r, cx, cy, cz, rad, plane, rgb, a, w, segs = 40) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU, s0 = Math.sin(a0) * rad, c0 = Math.cos(a0) * rad, s1 = Math.sin(a1) * rad, c1 = Math.cos(a1) * rad;
    if (plane === 0) r.line(cx + s0, cy, cz + c0, cx + s1, cy, cz + c1, rgb[0], rgb[1], rgb[2], a, w);
    else if (plane === 1) r.line(cx + s0, cy + c0, cz, cx + s1, cy + c1, cz, rgb[0], rgb[1], rgb[2], a, w);
    else r.line(cx, cy + c0, cz + s0, cx, cy + c1, cz + s1, rgb[0], rgb[1], rgb[2], a, w);
  }
}
const sphereWire = (r, cx, cy, cz, rad, rgb, a, w) => {
  circle(r, cx, cy, cz, rad, 0, rgb, a, w, 48);
  circle(r, cx, cy, cz, rad, 1, rgb, a, w, 48);
  circle(r, cx, cy, cz, rad, 2, rgb, a, w, 48);
};

// 頂点を回して動かす（まず x 軸まわり ax、つぎに y 軸まわり ay、拡大 s、移動）
function xf(v, ay, ax, s, cx, cy, cz) {
  const x = v[0] * s, y0 = v[1] * s, z0 = v[2] * s;
  const cax = Math.cos(ax), sax = Math.sin(ax), y = y0 * cax - z0 * sax, z1 = y0 * sax + z0 * cax;
  const cay = Math.cos(ay), say = Math.sin(ay);
  return [cx + x * cay + z1 * say, cy + y, cz - x * say + z1 * cay];
}

function mesh(r, shape, ay, ax, s, cx, cy, cz, rgb, a, w) {
  const vs = shape.v.map((v) => xf(v, ay, ax, s, cx, cy, cz));
  for (const [i, j] of shape.e) r.line(vs[i][0], vs[i][1], vs[i][2], vs[j][0], vs[j][1], vs[j][2], rgb[0], rgb[1], rgb[2], a, w);
}

// ---- 全体 ---------------------------------------------------------------------
// v：{ t（実時間の秒）, fx（Particles）, mode（"first" か "third"）, shake, bossFlash, glow（弾の光を描くか）, shadows, fov }
export function drawScene(r, g, v) {
  const mode = v.mode || "first";
  const cam = cameraOf(g, mode, v.shake || 0);
  r.begin(cam.eye, cam.target, (v.fov || 78) * (Math.PI / 180));
  const t = v.t, bd = g.bossDef, col = bd ? bd.color : [0.4, 0.8, 1];
  r.setGridTint(0.6 + col[0] * 0.5, 0.6 + col[1] * 0.5, 0.6 + col[2] * 0.5, 1);

  // 星
  for (const s of STARS) r.sprite(cam.eye[0] + s.x * 420, cam.eye[1] + s.y * 420, cam.eye[2] + s.z * 420, s.s * 2.2, 0.7, 0.85, 1, s.a * (0.7 + 0.3 * Math.sin(t * 1.5 + s.x * 40)), 0);
  // ファイルの箱
  for (const b of BOXES) {
    const rgb = [0.3 + b.col * 0.4, 0.5, 1 - b.col * 0.4];
    mesh(r, SHAPES.cube, t * b.sp + b.ph, t * b.sp * 0.6, b.s, b.x, b.y + Math.sin(t * 0.3 + b.ph) * 1.5, b.z, rgb, 0.3, 1.5);
  }

  drawMarks(r, g);
  drawPillars(r, g, t);
  drawBoss(r, g, v, t);
  drawBullets(r, g, v, cam);
  drawLasers(r, g, t);
  // 一人称では、手もとの砲身は 描かない（溜めは 照準のまわりの輪と、種類の山に出る）
  const muzzle = mode === "third" ? drawPlayer(r, g, t) : null;
  drawShots(r, g, t);
  if (muzzle) drawCharge(r, g, muzzle, t);
  if (mode === "first") drawFloorMark(r, g);
  v.fx.draw(r);
  r.end(BG);
}

// ---- ボス -----------------------------------------------------------------------
function drawBoss(r, g, v, t) {
  const b = g.boss, bd = g.bossDef;
  if (!b || b.state === "dead") return;
  const col = bd.color;
  let a = 1;
  if (g.mode === "intro") a = clamp(g.modeT / 1.4, 0, 1);
  if (b.state === "gap") a = 0.45 + 0.25 * Math.sin(t * 24);
  const f = v.bossFlash || 0;
  const rgb = [col[0] + (1 - col[0]) * f, col[1] + (1 - col[1]) * f, col[2] + (1 - col[2]) * f];
  const shape = SHAPES[bd.shape] || SHAPES.octa;
  const R = b.r;
  const pulse = 1 + 0.04 * Math.sin(t * 5) + f * 0.12;
  mesh(r, shape, t * 0.6, 0.4 + Math.sin(t * 0.3) * 0.3, R * 1.05 * pulse, b.x, b.y, b.z, rgb, 0.95 * a, 2.6);
  mesh(r, shape, -t * 0.9, 0.9, R * 0.62 * pulse, b.x, b.y, b.z, rgb, 0.8 * a, 2);
  const rings = 1 + Math.max(0, g.phaseIdx);
  for (let k = 0; k < rings; k++) {
    const ang = t * (0.5 + k * 0.25) + k * 1.3, rad = R * (1.6 + k * 0.35), nx = Math.sin(ang) * 0.9, segs = 36;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
      const p0 = xf([Math.sin(a0), 0, Math.cos(a0)], t * 0.8 + k, nx, rad, b.x, b.y, b.z), p1 = xf([Math.sin(a1), 0, Math.cos(a1)], t * 0.8 + k, nx, rad, b.x, b.y, b.z);
      r.line(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], col[0], col[1], col[2], 0.5 * a, 1.6);
    }
  }
  r.sprite(b.x, b.y, b.z, R * 4.2, col[0], col[1], col[2], 0.55 * a, 0);
  r.sprite(b.x, b.y, b.z, R * 1.6, 1, 1, 1, 0.5 * a + f * 0.4, 0);
  r.sprite(b.x, b.y, b.z, R * 3.2, rgb[0], rgb[1], rgb[2], 0.28 * a, 3);
  // 床の影と、足もとの線（高さがわかるように）
  circle(r, b.x, 0.04, b.z, R * 1.3, 0, col, 0.55 * a, 2, 36);
  r.line(b.x, 0.04, b.z, b.x, b.y - R, b.z, col[0], col[1], col[2], 0.25 * a, 1.2);
  drawWeak(r, g, b, t, a);
}

// 弱点：上・正面・下 の輪。今の弱点は 金色に光り、移る前は 次の向きが点滅する
function drawWeak(r, g, b, t, a) {
  if (!b.phase || !b.phase.weak || g.mode === "intro") return;
  const R = b.r, ring = (y, rad, rgb, al, w) => circle(r, b.x, y, b.z, rad, 0, rgb, al, w, 40);
  const spots = { high: [b.y + R * 0.95, R * 0.95], mid: [b.y, R * 1.3], low: [b.y - R * 0.95, R * 0.95] };
  for (const side of ["high", "mid", "low"]) {
    const [y, rad] = spots[side];
    const now = b.weak === side, next = b.weakNext === side;
    if (now) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 8);
      ring(y, rad, GOLD, 0.95 * a * pulse, 4);
      ring(y, rad * 1.12, GOLD, 0.45 * a, 2);
      r.sprite(b.x, y, b.z, R * 2.4, GOLD[0], GOLD[1], GOLD[2], 0.32 * a * pulse, 0);
    } else if (next) {
      const blink = Math.sin(t * 22) > 0 ? 1 : 0.15;
      ring(y, rad, [1, 1, 1], 0.9 * a * blink, 3);
    } else {
      ring(y, rad, [0.7, 0.8, 1], 0.14 * a, 1.2);
    }
  }
}

// ---- 敵の弾 ---------------------------------------------------------------------
function drawBullets(r, g, v, cam) {
  const B = g.bullets, p = g.p, f = cam.f, third = v.mode === "third";
  let stalks = 0;
  for (let i = 0; i < B.n; i++) {
    const c = BULLET_COLORS[B.col[i]], x = B.x[i], y = B.y[i], z = B.z[i];
    // 三人称では、勇者より後ろへ抜けた弾を すぐ小さくする（画面をふさがないように）
    let sh = 1;
    if (third) {
      const ahead = (x - p.x) * f.x + (y - p.y) * f.y + (z - p.z) * f.z;
      sh = ahead < -0.8 ? clamp(1 + (ahead + 0.8) * 0.3, 0.12, 1) : 1;
    }
    const rad = B.r[i] * sh;
    const held = B.hold[i] > 0;
    r.sprite(x, y, z, rad * 2.2, c[0], c[1], c[2], 1, 1);
    if (v.glow && sh > 0.5) r.sprite(x, y, z, rad * (held ? 3.4 : 5), c[0], c[1], c[2], held ? 0.2 : 0.3, 0);
    if (v.shadows && y > 0.1 && sh > 0.5) {
      // 高さが わかるように、床の影と、床までの細い線（勇者に近い弾だけ）
      r.sprite(x, 0.04, z, rad * 2.4, c[0], c[1], c[2], 0.28, 0);
      if (stalks < 600 && Math.abs(x - p.x) < 14 && Math.abs(z - p.z) < 14) { stalks++; r.line(x, y, z, x, 0.04, z, c[0], c[1], c[2], 0.1, 1); }
    }
  }
}

// ---- レーザー・柱・床の警告 -------------------------------------------------------
function drawLasers(r, g, t) {
  for (const L of g.lasers) {
    const c = BULLET_COLORS[L.col || 7], y = L.y;
    const ex = L.x + Math.sin(L.ang) * L.len, ez = L.z + Math.cos(L.ang) * L.len;
    if (L.warn > 0) {
      const a = 0.35 + 0.35 * Math.sin(t * 40);
      r.line(L.x, y, L.z, ex, y, ez, c[0], c[1], c[2], a, 2);
      if (L.h > 0.65) { r.line(L.x, y - L.h, L.z, ex, y - L.h, ez, c[0], c[1], c[2], a * 0.5, 1.2); r.line(L.x, y + L.h, L.z, ex, y + L.h, ez, c[0], c[1], c[2], a * 0.5, 1.2); }
      continue;
    }
    const fade = clamp(Math.min(L.life, L.max - L.life + 0.2) / 0.25, 0, 1);
    for (const dy of [-L.h * 0.7, 0, L.h * 0.7]) r.line(L.x, y + dy, L.z, ex, y + dy, ez, c[0], c[1], c[2], 0.5 * fade, L.w * 40);
    r.line(L.x, y, L.z, ex, y, ez, 1, 1, 1, 0.95 * fade, L.w * 20);
    const dx = Math.sin(L.ang), dz = Math.cos(L.ang);
    for (let d = 2; d < L.len; d += 2.4) r.sprite(L.x + dx * d, y, L.z + dz * d, L.w * 3.5 + L.h * 2, c[0], c[1], c[2], 0.3 * fade, 0);
  }
}

// 柱：警告の輪が床に出て、そのあと 天井まで立つ
function drawPillars(r, g, t) {
  for (const P of g.pillars) {
    const c = BULLET_COLORS[P.col || 0];
    if (P.warn > 0) {
      const k = clamp(P.warn / 1.1, 0, 1);
      circle(r, P.x, 0.05, P.z, P.r * (0.5 + 0.5 * k), 0, c, 0.9 - 0.3 * k, 2.6, 24);
      circle(r, P.x, 0.05, P.z, P.r, 0, c, 0.35, 1.4, 24);
      r.line(P.x, 0.05, P.z, P.x, CEIL_Y, P.z, c[0], c[1], c[2], 0.15 + 0.2 * Math.sin(t * 30), 1.4);
      continue;
    }
    const fade = clamp(Math.min(P.life, P.max - P.life + 0.15) / 0.2, 0, 1);
    r.line(P.x, 0, P.z, P.x, CEIL_Y, P.z, c[0], c[1], c[2], 0.55 * fade, P.r * 36);
    r.line(P.x, 0, P.z, P.x, CEIL_Y, P.z, 1, 1, 1, 0.95 * fade, P.r * 14);
    for (let y = 0.5; y < CEIL_Y; y += 1.5) r.sprite(P.x, y, P.z, P.r * 3.4, c[0], c[1], c[2], 0.3 * fade, 0);
  }
}

function drawMarks(r, g) {
  for (const m of g.marks) {
    const c = BULLET_COLORS[m.col || 4], k = clamp(m.life / m.max, 0, 1);
    circle(r, m.x, 0.05, m.z, m.r * (0.35 + 0.65 * k), 0, c, 0.85 - 0.3 * k, 2.4, 24);
    circle(r, m.x, 0.05, m.z, m.r, 0, c, 0.3, 1.2, 24);
    r.sprite(m.x, 0.1, m.z, m.r * 1.6, c[0], c[1], c[2], 0.25 * (1 - k) + 0.1, 0);
  }
}

// ---- 勇者の弾・砲 ---------------------------------------------------------------------
function drawShots(r, g, t) {
  for (const s of g.shots) {
    const c = s.rgb || [0.5, 1, 1];
    switch (s.k) {
      case "bolt":
        r.line(s.x, s.y, s.z, s.x - s.vx * 0.03, s.y - s.vy * 0.03, s.z - s.vz * 0.03, 0.55, 1, 1, 0.9, 3);
        r.sprite(s.x, s.y, s.z, 0.6, 0.5, 1, 1, 0.8, 0);
        break;
      case "pellet":
        r.line(s.x, s.y, s.z, s.x - s.vx * 0.025, s.y - s.vy * 0.025, s.z - s.vz * 0.025, c[0], c[1], c[2], 0.9, 3);
        r.sprite(s.x, s.y, s.z, s.r * 5, c[0], c[1], c[2], 0.8, 0);
        break;
      case "shell": {
        for (let k = 6; k >= 1; k--) r.sprite(s.x - s.vx * 0.012 * k, s.y - s.vy * 0.012 * k, s.z - s.vz * 0.012 * k, s.r * (6 - k) * 1.3, c[0], c[1], c[2], 0.5 - k * 0.06, 0);
        r.sprite(s.x, s.y, s.z, s.r * 9, c[0], c[1], c[2], 0.55, 0);
        r.sprite(s.x, s.y, s.z, s.r * 4, 1, 1, 1, 1, 0);
        r.sprite(s.x, s.y, s.z, s.r * 12, c[0], c[1], c[2], 0.6, 3);
        break;
      }
      case "beam": {
        const fade = clamp(Math.min(s.life, s.max - s.life + 0.05) / 0.2, 0, 1);
        if (s.dx === undefined) break;
        const ex = s.ox + s.dx * s.len, ey = s.oy + s.dy * s.len, ez = s.oz + s.dz * s.len, w = s.w * (0.9 + 0.1 * Math.sin(t * 60));
        const dim = s.onBoss ? 1 : 0.8;
        r.line(s.ox, s.oy, s.oz, ex, ey, ez, c[0], c[1], c[2], 0.5 * fade * dim, w * 34);
        r.line(s.ox, s.oy, s.oz, ex, ey, ez, c[0], c[1], c[2], 0.9 * fade * dim, w * 18);
        r.line(s.ox, s.oy, s.oz, ex, ey, ez, 1, 1, 1, 1 * fade, w * 8);
        for (let d = 1; d < 60; d += 2) r.sprite(s.ox + s.dx * d, s.oy + s.dy * d, s.oz + s.dz * d, w * 4.4, c[0], c[1], c[2], 0.3 * fade, 0);
        r.sprite(s.ox, s.oy, s.oz, w * 7, 1, 1, 1, 0.9 * fade, 3);
        break;
      }
      case "dome": {
        // 勇者を包む球のバリア
        const p = g.p, f = clamp(s.life / 0.3, 0, 1), k = 0.5 + 0.5 * Math.sin(t * 9);
        sphereWire(r, p.x, p.y, p.z, s.r, c, (0.5 + 0.3 * k) * f, 2.4);
        r.sprite(p.x, p.y, p.z, s.r * 2.2, c[0], c[1], c[2], 0.12 * f, 0);
        circle(r, p.x, 0.06, p.z, s.r, 0, c, 0.4 * f, 2, 40);
        break;
      }
      case "missile": {
        for (let i = 0; i + 5 < s.trail.length; i += 3) r.line(s.trail[i], s.trail[i + 1], s.trail[i + 2], s.trail[i + 3], s.trail[i + 4], s.trail[i + 5], c[0], c[1], c[2], i / s.trail.length, s.frag ? 2 : 3);
        r.sprite(s.x, s.y, s.z, s.frag ? 0.7 : 1.0, c[0], c[1], c[2], 0.9, 0);
        r.sprite(s.x, s.y, s.z, s.frag ? 0.28 : 0.4, 1, 1, 1, 1, 0);
        break;
      }
      case "bomb": {
        // 手動起爆の爆弾：ふくらむ輪が、いつでも爆発できる合図
        const p = 1 + 0.15 * Math.sin(t * 30), arm = 0.5 + 0.5 * Math.sin(t * 10);
        r.sprite(s.x, s.y, s.z, s.r * 9 * p, c[0], c[1], c[2], 0.6, 0);
        r.sprite(s.x, s.y, s.z, s.r * 4, 1, 1, 1, 1, 0);
        r.sprite(s.x, s.y, s.z, s.r * 11, c[0], c[1], c[2], 0.7, 3);
        circle(r, s.x, s.y, s.z, s.rad * (0.35 + 0.1 * arm), 1, c, 0.4, 1.6, 28);
        circle(r, s.x, s.y, s.z, s.rad * (0.35 + 0.1 * arm), 2, c, 0.4, 1.6, 28);
        break;
      }
      case "lob": {
        // 迫撃砲：弧をえがく。尾をひく
        for (let k = 1; k <= 8; k++) r.sprite(s.x - s.vx * 0.03 * k, s.y - s.vy * 0.03 * k, s.z - s.vz * 0.03 * k, s.r * (9 - k) * 1.5, c[0], c[1], c[2], 0.55 - k * 0.06, 0);
        r.sprite(s.x, s.y, s.z, s.r * 9, c[0], c[1], c[2], 0.65, 0);
        r.sprite(s.x, s.y, s.z, s.r * 4, 1, 1, 1, 1, 0);
        r.sprite(s.x, s.y, s.z, s.r * 11, c[0], c[1], c[2], 0.6, 3);
        break;
      }
      case "meteor": {
        for (let i = 0; i + 5 < s.trail.length; i += 3) r.line(s.trail[i], s.trail[i + 1], s.trail[i + 2], s.trail[i + 3], s.trail[i + 4], s.trail[i + 5], c[0], c[1], c[2], i / s.trail.length * 0.9, 6);
        r.sprite(s.x, s.y, s.z, s.r * 9, c[0], c[1], c[2], 0.65, 0);
        r.sprite(s.x, s.y, s.z, s.r * 4, 1, 1, 1, 1, 0);
        break;
      }
      case "boom": {
        const f = s.fade > 0 ? s.fade / 0.3 : 1, k = 1 - s.r / s.maxR;
        sphereWire(r, s.x, s.y, s.z, s.r, c, (0.35 + 0.6 * k) * f, 3);
        r.sprite(s.x, s.y, s.z, s.r * 2.6, c[0], c[1], c[2], (0.2 + 0.5 * k) * f, 0);
        r.sprite(s.x, s.y, s.z, s.r * 1.2, 1, 1, 1, 0.5 * k * f, 0);
        if (s.y < 3) circle(r, s.x, 0.06, s.z, s.r, 0, c, 0.8 * f, 4, 56);
        break;
      }
    }
  }
}

// ---- 三人称：勇者の機体 ------------------------------------------------------------------
function drawPlayer(r, g, t) {
  const p = g.p;
  if (g.mode === "over") return null;
  const { f, r: rt, u } = basisOf(p.yaw, p.pitch);
  let a = 1;
  if (p.inv > 0 && Math.floor(t * 22) % 2 === 0) a = 0.35;
  const loc = (x, y, z) => {
    x *= 1.5; y *= 1.5; z *= 1.5;
    return [p.x + rt.x * x + u.x * y + f.x * z, p.y + rt.y * x + u.y * y + f.y * z, p.z + rt.z * x + u.z * y + f.z * z];
  };
  const nose = loc(0, 0, 1.1), L = loc(-0.85, 0, -0.65), R = loc(0.85, 0, -0.65), tail = loc(0, 0, -0.25), fin = loc(0, 0.4, -0.55), keel = loc(0, -0.18, -0.45);
  const seg = (A, B, w = 2.4) => r.line(A[0], A[1], A[2], B[0], B[1], B[2], 0.7, 1, 1, 0.95 * a, w);
  seg(nose, L); seg(nose, R); seg(L, tail); seg(R, tail); seg(nose, fin, 1.6); seg(fin, tail, 1.6); seg(nose, keel, 1.6); seg(keel, tail, 1.6); seg(L, R, 1.4);
  const eng = loc(0, 0, -0.6);
  r.sprite(eng[0], eng[1], eng[2], 0.9 + 0.2 * Math.sin(t * 40), 0.4, 0.9, 1, 0.8 * a, 0);
  r.sprite(p.x, p.y, p.z, 2.4, 0.3, 0.8, 1, 0.18 * a, 0);
  // あたり判定の芯
  r.sprite(p.x, p.y, p.z, p.focus ? 0.7 : 0.45, 1, 0.5, 0.5, 1, 1);
  if (p.focus) circle(r, p.x, p.y, p.z, 0.55, 0, [1, 0.6, 0.6], 0.7, 1.6, 20);
  // 高さの目安：床の影の輪と、床までの線
  circle(r, p.x, 0.04, p.z, 0.7, 0, [0.5, 1, 1], 0.7 * a, 2, 20);
  r.line(p.x, 0.04, p.z, p.x, p.y - 0.2, p.z, 0.5, 1, 1, 0.35 * a, 1.2);
  return nose;
}

// 床の上の自分の場所。一人称でも、下を見るとわかる
function drawFloorMark(r, g) {
  const p = g.p;
  circle(r, p.x, 0.04, p.z, 0.7, 0, [0.5, 1, 1], 0.55, 2, 20);
  r.line(p.x, 0.04, p.z, p.x, p.y - 0.4, p.z, 0.5, 1, 1, 0.22, 1.2);
}

// 溜め。一人称の砲口でも 三人称の機首でも 同じ
function drawCharge(r, g, muzzle, t) {
  const p = g.p;
  if (!p.ch) return;
  const A = p.ch.ammo, k = p.ch.t / p.ch.need, c = A ? KINDS[A.kind].rgb : [1, 1, 1];
  const size = (0.3 + k * (0.55 + 0.45 * (A ? A.scale : 1))) * (p.ch.ready ? 1 + 0.12 * Math.sin(t * 30) : 1);
  r.sprite(muzzle[0], muzzle[1], muzzle[2], size * 2.6, c[0], c[1], c[2], 0.5, 0);
  r.sprite(muzzle[0], muzzle[1], muzzle[2], size * 1.1, 1, 1, 1, 0.9, 0);
  r.sprite(muzzle[0], muzzle[1], muzzle[2], size * 3.4, c[0], c[1], c[2], 0.6 * k, 3);
}
