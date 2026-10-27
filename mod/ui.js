// 武器庫（ファイルを選んで、容量マップにはめこむ画面）と、中断・結果・操作設定の画面。HTML で作る。
import { ammoOf, KINDS, KIND_ORDER, EXT_LIST, TIERS, TIER_COLORS, fmtSize, KB, dmgOf, chargeOf, cellsOf } from "./ammo.js";
import { DIFFS, DIFF_ORDER } from "./stages.js";
import { evalCombos, foldMods, fxText, COMBO_GUIDE } from "./combos.js";
import { Board, shapeOf, orientation, bounds, autoPack } from "./puzzle.js";
import { MATS, MAT_ORDER, UPGRADES, levelOf, nextCost, boardSize, buy, buyCombo, metaFx, matsText } from "./meta.js";
import { ACTIONS, tokenLabel, bind, unbind, defaultBindings, ASSIST_CHOICES, defaultLook } from "./keys.js";
import { illust, weakIllust, puzzleIllust } from "./illust.js";
import { isRootFolder, conquestMult, challengeSets, EPITHET, RESIST, VULNERABLE } from "./folderboss.js";
import { SORTS, normalizeSort, emptyFilter, filterActive, filterItems, sortItems, searchQueryOf, filterText, nameHas } from "./filelist.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const comma = (n) => Math.round(n).toLocaleString("en-US");
const MAX_TILES = 600;
const dateOf = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString("ja-JP") : "");
const rgba = (c, a) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const TABS = [["files", "ファイル"], ["folder", "フォルダのボス"], ["dex", "弾の図鑑"], ["combos", "役の一覧"], ["garage", "整備場"]];
const ASSIST_LABEL = { 0: "なし", 5: "5度", 7: "7度", 10: "10度", 14: "14度", 360: "完全" };
const AUTO_LABEL = { off: "なし", weak: "弱め", strong: "強め" };

const CSS = `
html,body{margin:0;height:100%;background:#03030c;color:#dfe5ff;font:14px "Segoe UI","Yu Gothic UI","Meiryo",sans-serif;overflow:hidden;user-select:none}
*{scrollbar-width:thin;scrollbar-color:#3a4590 #0a0d26}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-track{background:#0a0d26}
::-webkit-scrollbar-thumb{background:#3a4590;border-radius:5px}
#app{position:fixed;inset:0}
#app canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#hud{pointer-events:none}
.screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(3,3,14,.72);backdrop-filter:blur(3px)}
.screen[hidden]{display:none}
#overlay{z-index:5}
button{font:inherit;color:#dfe5ff;background:#151a3c;border:1px solid #3a4590;border-radius:6px;padding:6px 14px;cursor:pointer}
button:hover{background:#1f2755;border-color:#7a8cff}
button:disabled{opacity:.4;cursor:default}
button.go{background:linear-gradient(180deg,#ff7a45,#e0412c);border-color:#ffb08a;color:#fff;font-weight:800;font-size:18px;padding:9px 18px;letter-spacing:.08em}
button.go:hover{filter:brightness(1.12)}
.arm{width:min(1140px,calc(100% - 20px));height:min(700px,calc(100% - 16px));display:grid;grid-template-rows:auto 1fr;gap:8px}
.arm header{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}
.arm h1{margin:0;font-size:26px;letter-spacing:.06em;background:linear-gradient(90deg,#7df3ff,#ff7ad1);-webkit-background-clip:text;background-clip:text;color:transparent}
.arm h1 small{display:block;font-size:12px;letter-spacing:0;color:#8e9bd6;font-weight:400;margin-top:2px;-webkit-text-fill-color:#8e9bd6}
.hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.mats{display:flex;gap:6px}
.chip{display:flex;align-items:baseline;gap:5px;padding:3px 9px;border:1px solid #2b3470;border-radius:14px;background:#0a0d26;font-size:12px;color:#9fb3ff}
.chip b{color:#ffe28a;font-size:14px;font-variant-numeric:tabular-nums}
.rec{font-size:12px;color:#9fb3ff;text-align:right;line-height:1.6}
.rec b{color:#ffe28a;font-weight:700}
.arm main{display:grid;grid-template-columns:1fr 396px;gap:10px;min-height:0}
.panel{background:rgba(10,13,38,.86);border:1px solid #2b3470;border-radius:10px;min-height:0;min-width:0;display:flex;flex-direction:column}
.panel h2{display:flex;justify-content:space-between;gap:8px;margin:0;padding:9px 14px 7px;font-size:13px;letter-spacing:.1em;color:#8fa0ff;border-bottom:1px solid #222a60;font-weight:700}
.tabs{display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid #222a60}
.tabs button{border:0;border-radius:8px 8px 0 0;background:transparent;color:#8fa0ff;padding:7px 16px;font-weight:700;font-size:13px}
.tabs button:hover{background:#171d49}
.tabs button.on{background:#222b66;color:#fff}
.tabbody{flex:1;min-height:0;display:flex;flex-direction:column}
.tools{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #1d2456}
.tools .path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;color:#9fb3ff;font-size:12.5px}
.list{flex:1;overflow:auto;padding:4px 6px 8px}
.filters{padding:6px 10px 4px;border-bottom:1px solid #1d2456;display:flex;flex-direction:column;gap:5px}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.fchip{padding:2px 9px;font-size:11.5px;border-radius:12px;background:#0a0d26;border:1px solid #2b3470;color:#9fb3ff}
.fchip b{display:inline-block;width:15px;height:15px;line-height:15px;border-radius:4px;background:var(--c);color:#06081a;text-align:center;margin-right:4px;font-size:10.5px}
.fchip.t{border-left:4px solid var(--c)}
.fchip.on{border-color:var(--c);background:rgba(255,255,255,.12);color:#fff}
.frow{display:flex;align-items:center;gap:10px;font-size:12px;color:#9fb3ff}
.frow .sp{flex:1}
.frow select,.tools input{font:inherit;font-size:12.5px;color:#dfe5ff;background:#0a0d26;border:1px solid #3a4590;border-radius:6px;padding:3px 6px}
.tools input{width:190px;user-select:text}
.frow button{padding:3px 10px;font-size:12px}
#fcount{color:#ffe28a}
.dirs{display:flex;flex-wrap:wrap;gap:5px;padding:2px 8px 6px}
.dirchip{padding:2px 10px;font-size:12px;border-radius:6px;background:#1a2152;border-color:#2b3470;color:#cfd8ff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;padding:4px 8px 10px}
.tile{position:relative;height:84px;border:1px solid #232b66;border-radius:8px;background:#0a0d26;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;align-items:center}
.tile:hover{border-color:var(--c);background:#141a45}
.tile .tg{position:absolute;left:4px;top:4px;width:17px;height:17px;line-height:17px;text-align:center;border-radius:5px;background:var(--c);color:#06081a;font-weight:800;font-size:11px}
.tile .tp{position:absolute;right:5px;top:4px;color:#ffe28a;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.tile .ts{flex:1;display:flex;align-items:center;justify-content:center;padding-top:14px}
.tile .tn{font-size:10.5px;color:var(--c);padding:0 0 5px;font-weight:700}
.tile .tm{position:absolute;left:0;right:0;bottom:0;height:3px;opacity:.9}
.tile.loaded{border-color:rgba(255,226,138,.7);background:rgba(255,226,138,.08)}
.tile.loaded::after{content:"盤";position:absolute;left:4px;top:24px;font-size:10px;background:#ffe28a;color:#111;border-radius:3px;padding:0 5px;font-weight:800}
.tile.holding{border-color:#7df3ff;background:rgba(125,243,255,.14)}
.shp{display:block;margin:auto}
.empty{padding:26px;text-align:center;color:#6f7cc0}
.info{margin:0 10px 10px;padding:6px 12px;background:#0a0d26;border:1px solid #232b66;border-radius:8px;min-height:86px;font-size:12.5px;line-height:1.6;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px 12px}
.info .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;grid-column:1 / 2}
.info .nm b{color:#fff}
.info .dim{color:#7d88c8;font-size:12px}
.info .d.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info .t{display:flex;gap:8px;align-items:center;font-size:14px;font-weight:700}
.info .t .badge{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#06081a;font-weight:800}
.info .d{color:#aeb9ee;grid-column:1 / 2}
.info .sp{grid-row:1 / 5;grid-column:2;display:flex;align-items:center}
.info em{font-style:normal;color:#ffe28a}
.side .sidebody{flex:1;min-height:0;overflow:auto;padding-bottom:4px}
.panel h2 .use{color:#9fb3ff;letter-spacing:0;font-weight:600;font-size:12px}
.capbar{height:4px;margin:0;background:#121739;border-radius:3px;overflow:hidden}
.capbar i{display:block;height:100%;background:linear-gradient(90deg,#4df2ff,#ff73b3)}
.holdbar{display:flex;align-items:center;gap:10px;margin:8px 12px 4px;padding:4px 10px;height:46px;box-sizing:border-box;overflow:hidden;background:#0a0d26;border:1px solid #232b66;border-radius:8px;font-size:12px;color:#aeb9ee;line-height:1.6}
.holdbar.on{border-color:#7df3ff;background:rgba(125,243,255,.08)}
.holdbar b{color:#fff;font-size:13px}
.holdbar .hs{min-width:44px;display:flex;justify-content:center}
.holdbar small{color:#8fa0ff}
.holdbar button{margin-left:auto;padding:3px 10px;font-size:12px;white-space:nowrap}
.holdbar div{min-width:0}
.board{display:grid;margin:4px auto 6px;width:max-content;background:#070920;border:1px solid #2b3470;border-radius:6px;padding:4px}
.cell{box-sizing:border-box;border:1px solid #1a2152;background:#0b0e2b;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#06081a;cursor:pointer}
.cell.f{border-color:rgba(255,255,255,.12)}
.cell.f.t{border-top:2px solid rgba(255,255,255,.85)}
.cell.f.r{border-right:2px solid rgba(255,255,255,.85)}
.cell.f.b{border-bottom:2px solid rgba(255,255,255,.85)}
.cell.f.l{border-left:2px solid rgba(255,255,255,.85)}
.cell.hot{box-shadow:inset 0 0 0 2px rgba(255,216,74,.9)}
.cell.pv.ok{background:rgba(115,255,140,.55)!important}
.cell.pv.bad{background:rgba(255,90,100,.55)!important}
.acts{display:flex;gap:8px;padding:0 12px 6px}
.acts button{padding:4px 10px}
.acts button{flex:1;font-size:12.5px}
.combos{margin:0 12px 8px;padding:8px 12px;background:#0a0d26;border:1px solid #5a4a14;border-radius:8px}
.combos .ch{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#ffd84a;font-weight:700;margin-bottom:4px;letter-spacing:.06em}
.combos .ch button{padding:2px 8px;font-size:11.5px;letter-spacing:0}
.combos .none{color:#7d88c8;font-size:12px;line-height:1.7}
.pills{display:flex;flex-wrap:wrap;gap:4px 5px}
.pill{padding:1px 9px;border-radius:11px;background:rgba(255,216,74,.14);border:1px solid rgba(255,216,74,.35);color:#ffe28a;font-size:12px;font-weight:700;cursor:default}
.combos .total{margin:2px 0 6px;padding:5px 8px;background:rgba(255,216,74,.1);border-radius:6px;font-size:12px;color:#ffe28a;line-height:1.7}
.combos .missed{margin-top:6px;padding:5px 8px;background:rgba(255,122,90,.1);border-radius:6px;font-size:12px;color:#ffae8a;line-height:1.7}
.foot{padding:6px 12px 10px;border-top:1px solid #222a60}
.opts{display:flex;flex-direction:column;gap:6px;padding:0 0 8px}
.opts .line{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#9fb3ff}
.opts .line b{min-width:44px}
.seg{display:flex;gap:4px;flex-wrap:wrap}
.seg button{padding:3px 9px;font-size:12px}
.seg button.on{background:#3a4590;border-color:#9fb0ff;color:#fff}
.foot .go{width:100%}
.msg{padding:0 12px 4px;min-height:18px;font-size:12px;color:#ffb08a}
.scroll{flex:1;min-height:0;overflow:auto;padding:10px 12px 12px}
.lead{color:#aeb9ee;font-size:12.5px;line-height:1.8;margin:0 0 10px}
.lead b{color:#ffe28a}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.kc{background:#0a0d26;border:1px solid #232b66;border-radius:10px;padding:8px 10px 10px}
.kc .kh{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.kc .kh b{font-size:15px}
.kc .kh small{margin-left:auto;color:#8fa0ff;font-size:11.5px}
.kc .badge{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#06081a;font-weight:800}
.kc svg.illust{display:block;width:100%;height:auto;background:#05061a;border-radius:6px;border:1px solid #1a2152}
.kc .kd{margin-top:6px;font-size:12.5px;color:#cfd8ff;line-height:1.7}
.kc .kx{margin-top:3px;font-size:11.5px;color:#7d88c8;line-height:1.6}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tbl th{text-align:left;color:#8fa0ff;font-weight:700;padding:4px 6px;border-bottom:1px solid #2b3470}
.tbl td{padding:5px 6px;border-bottom:1px solid #1d2456;vertical-align:top}
.tbl td:first-child{white-space:nowrap;color:#ffe28a;font-weight:700}
.tbl tr.on td{background:rgba(255,216,74,.12)}
.tbl tr.on td:first-child::before{content:"成立 ";color:#7df3ff;font-size:11px}
.tbl tr.lock td{color:#7d88c8}
.tbl tr.lock td:first-child{color:#8a8fb5}
.tbl td.st{text-align:right;white-space:nowrap}
.tbl button{padding:2px 9px;font-size:12px}
.up{display:grid;grid-template-columns:150px 1fr auto;gap:4px 12px;align-items:center;padding:8px 10px;border:1px solid #232b66;border-radius:8px;background:#0a0d26;margin-bottom:8px}
.up b{font-size:14px}
.up .nt{color:#aeb9ee;font-size:12.5px}
.up .pips{display:flex;gap:3px;grid-column:2;grid-row:2}
.up .pips i{width:14px;height:6px;border-radius:2px;background:#1a2152}
.up .pips i.on{background:linear-gradient(90deg,#4df2ff,#ff73b3)}
.up button{grid-column:3;grid-row:1 / 3;padding:6px 12px;font-size:12.5px}
.exrow{display:flex;align-items:center;gap:12px;margin:6px 0 8px}
.st{color:#9fb3ff;font-size:12.5px}
.flb{display:grid;grid-template-columns:236px 1fr;gap:12px;align-items:start}
.fld{position:sticky;top:0}
.fll{display:flex;flex-direction:column;gap:5px}
.fll h4{margin:8px 0 2px;font-size:12px;color:#8fa0ff;letter-spacing:.08em}
.cand{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #232b66;border-left:4px solid var(--c);border-radius:8px;background:#0a0d26;cursor:pointer}
.cand:hover{background:#141a45}
.cand.sel{border-color:var(--c);background:rgba(255,255,255,.1)}
.cand.locked{opacity:.72}
.cg{flex:none;font-weight:800;color:#241a00;background:#ffd84a;border-radius:10px;padding:0 8px;font-size:12px}
.cand.locked .cg{background:#6f7cc0;color:#0a0d26}
.cb{display:flex;flex-direction:column;min-width:0;flex:1}
.cb b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.cb small{color:#9fb3ff;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ck{flex:none;width:18px;height:18px;line-height:18px;text-align:center;border-radius:5px;color:#06081a;font-weight:800;font-size:11px}
.fpath{margin:2px 0 8px;color:#9fb3ff;font-size:12.5px;word-break:break-all}
.fpath b{color:#ffd84a}
.dim{color:#7d88c8;font-size:12px;line-height:1.7}
.fb{border:1px solid var(--c);border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(10,13,38,.9));padding:10px 14px 12px}
.fbt{display:flex;align-items:center;gap:10px}
.fbn{font-size:20px;font-weight:800;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grade{padding:1px 10px;border-radius:12px;background:#ffd84a;color:#241a00;font-weight:800;font-size:13px}
.fbt small{color:#ffae8a;font-size:12px}
.fbs{color:#cfd8ff;margin:3px 0 8px;font-size:13px}
.gate{margin:4px 0 8px;padding:5px 9px;border-radius:6px;background:rgba(255,122,90,.1);color:#ffae8a;font-size:12.5px;line-height:1.7}
.gate b{color:#ffd84a}
.bars{display:flex;flex-direction:column;gap:3px;margin:6px 0 8px}
.bar{display:grid;grid-template-columns:64px 1fr 40px;align-items:center;gap:8px;font-size:12px}
.bar i{display:block;height:8px;border-radius:4px;background:#121739;overflow:hidden}
.bar u{display:block;height:100%;border-radius:4px;text-decoration:none}
.bar b{text-align:right;color:#cfd8ff;font-variant-numeric:tabular-nums}
.forms{margin:4px 0 8px;padding-left:22px;color:#cfd8ff;font-size:12.5px;line-height:1.7}
.fm{font-size:12.5px;color:#cfd8ff;line-height:1.8}
.fm .ok{color:#73ff8c}
.fm .ng{color:#ff9f7a}
.sum{margin:0 0 10px;padding:7px 10px;background:rgba(255,216,74,.08);border:1px solid #5a4a14;border-radius:8px;color:#ffe28a;font-size:12.5px;line-height:1.7}
.card{width:min(520px,calc(100% - 32px));max-height:calc(100% - 28px);overflow:auto;background:rgba(10,13,38,.95);border:1px solid #3a4590;border-radius:12px;padding:22px 26px;box-shadow:0 10px 60px #000b;box-sizing:border-box}
.card.wide{width:min(780px,calc(100% - 28px))}
.card h1{margin:0 0 6px;font-size:26px;letter-spacing:.08em}
.card .sub{color:#9fb3ff;margin-bottom:14px}
.card table.res{width:100%;border-collapse:collapse;margin:8px 0 16px}
.card table.res td{padding:4px 0;border-bottom:1px solid #1d2456}
.card table.res td:last-child{text-align:right;color:#ffe28a;font-variant-numeric:tabular-nums}
.card .btns{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.card .help{font-size:12.5px;color:#aeb9ee;line-height:1.9;margin:6px 0 14px}
.card .got{margin:0 0 14px;padding:8px 12px;border:1px solid #5a4a14;border-radius:8px;background:rgba(255,216,74,.08);color:#ffe28a;line-height:1.8}
.fatal{padding:30px;max-width:520px;line-height:1.9}
.kset{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px;margin:8px 0 14px;font-size:12.5px;color:#9fb3ff}
.kset .line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kset .line b{min-width:64px;color:#cfd8ff}
.kset input[type=range]{width:150px}
.kt{width:100%;border-collapse:collapse;font-size:13px}
.kt th{text-align:left;color:#8fa0ff;padding:8px 6px 3px;letter-spacing:.1em;font-size:12px}
.kt td{padding:3px 6px;border-bottom:1px solid #1a2152}
.kt td:first-child{width:46%;color:#cfd8ff}
.kb{min-width:92px;padding:3px 8px;font-size:12.5px}
.kb.none{color:#6f7cc0}
.kb.cap{background:#3a4590;border-color:#ffe28a;color:#ffe28a}
`;

function badge(kind) {
  const k = KINDS[kind];
  return `<span class="badge" style="background:${k.color}">${k.glyph}</span>`;
}

// マスの形の小さな絵
function shapeSvg(cells, color, cs = 5) {
  const { w, h } = bounds(cells);
  return `<svg class="shp" width="${w * cs}" height="${h * cs}" viewBox="0 0 ${w} ${h}">${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" stroke="#0a0d26" stroke-width=".12"/>`).join("")}</svg>`;
}

export function createUi(root, host) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  root.innerHTML = `<canvas id="gl"></canvas><canvas id="hud"></canvas><div class="screen" id="armory"></div><div class="screen" id="overlay" hidden></div>`;
  const $ = (id) => document.getElementById(id);
  let uidSeq = 1;

  // ---- 武器庫の状態 ----
  const A = {
    folder: null, explore: { state: "idle", nodes: [], visited: 0, stoppedBy: "", truncatedAny: false }, exploreCache: new Map(), pick: null, items: [], total: 0, sort: "size", filter: emptyFilter(), found: null, searching: false,
    board: new Board(5, 4), hold: null, cell: null, place: null,
    tab: "files", stage: 1, reached: 1, diff: "normal", rec: {}, meta: null, bindings: defaultBindings(), look: defaultLook(),
    msg: "", hover: null, practice: false, fresh: true, cap: null, skipClick: false,
  };

  // 表示するものを組みなおす：フォルダ（名前でだけ しぼる）と、しぼりこんで並べたファイル
  function rebuild() {
    let dirs = [], files;
    if (A.found) files = A.found.entries.filter((e) => e.kind !== "folder").map((e) => ({ type: "file", e, a: ammoOf(e) }));
    else {
      const es = (A.folder && A.folder.entries) || [];
      dirs = es.filter((e) => e.kind === "folder" && !e.hidden).map((e) => ({ type: "dir", e }));
      files = es.filter((e) => e.kind === "file" && !e.hidden).map((e) => ({ type: "file", e, a: ammoOf(e) }));
    }
    A.total = files.length;
    if (A.filter.text.trim()) dirs = dirs.filter((d) => nameHas(d.e.name, A.filter.text));
    dirs.sort((a, b) => a.e.name.localeCompare(b.e.name, "ja", { numeric: true }));
    A.items = [...dirs, ...sortItems(filterItems(files, A.filter), A.sort)];
  }

  const ammoAt = (it) => it.a || (it.a = ammoOf(it.e));
  const fresh = (a) => ({ ...a, uid: uidSeq++ });
  const pieceByKey = (key) => A.board.list().find((p) => p.ammo.key === key);
  const kindKey = (i) => { const t = A.bindings[`kind${i + 1}`][0]; return t ? tokenLabel(t) : "未設定"; };
  let built = false;
  const holdCells = () => orientation(shapeOf(A.hold.ammo), A.hold.rot);
  const mats = () => (A.meta ? A.meta.mats : { mem: 0, core: 0, plate: 0, bp: 0 });

  // ---- 表示：ひと続きの部品に分けて、必要なところだけ描きなおす ----
  // さわっているファイルの詳細。名前・大きさ・更新日は ここに出る（一覧のマスには 出さない）
  function infoHtml(a, e) {
    if (!a) return `<div class="d" style="grid-column:1 / 3">マスに触れると、名前と大きさが ここに出ます。押すと持ち上がり、盤の上でクリックして置きます。ダブルクリックで 空いた所へ自動で置きます。R か右クリックで回せます。ファイルは読むだけで、書き換えも削除もしません。</div>`;
    const k = KINDS[a.kind], stars = "★".repeat(a.tier) + "☆".repeat(5 - a.tier), day = e ? dateOf(e.modified) : "";
    return `<div class="t">${badge(a.kind)}<span style="color:${k.color}">${k.name}</span><span style="color:${TIER_COLORS[a.tier]}">${TIERS[a.tier].name}</span><span style="color:#ffe28a;font-size:12px">${stars}</span></div>
      <div class="sp">${shapeSvg(shapeOf(a), k.color, 8)}</div>
      <div class="nm"><b>${esc(a.name)}</b>　<em>${fmtSize(a.bytes)}</em>${day ? `　<span class="dim">${esc(day)}</span>` : ""}</div>
      <div>威力 <em>${comma(a.dmg)}</em>　溜め <em>${a.charge.toFixed(1)}秒</em>　<em>${a.cells}</em> マス</div>
      <div class="d one">${esc(k.desc)}</div>`;
  }

  function renderHeader() {
    const rec = A.rec, bg = rec.biggest, m = mats();
    $("hd").innerHTML = `
      <div class="mats">${MAT_ORDER.map((id) => `<span class="chip" title="${esc(MATS[id].note)}">${MATS[id].name}<b>${m[id]}</b></span>`).join("")}</div>
      <div class="rec">ベスト <b>${comma(rec.best || 0)}</b>　到達 <b>第${rec.bestStage || 1}面</b>${bg ? `<br>最大の一撃 <b>${esc(bg.name)}</b> ${fmtSize(bg.bytes)} で <b>${comma(bg.dmg)}</b>` : ""}</div>
      <button id="keys">操作設定</button>`;
  }

  function renderTabs() {
    $("tabs").innerHTML = TABS.map(([id, label]) => `<button data-tab="${id}" class="${A.tab === id ? "on" : ""}">${label}</button>`).join("");
  }

  // 左のパネル「ファイル」：しぼりこみ・並べかたと、グリッド
  function filesHtml() {
    return `<div id="ftools"></div><div class="list" id="list"></div>`;
  }

  // 上の道具（行き先・名前でしぼる・種類・段・並べかた・下の階層）。しぼりこみの状態が変わったときも ここは作りなおさない
  function renderFilters() {
    const el = $("ftools");
    if (!el) return;
    const f = A.filter;
    const path = A.found ? `下の階層のけっか　${esc((A.folder && A.folder.name) || "")}以下` : esc((A.folder && A.folder.path) || "");
    el.innerHTML = `<div class="tools">
        ${A.found ? `<button id="back">もどる</button>` : `<button id="up">上へ</button>`}
        <span class="path" title="${path}">${path}</span>
        <input id="q" type="search" placeholder="名前でしぼる　* ? も使えます" value="${esc(f.text)}" autocomplete="off">
      </div>
      <div class="filters">
        <div class="chips">${KIND_ORDER.map((k) => `<button class="fchip${f.kinds.includes(k) ? " on" : ""}" data-fk="${k}" style="--c:${KINDS[k].color}"><b>${KINDS[k].glyph}</b>${KINDS[k].name}</button>`).join("")}</div>
        <div class="chips">${TIERS.map((t, i) => `<button class="fchip t${f.tiers.includes(i) ? " on" : ""}" data-ft="${i}" style="--c:${TIER_COLORS[i]}">${t.name}</button>`).join("")}</div>
        <div class="frow">
          <label>並べかた <select id="sortSel">${SORTS.map((s) => `<option value="${s.id}"${A.sort === s.id ? " selected" : ""}>${s.label}</option>`).join("")}</select></label>
          <span id="fcount"></span>
          <button id="fclear">しぼりこみをやめる</button>
          <span class="sp"></span>
          <button id="find" title="いまのしぼりこみの条件で、このフォルダの下の階層も さがします">下の階層もさがす</button>
        </div>
      </div>`;
    syncFilters();
  }

  // しぼりこみの状態を、道具の見た目に 映す（入力欄は さわらない）
  function syncFilters() {
    const f = A.filter;
    for (const b of document.querySelectorAll("[data-fk]")) b.classList.toggle("on", f.kinds.includes(b.dataset.fk));
    for (const b of document.querySelectorAll("[data-ft]")) b.classList.toggle("on", f.tiers.includes(Number(b.dataset.ft)));
    const n = A.items.filter((it) => it.type === "file").length;
    const c = $("fcount");
    if (c) c.textContent = filterActive(f) ? `${n} 件 / ${A.total} 件` : `${n} 件`;
    const x = $("fclear");
    if (x) x.disabled = !filterActive(f);
    const fb = $("find");
    if (fb) { fb.disabled = A.searching; fb.textContent = A.searching ? "さがし中…" : "下の階層もさがす"; }
  }

  function tileHtml(it, i) {
    const a = ammoAt(it), K = KINDS[a.kind], cells = shapeOf(a), { w, h } = bounds(cells);
    const cs = Math.max(6, Math.min(13, Math.floor(56 / Math.max(w, h))));
    const where = A.found ? `\n${String(it.e.path)}` : "";
    return `<div class="tile" data-i="${i}" data-k="${esc(a.key)}" data-name="${esc(a.name)}" title="${esc(`${a.name}　${fmtSize(a.bytes)}${where}`)}" style="--c:${K.color}"><span class="tg">${K.glyph}</span><span class="tp">${comma(a.dmg)}</span><div class="ts">${shapeSvg(cells, K.color, cs)}</div><span class="tn">${K.name}</span><i class="tm" style="background:${TIER_COLORS[a.tier]}"></i></div>`;
  }

  function renderGrid() {
    const list = $("list");
    if (!list) return;
    const dirs = [], tiles = [];
    A.items.forEach((it, i) => {
      if (it.type === "dir") dirs.push(`<button class="dirchip" data-i="${i}" title="${A.rec.conquest && A.rec.conquest[it.e.path] ? "制覇ずみ" : ""}">${A.rec.conquest && A.rec.conquest[it.e.path] ? "✓" : "▸"} ${esc(it.e.name)}</button>`);
      else if (tiles.length < MAX_TILES) tiles.push(tileHtml(it, i));
    });
    const nFiles = A.items.filter((it) => it.type === "file").length;
    const more = nFiles > MAX_TILES ? `<div class="empty">ほか ${nFiles - MAX_TILES} 件。しぼりこむと 見つけやすくなります</div>` : "";
    const empty = !nFiles ? `<div class="empty">${A.searching ? "さがしています…" : A.found ? "条件に合うファイルは 見つかりませんでした" : filterActive(A.filter) ? "しぼりこみに合うファイルが ありません" : "このフォルダには、ファイルがありません"}</div>` : "";
    list.innerHTML = `${dirs.length ? `<div class="dirs">${dirs.join("")}</div>` : ""}<div class="grid">${tiles.join("")}</div>${more}${empty}`;
    list.scrollTop = 0;
    markRows();
  }

  function dexHtml() {
    const cards = KIND_ORDER.map((k, i) => {
      const K = KINDS[k];
      return `<div class="kc"><div class="kh">${badge(k)}<b style="color:${K.color}">${K.name}</b><small>キー ${esc(kindKey(i))}</small></div>${illust(k, 236)}<div class="kd">${esc(K.desc)}</div><div class="kx">この種類になるもの　${esc(EXT_LIST[k] || "")}</div></div>`;
    }).join("");
    const tiers = TIERS.map((t, i) => {
      const b = Math.max(t.min, KB);
      return `<tr><td style="color:${TIER_COLORS[i]}">${t.name}</td><td>${i ? fmtSize(t.min) + " から" : "それ未満"}</td><td>威力 ${comma(dmgOf(b))}</td><td>溜め ${chargeOf(b).toFixed(1)}秒</td><td>${cellsOf(b)} マス</td></tr>`;
    }).join("");
    return `<div class="scroll">
      <p class="lead">ファイルの<b>種類</b>で、弾の撃ち方が変わります。ファイルの<b>大きさ</b>で、威力・溜め・マスの数・見た目が変わります。出撃したら、下のキーで種類を選び、同じ種類は大きいファイルから使います。</p>
      <div class="cards">${cards}
        <div class="kc"><div class="kh"><b style="color:#ffd84a">弱点</b></div>${weakIllust()}<div class="kd">ボスには 上・正面・下 の弱点があり、数秒おきに移ります。当たった場所が弱点の向きなら 1.8 倍。上から撃ち下ろしたり、下から撃ち上げたりして狙います。</div></div>
        <div class="kc"><div class="kh"><b style="color:#7df3ff">容量マップ</b></div>${puzzleIllust()}<div class="kd">ファイルは、大きいほど多くのマスを使う固有の形です。盤にすきまなくはめるほど、たくさん持っていけます。盤は整備場で広がります。</div></div>
      </div>
      <p class="lead" style="margin-top:12px"><b>大きさの段</b></p>
      <table class="tbl"><tr><th>段</th><th>大きさ</th><th>威力</th><th>溜め</th><th>マス</th></tr>${tiers}</table>
    </div>`;
  }

  function combosTabHtml() {
    const ev = evalCombos(A.board.ammos(), A.meta ? A.meta.combos : null), on = new Set(ev.list.map((c) => c.id));
    const active = (g) => on.has(g.id) || [...on].some((id) => id.startsWith(g.id + "-"));
    const open = (id) => !A.meta || A.meta.combos.includes(id);
    const bp = mats().bp;
    const rows = COMBO_GUIDE.map((g) => {
      const o = open(g.id);
      const st = o ? `<span style="color:#7df3ff">解放ずみ</span>` : `<button data-unlock="${g.id}"${bp >= g.cost ? "" : " disabled"}>設計図 ${g.cost} で解放</button>`;
      return `<tr class="${o ? (active(g) ? "on" : "") : "lock"}"><td>${esc(g.name)}</td><td>${esc(g.cond)}</td><td>${esc(g.guide)}</td><td class="st">${st}</td></tr>`;
    }).join("");
    return `<div class="scroll"><p class="lead">マガジンに入れたファイルの組み合わせで、役がつきます。役は 出撃した面のあいだ、能力になります。<b>解放した役だけ</b>がつきます。新しい役は、面をクリアして集めた<b>設計図</b>で解放します。設計図 <b>${bp}</b></p>
      <table class="tbl"><tr><th>役</th><th>条件</th><th>効果</th><th></th></tr>${rows}</table></div>`;
  }

  // ---- フォルダのボス：挑めるフォルダを さがして、一覧から選ぶ ----
  const sets = () => challengeSets(A.explore.nodes, A.reached, A.rec.conquest || {});
  // いま選んでいるボス（挑めるものも、まだ早いものも）
  const pickedBoss = () => { const s = sets(); return [...s.open, ...s.later].find((fb) => fb.base.info.path === A.pick) || null; };

  const candHtml = (fb, locked) => {
    const K = KINDS[fb.main], sel = fb.base.info.path === A.pick;
    const sub = fb.teaser ? "ラスボス" : `${fmtSize(fb.bytes)}　${EPITHET[fb.main]}`;
    return `<div class="cand${sel ? " sel" : ""}${locked ? " locked" : ""}" data-cand="${esc(fb.base.info.path)}" style="--c:${rgba(fb.base.color, 1)}">
      <span class="cg">格 ${fb.grade}</span><span class="cb"><b>${fb.conquered ? "✓ " : ""}${esc(fb.name)}</b><small>${locked ? `あと ${fb.grade - A.reached} 面　` : ""}${esc(sub)}</small></span>${fb.teaser ? "" : `<span class="ck" style="background:${K.color}">${K.glyph}</span>`}</div>`;
  };

  function detailHtml(fb) {
    const conq = A.rec.conquest && A.rec.conquest[fb.base.info.path], mult = conquestMult(conq, fb.grade);
    const has = (k) => A.board.ammos().some((a) => a.kind === k);
    const bars = fb.teaser ? "" : fb.order.slice(0, 5).map((k) => `<div class="bar"><span style="color:${KINDS[k].color}">${KINDS[k].name}</span><i><u style="width:${Math.max(2, fb.shares[k] * 100)}%;background:${KINDS[k].color}"></u></i><b>${Math.round(fb.shares[k] * 100)}%</b></div>`).join("");
    const conqLine = conq && conq.clears > 0
      ? `<div class="fm"><b style="color:#7df3ff">制覇ずみ</b>　格 ${conq.S}　${conq.clears} 回　${mult < 1 ? `倒しなおしなので 素材は ${Math.round(mult * 100)}%。大きくなって格が上がれば 満額` : "格が上がったので 素材は 満額"}</div>`
      : `<div class="fm"><b>はじめての挑戦</b>　素材は 格 ${fb.grade} の面と同じ</div>`;
    const wait = fb.locked ? `<div class="gate">あと <b>${fb.grade - A.reached}</b> 面クリアすると 挑めます。${fb.teaser ? "ドライブの根は ラスボスです。中身は 到達が 8 になってから 数えます。" : "中身の予告だけ 見られます。"}</div>` : "";
    const go = fb.locked ? `<button class="go" id="fgo" disabled style="margin-left:auto;padding:6px 16px;font-size:15px;flex:none">まだ挑めない</button>` : `<button class="go" id="fgo" style="margin-left:auto;padding:6px 16px;font-size:15px;flex:none">このフォルダに挑む</button>`;
    return `<div class="fb" style="--c:${rgba(fb.base.color, 1)}">
        <div class="fbt"><span class="fbn" title="${esc(fb.base.info.path)}">${esc(fb.name)}</span><span class="grade">格 ${fb.grade}</span>${go}</div>
        <div class="fbs">${esc(fb.title)}${fb.teaser ? "" : `　フォルダ ${comma(fb.folders)} 個`}${fb.truncated && !fb.teaser ? "　途中まで" : ""}</div>
        ${wait}${fb.truncated && !fb.teaser ? `<div class="gate">大きすぎて 数えきれませんでした。巨大なフォルダとして あつかいます。</div>` : ""}
        <div class="bars">${bars}</div>
        ${fb.teaser ? "" : `<ol class="forms">${fb.phaseNames.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
        <div class="fm"><b style="color:#ffd84a">苦手</b>　${KINDS[fb.weakKind].name}の砲　ダメージ ×${VULNERABLE}　${has(fb.weakKind) ? `<span class="ok">盤に入っている</span>` : `<span class="ng">盤に入っていない</span>`}</div>
        <div class="fm"><b style="color:#9fb3ff">得意</b>　${KINDS[fb.main].name}の砲は 効きにくい ×${RESIST}</div>`}
        ${conqLine}
      </div>`;
  }

  function folderTabHtml() {
    const f = A.folder, ex = A.explore, running = ex.state === "running";
    const lead = `<p class="lead">いまの到達<b>第 ${A.reached} 面</b>で 挑めるフォルダを、ここから下で さがします。見つかった中から 好きな 1 つを選んで 戦います。サイズで強さの「格」が、拡張子の割合で弾幕の好みと 得意・苦手が決まります。ドライブの根は<b>ラスボス</b>。ほかのフォルダで拾った弾も 盤に入れて 持ってこられます。</p>`;
    if (!f) return `<div class="scroll">${lead}<div class="empty">フォルダが まだ開かれていません</div></div>`;
    const where = `<div class="fpath">${esc(f.path)}${isRootFolder(f) ? "　<b>ドライブの根</b>" : ""}</div>`;
    const status = running ? `<span class="st">さがしています…　調べたフォルダ ${ex.visited} 個</span>`
      : ex.state === "done" ? `<span class="st">${{ done: "さいごまで さがしました", budget: "調べる数の上限で 止めました", time: "時間の上限で 止めました", quota: "候補が たまったので 止めました", cancel: "やめました" }[ex.stoppedBy] || ""}　調べたフォルダ ${ex.visited} 個</span>` : "";
    const bar = `<div class="exrow">${running ? `<button id="fstop">やめる</button>` : `<button class="go" id="fexplore">${ex.state === "done" ? "もういちど さがす" : "挑めるフォルダを さがす"}</button>`}${status}</div>`;
    const s = sets();
    const list = [
      s.open.length ? `<h4>挑める　${s.open.length}</h4>${s.open.map((fb) => candHtml(fb, false)).join("")}` : "",
      s.later.length ? `<h4>まだ早い</h4>${s.later.map((fb) => candHtml(fb, true)).join("")}` : "",
    ].join("");
    const none = ex.state === "done" && !s.open.length ? `<div class="gate">いまの到達で挑めるフォルダは 見つかりませんでした。${ex.truncatedAny ? "数えきれない大きなフォルダが ありました。" : ""}別の場所を開いて さがすか、ふつうの面を進めて 到達を上げましょう。</div>` : "";
    const picked = pickedBoss();
    const detail = picked ? detailHtml(picked) : `<div class="empty" style="padding:30px 10px">${s.open.length || s.later.length ? "左の一覧から 1 つ 選んでください" : running ? "" : "「さがす」を押すと、挑めるフォルダが ここに並びます"}</div>`;
    return `<div class="scroll">${lead}${where}${bar}${none}<div class="flb"><div class="fll">${list}</div><div class="fld">${detail}</div></div></div>`;
  }

  function garageHtml() {
    const m = A.meta, [w, h] = boardSize(m);
    const rows = UPGRADES.map((u) => {
      const lv = levelOf(m, u.id), cost = nextCost(m, u.id), max = cost === null;
      let note = u.note;
      if (u.id === "cap") {
        const next = max ? null : boardSize({ lv: { cap: lv + 1 } });
        note = max ? `盤は ${w} × ${h}　これ以上は広がりません` : `盤が ${w} × ${h} から ${next[0]} × ${next[1]} に広がる`;
      }
      return `<div class="up"><b>${u.name}</b><span class="nt">${esc(note)}</span>
        <div class="pips">${u.costs.map((_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</div>
        <button data-buy="${u.id}"${max || m.mats[u.mat] < cost ? " disabled" : ""}>${max ? "最大" : `${MATS[u.mat].name} ${cost} で強化`}</button></div>`;
    }).join("");
    const fx = fxText(metaFx(m));
    return `<div class="scroll"><p class="lead">面をクリアすると素材が手に入ります。素材で、マガジンの広さ・攻撃力・ライフ・速さを伸ばせます。やられても、倒したぶんの素材が もらえます。</p>
      <div class="sum">いまの強化　${fx.length ? esc(fx.join("　")) : "まだありません"}</div>${rows}</div>`;
  }

  function renderBody() {
    const el = $("tabbody");
    el.innerHTML = A.tab === "files" ? filesHtml() : A.tab === "folder" ? folderTabHtml() : A.tab === "dex" ? dexHtml() : A.tab === "combos" ? combosTabHtml() : garageHtml();
    if (A.tab === "files") { renderFilters(); renderGrid(); }
  }

  function markRows() {
    const list = $("list");
    if (!list) return;
    const placed = new Set(A.board.list().map((p) => p.ammo.key)), hk = A.hold ? A.hold.ammo.key : null;
    list.querySelectorAll(".tile[data-k]").forEach((r) => {
      r.classList.toggle("loaded", placed.has(r.dataset.k));
      r.classList.toggle("holding", r.dataset.k === hk);
    });
  }

  function comboSets() {
    const ev = evalCombos(A.board.ammos(), A.meta ? A.meta.combos : null);
    return { ev, hot: new Set(ev.list.flatMap((c) => c.who)) };
  }

  function boardHtml(hot) {
    const b = A.board, cs = Math.min(38, Math.floor(372 / b.w), Math.floor(288 / b.h));
    const first = new Map();
    for (const p of b.list()) first.set(p.id, p.cells.map(([x, y]) => [p.x + x, p.y + y]).sort((a, c) => a[1] - c[1] || a[0] - c[0])[0].join(","));
    let cells = "";
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const id = b.idAt(x, y);
        if (!id) { cells += `<div class="cell" data-x="${x}" data-y="${y}" style="width:${cs}px;height:${cs}px"></div>`; continue; }
        const p = b.pieces.get(id), K = KINDS[p.ammo.kind];
        const cls = ["f"];
        if (b.idAt(x, y - 1) !== id) cls.push("t");
        if (b.idAt(x + 1, y) !== id) cls.push("r");
        if (b.idAt(x, y + 1) !== id) cls.push("b");
        if (b.idAt(x - 1, y) !== id) cls.push("l");
        if (hot.has(p.ammo.uid)) cls.push("hot");
        cells += `<div class="cell ${cls.join(" ")}" data-x="${x}" data-y="${y}" data-id="${id}" style="width:${cs}px;height:${cs}px;background:${rgba(K.rgb, 0.62)}">${first.get(id) === `${x},${y}` ? K.glyph : ""}</div>`;
      }
    }
    return `<div class="board" style="grid-template-columns:repeat(${b.w},${cs}px)">${cells}</div>`;
  }

  function holdHtml() {
    if (!A.hold) return `<div class="holdbar">ファイルを押して持ち上げ、盤にはめる。置いたものを押すと取れる。</div>`;
    const a = A.hold.ammo, K = KINDS[a.kind];
    return `<div class="holdbar on"><span class="hs">${shapeSvg(holdCells(), K.color, 9)}</span><div><b>${esc(a.name)}</b>　${a.cells} マス<br><small>盤をクリックで置く　R か右クリックで回す　Esc でやめる</small></div><button id="rot">回す</button></div>`;
  }

  function renderBoardArea() {
    const { ev, hot } = comboSets(), b = A.board, am = b.ammos(), total = am.reduce((s, a) => s + a.dmg, 0);
    $("bh").innerHTML = `<span>マガジン　${am.length} 個　総威力 ${comma(total)}</span><span class="use">使用 ${b.used()} / ${b.size} マス　盤 ${b.w} × ${b.h}</span>`;
    $("cap").innerHTML = `<div class="capbar"><i style="width:${(b.used() / b.size) * 100}%"></i></div>`;
    $("hold").innerHTML = holdHtml();
    $("board").innerHTML = boardHtml(hot);
    // 役
    const mods = foldMods(A.meta ? [...ev.list, { fx: metaFx(A.meta) }] : ev.list), base = DIFFS[A.diff].lives, rest = fxText(mods).filter((t) => !t.startsWith("ライフ"));
    const totalLine = `<div class="total">ライフ ${base + mods.lives}${rest.length ? "　" + esc(rest.join("　")) : ""}</div>`;
    const missed = ev.missed.length ? `<div class="missed">解放していない役　${esc(ev.missed.slice(0, 3).map((m) => `${m.name} 設計図 ${m.cost}`).join("　"))}${ev.missed.length > 3 ? `　ほか ${ev.missed.length - 3}` : ""}</div>` : "";
    $("combos").innerHTML = `<div class="combos"><div class="ch"><span>成立している役　${ev.list.length}</span><button data-tab="combos">役の一覧</button></div>${totalLine}${
      ev.list.length ? `<div class="pills">${ev.list.map((c) => `<span class="pill" title="${esc(fxText(c.fx).join("　"))}">${esc(c.name)}</span>`).join("")}</div>` : `<div class="none">同じ種類を そろえる。段を そろえる。拡張子や名前を そろえる。すると 役がついて、能力が上がります。</div>`
    }${missed}</div>`;
    $("msg").textContent = A.msg;
    $("go").textContent = `${am.length ? "出撃" : "弾なしで出撃"}${A.practice ? "　練習" : ""}`;
    markRows();
    paintPreview();
  }

  function renderFoot() {
    const stages = Array.from({ length: A.reached }, (_, i) => i + 1).slice(-6);
    $("foot").innerHTML = `<div class="opts">
        <div class="line"><b>面</b><span class="seg" id="stages">${stages.map((n) => `<button data-n="${n}" class="${n === A.stage ? "on" : ""}">${n}</button>`).join("")}</span></div>
        <div class="line"><b>難しさ</b><span class="seg" id="diffs">${DIFF_ORDER.map((d) => `<button data-d="${d}" class="${d === A.diff ? "on" : ""}">${DIFFS[d].name}</button>`).join("")}</span></div>
      </div><button class="go" id="go"></button>`;
  }

  function skeleton() {
    $("armory").innerHTML = `
      <div class="arm">
        <header>
          <h1>ファイル弾幕<small>ファイルを弾にして、ボスに撃ちこむ。大きいほどロマン砲。ファイルには一切さわりません。</small></h1>
          <div class="hd" id="hd"></div>
        </header>
        <main>
          <section class="panel">
            <div class="tabs" id="tabs"></div>
            <div class="tabbody" id="tabbody"></div>
            <div class="info" id="info"></div>
          </section>
          <section class="panel side">
            <h2 id="bh"></h2>
            <div id="cap"></div>
            <div class="sidebody">
              <div id="hold"></div>
              <div id="board"></div>
              <div class="acts"><button id="auto">おまかせ詰め</button><button id="clear">からにする</button></div>
              <div id="combos"></div>
              <div class="msg" id="msg"></div>
            </div>
            <div class="foot" id="foot"></div>
          </section>
        </main>
      </div>`;
    built = true;
    renderHeader(); renderTabs(); renderBody(); renderFoot(); renderBoardArea();
    $("info").innerHTML = infoHtml(A.hover);
  }

  // ---- 盤の上の操作 ----
  function paintPreview() {
    const el = $("board");
    if (!el || !el.firstElementChild) return;
    const kids = el.firstElementChild.children;
    for (const n of el.querySelectorAll(".pv")) n.classList.remove("pv", "ok", "bad");
    A.place = null;
    if (!A.hold || !A.cell) return;
    const cells = holdCells(), { w, h } = bounds(cells), b = A.board;
    // 盤に入る大きさなら、はみださないように 位置を寄せる
    const x0 = w <= b.w ? Math.max(0, Math.min(b.w - w, A.cell.x - (w >> 1))) : A.cell.x - (w >> 1);
    const y0 = h <= b.h ? Math.max(0, Math.min(b.h - h, A.cell.y - (h >> 1))) : A.cell.y - (h >> 1);
    const ok = b.canPlace(cells, x0, y0);
    A.place = { x: x0, y: y0, ok };
    for (const [cx, cy] of cells) {
      const x = x0 + cx, y = y0 + cy;
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) continue;
      kids[y * b.w + x].classList.add("pv", ok ? "ok" : "bad");
    }
  }

  function setMsg(m) { A.msg = m; const e = $("msg"); if (e) e.textContent = m; }

  function cancelHold() {
    const h = A.hold;
    A.hold = null;
    if (h && h.from && A.board.canPlace(orientation(shapeOf(h.ammo), h.from.rot), h.from.x, h.from.y)) A.board.place(h.ammo, h.from.rot, h.from.x, h.from.y);
  }

  function rotateHold() {
    if (!A.hold) return false;
    A.hold.rot = (A.hold.rot + 1) % 4;
    $("hold").innerHTML = holdHtml();
    paintPreview();
    return true;
  }

  function changed() { renderBoardArea(); if (A.tab === "combos") renderBody(); }

  function autoPlace(ammo) {
    const spot = A.board.findSpot(ammo);
    if (!spot) { setMsg("入りません。盤の空きが足りないか、形が合いません"); return false; }
    A.board.place(ammo, spot.rot, spot.x, spot.y);
    A.hold = null; A.msg = "";
    changed();
    return true;
  }

  // 威力と役で、詰めたものの よさを測る
  function loadScore(list) {
    const ev = evalCombos(list, A.meta ? A.meta.combos : null);
    return list.reduce((s, a) => s + a.dmg * (1 + ev.mods.dmgAll + (ev.mods.dmg[a.kind] || 0)), 0) + ev.mods.lives * 600 + ev.mods.shield * 250;
  }

  function autoFill() {
    cancelHold();
    const have = new Set(A.board.list().map((p) => p.ammo.key));
    const cands = A.items.filter((it) => it.type === "file" && !have.has(ammoAt(it).key)).map((it) => fresh(ammoAt(it))).sort((a, b) => b.dmg - a.dmg).slice(0, 160);
    if (!cands.length) return 0;
    const r = autoPack(A.board, cands, loadScore);
    A.board = r.b;
    return r.added.length;
  }

  function boardClick(cell) {
    const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
    if (A.hold) {
      A.cell = { x, y };
      paintPreview();
      if (!A.place || !A.place.ok) { setMsg("そこには置けません。はみだすか、重なっています"); return; }
      A.board.place(A.hold.ammo, A.hold.rot, A.place.x, A.place.y);
      A.hold = null; A.msg = "";
      changed();
      return;
    }
    const id = Number(cell.dataset.id);
    if (!id) return;
    const p = A.board.pieces.get(id);
    A.board.remove(id);
    A.hold = { ammo: p.ammo, rot: p.rot, from: { x: p.x, y: p.y, rot: p.rot } };
    A.cell = { x, y };
    A.msg = "";
    changed();
  }

  function rowClick(ev, it) {
    const a0 = ammoAt(it);
    if (ev.detail >= 2) {
      const ammo = A.hold && A.hold.ammo.key === a0.key ? A.hold.ammo : (pieceByKey(a0.key) || { ammo: fresh(a0) }).ammo;
      const cur = pieceByKey(a0.key);
      if (cur) A.board.remove(cur.id);
      A.hold = null;
      autoPlace(ammo);
      return;
    }
    const placed = pieceByKey(a0.key);
    if (placed) { A.board.remove(placed.id); A.msg = ""; changed(); return; }
    if (A.hold && A.hold.ammo.key === a0.key) return;
    cancelHold();
    const ammo = fresh(a0);
    A.hold = { ammo, rot: fitRot(ammo) };
    A.msg = "";
    changed();
  }

  // 盤の大きさに入る向きから はじめる
  function fitRot(ammo) {
    for (let r = 0; r < 4; r++) {
      const { w, h } = bounds(orientation(shapeOf(ammo), r));
      if (w <= A.board.w && h <= A.board.h) return r;
    }
    return 0;
  }

  function resizeBoard() {
    const [w, h] = boardSize(A.meta);
    if (A.board.w === w && A.board.h === h) return;
    const r = A.board.resized(w, h);
    A.board = r.board;
    if (r.dropped.length) A.msg = `${r.dropped.length} 個、盤に入らなくなりました`;
  }

  // しぼりこみ・並べかたが変わった：組みなおして、マスを描きなおす（入力欄は そのまま）
  function refilter() {
    rebuild();
    syncFilters();
    renderGrid();
  }

  // ---- クリック ----
  $("armory").addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-i],[data-x],[data-cand],button");
    if (!t) return;
    A.fresh = false;
    if (t.dataset.x !== undefined) return boardClick(t);
    if (t.dataset.cand !== undefined) { A.pick = t.dataset.cand; renderBody(); return; }
    if (t.dataset.i !== undefined) {
      const it = A.items[Number(t.dataset.i)];
      if (!it) return;
      if (it.type === "dir") host.openFolder(it.e); else rowClick(ev, it);
      return;
    }
    if (t.dataset.fk || t.dataset.ft) {
      const list = t.dataset.fk ? A.filter.kinds : A.filter.tiers, v = t.dataset.fk ? t.dataset.fk : Number(t.dataset.ft), at = list.indexOf(v);
      if (at >= 0) list.splice(at, 1); else list.push(v);
      refilter();
      return;
    }
    if (t.dataset.tab) { A.tab = t.dataset.tab; renderTabs(); renderBody(); return; }
    if (t.dataset.n) { A.stage = Number(t.dataset.n); host.prefs({ stage: A.stage }); renderFoot(); renderBoardArea(); return; }
    if (t.dataset.d) { A.diff = t.dataset.d; host.prefs({ diff: A.diff }); renderFoot(); renderBoardArea(); return; }
    if (t.dataset.buy) {
      const m = buy(A.meta, t.dataset.buy);
      if (m) { A.meta = m; resizeBoard(); host.metaChanged(m); renderHeader(); renderBody(); renderBoardArea(); }
      return;
    }
    if (t.dataset.unlock) {
      const m = buyCombo(A.meta, t.dataset.unlock);
      if (m) { A.meta = m; host.metaChanged(m); renderHeader(); renderBody(); renderBoardArea(); }
      return;
    }
    switch (t.id) {
      case "up": host.up(); break;
      case "back": A.found = null; rebuild(); renderFilters(); renderGrid(); break;
      case "fclear": A.filter = emptyFilter(); renderFilters(); refilter(); break;
      case "find": { const r = searchQueryOf(A.filter); host.find(r.query, r.defaulted); break; }
      case "fexplore": if (A.folder) { A.pick = null; A.explore = { state: "running", nodes: [], visited: 0, stoppedBy: "", truncatedAny: false }; renderBody(); host.explore(); } break;
      case "fstop": host.stopExplore(); break;
      case "fgo": startFolder(); break;
      case "rot": rotateHold(); break;
      case "keys": openKeys(null); break;
      case "auto": {
        const n = autoFill();
        A.msg = n ? "" : "入れられるファイルが ありません";
        changed();
        break;
      }
      case "clear": cancelHold(); A.hold = null; A.board.clear(); A.msg = ""; changed(); break;
      case "go": startRun(); break;
    }
  });

  // フォルダのボスに挑む。盤の弾は そのまま持っていく
  function startFolder() {
    const fb = pickedBoss();
    if (!fb || fb.locked) return;
    cancelHold();
    host.start({ ammos: A.board.ammos().map((a) => ({ ...a })), snapshot: snapshot(), stage: fb.grade, diff: A.diff, boss: fb });
  }

  function startRun() {
    cancelHold();
    host.start({ ammos: A.board.ammos().map((a) => ({ ...a })), snapshot: snapshot(), stage: A.stage, diff: A.diff });
  }

  $("armory").addEventListener("mouseover", (ev) => {
    const cellEl = ev.target.closest(".cell");
    const nc = cellEl ? { x: Number(cellEl.dataset.x), y: Number(cellEl.dataset.y) } : null;
    if ((nc && (!A.cell || nc.x !== A.cell.x || nc.y !== A.cell.y)) || (!nc && A.cell)) { A.cell = nc; paintPreview(); }
    const row = ev.target.closest("[data-i]");
    let a = null, e = null;
    if (row) { const it = A.items[Number(row.dataset.i)]; if (it && it.type === "file") { a = ammoAt(it); e = it.e; } }
    else if (cellEl && cellEl.dataset.id) { const p = A.board.pieces.get(Number(cellEl.dataset.id)); a = p ? p.ammo : null; }
    if (a === A.hover) return;
    A.hover = a;
    const info = $("info");
    if (info) info.innerHTML = infoHtml(a, e);
  });
  // 名前でしぼる・並べかた
  $("armory").addEventListener("input", (ev) => {
    if (ev.target.id === "q") { A.filter.text = ev.target.value; refilter(); }
  });
  $("armory").addEventListener("change", (ev) => {
    if (ev.target.id === "sortSel") { A.sort = normalizeSort(ev.target.value); host.prefs({ sort: A.sort }); refilter(); }
  });
  $("armory").addEventListener("contextmenu", (ev) => {
    if (ev.target.closest("input")) return;
    ev.preventDefault();
    if (rotateHold()) return;
    const cellEl = ev.target.closest(".cell");
    if (cellEl && cellEl.dataset.id) { A.board.remove(Number(cellEl.dataset.id)); A.msg = ""; changed(); }
  });
  $("armory").addEventListener("wheel", (ev) => {
    if (A.hold && ev.target.closest(".board")) { ev.preventDefault(); rotateHold(); }
  }, { passive: false });

  // 武器庫のキー：R で回す、Esc で持ったものを戻す、Enter で出撃
  window.addEventListener("keydown", (ev) => {
    if (A.cap || $("armory").hidden || !$("overlay").hidden || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (ev.target && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) {      // 入力中は、ゲームのキーを 横取りしない
      if (ev.code === "Escape") ev.target.blur();
      return;
    }
    if (ev.code === "KeyR" && A.hold) { ev.preventDefault(); rotateHold(); }
    else if (ev.code === "Escape" && A.hold) { ev.preventDefault(); cancelHold(); changed(); }
    else if (ev.code === "Enter" && !ev.repeat && ev.target === document.body) { ev.preventDefault(); startRun(); }
  });

  // ---- 重ねる画面 ----
  const ov = $("overlay");
  ov.addEventListener("click", (ev) => {
    if (A.skipClick) { A.skipClick = false; return; }       // マウスのボタンを割り当てたときの、そのあとの 1回の クリック
    const b = ev.target.closest("button");
    if (!b || !ov._on) return;
    ov._on(b);
  });
  ov.addEventListener("contextmenu", (ev) => ev.preventDefault());
  function overlay(html, on, cls = "") {
    ov.innerHTML = `<div class="card ${cls}">${html}</div>`;
    ov._on = on;
    ov.hidden = false;
  }

  // ---- 操作設定 ----
  function keysHtml() {
    const groups = [...new Set(ACTIONS.map((a) => a.group))];
    const slot = (a, i) => {
      const tk = A.bindings[a.id][i], cap = A.cap && A.cap.action === a.id && A.cap.slot === i;
      return `<button class="kb${cap ? " cap" : ""}${tk ? "" : " none"}" data-kb="${a.id}" data-slot="${i}">${cap ? "押してください" : esc(tokenLabel(tk))}</button>`;
    };
    const rows = groups.map((gr) => `<tr><th colspan="3">${gr}</th></tr>${ACTIONS.filter((a) => a.group === gr).map((a) => `<tr><td>${esc(a.label)}</td><td>${slot(a, 0)}</td><td>${slot(a, 1)}</td></tr>`).join("")}`).join("");
    const L = A.look, seg = (items, cur, attr, lab) => `<span class="seg">${items.map((v) => `<button data-${attr}="${v}" class="${v === cur ? "on" : ""}">${lab[v] ?? v}</button>`).join("")}</span>`;
    return `<h1>操作設定</h1>
      <div class="sub">割り当てたい操作の枠を押して、キーかマウスのボタンを押します。Delete で外します。Esc でやめます。1つの操作に 2つまで割り当てられます。</div>
      <div class="kset">
        <div class="line"><b>感度</b><input type="range" id="sens" min="6" max="80" step="1" value="${Math.round(L.sens * 10000)}"><span id="sensv">${Math.round(L.sens * 10000)}</span></div>
        <div class="line"><b>上下反転</b>${seg([false, true], L.invertY, "inv", { false: "しない", true: "する" })}</div>
        <div class="line"><b>自動射撃</b>${seg([true, false], L.autoFire, "afire", { true: "する", false: "しない" })}</div>
        <div class="line"><b>狙いの補助</b>${seg(ASSIST_CHOICES, L.assist, "assist", ASSIST_LABEL)}</div>
        <div class="line"><b>自動で向く</b>${seg(["off", "weak", "strong"], L.autoTurn, "auto", AUTO_LABEL)}</div>
        <div class="line"><b>視点</b>${seg(["first", "third"], L.view, "view", { first: "一人称", third: "三人称" })}</div>
        <div class="line"><b>迫る弾の合図</b>${seg([true, false], L.warn, "warn", { true: "する", false: "しない" })}</div>
      </div>
      <table class="kt"><tr><th style="width:46%">操作</th><th>主</th><th>副</th></tr>${rows}</table>
      <div class="btns" style="margin-top:14px"><button data-act="reset">はじめの割り当てにもどす</button><button class="go" data-act="close">とじる</button></div>`;
  }

  function openKeys(onClose) {
    A.cap = null;
    A.keysClose = onClose;
    const draw = () => {
      const sc = ov.querySelector(".card") ? ov.querySelector(".card").scrollTop : 0;
      overlay(keysHtml(), (b) => {
        const d = b.dataset;
        if (d.kb) { A.cap = { action: d.kb, slot: Number(d.slot) }; draw(); return; }
        if (d.inv !== undefined) A.look = { ...A.look, invertY: d.inv === "true" };
        else if (d.afire !== undefined) A.look = { ...A.look, autoFire: d.afire === "true" };
        else if (d.assist !== undefined) A.look = { ...A.look, assist: Number(d.assist) };
        else if (d.auto !== undefined) A.look = { ...A.look, autoTurn: d.auto };
        else if (d.view !== undefined) A.look = { ...A.look, view: d.view };
        else if (d.warn !== undefined) A.look = { ...A.look, warn: d.warn === "true" };
        else if (d.act === "reset") { A.bindings = defaultBindings(); host.bindingsChanged(A.bindings); }
        else if (d.act === "close") { closeKeys(); return; }
        host.lookChanged(A.look);
        draw();
      }, "wide");
      const card = ov.querySelector(".card");
      card.scrollTop = sc;
      const s = $("sens");
      s.addEventListener("input", () => {
        A.look = { ...A.look, sens: Number(s.value) / 10000 };
        $("sensv").textContent = s.value;
        host.lookChanged(A.look);
      });
    };
    A.drawKeys = draw;
    draw();
  }

  function closeKeys() {
    A.cap = null; A.drawKeys = null;
    const back = A.keysClose;
    A.keysClose = null;
    if (back) back(); else ov.hidden = true;
  }

  // 割り当ての入力待ち：次に押したキー・マウス・ホイールを割り当てる
  function capture(token, ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (token.startsWith("Mouse")) { A.skipClick = true; setTimeout(() => { A.skipClick = false; }, 1000); }
    const { action, slot } = A.cap;
    if (token === "Escape") { A.cap = null; A.drawKeys(); return; }
    if (token === "Delete" || token === "Backspace") { A.bindings = unbind(A.bindings, action, slot); }
    else {
      const r = bind(A.bindings, action, slot, token);
      if (!r.ok) { A.cap = null; A.drawKeys(); return; }
      A.bindings = r.bindings;
    }
    A.cap = null;
    host.bindingsChanged(A.bindings);
    A.drawKeys();
  }
  window.addEventListener("keydown", (ev) => { if (A.cap) capture(ev.code, ev); }, true);
  window.addEventListener("mousedown", (ev) => { if (A.cap) capture(`Mouse${ev.button}`, ev); }, true);
  window.addEventListener("wheel", (ev) => { if (A.cap) capture(ev.deltaY > 0 ? "WheelDown" : "WheelUp", ev); }, { capture: true, passive: false });

  return {
    state: A,
    // 武器庫を開く。keep：のこす弾の uid の集まり。ほかは盤から外す
    openArmory(o = {}) {
      const { keep, snapshot: snap, ...rest } = o;
      Object.assign(A, rest, { hover: null, msg: o.msg || "", fresh: !!o.fresh, hold: null, cell: null, cap: null });
      if (A.meta) resizeBoard();
      if (snap) restore(snap);
      if (keep) for (const p of A.board.list()) if (!keep.has(p.ammo.uid)) A.board.remove(p.id);
      if (o.found === undefined) A.found = null;
      rebuild();
      skeleton();
      $("armory").hidden = false;
      ov.hidden = true;
    },
    closeArmory() { $("armory").hidden = true; },
    start() { startRun(); },
    get armoryOpen() { return built && !$("armory").hidden; },
    get overlayOpen() { return !ov.hidden; },
    setFolder(folder) {
      A.folder = folder; A.found = null; rebuild();
      A.explore = A.exploreCache.get(folder.path) || { state: "idle", nodes: [], visited: 0, stoppedBy: "", truncatedAny: false };
      if (A.explore.state === "running") A.explore = { ...A.explore, state: "done", stoppedBy: "cancel" };      // 別の場所へ移ると、さがすのは やめている
      A.pick = null;
      if (A.fresh && A.board.used() === 0) { autoFill(); A.fresh = false; }      // はじめて開いたときは、威力の高いものから入れておく
      if (this.armoryOpen) { renderBody(); renderBoardArea(); }
    },
    setSearching(on) { A.searching = on; if (this.armoryOpen && A.tab === "files") { syncFilters(); renderGrid(); } },
    // 下の階層をさがした結果。defaulted は、条件がなくて 20MB 以上に したとき
    setFound(entries, truncated, defaulted = false) {
      A.searching = false;
      A.found = { entries: entries.slice(0, 5000), truncated };
      A.tab = "files";
      A.msg = truncated ? "探しきれませんでした。途中までの結果です" : defaulted ? "条件がないので、20MB 以上だけ探しました" : "";
      rebuild(); renderTabs(); renderBody(); setMsg(A.msg);
    },
    // さがしている途中と、さがし終わった結果。base は さがしはじめた場所。いま開いている場所と同じなら 画面に出す
    setExplore(base, patch) {
      const cur = A.exploreCache.get(base) || { state: "idle", nodes: [], visited: 0, stoppedBy: "", truncatedAny: false };
      const next = { ...cur, ...patch };
      A.exploreCache.set(base, next);
      if (A.folder && A.folder.path === base) { A.explore = next; if (this.armoryOpen && A.tab === "folder") renderBody(); }
    },
    setMsg(m) { A.msg = m; if (this.armoryOpen) setMsg(m); },
    setRecord(rec) { A.rec = rec; A.sort = normalizeSort(rec.sort); },
    setMeta(meta) { A.meta = meta; resizeBoard(); },
    setPrefs({ bindings, look }) { if (bindings) A.bindings = bindings; if (look) A.look = look; },

    // 盤の中身を 控える・もどす
    snapshot,
    restore,

    pause(getLines, on) {
      const draw = () => overlay(`<h1>中断</h1><div class="sub">息を整えるあいだ、世界は止まっています。</div>
        <div class="help">${getLines().map(esc).join("<br>")}</div>
        <div class="btns"><button data-act="keys">操作設定</button><button data-act="armory">武器庫にもどる</button><button class="go" data-act="resume">つづける</button></div>`, (b) => {
        if (b.dataset.act === "keys") openKeys(draw); else on(b.dataset.act);
      });
      draw();
    },
    result(r, on) {
      const bg = r.biggest, got = r.rewards ? matsText(r.rewards) : "";
      const fo = r.boss;      // フォルダのボスなら、その情報
      overlay(`<h1 style="color:${r.cleared ? "#7df3ff" : "#ff7a8a"}">${fo ? (r.cleared ? `${esc(fo.name)}　制覇` : "ゲームオーバー") : r.cleared ? `第${r.stage}面　クリア` : "ゲームオーバー"}</h1>
        <div class="sub">${fo ? (r.cleared ? `フォルダのボス 格 ${r.stage} を撃ち落としました。${r.mult < 1 ? `倒しなおしなので 素材は ${Math.round(r.mult * 100)}%。` : ""}` : `${esc(fo.name)} 格 ${r.stage} で力つきました。`) : r.cleared ? "ボスを撃ち落としました。" : `第${r.stage}面で力つきました。`}</div>
        ${got ? `<div class="got">手に入れた素材　${esc(got)}<br><small>武器庫の整備場と役の一覧で 使えます</small></div>` : ""}
        <table class="res">
          <tr><td>スコア</td><td>${comma(r.score)}${r.newBest ? "　ベスト更新" : ""}</td></tr>
          <tr><td>与えたダメージ</td><td>${comma(r.dmg)}</td></tr>
          <tr><td>撃った砲</td><td>${r.fired} 発</td></tr>
          <tr><td>最大の一撃</td><td>${bg ? `${esc(bg.name)}　${fmtSize(bg.bytes)}　${comma(bg.dmg)}` : "なし"}</td></tr>
          <tr><td>弱点に当てたダメージ</td><td>${comma(r.weakDmg || 0)}</td></tr>
          <tr><td>かすり</td><td>${comma(r.graze)}</td></tr>
          <tr><td>やられた回数</td><td>${r.hits}</td></tr>
        </table>
        <div class="btns">${fo ? (r.cleared ? `<button data-act="retry">もういちど</button><button class="go" data-act="armory">武器庫へ</button>` : `<button data-act="armory">武器庫へ</button><button class="go" data-act="retry">もういちど</button>`) : `<button data-act="armory">武器庫へ</button>${r.cleared ? `<button class="go" data-act="next">次の面へ</button>` : `<button class="go" data-act="retry">もういちど</button>`}`}</div>`, (b) => on(b.dataset.act));
    },
    closeOverlay() { ov.hidden = true; },
    fatal(msg) {
      built = false;
      $("armory").hidden = false;
      $("armory").innerHTML = `<div class="card fatal"><h1>遊べません</h1><div class="sub">${esc(msg)}</div></div>`;
    },
    elements: { gl: $("gl"), hud: $("hud") },
  };

  function snapshot() {
    return A.board.list().map((p) => ({ ammo: { ...p.ammo }, rot: p.rot, x: p.x, y: p.y }));
  }
  function restore(snap) {
    const [w, h] = A.meta ? boardSize(A.meta) : [A.board.w, A.board.h];
    const b = new Board(w, h);
    for (const s of snap) b.place({ ...s.ammo }, s.rot, s.x, s.y);
    A.board = b;
  }
}
