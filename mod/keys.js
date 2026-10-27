// キーの割り当てと、視点の設定。画面にも本体にも触らない（キーやマウスの受け取りは index.js）。
//   割り当ての名前（トークン）：キーは KeyboardEvent.code（"KeyW" "Space" "ShiftLeft"）、マウスは "Mouse0"（左）"Mouse1"（中）"Mouse2"（右）、ホイールは "WheelUp" "WheelDown"
//   1つの操作に、主・副の 2 つまで割り当てられる。片手（左手がキーボード、右手がマウス）で ぜんぶできるのが、はじめの割り当て
import { KIND_ORDER } from "./ammo.js";

export const ACTIONS = [
  { id: "moveF", group: "移動", label: "前へ", def: ["KeyW"] },
  { id: "moveB", group: "移動", label: "後ろへ", def: ["KeyS"] },
  { id: "moveL", group: "移動", label: "左へ", def: ["KeyA"] },
  { id: "moveR", group: "移動", label: "右へ", def: ["KeyD"] },
  { id: "up", group: "移動", label: "上昇", def: ["Space"] },
  { id: "down", group: "移動", label: "下降", def: ["KeyC"] },
  { id: "dash", group: "移動", label: "ダッシュ", def: ["ShiftLeft"] },
  { id: "focus", group: "移動", label: "精密移動", def: ["KeyZ"] },
  { id: "shoot", group: "攻撃", label: "ショット", def: ["Mouse0", "KeyJ"] },
  { id: "charge", group: "攻撃", label: "溜めて撃つ・集束弾の起爆", def: ["Mouse2", "KeyK"] },
  ...KIND_ORDER.map((k, i) => ({ id: `kind${i + 1}`, group: "弾", label: `種類 ${i + 1} を選ぶ`, def: [`Digit${i + 1}`], kind: k })),
  { id: "kindNext", group: "弾", label: "次の種類", def: ["KeyE", "WheelDown"] },
  { id: "kindPrev", group: "弾", label: "前の種類", def: ["KeyQ", "WheelUp"] },
  { id: "fileNext", group: "弾", label: "同じ種類の 次のファイル", def: ["KeyR"] },
  { id: "lock", group: "視点", label: "ボスのほうを向く", def: ["KeyF", "Mouse1"] },
  { id: "view", group: "視点", label: "一人称・三人称", def: ["KeyV"] },
  { id: "lookL", group: "視点", label: "視点を左へ", def: ["ArrowLeft"] },
  { id: "lookR", group: "視点", label: "視点を右へ", def: ["ArrowRight"] },
  { id: "lookU", group: "視点", label: "視点を上へ", def: ["ArrowUp"] },
  { id: "lookD", group: "視点", label: "視点を下へ", def: ["ArrowDown"] },
  { id: "pause", group: "そのほか", label: "中断", def: ["KeyP"] },
];
export const ACTION_IDS = ACTIONS.map((a) => a.id);
export const actionOf = (id) => ACTIONS.find((a) => a.id === id);
// この操作は 押した瞬間だけ働く（ほかは、押している間）
export const PULSE = new Set(["kindNext", "kindPrev", "fileNext", "view", "pause", ...KIND_ORDER.map((_, i) => `kind${i + 1}`)]);

// 変えられないキー。Esc は、ポインターを外す・中断する、に決まっている
export const FIXED_TOKENS = new Set(["Escape"]);

export const defaultBindings = () => Object.fromEntries(ACTIONS.map((a) => [a.id, a.def.slice()]));

// 保存されていた割り当てを 読みなおす。壊れていたり、足りない操作があれば、はじめの割り当てで うめる
export function normalizeBindings(raw) {
  const b = defaultBindings();
  if (!raw || typeof raw !== "object") return b;
  const used = new Set();
  for (const id of ACTION_IDS) {
    if (!Array.isArray(raw[id])) continue;
    const list = [];
    for (const t of raw[id].slice(0, 2)) if (typeof t === "string" && t && !FIXED_TOKENS.has(t) && !used.has(t)) { list.push(t); used.add(t); }
    b[id] = list;
  }
  // 保存になかった操作は、はじめのキーが ほかに使われていなければ、そのまま
  for (const id of ACTION_IDS) if (!Array.isArray(raw[id])) b[id] = actionOf(id).def.filter((t) => !used.has(t));
  return b;
}

// action の slot（0 主・1 副）に token を割り当てる。ほかの操作が token を使っていたら、そこから外す
export function bind(bindings, action, slot, token) {
  if (!ACTION_IDS.includes(action) || FIXED_TOKENS.has(token) || typeof token !== "string" || !token) return { bindings, lost: [], ok: false };
  const out = Object.fromEntries(Object.entries(bindings).map(([k, v]) => [k, v.slice()]));
  const lost = [];
  for (const id of ACTION_IDS) {
    const i = out[id].indexOf(token);
    if (i >= 0) { out[id].splice(i, 1); if (id !== action) lost.push(id); }
  }
  const list = out[action];
  if (slot < list.length) list[slot] = token; else list.push(token);
  out[action] = list.slice(0, 2);
  return { bindings: out, lost, ok: true };
}

export function unbind(bindings, action, slot) {
  const out = Object.fromEntries(Object.entries(bindings).map(([k, v]) => [k, v.slice()]));
  if (out[action]) out[action].splice(slot, 1);
  return out;
}

// どの操作が、どのトークンか
export function tokenMap(bindings) {
  const m = new Map();
  for (const id of ACTION_IDS) for (const t of bindings[id] || []) { if (!m.has(t)) m.set(t, []); m.get(t).push(id); }
  return m;
}

const KEY_NAMES = {
  Space: "Space", ShiftLeft: "左Shift", ShiftRight: "右Shift", ControlLeft: "左Ctrl", ControlRight: "右Ctrl", AltLeft: "左Alt", AltRight: "右Alt",
  Tab: "Tab", Enter: "Enter", Backspace: "Backspace", CapsLock: "CapsLock", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  PageUp: "PageUp", PageDown: "PageDown", Home: "Home", End: "End", Insert: "Insert", Delete: "Delete",
  Mouse0: "マウス左", Mouse1: "マウス中ボタン", Mouse2: "マウス右", Mouse3: "マウス戻る", Mouse4: "マウス進む", WheelUp: "ホイール上", WheelDown: "ホイール下",
  Backquote: "@", Minus: "-", Equal: "^", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: ":", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};
export function tokenLabel(t) {
  if (!t) return "なし";
  if (KEY_NAMES[t]) return KEY_NAMES[t];
  let m = /^Key([A-Z])$/.exec(t);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(t);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(t);
  if (m) return `テンキー ${m[1]}`;
  return t;
}

// 押されているトークンの集まりから、操作の状態を読む
export class Controls {
  constructor(bindings = defaultBindings()) { this.set(bindings); this.down = new Set(); }
  set(bindings) { this.bindings = bindings; this.map = tokenMap(bindings); }
  press(token) { this.down.add(token); return this.map.get(token) || []; }
  release(token) { this.down.delete(token); return this.map.get(token) || []; }
  clear() { this.down.clear(); }
  held(action) { return (this.bindings[action] || []).some((t) => this.down.has(t)); }
  axis(neg, pos) { return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0); }
}

// 視点の設定
// 狙いの補助：照準が ボスから この角度（度）の中なら、弾はボスへ向かう。360 は 完全（どこを向いていても ボスへ）
export const ASSIST_CHOICES = [0, 5, 7, 10, 14, 360];
export const AUTOTURN_CHOICES = ["off", "weak", "strong"];
export const defaultLook = () => ({ sens: 0.0022, invertY: false, assist: 360, autoFire: true, autoTurn: "weak", view: "first", warn: true });
export function normalizeLook(raw) {
  const d = defaultLook();
  if (!raw || typeof raw !== "object") return d;
  const sens = Number(raw.sens);
  return {
    sens: Number.isFinite(sens) ? Math.min(0.008, Math.max(0.0006, sens)) : d.sens,
    invertY: !!raw.invertY,
    assist: ASSIST_CHOICES.includes(raw.assist) ? raw.assist : d.assist,
    autoTurn: AUTOTURN_CHOICES.includes(raw.autoTurn) ? raw.autoTurn : d.autoTurn,
    view: raw.view === "third" ? "third" : "first",
    warn: raw.warn !== false,
    autoFire: raw.autoFire !== false,
  };
}
