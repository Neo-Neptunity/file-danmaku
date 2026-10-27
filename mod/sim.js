// ゲームの中身。画面にも本体にも触れない（そのまま Node でも動く）。
// 世界：半径 ARENA_R の円柱。勇者もボスも、上下左右前後に自由に動く。勇者は一人称（見る向き yaw・pitch）で、画面の中央が照準。
// 見る向き：yaw 0 が +z、π/2 が +x（左へ回すと増える）。pitch は 上が正
// 入力 inp：{ ix（右が正）, iz（前が正）, iy（上が正）, turnYaw（右へ回す量・ラジアン）, turnPitch（上へ向ける量）, lookX, lookY（キーで回す -1〜1）,
//            lock（ボスのほうを向く）, focus, shoot, charge, dash }。ix・iz は見ている水平の向きが基準
import { clamp, lerp, TAU, angDiff, makeRng } from "./math.js";
import {
  ARENA_R, Y_MIN, Y_MAX, CLIMB_SPEED, PLAYER_R, GRAZE_PAD, BOSS_R, BOSS_HOME, BOSS_RANGE, MIN_DIST, MAX_BULLETS, CULL_R2, START_POS,
  PLAYER_SPEED, FOCUS_MUL, WEAK_SIN, WEAK_MUL,
} from "./consts.js";
import { Bullets, F_GRAZED, F_AIM, F_SPLASH } from "./bullets.js";
import { PATTERNS } from "./patterns.js";
import { bossFor, DIFFS } from "./stages.js";
import { KINDS, KIND_ORDER } from "./ammo.js";
import { evalCombos, foldMods, fxText } from "./combos.js";

const BOLT_SPEED = 46, BOLT_RATE = 11;
const MAX_EVENTS = 600;
const GRAVITY = 16;
const KEY_LOOK = 2.0;                       // キーで視点を回す速さ（ラジアン／秒）
const AUTO_GAIN = { off: 0, weak: 0.9, strong: 2.6 };
const PITCH_MAX = 1.5;

// 見る向きから、前・右・上の 3 本の向き
export function basisOf(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  return { f: { x: sy * cp, y: sp, z: cy * cp }, r: { x: -cy, y: 0, z: sy }, u: { x: -sy * sp, y: cp, z: -cy * sp } };
}

export function createGame(opts = {}) {
  const diff = DIFFS[opts.difficulty] || DIFFS.normal;
  const seed = opts.seed ?? 1;
  const g = {
    seed, rand: makeRng(seed), diff, practice: !!opts.practice, deficit: opts.deficit || 0, started: false,
    bossBase: opts.bossBase || null,                                         // フォルダのボスなど、面の番号から決まらないボス
    unlocked: opts.unlocked ? new Set(opts.unlocked) : null,                 // null はぜんぶ解放
    metaFx: opts.metaFx || null,
    opt: { assist: ((opts.assist ?? 7) * Math.PI) / 180, autoTurn: opts.autoTurn || "weak" },
    t: 0, mode: "intro", modeT: 0, stage: 0, boss: null, bossDef: null, phaseIdx: -1,
    p: {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0, yaw: Math.PI, pitch: 0, hp: diff.lives, hpMax: diff.lives,
      inv: 0, cannonCd: 0, dashCd: 0, dashT: 0, ddx: 0, ddy: 0, ddz: -1, recoil: 0, rootT: 0, fireCd: 0, ch: null, focus: false, prevCharge: false, holdOff: false,
    },
    bullets: new Bullets(MAX_BULLETS),
    shots: [], lasers: [], pillars: [], marks: [], pending: [], events: [], inp: {},
    mag: (opts.loadout || []).filter(Boolean).map((a) => ({ ...a })),
    kindSel: "shot", fileIdx: {},
    score: 0, graze: 0, slowT: 0, slowScale: 1, popBudget: 0, shield: 0, lookIdle: 0, locked: false,
    combos: [], missed: [], mods: null,
    stats: { fired: [], dmg: 0, weakDmg: 0, weakHits: 0, biggest: null, hits: 0, phasesCleared: 0, phasesTimeout: 0, clears: 0, reflected: 0 },
  };
  g.kindSel = KIND_ORDER.find((k) => g.mag.some((a) => a.kind === k)) || "shot";
  g.pc = {
    dt: 0, t: 0, boss: null, pl: g.p, rand: g.rand, cm: 1, sm: 1,
    fire: (s) => {
      if (s.x === undefined) s.x = g.boss.x;
      if (s.z === undefined) s.z = g.boss.z;
      if (s.y === undefined) s.y = g.boss.y;
      g.bullets.add(s);
    },
    laser: (s) => g.lasers.push({ x: g.boss.x, z: g.boss.z, y: s.y ?? g.boss.y, off: (s.y ?? g.boss.y) - g.boss.y, h: 0.6, spin: 0, follow: true, age: 0, grazeCd: 0, ...s, max: s.life }),
    pillar: (s) => g.pillars.push({ age: 0, grazeCd: 0, ...s, max: s.life }),
    mark: (s) => g.marks.push({ ...s, max: s.life }),
  };
  startStage(g, opts.stage || 1);
  return g;
}

const emit = (g, e) => { if (g.events.length < MAX_EVENTS) g.events.push(e); };

export function startStage(g, n) {
  g.stage = n;
  g.bossDef = bossFor(n, g.diff.id, g.seed, g.bossBase);
  g.boss = {
    x: BOSS_HOME.x, y: BOSS_HOME.y + 14, z: BOSS_HOME.z, vx: 0, vy: 0, vz: 0, r: BOSS_R, hp: 1, hpMax: 1, state: "intro", t: 0, rt: [], phase: null, enrage: 0, isLast: false, noMiss: true,
    left: 0, gapT: 0, weak: null, weakNext: null, weakT: 0, weakWarn: 0, dart: null,
  };
  g.pc.boss = g.boss;
  g.phaseIdx = -1;
  g.mode = "intro";
  g.modeT = 0;
  g.bullets.clear(); g.shots.length = 0; g.lasers.length = 0; g.pillars.length = 0; g.marks.length = 0; g.pending.length = 0;
  // 役：この面のはじめのマガジンで決まり、面のあいだは かわらない。強化は 役に足す
  const ev = evalCombos(g.mag, g.unlocked);
  g.combos = ev.list;
  g.missed = ev.missed;
  g.mods = foldMods(g.metaFx ? [...ev.list, { fx: g.metaFx }] : ev.list);
  g.p.hpMax = g.diff.lives + g.mods.lives;
  g.p.hp = g.started ? clamp(g.p.hp, 1, g.p.hpMax) : Math.max(1, g.p.hpMax - g.deficit);
  g.started = true;
  g.shield = g.mods.shield;
  Object.assign(g.p, { x: START_POS.x, y: START_POS.y, z: START_POS.z, vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0, yaw: Math.PI, pitch: 0, ch: null, recoil: 0, rootT: 0, dashT: 0, cannonCd: 0, inv: 1.5, prevCharge: false, holdOff: false });
  g.lookIdle = 0;
  if (!g.mag.some((a) => a.kind === g.kindSel)) g.kindSel = KIND_ORDER.find((k) => g.mag.some((a) => a.kind === k)) || g.kindSel;
  emit(g, { t: "stage", n, name: g.bossDef.name, title: g.bossDef.title, label: g.bossDef.label || null });
  emit(g, { t: "combos", list: g.combos.map((c) => ({ name: c.name, text: fxText(c.fx).join("　") })), missed: g.missed.length });
}

// ---- 弾の種類を選ぶ（種類ごとの山。大きいファイルから使う）--------------------------
export const kindList = (g, kind) => g.mag.filter((a) => a.kind === kind).sort((a, b) => b.dmg - a.dmg || (a.uid ?? 0) - (b.uid ?? 0));
export const kindCount = (g, kind) => g.mag.reduce((n, a) => n + (a.kind === kind ? 1 : 0), 0);
export function currentAmmo(g) {
  const l = kindList(g, g.kindSel);
  return l.length ? l[clamp(g.fileIdx[g.kindSel] || 0, 0, l.length - 1)] : null;
}
export const ammoLeft = (g) => g.mag.length;

function cancelCharge(g) {
  if (!g.p.ch) return;
  g.p.ch = null;
  emit(g, { t: "chargeCancel" });
}

// その種類を選ぶ。もう選んでいれば、同じ種類の次のファイルへ
export function selectKind(g, kind) {
  if (!kindCount(g, kind)) { emit(g, { t: "deny" }); return false; }
  if (g.kindSel === kind) return cycleFile(g);
  g.kindSel = kind;
  g.fileIdx[kind] = 0;
  cancelCharge(g);
  emit(g, { t: "select", kind });
  return true;
}
export function cycleKind(g, d) {
  const at = KIND_ORDER.indexOf(g.kindSel);
  for (let k = 1; k <= KIND_ORDER.length; k++) {
    const kind = KIND_ORDER[(at + d * k + KIND_ORDER.length * 8) % KIND_ORDER.length];
    if (kindCount(g, kind)) {
      if (kind !== g.kindSel) { g.kindSel = kind; g.fileIdx[kind] = 0; cancelCharge(g); emit(g, { t: "select", kind }); }
      return true;
    }
  }
  return false;
}
export function cycleFile(g) {
  const l = kindList(g, g.kindSel);
  if (l.length < 2) return false;
  g.fileIdx[g.kindSel] = ((g.fileIdx[g.kindSel] || 0) + 1) % l.length;
  cancelCharge(g);
  emit(g, { t: "select", kind: g.kindSel });
  return true;
}
function removeAmmo(g, a) {
  const i = g.mag.indexOf(a);
  if (i >= 0) g.mag.splice(i, 1);
  g.fileIdx[a.kind] = 0;
  if (!kindCount(g, g.kindSel)) cycleKind(g, 1);
}

// 見ている水平の向きを基準にした入力に直す（ボットやテスト用）。w は世界の向き
export function inputFromWorld(g, wx, wy, wz) {
  const sy = Math.sin(g.p.yaw), cy = Math.cos(g.p.yaw);
  return { ix: wx * -cy + wz * sy, iz: wx * sy + wz * cy, iy: wy };
}

// ---- 弱点 ------------------------------------------------------------------
// ボスの中心から見た点の向きが、上・正面・下 のどれか
export function sideOf(dx, dy, dz) {
  const l = Math.hypot(dx, dy, dz);
  if (l < 0.3) return "mid";
  const s = dy / l;
  return s > WEAK_SIN ? "high" : s < -WEAK_SIN ? "low" : "mid";
}

// 勇者の今の水平のへだたりで、上・下が弱点になる高さ（画面の高度計に使う）
export function weakBand(g) {
  const b = g.boss, d = Math.hypot(g.p.x - b.x, g.p.z - b.z), k = (d * WEAK_SIN) / Math.sqrt(1 - WEAK_SIN * WEAK_SIN);
  return { up: b.y + k, down: b.y - k };
}

function updateWeak(g, dt) {
  const b = g.boss, ph = b.phase;
  if (!ph || !ph.weak) { b.weak = null; b.weakNext = null; return; }
  if (b.weakWarn > 0) {
    b.weakWarn -= dt;
    if (b.weakWarn <= 0) { b.weak = b.weakNext; b.weakNext = null; b.weakT = ph.weak; emit(g, { t: "weak", side: b.weak }); }
  } else {
    b.weakT -= dt;
    if (b.weakT <= 0) {
      const opts = ["high", "mid", "low"].filter((s) => s !== b.weak);
      b.weakNext = opts[(g.rand() * opts.length) | 0];
      b.weakWarn = 1.2;
      emit(g, { t: "weakWarn", side: b.weakNext });
    }
  }
}

// ---- 1コマ進める --------------------------------------------------------------
export function update(g, dt, inp = {}) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 1 / 30);
  g.inp = inp;
  let w = dt;
  if (g.slowT > 0) { g.slowT -= dt; w = dt * g.slowScale; }
  g.t += w;
  g.modeT += w;
  g.popBudget = 70;
  const b = g.boss;

  if (g.mode === "intro") {
    b.y = lerp(b.y, BOSS_HOME.y, 1 - Math.exp(-w * 2.2));
    updatePlayer(g, w, inp, false);
    if (g.modeT > 2.6) { g.mode = "fight"; g.modeT = 0; startPhase(g, 0); }
  } else if (g.mode === "fight") {
    updatePlayer(g, w, inp, true);
    updateBoss(g, w);
    constrain(g);
  } else if (g.mode === "clear") {
    updatePlayer(g, w, inp, false);
  }
  updateAim(g);
  if (g.mode !== "over") {
    updatePending(g, w);
    updateBullets(g, w);
    updateShots(g, w);
    updateLasers(g, w);
    updatePillars(g, w);
    updateMarks(g, w);
  }
}

// ---- 視点と照準 ----------------------------------------------------------------
// 照準：見ている向き。ボスが ロックオン補助の角度の中なら、ボスの中心へ
function updateAim(g) {
  const p = g.p, b = g.boss, { f } = basisOf(p.yaw, p.pitch);
  const tb = unit(b.x - p.x, b.y - p.y, b.z - p.z);
  const ang = Math.acos(clamp(f.x * tb.x + f.y * tb.y + f.z * tb.z, -1, 1));
  g.locked = g.opt.assist > 0 && ang < g.opt.assist && b.state !== "dead";
  g.aim = g.locked ? { x: tb.x, y: tb.y, z: tb.z } : f;
}

// 弾を出す位置から見た 撃つ向き
function aimFrom(g, ox, oy, oz) {
  if (g.locked) return unit(g.boss.x - ox, g.boss.y - oy, g.boss.z - oz);
  return { ...basisOf(g.p.yaw, g.p.pitch).f, len: 1 };
}

// 照準の先の点（ロックオンしていれば ボスの中心）
function aimPoint(g, dist = 30) {
  const p = g.p;
  if (g.locked) return { x: g.boss.x, y: g.boss.y, z: g.boss.z };
  const { f } = basisOf(p.yaw, p.pitch);
  return { x: p.x + f.x * dist, y: clamp(p.y + f.y * dist, 1, CEIL_LIM), z: p.z + f.z * dist };
}
const CEIL_LIM = 22;

function updateView(g, dt, inp) {
  const p = g.p, b = g.boss;
  const turned = !!(inp.turnYaw || inp.turnPitch || inp.lookX || inp.lookY);
  p.yaw -= (inp.turnYaw || 0) + (inp.lookX || 0) * KEY_LOOK * dt;
  p.pitch += (inp.turnPitch || 0) + (inp.lookY || 0) * KEY_LOOK * dt;
  let gain = 0;
  if (inp.lock) gain = 10;
  else if (turned) g.lookIdle = 0;
  else {
    g.lookIdle += dt;
    gain = g.lookIdle > 0.5 ? AUTO_GAIN[g.opt.autoTurn] || 0 : 0;
  }
  if (gain > 0 && b.state !== "dead") {
    const tb = unit(b.x - p.x, b.y - p.y, b.z - p.z), wantYaw = Math.atan2(tb.x, tb.z), wantPitch = Math.asin(clamp(tb.y, -1, 1));
    const dyaw = angDiff(p.yaw, wantYaw), dp = wantPitch - p.pitch;
    if (inp.lock || Math.hypot(dyaw, dp) < 1.8) {
      const k = Math.min(1, gain * dt);
      p.yaw += dyaw * k;
      p.pitch += dp * k;
    }
  }
  p.yaw = ((p.yaw % TAU) + TAU) % TAU;
  p.pitch = clamp(p.pitch, -PITCH_MAX, PITCH_MAX);
}

// ---- 勇者 ------------------------------------------------------------------
function updatePlayer(g, dt, inp, armed) {
  const p = g.p, b = g.boss, M = g.mods;
  p.inv = Math.max(0, p.inv - dt);
  p.cannonCd = Math.max(0, p.cannonCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.recoil = Math.max(0, p.recoil - dt);
  p.rootT = Math.max(0, p.rootT - dt);
  p.fireCd -= dt;

  updateView(g, dt, inp);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const ix = clamp(inp.ix || 0, -1, 1), iz = clamp(inp.iz || 0, -1, 1), iy = clamp(inp.iy || 0, -1, 1);
  let wx = -cy * ix + sy * iz, wz = sy * ix + cy * iz;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  p.focus = !!inp.focus;
  const rooted = p.rootT > 0 || p.recoil > 0;           // 光線を撃っている間と、反動の間は動けない
  let sp = PLAYER_SPEED * (1 + M.speed) * (p.focus ? FOCUS_MUL : 1);
  let cs = CLIMB_SPEED * (1 + M.speed + M.climb) * (p.focus ? 0.6 : 1);
  if (p.ch) sp *= clamp(p.ch.slow + M.chargeSlow, 0, 1);
  if (rooted) { sp = 0; cs = 0; }

  if (inp.dash && armed && p.dashCd <= 0 && !rooted) {
    p.dashCd = 0.9 * (1 - M.dash); p.dashT = 0.15; p.inv = Math.max(p.inv, 0.24);
    const dl = Math.hypot(wx, iy, wz);
    if (dl > 0.1) { p.ddx = wx / dl; p.ddy = iy / dl; p.ddz = wz / dl; } else { p.ddx = sy; p.ddy = 0; p.ddz = cy; }
    emit(g, { t: "dash", x: p.x, y: p.y, z: p.z });
  }
  if (p.dashT > 0) { p.dashT -= dt; p.vx = p.ddx * 28; p.vy = p.ddy * 28; p.vz = p.ddz * 28; }
  else {
    const k = 1 - Math.exp(-dt * 18);
    p.vx += (wx * sp - p.vx) * k;
    p.vy += (iy * cs - p.vy) * k;
    p.vz += (wz * sp - p.vz) * k;
  }
  p.x += (p.vx + p.kx) * dt;
  p.y += (p.vy + p.ky) * dt;
  p.z += (p.vz + p.kz) * dt;
  const kd = Math.exp(-dt * 5);
  p.kx *= kd; p.ky *= kd; p.kz *= kd;
  constrain(g);

  const edge = !!inp.charge && !p.prevCharge;
  p.prevCharge = !!inp.charge;
  if (!inp.charge) p.holdOff = false;
  if (!armed) { cancelCharge(g); return; }

  // 集束弾：飛んでいる間に もう一度 溜めるキーを押すと、その場で起爆
  if (edge) {
    const bomb = g.shots.find((s) => s.k === "bomb" && s.manual && !s.dead);
    if (bomb) { detonate(g, bomb); p.holdOff = true; }
  }

  // 溜める → 放す
  const cur = currentAmmo(g);
  const canCharge = inp.charge && !p.holdOff && cur && b.state === "attack" && p.cannonCd <= 0 && p.recoil <= 0 && p.rootT <= 0;
  if (canCharge) {
    if (!p.ch || p.ch.ammo !== cur) {
      p.ch = { ammo: cur, t: 0, need: cur.charge, ready: false, slow: lerp(0.85, 0.3, cur.tier / 5) };
      emit(g, { t: "chargeStart", ammo: cur });
    }
    if (!p.ch.ready) {
      p.ch.t += dt * (1 + M.charge);
      if (p.ch.t >= p.ch.need) { p.ch.t = p.ch.need; p.ch.ready = true; emit(g, { t: "chargeReady", ammo: cur }); }
    }
  } else if (p.ch) {
    const ch = p.ch;
    p.ch = null;
    if (ch.ready && g.mag.includes(ch.ammo)) fireCannon(g, ch.ammo);
    else emit(g, { t: "chargeCancel" });
  }

  // ふつうの弾
  if (inp.shoot && !p.ch && p.recoil <= 0 && p.rootT <= 0 && p.fireCd <= 0 && b.state === "attack") {
    p.fireCd += 1 / BOLT_RATE;
    if (p.fireCd < 0) p.fireCd = 0;
    const dmg = (p.focus ? 1.9 : 1.4) * (1 + M.basic + M.dmgAll);
    const { r, u } = basisOf(p.yaw, p.pitch);
    for (const side of [-0.28, 0.28]) {           // 画面の隅からではなく、照準の すぐ下から出る
      const ox = p.x + r.x * side - u.x * 0.22, oy = p.y + r.y * side - u.y * 0.22, oz = p.z + r.z * side - u.z * 0.22;
      const d = aimFrom(g, ox, oy, oz);
      const j = p.focus ? 0.01 : 0.05, jx = (g.rand() - 0.5) * j, jy = (g.rand() - 0.5) * j;
      g.shots.push({ k: "bolt", x: ox, y: oy, z: oz, vx: (d.x + jx) * BOLT_SPEED, vy: (d.y + jy) * BOLT_SPEED, vz: (d.z + jx) * BOLT_SPEED, dmg, life: 1.5, r: 0.18 });
    }
    emit(g, { t: "bolt" });
  } else if (p.fireCd < 0) p.fireCd = 0;
}

function constrain(g) {
  const p = g.p, b = g.boss;
  const o = Math.hypot(p.x, p.z), lim = ARENA_R - 1;
  if (o > lim) { p.x *= lim / o; p.z *= lim / o; }
  p.y = clamp(p.y, Y_MIN, Y_MAX);
  const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z, d = Math.hypot(dx, dy, dz) || 0.001;
  if (d < MIN_DIST) { p.x = b.x + (dx / d) * MIN_DIST; p.y = b.y + (dy / d) * MIN_DIST; p.z = b.z + (dz / d) * MIN_DIST; p.y = clamp(p.y, Y_MIN, Y_MAX); }
}

function unit(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l, len: l };
}

// d に垂直な 2 本の向き
function perp(d) {
  const a = Math.abs(d.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const r = unit(d.y * a.z - d.z * a.y, d.z * a.x - d.x * a.z, d.x * a.y - d.y * a.x);
  const u = { x: r.y * d.z - r.z * d.y, y: r.z * d.x - r.x * d.z, z: r.x * d.y - r.y * d.x };
  return { r, u };
}

// ---- ボス --------------------------------------------------------------------
function startPhase(g, i) {
  const b = g.boss, ph = g.bossDef.phases[i];
  g.phaseIdx = i;
  b.phase = ph; b.state = "attack"; b.t = 0; b.hp = b.hpMax = ph.hp; b.enrage = 0;
  b.rt = ph.atk.map(() => ({}));
  b.isLast = i === g.bossDef.phases.length - 1;
  b.noMiss = true;
  b.left = ph.time;
  b.dart = null;
  b.weak = ph.weak ? ["high", "mid", "low"][(g.rand() * 3) | 0] : null;
  b.weakNext = null; b.weakWarn = 0; b.weakT = ph.weak ? 3 : 0;
  emit(g, { t: "phase", idx: i, name: ph.name, last: b.isLast, hpMax: ph.hp, count: g.bossDef.phases.length, weak: b.weak });
}

const inRange = (x, y, z) => {
  const r = Math.hypot(x, z);
  if (r > BOSS_RANGE.r) { x *= BOSS_RANGE.r / r; z *= BOSS_RANGE.r / r; }
  return { x, y: clamp(y, BOSS_RANGE.y0, BOSS_RANGE.y1), z };
};

// ボスの動き：目当ての場所を決めて、そこへ近づく
function bossTarget(g, b, ph, dt) {
  const t = b.t, H = BOSS_HOME, p = g.p;
  switch (ph.move) {
    case "hold": return { x: b.x, y: b.y, z: b.z, k: 0 };     // 試験用：その場にいる
    case "orbit": {
      const a = t * 0.22 + 1;
      return { ...inRange(Math.cos(a) * 11, H.y + 3 * Math.sin(t * 0.5), Math.sin(a) * 11), k: 3 };
    }
    case "tilt": {
      const a = t * 0.25, r = 12, tilt = 0.6;
      return { ...inRange(Math.cos(a) * r, H.y + Math.sin(a) * r * Math.sin(tilt) * 0.7, Math.sin(a) * r * Math.cos(tilt)), k: 3 };
    }
    case "dart": {
      if (!b.dart || b.dart.t <= 0) {
        for (let tries = 0; tries < 12; tries++) {
          const a = g.rand() * TAU, rr = Math.sqrt(g.rand()) * BOSS_RANGE.r, y = BOSS_RANGE.y0 + g.rand() * (BOSS_RANGE.y1 - BOSS_RANGE.y0);
          const q = { x: Math.sin(a) * rr, y, z: Math.cos(a) * rr };
          if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) >= 14 || tries === 11) { b.dart = { ...q, t: 4.5 }; break; }
        }
      }
      b.dart.t -= dt;
      return { ...inRange(b.dart.x + 1.5 * Math.sin(t * 1.3), b.dart.y + Math.sin(t * 0.9), b.dart.z), k: 2.2 };
    }
    case "chase": {
      // 勇者から 16 ほどはなれた所へ、ゆっくり ついてくる
      const d = unit(b.x - p.x, b.y - p.y, b.z - p.z), want = 13;
      return { ...inRange(p.x + d.x * want, p.y + 3 + d.y * 2, p.z + d.z * want), k: 0.9 };
    }
    default:
      return { ...inRange(H.x + 4 * Math.sin(t * 0.5) + 2 * Math.sin(t * 0.83), H.y + 2.2 * Math.sin(t * 0.8), H.z + 3 * Math.sin(t * 0.37 + 1)), k: 3 };
  }
}

function updateBoss(g, dt) {
  const b = g.boss;
  b.t += dt;
  const ph = b.phase;
  const ox = b.x, oy = b.y, oz = b.z;
  if (ph) {
    const tg = bossTarget(g, b, ph, dt), k = 1 - Math.exp(-dt * tg.k);
    // 面が進むほど、ボスは 勇者のそばから はなれない（遠くへにげても、弾が追いつく）
    const D = clamp(24 - 1.6 * (g.stage - 1), 13, 24), p = g.p, pd = Math.hypot(tg.x - p.x, tg.y - p.y, tg.z - p.z);
    if (pd > D) { const q = inRange(p.x + ((tg.x - p.x) * D) / pd, p.y + ((tg.y - p.y) * D) / pd, p.z + ((tg.z - p.z) * D) / pd); tg.x = q.x; tg.y = q.y; tg.z = q.z; }
    b.x += (tg.x - b.x) * k;
    b.y += (tg.y - b.y) * k + (ph.lift ? Math.sin(g.t * 0.8) * ph.lift * dt : 0);
    b.z += (tg.z - b.z) * k;
  }
  b.vx = (b.x - ox) / dt; b.vy = (b.y - oy) / dt; b.vz = (b.z - oz) / dt;

  if (b.state === "attack") {
    b.left = ph.time - b.t;
    updateWeak(g, dt);
    const c = g.pc, sc = g.bossDef.scale || { cm: 1, sm: 1 };
    c.dt = dt; c.t = b.t;
    c.cm = g.diff.cm * sc.cm; c.sm = g.diff.sm * sc.sm;
    if (b.left < 0 && b.isLast) {
      b.enrage += dt;
      c.cm *= 1 + Math.min(0.6, b.enrage / 30);
      c.sm *= 1 + Math.min(0.3, b.enrage / 40);
    }
    for (let i = 0; i < ph.atk.length; i++) PATTERNS[ph.atk[i].t](ph.atk[i], b.rt[i], c);
    if (b.left <= 0 && !b.isLast && b.state === "attack") endPhase(g, false);
  } else if (b.state === "gap") {
    b.gapT -= dt;
    if (b.gapT <= 0) startPhase(g, g.phaseIdx + 1);
  }
}

function endPhase(g, killed) {
  const b = g.boss;
  clearAll(g, false);
  g.lasers.length = 0; g.pillars.length = 0; g.marks.length = 0;
  b.weak = null; b.weakNext = null; b.weakWarn = 0;
  if (killed) {
    const bonus = Math.round((Math.max(0, b.left) * 400 + 12000) * (b.noMiss ? 1.5 : 1));
    g.score += bonus;
    g.stats.phasesCleared++;
    emit(g, { t: "phaseClear", bonus, noMiss: b.noMiss, x: b.x, y: b.y, z: b.z, color: g.bossDef.color });
  } else {
    g.stats.phasesTimeout++;
    emit(g, { t: "phaseTimeout" });
  }
  if (g.phaseIdx + 1 >= g.bossDef.phases.length) {
    g.mode = "clear";
    g.modeT = 0;
    b.state = "dead";
    const bonus = g.p.hp * 20000 + g.stage * 10000;
    g.score += bonus;
    emit(g, { t: "stageClear", bonus, x: b.x, y: b.y, z: b.z, color: g.bossDef.color });
  } else {
    b.state = "gap";
    b.gapT = 1.9;
  }
}

// ダメージ。当たった点が、ボスの中心から見て 弱点の向きなら 1.8 倍（役で さらに増える）
export function damageBoss(g, dmg, x, y, z, src) {
  const b = g.boss;
  if (g.mode !== "fight" || b.state !== "attack" || b.t < 1.0 || b.hp <= 0) {
    emit(g, { t: "guard", x, y, z });
    return 0;
  }
  const side = sideOf(x - b.x, y - b.y, z - b.z);
  const weak = !!b.weak && b.weak === side;
  // フォルダのボスの 得意（効きにくい）と苦手（効きやすい）な砲。ふつうの弾は 変わらない
  const km = src && src.cannon && g.bossDef.kindMul ? g.bossDef.kindMul[src.cannon.kind] ?? 1 : 1;
  const d = Math.min(dmg * km * (weak ? WEAK_MUL + g.mods.weak : 1), b.hp);
  b.hp -= d;
  g.stats.dmg += d;
  if (weak) { g.stats.weakDmg += d; g.stats.weakHits++; }
  g.score += Math.round(d * 10);
  if (src && src.cannon && (!g.stats.biggest || d > g.stats.biggest.dmg)) g.stats.biggest = { name: src.cannon.name, bytes: src.cannon.bytes, dmg: Math.round(d) };
  emit(g, { t: "hit", x, y, z, dmg: d, cannon: !!(src && src.cannon), weak, side });
  if (b.hp <= 0) endPhase(g, true);
  return d;
}

function hurtPlayer(g) {
  const p = g.p;
  if (p.inv > 0 || g.mode !== "fight") return false;
  if (g.practice) { p.inv = 1.0; emit(g, { t: "hurt", x: p.x, y: p.y, z: p.z, hp: p.hp, practice: true }); return true; }
  if (g.shield > 0) {
    g.shield--;
    p.inv = 1.4;
    clearSphere(g, p.x, p.y, p.z, 5);
    emit(g, { t: "shield", x: p.x, y: p.y, z: p.z, left: g.shield });
    return true;
  }
  p.hp -= 1;
  p.inv = 2.8 + g.mods.inv;
  cancelCharge(g);
  g.boss.noMiss = false;
  g.stats.hits++;
  clearSphere(g, p.x, p.y, p.z, 7);
  g.slowT = 0.5; g.slowScale = 0.3;
  emit(g, { t: "hurt", x: p.x, y: p.y, z: p.z, hp: p.hp });
  if (p.hp <= 0) {
    g.mode = "over";
    g.modeT = 0;
    emit(g, { t: "over" });
  }
  return true;
}

// ---- 弾を消す ------------------------------------------------------------------
function pop(g, i) {
  const B = g.bullets;
  if (g.popBudget > 0) { g.popBudget--; emit(g, { t: "pop", x: B.x[i], y: B.y[i], z: B.z[i], col: B.col[i] }); }
  g.score += 3;
  g.stats.clears++;
  B.remove(i);
}

export function clearSphere(g, cx, cy, cz, rad) {
  const B = g.bullets;
  for (let i = B.n - 1; i >= 0; i--) {
    const dx = B.x[i] - cx, dy = B.y[i] - cy, dz = B.z[i] - cz, rr = rad + B.r[i];
    if (dx * dx + dy * dy + dz * dz < rr * rr) pop(g, i);
  }
}

function clearSegment(g, ax, ay, az, bx, by, bz, rad) {
  const B = g.bullets;
  const sx = bx - ax, sy = by - ay, sz = bz - az, l2 = sx * sx + sy * sy + sz * sz || 1;
  for (let i = B.n - 1; i >= 0; i--) {
    const t = clamp(((B.x[i] - ax) * sx + (B.y[i] - ay) * sy + (B.z[i] - az) * sz) / l2, 0, 1);
    const dx = B.x[i] - (ax + sx * t), dy = B.y[i] - (ay + sy * t), dz = B.z[i] - (az + sz * t), rr = rad + B.r[i];
    if (dx * dx + dy * dy + dz * dz < rr * rr) pop(g, i);
  }
}

function clearAll(g, quiet) {
  const B = g.bullets;
  if (!quiet) for (let i = B.n - 1; i >= 0 && g.popBudget > 0; i--) { g.popBudget--; emit(g, { t: "pop", x: B.x[i], y: B.y[i], z: B.z[i], col: B.col[i] }); }
  B.clear();
}

// ---- 敵の弾を動かす ------------------------------------------------------------
function updateBullets(g, dt) {
  const B = g.bullets, p = g.p;
  const px = p.x, py = p.y, pz = p.z;
  const canHit = g.mode === "fight" && p.inv <= 0;
  for (let i = B.n - 1; i >= 0; i--) {
    if (B.hold[i] > 0) {
      B.hold[i] -= dt;
      if (B.hold[i] <= 0) {
        B.hold[i] = 0;
        if (B.flags[i] & F_AIM) {
          const d = unit(px - B.x[i], py - B.y[i], pz - B.z[i]), s = B.spd[i];
          B.vx[i] = d.x * s; B.vy[i] = d.y * s; B.vz[i] = d.z * s;
          B.flags[i] &= ~F_AIM;
        }
      }
      continue;
    }
    if (B.home[i] !== 0) {
      const sp = Math.hypot(B.vx[i], B.vy[i], B.vz[i]) || 1, k = Math.min(1, B.home[i] * dt);
      const d = unit(px - B.x[i], py - B.y[i], pz - B.z[i]);
      const n = unit(B.vx[i] / sp + (d.x - B.vx[i] / sp) * k, B.vy[i] / sp + (d.y - B.vy[i] / sp) * k, B.vz[i] / sp + (d.z - B.vz[i] / sp) * k);
      B.vx[i] = n.x * sp; B.vy[i] = n.y * sp; B.vz[i] = n.z * sp;
    }
    if (B.turn[i] !== 0) rotate(B, i, B.turn[i] * dt);
    if (B.acc[i] !== 0) {
      const sp = Math.hypot(B.vx[i], B.vy[i], B.vz[i]) || 1, k = Math.max(0.5, sp + B.acc[i] * dt) / sp;
      B.vx[i] *= k; B.vy[i] *= k; B.vz[i] *= k;
    }
    B.x[i] += B.vx[i] * dt; B.y[i] += B.vy[i] * dt; B.z[i] += B.vz[i] * dt;
    B.life[i] -= dt;
    if (B.bn[i] > 0 && B.y[i] < 0.35 && B.vy[i] < 0) { B.vy[i] = -B.vy[i] * 0.9; B.y[i] = 0.35; B.bn[i]--; }
    if (B.flags[i] & F_SPLASH && B.y[i] <= 0.5) {
      const n = B.sc[i], col = B.col[i], x = B.x[i], z = B.z[i], off = g.rand() * TAU;
      for (let k = 0; k < n; k++) B.add({ x, y: 0.7, z, ang: off + (k / n) * TAU, speed: 4.6, r: 0.26, col, life: 5 });
      B.remove(i);
      continue;
    }
    if (B.life[i] <= 0 || B.x[i] * B.x[i] + B.z[i] * B.z[i] > CULL_R2 || B.y[i] < -1.5 || B.y[i] > 42) { B.remove(i); continue; }

    if (!canHit) continue;
    const dx = B.x[i] - px, dy = B.y[i] - py, dz = B.z[i] - pz, d2 = dx * dx + dy * dy + dz * dz;
    const rr = B.r[i] + PLAYER_R;
    if (d2 < rr * rr) {
      if (hurtPlayer(g)) break;       // 近くの弾を消したので、並びが変わった。このコマの続きはやめる
      continue;
    }
    if (!(B.flags[i] & F_GRAZED)) {
      const gr = rr + GRAZE_PAD;
      if (d2 < gr * gr) {
        B.flags[i] |= F_GRAZED;
        grazed(g, B.x[i], B.y[i], B.z[i]);
      }
    }
  }
}

function rotate(B, i, da) {
  const c = Math.cos(da), s = Math.sin(da), vx = B.vx[i], vz = B.vz[i];
  B.vx[i] = vx * c + vz * s;
  B.vz[i] = vz * c - vx * s;
}

function grazed(g, x, y, z) {
  g.graze++;
  g.score += 100;
  const ch = g.p.ch;
  if (ch && !ch.ready) ch.t = Math.min(ch.need, ch.t + 0.05 * (1 + g.mods.graze));
  emit(g, { t: "graze", x, y, z });
}

// ---- レーザー・柱・床の警告 ----------------------------------------------------------
function updateLasers(g, dt) {
  const b = g.boss, p = g.p;
  for (let i = g.lasers.length - 1; i >= 0; i--) {
    const L = g.lasers[i];
    L.age += dt;
    L.grazeCd -= dt;
    if (L.follow) { L.x = b.x; L.z = b.z; L.y = b.y + L.off; }
    if (L.warn > 0) { L.warn -= dt; continue; }
    L.life -= dt;
    L.ang += L.spin * dt;
    if (L.life <= 0) { g.lasers.splice(i, 1); continue; }
    if (g.mode !== "fight") continue;
    const ex = Math.sin(L.ang) * L.len, ez = Math.cos(L.ang) * L.len;
    const t = clamp(((p.x - L.x) * ex + (p.z - L.z) * ez) / (ex * ex + ez * ez), 0, 1);
    const d = Math.hypot(p.x - (L.x + ex * t), p.z - (L.z + ez * t));
    const hitR = L.w * 0.5 + PLAYER_R, dy = Math.abs(p.y - L.y);
    if (p.inv <= 0 && d < hitR && dy < L.h + PLAYER_R) hurtPlayer(g);
    else if (p.inv <= 0 && d < hitR + GRAZE_PAD && dy < L.h + PLAYER_R + GRAZE_PAD && L.grazeCd <= 0) { L.grazeCd = 0.18; grazed(g, p.x, p.y, p.z); }
  }
}

function updatePillars(g, dt) {
  const p = g.p;
  for (let i = g.pillars.length - 1; i >= 0; i--) {
    const c = g.pillars[i];
    c.age += dt;
    c.grazeCd -= dt;
    if (c.warn > 0) { c.warn -= dt; continue; }
    c.life -= dt;
    if (c.life <= 0) { g.pillars.splice(i, 1); continue; }
    if (g.mode !== "fight") continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (p.inv <= 0 && d < c.r + PLAYER_R) hurtPlayer(g);
    else if (p.inv <= 0 && d < c.r + PLAYER_R + GRAZE_PAD && c.grazeCd <= 0) { c.grazeCd = 0.18; grazed(g, p.x, p.y, p.z); }
  }
}

function updateMarks(g, dt) {
  for (let i = g.marks.length - 1; i >= 0; i--) if ((g.marks[i].life -= dt) <= 0) g.marks.splice(i, 1);
}

// ---- 勇者の砲 --------------------------------------------------------------------
// 溜めて放したあとの動きは、種類ごとに ちがう（設計書の表）
function fireCannon(g, A) {
  const p = g.p, b = g.boss, M = g.mods, T = A.tier, sc = A.scale;
  const ck = M.count[A.kind] || 0;                                  // その種類の数の増え
  const dm = A.dmg * (1 + M.dmgAll + (M.dmg[A.kind] || 0));         // 役と強化を入れた威力
  removeAmmo(g, A);
  g.stats.fired.push({ name: A.name, bytes: A.bytes, kind: A.kind, tier: T });
  const { f, u } = basisOf(p.yaw, p.pitch);
  const ox = p.x + f.x * 0.8 - u.x * 0.35, oy = p.y + f.y * 0.8 - u.y * 0.35, oz = p.z + f.z * 0.8 - u.z * 0.35;
  const dir = aimFrom(g, ox, oy, oz);
  const dist = Math.hypot(b.x - ox, b.y - oy, b.z - oz);           // ボスまでの遠さ（遠い・近いの強さに使う）
  p.cannonCd = 0.35 + 0.22 * T;
  p.inv = Math.max(p.inv, 0.3 + 0.16 * T + M.inv);
  p.recoil = [0, 0, 0, 0.15, 0.45, 0.8][T] || 0;
  const kick = T * 2.2;
  p.kx = -dir.x * kick; p.ky = -dir.y * kick * 0.5; p.kz = -dir.z * kick;
  if (T >= 4) { g.slowT = T === 4 ? 0.45 : 0.8; g.slowScale = 0.3; }
  emit(g, { t: "fire", ammo: A, x: ox, y: oy, z: oz, dx: dir.x, dy: dir.y, dz: dir.z });
  const rgb = KINDS[A.kind].rgb;
  const src = { cannon: A };

  switch (A.kind) {
    case "shot": {                                                    // 狙撃：遠いほど強い。貫通
      const mul = clamp(0.75 + 0.04 * (dist - 6), 0.75, 1.65 * (1 + 0.5 * ck));
      g.shots.push({ k: "shell", x: ox, y: oy, z: oz, vx: dir.x * 40, vy: dir.y * 40, vz: dir.z * 40, r: 0.3 + 0.32 * sc, clearR: (0.8 + 0.5 * sc) * (1 + ck), dmg: dm * mul, life: 3.5, rgb, src, mul });
      break;
    }
    case "spread": {                                                  // 近づくほど強い。上下にも広がる
      const n = Math.round((7 + 3 * T) * (1 + ck)), cone = 0.28 + 0.03 * T, { r: r1, u: u1 } = perp(dir);
      const mul = clamp(1.6 - 0.06 * (dist - 6), 0.5, 1.6);
      for (let i = 0; i < n; i++) {
        const rr = Math.sqrt(g.rand()) * cone, th = g.rand() * TAU, sp = 40 + g.rand() * 8;
        const d = unit(dir.x + (r1.x * Math.cos(th) + u1.x * Math.sin(th) * 0.8) * rr, dir.y + (r1.y * Math.cos(th) + u1.y * Math.sin(th) * 0.8) * rr, dir.z + (r1.z * Math.cos(th) + u1.z * Math.sin(th) * 0.8) * rr);
        g.shots.push({ k: "pellet", x: ox, y: oy, z: oz, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, r: 0.2 + 0.07 * sc, clearR: 0.5 + 0.1 * sc, dmg: (dm * mul) / n, life: 1.9, rgb, src });
      }
      break;
    }
    case "beam": {                                                    // 照射：動けないが、照準で向きを変えられる
      const dur = (1.3 + 0.4 * T) * (1 + 0.6 * ck);
      p.rootT = dur;
      g.shots.push({ k: "beam", life: dur, max: dur, w: 0.4 + 0.3 * sc, dps: dm / dur, ox, oy, oz, dx: dir.x, dy: dir.y, dz: dir.z, len: 80, onBoss: true, rgb, src });
      break;
    }
    case "wave": {                                                    // バリア：入った弾を消して、弾き返してダメージに
      const dur = (2.0 + 0.7 * T) * (1 + 0.5 * ck), R = (2.6 + 0.9 * T) * (1 + 0.4 * ck);
      g.shots.push({ k: "dome", life: dur, max: dur, age: 0, R, r: 0.5, budget: dm * 1.5, got: 0, each: dm * 0.045, rgb, src });
      emit(g, { t: "dome", R });
      break;
    }
    case "homing": {                                                  // 迎撃：勇者を狙う弾を先に落とす
      const n = Math.round((4 + 2 * T) * (1 + ck));
      for (let i = 0; i < n; i++) g.pending.push({ t: i * 0.06, k: "missile", dm, n, id: i, dir, rgb, src, tier: T });
      break;
    }
    case "cluster": {                                                 // 手動起爆の爆弾
      const sub = Math.round((5 + T) * (1 + ck));
      g.shots.push({ k: "bomb", manual: true, x: ox, y: oy, z: oz, vx: dir.x * 17, vy: dir.y * 17, vz: dir.z * 17, r: 0.3 + 0.22 * sc, dmg: dm * 0.5, sub, subDmg: (dm * 0.5) / sub, rad: (1 + 2.2 * Math.sqrt(sc)) * (1 + 0.4 * ck), life: 5, age: 0, rgb, src });
      emit(g, { t: "bombArmed" });
      break;
    }
    case "blast": {                                                   // 迫撃：高く打ち上げて、上から落とす
      const tg = aimPoint(g), horiz = Math.hypot(tg.x - ox, tg.z - oz), tf = clamp(1.0 + horiz * 0.045, 1.2, 2.6);
      const tx = tg.x + (g.locked ? b.vx * tf : 0), tz = tg.z + (g.locked ? b.vz * tf : 0), ty = tg.y;
      g.shots.push({
        k: "lob", x: ox, y: oy, z: oz, vx: (tx - ox) / tf, vy: (ty - oy + 0.5 * GRAVITY * tf * tf) / tf, vz: (tz - oz) / tf, t: 0, tf,
        r: 0.4 + 0.3 * sc, dmg: dm, rad: (1 + 4.5 * sc) * (1 + 0.5 * ck), rgb, src,
      });
      break;
    }
    case "meteor": {                                                  // 空爆：いつも上から
      const n = Math.round((3 + 2 * T) * (1 + ck)), tg = aimPoint(g);
      for (let i = 0; i < n; i++) g.pending.push({ t: 0.25 + i * 0.16, k: "meteor", dm, n, A, tg, rgb, src });
      break;
    }
  }
}

// 時間をおいて出る弾（誘導弾・隕石）
function updatePending(g, dt) {
  const p = g.p, b = g.boss;
  for (let i = g.pending.length - 1; i >= 0; i--) {
    const q = g.pending[i];
    q.t -= dt;
    if (q.t > 0) continue;
    g.pending.splice(i, 1);
    if (q.k === "missile") {
      const ox = p.x, oy = p.y, oz = p.z, { r: r1, u: u1 } = perp(q.dir), th = g.rand() * TAU, rr = Math.sqrt(g.rand()) * 1.0, sp = 16;
      const d = unit(q.dir.x + (r1.x * Math.cos(th) + u1.x * Math.sin(th)) * rr, q.dir.y + (r1.y * Math.cos(th) + u1.y * Math.sin(th)) * rr, q.dir.z + (r1.z * Math.cos(th) + u1.z * Math.sin(th)) * rr);
      g.shots.push({
        k: "missile", x: ox, y: oy, z: oz, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
        r: 0.28, dmg: (q.dm * 1.0) / q.n, age: 0, life: 4, tgt: null, tx: 0, ty: 0, tz: 0, id: q.id, trail: [], rgb: q.rgb, src: q.src, tier: q.tier,
      });
      emit(g, { t: "launch" });
    } else if (q.k === "meteor") {
      const A = q.A, a = g.rand() * TAU, dist = 7 + g.rand() * 8, y = q.tg.y + 24 + g.rand() * 8;
      const sx = q.tg.x + Math.sin(a) * dist, sz = q.tg.z + Math.cos(a) * dist;
      const d = unit(q.tg.x - sx + (g.rand() - 0.5) * 1.2, q.tg.y - y, q.tg.z - sz + (g.rand() - 0.5) * 1.2);
      g.shots.push({
        k: "meteor", x: sx, y, z: sz, vx: d.x * 36, vy: d.y * 36, vz: d.z * 36, r: 0.3 + 0.2 * Math.pow(A.scale, 0.6), clr: 1.1 + 0.3 * Math.pow(A.scale, 0.6),
        dmg: q.dm / q.n, rad: 1.5 + 1.4 * Math.sqrt(A.scale), life: 3.5, trail: [], tg: q.tg, rgb: q.rgb, src: q.src, tier: A.tier,
      });
    }
  }
}

// 爆発：広がる球が弾を消す。dmg があれば、ボスの中心に近いほど 全部入る
function boom(g, x, y, z, rad, dmg, src, rgb) {
  const b = g.boss;
  g.shots.push({ k: "boom", x, y, z, r: 0.3, maxR: rad, grow: rad / 0.45, fade: 0, rgb });
  emit(g, { t: "boom", x, y, z, r: rad });
  if (dmg > 0) {
    const d = Math.hypot(b.x - x, b.y - y, b.z - z);
    if (d <= rad + b.r) damageBoss(g, dmg * (d <= rad * 0.5 + b.r ? 1 : lerp(1, 0.4, (d - rad * 0.5 - b.r) / (rad * 0.5))), x, y, z, src);
  }
}

// 集束弾の起爆。その場の弾を消して、破片がボスを追う。ボスに近いほど 本体のダメージも入る
function detonate(g, s) {
  const b = g.boss;
  s.dead = true;
  boom(g, s.x, s.y, s.z, s.rad, 0, s.src, s.rgb);
  const d = Math.hypot(b.x - s.x, b.y - s.y, b.z - s.z);
  if (d <= s.rad + b.r && g.mode === "fight") damageBoss(g, s.dmg * (d <= s.rad * 0.6 + b.r ? 1 : 0.6), s.x, s.y, s.z, s.src);
  for (let k = 0; k < s.sub; k++) {
    const a = g.rand() * TAU, e = (g.rand() - 0.2) * Math.PI * 0.5, sp = 10 + g.rand() * 6;
    g.shots.push({
      k: "missile", frag: true, x: s.x, y: s.y, z: s.z, vx: Math.sin(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.cos(a) * Math.cos(e) * sp,
      r: 0.24, dmg: s.subDmg, age: 0.25, life: 3, tgt: null, tx: 0, ty: 0, tz: 0, id: k, trail: [], rgb: s.rgb, src: s.src, tier: 1,
    });
  }
  emit(g, { t: "detonate", x: s.x, y: s.y, z: s.z });
}

// ---- 勇者の弾を動かす ------------------------------------------------------------
function updateShots(g, dt) {
  for (let i = g.shots.length - 1; i >= 0; i--) {
    if (stepShot(g, g.shots[i], dt)) g.shots.splice(i, 1);
  }
}

function hitsBoss(g, s, extra = 0) {
  const b = g.boss;
  return Math.hypot(s.x - b.x, s.y - b.y, s.z - b.z) < b.r + s.r + extra;
}

// 誘導弾の狙い：勇者に近づいてくる弾のうち、勇者に近いものを先に。なければ -1（ボスへ）
function pickTarget(g, s) {
  const B = g.bullets, p = g.p;
  let best = -1, bs = Infinity;
  for (let i = 0; i < B.n; i++) {
    if (B.hold[i] > 0) continue;
    const dx = p.x - B.x[i], dy = p.y - B.y[i], dz = p.z - B.z[i], dp = Math.hypot(dx, dy, dz);
    if (dp > 17) continue;
    if (B.vx[i] * dx + B.vy[i] * dy + B.vz[i] * dz <= 0) continue;
    const sc = dp + 0.35 * Math.hypot(s.x - B.x[i], s.y - B.y[i], s.z - B.z[i]) + (((s.id * 7919 + i * 31) % 13) * 0.18);
    if (sc < bs) { bs = sc; best = i; }
  }
  return best;
}

function stepShot(g, s, dt) {
  const b = g.boss, p = g.p;
  if (s.dead) return true;
  switch (s.k) {
    case "bolt": {
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      if (hitsBoss(g, s)) { damageBoss(g, s.dmg, s.x, s.y, s.z, null); return true; }
      return s.life <= 0;
    }
    case "shell": {
      const ox = s.x, oy = s.y, oz = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      clearSegment(g, ox, oy, oz, s.x, s.y, s.z, s.clearR);
      if (hitsBoss(g, s)) {
        damageBoss(g, s.dmg, s.x, s.y, s.z, s.src);
        boom(g, s.x, s.y, s.z, 1.6 + s.r * 3, 0, null, s.rgb);
        return true;
      }
      return s.life <= 0;
    }
    case "pellet": {
      const ox = s.x, oy = s.y, oz = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      clearSegment(g, ox, oy, oz, s.x, s.y, s.z, s.clearR);
      if (hitsBoss(g, s)) { damageBoss(g, s.dmg, s.x, s.y, s.z, s.src); return true; }
      return s.life <= 0;
    }
    case "beam": {
      // 向きは 照準そのもの。撃つあいだ、見る向きを変えれば 光線も動く
      s.life -= dt;
      p.rootT = Math.max(p.rootT, 0.05);
      const { f, u } = basisOf(p.yaw, p.pitch);
      const ox = p.x + f.x * 0.8 - u.x * 0.35, oy = p.y + f.y * 0.8 - u.y * 0.35, oz = p.z + f.z * 0.8 - u.z * 0.35;
      const d = aimFrom(g, ox, oy, oz);
      s.ox = ox; s.oy = oy; s.oz = oz; s.dx = d.x; s.dy = d.y; s.dz = d.z;
      clearSegment(g, ox, oy, oz, ox + d.x * s.len, oy + d.y * s.len, oz + d.z * s.len, s.w * 0.7);
      // ボスに当たっているか：中心から光線までの距離
      const rx = b.x - ox, ry = b.y - oy, rz = b.z - oz, along = rx * d.x + ry * d.y + rz * d.z;
      const perpD = Math.hypot(rx - d.x * along, ry - d.y * along, rz - d.z * along);
      s.onBoss = along > 0 && perpD < b.r + s.w * 0.4;
      if (s.onBoss && g.mode === "fight") damageBoss(g, s.dps * dt, b.x - d.x * b.r, b.y - d.y * b.r, b.z - d.z * b.r, s.src);
      return s.life <= 0;
    }
    case "dome": {
      s.age += dt;
      s.life -= dt;
      // はじめに ぱっと広がって、ふだんの大きさにもどる。おわりぎわは しぼむ
      const grow = s.age < 0.35 ? lerp(0.5, s.R * 2.2, s.age / 0.35) : s.age < 0.7 ? lerp(s.R * 2.2, s.R, (s.age - 0.35) / 0.35) : s.R;
      s.r = grow * clamp(s.life / 0.3, 0, 1);
      const B = g.bullets;
      for (let i = B.n - 1; i >= 0; i--) {
        const dx = B.x[i] - p.x, dy = B.y[i] - p.y, dz = B.z[i] - p.z, rr = s.r + B.r[i];
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          // 弾き返す：ダメージにして、予算の分だけ
          if (s.got < s.budget && g.mode === "fight") {
            const d = Math.min(s.each, s.budget - s.got);
            s.got += d;
            g.stats.reflected++;
            damageBoss(g, d, B.x[i], B.y[i], B.z[i], s.src);
          }
          pop(g, i);
        }
      }
      return s.life <= 0;
    }
    case "missile": {
      s.age += dt;
      s.life -= dt;
      let sp = Math.hypot(s.vx, s.vy, s.vz);
      let tx = b.x, ty = b.y, tz = b.z, intercept = -1;
      const B = g.bullets;
      if (!s.frag && s.age > 0.25) {
        // いちど決めた弾を 追いつづける。弾の並びが入れかわって 別の弾になったら、決めなおす
        const t = s.tgt;
        const valid = t !== null && t >= 0 && t < B.n && Math.hypot(B.x[t] - s.tx, B.y[t] - s.ty, B.z[t] - s.tz) < 1.2;
        if (!valid) { s.tgt = pickTarget(g, s); if (s.tgt >= 0) { s.tx = B.x[s.tgt]; s.ty = B.y[s.tgt]; s.tz = B.z[s.tgt]; } }
        if (s.tgt !== null && s.tgt >= 0 && s.tgt < B.n) {
          intercept = s.tgt;
          s.tx = B.x[intercept]; s.ty = B.y[intercept]; s.tz = B.z[intercept];
          tx = s.tx + B.vx[intercept] * 0.15; ty = s.ty + B.vy[intercept] * 0.15; tz = s.tz + B.vz[intercept] * 0.15;
        }
      }
      if (s.age > 0.25) {
        const want = unit(tx - s.x, ty - s.y, tz - s.z), cur = unit(s.vx, s.vy, s.vz), k = Math.min(1, 12 * dt);
        const n = unit(cur.x + (want.x - cur.x) * k, cur.y + (want.y - cur.y) * k, cur.z + (want.z - cur.z) * k);
        const cap = clamp(want.len * 6, 16, s.frag ? 34 : 44);          // 近づいたら 速さをおとして、まわりこまずに当てる
        sp = sp > cap ? Math.max(cap, sp - 90 * dt) : Math.min(cap, sp + 45 * dt);
        s.vx = n.x * sp; s.vy = n.y * sp; s.vz = n.z * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.trail.push(s.x, s.y, s.z);
      if (s.trail.length > 18) s.trail.splice(0, 3);
      if (intercept >= 0 && Math.hypot(s.x - B.x[intercept], s.y - B.y[intercept], s.z - B.z[intercept]) < s.r + B.r[intercept] + 0.6) {
        clearSphere(g, B.x[intercept], B.y[intercept], B.z[intercept], 1.6);
        damageBoss(g, s.dmg, s.x, s.y, s.z, s.src);
        boom(g, s.x, s.y, s.z, 1.3 + 0.2 * s.tier, 0, null, s.rgb);
        return true;
      }
      if (hitsBoss(g, s, 0.2)) {
        damageBoss(g, s.dmg, s.x, s.y, s.z, s.src);
        boom(g, s.x, s.y, s.z, 1.3 + 0.2 * s.tier, 0, null, s.rgb);
        return true;
      }
      return s.life <= 0;
    }
    case "bomb": {
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      if (hitsBoss(g, s) || s.life <= 0) { detonate(g, s); return true; }
      return false;
    }
    case "lob": {
      s.t += dt;
      s.vy -= GRAVITY * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (hitsBoss(g, s) || s.t >= s.tf + 0.4 || s.y < 0.3) {
        boom(g, s.x, s.y, s.z, s.rad, s.dmg, s.src, s.rgb);
        clearSphere(g, s.x, s.y, s.z, s.rad);
        return true;
      }
      return false;
    }
    case "meteor": {
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      s.trail.push(s.x, s.y, s.z);
      if (s.trail.length > 24) s.trail.splice(0, 3);
      clearSphere(g, s.x, s.y, s.z, s.clr);
      if (hitsBoss(g, s, 0.3)) {
        damageBoss(g, s.dmg, s.x, s.y, s.z, s.src);
        boom(g, s.x, s.y, s.z, s.rad, 0, null, s.rgb);
        return true;
      }
      // ねらった点（ボスの外）に着いたら、そこで爆ぜる
      if (Math.hypot(s.x - s.tg.x, s.y - s.tg.y, s.z - s.tg.z) < 1.2 || s.y < 0.5) {
        boom(g, s.x, s.y, s.z, s.rad, 0, null, s.rgb);
        return true;
      }
      return s.life <= 0;
    }
    case "boom": {
      if (s.fade > 0) { s.fade -= dt; return s.fade <= 0; }
      s.r += s.grow * dt;
      clearSphere(g, s.x, s.y, s.z, s.r);
      if (s.r >= s.maxR) { s.r = s.maxR; s.fade = 0.3; }
      return false;
    }
  }
  return true;
}

// ---- 結果 ------------------------------------------------------------------------
export function summary(g) {
  return {
    score: g.score, stage: g.stage, graze: g.graze, hits: g.stats.hits, dmg: Math.round(g.stats.dmg),
    fired: g.stats.fired.length, biggest: g.stats.biggest, cleared: g.mode === "clear",
    phases: g.stats.phasesCleared, timeouts: g.stats.phasesTimeout, phaseCount: g.bossDef.phases.length,
    boss: g.bossDef.info || null, label: g.bossDef.label || null,
    weakDmg: Math.round(g.stats.weakDmg), reflected: g.stats.reflected, noMiss: g.stats.hits === 0 && g.mode === "clear",
  };
}
