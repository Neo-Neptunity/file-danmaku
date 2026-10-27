// ゲームの中身（sim.js）のテスト。使い方：node file-danmaku/dev/game.mjs
import { stage } from "./stage.mjs";

const st = stage("game");
const A = await import(st.url("ammo.js"));
const C = await import(st.url("consts.js"));
const SIM = await import(st.url("sim.js"));
const MT = await import(st.url("meta.js"));
const ST = await import(st.url("stages.js"));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  NG:", msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg}：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const near = (a, lo, hi, msg) => ok(a >= lo && a <= hi, `${msg}：${a.toFixed ? a.toFixed(2) : a}（${lo}〜${hi}のはず）`);
const finite = (...xs) => xs.every(Number.isFinite);
const section = (s) => console.log(s);

const KB = 1024, MB = KB * 1024, GB = MB * 1024;
let uid = 1;
const mk = (name, size) => ({ ...A.ammoOf({ name, ext: name.split(".").pop(), size, id: name, path: "C:\\x\\" + name }), uid: uid++ });
const idle = { ix: 0, iz: 0, iy: 0 };
const run = (g, sec, inp = idle) => { for (let i = 0; i < Math.round(sec * 60); i++) SIM.update(g, 1 / 60, typeof inp === "function" ? inp(g) : inp); };
const ammoSet = () => [mk("a.iso", 6 * GB), mk("b.mkv", 3 * GB), mk("c.zip", 1.4 * GB), mk("d.exe", 240 * MB), mk("e.flac", 42 * MB), mk("f.pptx", 18 * MB), mk("g.png", 6 * MB), mk("h.cpp", 40 * KB)];
const BH = C.BOSS_HOME;

// 弾幕を止めて、ボスをその場に置いた 的あて場。ボスの体力は ほぼ無限
function arena(o = {}) {
  const g = SIM.createGame({ seed: 4, practice: o.practice ?? true, loadout: o.loadout || [], difficulty: o.difficulty, assist: o.assist, autoTurn: o.autoTurn ?? "off", metaFx: o.metaFx, unlocked: o.unlocked, deficit: o.deficit });
  run(g, 4.2);
  g.boss.phase.atk = [];
  g.boss.phase.move = "hold";
  g.boss.phase.lift = 0;
  g.boss.phase.weak = 0; g.boss.weak = null; g.boss.weakWarn = 0;
  g.boss.hp = g.boss.hpMax = 1e7;
  g.boss.x = BH.x; g.boss.y = BH.y; g.boss.z = BH.z;
  g.bullets.clear(); g.events.length = 0;
  return g;
}
// ボスのほうを向いて、ボスから z だけはなれた所（高さ y）に置く
function place(g, z, y = BH.y, x = 0) {
  Object.assign(g.p, { x, y, z, vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0 });
  g.p.yaw = Math.atan2(g.boss.x - x, g.boss.z - z);
  g.p.pitch = Math.atan2(g.boss.y - y, Math.hypot(g.boss.x - x, g.boss.z - z));
}
// その弾を選んで、溜まったら放して撃つ。撃てたら true
function fire(g, ammo, extra = {}) {
  g.kindSel = ammo.kind;
  g.fileIdx[ammo.kind] = SIM.kindList(g, ammo.kind).indexOf(ammo);
  for (let i = 0; i < 60 * 20; i++) {
    const ready = g.p.ch && g.p.ch.ready;
    SIM.update(g, 1 / 60, { charge: !ready, ...extra });
    if (!g.mag.includes(ammo)) return true;
  }
  return false;
}
const dealtBy = (g, fn) => { const d0 = g.stats.dmg; fn(); return g.stats.dmg - d0; };

section("はじまり");
{
  const g = SIM.createGame({ seed: 1, loadout: ammoSet() });
  eq(g.mode, "intro", "最初は登場"); eq(g.stage, 1, "1面"); eq(SIM.ammoLeft(g), 8, "8発");
  ok(g.events.some((e) => e.t === "stage") && g.events.some((e) => e.t === "combos"), "stage と combos の出来事");
  eq([g.p.x, g.p.y, g.p.z], [C.START_POS.x, C.START_POS.y, C.START_POS.z], "はじめの位置");
  near(g.p.yaw, Math.PI - 1e-9, Math.PI + 1e-9, "はじめはボスのほうを向く");
  run(g, 3);
  eq(g.mode, "fight", "3秒で戦いに入る"); eq(g.phaseIdx, 0, "フェーズ1");
  ok(g.boss.hp === g.boss.hpMax && g.boss.hpMax === g.bossDef.phases[0].hp, "体力が満タン");
  ok(finite(g.p.x, g.p.y, g.p.z, g.boss.x, g.boss.y, g.boss.z), "有限");
  const g2 = SIM.createGame({ seed: 2, loadout: ammoSet() });
  run(g2, 2.7);
  const hp0 = g2.boss.hp;
  run(g2, 0.5, { shoot: true });
  eq(g2.boss.hp, hp0, "フェーズの最初の1秒は、無敵");
  // 入れたファイルの並びに空きがあっても、つめて持つ
  const g3 = SIM.createGame({ loadout: [null, mk("a.png", MB), null, mk("b.png", MB)] });
  eq(g3.mag.length, 2, "空きはつめる");
  ok(g3.mag[0] !== undefined && g3.mag.every((a) => a.uid), "uid は そのまま");
}

section("視点・照準・ロックオン");
{
  const g = arena({ autoTurn: "off" });
  place(g, 12);
  const yaw0 = g.p.yaw, pitch0 = g.p.pitch;
  SIM.update(g, 1 / 60, { turnYaw: 0.2 });
  near(g.p.yaw, yaw0 - 0.2 - 1e-9, yaw0 - 0.2 + 1e-9, "右へ回すと yaw が減る");
  SIM.update(g, 1 / 60, { turnPitch: 0.1 });
  near(g.p.pitch, pitch0 + 0.1 - 1e-9, pitch0 + 0.1 + 1e-9, "上へ向けると pitch が増える");
  SIM.update(g, 1 / 60, { turnPitch: 9 });
  ok(g.p.pitch <= 1.5 + 1e-9, "真上より先へは向けない");
  // 前後左右は 見ている向きが基準
  const h = arena({ autoTurn: "off" });
  place(h, 12);
  h.p.pitch = 0; h.p.yaw = Math.PI / 2;                     // +x を見ている
  const x0 = h.p.x, z0 = h.p.z;
  run(h, 0.5, { iz: 1 });
  ok(h.p.x > x0 + 2 && Math.abs(h.p.z - z0) < 0.5, `前へ = 見ている向き（x が増えた ${(h.p.x - x0).toFixed(1)}）`);
  const hx = h.p.x; run(h, 0.5, { ix: 1 });
  ok(h.p.z > z0 + 2 && Math.abs(h.p.x - hx) < 1.0, "右へ = 見ている向きの右（+x を見ているとき +z）");
  // ロックオン補助：ボスの近くを向いていれば、ボスへ
  const a = arena({ autoTurn: "off", assist: 7 });
  place(a, 12);
  run(a, 0.1);
  ok(a.locked, "ボスのほうを向いていれば ロックオン");
  a.p.yaw += 0.05; run(a, 0.05);
  ok(a.locked, "3 度ずれていても ロックオン");
  a.p.yaw += 0.3; run(a, 0.05);
  ok(!a.locked, "大きくずれたら はずれる");
  const off = arena({ autoTurn: "off", assist: 0 });
  place(off, 12); run(off, 0.1);
  ok(!off.locked, "補助 0 度なら、ロックオンしない");
  // ボスのほうを向く（F）
  const l = arena({ autoTurn: "off" });
  place(l, 12);
  l.p.yaw += 1.5; l.p.pitch = -0.5;
  run(l, 0.8, { lock: true });
  ok(Math.abs(Math.atan2(l.boss.x - l.p.x, l.boss.z - l.p.z) - l.p.yaw) < 0.05 || Math.abs(Math.atan2(l.boss.x - l.p.x, l.boss.z - l.p.z) + 2 * Math.PI - l.p.yaw) < 0.05, "押している間 ボスのほうを向く");
  // 自動で向く：視点を動かしていないと、ゆっくり向く
  const w = arena({ autoTurn: "weak" });
  place(w, 12);
  w.p.yaw += 0.6;
  const err0 = Math.abs(0.6);
  run(w, 3);
  const err1 = Math.abs(Math.atan2(w.boss.x - w.p.x, w.boss.z - w.p.z) - w.p.yaw);
  ok(err1 < err0 * 0.5, `弱：視点を動かさないと ボスへ向く（${err0.toFixed(2)} → ${err1.toFixed(2)}）`);
  const w2 = arena({ autoTurn: "weak" });
  place(w2, 12);
  w2.p.yaw += 0.6;
  run(w2, 3, { turnYaw: 0, lookX: 0.0001 });
  ok(Math.abs(Math.atan2(w2.boss.x - w2.p.x, w2.boss.z - w2.p.z) - w2.p.yaw) > 0.5, "視点を動かしつづけているあいだは、自動で向かない");
  const w3 = arena({ autoTurn: "off" });
  place(w3, 12);
  w3.p.yaw += 0.6;
  run(w3, 3);
  near(Math.abs(Math.atan2(w3.boss.x - w3.p.x, w3.boss.z - w3.p.z) - w3.p.yaw), 0.55, 0.65, "なし：向かない");
  // basisOf
  const bs = SIM.basisOf(Math.PI, 0);
  ok(Math.abs(bs.f.z + 1) < 1e-9 && Math.abs(bs.r.x - 1) < 1e-9 && Math.abs(bs.u.y - 1) < 1e-9, "-z を見ると、右は +x、上は +y");
}

section("自由に飛ぶ・高さ・あたり");
{
  const g = SIM.createGame({ seed: 1, loadout: ammoSet(), practice: true });
  run(g, 3);
  let minB = 99, maxO = 0, bad = 0;
  run(g, 20, (g) => ({ ix: Math.sin(g.t) > 0 ? 1 : -1, iz: 1, iy: Math.cos(g.t * 0.6), dash: Math.floor(g.t * 2) % 3 === 0, lock: true }));
  for (let i = 0; i < 900; i++) {
    SIM.update(g, 1 / 60, { iz: 1, iy: 0.2, lock: true });
    minB = Math.min(minB, Math.hypot(g.p.x - g.boss.x, g.p.y - g.boss.y, g.p.z - g.boss.z));
    if (g.p.y < C.Y_MIN - 1e-6 || g.p.y > C.Y_MAX + 1e-6) bad++;
  }
  ok(minB >= C.MIN_DIST - 0.02, `ボスに近づきすぎない（${minB.toFixed(2)}）`);
  for (let i = 0; i < 900; i++) { SIM.update(g, 1 / 60, { iz: -1, iy: -0.3 }); maxO = Math.max(maxO, Math.hypot(g.p.x, g.p.z)); if (g.p.y < C.Y_MIN - 1e-6) bad++; }
  ok(maxO <= C.ARENA_R + 0.01, `場の外に出ない（${maxO.toFixed(2)}）`);
  eq(bad, 0, "高さの範囲に収まる");

  const h = arena();
  run(h, 4, { iy: 1 });
  near(h.p.y, C.Y_MAX - 0.01, C.Y_MAX + 0.001, "上へ入れつづけると 天井で止まる");
  run(h, 5, { iy: -1 });
  near(h.p.y, C.Y_MIN - 0.001, C.Y_MIN + 0.01, "下へ入れつづけると 床で止まる");
  const y1 = h.p.y; run(h, 0.4, { iy: 1 }); ok(h.p.y > y1 + 1, "もう一度上がれる");
  const y2 = h.p.y; run(h, 1, idle);
  near(h.p.y, y2 - 0.1, y2 + 1.5, "手をはなすと そこで浮かぶ");
  // ダッシュは 上下にも出る
  const d = arena(); place(d, 14, 8);
  const dy0 = d.p.y; run(d, 0.2, { iy: 1, dash: true });
  ok(d.p.y > dy0 + 1.5, "上へ入れてダッシュすると 上へ飛ぶ");
  // 光線を撃つあいだは 動けない
  const f = arena({ loadout: [mk("v.mp4", 300 * MB)] });
  place(f, 14);
  fire(f, f.mag[0]);
  run(f, 1.0);
  const px = f.p.x, py = f.p.y; run(f, 0.4, { iy: 1, iz: 1 });
  ok(Math.abs(f.p.x - px) < 0.06 && Math.abs(f.p.y - py) < 0.06, "光線を撃つあいだは 動けない");
}
{
  const mkG = (inv = 0) => { const g = arena({ practice: false }); place(g, 14, 12); g.p.inv = inv; return g; };
  let g = mkG();
  g.bullets.add({ x: g.p.x, y: g.p.y + 2, z: g.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(g, 1 / 60, idle);
  eq(g.p.hp, 3, "2m 上を通る弾には 当たらない");
  g.bullets.add({ x: g.p.x, y: g.p.y, z: g.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(g, 1 / 60, idle);
  eq(g.p.hp, 2, "同じ高さの弾には 当たる");
  ok(g.p.inv > 2 && g.events.some((e) => e.t === "hurt"), "当たったあとは無敵。hurt の出来事");
  // 高さを変えてよける
  g = mkG();
  g.bullets.add({ x: 0, y: 12, z: 30, ang: Math.PI, speed: 8, r: 0.4 });
  run(g, 1.6, { iy: 1 });
  eq(g.p.hp, 3, "弾の高さを 上へ外れれば 当たらない");
  // 横へよける
  g = mkG();
  g.bullets.add({ x: 0, y: 12, z: 30, ang: Math.PI, speed: 8, r: 0.4 });
  run(g, 1.6, { ix: 1 });
  eq(g.p.hp, 3, "横へ動いてよけられる");
  // レーザー：高さがちがえば当たらない
  const laser = (y) => ({ x: 0, z: 0, y, off: 0, h: 0.6, ang: 0, w: 1, len: 60, warn: 0, life: 2, max: 2, spin: 0, follow: false, age: 0, grazeCd: 0 });
  g = mkG(); g.lasers.push(laser(8)); place(g, 12, 12);
  SIM.update(g, 1 / 60, idle);
  eq(g.p.hp, 3, "べつの高さのレーザーは 当たらない");
  g = mkG(); g.lasers.push(laser(8)); place(g, 12, 8);
  SIM.update(g, 1 / 60, idle);
  eq(g.p.hp, 2, "同じ高さなら 当たる");
  g = mkG(); g.lasers.push({ ...laser(12), warn: 1 }); place(g, 12, 12);
  SIM.update(g, 1 / 60, idle);
  eq(g.p.hp, 3, "警告の間は 当たらない");
  // 柱：高さに関係なく当たる
  for (const y of [2, 12, 23]) {
    g = mkG(); g.pillars.push({ x: 0, z: 12, r: 1, warn: 0, life: 1, max: 1, age: 0, grazeCd: 0 }); place(g, 12, y);
    SIM.update(g, 1 / 60, idle);
    eq(g.p.hp, 2, `柱は 高さ${y} でも当たる`);
  }
  // かすり
  g = mkG();
  g.bullets.add({ x: g.p.x + 0.9, y: g.p.y, z: g.p.z, ang: 0, speed: 0, r: 0.3 });
  SIM.update(g, 1 / 60, idle);
  eq(g.graze, 1, "かすりが数えられる"); eq(g.p.hp, 3, "かすっても当たらない");
  SIM.update(g, 1 / 60, idle);
  eq(g.graze, 1, "同じ弾は2回かすらない");
  const pr = arena({ practice: true }); place(pr, 14, 12);
  pr.bullets.add({ x: pr.p.x, y: pr.p.y, z: pr.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(pr, 1 / 60, idle);
  eq(pr.p.hp, 3, "練習モードは減らない");
  g = mkG(); g.p.hp = 1;
  g.bullets.add({ x: g.p.x, y: g.p.y, z: g.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(g, 1 / 60, idle);
  eq(g.mode, "over", "ライフが0でゲームオーバー");
}

section("ボスの動き");
{
  for (const mv of ["sway", "orbit", "tilt", "dart", "chase"]) {
    const g = SIM.createGame({ seed: 3, loadout: [], practice: true });
    run(g, 3);
    g.boss.phase.move = mv; g.boss.phase.atk = []; g.boss.hp = g.boss.hpMax = 1e7;
    let minY = 99, maxY = -99, maxR = 0, travel = 0, px = g.boss.x, py = g.boss.y, pz = g.boss.z, bad = 0;
    for (let i = 0; i < 60 * 40; i++) {
      SIM.update(g, 1 / 60, { lock: true, iz: Math.sin(g.t * 0.3) });
      const b = g.boss;
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); maxR = Math.max(maxR, Math.hypot(b.x, b.z));
      travel += Math.hypot(b.x - px, b.y - py, b.z - pz); px = b.x; py = b.y; pz = b.z;
      if (!finite(b.x, b.y, b.z)) bad++;
    }
    eq(bad, 0, `${mv}：数が壊れない`);
    ok(minY >= C.BOSS_RANGE.y0 - 1.5 && maxY <= C.BOSS_RANGE.y1 + 1.5, `${mv}：高さの範囲（${minY.toFixed(1)}〜${maxY.toFixed(1)}）`);
    ok(maxR <= C.BOSS_RANGE.r + 1.5, `${mv}：水平の範囲（${maxR.toFixed(1)}）`);
    ok(travel > 40, `${mv}：動きつづける（${travel.toFixed(0)}）`);
  }
  // 急に移る
  const g = SIM.createGame({ seed: 5, loadout: [], practice: true });
  run(g, 3);
  g.boss.phase.move = "dart"; g.boss.phase.atk = []; g.boss.hp = g.boss.hpMax = 1e7;
  const seen = new Set();
  for (let i = 0; i < 60 * 30; i++) { SIM.update(g, 1 / 60, { lock: true }); if (g.boss.dart) seen.add(`${g.boss.dart.x.toFixed(1)},${g.boss.dart.z.toFixed(1)}`); }
  ok(seen.size >= 4, `dart は 何度も場所をかえる（${seen.size}）`);
  // ボスの動きの定義が 通る
  for (let n = 1; n <= 8; n++) for (const p of ST.bossFor(n).phases) ok(["sway", "orbit", "tilt", "dart", "chase"].includes(p.move), `面${n} の動き ${p.move}`);
}

section("弱点");
{
  eq(SIM.sideOf(0, 0, 5), "mid", "水平は 正面");
  eq(SIM.sideOf(0, 2, 5), "high", "上向きは 上");
  eq(SIM.sideOf(0, -2, 5), "low", "下向きは 下");
  eq(SIM.sideOf(0, 0.05, 0.05), "mid", "中心のすぐそばは 正面");
  const shoot = (weak, y) => {
    const g = arena();
    place(g, 9, y);
    g.boss.phase.weak = 99; g.boss.weak = weak; g.boss.weakT = 99;
    return dealtBy(g, () => run(g, 3, { shoot: true }));
  };
  const hi = shoot("high", 20), lo = shoot("low", 20), mid = shoot("mid", 20);
  near(hi / lo, 1.6, 2.0, "高い所から撃つと、弱点が『上』なら 1.8 倍");
  near(mid / lo, 0.9, 1.1, "弱点が『正面』なら ふつうと同じ");
  near(shoot("low", 3) / shoot("high", 3), 1.6, 2.0, "低い所から撃つと、弱点が『下』なら 1.8 倍");
  near(shoot("mid", BH.y) / shoot("high", BH.y), 1.6, 2.0, "同じ高さから撃つと、弱点が『正面』なら 1.8 倍");
  const g = arena();
  g.boss.phase.weak = 5; g.boss.weak = "mid"; g.boss.weakT = 1; g.events.length = 0;
  run(g, 1.2);
  ok(g.boss.weakWarn > 0 && g.boss.weakNext && g.boss.weakNext !== "mid", "予告が出る");
  ok(g.events.some((e) => e.t === "weakWarn"), "weakWarn の出来事");
  const next = g.boss.weakNext;
  run(g, 1.4);
  eq(g.boss.weak, next, "予告のあと、予告した向きに移る");
  const gs = SIM.createGame({ seed: 1, loadout: [] });
  ok(gs.bossDef.phases[0].weak === 0 && gs.bossDef.phases[1].weak > 0, "1面は 2つ目のフェーズから 弱点がある");
  const w = arena(); place(w, 14, BH.y);
  const band = SIM.weakBand(w);
  ok(band.up > w.boss.y && band.down < w.boss.y && Math.abs((band.up - w.boss.y) - (w.boss.y - band.down)) < 1e-6, "高度計の境目は ボスの上下に 同じだけ");
  const w2 = arena(); place(w2, 7, BH.y);
  ok(SIM.weakBand(w2).up < band.up, "近いほど 少しの高さで 上になる");
}

section("種類ごとの山と、選びかた");
{
  const g = SIM.createGame({ seed: 1, loadout: [mk("a.mp4", 3 * GB), mk("b.mp4", 100 * MB), mk("c.mp4", 5 * MB), mk("d.zip", MB), mk("e.png", MB)] });
  eq(g.kindSel, "spread", "はじめは 1〜8 の順で いちばん前の、持っている種類");
  SIM.selectKind(g, "beam");
  eq(g.kindSel, "beam", "種類を選ぶ");
  eq(SIM.kindList(g, "beam").map((a) => a.name), ["a.mp4", "b.mp4", "c.mp4"], "山は 大きい順");
  eq(SIM.currentAmmo(g).name, "a.mp4", "いちばん大きいファイルから");
  SIM.selectKind(g, "beam");
  eq(SIM.currentAmmo(g).name, "b.mp4", "同じ種類をもう一度 選ぶと 次のファイル");
  SIM.cycleFile(g); SIM.cycleFile(g);
  eq(SIM.currentAmmo(g).name, "a.mp4", "ぐるっと回る");
  ok(!SIM.selectKind(g, "meteor"), "持っていない種類は 選べない");
  ok(g.events.some((e) => e.t === "deny"), "deny の出来事");
  eq(g.kindSel, "beam", "選べなければ そのまま");
  SIM.cycleKind(g, 1); eq(g.kindSel, "cluster", "次の種類（beam の次に持っているもの）");
  SIM.cycleKind(g, -1); eq(g.kindSel, "beam", "前の種類");
  SIM.cycleKind(g, -1); eq(g.kindSel, "spread", "前の種類");
  SIM.cycleKind(g, -1); eq(g.kindSel, "cluster", "前の種類へ（ぐるっと回る）");
  // 撃つと、その山から減る
  const f = arena({ loadout: [mk("a.mp4", 300 * MB), mk("b.mp4", 20 * MB), mk("c.zip", MB)] });
  place(f, 14);
  f.kindSel = "beam"; f.fileIdx = {};
  const first = SIM.currentAmmo(f);
  fire(f, first);
  eq(f.mag.length, 2, "撃ったファイルが 山から消える");
  eq(SIM.kindList(f, "beam").length, 1, "のこりの光線は 1つ");
  eq(f.stats.fired[0].name, "a.mp4", "撃った記録");
  // 山が空になったら、次の種類へ
  run(f, 7);
  fire(f, f.mag.find((a) => a.kind === "beam"));
  eq(f.kindSel, "cluster", "山が空になったら 次の種類へ");
  // 持っていない種類で 溜めても 何も起きない
  const e = arena({ loadout: [] });
  place(e, 14); run(e, 1, { charge: true });
  ok(!e.p.ch, "弾が無ければ 溜められない");
}

section("役・強化の反映");
{
  const beams = Array.from({ length: 3 }, (_, i) => mk(`v${i}.mp4`, 300 * MB + i));
  const g = arena({ loadout: beams });
  ok(g.combos.some((c) => c.name.includes("光線のスリーカード")), "役が ゲームに入る");
  eq(g.mods.dmg.beam, 0.35, "威力+35%");
  const plain = arena({ loadout: [mk("v0.mp4", 300 * MB)] });
  place(g, 14); place(plain, 14);
  fire(g, SIM.currentAmmo(g)); fire(plain, plain.mag[0]);
  const a = dealtBy(g, () => run(g, 4)), b = dealtBy(plain, () => run(plain, 4));
  near(a / b, 1.25, 1.45, "スリーカードの光線は 1.35 倍");
  // 解放していない役は つかない
  const lk = arena({ loadout: beams, unlocked: ["pair"] });
  ok(!lk.combos.some((c) => c.name.includes("スリーカード")) && lk.combos.some((c) => c.name.includes("ペア")), "解放していなければ、ひとつ下の役になる");
  ok(lk.missed.some((m) => m.name.includes("スリーカード")), "つくはずだった役が missed に出る");
  eq(lk.mods.dmg.beam, 0.15, "ペアの威力だけ");
  // 強化
  const meta = MT.defaultMeta();
  meta.lv.pow = 4; meta.lv.arm = 2; meta.lv.spd = 5; meta.lv.chg = 3; meta.lv.bolt = 2;
  const fx = MT.metaFx(meta);
  const m = arena({ loadout: [], metaFx: fx });
  near(m.mods.dmgAll, 0.2 - 1e-9, 0.2 + 1e-9, "火力 4 段で +20%");
  eq(m.p.hpMax, 3 + 2, "装甲 2 段で ライフ +2");
  near(m.mods.speed, 0.2 - 1e-9, 0.2 + 1e-9, "機動 5 段で 移動 +20%");
  near(m.mods.charge, 0.15 - 1e-9, 0.15 + 1e-9, "溜め 3 段で +15%");
  const sp0 = arena({ loadout: [] }), sp1 = arena({ loadout: [], metaFx: fx });
  place(sp0, 14); place(sp1, 14);
  sp0.p.pitch = sp1.p.pitch = 0; sp0.p.yaw = sp1.p.yaw = 0;
  run(sp0, 0.6, { iz: 1 }); run(sp1, 0.6, { iz: 1 });
  ok(Math.hypot(sp1.p.x - 0, sp1.p.z - 14) > Math.hypot(sp0.p.x - 0, sp0.p.z - 14) * 1.1, "機動を伸ばすと 速く動ける");
  // ライフ・バリア
  const life = SIM.createGame({ loadout: [mk("a.iso", 5 * GB)] });
  eq(life.p.hpMax, 4, "ずっしりで ライフ +1"); eq(life.p.hp, 4, "ライフも満タン");
  const sh = SIM.createGame({ loadout: [mk("backup1.zip", MB), mk("backup2.zip", 2 * MB)], practice: false });
  eq(sh.shield, 1, "バックアップ癖で バリア1回");
  run(sh, 4.2);
  sh.p.inv = 0;
  sh.bullets.add({ x: sh.p.x, y: sh.p.y, z: sh.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(sh, 1 / 60, idle);
  eq(sh.p.hp, 3, "バリアが 1回 受ける"); eq(sh.shield, 0, "バリアが 減る");
  ok(sh.events.some((e) => e.t === "shield"), "shield の出来事");
  sh.p.inv = 0;
  sh.bullets.add({ x: sh.p.x, y: sh.p.y, z: sh.p.z, ang: 0, speed: 0, r: 0.4 });
  SIM.update(sh, 1 / 60, idle);
  eq(sh.p.hp, 2, "2回めは ライフが減る");
  // 持ち越した減り
  const d = SIM.createGame({ seed: 1, loadout: [mk("a.iso", 5 * GB)], deficit: 2 });
  eq(d.p.hp, d.p.hpMax - 2, "持ち越した減りぶんが 反映される");
  const e = SIM.createGame({ seed: 1, loadout: [], deficit: 9 });
  eq(e.p.hp, 1, "減りが大きくても ライフは 1 は ある");
  // 手が変わると、次の面で役も変わる
  const g3 = arena({ loadout: beams });
  g3.mag.length = 0;
  SIM.startStage(g3, 2);
  eq(g3.combos.length, 0, "空にして次の面に入ると、役は消える");
  eq(g3.p.hpMax, 3, "ライフの増えも消える");
}

section("砲ごとの撃ち方");
{
  // 砲弾：遠いほど強い
  {
    const dmgAt = (z) => { const g = arena({ loadout: [mk("a.cpp", 300 * MB)] }); place(g, z); return dealtBy(g, () => { fire(g, g.mag[0]); run(g, 3); }); };
    const nearD = dmgAt(9), farD = dmgAt(30);
    ok(farD > nearD * 1.3, `砲弾は遠いほど強い（近 ${nearD.toFixed(0)}、遠 ${farD.toFixed(0)}）`);
    const g = arena({ loadout: [mk("a.cpp", 300 * MB)] }); place(g, 14);
    fire(g, g.mag.length ? g.mag[0] : null);
    ok(g.shots.some((s) => s.k === "shell" && s.clearR > 1), "砲弾は 弾を消しながら進む");
    // 照準がボスから大きくはずれていれば、ボスには当たらない
    const h = arena({ loadout: [mk("a.cpp", 300 * MB)] }); place(h, 14);
    h.p.yaw += 0.6;
    const miss = dealtBy(h, () => { fire(h, h.mag[0]); run(h, 3); });
    eq(miss, 0, "照準がずれていれば、砲弾はボスに当たらない");
  }
  // 散弾：近いほど強い
  {
    const dmgAt = (z) => { const g = arena({ loadout: [mk("p.png", 300 * MB)] }); place(g, z); return dealtBy(g, () => { fire(g, g.mag[0]); run(g, 2); }); };
    const nearD = dmgAt(8), farD = dmgAt(30);
    ok(nearD > farD * 2, `散弾は近いほど強い（近 ${nearD.toFixed(0)}、遠 ${farD.toFixed(0)}）`);
    const g = arena({ loadout: [mk("p.png", 300 * MB)] }); place(g, 12);
    fire(g, g.mag[0]);
    const ys = g.shots.filter((s) => s.k === "pellet").map((s) => s.vy);
    ok(Math.max(...ys) - Math.min(...ys) > 3, "散弾は 縦にも広がる");
  }
  // 光線：動けない。照準で向きを変えられる
  {
    const loadout = [mk("v.mp4", 300 * MB)];
    const full = arena({ loadout }); place(full, 14);
    const A0 = full.mag[0];
    const onTarget = dealtBy(full, () => { fire(full, A0); run(full, 4); });
    near(onTarget / A0.dmg, 0.95, 1.06, "光線を ボスに当て続けると 威力ぶん入る");
    const g = arena({ loadout }); place(g, 14);
    const dealt = dealtBy(g, () => {
      fire(g, g.mag[0]);
      const beam = g.shots.find((s) => s.k === "beam");
      ok(beam && beam.onBoss, "はじめは ボスに当たっている");
      run(g, 0.5);
      SIM.update(g, 1 / 60, { turnYaw: 0.5 });                      // 見る向きを 28 度 右へ
      run(g, 0.8, idle);
      ok(!beam.onBoss, "照準を ふると、光線がボスからはずれる");
      run(g, 0.3, { lock: true });
      ok(beam.onBoss, "ボスのほうを向くと、また当たる");
      run(g, 5);
    });
    ok(g.p.rootT <= 0.06, "光線が終わると 動ける");
    ok(dealt < A0.dmg * 0.95 && dealt > A0.dmg * 0.4, `はずしているあいだは削れない（${(dealt / A0.dmg).toFixed(2)}）`);
    // 弾を焼く
    const h = arena({ loadout }); place(h, 14);
    for (let i = 0; i < 20; i++) h.bullets.add({ x: -0.4 + i * 0.04, y: BH.y + (h.p.y - BH.y) * 0.4, z: 8, ang: 0, speed: 0, r: 0.3 });
    h.bullets.add({ x: 20, y: BH.y, z: 8, ang: 0, speed: 0, r: 0.3 });
    fire(h, h.mag[0]); run(h, 0.3);
    ok(h.bullets.n <= 3, `光線は 通り道の弾を焼く（のこり ${h.bullets.n}）`);
  }
  // 音波：バリア。入った弾を消して、弾き返してダメージに
  {
    const g = arena({ loadout: [mk("m.mp3", 300 * MB)] }); place(g, 14);
    const A0 = g.mag[0];
    for (let i = 0; i < 20; i++) g.bullets.add({ x: g.p.x + Math.sin(i) * 2.5, y: g.p.y + Math.cos(i * 1.7) * 1.5, z: g.p.z + Math.cos(i) * 2.5, ang: 0, speed: 0, r: 0.3 });
    const dealt = dealtBy(g, () => { fire(g, A0); run(g, 1); });
    eq(g.bullets.n, 0, "バリアに入った弾は 消える");
    eq(g.stats.reflected, 20, "20発 弾き返した");
    near(dealt / A0.dmg, 0.85, 0.95, "弾き返した分が ダメージになる");
    const h = arena({ loadout: [mk("m.mp3", 300 * MB)] }); place(h, 14);
    for (let i = 0; i < 120; i++) h.bullets.add({ x: h.p.x + Math.sin(i) * 2.5, y: h.p.y + Math.cos(i * 1.7) * 1.5, z: h.p.z + Math.cos(i) * 2.5, ang: 0, speed: 0, r: 0.3 });
    const big = dealtBy(h, () => { fire(h, h.mag[0]); run(h, 1); });
    near(big / A0.dmg, 1.4, 1.55, "弾き返すダメージには 上限がある");
    const k = arena({ loadout: [mk("m.mp3", 300 * MB)], practice: false }); place(k, 14);
    fire(k, k.mag[0]);
    for (let i = 0; i < 8; i++) k.bullets.add({ x: k.p.x + Math.sin(i) * 9, y: k.p.y, z: k.p.z + Math.cos(i) * 9, ang: Math.atan2(-Math.sin(i), -Math.cos(i)), speed: 6, r: 0.35 });
    k.p.inv = 0;
    run(k, 2);
    eq(k.p.hp, 3, "バリアのあいだは 弾に当たらない");
    ok(k.bullets.n === 0, "近づいた弾は 消された");
    run(k, 6);
    ok(!k.shots.some((s) => s.k === "dome"), "バリアは時間で消える");
  }
  // 誘導弾：勇者を狙う弾を先に落とす
  {
    const g = arena({ loadout: [mk("d.pdf", 300 * MB)] }); place(g, 14);
    const A0 = g.mag[0];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = g.p.x + Math.sin(a) * 10, z = g.p.z + Math.cos(a) * 10;
      g.bullets.add({ x, y: g.p.y, z, ang: Math.atan2(g.p.x - x, g.p.z - z), speed: 2.5, r: 0.3 });
    }
    const c0 = g.stats.clears;
    const dealt = dealtBy(g, () => { fire(g, A0); run(g, 1.8); });
    ok(g.stats.clears - c0 >= 3, `誘導弾が 勇者を狙う弾を落とす（${g.stats.clears - c0}発）`);
    const more = dealtBy(g, () => run(g, 6));
    near((dealt + more) / A0.dmg, 0.9, 1.02, "撃ち落としても ダメージは 威力ぶん入る");
    ok(g.shots.length === 0, "撃ち終わったら残らない");
    const h = arena({ loadout: [mk("d.pdf", 300 * MB)] }); place(h, 14);
    const d2 = dealtBy(h, () => { fire(h, h.mag[0]); run(h, 7); });
    near(d2 / A0.dmg, 0.9, 1.02, "弾がなければ ボスへ飛ぶ");
  }
  // 集束弾：もう一度 溜めるキーで 起爆
  {
    const mkC = () => arena({ loadout: [mk("z.zip", 300 * MB)] });
    const g = mkC(); place(g, 30);
    const A0 = g.mag[0];
    fire(g, A0);
    run(g, 0.5, idle);
    const bomb = g.shots.find((s) => s.k === "bomb");
    ok(bomb && bomb.manual, "集束弾は 手動起爆の爆弾");
    for (let i = 0; i < 20; i++) g.bullets.add({ x: bomb.x + Math.sin(i), y: bomb.y + Math.cos(i * 2) * 0.5, z: bomb.z - 1 + Math.cos(i), ang: 0, speed: 0, r: 0.3 });
    const n0 = g.bullets.n, d0 = g.stats.dmg;
    SIM.update(g, 1 / 60, { charge: true });
    ok(bomb.dead, "もう一度 押すと 起爆する");
    ok(g.shots.some((s) => s.k === "missile" && s.frag), "破片が出る");
    ok(g.events.some((e) => e.t === "detonate"), "detonate の出来事");
    run(g, 0.5);
    ok(g.bullets.n < n0 * 0.3, `起爆で まわりの弾が消える（${n0} → ${g.bullets.n}）`);
    run(g, 5);
    near((g.stats.dmg - d0) / A0.dmg, 0.4, 0.62, "遠くで起爆すると 破片のぶん（半分）だけ入る");
    ok(g.p.ch === null, "起爆のキーで 次の溜めが始まらない");
    const h = mkC(); place(h, 30);
    const all = dealtBy(h, () => { fire(h, h.mag[0]); run(h, 9); });
    near(all / A0.dmg, 0.93, 1.06, "起爆しなければ ボスにぶつかって 全部入る");
    const k = SIM.createGame({ seed: 1, loadout: [mk("z.zip", 300 * MB), mk("y.zip", 300 * MB + 1)], practice: true, autoTurn: "off" });
    run(k, 4.2); k.boss.phase.atk = []; k.boss.phase.move = "hold"; k.boss.hp = k.boss.hpMax = 1e7; place(k, 30);
    fire(k, k.mag[0]); run(k, 0.3);
    SIM.update(k, 1 / 60, { charge: true });
    run(k, 0.3, { charge: true });
    ok(!k.p.ch, "起爆のキーを押しつづけても、次の溜めは始まらない");
    run(k, 1.5, { charge: false });
    run(k, 0.2, { charge: true });
    ok(!!k.p.ch, "いったん放して押すと 溜めはじめる");
  }
  // 爆裂弾：高く打ち上げて、上から落とす
  {
    const g = arena({ loadout: [mk("e.exe", 300 * MB)] }); place(g, 20);
    const A0 = g.mag[0];
    let apex = 0;
    const dealt = dealtBy(g, () => {
      fire(g, A0);
      for (let i = 0; i < 60 * 5; i++) { SIM.update(g, 1 / 60, idle); for (const s of g.shots) if (s.k === "lob") apex = Math.max(apex, s.y); }
    });
    ok(apex > g.boss.y + 3, `高く打ち上がる（頂点 ${apex.toFixed(1)}）`);
    near(dealt / A0.dmg, 0.9, 1.06, "ボスの真上から落ちて 威力ぶん入る");
    const hit = g.events.filter((e) => e.t === "hit" && e.cannon).pop();
    ok(hit && hit.side === "high", "上から当たる");
    const h = arena({ loadout: [mk("e.exe", 300 * MB)] }); place(h, 20);
    fire(h, h.mag[0]);
    for (let i = 0; i < 50; i++) h.bullets.add({ x: Math.sin(i) * 3, y: BH.y + Math.cos(i) * 1.5, z: Math.cos(i) * 3, ang: 0, speed: 0, r: 0.3, life: 60 });
    run(h, 4);
    ok(h.bullets.n < 5, `爆発の中の弾が消える（のこり ${h.bullets.n}）`);
    const w = arena({ loadout: [mk("e.exe", 300 * MB)] }); place(w, 20);
    w.boss.phase.weak = 99; w.boss.weak = "high"; w.boss.weakT = 99;
    const wd = dealtBy(w, () => { fire(w, w.mag[0]); run(w, 5); });
    near(wd / A0.dmg, 1.6, 1.9, "弱点が上のとき、爆裂弾は 1.8 倍");
    // ロックオン補助の外なら、照準の先へ落ちる
    const o = arena({ loadout: [mk("e.exe", 300 * MB)] }); place(o, 20);
    o.p.yaw += 0.8; o.p.pitch = -0.2;
    const od = dealtBy(o, () => { fire(o, o.mag[0]); run(o, 5); });
    eq(od, 0, "照準がボスからはずれていれば、照準の先に落ちる（ボスには当たらない）");
  }
  // 隕石：いつも上から。高い所の弾を消す
  {
    const g = arena({ loadout: [mk("m.iso", 300 * MB)] }); place(g, 14);
    const A0 = g.mag[0];
    for (let i = 0; i < 20; i++) g.bullets.add({ x: Math.sin(i) * 9, y: 20 + (i % 5), z: Math.cos(i) * 9, ang: 0, speed: 0, r: 0.3, life: 60 });
    const dealt = dealtBy(g, () => { fire(g, A0); run(g, 6); });
    near(dealt / A0.dmg, 0.9, 1.06, "隕石は 威力ぶん入る");
    ok(g.events.filter((e) => e.t === "hit" && e.cannon).every((e) => e.side === "high"), "隕石は いつも上から当たる");
    eq(g.shots.length, 0, "撃ち終わったら残らない");
    // 照準の先へも降らせる
    const o = arena({ loadout: [mk("m.iso", 300 * MB)] }); place(o, 14);
    o.p.yaw += 0.9; o.p.pitch = -0.3;
    const od = dealtBy(o, () => { fire(o, o.mag[0]); run(o, 6); });
    eq(od, 0, "照準がはずれていれば、照準の先に降る");
    eq(o.shots.length, 0, "降りきったら残らない");
  }
}

section("溜めと放し");
{
  const g = arena({ loadout: ammoSet() });
  place(g, 14);
  SIM.selectKind(g, "shot");                              // h.cpp 豆鉄砲
  run(g, 0.1, { charge: true });
  ok(g.p.ch && !g.p.ch.ready, "溜めている");
  run(g, 0.05, { charge: false });
  eq(SIM.ammoLeft(g), 8, "溜めきる前にはなしたら、撃たない");
  ok(g.events.some((e) => e.t === "chargeCancel"), "chargeCancel の出来事");
  run(g, 0.6, { charge: true });
  ok(g.p.ch && g.p.ch.ready, "溜まった");
  eq(SIM.ammoLeft(g), 8, "溜まっても、はなすまでは撃たない");
  run(g, 0.05, { charge: false });
  eq(SIM.ammoLeft(g), 7, "はなしたら撃つ");
  ok(g.p.inv >= 0.25, "撃ったあとは しばらく無敵");
  const gg = arena({ loadout: ammoSet() });
  place(gg, 14);
  SIM.selectKind(gg, "meteor");
  run(gg, 2, { charge: true });
  ok(gg.p.ch && !gg.p.ch.ready, "6GB は 2秒では溜まらない");
  run(gg, 3, { charge: true });
  ok(gg.p.ch.ready, "6GB は 5秒で溜まる");
  // 溜めている途中で 種類をかえたら、溜めは消える
  SIM.selectKind(gg, "spread");
  ok(!gg.p.ch, "種類をかえると 溜めが消える");
  const fast = SIM.createGame({ seed: 1, loadout: Array.from({ length: 5 }, (_, i) => mk(`q${i}.${["mp4", "mp3", "png", "pdf", "zip"][i]}`, 30 * MB + i)), practice: true });
  ok(fast.mods.charge > 0.05, "バラエティで 溜めが速い");
}

section("面とフェーズ");
{
  const g = SIM.createGame({ seed: 1, loadout: [], practice: true });
  run(g, 4.2);
  const n = g.bossDef.phases.length;
  for (let k = 0; k < n; k++) {
    eq(g.phaseIdx, k, `フェーズ${k + 1}`);
    g.boss.hp = 0.5;
    run(g, 2, { shoot: true, lock: true });
    ok(g.events.some((e) => e.t === "phaseClear"), `フェーズ${k + 1}の撃破`);
    g.events.length = 0;
    if (k < n - 1) { eq(g.boss.state, "gap", "つぎのフェーズまでの間"); run(g, 2.5); }
  }
  eq(g.mode, "clear", "全フェーズで面クリア");
  ok(g.score > 0 && g.bullets.n === 0, "スコア。クリアで弾が消える");
  const sm = SIM.summary(g);
  ok(sm.cleared && sm.phaseCount === n && sm.phases === n && sm.noMiss, "まとめ：クリア・フェーズの数・ノーミス");
  SIM.startStage(g, 2);
  eq(g.stage, 2, "次の面へ"); eq(g.mode, "intro", "また登場から"); eq(g.p.z, C.START_POS.z, "勇者は元の位置"); eq(g.p.y, C.START_POS.y, "高さも元に戻る");
  const t = SIM.createGame({ seed: 1, loadout: [], practice: true });
  run(t, 3);
  run(t, t.bossDef.phases[0].time + 3);
  eq(t.phaseIdx, 1, "時間切れで つぎのフェーズ");
  eq(t.stats.phasesTimeout, 1, "時間切れの記録");
  // ダメージはフェーズの体力まで。持ち越さない
  const c = arena({ loadout: ammoSet() });
  const cap = (c.boss.hp = c.boss.hpMax = 800);
  place(c, 14);
  run(c, 0.1);
  fire(c, c.mag.find((a) => a.name === "a.iso"));
  run(c, 6);
  ok(c.stats.dmg <= cap + 1e-6, `フェーズの体力をこえて数えない（${c.stats.dmg.toFixed(0)} / ${cap}）`);
  ok(c.stats.biggest && c.stats.biggest.name === "a.iso", "最大の一撃の記録");
  // 面が進むと、弾が増えて速くなる
  const s1 = ST.stageScale(1), s5 = ST.stageScale(5), s30 = ST.stageScale(30);
  ok(s5.cm > s1.cm && s5.sm > s1.sm, "5面は 1面より 弾が多く 速い");
  ok(s30.cm <= 2.0 && s30.sm <= 1.5, "上限がある");
  ok(ST.bossFor(3).phases[0].hp / ST.bossFor(1).phases[0].hp > 1.4, "体力も 面で増える");
}

section("決まった種・難しさ");
{
  const sig = (seed) => { const g = SIM.createGame({ seed, loadout: [], practice: true }); run(g, 20, { lock: true }); return [g.bullets.n, g.graze, g.score, g.boss.x.toFixed(4)].join(); };
  eq(sig(7), sig(7), "同じ種なら同じ展開");
  const e = SIM.createGame({ difficulty: "easy" }), l = SIM.createGame({ difficulty: "lunatic" });
  ok(e.p.hp > l.p.hp, "やさしいほどライフが多い");
  const count = (g) => { run(g, 23, { lock: true }); return g.stats.clears + g.bullets.n; };
  ok(count(SIM.createGame({ seed: 1, difficulty: "lunatic", practice: true })) > count(SIM.createGame({ seed: 1, difficulty: "easy", practice: true })), "ルナティックのほうが弾が多い");
}

section("全ボスを 30 秒ずつ（落ちない・数が壊れない）");
{
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9]) {
    const g = SIM.createGame({ seed: n, stage: n, loadout: ammoSet(), practice: true });
    run(g, 3);
    for (let k = 0; k < g.bossDef.phases.length; k++) {
      g.boss.hp = g.boss.hpMax;
      let bad = 0;
      for (let i = 0; i < 60 * 12; i++) {
        SIM.update(g, 1 / 60, { ix: Math.sin(g.t) > 0 ? 1 : -1, iz: Math.cos(g.t * 0.7), iy: Math.sin(g.t * 0.5), turnYaw: Math.sin(g.t) * 0.01, shoot: true, lock: i % 90 < 60 });
        g.events.length = 0;
        if (!finite(g.p.x, g.p.y, g.p.z, g.p.yaw, g.p.pitch, g.boss.x, g.boss.y, g.boss.z, g.score)) bad++;
        if (g.p.y < C.Y_MIN - 1e-6 || g.p.y > C.Y_MAX + 1e-6) bad++;
        if (g.bullets.n > C.MAX_BULLETS) bad++;
      }
      ok(bad === 0, `面${n} フェーズ${k + 1}：数が壊れない`);
      g.boss.hp = 0.5; run(g, 2, { shoot: true, lock: true }); run(g, 2.5);
      g.events.length = 0;
      if (g.mode !== "fight") break;
    }
  }
}

section("フォルダのボス");
{
  const FB = await import(st.url("folderboss.js"));
  const fold = (name, bytes, ext, reached = 9, root = false) => FB.folderBoss({
    folder: { name, path: root ? "C:\\" : `C:\\t\\${name}`, parentPath: root ? "" : "C:\\t" },
    stats: { bytes, files: 50, folders: 3, truncated: false, byExt: [{ ext, count: 50, bytes }] }, reached,
  });
  const fb = fold("Movies", 3 * GB, "mp4");
  const mk2 = () => {
    const g = SIM.createGame({ seed: 4, practice: true, stage: fb.grade, bossBase: fb.base, loadout: [], autoTurn: "off" });
    run(g, 4.2);
    g.boss.phase.atk = []; g.boss.phase.move = "hold"; g.boss.phase.lift = 0; g.boss.phase.weak = 0; g.boss.weak = null; g.boss.weakWarn = 0;
    g.boss.hp = g.boss.hpMax = 1e7; g.boss.x = BH.x; g.boss.y = BH.y; g.boss.z = BH.z; g.bullets.clear(); g.events.length = 0;
    return g;
  };
  let g = mk2();
  ok(g.bossDef.name === "Movies" && g.bossDef.label.includes("格") && g.stage === fb.grade && g.bossDef.phases.length === 3 && g.bossDef.info.path === "C:\\t\\Movies", "ボスは フォルダから作られる");
  const first = SIM.createGame({ seed: 4, stage: fb.grade, bossBase: fb.base });
  ok(first.events.some((e) => e.t === "stage" && e.name === "Movies" && e.label.includes("格")), "面のはじまりに 名前と格が出る");
  const hit = (kind) => { const gg = mk2(); return SIM.damageBoss(gg, 100, gg.boss.x, gg.boss.y, gg.boss.z + 3, kind ? { cannon: { kind, name: "x", bytes: 1 } } : null); };
  const other = A.KIND_ORDER.find((k) => k !== fb.main && k !== fb.weakKind);
  near(hit(fb.main), 79.9, 80.1, "本性の種類の砲は 効きにくい（×0.8）");
  near(hit(fb.weakKind), 139.9, 140.1, "苦手な種類の砲は 効きやすい（×1.4）");
  near(hit(other), 99.9, 100.1, "ほかの種類は ふつう");
  near(hit(null), 99.9, 100.1, "ふつうの弾は 変わらない");
  g = SIM.createGame({ seed: 4, practice: true, stage: 3, loadout: [] }); run(g, 4.2);
  g.boss.phase.atk = []; g.boss.hp = g.boss.hpMax = 1e7;
  near(SIM.damageBoss(g, 100, g.boss.x, g.boss.y, g.boss.z + 3, { cannon: { kind: "beam" } }), 99.9, 100.1, "ふつうの面には 倍率がない");
  ok(SIM.summary(SIM.createGame({ stage: fb.grade, bossBase: fb.base })).boss.path === "C:\\t\\Movies", "結果に フォルダの情報がつく");
  ok(SIM.summary(SIM.createGame({ stage: 2 })).boss === null, "ふつうの面には 無い");
  // 格 1〜8 × 全種類を、30 秒ずつ
  let n = 0;
  for (let grade = 1; grade <= 8; grade++) {
    const kind = A.KIND_ORDER[(grade - 1) % 8], ext = { shot: "cpp", spread: "png", beam: "mp4", wave: "mp3", homing: "pdf", cluster: "zip", blast: "exe", meteor: "iso" }[kind];
    const f = fold(`F${grade}`, 20 * MB * 4 ** (grade - 1) * 1.01, ext, 9, grade === 8);     // 格 grade のサイズ
    eq(f.grade, grade, `格 ${grade} のサイズから 格 ${grade} のボス`);
    const gm = SIM.createGame({ seed: grade, stage: f.grade, bossBase: f.base, loadout: ammoSet(), practice: true });
    run(gm, 3);
    let bad = 0, fought = 0;
    for (let k = 0; k < gm.bossDef.phases.length && gm.mode === "fight"; k++) {
      gm.boss.hp = gm.boss.hpMax;
      for (let i = 0; i < 60 * 8; i++) {
        SIM.update(gm, 1 / 60, { ix: Math.sin(gm.t) > 0 ? 1 : -1, iz: Math.cos(gm.t * 0.7), iy: Math.sin(gm.t * 0.5), turnYaw: Math.sin(gm.t) * 0.01, shoot: true, lock: i % 90 < 60 });
        gm.events.length = 0;
        if (!finite(gm.p.x, gm.p.y, gm.p.z, gm.boss.x, gm.boss.y, gm.boss.z, gm.score) || gm.bullets.n > C.MAX_BULLETS) bad++;
      }
      fought++;
      gm.boss.hp = 0.5; run(gm, 2, { shoot: true, lock: true }); run(gm, 2.5);
    }
    n += fought;
    ok(bad === 0 && fought >= 1, `格 ${grade}（${A.KINDS[f.main].name}）のフォルダのボス：数が壊れない`);
    eq(gm.bossDef.phases.length, f.grade >= 5 ? 4 : 3, `格 ${grade} の フェーズの数`);
  }
  ok(n >= 12, `フェーズを ${n} 回 通った`);
}

section("完全オートエイム");
{
  const hit = (assist, away) => {
    const g = arena({ assist });
    place(g, 16);
    if (away) { g.p.yaw += Math.PI; g.p.pitch = 0.4; }          // ボスに 背を向けて、上を向く
    const d0 = g.stats.dmg;
    run(g, 2, { ix: 0, iz: 0, iy: 0, shoot: true });
    return { dmg: g.stats.dmg - d0, locked: g.locked };
  };
  const full = hit(360, true), none = hit(7, true), front = hit(7, false);
  ok(full.locked && full.dmg > 0, `完全なら、背を向けていても ボスに当たる（${full.dmg.toFixed(1)}）`);
  ok(!none.locked && none.dmg === 0, `7 度の補助では、背を向けると 当たらない（${none.dmg.toFixed(1)}）`);
  ok(front.locked && front.dmg > 0, "向いていれば 7 度でも当たる");
  const g = arena({ assist: 360 });
  run(g, 0.5);
  ok(g.locked, "完全なら いつも ロックオン");
}

section("危険の合図（画面に入っていない所から 当たりそうな弾）");
{
  const SC = await import(st.url("scene.js"));
  const TH = await import(st.url("threat.js"));
  const FOV = (80 * Math.PI) / 180, ASP = 16 / 9;
  const scan = (g, mode = "first") => TH.scanThreats(g, SC.cameraOf(g, mode, 0), FOV, ASP);
  const setup = () => { const g = arena(); place(g, 14); g.marks.length = 0; g.pillars.length = 0; return g; };
  const add = (g, o) => g.bullets.add({ r: 0.3, ...o });

  let g = setup();
  let r = scan(g);
  ok(r.markers.length === 0 && r.up === 0 && r.down === 0 && r.count === 0, "弾がなければ 何も出ない");
  // 真上から落ちてくる
  add(g, { x: g.p.x, y: g.p.y + 10, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  r = scan(g);
  ok(r.up > 0.3 && r.down === 0 && r.upText === "上から", `真上から落ちてくる弾が「上」になる（${r.up.toFixed(2)}）`);
  ok(r.markers.length === 1 && r.markers[0].vert, "ふちのしるしは 上下の向き");
  // 真下から上がってくる
  g = setup();
  add(g, { x: g.p.x, y: g.p.y - 10, z: g.p.z, pitch: Math.PI / 2, speed: 10 });
  r = scan(g);
  ok(r.down > 0.3 && r.up === 0 && r.downText === "下から", "真下から上がってくる弾が「下」になる");
  // 目の前に見えている弾は、合図を出さない（見えているので）
  g = setup();
  add(g, { x: g.p.x, y: g.p.y, z: g.p.z - 12, ang: 0, speed: 8 });
  r = scan(g);
  ok(r.markers.length === 0 && r.count === 0, "見えている弾には 合図を出さない");
  // 真うしろから：しるしは出るが、上・下には数えない
  g = setup();
  add(g, { x: g.p.x, y: g.p.y, z: g.p.z + 10, ang: Math.PI, speed: 8 });
  r = scan(g);
  ok(r.markers.length === 1 && !r.markers[0].vert && r.up === 0 && r.down === 0, "真うしろは しるしだけ");
  // 遠ざかる弾・遠すぎる弾・横をぬける弾は 出ない
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 6, z: g.p.z, pitch: Math.PI / 2, speed: 10 });
  ok(scan(g).up === 0, "遠ざかる弾は 出ない");
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 40, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  ok(scan(g).up === 0, "遠すぎる弾は 出ない");
  g = setup();
  add(g, { x: g.p.x + 6, y: g.p.y + 10, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  ok(scan(g).up === 0, "横を ぬける弾は 出ない");
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 10, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  const slow = scan(g).up;
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 4, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  ok(scan(g).up > slow, "あたるまでが 短いほど 強い合図");
  // 自分が ぶつかりにいく
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 3, z: g.p.z, speed: 0 });
  g.p.vy = 6;
  ok(scan(g).up > 0.3, "止まっている弾にも、こちらが向かえば 合図");
  g.p.vy = 0;
  ok(scan(g).up === 0, "こちらも止まっていれば 合図は出ない");
  // 床の警告
  g = setup();
  g.marks.push({ x: g.p.x + 1, z: g.p.z, r: 1.2, life: 0.5, max: 1, col: 4 });
  r = scan(g);
  ok(r.up > 0.3 && r.upText === "真上から落ちてくる", "雨の落ちる印が 近いと「真上から」");
  g = setup();
  g.marks.push({ x: g.p.x + 20, z: g.p.z, r: 1.2, life: 0.5, max: 1, col: 4 });
  ok(scan(g).up === 0, "遠い印は 出ない");
  g = setup();
  g.pillars.push({ x: g.p.x, z: g.p.z + 1, r: 1.1, warn: 0.5, life: 0.8, max: 0.8, age: 0, grazeCd: 0, col: 0 });
  r = scan(g);
  ok(r.down > 0.3 && r.downText.includes("柱"), "柱の警告が 近いと「足もとから」");
  g = setup();
  g.pillars.push({ x: g.p.x, z: g.p.z, r: 1.1, warn: 0, life: 0.8, max: 0.8, age: 0, grazeCd: 0, col: 0 });
  ok(scan(g).down === 0, "もう立っている柱は 警告ではない");
  // ゲームが終わったら 出さない
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 10, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  g.mode = "over";
  ok(scan(g).markers.length === 0, "ゲームオーバーでは 出さない");
  // 三人称でも 動く
  g = setup();
  add(g, { x: g.p.x, y: g.p.y + 10, z: g.p.z, pitch: -Math.PI / 2, speed: 10 });
  ok(scan(g, "third").up > 0, "三人称でも 上から の合図");
  // 数が多くても 重くならない（しるしは 20 方向まで）
  g = setup();
  for (let i = 0; i < 3000; i++) add(g, { x: g.p.x + (i % 7) - 3, y: g.p.y + 8 + (i % 5), z: g.p.z + (i % 11) - 5, pitch: -Math.PI / 2, speed: 9 });
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) r = scan(g);
  ok(r.markers.length <= 20 && (performance.now() - t0) / 20 < 8, `弾が 3000 発あっても 1 回 8ms 以内（${((performance.now() - t0) / 20).toFixed(2)}ms）`);
}

console.log(`\n${fail ? "NG" : "OK"}  通った ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
