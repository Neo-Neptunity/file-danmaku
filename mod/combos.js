// 役。マガジンの中身（種類・段・大きさ・名前・拡張子）から決まり、その面の能力になる。画面にも本体にも触らない。
//   evalCombos(ファイルの並び, 解放している役) → { list: [{ id, name, fx, who }], mods, missed }
//   解放していない役は つかない（missed に、つくはずだった役と 設計図の数が入る）。解放の指定を省くと、ぜんぶ解放している扱い
//   fx と mods の項目：dmgAll 全砲の威力　dmg[種類] その種類の威力　count[種類] その種類の数　basic ふつうの弾　lives ライフ　speed 移動
//   climb 上昇下降　charge 溜めの速さ　graze かすりの溜め　inv 無敵の長さ（秒）　dash ダッシュの間を縮める割合　shield バリアの回数　chargeSlow 溜め中の足　weak 弱点ダメージ
//   数字は足し算（0.15 は +15%）。lives と shield は回数、inv は秒
import { KINDS, GB } from "./ammo.js";

export const emptyMods = () => ({ dmgAll: 0, dmg: {}, count: {}, basic: 0, lives: 0, speed: 0, climb: 0, charge: 0, graze: 0, inv: 0, dash: 0, shield: 0, chargeSlow: 0, weak: 0 });

const CAPS = { dmgAll: 1.5, basic: 1.5, lives: 3, speed: 0.35, climb: 0.6, charge: 0.7, graze: 1, inv: 1, dash: 0.6, shield: 3, chargeSlow: 0.6, weak: 1 };
const KIND_CAPS = { dmg: 2, count: 1 };

// 同じ種類の枚数による役。fx の _ は、その種類に置きかわる。cost は 解放に要る設計図（0 はじめから）
const KIND_RULES = [
  { min: 8, id: "big", name: "大家族", fx: { dmg: { _: 2 }, count: { _: 1 }, lives: 1 }, cond: "同じ種類が 8枚以上", cost: 4 },
  { min: 5, id: "five", name: "ファイブカード", fx: { dmg: { _: 1.2 }, count: { _: 0.8 }, lives: 1 }, cond: "同じ種類が 5〜7枚", cost: 3 },
  { min: 4, id: "four", name: "フォーカード", fx: { dmg: { _: 0.7 }, count: { _: 0.5 } }, cond: "同じ種類が 4枚", cost: 2 },
  { min: 3, id: "three", name: "スリーカード", fx: { dmg: { _: 0.35 }, charge: 0.08 }, cond: "同じ種類が 3枚", cost: 0 },
  { min: 2, id: "pair", name: "ペア", fx: { dmg: { _: 0.15 } }, cond: "同じ種類が 2枚", cost: 0 },
];

const BACKUP = /backup|バックアップ|コピー|copy|\.bak$|\(\d+\)/i;

// 手の集計：役の条件は、ここから読む
function handOf(mag) {
  const hand = mag.filter(Boolean);
  const byKind = {}, byExt = {}, byFirst = {}, bySize = {};
  for (const a of hand) {
    byKind[a.kind] = (byKind[a.kind] || 0) + 1;
    if (a.ext) byExt[a.ext] = (byExt[a.ext] || 0) + 1;
    const f = (a.name[0] || "").toLowerCase();
    if (/[\p{L}\p{N}]/u.test(f)) byFirst[f] = (byFirst[f] || 0) + 1;
    if (a.bytes > 0) bySize[a.bytes] = (bySize[a.bytes] || 0) + 1;
  }
  const tiers = new Set(hand.map((a) => a.tier));
  let run = 0, best = 0;
  for (let t = 0; t <= 5; t++) { run = tiers.has(t) ? run + 1 : 0; best = Math.max(best, run); }
  return {
    hand, n: hand.length, byKind, byExt, byFirst, bySize, kinds: Object.keys(byKind), run: best,
    total: hand.reduce((s, a) => s + a.bytes, 0),
    big: hand.filter((a) => a.tier >= 4).length,
    small: hand.filter((a) => a.tier <= 1).length,
    top: hand.some((a) => a.tier >= 5),
    sameTier: hand.length >= 6 && hand.every((a) => a.tier === hand[0].tier),
    backup: hand.filter((a) => BACKUP.test(a.name)).length,
    maxOf: (o) => Math.max(0, ...Object.values(o)),
  };
}

// 種類をまたぐ役。test が fx を返せば成立（{ name, fx } を返せば、名前をかえる）
const RULES = [
  { id: "twopair", name: "ツーペア", cond: "2つの種類が、それぞれ 2枚以上", guide: "溜め +12%", cost: 0, test: (h) => (Object.values(h.byKind).filter((c) => c >= 2).length >= 2 ? { charge: 0.12 } : null) },
  { id: "fullhouse", name: "フルハウス", cond: "3枚以上の種類と、ほかの 2枚以上の種類", guide: "全砲の威力 +12%、ライフ +1", cost: 2, test: (h) => {
    const c = Object.entries(h.byKind);
    return c.some(([k, n]) => n >= 3 && c.some(([k2, n2]) => k2 !== k && n2 >= 2)) ? { dmgAll: 0.12, lives: 1 } : null;
  } },
  { id: "fullcourse", name: "フルコース", cond: "8種類そろい", guide: "全砲の威力 +25%、溜め +25%、ライフ +1", cost: 4, test: (h) => (h.kinds.length >= 8 ? { dmgAll: 0.25, charge: 0.25, lives: 1 } : null) },
  { id: "variety", name: "バラエティ", cond: "5種類以上", guide: "溜め +10%、移動 +8%", cost: 1, test: (h) => (h.kinds.length >= 5 && h.kinds.length < 8 ? { charge: 0.1, speed: 0.08 } : null) },
  { id: "stairs", name: "ロマンの階段", cond: "段が 4つ続く。5つ以上続くと強くなる", guide: "全砲の威力 +20%。5つ以上は +35%とライフ +1", cost: 2, test: (h) => (h.run >= 5 ? { dmgAll: 0.35, lives: 1 } : h.run >= 4 ? { dmgAll: 0.2 } : null) },
  { id: "three-pillars", name: "ロマン砲の三本柱", cond: "1GB 以上が 3つ以上", guide: "溜め中の足 +50%、無敵 +0.6秒、ライフ +1", cost: 3, test: (h) => (h.big >= 3 ? { chargeSlow: 0.5, inv: 0.6, lives: 1 } : null) },
  { id: "two-pillars", name: "ロマン砲の二枚看板", cond: "1GB 以上が 2つ", guide: "溜め中の足 +35%、無敵 +0.3秒", cost: 2, test: (h) => (h.big === 2 ? { chargeSlow: 0.35, inv: 0.3 } : null) },
  { id: "top", name: "超ロマン砲持ち", cond: "10GB 以上が 1つ以上", guide: "弱点ダメージ +40%、全砲の威力 +10%", cost: 3, test: (h) => (h.top ? { weak: 0.4, dmgAll: 0.1 } : null) },
  { id: "heavy", name: "ずっしり", cond: "合計 4GB 以上。20GB 以上は どっしり", guide: "ライフ +1。どっしりは +2", cost: 0, test: (h) => (h.total >= 20 * GB ? { name: "どっしり", fx: { lives: 2 } } : h.total >= 4 * GB ? { lives: 1 } : null) },
  { id: "uniform", name: "粒ぞろい", cond: "6つ以上で、段がぜんぶ同じ", guide: "全砲の威力 +20%", cost: 2, test: (h) => (h.sameTier ? { dmgAll: 0.2 } : null) },
  { id: "beans", name: "豆の群れ", cond: "5MB 未満が 10 以上", guide: "ふつうの弾 +50%、移動 +12%", cost: 1, test: (h) => (h.small >= 10 ? { basic: 0.5, speed: 0.12 } : null) },
  { id: "sameext", name: "おなじ拡張子", cond: "同じ拡張子が 3つ。6つ以上で強くなる", guide: "ダッシュの間 -30%。6つ以上は -50%", cost: 1, test: (h) => { const m = h.maxOf(h.byExt); return m >= 6 ? { dash: 0.5 } : m >= 3 ? { dash: 0.3 } : null; } },
  { id: "backup", name: "バックアップ癖", cond: "名前に backup・バックアップ・コピー・copy などが 2つ。4つで強くなる", guide: "バリア 1回。4つ以上は 2回", cost: 2, test: (h) => (h.backup >= 4 ? { shield: 2 } : h.backup >= 2 ? { shield: 1 } : null) },
  { id: "twins", name: "双子", cond: "大きさがぴったり同じファイルが 2つ", guide: "上昇下降 +25%", cost: 1, test: (h) => (h.maxOf(h.bySize) >= 2 ? { climb: 0.25 } : null) },
  { id: "initial", name: "名前そろい", cond: "同じ頭文字が 3つ以上", guide: "かすりの溜め +50%", cost: 1, test: (h) => (h.maxOf(h.byFirst) >= 3 ? { graze: 0.5 } : null) },
];

// はじめから解放している役
export const START_COMBOS = [...KIND_RULES, ...RULES].filter((r) => r.cost === 0).map((r) => r.id);
export const ALL_COMBO_IDS = [...KIND_RULES, ...RULES].map((r) => r.id);
export const comboCost = (id) => { const r = [...KIND_RULES, ...RULES].find((x) => x.id === id); return r ? r.cost : Infinity; };

const subKind = (fx, k) => {
  const out = { ...fx };
  for (const key of ["dmg", "count"]) if (fx[key]) out[key] = Object.fromEntries(Object.entries(fx[key]).map(([, v]) => [k, v]));
  return out;
};

const whoOf = (hand, pred) => hand.filter(pred).map((a, i) => (a.uid !== undefined ? a.uid : i));

export function evalCombos(mag, unlocked = null) {
  const h = handOf(mag);
  const open = unlocked ? new Set(unlocked) : null;
  const isOpen = (id) => !open || open.has(id);
  const list = [], missed = [];
  for (const k of h.kinds) {
    const n = h.byKind[k];
    const fit = KIND_RULES.filter((x) => n >= x.min);
    const use = fit.find((r) => isOpen(r.id));
    if (use) list.push({ id: `${use.id}-${k}`, name: `${KINDS[k].name}の${use.name}`, fx: subKind(use.fx, k), who: whoOf(h.hand, (a) => a.kind === k), kind: k });
    const top = fit[0];
    if (top && !isOpen(top.id)) missed.push({ id: top.id, name: `${KINDS[k].name}の${top.name}`, cost: top.cost, fx: subKind(top.fx, k) });
  }
  for (const r of RULES) {
    const t = r.test(h);
    if (!t) continue;
    const fx = t.fx || t, name = t.name || r.name;
    if (isOpen(r.id)) list.push({ id: r.id, name, fx, who: [] });
    else missed.push({ id: r.id, name, cost: r.cost, fx });
  }
  return { list, mods: foldMods(list), missed };
}

// 役の効果（と 強化の効果）を ひとつに足して、上限をかける
export function foldMods(list) {
  const m = emptyMods();
  for (const c of list) {
    for (const [key, v] of Object.entries(c.fx)) {
      if (key === "dmg" || key === "count") for (const [k, x] of Object.entries(v)) m[key][k] = (m[key][k] || 0) + x;
      else m[key] += v;
    }
  }
  for (const [key, cap] of Object.entries(CAPS)) m[key] = Math.min(cap, m[key]);
  for (const [key, cap] of Object.entries(KIND_CAPS)) for (const k of Object.keys(m[key])) m[key][k] = Math.min(cap, m[key][k]);
  return m;
}

const pct = (v) => `${v >= 0 ? "+" : "-"}${Math.round(Math.abs(v) * 100)}%`;

// fx（または mods）を、画面に出す短い文にする
export function fxText(fx, nameOf = (k) => KINDS[k].name) {
  const out = [];
  if (fx.dmgAll) out.push(`全砲の威力 ${pct(fx.dmgAll)}`);
  for (const [k, v] of Object.entries(fx.dmg || {})) if (v) out.push(`${nameOf(k)}の威力 ${pct(v)}`);
  for (const [k, v] of Object.entries(fx.count || {})) if (v) out.push(`${nameOf(k)}の数 ${pct(v)}`);
  if (fx.lives) out.push(`ライフ +${fx.lives}`);
  if (fx.shield) out.push(`バリア ${fx.shield}回`);
  if (fx.speed) out.push(`移動 ${pct(fx.speed)}`);
  if (fx.climb) out.push(`上昇下降 ${pct(fx.climb)}`);
  if (fx.charge) out.push(`溜め ${pct(fx.charge)}`);
  if (fx.chargeSlow) out.push(`溜め中の足 ${pct(fx.chargeSlow)}`);
  if (fx.basic) out.push(`ふつうの弾 ${pct(fx.basic)}`);
  if (fx.graze) out.push(`かすりの溜め ${pct(fx.graze)}`);
  if (fx.weak) out.push(`弱点ダメージ ${pct(fx.weak)}`);
  if (fx.inv) out.push(`無敵 +${fx.inv.toFixed(1)}秒`);
  if (fx.dash) out.push(`ダッシュの間 -${Math.round(fx.dash * 100)}%`);
  return out;
}

// 「役の一覧」に出す表
export const COMBO_GUIDE = [
  ...KIND_RULES.slice().reverse().map((r) => ({
    id: r.id, name: r.name, cond: r.cond, cost: r.cost,
    guide: fxText(subKind(r.fx, "_"), () => "その種類").join("、"),
  })),
  ...RULES.map((r) => ({ id: r.id, name: r.name, cond: r.cond, guide: r.guide, cost: r.cost })),
];
