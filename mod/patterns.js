// ボスの弾幕の型。1つの攻撃 = { t: "ring", …パラメータ }。毎フレーム (p, rt, c) で呼ばれる。
//   p：パラメータ　rt：その攻撃だけの作業場（フェーズごとに空から）　c：弾を撃つ道具
//   c.fire(spec) 弾を1発　c.laser(spec) レーザー　c.pillar(spec) 柱　c.mark(spec) 床の警告　c.cm 数の倍率　c.sm 速さの倍率　c.rand() 乱数
//   c.boss と c.pl は { x, y, z }。角度は 0 が +z、π/2 が +x。速さは 1秒に進む長さ。pitch は上向きが正
//   lay（高さ）：層の名前（"low" "mid" "high" はボスの高さからのずれ。"floor" "ceil" は 床と天井のそば）、"player"（勇者の今の高さ）、数、または それらの配列。
//   配列は 撃つたびに順番に使う（together: true なら 同時に全部）。書かないと ボスと同じ高さ
import { TAU, angDiff, clamp } from "./math.js";
import { ARENA_R, LAYER_OFF, LAYER_ABS, Y_MIN, Y_MAX } from "./consts.js";

export const aimTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
const cnt = (c, n) => Math.max(1, Math.round(n * c.cm));
const spd = (c, v) => v * c.sm;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function layerY(c, v) {
  if (v === undefined) return c.boss.y;
  if (v === "player") return c.pl.y;
  if (typeof v === "number") return v;
  if (v in LAYER_ABS) return LAYER_ABS[v];
  if (v in LAYER_OFF) return c.boss.y + LAYER_OFF[v];
  return c.boss.y;
}
const pick = (lay, k, i = 0) => (Array.isArray(lay) ? lay[(k + i) % lay.length] : lay);
const aimPitch = (c, x, y, z) => Math.atan2(c.pl.y - y, Math.hypot(c.pl.x - x, c.pl.z - z));

// every 秒ごとに true（最初だけ first 秒待つ）。k は数えた回数
function due(rt, dt, every, first = 0.8) {
  if (rt.cd === undefined) { rt.cd = first; rt.k = 0; }
  rt.cd -= dt;
  if (rt.cd > 0) return false;
  rt.cd = Math.max(0, rt.cd + every);
  rt.k++;
  return true;
}

// 1秒に rate 発の割合で、n 回ぶん呼ぶ
function stream(rt, dt, rate, emit) {
  rt.acc = (rt.acc || 0) + dt * rate;
  let guard = 0;
  while (rt.acc >= 1 && guard++ < 10) { rt.acc -= 1; emit(rt.n = (rt.n || 0) + 1); }
  if (rt.acc > 4) rt.acc = 0;
}

// 撃つ層の並び。together なら全部、そうでなければ今回の1つ
const layersNow = (p, rt) => (p.together && Array.isArray(p.lay) ? p.lay : [pick(p.lay, rt.k)]);

export const PATTERNS = {
  // 輪。twist で毎回ずらす。holes で穴をあける。lay で高さを入れかえる
  ring(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 1.9, p.first ?? 0.8)) return;
    const n = cnt(c, p.n ?? 22), step = TAU / n;
    const base = (p.aim ? aimTo(c.boss.x, c.boss.z, c.pl.x, c.pl.z) : 0) + rt.k * (p.twist ?? 0.5) * step;
    const holes = p.holes || 0, holeA = c.rand() * TAU;
    // 傾けた輪：tilt（ラジアン。"rand" ならそのつど）だけ 輪の面を倒して、向きも毎回かえる
    const tilt = p.tilt === "rand" ? (0.35 + c.rand() * 0.9) * (c.rand() < 0.5 ? 1 : -1) : p.tilt || 0, phi = c.rand() * TAU, ct = Math.cos(tilt), st = Math.sin(tilt), cp = Math.cos(phi), sp = Math.sin(phi);
    for (const L of layersNow(p, rt)) {
      const y = layerY(c, L);
      for (let i = 0; i < n; i++) {
        const a = base + i * step;
        if (holes) {
          let skip = false;
          for (let h = 0; h < holes; h++) if (Math.abs(angDiff(a, holeA + (h * TAU) / holes)) < (p.holeW ?? 0.7) / 2) skip = true;
          if (skip) continue;
        }
        let ang = a, pitch = p.pitch;
        if (tilt) {
          const vx = Math.sin(a), vy = 0, vz = Math.cos(a);
          const y1 = vy * ct - vz * st, z1 = vy * st + vz * ct;
          const x2 = vx * cp + z1 * sp, z2 = -vx * sp + z1 * cp;
          ang = Math.atan2(x2, z2); pitch = Math.asin(Math.max(-1, Math.min(1, y1)));
        }
        c.fire({ y, ang, pitch, speed: spd(c, p.speed ?? 6), r: p.r ?? 0.32, col: p.col ?? 1, acc: p.acc });
      }
    }
  },

  // 渦。arms 本の腕が回りながら出る。腕ごとに高さをかえられる
  spiral(p, rt, c) {
    const rate = (p.rate ?? 12) * c.cm, arms = p.arms ?? 3;
    if (rt.a === undefined) rt.a = c.rand() * TAU;
    rt.start = (rt.start ?? p.first ?? 0.8) - c.dt;
    if (rt.start > 0) return;
    stream(rt, c.dt, rate, () => {
      rt.a += (p.spin ?? 1) / (p.rate ?? 12) / c.cm;
      for (let k = 0; k < arms; k++) c.fire({ y: layerY(c, pick(p.lay, 0, k)), ang: rt.a + (k * TAU) / arms, pitch: p.pitch, speed: spd(c, p.speed ?? 6.2), r: p.r ?? 0.28, col: p.col ?? 2, acc: p.acc });
    });
  },

  // 勇者ねらいの扇。勇者の高さにも向ける。rows 段で、段ごとに速さが違う。vfan で縦にも広げる
  fan(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 2.4, p.first ?? 1.2)) return;
    const n = cnt(c, p.n ?? 5), rows = p.rows ?? 1, spread = p.spread ?? 0.8, y = layerY(c, p.lay);
    const aim = aimTo(c.boss.x, c.boss.z, c.pl.x, c.pl.z) + (c.rand() - 0.5) * (p.jitter ?? 0);
    const pitch0 = aimPitch(c, c.boss.x, y, c.boss.z);
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < n; i++) {
        const a = aim + (n > 1 ? (i - (n - 1) / 2) * (spread / (n - 1)) : 0);
        c.fire({ y, ang: a, pitch: pitch0 + (row - (rows - 1) / 2) * (p.vfan ?? 0), speed: spd(c, (p.speed ?? 9) * (1 + row * (p.rowGap ?? 0.14))), r: p.r ?? 0.38, col: p.col ?? 0 });
      }
    }
  },

  // 花。向きによって速さを変えて、花びらの形に広がる
  flower(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 3.4, p.first ?? 1.0)) return;
    const n = cnt(c, p.n ?? 54), petals = p.petals ?? 5, depth = p.depth ?? 0.5, off = rt.k * (p.rot ?? 0.3);
    for (const L of layersNow(p, rt)) {
      const y = layerY(c, L);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const s = (p.speed ?? 6) * (1 - depth + depth * Math.abs(Math.cos((petals * a) / 2)));
        c.fire({ y, ang: a + off, pitch: p.pitch, speed: spd(c, s), r: p.r ?? 0.3, col: p.col ?? 3 });
      }
    }
  },

  // 空から落ちる大玉。落ちる場所に床の警告が出て、勇者の高さを通るころに ちょうど警告が終わる。床につくと輪になって散る
  rain(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 0.9, p.first ?? 1.2)) return;
    const n = cnt(c, p.n ?? 1), warn = p.warn ?? 1.0, v = p.speed ?? 22;
    for (let i = 0; i < n; i++) {
      let tx, tz;
      if (c.rand() < (p.aim ?? 0.8)) {
        const a = c.rand() * TAU, d = Math.sqrt(c.rand()) * (p.area ?? 5);
        tx = c.pl.x + Math.sin(a) * d; tz = c.pl.z + Math.cos(a) * d;
      } else {
        const a = c.rand() * TAU, d = Math.sqrt(c.rand()) * (ARENA_R - 2);
        tx = Math.sin(a) * d; tz = Math.cos(a) * d;
      }
      const d = Math.hypot(tx, tz);
      if (d > ARENA_R - 1) { tx *= (ARENA_R - 1) / d; tz *= (ARENA_R - 1) / d; }
      const r = p.r ?? 0.85;
      c.mark({ x: tx, z: tz, r: r * 1.5, life: warn, col: p.col ?? 4 });
      c.fire({ x: tx, y: Math.min(c.pl.y + v * warn, 38), z: tz, pitch: -Math.PI / 2, speed: v, r, col: p.col ?? 4, form: 1, splash: p.splash ?? 8, life: 5 });
    }
  },

  // 小雨。空じゅうから細かい弾が降る
  drizzle(p, rt, c) {
    if (rt.start === undefined) rt.start = p.first ?? 1.0;
    rt.start -= c.dt;
    if (rt.start > 0) return;
    stream(rt, c.dt, (p.rate ?? 12) * c.cm, () => {
      const near = c.rand() < (p.aim ?? 0.5);
      const a = c.rand() * TAU, d = Math.sqrt(c.rand()) * (near ? 9 : ARENA_R - 2);
      const cx = near ? c.pl.x : 0, cz = near ? c.pl.z : 0;
      c.fire({ x: cx + Math.sin(a) * d, y: 34, z: cz + Math.cos(a) * d, pitch: -Math.PI / 2, speed: spd(c, p.speed ?? 11), r: p.r ?? 0.3, col: p.col ?? 5, life: 4 });
    });
  },

  // レーザー。警告の細い線のあと、太い光になる。mode "spin" は回る風車、"aim" は勇者を狙って固定。lay で高さ、h で厚み
  lasers(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 8, p.first ?? 2)) return;
    const arms = p.arms ?? 3, warn = p.warn ?? 1.2, dur = p.dur ?? 3.5;
    const base = p.mode === "aim" ? aimTo(c.boss.x, c.boss.z, c.pl.x, c.pl.z) : c.rand() * TAU;
    const dir = rt.k % 2 ? 1 : -1, y = layerY(c, pick(p.lay, rt.k));
    for (let k = 0; k < arms; k++) {
      const a = p.mode === "aim" ? base + (k - (arms - 1) / 2) * (p.gap ?? 0.5) : base + (k * TAU) / arms;
      c.laser({ ang: a, spin: p.mode === "aim" ? (p.sweep ?? 0) * dir : dir * (p.spin ?? 0.5) * c.sm, warn, life: dur, w: p.width ?? 0.55, len: 60, col: p.col ?? 7, y, h: p.h ?? 0.6 });
    }
  },

  // 柱。床に警告が出て、そのあと 高さに関係なく 立ちのぼる。上にも下にもにげられないので、横へ動く
  pillars(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 3, p.first ?? 2)) return;
    const n = cnt(c, p.n ?? 3);
    for (let i = 0; i < n; i++) {
      let tx, tz;
      if (c.rand() < (p.aim ?? 0.7)) {
        const a = c.rand() * TAU, d = Math.sqrt(c.rand()) * (p.area ?? 6);
        tx = c.pl.x + Math.sin(a) * d; tz = c.pl.z + Math.cos(a) * d;
      } else {
        const a = c.rand() * TAU, d = Math.sqrt(c.rand()) * (ARENA_R - 3);
        tx = Math.sin(a) * d; tz = Math.cos(a) * d;
      }
      const d = Math.hypot(tx, tz);
      if (d > ARENA_R - 1.5) { tx *= (ARENA_R - 1.5) / d; tz *= (ARENA_R - 1.5) / d; }
      c.pillar({ x: tx, z: tz, r: p.r ?? 1.1, warn: p.warn ?? 1.1, life: p.dur ?? 0.8, col: p.col ?? 0 });
    }
  },

  // 咲く玉。ボスのまわりに玉がならび、しばらく止まってから 勇者めがけて（高さも）動きだす
  bloom(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 5, p.first ?? 1.5)) return;
    const n = cnt(c, p.n ?? 26), radius = p.radius ?? 6, off = c.rand() * TAU;
    for (const L of layersNow(p, rt)) {
      const y = layerY(c, L);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        c.fire({
          x: c.boss.x + Math.sin(a) * radius, y, z: c.boss.z + Math.cos(a) * radius, ang: a, speed: spd(c, p.speed ?? 8),
          r: p.r ?? 0.34, col: p.col ?? 5, hold: (p.hold ?? 1.1) + i * (p.stagger ?? 0.03), aim: p.aim ?? true,
        });
      }
    }
  },

  // 追ってくる大玉。ゆっくり曲がって（高さも合わせて）、時間がたつと消える
  orbs(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 4, p.first ?? 2)) return;
    const n = cnt(c, p.n ?? 3), aim = aimTo(c.boss.x, c.boss.z, c.pl.x, c.pl.z), y = layerY(c, p.lay), pitch = aimPitch(c, c.boss.x, y, c.boss.z);
    for (let i = 0; i < n; i++) {
      c.fire({
        y, ang: aim + (n > 1 ? (i - (n - 1) / 2) * (p.spread ?? 0.9) : 0), pitch, speed: spd(c, p.speed ?? 4.5),
        r: p.r ?? 0.75, col: p.col ?? 6, form: 1, home: p.turn ?? 1.1, life: p.life ?? 7,
      });
    }
  },

  // 球。ボスの中心から、あらゆる向きへ。床で はねかえる
  burst(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 4.5, p.first ?? 2)) return;
    const n = cnt(c, p.n ?? 48), rot = c.rand() * TAU;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * GOLDEN + rot;
      c.fire({ y: c.boss.y, ang: Math.atan2(Math.cos(th) * rad, Math.sin(th) * rad), pitch: Math.asin(y), speed: spd(c, p.speed ?? 7), r: p.r ?? 0.34, col: p.col ?? 0, bounce: p.bounce ?? 1 });
    }
  },

  // 曲がる弾。弾ごとに曲がり方が違って、うねる帯になる。腕ごとに高さをかえられる
  snake(p, rt, c) {
    if (rt.start === undefined) rt.start = p.first ?? 1.0;
    rt.start -= c.dt;
    if (rt.start > 0) return;
    const arms = p.arms ?? 2;
    if (rt.a === undefined) { rt.a = c.rand() * TAU; rt.w = 0; }
    const rate = (p.rate ?? 10) * c.cm;
    stream(rt, c.dt, rate, () => {
      rt.w += 1 / rate;
      rt.a += (p.spin ?? 0.35) / rate;
      const turn = (p.amp ?? 0.8) * Math.sin(rt.w * (p.freq ?? 2.2));
      for (let k = 0; k < arms; k++) c.fire({ y: layerY(c, pick(p.lay, 0, k)), ang: rt.a + (k * TAU) / arms, speed: spd(c, p.speed ?? 6.5), turn: k % 2 ? -turn : turn, r: p.r ?? 0.3, col: p.col ?? 2 });
    });
  },

  // 壁。横一列の弾が 1か所だけ穴をあけて迫ってくる。tall なら 5段の高い壁で、穴は 横と高さの両方（勇者の高さの近く）。rows で段の高さを選べる
  wall(p, rt, c) {
    if (!due(rt, c.dt, p.every ?? 3.4, p.first ?? 1.5)) return;
    const half = p.half ?? 16, step = (p.step ?? 1.35) / c.cm, gapW = p.gapW ?? 3.6;
    const h = aimTo(c.boss.x, c.boss.z, c.pl.x, c.pl.z);
    const px = Math.cos(h), pz = -Math.sin(h);                 // 進む向きに直角
    const lat = (c.pl.x - c.boss.x) * px + (c.pl.z - c.boss.z) * pz;
    const gap = p.aimGap === false ? (c.rand() * 2 - 1) * (half - gapW) : clamp(lat + (c.rand() - 0.5) * 7, -half + gapW, half - gapW);
    const ys = p.tall ? [-4, -2, 0, 2, 4].map((d) => clamp(c.pl.y + d, Y_MIN, Y_MAX)) : (p.rows || [p.lay]).map((v) => layerY(c, v));
    const gapY = p.tall ? clamp(c.pl.y + (c.rand() - 0.5) * 3, Y_MIN + 1, Y_MAX - 1) : null, gapH = p.gapH ?? 2.6;
    for (const y of ys) {
      const open = gapY === null || Math.abs(y - gapY) < gapH / 2 + 0.1;
      for (let u = -half; u <= half; u += step) {
        if (open && Math.abs(u - gap) < gapW / 2) continue;
        c.fire({ x: c.boss.x + px * u, y, z: c.boss.z + pz * u, ang: h, speed: spd(c, p.speed ?? 5.5), r: p.r ?? 0.4, col: p.col ?? 1 });
      }
    }
  },
};
