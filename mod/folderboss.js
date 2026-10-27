// フォルダのボス。フォルダを調べた結果（search.stats）から、そのフォルダだけのボスを作る。画面にも本体にも触らない。
//   格（強さの目盛り 1〜8）はサイズの 4 倍ごとに 1 つ。天井があるので、ドライブでも TB でも 戦える強さにおさまる。
//   格は そのまま その面の強さ。挑めるのは 格 ≦ 到達（locked でないもの）。中身（拡張子の割合）が、フェーズの好み・色・得意と苦手を決める。
import { KINDS, KIND_ORDER, kindOfExt, fmtSize, MB } from "./ammo.js";
import { themedBase } from "./stages.js";
import { hashStr, makeRng, clamp } from "./math.js";

export const GRADE_MAX = 8;
export const RESIST = 0.8;          // 本性の種類の砲は 効きにくい
export const VULNERABLE = 1.4;      // 苦手な種類の砲は 効きやすい
export const REPEAT_MULT = 0.35;    // 同じ格か それ以下での 倒しなおしの 素材

// 肩書き（ボスの title）と形
export const EPITHET = { shot: "巨人", spread: "写真の群れ", beam: "映写機", wave: "楽団", homing: "書類の山", cluster: "梱包", blast: "常駐", meteor: "巨塊" };
const SHAPE_OF = { shot: "octa", spread: "icosa", beam: "tetra", wave: "knot", homing: "dodeca", cluster: "cube", blast: "octa", meteor: "dodeca" };

// ドライブの根（C:\ など）か。本体の folder は { path, parentPath }
export const isRootFolder = (f) => !!f && (!f.parentPath || /^[A-Za-z]:[\\/]?$/.test(String(f.path || "")));
export const driveName = (path) => { const m = /^([A-Za-z]):/.exec(String(path || "")); return m ? `${m[1].toUpperCase()}:` : "ドライブ"; };

// 本来の格：合計の大きさから。数えきれずに「途中まで」なら すくなくとも 7。ドライブの根は いつも 8
export function gradeOf(bytes, { truncated = false, root = false } = {}) {
  if (root) return GRADE_MAX;
  let g = 1 + Math.floor(Math.log(Math.max(bytes, 1) / (20 * MB)) / Math.log(4));
  g = clamp(Number.isFinite(g) ? g : 1, 1, GRADE_MAX);
  return truncated ? Math.max(g, 7) : g;
}

// 拡張子ごとの数え（byExt）を、弾の種類ごとの割合にする。大きさ（バイト）の割合。ぜんぶ 0 バイトなら 数の割合
export function kindShares(byExt) {
  const sum = Object.fromEntries(KIND_ORDER.map((k) => [k, 0])), cnt = { ...sum };
  for (const x of byExt || []) {
    const k = kindOfExt(x.ext);
    sum[k] += Math.max(0, x.bytes || 0);
    cnt[k] += Math.max(0, x.count || 0);
  }
  const tb = KIND_ORDER.reduce((s, k) => s + sum[k], 0), tc = KIND_ORDER.reduce((s, k) => s + cnt[k], 0);
  const src = tb > 0 ? sum : cnt, t = tb > 0 ? tb : tc;
  return Object.fromEntries(KIND_ORDER.map((k) => [k, t > 0 ? src[k] / t : 0]));
}

const comma = (n) => Math.round(n).toLocaleString("en-US");

// folder：{ name, path, parentPath }　stats：search.stats の結果　reached：いまの到達
export function folderBoss({ folder, stats, reached = 1 }) {
  const root = isRootFolder(folder), path = String(folder.path || folder.name || "");
  const bytes = Math.max(0, stats.bytes || 0), files = Math.max(0, stats.files || 0), subs = Math.max(0, stats.folders || 0), truncated = !!stats.truncated;
  const natural = gradeOf(bytes, { truncated, root }), grade = natural, locked = natural > Math.max(1, reached | 0);
  const shares = kindShares(stats.byExt);
  const order = KIND_ORDER.filter((k) => shares[k] > 0).sort((a, b) => shares[b] - shares[a] || KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  if (!order.length) order.push("shot");
  const main = order[0];
  // 苦手：そのフォルダに ほとんど無い種類（3% 未満）から、名前で決まる 1 つ。なければ いちばん少ない種類
  const seed = hashStr(path.toLowerCase()) >>> 0, r = makeRng(seed ^ 0x5bd1e995);
  const rare = KIND_ORDER.filter((k) => k !== main && shares[k] < 0.03);
  const weakKind = rare.length ? rare[(r() * rare.length) | 0] : KIND_ORDER.filter((k) => k !== main).sort((a, b) => shares[a] - shares[b])[0];
  // フェーズ：少ない種類から はじめて、さいごに 本性
  const count = grade >= 5 || root ? 4 : 3;
  const pick = (i) => order[Math.min(i, order.length - 1)];
  const kinds = Array.from({ length: count }, (_, j) => pick(count - 1 - j));
  const nameShown = root ? `ドライブ ${driveName(path)}` : String(folder.name || path);
  const title = root ? "ラスボス" : files === 0 ? "空っぽ" : `${EPITHET[main]}　${fmtSize(bytes)}　${comma(files)} 件`;
  const color = root ? [1, 0.84, 0.3] : KINDS[main].rgb.slice();
  const spec = {
    name: nameShown, title, color, shape: root ? "knot" : SHAPE_OF[main], kinds, count,
    last: root ? "全容量「満杯の空」" : null,
    hudLabel: `格${grade}`, label: root ? `ラスボス　格 ${grade}` : `フォルダのボス　格 ${grade}`,
    kindMul: { [main]: RESIST, [weakKind]: VULNERABLE },
    info: { path, name: nameShown, bytes, files, folders: subs, truncated, natural, grade, root, main, weakKind },
  };
  const base = themedBase(grade, seed, spec);
  return { base, seed, natural, grade, locked, root, bytes, files, folders: subs, truncated, shares, order, main, weakKind, name: nameShown, title, phaseNames: base.phases.map((p) => p.name), kinds };
}

// 倒しなおしの 素材の倍率。まだ倒していない・格が上がった なら 満額
export function conquestMult(entry, grade) {
  if (!entry || !(entry.clears > 0)) return 1;
  return grade > (entry.S || 0) ? 1 : REPEAT_MULT;
}

// 制覇の記録（rec.conquest[path]）を 1 つ進める。新しい記録を返す（元は変えない）
export function conquered(entry, grade, score = 0, now = Date.now()) {
  const e = entry || { S: 0, clears: 0, best: 0, at: 0 };
  return { S: Math.max(e.S || 0, grade), clears: (e.clears || 0) + 1, best: Math.max(e.best || 0, score), at: now };
}

// ---- 挑めるフォルダを さがす ----
export const MIN_FILES = 3;                                   // これより ファイルが少ないフォルダは ボスにならない
export const EXPLORE = { maxNodes: 40, maxDepth: 3, quota: 24, timeMs: 90000 };

// パスの区切りは \ と / のどちらでも。大文字小文字は区別しない
const key = (p) => String(p || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
export const isInside = (child, ancestor) => { const c = key(child), a = key(ancestor); return a !== "" && c !== a && c.startsWith(a + "\\"); };
export const parentOf = (p) => { const s = String(p || "").replace(/[\\/]+$/, ""), i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")); return i > 0 ? s.slice(0, i) : ""; };

// 浅いほうから、いまの到達で挑めるフォルダを集める。stats と children は 本体の呼び出しを 差しこむ（試験では にせものを渡す）
//   base：{ id, name, path, parentPath }　stats(folder) → search.stats の結果　children(folder, depth) → 子のフォルダの並び
//   挑める（本来の格 ≦ 到達）なら そこで止めて 下は掘らない。格上なら 子を 1 つずつ 数える。ドライブの根は 数えずに 子へ
export async function exploreFolders({ base, reached, stats, children, onProgress, cancelled = () => false, now = () => Date.now(), limits = EXPLORE }) {
  const nodes = [], t0 = now();
  let visited = 0, opens = 0, stoppedBy = "done", truncatedAny = false;
  const queue = [{ f: base, depth: 0 }];
  while (queue.length) {
    if (cancelled()) { stoppedBy = "cancel"; break; }
    if (visited >= limits.maxNodes) { stoppedBy = "budget"; break; }
    if (now() - t0 > limits.timeMs) { stoppedBy = "time"; break; }
    if (opens >= limits.quota) { stoppedBy = "quota"; break; }
    const { f, depth } = queue.shift();
    const root = isRootFolder(f), ref = { id: f.id, name: f.name, path: f.path, parentPath: f.parentPath ?? parentOf(f.path), depth };
    let st = null, natural;
    if (root && reached < GRADE_MAX) { nodes.push({ ...ref, stats: null, teaser: true }); natural = GRADE_MAX; }       // ラスボスの予告だけ。数えない
    else {
      try { st = await stats(f); } catch { st = null; }
      visited++;
      if (st) { nodes.push({ ...ref, stats: st }); if (st.truncated) truncatedAny = true; natural = gradeOf(st.bytes, { truncated: !!st.truncated, root }); }
    }
    if (st && natural <= reached) { if ((st.files || 0) >= MIN_FILES) opens++; }          // 挑める：下は 掘らない
    else if (natural > reached && depth < limits.maxDepth) {
      let kids = [];
      try { kids = (await children(f, depth)) || []; } catch { kids = []; }
      for (const k of kids) queue.push({ f: k, depth: depth + 1 });
    }
    if (onProgress) onProgress({ nodes, visited, opens });
  }
  return { nodes, visited, opens, stoppedBy, truncatedAny };
}

// さがした結果（nodes）から、いまの到達で 挑める一覧と、まだ早い一覧を作る。到達が進んだら、作りなおせる
//   open：挑める。ほかの挑めるフォルダの中にあるものは 省く。格が高い順、同じなら 大きい順
//   later：まだ早い。本来の格が 到達 + 2 までと、ドライブの根（ラスボス）。近い順で 最大 6 つ
export function challengeSets(nodes, reached, conquest = {}) {
  const all = [];
  for (const n of nodes || []) {
    const folder = { name: n.name, path: n.path, parentPath: n.parentPath };
    if (!n.teaser && (!n.stats || (n.stats.files || 0) < MIN_FILES)) continue;
    const fb = folderBoss({ folder, stats: n.stats || { bytes: 0, files: 0, folders: 0, truncated: true, byExt: [] }, reached });
    fb.teaser = !!n.teaser;
    fb.conquered = !!(conquest && conquest[n.path] && conquest[n.path].clears > 0);
    all.push(fb);
  }
  const pathOf = (fb) => fb.base.info.path;
  const open = all.filter((fb) => !fb.locked);
  const top = open.filter((fb) => !open.some((o) => o !== fb && isInside(pathOf(fb), pathOf(o))));
  top.sort((a, b) => b.grade - a.grade || b.bytes - a.bytes || a.name.localeCompare(b.name, "ja"));
  let later = all.filter((fb) => fb.locked && (fb.root || fb.grade <= reached + 2));
  later = later.filter((fb) => fb.root || !later.some((o) => o !== fb && isInside(pathOf(o), pathOf(fb))));          // 中にある もっと小さい目標を 見せる。ラスボスは いつも
  later.sort((a, b) => a.grade - b.grade || a.bytes - b.bytes || a.name.localeCompare(b.name, "ja"));
  return { open: top, later: later.slice(0, 6), total: all.length };
}
