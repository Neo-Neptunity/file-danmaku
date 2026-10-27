// ファイル弾幕 — ファイルを弾にして、3D の弾幕ボスに撃ちこむ。大きいファイルほど、ロマン砲。
// ファイルには一切さわらない：読むのはフォルダの中の名前・種類・大きさだけで、書き換え・移動・削除は一度もしない。
// 視点は一人称。マウスを動かして見る向きを変える（ポインターを固定する）。キーの割り当ては、武器庫と中断の画面で変えられる。
import { createGame, update, selectKind, cycleKind, cycleFile, summary, basisOf } from "./sim.js";
import { KINDS, KIND_ORDER, TIERS, fmtSize } from "./ammo.js";
import { createRenderer } from "./render.js";
import { drawScene, buildGrid, cameraOf } from "./scene.js";
import { scanThreats } from "./threat.js";
import { createHud } from "./hud.js";
import { Particles } from "./fx.js";
import { createAudio } from "./audio.js";
import { createUi } from "./ui.js";
import { BULLET_COLORS, DIFFS } from "./stages.js";
import { Controls, normalizeBindings, normalizeLook, tokenLabel } from "./keys.js";
import { normalizeMeta, defaultMeta, rewards, addMats, metaFx } from "./meta.js";
import { conquestMult, conquered, exploreFolders, parentOf } from "./folderboss.js";
import { clamp } from "./math.js";

const ep = window.explorerPlus;

// ---- 状態 ----------------------------------------------------------------
await ep.ready();
let s = await ep.settings.get();
// 進行度。conquest は 制覇したフォルダ（場所 → { S 格, clears 回数, best, at }）
const freshRec = () => ({ best: 0, bestStage: 1, reached: 1, biggest: null, plays: 0, diff: "normal", stage: 1, conquest: {} });
const rec = Object.assign(freshRec(), await ep.storage.get("rec"));
if (!rec.conquest || typeof rec.conquest !== "object") rec.conquest = {};
let meta = normalizeMeta(await ep.storage.get("meta"));
let bindings = normalizeBindings(await ep.storage.get("bind"));
let look = normalizeLook(await ep.storage.get("look"));
const save = (key, v) => ep.storage.set(key, v).catch(() => {});
const saveRec = () => save("rec", rec);
const controls = new Controls(bindings);

let folder = null;
let g = null;                       // 遊んでいるゲーム
let run = null;                     // 出撃ひとまとまり：{ score, deficit }。面をまたいで続く
let carry = null;                   // 次の面へ持ち越すもの { stage, score, deficit }
let sortie = null;                  // 出撃したときの装填：{ ammos, snapshot }
let scene = "armory";               // "armory" | "play"
let paused = false, resultShown = false;
let lockFailed = false;             // ポインターを固定できない環境では、固定なしで遊ぶ

const app = document.body;
app.id = "app";
const ui = createUi(app, {
  openFolder: (e) => ep.open({ id: e.id, path: e.path }).catch((err) => ui.setMsg(`開けませんでした：${err.message}`)),
  up: () => ep.navigateUp().catch((err) => ui.setMsg(`上へ行けませんでした：${err.message}`)),
  find,
  prefs: (p) => { Object.assign(rec, p); saveRec(); },
  start: (o) => beginRun(o),
  explore,
  stopExplore,
  metaChanged: (m) => { meta = m; save("meta", meta); },
  bindingsChanged: (b) => { bindings = b; controls.set(b); controls.clear(); save("bind", bindings); },
  lookChanged: (l) => { look = l; save("look", look); },
});
ui.setPrefs({ bindings, look });
ui.setMeta(meta);

const renderer = (() => { try { return createRenderer(ui.elements.gl); } catch (err) { console.error("WebGL2", err); return null; } })();
if (!renderer) {
  ui.fatal("この環境では、3D の表示を始められませんでした。");
  throw new Error("webgl2 unavailable");
}
renderer.setGrid(buildGrid());
const hud = createHud(ui.elements.hud);
const fx = new Particles();
const audio = createAudio();

const size = { w: 1, h: 1 };
const view = { t: 0, shake: 0, bossFlash: 0, glow: true, shadows: true, fov: 80, mode: "attract", fx };
const hudState = {
  t: 0, threat: null, warn: true, popups: [], banner: null, spell: null, cutin: null, comboCard: null, flash: 0, hurt: 0, hint: 0, hints: [], bossPx: 40,
  project: (x, y, z) => renderer.project(x, y, z),
  projectEdge, keyLabel: (i) => labelOf(`kind${i + 1}`), keyOf: (a) => labelOf(a),
};
const tally = { basic: 0, big: 0, bt: 0, gt: 0, pos: null, rgb: null, basicWeak: false, bigWeak: false };
let lastRgb = [1, 0.9, 0.4];

// 武器庫の背で回っている、止めたままのゲーム
const attract = createGame({ stage: 1, seed: 7 });
attract.mode = "fight";

// ---- 設定 ----------------------------------------------------------------
function applySettings() {
  audio.configure({ sfx: s.sound !== false, bgm: s.bgm !== false, volume: (s.volume ?? 60) / 100 });
  view.glow = s.quality !== "light";
  view.shadows = s.quality !== "light";
  view.fov = s.fov ?? 80;
  resize();
}
ep.onSettings((next) => { s = next; applySettings(); });

function resize() {
  const r = app.getBoundingClientRect();
  const ratio = s.quality === "light" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  size.w = r.width; size.h = r.height;
  renderer.resize(r.width, r.height, ratio);
  hud.resize(r.width, r.height, ratio);
}
new ResizeObserver(resize).observe(app);

// ---- 操作の説明：いまの割り当てを、そのまま出す --------------------------------------
const labelOf = (action) => {
  const l = (bindings[action] || []).map(tokenLabel);
  return l.length ? l.join(" か ") : "未設定";
};
function hintLines() {
  const mv = ["moveF", "moveL", "moveB", "moveR"].map((a) => (bindings[a] && bindings[a][0] ? tokenLabel(bindings[a][0]) : "未設定")).join(" ");
  return [
    `移動　${mv}　　上昇　${labelOf("up")}　　下降　${labelOf("down")}　　ダッシュ　${labelOf("dash")}　　精密移動　${labelOf("focus")}`,
    `見る向き　マウス　　ボスのほうを向く　${labelOf("lock")}　　一人称と三人称　${labelOf("view")}`,
    `ショット　${look.autoFire !== false ? "自動" : labelOf("shoot")}　　溜めて撃つ　${labelOf("charge")}　押したまま溜めて、放すと発射`,
    `弾の種類　${labelOf("kind1")} から ${labelOf("kind8")}　　前後　${labelOf("kindPrev")} と ${labelOf("kindNext")}　　同じ種類の次のファイル　${labelOf("fileNext")}`,
    `弱点の向きから当てると 1.8 倍。左の高度計の金色が、弱点の高さ`,
    `中断　Esc`,
  ];
}

// ---- 武器庫 ---------------------------------------------------------------
function openArmory(o = {}) {
  scene = "armory";
  paused = false;
  releasePointer();
  audio.bgmStop();
  ui.setRecord(rec);
  ui.openArmory({ reached: rec.reached, diff: rec.diff, rec, practice: !!s.practice, stage: o.stage ?? rec.stage, ...o });
}

// 下の階層をさがす。条件は 武器庫のしぼりこみから決まる（filelist.js の searchQueryOf）
async function find(query, defaulted = false) {
  if (!folder) return;
  ui.setSearching(true);
  try {
    const r = await ep.search.find({ id: folder.id, path: folder.path }, query, { limit: 5000 });
    ui.setFound(r.entries, r.truncated, defaulted);
  } catch (err) {
    ui.setSearching(false);
    ui.setMsg(`さがせませんでした：${err.message}`);
  }
}

// 挑めるフォルダを さがす。いま開いているフォルダから 下へ、浅いほうから（folderboss.js の exploreFolders）。
// 数えるのは search.stats、子のフォルダは search.find。大きなフォルダでは 時間がかかるので、押されたときだけ。やめられる
let exploring = null;
async function explore() {
  if (!folder) return;
  if (exploring) exploring.cancelled = true;
  const job = { cancelled: false }, base = folder;
  exploring = job;
  const ref = (f) => ({ id: f.id, path: f.path });
  const node = (e) => ({ id: e.id, name: e.name, path: e.path, parentPath: parentOf(e.path) });
  ui.setExplore(base.path, { state: "running", nodes: [], visited: 0, stoppedBy: "", truncatedAny: false });
  try {
    const r = await exploreFolders({
      base: { id: base.id, name: base.name, path: base.path, parentPath: base.parentPath },
      reached: rec.reached,
      stats: (f) => ep.search.stats(ref(f)),
      children: async (f, depth) => {
        if (depth === 0) return base.entries.filter((e) => e.kind === "folder" && !e.hidden).map(node);       // いま開いている所の 子は、もう手元にある
        const found = await ep.search.find(ref(f), { kind: "folder", hidden: false }, { depth: 1, limit: 500 });
        return found.entries.map(node);
      },
      cancelled: () => job.cancelled,
      onProgress: (p) => ui.setExplore(base.path, { state: "running", nodes: p.nodes.slice(), visited: p.visited }),
    });
    ui.setExplore(base.path, { state: "done", nodes: r.nodes, visited: r.visited, stoppedBy: r.stoppedBy, truncatedAny: r.truncatedAny });
  } catch (err) {
    ui.setExplore(base.path, { state: "done", stoppedBy: "cancel" });
    ui.setMsg(`さがせませんでした：${err.message}`);
  } finally {
    if (exploring === job) exploring = null;
  }
}
function stopExplore() { if (exploring) exploring.cancelled = true; }

ep.onFolder((f) => {
  if (exploring && (!folder || folder.path !== f.path)) exploring.cancelled = true;       // 別の場所へ移ったら、さがすのは やめる
  folder = f;
  ui.setFolder(f);
});

// ---- ポインター固定 -------------------------------------------------------------
// マウスの加速を切った生の動きを先に頼み、だめなら ふつうに頼む
async function lockPointer() {
  if (document.pointerLockElement === app) return;
  const ask = (o) => { try { return Promise.resolve(app.requestPointerLock(o)); } catch (err) { return Promise.reject(err); } };
  try { await ask({ unadjustedMovement: true }); }
  catch {
    try { await ask(); } catch {
      lockFailed = true;
      if (scene === "play") hudState.spell = { text: "ポインターを固定できません。矢印キーでも見る向きを変えられます", t: 0, dur: 4 };
    }
  }
}
function releasePointer() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* 固定していない */ }
}
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === app) { lockFailed = false; return; }
  if (scene === "play" && !paused && !resultShown && !lockFailed) togglePause(true);
});
document.addEventListener("pointerlockerror", () => { lockFailed = true; });

// ---- 出撃 ------------------------------------------------------------------
// boss：フォルダのボス（folderboss.js の folderBoss の結果）。なければ ふつうの面
function beginRun({ ammos, snapshot, stage, diff, boss = null }) {
  rec.diff = diff; if (!boss) rec.stage = stage; saveRec();
  sortie = { ammos: ammos.map((a) => ({ ...a })), snapshot, boss };
  run = !boss && carry && carry.stage === stage ? { score: carry.score, deficit: carry.deficit } : { score: 0, deficit: 0 };
  carry = null;
  beginStage(stage, ammos, diff);
}

function beginStage(stage, ammos, diff) {
  audio.unlock();
  g = createGame({
    seed: (Math.random() * 4294967296) >>> 0, difficulty: diff, practice: !!s.practice, stage, deficit: run.deficit,
    bossBase: sortie && sortie.boss ? sortie.boss.base : null,
    loadout: ammos.map((a) => ({ ...a })), unlocked: meta.combos, metaFx: metaFx(meta), assist: look.assist, autoTurn: look.autoTurn,
  });
  g.score = run.score;
  scene = "play";
  paused = false;
  resultShown = false;
  fx.clear();
  hudState.popups.length = 0;
  hudState.banner = hudState.spell = hudState.cutin = hudState.comboCard = null;
  hudState.hint = 1;
  hudState.hints = hintLines();
  view.shake = 0; view.bossFlash = 0; hudState.flash = 0; hudState.hurt = 0;
  tally.basic = tally.big = 0; tally.basicWeak = tally.bigWeak = false;
  controls.clear(); look_.x = look_.y = 0;
  ui.closeArmory();
  ui.closeOverlay();
  audio.bgmStart(stage);
  lockPointer();
}

function finishRun(cleared) {
  resultShown = true;
  releasePointer();
  audio.bgmStop();
  const sm = summary(g);
  sm.cleared = cleared;
  sm.newBest = sm.score > rec.best;
  // フォルダのボスなら、倒しなおしは 素材がへる。制覇は 場所ごとに 覚える
  const fboss = sortie && sortie.boss, fpath = fboss ? fboss.base.info.path : null;
  sm.mult = fboss ? conquestMult(rec.conquest[fpath], g.stage) : 1;
  sm.rewards = rewards({ stage: g.stage, diff: g.diff.id, phases: sm.phases, phaseCount: sm.phaseCount, cleared, noMiss: sm.noMiss, mult: sm.mult });
  meta = addMats(meta, sm.rewards);
  save("meta", meta);
  ui.setMeta(meta);
  rec.plays++;
  if (sm.newBest) rec.best = sm.score;
  rec.bestStage = Math.max(rec.bestStage, g.stage);
  rec.reached = Math.max(rec.reached, cleared ? g.stage + 1 : g.stage);
  if (sm.biggest && (!rec.biggest || sm.biggest.dmg > rec.biggest.dmg)) rec.biggest = sm.biggest;
  if (cleared && !fboss) rec.stage = g.stage + 1;
  if (cleared && fboss) rec.conquest[fpath] = conquered(rec.conquest[fpath], g.stage, sm.score);
  saveRec();
  ui.setRecord(rec);
  const left = new Set(g.mag.map((a) => a.uid));
  ui.result(sm, (act) => {
    if (act === "next") {
      carry = { stage: g.stage + 1, score: g.score, deficit: Math.max(0, g.p.hpMax - g.p.hp - 1) };     // 減った分は、面のおわりに 1つ回復
      openArmory({ keep: left, stage: g.stage + 1 });
    } else if (act === "retry") {
      carry = null;
      beginRun({ ammos: sortie.ammos, snapshot: sortie.snapshot, stage: g.stage, diff: g.diff.id, boss: sortie.boss });
    } else {
      carry = null;
      const next = fboss ? rec.stage : g.stage + 1, back = fboss ? rec.stage : g.stage;
      if (cleared) openArmory({ keep: left, stage: next });
      else openArmory({ snapshot: sortie.snapshot, stage: back });
    }
  });
}

function togglePause(on = !paused) {
  if (scene !== "play" || resultShown || on === paused) return;
  paused = on;
  controls.clear(); look_.x = look_.y = 0;
  audio.chargeStop();
  if (paused) {
    releasePointer();
    ui.pause(hintLines, (act) => {
      if (act === "resume") togglePause(false);
      else { carry = null; openArmory({ snapshot: sortie.snapshot, stage: sortie.boss ? rec.stage : g.stage }); }
    });
  } else {
    ui.closeOverlay();
    lockPointer();
  }
}

// ---- 入力 ------------------------------------------------------------------
const look_ = { x: 0, y: 0 };           // マウスの動きの たまり
let dashEdge = false;
const playing = () => scene === "play" && !paused && !resultShown && g;

function pulse(action) {
  if (action === "dash") dashEdge = true;
  else if (action === "kindNext") cycleKind(g, 1);
  else if (action === "kindPrev") cycleKind(g, -1);
  else if (action === "fileNext") cycleFile(g);
  else if (action === "pause") togglePause(true);
  else if (action === "view") {
    look = { ...look, view: look.view === "first" ? "third" : "first" };
    save("look", look);
    ui.setPrefs({ look });
    hudState.spell = { text: look.view === "first" ? "一人称" : "三人称", t: 0, dur: 1 };
  } else {
    const m = /^kind(\d)$/.exec(action);
    if (m) selectKind(g, KIND_ORDER[Number(m[1]) - 1]);
  }
}
const press = (token, repeat = false) => {
  const acts = controls.press(token);
  if (!repeat) for (const a of acts) pulse(a);
};

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (scene !== "play") return;
  if (e.code === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
  if (!playing()) return;
  if (controls.map.has(e.code)) e.preventDefault();
  press(e.code, e.repeat);
});
window.addEventListener("keyup", (e) => controls.release(e.code));
window.addEventListener("blur", () => { controls.clear(); if (scene === "play") togglePause(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "play") togglePause(true); });

window.addEventListener("mousedown", (e) => {
  if (!playing()) return;
  e.preventDefault();
  window.focus();
  if (document.pointerLockElement !== app && !lockFailed) { lockPointer(); return; }     // 最初の 1回は、固定のためだけ
  press(`Mouse${e.button}`);
});
window.addEventListener("mouseup", (e) => controls.release(`Mouse${e.button}`));
window.addEventListener("contextmenu", (e) => { if (scene === "play") e.preventDefault(); });
window.addEventListener("mousemove", (e) => {
  if (!playing()) return;
  if (document.pointerLockElement !== app && !lockFailed) return;
  look_.x += e.movementX || 0;
  look_.y += e.movementY || 0;
}, { passive: true });
window.addEventListener("wheel", (e) => {
  if (!playing()) return;
  e.preventDefault();
  for (const a of controls.map.get(e.deltaY > 0 ? "WheelDown" : "WheelUp") || []) pulse(a);
}, { passive: false });

function readInput(first) {
  const c = controls;
  const inp = {
    ix: c.axis("moveL", "moveR"), iz: c.axis("moveB", "moveF"), iy: c.axis("down", "up"),
    lookX: c.axis("lookL", "lookR"), lookY: c.axis("lookD", "lookU"),
    lock: c.held("lock"), focus: c.held("focus"), shoot: look.autoFire !== false || c.held("shoot"), charge: c.held("charge"), dash: false,
  };
  if (first) {
    // 1コマぶんの動きを、1度だけ渡す。急な動きで 飛ばないように 上限をつける
    inp.turnYaw = clamp(look_.x * look.sens, -0.9, 0.9);
    inp.turnPitch = clamp(-look_.y * look.sens * (look.invertY ? -1 : 1), -0.9, 0.9);
    look_.x = look_.y = 0;
    if (dashEdge) { inp.dash = true; dashEdge = false; }
  }
  return inp;
}

// ---- 出来事 → 音と見た目 -------------------------------------------------------
const calm = () => !!s.calm;
const shake = (v) => { view.shake = Math.max(view.shake, calm() ? v * 0.25 : v); };
const flash = (v) => { if (!calm()) hudState.flash = Math.max(hudState.flash, v); };
const comma = (n) => Math.round(n).toLocaleString("en-US");

function popup(x, y, z, dmg, big, rgb, weak = false) {
  if (hudState.popups.length > 40) hudState.popups.shift();
  hudState.popups.push({ x, y, z, dx: (Math.random() - 0.5) * 50, dmg, big, rgb, weak, t: 0, dur: big ? 1.3 : 0.9 });
}

function handleEvents() {
  for (const e of g.events.splice(0)) {
    switch (e.t) {
      case "stage":
        hudState.banner = { title: e.label || `第${e.n}面`, sub: `${e.name}　${e.title}`, color: g.bossDef.color, t: 0, dur: 3 };
        break;
      case "phase":
        hudState.spell = { text: e.name, t: 0, dur: 3.4 };
        audio.phase();
        audio.bgmLevel(0.25 + 0.55 * (e.idx / Math.max(1, e.count - 1)));
        break;
      case "bolt": audio.bolt(); break;
      case "hit": {
        const gold = [1, 0.85, 0.25];
        if (e.cannon) {
          if (e.dmg >= 30) {
            popup(e.x, e.y, e.z, e.dmg, true, lastRgb, e.weak);
            fx.burst(e.x, e.y, e.z, clamp(8 + e.dmg / 40, 8, 90) | 0, 10 + Math.log10(e.dmg + 1) * 4, e.weak ? gold : lastRgb, 0.9, 0.7);
            view.bossFlash = 1;
            audio.hit();
          } else { tally.big += e.dmg; tally.bigWeak = tally.bigWeak || e.weak; tally.pos = e; tally.rgb = lastRgb; fx.burst(e.x, e.y, e.z, 1, 8, e.weak ? gold : lastRgb, 0.6, 0.4); }
        } else {
          tally.basic += e.dmg; tally.basicWeak = tally.basicWeak || e.weak; tally.pos = e;
          fx.burst(e.x, e.y, e.z, e.weak ? 4 : 2, 7, e.weak ? gold : [0.5, 1, 1], e.weak ? 0.6 : 0.45, 0.3);
          view.bossFlash = Math.max(view.bossFlash, e.weak ? 0.5 : 0.3);
          audio.hit();
        }
        break;
      }
      case "guard": fx.burst(e.x, e.y, e.z, 1, 6, [0.7, 0.8, 1], 0.4, 0.2); audio.guard(); break;
      case "fire": {
        const a = e.ammo, k = KINDS[a.kind];
        lastRgb = k.rgb;
        audio.fire(a.tier);
        shake(0.08 * a.tier);
        if (a.tier >= 3) flash(0.12 * (a.tier - 2));
        fx.burst(e.x + e.dx * 1.2, e.y + (e.dy || 0) * 1.2, e.z + e.dz * 1.2, 20 + a.tier * 14, 8 + a.tier * 3, k.rgb, 0.9 + a.tier * 0.2, 0.8);
        if (a.tier >= 2) {
          hudState.cutin = {
            title: a.tier >= 3 ? `${TIERS[a.tier].name}　発射！` : TIERS[a.tier].name, tier: a.tier, color: k.rgb,
            name: a.name, size: fmtSize(a.bytes), dmg: a.dmg, t: 0, dur: [0, 0, 0.9, 1.2, 1.8, 2.2][a.tier],
          };
        }
        break;
      }
      case "boom":
        audio.boom(e.r);
        shake(Math.min(0.5, e.r * 0.03));
        fx.burst(e.x, e.y, e.z, clamp(e.r * 6, 10, 90) | 0, 6 + e.r * 1.4, lastRgb, 0.8 + e.r * 0.08, 0.9);
        break;
      case "pop": {
        if (fx.n < 1800) { const c = BULLET_COLORS[e.col]; fx.burst(e.x, e.y, e.z, 2, 3.5, c, 0.5, 0.45); }
        audio.pop();
        break;
      }
      case "graze": fx.burst(g.p.x, g.p.y, g.p.z, 3, 5, [1, 0.9, 0.4], 0.3, 0.25, { kind: 3 }); audio.graze(); break;
      case "hurt":
        audio.hurt();
        shake(0.6);
        hudState.hurt = e.practice ? 0.4 : 1;
        fx.burst(e.x, e.y, e.z, 60, 14, [1, 0.35, 0.4], 1.0, 0.9);
        break;
      case "dash": audio.dash(); fx.burst(e.x, e.y, e.z, 12, 5, [0.6, 0.95, 1], 0.5, 0.35); break;
      case "select": audio.select(); break;
      case "deny": audio.deny(); break;
      case "combos": hudState.comboCard = { list: e.list, missed: e.missed, t: 0, dur: 5.5 }; break;
      case "weakWarn": audio.weakWarn(); break;
      case "weak": audio.weak(); fx.burst(g.boss.x, g.boss.y, g.boss.z, 24, 8, [1, 0.85, 0.25], 0.8, 0.7); break;
      case "shield": audio.shield(); shake(0.3); fx.burst(e.x, e.y, e.z, 40, 10, [0.5, 0.95, 1], 0.8, 0.6); hudState.spell = { text: "バリアが 1回 受けた", t: 0, dur: 1.6 }; break;
      case "dome": audio.dome(); break;
      case "detonate": audio.boom(6); shake(0.2); break;
      case "launch": audio.launch(); break;
      case "chargeStart": audio.chargeStart(e.ammo.tier); break;
      case "chargeReady": audio.chargeReady(); break;
      case "chargeCancel": audio.chargeCancel(); break;
      case "phaseClear":
        audio.phaseClear();
        hudState.spell = { text: `撃破　+${comma(e.bonus)}${e.noMiss ? "　ノーミス" : ""}`, t: 0, dur: 2.6 };
        fx.burst(e.x, e.y, e.z, 200, 22, e.color, 1.3, 1.4);
        fx.burst(e.x, e.y, e.z, 80, 14, [1, 1, 1], 1.0, 1.0);
        shake(0.5); flash(0.35);
        break;
      case "phaseTimeout": hudState.spell = { text: "時間切れ", t: 0, dur: 2 }; break;
      case "stageClear":
        audio.stageClear();
        audio.bgmStop();
        fx.burst(e.x, e.y, e.z, 400, 30, e.color, 1.6, 2.2);
        fx.burst(e.x, e.y, e.z, 150, 20, [1, 1, 1], 1.2, 1.6);
        shake(0.9); flash(0.7);
        break;
      case "over": audio.over(); audio.bgmStop(); break;
    }
  }
}

// ---- 画面の座標 ---------------------------------------------------------------
// ボスが画面の外なら、その向き。画面の中なら { on: true }
function projectEdge(x, y, z) {
  if (!g) return null;
  const p = g.p, { f, r, u } = basisOf(p.yaw, p.pitch), cam = cameraOf(g, look.view, 0);
  const dx = x - cam.eye[0], dy = y - cam.eye[1], dz = z - cam.eye[2];
  const fwd = dx * f.x + dy * f.y + dz * f.z, lx = dx * r.x + dy * r.y + dz * r.z, ly = dx * u.x + dy * u.y + dz * u.z;
  const th = Math.tan((view.fov * Math.PI) / 360), asp = size.w / Math.max(1, size.h);
  if (fwd > 0.1 && Math.abs(lx / fwd) < th * asp * 0.94 && Math.abs(ly / fwd) < th * 0.94) return { on: true, x: 0, y: 0 };
  return { on: false, x: size.w / 2 + lx * 1000, y: size.h / 2 - (ly || -0.001) * 1000 };
}

// ---- 1コマ ------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  view.t += dt;
  hudState.t = view.t;

  view.shake *= Math.exp(-dt * 5);
  view.bossFlash *= Math.exp(-dt * 9);
  hudState.flash *= Math.exp(-dt * 4);
  hudState.hurt *= Math.exp(-dt * 2.5);

  let scn = attract;
  if (scene === "play" && g) {
    scn = g;
    view.mode = look.view;
    if (!paused) {
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < n; i++) {
        update(g, dt / n, readInput(i === 0));
        handleEvents();
      }
      fx.update(dt * (g.slowT > 0 ? g.slowScale : 1));
      if (g.p.ch) audio.chargeSet(g.p.ch.t / g.p.ch.need);
      for (const p of hudState.popups) p.t += dt;
      hudState.popups = hudState.popups.filter((p) => p.t < p.dur);
      for (const k of ["banner", "spell", "cutin", "comboCard"]) {
        if (hudState[k]) { hudState[k].t += dt; if (hudState[k].t >= hudState[k].dur) hudState[k] = null; }
      }
      hudState.hint = Math.max(0, hudState.hint - dt / 25);
      tally.bt += dt; tally.gt += dt;
      if (tally.bt > 0.4 && tally.basic > 0 && tally.pos) { popup(tally.pos.x, tally.pos.y, tally.pos.z, tally.basic, false, null, tally.basicWeak); tally.basic = 0; tally.basicWeak = false; tally.bt = 0; }
      if (tally.gt > 0.4 && tally.big > 0 && tally.pos) { popup(tally.pos.x, tally.pos.y, tally.pos.z, tally.big, true, tally.rgb, tally.bigWeak); tally.big = 0; tally.bigWeak = false; tally.gt = 0; }
      if (!resultShown) {
        if (g.mode === "clear" && g.modeT > 3.4) finishRun(true);
        else if (g.mode === "over" && g.modeT > 1.8) finishRun(false);
      }
    }
  } else {
    // 武器庫の背景：ボスのまわりを ゆっくり回る
    view.mode = "attract";
    const a = view.t * 0.12, p = attract.p, b = attract.boss;
    b.x = 0; b.y = 11; b.z = 0; b.state = "attack";
    p.x = Math.sin(a) * 16; p.z = Math.cos(a) * 16; p.y = 9 + Math.sin(a * 1.7) * 2;
    const dx = b.x - p.x, dy = b.y - p.y, dz = b.z - p.z;
    p.yaw = Math.atan2(dx, dz); p.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    fx.update(dt);
  }
  drawScene(renderer, scn, view);
  if (scene === "play" && g) {
    const b = g.boss, s0 = renderer.project(b.x, b.y, b.z);
    hudState.bossPx = s0 ? (b.r * size.h) / (2 * Math.tan((view.fov * Math.PI) / 360) * s0.w) : 40;
    // 危険の合図：画面に入っていない所から 当たりそうな弾
    hudState.warn = look.warn !== false;
    hudState.threat = hudState.warn && !paused ? scanThreats(g, cameraOf(g, look.view, 0), (view.fov * Math.PI) / 180, size.w / Math.max(1, size.h)) : null;
    if (hudState.threat && !paused) {
      if (hudState.threat.up > 0.45) audio.alert("up");
      else if (hudState.threat.down > 0.45) audio.alert("down");
    }
    hud.draw(g, hudState);
  } else hud.clear();
}

// ---- コマンド ---------------------------------------------------------------
// 進行度の初期化（デバッグ用）。消すのは ベスト・到達した面・最大の一撃・制覇したフォルダ・強化素材・強化・解放した役。
// 残すのは キーの割り当て・視点の設定・並べかたの選び・盤の弾。ファイルには 一切さわらない
async function resetProgress() {
  releasePointer();
  const text = "ゲームの進行度を すべて初期化します。ベスト・到達した面・最大の一撃・制覇したフォルダ・強化素材・強化・解放した役が 消えます。キー設定と ファイルには さわりません。";
  let ok = false;
  try { ok = ep.ui && ep.ui.confirm ? await ep.ui.confirm(text, { okLabel: "初期化する" }) : window.confirm(text); } catch { ok = false; }
  if (!ok) return false;
  const sort = rec.sort;
  for (const k of Object.keys(rec)) delete rec[k];
  Object.assign(rec, freshRec());
  if (sort) rec.sort = sort;
  meta = defaultMeta();
  carry = null; run = null; sortie = null;
  paused = false; resultShown = false;
  saveRec(); save("meta", meta);
  ui.setMeta(meta);
  ui.setRecord(rec);
  openArmory({ stage: 1 });
  try { await ep.ui.toast("進行度を初期化しました"); } catch { /* 出せなくても 初期化はできている */ }
  return true;
}

ep.commands.set([{ id: "armory", label: "武器庫にもどる" }, { id: "reset", label: "進行度を初期化", hint: "デバッグ用" }]).catch(() => {});
ep.onCommand((id) => {
  if (id === "armory") {
    if (scene === "play") { carry = null; openArmory({ snapshot: sortie.snapshot, stage: sortie.boss ? rec.stage : g.stage }); } else if (ui.armoryOpen) ui.openArmory({});
  } else if (id === "reset") resetProgress();
});

// 試験用：URL に ?debug を付けて読んだときだけ、中身を覗ける
if (new URL(import.meta.url).searchParams.has("debug")) window.__fd = () => ({ scene, paused, g, rec, meta, look, bindings, ui: ui.state, hudState, lockFailed });

applySettings();
ui.setRecord(rec);
openArmory({ stage: rec.stage, fresh: true });
if (folder) ui.setFolder(folder);
requestAnimationFrame(frame);
