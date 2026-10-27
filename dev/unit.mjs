// 画面を持たない部品のテスト。使い方：node file-danmaku/dev/unit.mjs
import fs from "node:fs";
import path from "node:path";
import { stage, MOD_DIR } from "./stage.mjs";

const st = stage("unit");
const M = await import(st.url("math.js"));
const A = await import(st.url("ammo.js"));
const B = await import(st.url("bullets.js"));
const S = await import(st.url("shapes.js"));
const ST = await import(st.url("stages.js"));
const P = await import(st.url("patterns.js"));
const C = await import(st.url("consts.js"));
const CB = await import(st.url("combos.js"));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  NG:", msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg}：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const finite = (...xs) => xs.every(Number.isFinite);
const section = (s) => console.log(s);

const KB = 1024, MB = KB * 1024, GB = MB * 1024;
const mk = (name, size) => A.ammoOf({ name, ext: name.split(".").pop(), size, id: name, path: "C:\\x\\" + name });

// ---- 計算の道具 ----
section("計算の道具");
{
  const r1 = M.makeRng(5), r2 = M.makeRng(5);
  ok(Array.from({ length: 20 }, () => r1()).join() === Array.from({ length: 20 }, () => r2()).join(), "同じ種なら同じ乱数");
  ok(Array.from({ length: 1000 }, () => r1()).every((v) => v >= 0 && v < 1), "乱数は 0以上1未満");
  for (const [a, b] of [[0, 6], [6, 0], [3, -3], [-3, 3], [0.1, 6.2]]) ok(Math.abs(M.angDiff(a, b)) <= Math.PI + 1e-9, `angDiff(${a},${b}) が ±π に収まる`);
  const curve = M.logCurve([[KB, 10], [GB, 100]]);
  ok(curve(1) === 10 && curve(KB) === 10 && Math.abs(curve(GB) - 100) < 1e-6 && curve(1e15) === 100, "logCurve の両端");
  ok(curve(MB) > 10 && curve(MB) < 100, "logCurve の途中");
  eq(M.fmtSize(1536), "1.5 KB", "fmtSize 1.5KB");
  eq(M.fmtSize(5.8 * GB), "5.8 GB", "fmtSize 5.8GB");
  eq(M.fmtSize(0), "0 B", "fmtSize 0");
  ok(M.hashStr("a") !== M.hashStr("b") && M.hashStr("abc") === M.hashStr("abc"), "hashStr");
}

// ---- ファイル → 弾 ----
section("ファイル → 弾");
{
  eq(A.tierOf(0), 0, "0B は豆鉄砲"); eq(A.tierOf(100 * KB - 1), 0, "100KB 未満は豆鉄砲"); eq(A.tierOf(100 * KB), 1, "100KB は小口径");
  eq(A.tierOf(5 * MB), 2, "5MB は中口径"); eq(A.tierOf(100 * MB), 3, "100MB は大口径"); eq(A.tierOf(GB), 4, "1GB はロマン砲"); eq(A.tierOf(10 * GB), 5, "10GB は超ロマン砲");
  eq(A.tierOf(3 * 1024 * GB), 5, "3TB も超ロマン砲");
  const sizes = [0, KB, 50 * KB, MB, 20 * MB, 300 * MB, 2 * GB, 20 * GB, 200 * GB];
  for (const k of ["dmgOf", "chargeOf", "scaleOf"]) {
    const v = sizes.map((s) => A[k](s));
    ok(v.every(Number.isFinite), `${k} は有限`);
    ok(v.every((x, i) => i === 0 || x >= v[i - 1]), `${k} は大きいほど大きい（減らない）`);
    ok(v[v.length - 1] > v[0] * 2, `${k} は大きさで はっきり差が出る`);
  }
  // 種類
  const kinds = { "a.png": "spread", "a.JPG": "spread", "a.mp4": "beam", "a.flac": "wave", "a.pdf": "homing", "a.zip": "cluster", "a.exe": "blast", "a.iso": "meteor", "a.cpp": "shot", "noext": "shot", "a.xyz": "shot" };
  for (const [n, k] of Object.entries(kinds)) eq(A.kindOfExt(n.split(".").pop()), k, `${n} の種類`);
  ok(Object.keys(A.KINDS).length === 8, "砲は8種類");
  for (const k of Object.values(A.KINDS)) ok(k.name && k.glyph.length === 1 && k.desc && k.rgb.length === 3 && /^#[0-9a-f]{6}$/.test(k.color), `${k.name} の定義`);
  const a = mk("big.iso", 6 * GB), b = mk("big.iso", 6 * GB);
  eq(a, b, "同じファイルは、いつでも同じ砲");
  ok(finite(a.dmg, a.charge, a.scale, a.tier, a.bytes) && a.kind === "meteor" && a.tier === 4, "ammoOf の中身");
  ok(mk("x.txt", 1 * MB).dmg < mk("x.iso", 2 * GB).dmg * 0.2, "大きいファイルのほうが ずっと強い");
  eq(mk("x.txt", undefined).bytes, 0, "大きさが分からなくても落ちない");
  eq(mk("x.txt", -5).bytes, 0, "負の大きさは0");
  // 画面の文章に（）を入れない
  for (const t of A.TIERS) ok(!/[（）()]/.test(t.name), "段の名前に括弧がない");
  for (const k of Object.values(A.KINDS)) ok(!/[（）()]/.test(k.desc + k.name), `${k.name} の説明に括弧がない`);
}

// ---- 弾の置き場 ----
section("弾の置き場");
{
  const b = new B.Bullets(10);
  for (let i = 0; i < 12; i++) b.add({ x: i, y: 0, z: 0, ang: 0, speed: 1 });
  eq(b.n, 10, "上限をこえて入らない");
  eq(b.add({ x: 0, y: 0, z: 0 }), -1, "満杯では -1");
  b.remove(2);
  eq(b.n, 9, "消すと減る"); eq(b.x[2], 9, "最後の1発が入れかわる");
  b.remove(8);
  eq(b.n, 8, "最後を消す");
  const i = b.add({ x: 0, y: 1, z: 2, ang: Math.PI / 2, speed: 3, pitch: 0 });
  ok(Math.abs(b.vx[i] - 3) < 1e-6 && Math.abs(b.vz[i]) < 1e-6, "ang π/2 は +x へ進む");
  const j = b.add({ x: 0, y: 1, z: 2, ang: 0, speed: 2, pitch: -Math.PI / 2 });
  ok(Math.abs(b.vy[j] + 2) < 1e-6 && Math.abs(b.vz[j]) < 1e-5, "pitch -π/2 は真下");
  b.clear(); eq(b.n, 0, "clear");
}

// ---- 形 ----
section("ワイヤーフレーム");
{
  const edges = { octa: 12, cube: 12, icosa: 30, dodeca: 30, tetra: 6, knot: 96 };
  for (const [k, n] of Object.entries(edges)) {
    const s = S.SHAPES[k];
    eq(s.e.length, n, `${k} の辺の数`);
    ok(s.v.every((v) => v.every(Number.isFinite) && Math.hypot(...v) <= 1 + 1e-9), `${k} は半径1に収まる`);
    ok(s.e.every(([i, j]) => i !== j && i < s.v.length && j < s.v.length), `${k} の辺は頂点を指す`);
  }
}

// ---- 面とボス ----
section("面とボス");
{
  for (const d of ST.DIFF_ORDER) {
    for (let n = 1; n <= 14; n++) {
      const b = ST.bossFor(n, d, 123);
      ok(b.phases.length >= 3 && b.name && b.title && b.color.length === 3 && S.SHAPES[b.shape], `面${n} ${d} の形`);
      for (const p of b.phases) {
        ok(p.hp > 0 && p.time >= 30 && ["sway", "orbit", "tilt", "dart", "chase"].includes(p.move) && p.atk.length >= 1 && p.name, `面${n} ${p.name} の中身`);
        ok(!/[（）()]/.test(p.name.replace(/「|」/g, "")) , `面${n} ${p.name} に括弧がない`);
        for (const a of p.atk) {
          ok(typeof P.PATTERNS[a.t] === "function", `面${n} 弾幕 ${a.t} がある`);
          ok(a.col === undefined || (a.col >= 0 && a.col < ST.BULLET_COLORS.length), `面${n} ${a.t} の色の番号`);
        }
      }
    }
  }
  eq(ST.bossFor(8, "normal", 9).name, ST.bossFor(8, "normal", 9).name, "6面から先も、同じ種なら同じボス");
  ok(ST.bossFor(8, "normal", 9).name !== ST.bossFor(8, "normal", 10).name || ST.bossFor(8, "normal", 9).phases[0].atk[0].t !== ST.bossFor(8, "normal", 10).phases[0].atk[0].t, "種が違うと別のボス");
  ok(ST.bossFor(1, "lunatic").phases[0].hp > ST.bossFor(1, "easy").phases[0].hp, "難しいほど体力が多い");
  ok(ST.bossFor(5).phases[0].hp > ST.bossFor(1).phases[0].hp, "進むほど体力が多い");
  ok(ST.bossFor(1).phases.length === 3 && ST.bossFor(5).phases.length === 4, "最終面は4フェーズ");
}

// ---- 弾幕の型 ----
section("弾幕の型");
{
  // 各型を、偽の道具で 30 秒回す
  for (const [name, fn] of Object.entries(P.PATTERNS)) {
    const rand = M.makeRng(3);
    let fired = 0, lasers = 0, marks = 0, bad = 0, high = 0, pillars = 0;
    const c = {
      dt: 1 / 60, t: 0, boss: { x: 0, y: 3.4, z: 0 }, pl: { x: 0, y: 3.0, z: 14 }, rand, cm: 1, sm: 1,
      fire: (s) => { fired++; if (![s.ang ?? 0, s.speed ?? 0, s.x ?? 0, s.z ?? 0, s.y ?? 3, s.pitch ?? 0].every(Number.isFinite)) bad++; if ((s.y ?? 3) < 0.3 || (s.y ?? 3) > 40) high++; },
      laser: (l) => { lasers++; if (!Number.isFinite(l.y) || !(l.h > 0)) bad++; }, mark: () => marks++, pillar: () => pillars++,
    };
    const rt = {};
    for (let f = 0; f < 60 * 30; f++) { c.t = f / 60; fn({}, rt, c); }
    ok(fired + lasers + pillars > 0, `${name} は 30秒で 何か撃つ`);
    ok(high === 0, `${name} の弾は 床より上、空より下に出る`);
    ok(bad === 0, `${name} の弾は有限の数`);
    ok(fired < 6000, `${name} が撃ちすぎない（${fired}）`);
    // 倍率
    const mkc = (cm, sm) => { const o = { n: 0, sp: 0 }; return { o, c: { ...c, cm, sm, rand: M.makeRng(3), fire: (s) => { o.n++; o.sp += s.speed || 0; }, laser: () => {}, mark: () => {}, pillar: () => { o.n++; } } }; };
    const lo = mkc(0.65, 0.85), hi = mkc(1.6, 1.25);
    for (const x of [lo, hi]) { const rt2 = {}; for (let f = 0; f < 60 * 20; f++) { x.c.t = f / 60; fn({}, rt2, x.c); } }
    if (fired > 0) ok(hi.o.n > lo.o.n, `${name}：難しいほど弾が多い`);
  }
}

// ---- 弾幕の高さ ----
section("弾幕の高さ");
{
  // 層の高さ：輪が高さを入れかえて出る
  const ys = [];
  const c = { dt: 1 / 60, t: 0, boss: { x: 0, y: 3.4, z: 0 }, pl: { x: 0, y: 3, z: 14 }, rand: M.makeRng(1), cm: 1, sm: 1, fire: (s) => ys.push(Math.round(s.y * 10) / 10), laser() {}, mark() {}, pillar() {} };
  const rt = {};
  for (let f = 0; f < 60 * 12; f++) P.PATTERNS.ring({ every: 1, n: 8, lay: ["floor", "high"], first: 0.1 }, rt, c);
  ok(new Set(ys).size === 2 && ys.includes(C.LAYER_ABS.floor) && ys.includes(Math.round((3.4 + C.LAYER_OFF.high) * 10) / 10), "輪が 床と高の層を 入れかえる");
  // 同時
  const ys2 = [];
  const c2 = { ...c, fire: (s) => ys2.push(Math.round(s.y * 10) / 10) };
  const rt2 = {};
  for (let f = 0; f < 60 * 1.2; f++) P.PATTERNS.ring({ every: 5, n: 8, lay: ["low", "ceil"], together: true, first: 0.1 }, rt2, c2);
  eq(ys2.length, 16, "together は 2つの層にいっぺんに出る");
  // 勇者の高さをねらう扇
  const pitches = [];
  const c3 = { ...c, pl: { x: 0, y: 6, z: 14 }, fire: (s) => pitches.push(s.pitch) };
  P.PATTERNS.fan({ first: 0.1, n: 3 }, {}, { ...c3, dt: 1 });
  ok(pitches.length === 3 && pitches.every((p) => p > 0.1), "扇は 高いところの勇者へ 上向きに撃つ");
  // 3D の壁：穴が 横と高さにある
  const bs = [];
  const c4 = { ...c, pl: { x: 0, y: 12, z: 14 }, fire: (s) => bs.push(s) };
  P.PATTERNS.wall({ tall: true, first: 0.1, gapW: 3.6, gapH: 2.6, aimGap: true }, {}, { ...c4, dt: 1, rand: M.makeRng(2) });
  const rowYs = new Set(bs.map((b) => Math.round(b.y * 10)));
  eq(rowYs.size, 5, "高い壁は 5段");
  const per = {}; for (const b of bs) per[Math.round(b.y * 10)] = (per[Math.round(b.y * 10)] || 0) + 1;
  const counts = Object.values(per);
  ok(Math.min(...counts) < Math.max(...counts), "高さによって 穴のある段と ない段がある");
  // 柱
  let pil = 0;
  P.PATTERNS.pillars({ first: 0.1, n: 3 }, {}, { ...c, dt: 1, pillar: () => pil++ });
  eq(pil, 3, "柱が 3本");
  // 雨は 勇者の高さに合わせて 落ちはじめる
  const rain = [];
  P.PATTERNS.rain({ first: 0.1, warn: 1.0, speed: 20 }, {}, { ...c, dt: 1, pl: { x: 0, y: 5, z: 14 }, fire: (s) => rain.push(s), mark() {} });
  ok(rain.length === 1 && Math.abs(rain[0].y - (5 + 20)) < 0.01, "雨は 勇者の高さ + 速さ×警告 から落ちる");
}

// ---- 役 ----
section("役");
{
  const hand = (...xs) => xs.map(([n, s]) => mk(n, s));
  const names = (h) => CB.evalCombos(h).list.map((c) => c.name);
  const has = (h, name) => names(h).some((n) => n.includes(name));
  eq(CB.evalCombos([]).list.length, 0, "空のマガジンに 役はない");
  eq(CB.evalCombos(Array(8).fill(null)).mods.lives, 0, "空は ライフ+0");
  // 同じ種類
  let h = hand(["a.mp4", 2 * MB], ["b.mkv", 3 * MB], ["c.png", MB]);
  ok(has(h, "光線のペア") && !has(h, "ペア") === false, "光線が2枚で ペア");
  h = hand(["a.mp4", 2 * MB], ["b.mkv", 3 * MB], ["c.avi", 4 * MB]);
  ok(has(h, "光線のスリーカード"), "光線が3枚で スリーカード");
  eq(CB.evalCombos(h).mods.dmg.beam, 0.35, "スリーカードは 威力+35%");
  h = hand(["a.mp4", MB], ["b.mkv", MB], ["c.avi", MB], ["d.mov", MB]);
  ok(has(h, "光線のフォーカード") && CB.evalCombos(h).mods.count.beam === 0.5, "4枚で フォーカード。数が増える");
  h = Array.from({ length: 5 }, (_, i) => mk(`v${i}.mp4`, (i + 1) * 7 * MB));
  ok(has(h, "光線のファイブカード") && CB.evalCombos(h).mods.lives >= 1, "5枚で ファイブカード。ライフ+1");
  h = Array.from({ length: 8 }, (_, i) => mk(`v${i}.mp4`, (i + 1) * 7 * MB));
  ok(has(h, "光線の大家族") && CB.evalCombos(h).mods.lives >= 1 && CB.evalCombos(h).mods.dmg.beam === 2, "8枚で 大家族。威力は上限の +200%");
  // 種類をまたぐ
  h = hand(["a.mp4", MB], ["b.mkv", MB], ["c.avi", MB], ["d.mp3", MB], ["e.wav", MB]);
  ok(has(h, "フルハウス") && has(h, "ツーペア") === true, "3枚と2枚で フルハウス。ペアが2つで ツーペア");
  h = hand(["a.mp4", MB], ["b.mp3", MB], ["c.png", MB], ["d.pdf", MB], ["e.zip", MB]);
  ok(has(h, "バラエティ") && !has(h, "フルコース"), "5種類で バラエティ");
  h = hand(["a.mp4", MB], ["b.mp3", MB], ["c.png", MB], ["d.pdf", MB], ["e.zip", MB], ["f.exe", MB], ["g.iso", MB], ["h.cpp", MB]);
  ok(has(h, "フルコース") && !has(h, "バラエティ"), "8種類で フルコース");
  // 段
  h = hand(["a.txt", 10 * KB], ["b.txt", 200 * KB], ["c.txt", 10 * MB], ["d.txt", 200 * MB]);
  ok(has(h, "ロマンの階段") && CB.evalCombos(h).mods.dmgAll >= 0.2, "段が4つ続くと ロマンの階段");
  h = hand(["a.iso", 2 * GB], ["b.iso", 3 * GB]);
  ok(has(h, "二枚看板") && !has(h, "三本柱"), "1GB以上が2つで 二枚看板");
  h = hand(["a.iso", 2 * GB], ["b.iso", 3 * GB], ["c.iso", 4 * GB]);
  ok(has(h, "三本柱") && !has(h, "二枚看板"), "1GB以上が3つで 三本柱");
  h = hand(["a.iso", 12 * GB]);
  ok(has(h, "超ロマン砲持ち") && CB.evalCombos(h).mods.weak === 0.4, "10GB以上で 超ロマン砲持ち。弱点+40%");
  h = hand(["a.iso", 25 * GB]);
  ok(has(h, "どっしり") && CB.evalCombos(h).mods.lives === 2, "20GB以上は どっしり");
  h = hand(["a.iso", 5 * GB]);
  ok(has(h, "ずっしり") && CB.evalCombos(h).mods.lives === 1, "4GB以上は ずっしり");
  h = Array.from({ length: 10 }, (_, i) => mk(`m${i}.png`, 10 * KB + i));
  ok(has(h, "豆の群れ") && CB.evalCombos(h).mods.basic === 0.5, "小さいファイル10個で 豆の群れ");
  ok(!has(Array.from({ length: 9 }, (_, i) => mk(`m${i}.png`, 10 * KB + i)), "豆の群れ"), "9個では 豆の群れではない");
  h = Array.from({ length: 6 }, (_, i) => mk(`n${i}.txt`, 20 * MB + i));
  ok(has(h, "粒ぞろい"), "6つで段がそろうと 粒ぞろい");
  // 拡張子・名前・大きさ
  h = hand(["a.mp4", MB], ["b.mp4", 2 * MB], ["c.mp4", 3 * MB]);
  ok(has(h, "おなじ拡張子") && CB.evalCombos(h).mods.dash === 0.3, "同じ拡張子3つ");
  h = hand(["backup_1.zip", MB], ["data.bak", 2 * MB]);
  ok(has(h, "バックアップ癖") && CB.evalCombos(h).mods.shield === 1, "backup が2つで バリア1回");
  h = hand(["x (1).txt", MB], ["y - コピー.txt", 2 * MB], ["z.copy", 3 * MB], ["copy of w.txt", 4 * MB]);
  eq(CB.evalCombos(h).mods.shield, 2, "コピーの名前が4つで バリア2回");
  h = hand(["a.png", 1234567], ["b.pdf", 1234567]);
  ok(has(h, "双子") && CB.evalCombos(h).mods.climb === 0.25, "大きさが同じ2つで 双子");
  h = hand(["Alpha.png", MB], ["apple.pdf", 2 * MB], ["Axe.zip", 3 * MB]);
  ok(has(h, "名前そろい") && CB.evalCombos(h).mods.graze === 0.5, "頭文字が3つ同じで 名前そろい");
  // 足し算と上限
  const big = Array.from({ length: 8 }, (_, i) => mk(`Same${i}.iso`, (11 + i) * GB));
  const m = CB.evalCombos(big).mods;
  ok(m.lives <= 3 && m.dmgAll <= 1.5 && m.speed <= 0.35 && m.shield <= 3 && m.charge <= 0.7, "どの能力にも上限がある");
  // 文
  const t = CB.fxText({ dmgAll: 0.2, dmg: { beam: 0.35 }, lives: 1, inv: 0.3, dash: 0.3, shield: 1 });
  ok(t.includes("全砲の威力 +20%") && t.includes("光線の威力 +35%") && t.includes("ライフ +1") && t.includes("無敵 +0.3秒") && t.includes("ダッシュの間 -30%") && t.includes("バリア 1回"), "効果の文");
  ok(CB.COMBO_GUIDE.length >= 20 && CB.COMBO_GUIDE.every((g) => g.name && g.cond && g.guide && Number.isFinite(g.cost)), "役の一覧");
  ok(CB.COMBO_GUIDE.every((g) => !/[（）()]/.test(g.name + g.cond + g.guide)), "役の一覧に括弧がない");
  // 手が変わると、役も変わる
  eq(names(hand(["a.mp4", MB])).length, names(hand(["a.mp4", MB])).length, "同じ手は 同じ役");
}

// ---- 画面の文章 ----
section("画面の文章");
{
  // 画面に出す文字列に、（）の注釈を入れない
  const files = fs.readdirSync(MOD_DIR).filter((f) => f.endsWith(".js") || f === "manifest.json");
  let bad = 0;
  const KANA_KANJI = "\\u3040-\\u30ff\\u4e00-\\u9fff";
  const CJK_PAREN = new RegExp(`[（）]|[${KANA_KANJI}][ ]?\\(|\\([ ]?[${KANA_KANJI}]`, "g");
  for (const f of files) {
    let src = fs.readFileSync(path.join(MOD_DIR, f), "utf8");
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    // 全角の括弧は、コードには出てこない。半角は、日本語のとなりにあるものだけを見る
    for (const m of src.matchAll(CJK_PAREN)) {
      bad++;
      console.log(`  NG: ${f} 括弧つきの文：${src.slice(Math.max(0, m.index - 12), m.index + 16).replaceAll("\n", " ")}`);
    }
  }
  ok(bad === 0, "画面の文章に括弧の注釈がない");
  const man = JSON.parse(fs.readFileSync(path.join(MOD_DIR, "manifest.json"), "utf8"));
  ok(/^[a-z0-9.-]{3,64}$/.test(man.id) && man.name.length <= 40 && man.description.length <= 200 && man.settings.length <= 30, "manifest の決まり");
  ok(man.settings.every((s) => s.label.length <= 40), "設定の名前は40字まで");
  ok(!man.network && man.uses.every((u) => ["entries", "size", "modified", "search", "pointerLock"].includes(u)), "通信せず、使うのは 名前・大きさ・更新日・検索・ポインター固定だけ");
  ok(man.uses.includes("pointerLock") && man.version === "2.2.1", "ポインター固定を宣言している");
  // ファイルを変える API を、一度も呼ばない
  const all = files.map((f) => fs.readFileSync(path.join(MOD_DIR, f), "utf8")).join("\n");
  for (const bad of ["ep.trash", "ep.rename", "ep.createFolder", "files.create", "files.read", "clipboard", "ep.drag", "collections", "createShortcut"]) ok(!all.includes(bad), `${bad} を呼ばない`);
}

console.log(`\n${fail ? "NG" : "OK"}  通った ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
