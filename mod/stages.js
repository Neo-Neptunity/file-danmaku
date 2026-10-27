// 面とボス。ボスは 3〜4 のフェーズ（スペルカード）を持ち、フェーズごとに体力・制限時間・弾幕・弱点の入れかわる間隔が決まっている。
// 5面まで手書き。6面からは 種から機械的に作る（同じ面は、いつも同じボス）。
// 弾幕の高さ（lay）：floor 床　low 低　mid 中（ボスの高さ）　high 高　ceil 天井。勇者は 0.9〜6.0 を動ける
import { makeRng } from "./math.js";

export const DIFFS = {
  easy: { id: "easy", name: "やさしい", cm: 0.65, sm: 0.85, lives: 5, hp: 0.8 },
  normal: { id: "normal", name: "ふつう", cm: 1, sm: 1, lives: 3, hp: 1 },
  hard: { id: "hard", name: "むずかしい", cm: 1.3, sm: 1.12, lives: 3, hp: 1.15 },
  lunatic: { id: "lunatic", name: "ルナティック", cm: 1.6, sm: 1.25, lives: 2, hp: 1.3 },
};
export const DIFF_ORDER = ["easy", "normal", "hard", "lunatic"];

// 弾の色の番号 → rgb（0〜1）
export const BULLET_COLORS = [
  [1.0, 0.28, 0.4], [1.0, 0.62, 0.18], [1.0, 0.92, 0.3], [0.32, 1.0, 0.5],
  [0.25, 0.9, 1.0], [0.38, 0.52, 1.0], [0.72, 0.42, 1.0], [1.0, 0.42, 0.9],
];

// o.weak：弱点が入れかわる間隔（秒。0 なら弱点なし）　o.lift：ボスが上下にゆれる幅
const ph = (name, hp, time, move, atk, o = {}) => ({ name, hp, time, move, atk, weak: o.weak ?? 0, lift: o.lift ?? 0 });

const BOSSES = [
  {
    name: "断片化の蛇", title: "フラグメンタ", color: [0.3, 0.9, 1.0], shape: "octa",
    phases: [
      ph("断片化「はじまりの輪」", 900, 45, "sway", [
        { t: "ring", every: 1.9, n: 20, speed: 6, twist: 0.5, col: 4 },
        { t: "fan", every: 2.8, n: 5, spread: 0.7, speed: 9, col: 0, first: 1.8 },
      ]),
      ph("連鎖「渦巻く欠片」", 1100, 50, "sway", [
        { t: "spiral", arms: 3, rate: 10, spin: 1.0, speed: 6.2, col: 2, lay: ["mid", "high", "low"] },
        { t: "ring", every: 4.4, n: 24, holes: 1, holeW: 1.0, speed: 5.5, col: 1, first: 2.5, lay: ["high", "floor"] },
      ], { weak: 12 }),
      ph("再配置「花ひらく空き領域」", 1300, 70, "orbit", [
        { t: "flower", every: 3.6, petals: 5, n: 54, speed: 6, col: 3, lay: ["mid", "low", "high"] },
        { t: "rain", every: 1.0, n: 1, aim: 0.8, area: 5, warn: 1.0, first: 2.0 },
      ], { weak: 10 }),
    ],
  },
  {
    name: "キャッシュの亡霊", title: "ゴースト", color: [0.75, 0.5, 1.0], shape: "icosa",
    phases: [
      ph("残響「こだまする壁」", 1000, 45, "sway", [
        { t: "wall", every: 4.2, speed: 5.4, gapW: 3.8, col: 6, tall: true },
        { t: "fan", every: 3.2, n: 3, rows: 2, spread: 0.4, vfan: 0.12, speed: 8, col: 7, first: 2.2 },
      ], { weak: 11 }),
      ph("再読込「落ちる記憶」", 1250, 50, "dart", [
        { t: "rain", every: 0.55, n: 1, aim: 0.85, area: 6, warn: 0.9, speed: 24, col: 6 },
        { t: "snake", arms: 2, rate: 8, speed: 6, amp: 0.7, col: 5, first: 1.5, lay: ["low", "high"] },
        { t: "pillars", every: 4.5, n: 2, first: 3, col: 6 },
      ], { weak: 10 }),
      ph("幻影「光の風車」", 1500, 70, "tilt", [
        { t: "lasers", mode: "spin", arms: 3, spin: 0.42, every: 8.5, warn: 1.3, dur: 4.2, col: 7, lay: ["low", "high"], h: 0.8 },
        { t: "ring", every: 2.4, n: 22, speed: 5.8, twist: 0.5, col: 6, first: 3.0, tilt: "rand" },
      ], { weak: 10, lift: 0.6 }),
    ],
  },
  {
    name: "ダウンロードの巨人", title: "ジャイアント", color: [1.0, 0.62, 0.2], shape: "cube",
    phases: [
      ph("並列「三本の筋」", 1200, 50, "sway", [
        { t: "bloom", every: 5.4, n: 20, radius: 4.5, hold: 1.1, speed: 8.5, col: 1, lay: ["low", "mid", "high"], together: true },
        { t: "fan", every: 2.6, n: 7, rows: 2, spread: 1.1, vfan: 0.16, speed: 8, col: 2, first: 2.0 },
      ], { weak: 10 }),
      ph("中断「とまらない転送」", 1500, 55, "tilt", [
        { t: "spiral", arms: 4, rate: 9, spin: 1.2, speed: 6, col: 1, lay: ["floor", "low", "high", "ceil"] },
        { t: "orbs", every: 4.2, n: 3, speed: 4.2, turn: 1.0, first: 3.0 },
      ], { weak: 9 }),
      ph("完了「百パーセントの洪水」", 1800, 75, "chase", [
        { t: "burst", every: 4.2, n: 52, speed: 7, bounce: 1, col: 1 },
        { t: "wall", every: 5.2, speed: 5.2, gapW: 3.4, col: 2, first: 2.5, tall: true },
        { t: "drizzle", rate: 8, speed: 10, col: 2, first: 2.0 },
      ], { weak: 9, lift: 0.8 }),
    ],
  },
  {
    name: "レジストリの蜘蛛", title: "スパイダー", color: [0.35, 1.0, 0.5], shape: "dodeca",
    phases: [
      ph("探索「ねらう八つの目」", 1500, 50, "dart", [
        { t: "lasers", mode: "aim", arms: 3, gap: 0.55, sweep: 0.15, every: 6, warn: 1.1, dur: 2.2, col: 3, lay: "player", h: 0.7 },
        { t: "ring", every: 2.4, n: 26, speed: 5.5, twist: 0.5, col: 3, first: 2.0, tilt: "rand" },
      ], { weak: 9 }),
      ph("改変「はねる値」", 1800, 55, "tilt", [
        { t: "burst", every: 3.6, n: 56, speed: 6.5, bounce: 2, col: 3 },
        { t: "rain", every: 0.8, n: 1, aim: 0.9, area: 5, warn: 0.85, speed: 26, col: 2, first: 2.5 },
        { t: "pillars", every: 4.2, n: 3, first: 3.5, col: 3 },
      ], { weak: 9, lift: 0.8 }),
      ph("全削除「巣にからまる糸」", 2200, 80, "chase", [
        { t: "snake", arms: 3, rate: 11, speed: 6.2, amp: 0.9, freq: 2.0, col: 3, lay: ["low", "mid", "high"] },
        { t: "spiral", arms: 2, rate: 8, spin: -0.9, speed: 5.6, col: 2, first: 2.0, lay: ["floor", "ceil"] },
        { t: "bloom", every: 6, n: 30, radius: 5, hold: 1.2, speed: 8, col: 4, first: 3.0, lay: "player" },
      ], { weak: 8 }),
    ],
  },
  {
    name: "ごみ箱の王", title: "トラッシュキング", color: [1.0, 0.4, 0.85], shape: "knot",
    phases: [
      ph("廃棄「あふれる箱」", 1800, 55, "sway", [
        { t: "burst", every: 3.4, n: 60, speed: 7, bounce: 1, col: 7 },
        { t: "fan", every: 2.4, n: 7, rows: 3, spread: 1.0, vfan: 0.14, speed: 8.5, col: 0, first: 2.0 },
      ], { weak: 9 }),
      ph("復元「戻ってくる過去」", 2200, 60, "dart", [
        { t: "orbs", every: 3.2, n: 4, speed: 4.4, turn: 1.2, col: 7 },
        { t: "ring", every: 2.0, n: 28, holes: 2, holeW: 0.8, speed: 6, twist: 0.5, col: 6, first: 2.0, lay: ["low", "high", "mid"] },
        { t: "drizzle", rate: 8, speed: 10, col: 7, first: 1.5 },
      ], { weak: 8, lift: 0.6 }),
      ph("完全削除「空っぽの風車」", 2600, 70, "tilt", [
        { t: "lasers", mode: "spin", arms: 4, spin: 0.38, every: 8, warn: 1.2, dur: 4.5, col: 0, lay: ["mid", "low", "high"], h: 0.9 },
        { t: "spiral", arms: 3, rate: 10, spin: 1.1, speed: 6.4, col: 7, first: 3.0, lay: ["floor", "mid", "ceil"] },
        { t: "rain", every: 1.1, n: 1, aim: 0.85, area: 5, warn: 0.9, speed: 24, col: 0, first: 3.0 },
      ], { weak: 8 }),
      ph("空き容量「百パーセントの空」", 3200, 90, "chase", [
        { t: "flower", every: 3.4, petals: 6, n: 66, speed: 6, col: 7, lay: ["mid", "low", "high"] },
        { t: "wall", every: 4.8, speed: 5.4, gapW: 3.2, col: 0, first: 2.0, tall: true },
        { t: "burst", every: 5.0, n: 50, speed: 6.5, bounce: 1, col: 5, first: 4.0 },
        { t: "pillars", every: 4.0, n: 3, first: 3.0, col: 7 },
      ], { weak: 7, lift: 0.8 }),
    ],
  },
];

// 体力の全体の倍率と、制限時間の足し分。ふつうの弾だけで、1面は倒せて、3面あたりから砲がほしくなる
const HP_SCALE = 1.4, TIME_PAD = 10;

// 6面から先：部品を種から選んで組む
const PAIRS = [["floor", "mid"], ["low", "high"], ["mid", "ceil"], ["floor", "high"], ["low", "ceil"], ["floor", "ceil"]];
const pair = (r) => PAIRS[(r() * PAIRS.length) | 0];
const col = (r) => (r() * 8) | 0;
const POOL = [
  (r) => ({ t: "ring", every: 1.8 + r() * 1.2, n: 20 + ((r() * 10) | 0), speed: 5.5 + r() * 1.5, holes: r() < 0.5 ? 1 : 0, holeW: 0.9, col: col(r), lay: pair(r), together: r() < 0.4, tilt: r() < 0.4 ? "rand" : 0 }),
  (r) => ({ t: "spiral", arms: 2 + ((r() * 3) | 0), rate: 8 + ((r() * 4) | 0), spin: (r() < 0.5 ? -1 : 1) * (0.8 + r() * 0.6), speed: 5.6 + r() * 1.2, col: col(r), lay: ["floor", "mid", "ceil", "low", "high"].sort(() => r() - 0.5).slice(0, 3) }),
  (r) => ({ t: "fan", every: 2.2 + r(), n: 5 + ((r() * 4) | 0), rows: 1 + ((r() * 2) | 0), vfan: 0.12, spread: 0.8 + r() * 0.4, speed: 7.5 + r() * 2, col: col(r) }),
  (r) => ({ t: "flower", every: 3.2 + r(), petals: 4 + ((r() * 4) | 0), n: 56 + ((r() * 16) | 0), speed: 6, col: col(r), lay: pair(r) }),
  (r) => ({ t: "rain", every: 0.7 + r() * 0.5, aim: 0.85, area: 5, warn: 0.9, speed: 24, col: col(r) }),
  (r) => ({ t: "burst", every: 3.8 + r() * 1.2, n: 50 + ((r() * 16) | 0), speed: 6.5 + r(), bounce: 1 + ((r() * 2) | 0), col: col(r) }),
  (r) => ({ t: "wall", every: 3.8 + r() * 1.4, speed: 5.2 + r() * 0.8, gapW: 3.3, col: col(r), tall: true }),
  (r) => ({ t: "snake", arms: 2 + ((r() * 2) | 0), rate: 9 + ((r() * 3) | 0), speed: 6 + r() * 0.8, amp: 0.7 + r() * 0.4, col: col(r), lay: pair(r) }),
  (r) => ({ t: "orbs", every: 3.4 + r(), n: 3 + ((r() * 2) | 0), speed: 4.2, turn: 1 + r() * 0.4, col: col(r) }),
  (r) => ({ t: "bloom", every: 5 + r() * 1.5, n: 22 + ((r() * 6) | 0), radius: 4.5 + r(), hold: 1.1, speed: 8, col: col(r), lay: r() < 0.5 ? "player" : ["low", "mid", "high"], together: true }),
  (r) => ({ t: "lasers", mode: r() < 0.5 ? "spin" : "aim", arms: 3 + ((r() * 2) | 0), spin: 0.4, gap: 0.55, sweep: 0.12, every: 7 + r() * 2, warn: 1.2, dur: 3.6, col: col(r), lay: r() < 0.5 ? "player" : pair(r), h: 0.8 }),
  (r) => ({ t: "drizzle", rate: 8 + ((r() * 4) | 0), speed: 10, col: col(r) }),
  (r) => ({ t: "pillars", every: 3.6 + r(), n: 2 + ((r() * 3) | 0), col: col(r) }),
];
const MOVES = ["sway", "orbit", "tilt", "dart", "chase"];
const SHAPES = ["octa", "icosa", "cube", "dodeca", "knot", "tetra"];
const SUFFIX = ["の亡霊", "の番人", "の王", "の化身", "の怪物"];
const PREFIX = ["フォルダ", "ドライブ", "ログ", "キュー", "バッファ", "スレッド", "ヒープ", "スタック"];

function generated(n, seed) {
  const r = makeRng(seed * 7919 + n * 104729);
  const phases = [];
  const count = 3 + (n >= 8 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const parts = last ? 4 : 2 + (r() < 0.5 ? 1 : 0);
    const atk = [];
    const used = new Set();
    while (atk.length < parts) {
      const j = (r() * POOL.length) | 0;
      if (used.has(j)) continue;
      used.add(j);
      const a = POOL[j](r);
      a.first = 1.5 + atk.length * 0.8;
      atk.push(a);
    }
    phases.push(ph(`第${i + 1}形態「${PREFIX[(r() * PREFIX.length) | 0]}${["の嵐", "の輪", "の雨", "の海"][(r() * 4) | 0]}」`, 1500 + i * 300, last ? 80 : 50, MOVES[(r() * MOVES.length) | 0], atk, { weak: 8 + ((r() * 3) | 0), lift: i % 2 ? 0.7 : 0 }));
  }
  return {
    name: `${PREFIX[(r() * PREFIX.length) | 0]}${SUFFIX[(r() * SUFFIX.length) | 0]}`, title: `第${n}面のボス`,
    color: [0.4 + r() * 0.6, 0.4 + r() * 0.6, 0.4 + r() * 0.6], shape: SHAPES[(r() * SHAPES.length) | 0], phases,
  };
}

// ---- フォルダのボス（folderboss.js から使う）----
// 種類ごとの 弾幕の好み（POOL の番号）：0 輪　1 渦巻き　2 扇　3 花　4 雨　5 全方向　6 壁　7 蛇　8 追う玉　9 咲く玉　10 レーザー　11 小雨　12 柱
export const THEME = { shot: [0, 2], spread: [11, 3, 0], beam: [10, 6], wave: [0, 7, 1], homing: [2, 8, 4], cluster: [9, 5], blast: [5, 12, 4], meteor: [12, 4, 6] };
// フェーズの名前：[書き出し, 呼び名]
const FORM = {
  shot: ["断片", ["積み上がる行", "終わらない関数", "崩れる依存"]], spread: ["現像", ["降りそそぐ画素", "まばゆい現像液", "重なる焼き増し"]],
  beam: ["再生", ["止まらない光", "回りつづける映写", "まぶしい上映"]], wave: ["共鳴", ["ひろがる音", "重なる倍音", "反響する旋律"]],
  homing: ["校正", ["追いかける赤字", "終わらない校閲", "積もる未読"]], cluster: ["展開", ["ほどける束", "ほどけない結び目", "開かない封"]],
  blast: ["起動", ["はじける常駐", "勝手にふえる起動", "あばれるプロセス"]], meteor: ["マウント", ["降る巨大な塊", "落ちるイメージ", "止まらない接続"]],
};
// spec：{ kinds（フェーズごとの種類）, count（フェーズの数）, last（さいごのフェーズの名前）, ほか name title color shape hudLabel kindMul などは そのまま通す }
export function themedBase(n, seed, spec) {
  const r = makeRng(seed * 7919 + n * 104729 + 17);
  const count = spec.count || 3, phases = [], seen = {};
  for (let i = 0; i < count; i++) {
    const last = i === count - 1, kind = spec.kinds[i % spec.kinds.length], theme = THEME[kind] || THEME.shot;
    const order = theme.slice().sort(() => r() - 0.5);
    const parts = last ? 3 : 2;
    const atk = [];
    for (let k = 0; k < parts; k++) {
      // 好みの弾幕を使いきったら、ほかの好みから 1 つ借りる
      const idx = k < order.length ? order[k] : (r() * POOL.length) | 0;
      const a = POOL[idx](r);
      a.first = 1.5 + k * 0.8;
      atk.push(a);
    }
    const [head, tails] = FORM[kind] || FORM.shot, nth = seen[kind] = (seen[kind] ?? -1) + 1;
    const name = last && spec.last ? spec.last : `${head}「${tails[nth % tails.length]}」`;
    phases.push(ph(name, 1500 + i * 300, last ? 80 : 50, MOVES[(r() * MOVES.length) | 0], atk, { weak: i === 0 && n <= 2 ? 0 : 8 + ((r() * 3) | 0), lift: i % 2 ? 0.7 : 0 }));
  }
  const { kinds, count: _c, last: _l, ...rest } = spec;
  return { ...rest, phases };
}

// 面が進むほど、弾の数と速さが増える（上限あり）
export const stageScale = (n) => ({ cm: Math.min(2.0, 1 + 0.08 * (n - 1)), sm: Math.min(1.5, 1 + 0.045 * (n - 1)) });

// n 面のボス。体力は、面が進むほど増える。難しさで さらに変わる。時間は ふつうの弾でも間に合うよう 少し足す
export function bossFor(n, diffId = "normal", seed = 1, custom = null) {
  const base = custom || (n <= BOSSES.length ? BOSSES[n - 1] : generated(n, seed));
  const d = DIFFS[diffId] || DIFFS.normal;
  const mul = HP_SCALE * (1 + 0.25 * (n - 1)) * d.hp;
  return {
    ...base,
    stage: n,
    scale: stageScale(n),
    phases: base.phases.map((p) => ({ ...p, hp: Math.round(p.hp * mul), time: p.time + TIME_PAD, atk: p.atk.map((a) => ({ ...a })) })),
  };
}
