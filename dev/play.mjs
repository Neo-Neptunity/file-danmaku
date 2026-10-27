// 画面なしの通しプレイ：避けるボットが、自由に飛びながら、ボスを倒していく。マガジンは 容量マップにつめて持っていく。
//   使い方：node file-danmaku/dev/play.mjs [--stages=5] [--from=1] [--diff=normal] [--seed=1] [--practice] [--nocannon] [--verbose] [--trace]
//           [--hand=mixed|beams|small|big|none] [--noweak] [--progress] [--cap=0] [--meta=0] [--unlock=start|all] [--folder=格:種類]
//   --stages：何面まで　--from：何面から　--nocannon：ふつうの弾だけで戦う　--practice：やられない　--trace：10秒ごとに、体力などを出す
//   --hand：持っているファイル。mixed は いろいろ 40 個、beams は 動画ばかり、small は 小さいファイルばかり、big は 大きいファイルばかり、none は空
//   --progress：面をクリアするごとに 素材をもらい、強化と役の解放を 買っていく（遊びつづけた人の育ちかたを 見る）
//   --cap：マガジンを 何段まで広げて始めるか　--meta：強化を 何段まで上げて始めるか（0〜）　--unlock：はじめから 役を全部解放するか
//   --noweak：弱点をねらわない　--human：人にちかづける（見るのが おそく、動きが ぶれる。0.15 秒ごとにしか 考えなおさない）
//   見ること：エラーが出ない・数が NaN にならない・場の外に出ない・8種類の砲が ぜんぶ ボスに当たる・体力とフェーズが進む・1コマの重さ
import { stage } from "./stage.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const st = stage("play");
const sim = await import(st.url("sim.js"));
const { ammoOf, KIND_ORDER } = await import(st.url("ammo.js"));
const C = await import(st.url("consts.js"));
const PZ = await import(st.url("puzzle.js"));
const MT = await import(st.url("meta.js"));
const CB = await import(st.url("combos.js"));

const MB = 1024 * 1024, GB = 1024 * MB, KB = 1024;
const EXTS = ["png", "mp4", "zip", "pdf", "exe", "iso", "mp3", "cpp"];
// 持っているファイル（フォルダの中身のつもり）
const HANDS = {
  mixed: Array.from({ length: 40 }, (_, i) => [`file${i}.${EXTS[i % 8]}`, [2 * KB, 80 * KB, 900 * KB, 6 * MB, 40 * MB, 300 * MB, 1.5 * GB, 7 * GB][((i * 5) % 8)] * (1 + (i % 3) * 0.37)]),
  beams: Array.from({ length: 40 }, (_, i) => [`movie${i}.mp4`, (50 + i * 40) * MB]),
  small: Array.from({ length: 40 }, (_, i) => [`note${i}.${["txt", "png", "md", "jpg"][i % 4]}`, (3 + i * 17) * KB]),
  big: Array.from({ length: 24 }, (_, i) => [`big${i}.${["iso", "mkv", "zip", "exe", "iso", "mp4", "7z", "bin"][i % 8]}`, (2 + i) * GB]),
  none: [],
};
const FILES = HANDS[args.hand || "mixed"] || HANDS.mixed;
let uidSeq = 1;
const mkAmmo = ([name, size]) => ({ ...ammoOf({ name, ext: name.split(".").pop(), size, path: "C:\\x\\" + name, id: name + size }), uid: uidSeq++ });

// --folder=格[:種類]：その格の フォルダのボス 1 体と戦う（種類は shot spread beam wave homing cluster blast meteor。格 8 に :root で ドライブ）
const FB = await import(st.url("folderboss.js"));
let folderBoss = null;
if (args.folder) {
  const [gr, kind = "spread", rootFlag] = String(args.folder).split(":"), grade = Math.max(1, Math.min(8, Number(gr) || 1));
  const ext = { shot: "cpp", spread: "png", beam: "mp4", wave: "mp3", homing: "pdf", cluster: "zip", blast: "exe", meteor: "iso" }[kind] || "png";
  const bytes = 20 * MB * 4 ** (grade - 1) * 1.01;
  folderBoss = FB.folderBoss({ folder: { name: `${kind}の${grade}`, path: rootFlag === "root" ? "C:\\" : `C:\\t\\${kind}${grade}`, parentPath: rootFlag === "root" ? "" : "C:\\t" }, stats: { bytes, files: 100, folders: 4, truncated: false, byExt: [{ ext, count: 100, bytes }] }, reached: grade });
  console.log(`フォルダのボス ${folderBoss.base.name}　格 ${folderBoss.grade}　${folderBoss.title}　本性 ${kind}　苦手 ${folderBoss.weakKind}　フェーズ ${folderBoss.base.phases.length}`);
}
const stages = Number(args.stages || (folderBoss ? 1 : 5)), from = folderBoss ? folderBoss.grade : Number(args.from || 1);
const diff = args.diff || "normal";
const errors = [];
const fail = (m) => { errors.push(m); if (errors.length < 20) console.log("  NG:", m); };

// ---- 育ち：強化と役の解放 ----
let meta = MT.defaultMeta();
for (const u of MT.UPGRADES) meta.lv[u.id] = u.id === "cap" ? Math.min(u.costs.length, Number(args.cap || 0)) : Math.min(u.costs.length, Number(args.meta || 0));
meta.lv.cap = Math.min(9, Number(args.cap || 0));
if (args.unlock === "all") meta.combos = CB.ALL_COMBO_IDS.slice();

function spend() {
  // 素材で 買えるものを、決まった順に 買う
  for (let guard = 0; guard < 60; guard++) {
    let bought = false;
    for (const id of ["cap", "pow", "arm", "spd", "chg", "bolt"]) {
      const m = MT.buy(meta, id);
      if (m) { meta = m; bought = true; break; }
    }
    if (!bought) {
      const locked = CB.ALL_COMBO_IDS.filter((id) => !meta.combos.includes(id)).sort((a, b) => CB.comboCost(a) - CB.comboCost(b));
      for (const id of locked) { const m = MT.buyCombo(meta, id); if (m) { meta = m; bought = true; break; } }
    }
    if (!bought) break;
  }
}

// ---- マガジン：盤に つめる ----
let board = new PZ.Board(...MT.boardSize(meta));
function loadScore(list) {
  const ev = CB.evalCombos(list, meta.combos);
  return list.reduce((s, a) => s + a.dmg * (1 + ev.mods.dmgAll + (ev.mods.dmg[a.kind] || 0)), 0) + ev.mods.lives * 600 + ev.mods.shield * 250;
}
function refill() {
  const size = MT.boardSize(meta);
  if (board.w !== size[0] || board.h !== size[1]) board = board.resized(size[0], size[1]).board;
  const cands = FILES.map(mkAmmo);
  board = PZ.autoPack(board, cands, loadScore).b;
  return board.ammos();
}

let plan = null, planAt = -99;
const noise = ((seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; })(12345);
function bot(g) {
  if (args.human && plan && frames - planAt < 9) return { ...plan, dash: false, shoot: true, charge: plan.charge && !(g.p.ch && g.p.ch.ready) };
  planAt = frames;
  const p = g.p, B = g.bullets, b = g.boss;
  const near = [];
  for (let i = 0; i < B.n; i++) {
    if (Math.abs(B.x[i] - p.x) < 16 && Math.abs(B.z[i] - p.z) < 16 && Math.abs(B.y[i] - p.y) < 12) near.push(i);
  }
  const T = [0.06, 0.14, 0.24, 0.36, 0.5];
  const cands = [];
  for (const dy of [0, -1, 1]) {
    cands.push([0, 0, dy]);
    for (let k = 0; k < 16; k++) cands.push([Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8), dy]);
  }
  const rooted = p.rootT > 0 || p.recoil > 0;
  const band = sim.weakBand(g);
  const speed = C.PLAYER_SPEED * (1 + g.mods.speed) * (p.ch ? Math.min(1, p.ch.slow + g.mods.chargeSlow) : 1);
  const climb = C.CLIMB_SPEED * (1 + g.mods.speed + g.mods.climb);
  let best = null, bestCost = Infinity, stayCost = 0;
  for (const [cx, cz, dy] of cands) {
    const moving = cx !== 0 || cz !== 0 || dy !== 0;
    if (rooted && moving) continue;
    const v = (cx !== 0 || cz !== 0) ? speed : 0;
    const vy = dy * climb;
    let cost = moving ? 0.4 : 0;
    for (const t of T) {
      const px = p.x + cx * v * t, pz = p.z + cz * v * t, py = Math.max(C.Y_MIN, Math.min(C.Y_MAX, p.y + vy * t));
      const dB = Math.hypot(px - b.x, py - b.y, pz - b.z);
      if (dB < C.MIN_DIST + 0.8) cost += 30;
      const od = Math.hypot(px, pz);
      if (od > C.ARENA_R - 2) cost += 40 + (od - (C.ARENA_R - 2)) * 30;
      for (const i of near) {
        const tt = Math.max(0, t - B.hold[i]);
        const bx = B.x[i] + B.vx[i] * tt, by = B.y[i] + B.vy[i] * tt, bz = B.z[i] + B.vz[i] * tt;
        const d = Math.hypot(px - bx, pz - bz, py - by);
        const th = B.r[i] + C.PLAYER_R + 0.55;
        if (d < th) cost += d < B.r[i] + C.PLAYER_R + 0.2 ? 2000 : (th - d) * (th - d) * 80;
      }
      for (const L of g.lasers) {
        const wa = L.warn > 0 ? L.warn : 0;
        if (wa > 0.5) continue;
        const ang = L.ang + (L.warn > 0 ? 0 : L.spin * t);
        const ex = Math.sin(ang) * L.len, ez = Math.cos(ang) * L.len;
        const u = Math.max(0, Math.min(1, ((px - L.x) * ex + (pz - L.z) * ez) / (ex * ex + ez * ez)));
        const d = Math.hypot(px - (L.x + ex * u), pz - (L.z + ez * u));
        if (d < L.w * 0.5 + 0.9 && Math.abs(py - L.y) < L.h + 0.7) cost += wa > 0 ? 60 : 1500;
      }
      for (const c of g.pillars) {
        if (c.warn > 0.5) continue;
        if (Math.hypot(px - c.x, pz - c.z) < c.r + 0.9) cost += c.warn > 0 ? 80 : 1500;
      }
      for (const m of g.marks) if (m.life < 0.45 && Math.hypot(px - m.x, pz - m.z) < m.r + 0.8) cost += 400;
    }
    // 好みの位置：ボスから 18 くらい。弱点の高さにいたい
    const d3 = Math.hypot(p.x + cx * v * 0.3 - b.x, p.y + vy * 0.3 - b.y, p.z + cz * v * 0.3 - b.z);
    cost += 0.02 * (d3 - 18) * (d3 - 18);
    const py1 = Math.max(C.Y_MIN, Math.min(C.Y_MAX, p.y + vy * 0.3));
    cost += 0.01 * (py1 - 12) * (py1 - 12);
    if (!args.noweak && b.weak) {
      const want = b.weak === "high" ? band.up + 0.5 : b.weak === "low" ? band.down - 0.5 : b.y;
      const off = b.weak === "high" ? Math.max(0, want - py1) : b.weak === "low" ? Math.max(0, py1 - want) : Math.max(0, Math.abs(py1 - want) - 0.8);
      cost += 0.35 * off;
    }
    if (!moving) stayCost = cost;
    if (cost < bestCost) { bestCost = cost; best = [cx, cz, dy]; }
  }
  if (!best) best = [0, 0, 0];
  if (args.human) { const j = (noise() - 0.5) * 0.9, c = Math.cos(j), sn = Math.sin(j); best = [best[0] * c - best[1] * sn, best[0] * sn + best[1] * c, best[2]]; }
  const inp = sim.inputFromWorld(g, best[0], best[2], best[1]);
  inp.lock = true;
  inp.shoot = true;
  inp.dash = stayCost > 1500 && bestCost < stayCost * 0.5 && p.dashCd <= 0;

  // 溜める：安全なときだけ。溜まったら、すぐ放す
  const cur = sim.currentAmmo(g);
  const bomb = g.shots.find((s) => s.k === "bomb" && s.manual && !s.dead);
  inp.charge = !args.nocannon && !!cur && bestCost < 60 && !(p.ch && p.ch.ready) && !bomb;
  if (bomb) {
    // 集束弾：まわりに弾が多ければ起爆。そうでなければボスまで
    let around = 0;
    for (let i = 0; i < B.n; i++) if (Math.hypot(B.x[i] - bomb.x, B.y[i] - bomb.y, B.z[i] - bomb.z) < bomb.rad) around++;
    if (around >= 12 && !g.p.prevCharge) inp.charge = true;
  }
  if (!args.nocannon && b.phase && !p.ch && g.mag.length) {
    // 体力が残っているうちは いちばん強い砲を、すくなければ いちばん弱い砲を
    const ratio = b.hp / b.hpMax;
    let pick = null, pv = 0;
    for (const k of KIND_ORDER) {
      const top = sim.kindList(g, k)[0];
      if (!top) continue;
      const better = !pick || (ratio > 0.5 ? top.dmg > pv : top.dmg < pv);
      if (better) { pick = k; pv = top.dmg; }
    }
    if (pick && pick !== g.kindSel) sim.selectKind(g, pick);
  }
  plan = inp;
  return inp;
}

// ---- はじまり ----
const startMag = args.hand === "none" ? [] : refill();
const g = sim.createGame({ seed: Number(args.seed || 1), difficulty: diff, practice: !!args.practice, stage: from, bossBase: folderBoss ? folderBoss.base : null, loadout: startMag, unlocked: meta.combos, metaFx: MT.metaFx(meta) });
const evCount = {};
let frames = 0, maxBullets = 0, maxMs = 0, totalMs = 0;
const fired = new Set();
let phaseStart = 0;
const DT = 1 / 60;
const report = [];
let weakHits = 0, hits = 0;
const describe = () => `盤 ${board.w}×${board.h}（${board.used()}/${board.size}マス ${g.mag.length}個）役 ${g.combos.length} ライフ ${g.p.hpMax} 強化 ${Object.values(meta.lv).join("")}`;
if (args.verbose || args.hand) console.log("はじめ:", describe(), "役:", g.combos.map((c) => c.name).join("、") || "なし");

while (frames < 60 * 60 * 60) {
  const inp = bot(g);
  const t0 = performance.now();
  sim.update(g, DT, inp);
  const ms = performance.now() - t0;
  totalMs += ms; maxMs = Math.max(maxMs, ms); frames++;
  maxBullets = Math.max(maxBullets, g.bullets.n);
  const p = g.p, b = g.boss;
  if (!Number.isFinite(p.x + p.y + p.z + p.yaw + p.pitch + b.x + b.y + b.z + b.hp + g.score)) { fail(`NaN: p=(${p.x},${p.y},${p.z}) boss=(${b.x},${b.y},${b.z}) hp=${b.hp}`); break; }
  if (Math.hypot(p.x, p.z) > C.ARENA_R + 0.01) fail("場の外に出た");
  if (p.y < C.Y_MIN - 1e-6 || p.y > C.Y_MAX + 1e-6) fail("高さの外に出た");
  if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < C.MIN_DIST - 0.05) fail("ボスに近づきすぎた");
  if (args.trace && g.mode === "fight" && frames % 600 === 0) console.log(`    t=${g.t.toFixed(0)} 面${g.stage} P${g.phaseIdx + 1} hp=${b.hp.toFixed(0)}/${b.hpMax} left=${b.left.toFixed(0)} 高さ=${p.y.toFixed(1)} ボス=(${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)}) 弱点=${b.weak} 種類=${g.kindSel} 弾=${g.bullets.n} 持ち=${g.mag.length} ライフ=${p.hp}`);
  for (const e of g.events.splice(0)) {
    evCount[e.t] = (evCount[e.t] || 0) + 1;
    if (e.t === "fire") fired.add(e.ammo.kind);
    if (e.t === "hit") { hits++; if (e.weak) weakHits++; }
    if (e.t === "phase" && args.verbose) console.log(`  [${g.t.toFixed(1)}s] 第${g.stage}面 ${e.name} hp=${e.hpMax} 残りライフ${g.p.hp} 弾${g.bullets.n}`);
    if (e.t === "phaseClear") report.push(`面${g.stage} フェーズ${g.phaseIdx + 1} 撃破 ${(g.t - phaseStart).toFixed(0)}s`);
    if (e.t === "phaseTimeout") report.push(`面${g.stage} フェーズ${g.phaseIdx + 1} 時間切れ`);
    if (e.t === "phase") phaseStart = g.t;
  }
  if (g.mode === "clear" || g.mode === "over") {
    const sm = sim.summary(g);
    const got = MT.rewards({ stage: g.stage, diff, phases: sm.phases, phaseCount: sm.phaseCount, cleared: sm.cleared, noMiss: sm.noMiss });
    if (args.progress) { meta = MT.addMats(meta, got); }
    if (g.mode === "over") { console.log(`第${g.stage}面 ゲームオーバー ${g.t.toFixed(0)}s 被弾${g.stats.hits} 与ダメ${Math.round(g.stats.dmg)}　素材 ${MT.matsText(got) || "なし"}`); break; }
    console.log(`第${g.stage}面 クリア ${g.t.toFixed(0)}s ライフ${g.p.hp}/${g.p.hpMax} 被弾${g.stats.hits} かすり${g.graze} 与ダメ${Math.round(g.stats.dmg)} 弱点${Math.round(g.stats.weakDmg)} 砲${g.stats.fired.length}発 スコア${g.score}　素材 ${MT.matsText(got)}`);
    if (g.stage >= from + stages - 1) break;
    // 次の面：使った弾を盤から外して、新しい弾を つめなおす。育ちを 反映
    for (const piece of board.list()) if (!g.mag.some((a) => a.uid === piece.ammo.uid)) board.remove(piece.id);
    if (args.progress) spend();
    g.mag = args.hand === "none" ? [] : refill();
    g.unlocked = new Set(meta.combos);
    g.metaFx = MT.metaFx(meta);
    sim.startStage(g, g.stage + 1);
    if (args.verbose) console.log("  つぎ:", describe());
  }
}

console.log(report.join(" / "));
console.log(`フレーム${frames} 最大弾数${maxBullets} 1コマ平均${(totalMs / frames).toFixed(3)}ms 最大${maxMs.toFixed(2)}ms　弱点に当てた ${hits ? Math.round((weakHits / hits) * 100) : 0}%`);
console.log("撃った砲:", [...fired].sort().join(","), " イベント:", JSON.stringify(evCount));
if (args.progress) console.log("強化:", JSON.stringify(meta.lv), "役:", meta.combos.length, "素材:", JSON.stringify(meta.mats));
if (errors.length) { console.log(`NG ${errors.length}件`); process.exit(1); }
console.log("OK");
