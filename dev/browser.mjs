// 本物の index.js を、ヘッドレスの Edge で動かして、画面を撮る（偽の explorerPlus と、偽のポインターロックを渡す）。
//   使い方：node file-danmaku/dev/browser.mjs [出力フォルダ] [--scenario=名前] [--stage=3] [--reached=N] [--diff=hard] [--practice] [--rich] [--nolock] [--w=1280 --h=720]
//   出力フォルダに PNG を書く。コンソールのエラーも出す。Edge が無ければ Chrome を使う
//   --rich：素材をたっぷり持った状態で始める　--cap=N：盤を N 段 広げて始める　--unlock：役をぜんぶ解放して始める　--nolock：ポインターを固定できない環境のふり
//   場面：basic（武器庫の各タブ → 出撃 → 一人称と三人称）　puzzle（盤の操作と整備場）　keys（操作設定）　fp（一人称の操作）
//         cannons（8種類の砲）　roman（超ロマン砲）　flow（画面のつながり）　altitude（高さ）　phases（フェーズごとの弾幕）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.resolve(here, "../mod");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(os.tmpdir(), "fd-shots"));
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
fs.mkdirSync(outDir, { recursive: true });

const MB = 1024 * 1024, GB = 1024 * MB;
const FILES = [
  ["ubuntu-24.04.iso", 5.8 * GB], ["Movie_4K.mkv", 3.2 * GB], ["backup-2024.zip", 1.4 * GB], ["setup_game.exe", 240 * MB], ["lecture.mp4", 780 * MB],
  ["album.flac", 42 * MB], ["photo_0001.png", 6 * MB], ["report.pdf", 2.4 * MB], ["notes.txt", 12 * 1024], ["main.cpp", 40 * 1024], ["slides.pptx", 18 * MB], ["logo.svg", 9 * 1024],
  ["Game_Install.exe", 24 * GB], ["Win11_x64.iso", 15 * GB], ["Remux_4K.mkv", 60 * GB], ["Archive.7z", 11 * GB],
  ["photo_0002.png", 5 * MB], ["photo_0003.jpg", 3 * MB], ["song_a.mp3", 8 * MB], ["song_b.mp3", 9 * MB], ["doc_a.docx", 300 * 1024], ["doc_b.docx", 280 * 1024],
];
const store0 = {};
if (opt.stage) store0.rec = { reached: 9, stage: Number(opt.stage), best: 123456, bestStage: 4, diff: opt.diff || "normal" };
if (opt.reached) store0.rec = Object.assign({ stage: 1, best: 0, bestStage: 1, diff: "normal" }, store0.rec, { reached: Number(opt.reached) });
if (opt.rich || opt.cap) store0.meta = { mats: opt.rich ? { mem: 40, core: 40, plate: 20, bp: 30 } : {}, lv: opt.cap ? { cap: Number(opt.cap) } : {}, combos: opt.unlock ? ["big", "five", "four", "three", "pair", "twopair", "fullhouse", "fullcourse", "variety", "stairs", "three-pillars", "two-pillars", "top", "heavy", "uniform", "beans", "sameext", "backup", "twins", "initial"] : undefined };

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}</style>
<script>
const store = ${JSON.stringify(store0)};
const entries = ${JSON.stringify(FILES)}.map(([name, size], i) => ({ id: String(i + 1), name, path: "C:\\\\Downloads\\\\" + name, kind: "file", ext: name.split(".").pop().toLowerCase(), hidden: false, size }));
entries.forEach((e, i) => { e.modified = 1700000000000 + ((i * 7) % 22) * 86400000; });
for (const d of ["Old", "Pics", "Docs", "Games"]) entries.unshift({ id: "dir-" + d, name: d, path: "C:\\\\Downloads\\\\" + d, kind: "folder", ext: "", hidden: false });
// 下の階層にだけあるファイル
const deep = [["deep_clip.mp4", 50 * 1048576], ["deep_big.mkv", 400 * 1048576], ["deep_tiny.png", 40 * 1024], ["deep_note.txt", 3 * 1024], ["deep_photo.jpg", 2 * 1048576]]
  .map(([name, size], i) => ({ id: "d" + i, name, path: "C:\\\\Downloads\\\\Games\\\\" + name, kind: "file", ext: name.split(".").pop(), hidden: false, size, modified: 1710000000000 + i * 86400000 }));
// 偽のフォルダの木。下の階層を さがす・数える ための（格：Mods・Saves・Docs は 1、Pics は 2、Games は 3、Downloads は 7）
const MBx = 1048576;
const mkFiles = (dir, n, size, ext) => Array.from({ length: n }, (_, i) => ({ id: dir + i, name: ext + i + "." + ext, path: dir + "\\\\" + ext + i + "." + ext, kind: "file", ext, hidden: false, size: Math.round(size / n), modified: 1700000000000 + i * 86400000 }));
const DL = "C:\\\\Downloads";
const FSX = {
  "C:\\\\": { files: [], dirs: ["Downloads"] },
  [DL]: { files: entries.filter((e) => e.kind === "file"), dirs: ["Games", "Docs", "Pics", "Old"] },
  [DL + "\\\\Games"]: { files: deep, dirs: ["Mods", "Saves"] },
  [DL + "\\\\Games\\\\Mods"]: { files: mkFiles(DL + "\\\\Games\\\\Mods", 12, 60 * MBx, "zip"), dirs: [] },
  [DL + "\\\\Games\\\\Saves"]: { files: mkFiles(DL + "\\\\Games\\\\Saves", 5, 5 * MBx, "dat"), dirs: [] },
  [DL + "\\\\Docs"]: { files: mkFiles(DL + "\\\\Docs", 12, 30 * MBx, "pdf"), dirs: [] },
  [DL + "\\\\Pics"]: { files: mkFiles(DL + "\\\\Pics", 30, 150 * MBx, "png"), dirs: [] },
  [DL + "\\\\Old"]: { files: mkFiles(DL + "\\\\Old", 1, MBx, "txt"), dirs: [] },
};
const dirEntry = (parent, name) => ({ id: "dir-" + name, name, path: parent === "C:\\\\" ? "C:\\\\" + name : parent + "\\\\" + name, kind: "folder", ext: "", hidden: false });
window.__log = [];
// 偽のポインターロック：固定したふりをして pointerlockchange を送る
(() => {
  let locked = null;
  Object.defineProperty(document, "pointerLockElement", { get: () => locked });
  document.exitPointerLock = () => { if (locked) { locked = null; document.dispatchEvent(new Event("pointerlockchange")); } };
  Element.prototype.requestPointerLock = function (o) {
    window.__log.push("lock " + JSON.stringify(o || {}));
    if (${opt.nolock ? "true" : "false"}) { document.dispatchEvent(new Event("pointerlockerror")); return Promise.reject(new Error("denied")); }
    locked = this; document.dispatchEvent(new Event("pointerlockchange")); return Promise.resolve();
  };
})();
window.explorerPlus = {
  ready: async () => ({ apiVersion: 1, theme: "dark" }),
  settings: { get: async () => ({ sound: true, bgm: false, volume: 0, calm: false, quality: "high", fov: 80, practice: ${opt.practice ? "true" : "false"} }) },
  onSettings: () => () => {},
  storage: { get: async (k) => store[k], set: async (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); window.__store = store; }, delete: async () => {}, keys: async () => Object.keys(store) },
  onFolder: (cb) => { window.__onFolder = cb; setTimeout(() => cb({ id: "99", path: "C:\\\\Downloads", name: "Downloads", parentPath: "C:\\\\", entries }), 0); return () => {}; },
  open: async (e) => { window.__log.push("open " + e.path); }, navigateUp: async () => { window.__log.push("up"); },
  // 偽の検索：本物と同じように、名前（含む文字）・拡張子・大きさで しぼる。下の階層のファイル（deep）も 探せる
  search: { find: async (folder, q, o) => {
    window.__log.push("find " + JSON.stringify(q) + (o && o.depth ? " depth=" + o.depth : ""));
    if (q.kind === "folder") return { entries: ((FSX[folder.path] || {}).dirs || []).map((d) => dirEntry(folder.path, d)), truncated: false };       // 子のフォルダ
    let list = entries.concat(deep).filter((e) => e.kind === (q.kind || "file"));
    if (q.minSize != null) list = list.filter((e) => e.size >= q.minSize);
    if (q.maxSize != null) list = list.filter((e) => e.size <= q.maxSize);
    if (q.ext) list = list.filter((e) => q.ext.includes(e.ext));
    if (q.name) list = list.filter((e) => e.name.toLowerCase().includes(q.name.toLowerCase()));
    return { entries: list, truncated: false };
  },
  // 偽の search.stats：いまのフォルダ（と、その下の deep）を数える。ドライブの根は 大きくて「途中まで」
  stats: async (folder) => {
    window.__log.push("stats " + folder.path);
    await new Promise((r) => setTimeout(r, 150));
    const G = 1073741824;
    if (folder.path === "C:\\\\") return { files: 900000, folders: 80000, bytes: 400 * G, truncated: true, byExt: [{ ext: "iso", count: 3, bytes: 300 * G }, { ext: "dll", count: 800000, bytes: 100 * G }], largest: [], newest: [] };
    if (!FSX[folder.path]) throw new Error("そのフォルダは ありません");
    const all = [], by = {};
    let subs = 0;
    const walk = (p) => { const n = FSX[p]; all.push(...n.files); for (const d of n.dirs) { subs++; walk(p === "C:\\\\" ? "C:\\\\" + d : p + "\\\\" + d); } };
    walk(folder.path);
    for (const e of all) { const b = (by[e.ext] = by[e.ext] || { ext: e.ext, count: 0, bytes: 0 }); b.count++; b.bytes += e.size; }
    return { files: all.length, folders: subs, bytes: all.reduce((s, e) => s + e.size, 0), truncated: false, byExt: Object.values(by).sort((a, b) => b.bytes - a.bytes), largest: [], newest: [] };
  } },
  commands: { set: async (l) => { window.__commands = l; } }, onCommand: (cb) => { window.__cmd = cb; return () => {}; },
  ui: { toast: async (m) => { window.__log.push("toast " + m); }, status: async () => {}, confirm: async (m, o) => { window.__log.push("confirm " + (o && o.okLabel)); return window.__confirm !== false; } },
};
</script></head><body><script type="module" src="/file-danmaku/index.js?debug"></script></body></html>`;

const TYPES = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/index.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end(HARNESS); }
  const m = /^\/file-danmaku\/(.+)$/.exec(url);
  const f = m && path.join(MOD, m[1]);
  if (f && f.startsWith(MOD) && fs.existsSync(f)) { res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); return res.end(fs.readFileSync(f)); }
  res.writeHead(404); res.end("not found");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const exes = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const exe = exes.find((p) => fs.existsSync(p));
if (!exe) throw new Error("Edge も Chrome も見つかりません");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fd-edge-"));
const W = Number(opt.w || 1280), H = Number(opt.h || 720);
const dbg = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(exe, [
  "--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required",
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
// 終わらせる。Edge は起動役が すぐ終わって、本体が別の親の下に残ることがある。
// そこで、ふつうに閉じてから、この試験だけの一時プロファイルの名前で 残りを探して終わらせる
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ id: ++seq, method: "Browser.close" })); } catch { /* 閉じていた */ }
  try { proc.kill(); } catch { /* 終わっていた */ }
  try { server.close(); } catch { /* 閉じていた */ }
  if (process.platform === "win32") {
    const tag = path.basename(profile);
    try { spawnSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }); } catch { /* 探せなかった */ }
  }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 消せなくても困らない */ }
};
process.on("exit", cleanup);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const logs = [];
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      const pg = list.find((t) => t.type === "page");
      if (pg) {
        ws = new WebSocket(pg.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
          else if (d.method === "Runtime.consoleAPICalled") logs.push(`[${d.params.type}] ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
          else if (d.method === "Runtime.exceptionThrown") logs.push(`[exception] ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
        };
        return;
      }
    } catch { /* まだ起動中 */ }
    await sleep(250);
  }
  throw new Error("ブラウザにつながりません");
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, "base64"));
  console.log("  shot", name);
};
const key = (type, code) => ev(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, bubbles: true, cancelable: true }))`);
const hold = (code) => key("keydown", code);
const release = (code) => key("keyup", code);
const tap = async (code) => { await hold(code); await release(code); };
const mouse = (type, button = 0, extra = {}) => ev(`window.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, Object.assign({ button: ${button}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`);
const look = (dx, dy) => mouse("mousemove", 0, { movementX: dx, movementY: dy });
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const tileOf = (name) => `[...document.querySelectorAll(".tile")].find((r) => r.dataset.name.includes(${JSON.stringify(name)}))`;
const clickRow = (name) => ev(`${tileOf(name)}.click()`);
const dblRow = (name) => ev(`${tileOf(name)}.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }))`);
const tileNames = () => ev(`[...document.querySelectorAll(".tile")].map((r) => r.dataset.name)`);
const cellAt = (x, y) => `document.querySelector('.cell[data-x="${x}"][data-y="${y}"]')`;
const hoverCell = (x, y) => ev(`${cellAt(x, y)}.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
const clickCell = (x, y) => ev(`${cellAt(x, y)}.click()`);
// ゲームの中身を読む。式の中で g（ゲーム）と d（デバッグの窓）が使える
const G = (expr) => ev(`(() => { const d = window.__fd(); const g = d.g; return ${expr}; })()`);
const D = (expr) => ev(`(() => { const d = window.__fd(); return ${expr}; })()`);
const visible = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.closest("[hidden]"); })()`);
const check = (cond, msg) => { console.log(cond ? "  ok" : "  NG", msg); if (!cond) process.exitCode = 1; };

async function boot() {
  await connect();
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await ev(`!!document.querySelector("#go")`).catch(() => false)) break;
  }
  await sleep(300);
}

// 条件が満たされるまで待つ。ms まで
async function until(expr, ms = 20000, step = 250) {
  for (let t = 0; t < ms; t += step) { if (await G(expr).catch(() => false)) return true; await sleep(step); }
  return false;
}

// 戦いを始めて、導入が終わるまで待つ
async function sortie(wait = "fight") {
  await click("#go");
  if (wait === "fight") { await until("g.mode === \"fight\"", 60000); await sleep(300); } else await sleep(wait);
}

const SCENARIOS = {
  async basic() {
    await shot("1-armory");
    console.log("  gl:", await ev(`(() => { const c = document.getElementById("gl"); return c ? c.width + "x" + c.height : "none"; })()`));
    await ev(`document.querySelector(".tile:nth-child(4)").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
    await shot("2-armory-hover");
    await click('[data-tab="dex"]'); await sleep(200);
    await shot("3-dex");
    await ev(`document.querySelector(".scroll").scrollTop = 900`);
    await shot("3b-dex-lower");
    await click('[data-tab="combos"]'); await sleep(200);
    await shot("4-combos");
    await click('[data-tab="garage"]'); await sleep(200);
    await shot("5-garage");
    await click('[data-tab="files"]');
    await click("#keys"); await sleep(200);
    await shot("6-keys");
    await click('[data-act="close"]');
    await sortie(1200);
    await shot("7-intro");
    await sleep(2600);
    await hold("KeyJ");
    await hold("KeyW");
    await sleep(1500);
    await release("KeyW");
    await shot("8-fight-first");
    await tap("KeyV");
    await sleep(500);
    await shot("9-fight-third");
  },

  // 盤の操作：持ち上げる・回す・置く・取る・自動・整備場
  async puzzle() {
    await click("#clear");
    check(await D("d.ui.board.used()") === 0, "からにする");
    await clickRow("ubuntu-24.04.iso");
    check(await D("!!d.ui.hold") && await visible(".holdbar.on"), "ファイルを押すと持ち上がる");
    await hoverCell(1, 1);
    check(await ev(`document.querySelectorAll(".cell.pv.ok").length`) === await D("d.ui.hold.ammo.cells"), "置ける所は緑で見える");
    await shot("p1-preview");
    await clickCell(1, 1);
    check(await D("d.ui.board.list().length") === 1 && await D("!d.ui.hold"), "盤に置ける");
    await clickRow("main.cpp");
    const rot0 = await D("d.ui.hold.rot");
    await tap("KeyR");
    check(await D("d.ui.hold.rot") === (rot0 + 1) % 4, "R で回る");
    await ev(`document.querySelector("#armory").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))`);
    check(await D("d.ui.hold.rot") === (rot0 + 2) % 4, "右クリックでも回る");
    const occ = await ev(`(() => { const c = document.querySelector(".cell.f"); return [Number(c.dataset.x), Number(c.dataset.y)]; })()`);
    await hoverCell(occ[0], occ[1]);
    check(await ev(`document.querySelectorAll(".cell.pv.bad").length`) > 0, "重なる所は赤で見える");
    await clickCell(occ[0], occ[1]);
    check(await D("!!d.ui.hold") && await D("d.ui.msg.length") > 0, "重なる所には置けない");
    await tap("Escape");
    check(await D("!d.ui.hold") && await D("d.ui.board.list().length") === 1, "Esc でやめる");
    const pid = await D("d.ui.board.list()[0].id");
    await ev(`document.querySelector('.cell[data-id="${pid}"]').click()`);
    check(await D("!!d.ui.hold") && await D("d.ui.board.list().length") === 0, "置いたものを押すと取れる");
    await tap("Escape");
    check(await D("d.ui.board.list().length") === 1, "取ったものは Esc で元の場所へ");
    await dblRow("report.pdf");
    check(await D("d.ui.board.list().length") === 2, "ダブルクリックで自動で置く");
    await click("#auto");
    const used = await D("d.ui.board.used()");
    check(used > 8, "おまかせ詰めで盤が埋まる");
    await shot("p2-packed");
    check(await ev(`document.querySelector(".combos .pill") !== null || document.querySelector(".combos .none") !== null`), "役の欄がある");
    // 整備場
    await click('[data-tab="garage"]');
    const w0 = await D("d.ui.board.w");
    await click('[data-buy="cap"]');
    await sleep(200);
    if (opt.rich) {
      check(await D("d.ui.board.w") > w0 || await D("d.ui.board.h") > 4, "盤が広がる");
      check(await D("d.meta.lv.cap") === 1 && await D("d.meta.mats.mem") < 40, "素材が減る");
      await click('[data-tab="combos"]');
      await click('[data-unlock="five"]');
      check(await D("d.meta.combos.includes('five')"), "役を解放できる");
      await shot("p3-garage-rich");
    } else {
      check(await D("d.ui.board.w") === w0, "素材がなければ広がらない");
    }
    await click('[data-tab="files"]');
    await click("#clear");
    check(await D("d.ui.board.used()") === 0, "からにする");
  },

  // 操作設定：割り当てを変える
  async keys() {
    await click("#keys");
    check(await visible(".kt"), "操作設定が開く");
    await click('[data-kb="moveF"][data-slot="0"]');
    check(await ev(`!!document.querySelector(".kb.cap")`), "入力待ちになる");
    await hold("KeyI");
    check(await D("d.bindings.moveF[0]") === "KeyI", "前へを I に変える");
    await click('[data-kb="moveB"][data-slot="0"]');
    await hold("KeyI");
    check(await D("d.bindings.moveB[0]") === "KeyI" && await D("!d.bindings.moveF.includes('KeyI')"), "同じキーは 1つの操作にしか付かない");
    await click('[data-kb="moveB"][data-slot="0"]');
    await hold("KeyK");
    await click('[data-kb="moveF"][data-slot="0"]');
    await hold("KeyI");
    await click('[data-kb="shoot"][data-slot="1"]');
    await hold("Delete");
    check(await D("d.bindings.shoot.length") === 1, "Delete で外せる");
    await click('[data-kb="up"][data-slot="0"]');
    await mouse("mousedown", 1);
    check(await D("d.bindings.up[0]") === "Mouse1", "マウスのボタンも割り当てられる");
    await sleep(500);
    await shot("k1-keys");
    await click('[data-act="reset"]');
    check(await D("d.bindings.moveF[0]") === "KeyW", "はじめの割り当てにもどる");
    await click('[data-kb="moveF"][data-slot="0"]');
    await hold("KeyI");
    await click('[data-act="close"]');
    check(await D("JSON.stringify(window.__store && window.__store.bind || {}).includes('KeyI')"), "割り当てが保存される");
    // 遊んでみる：I で前へ
    await click("#clear");
    await sortie();
    const z0 = await G("g.p.z");
    await hold("KeyI"); await sleep(900); await release("KeyI");
    check(Math.abs((await G("g.p.z")) - z0) > 1, "変えたキーで進む");
    await shot("k2-play");
  },

  // 一人称：マウスで見る向きを変える。押しているボタンで撃つ。高さ。ボスのほうを向く
  async fp() {
    await click("#auto");
    await sortie();
    check(await D("document.pointerLockElement === document.body") || await D("d.lockFailed"), "ポインターを固定する");
    check(await D("d.look.autoFire === true && d.look.assist === 360"), "はじめは 自動射撃・完全オートエイム");
    check(await until("g.stats.dmg > 0", 8000, 100), "何も押さなくても 自動で撃って 当たる");
    console.log("  lock log:", await ev(`window.__log.filter((l) => l.startsWith("lock")).join(" | ")`));
    const yaw0 = await G("g.p.yaw"), pit0 = await G("g.p.pitch");
    await look(120, 0); await sleep(150);
    check(Math.abs((await G("g.p.yaw")) - yaw0) > 0.1, "マウスを右へで、見る向きが変わる");
    const yaw1 = await G("g.p.yaw");
    check(((yaw0 - yaw1 + 7 * Math.PI) % (2 * Math.PI)) - Math.PI > 0, "右へ動かすと右を向く");
    await look(0, -60); await sleep(150);
    check((await G("g.p.pitch")) > pit0 + 0.05, "マウスを上へで、上を向く");
    await hold("KeyF"); await sleep(1200); await release("KeyF");
    check(await G("g.locked"), "ボスのほうを向く");
    await shot("f1-locked");
    await mouse("mousedown", 0);
    await sleep(1000);
    check(await G("g.stats.dmg") > 0, "左ボタンでショットが当たる");
    await mouse("mouseup", 0);
    const k0 = await G("g.kindSel");
    await ev(`window.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }))`);
    check(await G("g.kindSel") !== k0, "ホイールで弾の種類が切りかわる");
    await mouse("mousedown", 2);
    await sleep(500);
    check(await G("!!g.p.ch"), "右ボタンの押しっぱなしで溜まる");
    await mouse("mouseup", 2);
    await sleep(200);
    check(await G("!g.p.ch"), "放すと溜めが終わる");
    const y0 = await G("g.p.y");
    await hold("Space"); await sleep(900); await release("Space");
    check((await G("g.p.y")) > y0 + 1, "Space で上がる");
    await hold("KeyC"); await sleep(1400); await release("KeyC");
    check((await G("g.p.y")) < y0, "C で下がる");
    await tap("KeyV"); await sleep(300);
    check(await D("d.look.view") === "third", "V で三人称");
    await shot("f2-third");
    await tap("KeyV");
    if (!(await D("d.lockFailed"))) {
      // 中断：固定が外れると、中断になる
      await ev(`document.exitPointerLock()`);
      await sleep(300);
      check(await D("d.paused") === true && await visible(".card"), "ポインターが外れると中断");
      await shot("f3-pause");
      await click('[data-act="resume"]');
      await sleep(300);
      check(await D("d.paused") === false && (await D("document.pointerLockElement === document.body")), "つづけると、また固定する");
    }
  },

  // 8種類の砲を、ひとつずつ撃つ（練習モードで）
  async cannons() {
    await click("#clear");
    for (const n of ["ubuntu-24.04.iso", "Movie_4K.mkv", "backup-2024.zip", "setup_game.exe", "album.flac", "slides.pptx", "photo_0001.png", "main.cpp"]) await dblRow(n);
    await shot("armory");
    await click("#go");
    await sleep(5500);
    await hold("KeyF");
    await mouse("mousedown", 0);
    for (let i = 0; i < 8; i++) {
      await G("(g.boss.hp = g.boss.hpMax = 1e7, 0)");
      await tap(`Digit${i + 1}`);
      await mouse("mousedown", 2);
      for (let t = 0; t < 80; t++) { if (await G("!!(g.p.ch && g.p.ch.ready)")) break; await sleep(100); }
      await shot(`c${i + 1}-ready`);
      await mouse("mouseup", 2);
      await sleep(300);
      await shot(`c${i + 1}-a`);
      await sleep(700);
      await shot(`c${i + 1}-b`);
      await G("(g.boss.hp = g.boss.hpMax, 0)");
      await sleep(1200);
    }
  },

  // 10GB をこえる砲（超ロマン砲）を撃つ
  async roman() {
    await click("#clear");
    for (const n of ["Game_Install.exe", "Win11_x64.iso", "Remux_4K.mkv", "Archive.7z"]) await dblRow(n);
    await click("#go");
    await sleep(5500);
    await hold("KeyF");
    await mouse("mousedown", 0);
    const kinds = await G("[...new Set(g.mag.map((a) => a.kind))]");
    for (let i = 0; i < 4; i++) {
      await G("(g.boss.hp = g.boss.hpMax = 1e7, 0)");
      const ki = await G(`["shot","spread","beam","wave","homing","cluster","blast","meteor"].indexOf(${JSON.stringify(kinds[i % kinds.length])}) + 1`);
      await tap(`Digit${ki}`);
      await mouse("mousedown", 2);
      for (let t = 0; t < 150; t++) { if (await G("!!(g.p.ch && g.p.ch.ready)")) break; await sleep(100); }
      await shot(`r${i + 1}-ready`);
      await mouse("mouseup", 2);
      await sleep(200);
      await shot(`r${i + 1}-a`);
      await sleep(500);
      await shot(`r${i + 1}-b`);
      await sleep(900);
      await shot(`r${i + 1}-c`);
      await G("(g.boss.hp = g.boss.hpMax, 0)");
      await sleep(2000);
    }
  },

  // 画面のつながり：中断・面クリア・素材・次の面・ゲームオーバー・もういちど・大物をさがす・フォルダへ入る
  async flow() {
    await click("#find");
    await sleep(300);
    check(await ev(`document.querySelectorAll(".tile").length`) > 0 && await ev(`!!document.getElementById("back")`), "大物をさがす：結果の一覧と、もどる");
    check((await tileNames()).every((n) => n !== "notes.txt"), "条件がないときの 下の階層の一覧には、小さいファイルがない");
    await click("#back");
    await sleep(200);
    await ev(`document.querySelector(".dirchip").click()`);
    check(await ev(`window.__log.some((l) => l.startsWith("open "))`), "フォルダを押すと、開く");
    await click("#up");
    check(await ev(`window.__log.includes("up")`), "上へ");
    // 出撃 → 中断
    await sortie(3200);
    check(await D("d.scene") === "play", "出撃で戦いに入る");
    await tap("Escape");
    await sleep(300);
    check(await D("d.paused") === true && await visible(".card"), "Esc で中断");
    const t0 = await G("g.t");
    await sleep(500);
    check(Math.abs((await G("g.t")) - t0) < 0.01, "中断中は世界が止まる");
    await click('[data-act="resume"]');
    await sleep(500);
    check(await D("d.paused") === false && (await G("g.t")) > t0, "つづける");
    // 面クリア
    await hold("KeyF");
    await mouse("mousedown", 0);
    await until("g.mode === \"fight\"");
    for (let k = 0; k < 120 && (await G("g.mode")) !== "clear"; k++) { await G("(g.boss.state === \"attack\" && (g.boss.hp = Math.min(g.boss.hp, 1)), 0)"); await sleep(250); }
    for (let k = 0; k < 160 && !(await visible(".card .got")); k++) await sleep(250);
    check(await G("g.mode") === "clear", "全フェーズで面クリア");
    check(await visible(".card h1") && (await ev(`document.querySelector(".card h1").textContent`)).includes("クリア"), "結果の画面");
    check(await visible(".card .got"), "手に入れた素材が出る");
    await shot("flow-clear");
    check(await D("d.meta.mats.mem") > 0 && await D("d.meta.mats.bp") > 0, "素材がたまる");
    await click('[data-act="next"]');
    await sleep(300);
    check(await D("d.scene") === "armory" && await visible("#go"), "次の面の武器庫");
    check(await ev(`document.querySelector("#stages .on").textContent`) === "2", "選ばれている面は 2");
    check(await D("d.ui.board.list().length") <= 8, "使った弾は盤から減る");
    await click("#go");
    await sleep(3200);
    check(await G("g.stage") === 2 && await D("d.scene") === "play", "2面が始まる");
    check(await G("g.p.hp") === (await G("g.p.hpMax")) && (await G("g.score")) > 100000, "スコアが持ち越され、ライフは満タン");
    // ゲームオーバー → もういちど
    await until("g.mode === \"fight\"");
    await G("(g.p.inv = 0, g.p.hp = 1, g.shield = 0, g.bullets.add({ x: g.p.x, y: g.p.y, z: g.p.z, ang: 0, speed: 0, r: 0.5 }), 0)");
    for (let k = 0; k < 160 && !(await visible(".card h1")); k++) await sleep(250);
    check(await G("g.mode") === "over", "やられるとゲームオーバー");
    check((await ev(`document.querySelector(".card h1").textContent`)).includes("ゲームオーバー"), "ゲームオーバーの画面");
    await shot("flow-over");
    await click('[data-act="retry"]');
    await until("g.mode === \"fight\"");
    check(await G("g.stage") === 2 && await G("g.p.hp") === (await G("g.p.hpMax")) && await G("g.score") < 1000, "もういちど：同じ面を最初から");
    check(await D("d.rec.best") > 100000 && await D("d.rec.reached") === 2, "記録が残る");
    check(await G("g.mag.length") > 0, "もういちどでも弾がそろっている");
  },

  async dbg() {
    await click("#auto");
    await sortie();
    console.log(await D("JSON.stringify({ scene: d.scene, paused: d.paused, lockFailed: d.lockFailed, mode: d.g.mode, t: d.g.t, lock: document.pointerLockElement === document.body })"));
    const y0 = await G("g.p.yaw");
    await look(120, 0); await sleep(300);
    console.log(y0, await G("g.p.yaw"), await D("d.paused"));
    await hold("Space"); await sleep(600);
    console.log(await G("JSON.stringify({ y: g.p.y, vy: g.p.vy, inp: g.inp })"));
    await release("Space");
  },

  // ファイルのタブ：グリッド・詳細・しぼりこみ・並べかた・下の階層もさがす・おまかせ詰め
  async files() {
    const kindsOf = () => D("d.ui.items.filter((it) => it.type === 'file').map((it) => it.a.kind)");
    const sortTo = (id) => ev(`(() => { const s = document.getElementById("sortSel"); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    const typeQ = (v) => ev(`(() => { const q = document.getElementById("q"); q.value = ${JSON.stringify(v)}; q.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    const logFinds = () => ev(`window.__log.filter((l) => l.startsWith("find ")).map((l) => JSON.parse(l.slice(5)))`);
    let names = await tileNames();
    check(names.length === 22 && await ev(`document.querySelectorAll(".grid .tile").length`) === 22, `ファイルが グリッドで出る（${names.length}）`);
    check(await ev(`!document.querySelector(".tile").textContent.includes(".") && !/[KMG]B/.test(document.querySelector(".tile").textContent)`), "マスには 名前も大きさも 出ない");
    check(await ev(`document.querySelector(".tile").getAttribute("title").includes(document.querySelector(".tile").dataset.name)`), "名前は 吹き出しに出る");
    await ev(`document.querySelector(".tile").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
    check(await ev(`document.querySelector("#info .nm").textContent.includes(document.querySelector(".tile").dataset.name) && /[KMG]B/.test(document.querySelector("#info .nm").textContent)`), "触れると 詳細に 名前と大きさ");
    await shot("g1-grid");
    // 並べかた
    check(names[0] === "Remux_4K.mkv", "はじめは 大きい順");
    await sortTo("sizeUp");
    check((await tileNames())[0] === "logo.svg", "小さい順");
    await sortTo("new");
    check((await tileNames())[0] === "setup_game.exe", "新しい順");
    await sortTo("old");
    check((await tileNames())[0] === "ubuntu-24.04.iso", "古い順");
    await sortTo("name");
    const asName = (await tileNames()), want = asName.slice().sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
    check(JSON.stringify(asName) === JSON.stringify(want), "名前順");
    await sortTo("kind");
    const ks = await kindsOf(), order = ["shot", "spread", "beam", "wave", "homing", "cluster", "blast", "meteor"];
    check(ks.every((k, i) => i === 0 || order.indexOf(ks[i - 1]) <= order.indexOf(k)), "種類順");
    check(await D("d.rec.sort") === "kind" || await D("d.ui.sort") === "kind", "並べかたを覚える");
    await sortTo("size");
    // しぼりこみ：種類
    await click('[data-fk="beam"]');
    names = await tileNames();
    check(names.length === 3 && names.every((n) => /\.(mp4|mkv)$/.test(n)), "光線だけ（動画）");
    check(await ev(`document.getElementById("fcount").textContent`) === "3 件 / 22 件", "件数の表示");
    await click('[data-fk="spread"]');
    check((await tileNames()).length === 7, "種類は いくつでも（光線 + 散弾）");
    await click('[data-fk="beam"]'); await click('[data-fk="spread"]');
    // 段：小さいものを探せる
    await click('[data-ft="0"]');
    names = await tileNames();
    check(names.length === 3 && names.includes("notes.txt") && names.includes("logo.svg"), "豆鉄砲だけ（小さいファイル）");
    await shot("g2-small");
    await click('[data-ft="0"]');
    // 名前
    await ev(`window.__q = document.getElementById("q")`);
    await typeQ("photo");
    names = await tileNames();
    check(names.length === 3 && names.every((n) => n.startsWith("photo")), "名前でしぼる");
    check(await ev(`document.getElementById("q") === window.__q`), "入力中も 入力欄は 作りなおされない");
    await typeQ("*.png");
    check((await tileNames()).length === 2, "ワイルドカード");
    await click('[data-fk="spread"]');
    await click('[data-ft="2"]');
    check((await tileNames()).length === 2, "名前・種類・段 を 重ねてしぼる");
    await click("#fclear");
    check((await tileNames()).length === 22 && await ev(`document.getElementById("q").value`) === "", "しぼりこみをやめる");
    check(await ev(`document.getElementById("fclear").disabled`), "条件がなければ やめるボタンは 押せない");
    // 下の階層もさがす：条件がなければ 20MB 以上
    await click("#find"); await sleep(300);
    let finds = await logFinds();
    check(finds.length === 1 && finds[0].minSize === 20 * 1048576 && finds[0].kind === "file", "条件がないと 20MB 以上で探す");
    names = await tileNames();
    check(names.includes("deep_big.mkv") && names.includes("deep_clip.mp4") && !names.includes("deep_tiny.png") && !names.includes("notes.txt"), "下の階層の 大きいファイルが 出る");
    check(await ev(`document.querySelector(".tools .path").textContent.includes("下の階層")`) && await visible("#back"), "結果の表示と もどる");
    check((await ev(`document.getElementById("msg").textContent`)).includes("20MB"), "20MB にしたことを 伝える");
    // 結果にも しぼりこみが効く
    await click('[data-fk="beam"]');
    check((await tileNames()).every((n) => /\.(mp4|mkv)$/.test(n)) && (await tileNames()).includes("deep_big.mkv"), "結果にも しぼりこみが効く");
    await click('[data-fk="beam"]');
    await click("#back");
    check((await tileNames()).length === 22, "もどる");
    // 小さいものを 下の階層まで探す
    await click('[data-ft="0"]');
    await click("#find"); await sleep(300);
    finds = await logFinds();
    const last = finds[finds.length - 1];
    check(last.maxSize === 100 * 1024 - 1 && last.minSize === undefined, "豆鉄砲だけ → 100KB 未満で探す");
    names = await tileNames();
    check(names.includes("deep_tiny.png") && names.includes("deep_note.txt") && !names.includes("deep_big.mkv"), "下の階層の 小さいファイルが 出る");
    await shot("g3-deep-small");
    await click("#back");
    await click("#fclear");
    // 種類 + 名前 を 下の階層まで
    await click('[data-fk="spread"]');
    await typeQ("deep");
    await click("#find"); await sleep(300);
    finds = await logFinds();
    const l2 = finds[finds.length - 1];
    check(l2.ext.includes("png") && l2.ext.includes("jpg") && l2.name === "deep" && l2.minSize === undefined, "種類は 拡張子、名前は 文字で 渡す");
    names = await tileNames();
    check(JSON.stringify(names.slice().sort()) === JSON.stringify(["deep_photo.jpg", "deep_tiny.png"]), "画像で 名前に deep を含むもの");
    await click("#back");
    await click("#fclear");
    // おまかせ詰め：見えているものだけ
    await click('[data-fk="beam"]');
    await click("#clear");
    await click("#auto");
    check(await D("d.ui.board.ammos().length > 0 && d.ui.board.ammos().every((a) => a.kind === 'beam')"), "おまかせ詰めは 見えているファイルだけから");
    await shot("g4-auto-beam");
    // フォルダの札
    await click("#fclear");
    check(await ev(`!!document.querySelector(".dirchip")`), "フォルダは 札で出る");
  },

  // フォルダのボス：挑めるフォルダを さがす → 一覧から選ぶ → 挑む → 制覇 → 到達が進むと 一覧が変わる。ドライブの根は ラスボス
  async folder() {
    const tabTo = async (id) => { await click(`[data-tab="${id}"]`); await sleep(100); };
    const cands = () => ev(`[...document.querySelectorAll(".cand")].map((c) => ({ name: c.querySelector("b").textContent.replace("✓ ", "").trim(), done: c.querySelector("b").textContent.includes("✓"), locked: c.classList.contains("locked"), text: c.textContent }))`);
    const open = async () => (await cands()).filter((c) => !c.locked).map((c) => c.name);
    const later = async () => (await cands()).filter((c) => c.locked).map((c) => c.name);
    const pick = (name) => ev(`[...document.querySelectorAll(".cand")].find((c) => c.querySelector("b").textContent.includes(${JSON.stringify(name)})).click()`);
    const detail = () => ev(`document.querySelector(".fb").textContent`);
    const finds = () => ev(`window.__log.filter((l) => l.startsWith("stats ")).map((l) => l.slice(6))`);
    await tabTo("folder");
    check(await visible("#fexplore") && (await cands()).length === 0 && !(await ev(`!!document.getElementById("fscan")`)), "はじめは「さがす」だけ。「このフォルダを調べる」は もうない");
    // さがす（到達 1）
    await click("#fexplore");
    check(await ev(`document.body.textContent.includes("さがしています")`) && await visible("#fstop"), "さがしているあいだは 知らせて、やめられる");
    check(await until("!document.getElementById('fstop')", 20000, 100), "さがし終わる");
    check(JSON.stringify(await open()) === JSON.stringify(["Mods", "Docs", "Saves"]), "到達 1 で挑めるのは 80MB 未満の 3 つ（大きい順）");
    check(JSON.stringify(await later()) === JSON.stringify(["Pics", "Games"]), "まだ早いのは 近い順");
    const done = await finds();
    check(done.length === 7 && !done.includes("C:\\Downloads\\Games\\Mods\\x") && done[0] === "C:\\Downloads", "いま開いている所から 浅い順に 7 か所 数えた");
    check((await ev(`document.querySelector(".st").textContent`)).includes("さいごまで") , "さがし終わりの 知らせ");
    await shot("fo1-list");
    // 選ぶ
    await pick("Mods");
    let t = await detail();
    check(t.includes("Mods") && t.includes("格 1") && t.includes("苦手") && t.includes("得意") && !t.includes("本来") && await ev(`!document.getElementById("fgo").disabled`), "選ぶと 詳細が出て、挑める");
    check(await ev(`document.querySelectorAll(".forms li").length`) === 3 && await ev(`document.querySelectorAll(".bar").length`) >= 1, "フェーズと 中身の割合");
    await shot("fo2-detail");
    await pick("Pics");
    t = await detail();
    check(await ev(`document.getElementById("fgo").disabled`) && t.includes("あと") && t.includes("1") && t.includes("面クリア"), "まだ早いものは 予告だけ。挑めない");
    await pick("Docs");
    // 挑む
    await click("#fgo");
    check(await until("g.mode === 'fight'", 60000, 200), "選んだフォルダのボスと 戦う");
    check(await G("g.bossDef.name === 'Docs' && g.stage === 1 && g.bossDef.info.path === 'C:\\\\Downloads\\\\Docs' && !!g.bossDef.kindMul"), "ボスは 選んだフォルダ。格 1");
    await shot("fo3-battle");
    await hold("KeyF");
    for (let k = 0; k < 160 && (await G("g.mode")) !== "clear"; k++) { await G("(g.boss.state === 'attack' && (g.boss.hp = Math.min(g.boss.hp, 1)), 0)"); await sleep(250); }
    for (let k = 0; k < 160 && !(await visible(".card .got")); k++) await sleep(250);
    check((await ev(`document.querySelector(".card h1").textContent`)).includes("Docs") && (await ev(`document.querySelector(".card h1").textContent`)).includes("制覇"), "結果は「制覇」");
    check(await ev(`!document.querySelector('[data-act="next"]')`), "フォルダのボスに「次の面へ」はない");
    check(await D(`d.rec.conquest["C:\\\\Downloads\\\\Docs"].clears === 1`) && await D("d.rec.reached === 2"), "制覇を覚える。到達が 2 に進む");
    await click('[data-act="armory"]');
    await tabTo("folder");
    // 到達が進んだ：さがしなおさずに 一覧が変わる（Pics が 挑める。Docs は ✓）
    check(JSON.stringify(await open()) === JSON.stringify(["Pics", "Mods", "Docs", "Saves"]), "到達 2：Pics が 挑めるようになる。さがしなおさなくていい");
    check((await cands()).find((c) => c.name === "Docs").done, "制覇した Docs に ✓");
    check((await finds()).length === 7, "到達が進んでも 数えなおさない");
    await pick("Docs");
    check((await detail()).includes("制覇ずみ") && (await detail()).includes("35%"), "同じ格の倒しなおしは 素材 35%");
    // 到達 3：Games が挑める。その中の Mods と Saves は 一覧から省く
    await D("(d.rec.reached = 3, d.ui.reached = 3, 0)");
    await tabTo("files"); await tabTo("folder");
    check(JSON.stringify(await open()) === JSON.stringify(["Games", "Pics", "Docs"]), "到達 3：Games が 挑める。中の Mods と Saves は 省く");
    check((await later()).length === 0, "近い目標は もうない");
    await shot("fo4-reached3");
    // 制覇の印
    await D(`(d.rec.conquest["C:\\\\Downloads\\\\Games"] = { S: 3, clears: 1, best: 1, at: 1 }, 0)`);
    await tabTo("files");
    check((await ev(`[...document.querySelectorAll(".dirchip")].find((b) => b.textContent.includes("Games")).textContent`)).includes("✓"), "制覇した フォルダの札に ✓");
    // やめる
    await tabTo("folder");
    await click("#fexplore");
    check(await until("!!document.getElementById('fstop')", 3000, 50), "もう一度さがす");
    await click("#fstop");
    check(await until("!document.getElementById('fstop')", 20000, 100) && (await ev(`document.querySelector(".st").textContent`)).includes("やめました"), "やめられる");
    // ドライブの根：ラスボス
    await ev(`window.__onFolder({ id: "1", path: "C:\\\\", name: "C:", parentPath: "", entries: [{ id: "dir-Downloads", name: "Downloads", path: "C:\\\\Downloads", kind: "folder", ext: "", hidden: false }] })`);
    await sleep(100);
    check((await ev(`document.querySelector(".fpath").textContent`)).includes("ドライブの根") && await visible("#fexplore") && (await cands()).length === 0, "ドライブの根を開くと「ドライブの根」と出る。一覧は さがすまで空");
    const before = (await finds()).length;
    await click("#fexplore");
    check(await until("!document.getElementById('fstop')", 30000, 100), "ドライブの下を さがす");
    check(!(await finds()).slice(before).includes("C:\\"), "ドライブの根は 数えない");
    const lt = await later();
    check(lt.length >= 1 && lt[lt.length - 1] === "ドライブ C:" && (await open()).includes("Games"), "到達 3：ドライブの下の Games などが 挑めて、根は ラスボスの予告として さいごに出る");
    await pick("ドライブ C:");
    t = await detail();
    check(t.includes("ラスボス") && t.includes("格 8") && await ev(`document.getElementById("fgo").disabled`) && t.includes("あと") && t.includes("5"), "ラスボスは 格 8。あと 5 面で解禁。挑めない");
    await shot("fo5-root-locked");
    // 到達 8：根を数えて ラスボスに挑める
    await D("(d.rec.reached = 8, d.ui.reached = 8, 0)");
    await click("#fexplore");
    check(await until("!document.getElementById('fstop')", 30000, 100), "到達 8 で さがしなおす");
    check(JSON.stringify(await open()) === JSON.stringify(["ドライブ C:"]) && (await finds()).includes("C:\\"), "到達 8：根を数えて、ラスボスだけが 出る");
    await pick("ドライブ C:");
    t = await detail();
    check(t.includes("格 8") && await ev(`document.querySelectorAll(".forms li").length`) === 4 && t.includes("全容量「満杯の空」") && t.includes("数えきれませんでした") && await ev(`!document.getElementById("fgo").disabled`), "ラスボス：格 8、4 フェーズ、さいごは「満杯の空」。挑める");
    await shot("fo6-root-open");
  },

  // 進行度の初期化（デバッグ用コマンド）
  async reset() {
    check(await ev(`window.__commands.some((c) => c.id === "reset" && c.label === "進行度を初期化" && c.hint === "デバッグ用")`), "コマンドの一覧に「進行度を初期化」");
    check(await ev(`window.__commands.every((c) => !/[（）()]/.test(c.label + (c.hint || "")))`), "コマンドの名前に 括弧がない");
    // キーの割り当てを 1 つ変えておく（残るはず）
    await click("#keys");
    await click('[data-kb="moveF"][data-slot="0"]');
    await hold("KeyI");
    await click('[data-act="close"]');
    check(await D("d.bindings.moveF[0] === 'KeyI'"), "（準備）キーを変えた");
    await D(`(d.rec.conquest["C:\\\\x"] = { S: 3, clears: 1, best: 9, at: 1 }, d.rec.best = 99999, d.rec.biggest = { name: "a", bytes: 1, dmg: 1 }, 0)`);
    check(await D("d.rec.reached === 9 && d.meta.mats.mem === 40"), "（準備）進行度がある");
    // やめた
    await ev(`window.__confirm = false`);
    await ev(`window.__cmd("reset")`);
    await sleep(300);
    check(await D("d.rec.reached === 9 && d.meta.mats.mem === 40 && d.rec.best === 99999"), "確認で やめたら 何も変わらない");
    // 初期化する
    await ev(`window.__confirm = true`);
    await ev(`window.__cmd("reset")`);
    await sleep(500);
    check(await ev(`window.__log.some((l) => l === "confirm 初期化する")`), "本体の確かめ画面で 聞く");
    check(await D("d.rec.reached === 1 && d.rec.best === 0 && d.rec.bestStage === 1 && d.rec.biggest === null && d.rec.stage === 1 && Object.keys(d.rec.conquest).length === 0"), "ベスト・到達・最大の一撃・制覇が 消える");
    check(await D("d.meta.mats.mem === 0 && d.meta.mats.core === 0 && d.meta.mats.bp === 0 && d.meta.lv.cap === 0 && d.meta.lv.pow === 0 && d.meta.combos.length < 20"), "素材・強化・解放した役が 消える");
    check(await ev(`window.__store.rec.reached === 1 && window.__store.meta.mats.mem === 0 && Object.keys(window.__store.rec.conquest).length === 0`), "保存したものも 消える");
    check(await D("d.bindings.moveF[0] === 'KeyI'") && await ev(`JSON.stringify(window.__store.bind).includes("KeyI")`), "キーの割り当ては 残る");
    check(await ev(`window.__log.some((l) => l.startsWith("toast 進行度を初期化しました"))`), "知らせが出る");
    check(await D("d.scene === 'armory'") && await visible("#go") && await ev(`document.querySelector("#stages .on").textContent`) === "1" && await ev(`document.querySelectorAll("#stages button").length`) === 1, "武器庫にもどり、選べる面は 1 だけ");
    check(await ev(`[...document.querySelectorAll(".mats .chip b")].every((b) => b.textContent === "0")`), "素材の表示も 0");
    check(await D("d.ui.board.w === 5 && d.ui.board.h === 4"), "盤も はじめの広さ");
    // 戦いの最中に
    await click("#auto");
    await sortie();
    await D(`(d.rec.reached = 4, 0)`);
    await ev(`window.__cmd("reset")`);
    await sleep(500);
    check(await D("d.scene === 'armory' && d.rec.reached === 1 && !d.paused"), "戦いの最中でも 初期化して 武器庫へ");
    check(await ev(`document.getElementById("overlay").hidden`), "中断の画面は 残らない");
  },

  // 危険の合図：上から・下から
  async threat() {
    await click("#auto");
    await sortie();
    await G("(g.p.inv = 99, g.bullets.clear(), 0)");
    const T = () => G("(() => { const t = window.__fd().hudState.threat; return t ? { up: t.up, down: t.down, n: t.markers.length, ut: t.upText, dt: t.downText } : null; })()");
    check(await G("window.__fd().hudState.warn === true"), "合図は はじめから オン");
    // 真上から
    await G("(g.bullets.add({ x: g.p.x, y: g.p.y + 9, z: g.p.z, pitch: -Math.PI / 2, speed: 5, r: 0.5 }), 0)");
    check(await until("window.__fd().hudState.threat && window.__fd().hudState.threat.up > 0.1", 4000, 80), "真上から来る弾に「上」の合図");
    await shot("t1-up");
    const tu = await T();
    check(tu && tu.ut === "上から" && tu.down === 0 && tu.n >= 1, "上だけに 出る");
    await G("(g.bullets.clear(), 0)");
    // 真下から
    await G("(g.bullets.add({ x: g.p.x, y: g.p.y - 9, z: g.p.z, pitch: Math.PI / 2, speed: 5, r: 0.5 }), 0)");
    check(await until("window.__fd().hudState.threat && window.__fd().hudState.threat.down > 0.1", 4000, 80), "真下から来る弾に「下」の合図");
    await shot("t2-down");
    const td = await T();
    check(td && td.dt === "下から" && td.up === 0, "下だけに 出る");
    await G("(g.bullets.clear(), 0)");
    check(await until("window.__fd().hudState.threat.markers.length === 0", 3000, 80), "弾が なくなれば 消える");
    // 雨の印
    await G("(g.marks.push({ x: g.p.x + 1, z: g.p.z, r: 1.2, life: 2, max: 2, col: 4 }), 0)");
    check(await until("window.__fd().hudState.threat.up > 0.3 && window.__fd().hudState.threat.upText.includes('真上')", 3000, 80), "雨の印が 近いと「真上から落ちてくる」");
    await shot("t3-rain-mark");
  },

  // 高さ：上がる・下がる。弱点の高度計と、弾の高さを見る
  async altitude() {
    await sortie();
    await hold("KeyF");
    await mouse("mousedown", 0);
    await sleep(2500);
    await shot("a1-mid");
    await hold("Space"); await sleep(1300); await release("Space");
    await sleep(300);
    await shot("a2-high");
    console.log("  y =", await G("g.p.y.toFixed(2)"), "弱点", await G("g.boss.weak"));
    await hold("KeyC"); await sleep(2600); await release("KeyC");
    await sleep(300);
    await shot("a3-low");
    console.log("  y =", await G("g.p.y.toFixed(2)"), "弱点", await G("g.boss.weak"));
  },

  // 面ごと・フェーズごとの弾幕を見る
  async phases() {
    await sortie();
    await hold("KeyF");
    await mouse("mousedown", 0);
    const phases = Number(opt.phases || 3);
    for (let p = 0; p < phases; p++) {
      await sleep(Number(opt.wait || 6000));
      await shot(`p${p + 1}-a`);
      await sleep(1500);
      await shot(`p${p + 1}-b`);
      await G("(g.boss.hp = 1, 0)");
      await sleep(3600);
    }
  },
};

try {
  await boot();
  await SCENARIOS[opt.scenario || "basic"]();
} catch (e) {
  console.log("失敗:", e.message);
  process.exitCode = 1;
} finally {
  console.log(logs.length ? "コンソール:\n  " + logs.join("\n  ") : "コンソール: 出力なし");
  cleanup();
  process.exit(process.exitCode || 0);
}
