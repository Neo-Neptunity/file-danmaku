// 強化素材と整備場。面をクリアすると素材が手に入り、マガジンの広さ・役の解放・攻撃力・ライフ・速さを 伸ばせる。
// 画面にも本体にも触らない。保存する形は defaultMeta() と同じ（ep.storage の "meta"）
import { BOARD_SIZES } from "./puzzle.js";
import { START_COMBOS, ALL_COMBO_IDS, comboCost } from "./combos.js";

export const MATS = {
  mem: { name: "メモリ片", note: "マガジンを広げる" },
  core: { name: "コア", note: "火力・溜め・ふつうの弾" },
  plate: { name: "プレート", note: "ライフ・速さ" },
  bp: { name: "設計図", note: "役の解放" },
};
export const MAT_ORDER = ["mem", "core", "plate", "bp"];

// 強化。costs[段] が、その段へ上げるのに要る素材の数。per は 1 段あたりの効き
export const UPGRADES = [
  { id: "cap", name: "マガジン拡張", mat: "mem", costs: [3, 4, 5, 6, 8, 10, 12, 14, 16], note: "盤が 1 段 広がる" },
  { id: "pow", name: "火力", mat: "core", costs: [2, 2, 3, 3, 4, 5, 6, 7, 8, 10], note: "全砲・ふつうの弾の威力 +5%", per: { dmgAll: 0.05 } },
  { id: "chg", name: "溜め", mat: "core", costs: [3, 4, 5, 6, 8], note: "溜め +5%", per: { charge: 0.05 } },
  { id: "bolt", name: "ふつうの弾", mat: "core", costs: [2, 3, 4, 5, 6], note: "ふつうの弾 +8%", per: { basic: 0.08 } },
  { id: "arm", name: "装甲", mat: "plate", costs: [3, 5, 8], note: "ライフ +1", per: { lives: 1 } },
  { id: "spd", name: "機動", mat: "plate", costs: [2, 3, 4, 5, 6], note: "移動 +4%", per: { speed: 0.04 } },
];
export const upgradeOf = (id) => UPGRADES.find((u) => u.id === id);

export const defaultMeta = () => ({
  mats: { mem: 0, core: 0, plate: 0, bp: 0 },
  lv: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
  combos: START_COMBOS.slice(),
});

// 保存されていたものを、いまの決まりに合わせて 読みなおす（壊れていても、使える形にする）
export function normalizeMeta(raw) {
  const m = defaultMeta();
  if (!raw || typeof raw !== "object") return m;
  for (const k of MAT_ORDER) m.mats[k] = Math.max(0, Math.floor(Number(raw.mats && raw.mats[k]) || 0));
  for (const u of UPGRADES) m.lv[u.id] = Math.max(0, Math.min(u.costs.length, Math.floor(Number(raw.lv && raw.lv[u.id]) || 0)));
  const set = new Set(START_COMBOS);
  if (Array.isArray(raw.combos)) for (const id of raw.combos) if (ALL_COMBO_IDS.includes(id)) set.add(id);
  m.combos = [...set];
  return m;
}

export const levelOf = (meta, id) => meta.lv[id] || 0;
export const nextCost = (meta, id) => { const u = upgradeOf(id); const lv = levelOf(meta, id); return u && lv < u.costs.length ? u.costs[lv] : null; };
export const boardSize = (meta) => BOARD_SIZES[Math.min(BOARD_SIZES.length - 1, levelOf(meta, "cap"))];

// 強化を 1 段上げる。素材が足りなければ null。新しい meta を返す（元は変えない）
export function buy(meta, id) {
  const u = upgradeOf(id), cost = nextCost(meta, id);
  if (!u || cost === null || meta.mats[u.mat] < cost) return null;
  const m = normalizeMeta(meta);
  m.mats[u.mat] -= cost;
  m.lv[id] += 1;
  return m;
}

// 役を解放する。設計図が足りない・もう解放している なら null
export function buyCombo(meta, id) {
  const cost = comboCost(id);
  if (!Number.isFinite(cost) || meta.combos.includes(id) || meta.mats.bp < cost) return null;
  const m = normalizeMeta(meta);
  m.mats.bp -= cost;
  m.combos.push(id);
  return m;
}

// 強化が 勇者にあたえる効果（役の効果と同じ形。足し算）
export function metaFx(meta) {
  const fx = { dmgAll: 0, charge: 0, basic: 0, lives: 0, speed: 0 };
  for (const u of UPGRADES) if (u.per) for (const [k, v] of Object.entries(u.per)) fx[k] += v * levelOf(meta, u.id);
  return fx;
}

const DIFF_MAT = { easy: 0.7, normal: 1, hard: 1.3, lunatic: 1.7 };

// 面のおわりに もらえる素材。やられたときは、倒したフェーズの割合だけ。ノーミスなら +25%
export function rewards({ stage, diff = "normal", phases = 0, phaseCount = 3, cleared = false, noMiss = false, mult = 1 }) {
  const full = {
    mem: 3 + stage,
    core: 3 + stage,
    plate: 1 + Math.floor(stage / 2),
    bp: stage % 2 === 0 ? 2 : 1,
  };
  const share = cleared ? 1 : Math.min(1, phases / Math.max(1, phaseCount)) * 0.8;
  const k = (DIFF_MAT[diff] || 1) * share * (cleared && noMiss ? 1.25 : 1) * mult;
  const out = {};
  for (const m of MAT_ORDER) out[m] = Math.floor(full[m] * k + 0.0001);
  if (cleared && mult >= 1) for (const m of MAT_ORDER) out[m] = Math.max(out[m], 1);
  return out;
}

export function addMats(meta, got) {
  const m = normalizeMeta(meta);
  for (const k of MAT_ORDER) m.mats[k] += Math.max(0, Math.floor(got[k] || 0));
  return m;
}

export const matsText = (got) => MAT_ORDER.filter((k) => got[k] > 0).map((k) => `${MATS[k].name} ${got[k]}`).join("　");
