// ファイルの一覧の、しぼりこみ・並べかた・検索の条件。画面にも本体にも触らない。
//   しぼりこみ f：{ text（名前の文字）, kinds（弾の種類のどれか）, tiers（大きさの段のどれか）}。空なら ぜんぶ
//   一覧の 1 つは { e（本体のファイルの情報）, a（ammoOf の結果）}
import { KIND_ORDER, EXT_BY_KIND, TIERS, MB } from "./ammo.js";

export const SORTS = [
  { id: "size", label: "大きい順" },
  { id: "sizeUp", label: "小さい順" },
  { id: "name", label: "名前順" },
  { id: "kind", label: "種類順" },
  { id: "new", label: "新しい順" },
  { id: "old", label: "古い順" },
];
export const SORT_IDS = SORTS.map((s) => s.id);
export const normalizeSort = (id) => (SORT_IDS.includes(id) ? id : "size");

export const emptyFilter = () => ({ text: "", kinds: [], tiers: [] });
export const filterActive = (f) => !!(f.text.trim() || f.kinds.length || f.tiers.length);

// 名前の文字：空白で区切ったものを ぜんぶ含む。* と ? があれば、名前ぜんたいと くらべる。大文字・小文字は区別しない
const wild = (w) => new RegExp(`^${w.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
export function nameHas(name, text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const n = String(name);
  return words.every((w) => (/[*?]/.test(w) ? wild(w).test(n) : n.toLowerCase().includes(w.toLowerCase())));
}

export function matches(it, f) {
  if (f.kinds.length && !f.kinds.includes(it.a.kind)) return false;
  if (f.tiers.length && !f.tiers.includes(it.a.tier)) return false;
  if (f.text.trim() && !nameHas(it.e.name, f.text)) return false;
  return true;
}

export const filterItems = (items, f) => (filterActive(f) ? items.filter((it) => matches(it, f)) : items.slice());

const jp = (a, b) => a.localeCompare(b, "ja", { numeric: true });
const mod = (it) => (Number.isFinite(it.e.modified) ? it.e.modified : null);

// 並べかえる（元は 変えない）。おなじなら、大きい順
export function sortItems(items, sort) {
  const bySize = (a, b) => (b.e.size || 0) - (a.e.size || 0) || jp(a.e.name, b.e.name);
  const cmp = {
    size: bySize,
    sizeUp: (a, b) => (a.e.size || 0) - (b.e.size || 0) || jp(a.e.name, b.e.name),
    name: (a, b) => jp(a.e.name, b.e.name),
    kind: (a, b) => KIND_ORDER.indexOf(a.a.kind) - KIND_ORDER.indexOf(b.a.kind) || bySize(a, b),
    // 日付のないものは 最後に
    new: (a, b) => (mod(a) === null) - (mod(b) === null) || (mod(b) || 0) - (mod(a) || 0) || bySize(a, b),
    old: (a, b) => (mod(a) === null) - (mod(b) === null) || (mod(a) || 0) - (mod(b) || 0) || bySize(a, b),
  }[normalizeSort(sort)];
  return items.slice().sort(cmp);
}

// 下の階層を探す条件（本体の search.find に渡す）。note は 画面に出す ひとこと
export function searchQueryOf(f) {
  const q = { kind: "file", hidden: false };
  const words = f.text.trim().split(/\s+/).filter(Boolean);
  if (words.length) q.name = words[0];                       // 残りの言葉は、見つかったあとに こちらでしぼる
  // 砲弾は「そのほか」なので、拡張子では書けない。選ばれていたら、拡張子ではしぼらない
  if (f.kinds.length && !f.kinds.includes("shot")) q.ext = [...new Set(f.kinds.flatMap((k) => EXT_BY_KIND[k] || []))];
  let defaulted = false;
  if (f.tiers.length) {
    const lo = Math.min(...f.tiers), hi = Math.max(...f.tiers);
    if (lo > 0) q.minSize = TIERS[lo].min;
    if (hi < TIERS.length - 1) q.maxSize = TIERS[hi + 1].min - 1;
  } else if (!words.length && !q.ext) {
    q.minSize = 20 * MB;                                     // 条件がなにもないと 多すぎるので、大きいものだけ
    defaulted = true;
  }
  return { query: q, defaulted };
}

// 条件を 人が読める 1 行にする
export function filterText(f, kindName = (k) => k) {
  const out = [];
  if (f.text.trim()) out.push(`名前「${f.text.trim()}」`);
  if (f.kinds.length) out.push(f.kinds.map(kindName).join("・"));
  if (f.tiers.length) out.push(f.tiers.slice().sort((a, b) => a - b).map((t) => TIERS[t].name).join("・"));
  return out.join("　");
}
