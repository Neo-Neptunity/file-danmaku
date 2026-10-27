// 弾の図鑑の絵（SVG）。左が 勇者、右が ボス。横から見た図で、種類ごとの撃ち方と特性を 描く。画像ファイルは使わない。
import { KINDS } from "./ammo.js";

const W = 240, H = 132;
const EN = "#ff6b8a";      // 敵の弾
const INK = "#cfd8ff", DIM = "#6f7cc0", YOU = "#7df3ff", BOSS = "#a8b8ff";

const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 10}" fill="${o.fill || INK}" text-anchor="${o.anchor || "middle"}" font-weight="${o.w || 700}">${s}</text>`;
const you = (x, y) => `<polygon points="${x - 9},${y - 7} ${x + 9},${y} ${x - 9},${y + 7}" fill="${YOU}" opacity=".95"/><circle cx="${x - 2}" cy="${y}" r="1.8" fill="#fff"/>`;
const boss = (x, y, r = 15) => `<g stroke="${BOSS}" stroke-width="1.6" fill="rgba(120,150,255,.12)"><polygon points="${x},${y - r} ${x + r * 0.9},${y} ${x},${y + r} ${x - r * 0.9},${y}"/><line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/><line x1="${x - r * 0.9}" y1="${y}" x2="${x + r * 0.9}" y2="${y}"/></g>`;
const dot = (x, y, r, fill, op = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${op}"/>`;
const ghost = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${EN}" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>`;
const line = (x1, y1, x2, y2, c, w = 1.4, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ""} opacity="${o.op ?? 1}" ${o.cap ? 'stroke-linecap="round"' : ""}/>`;
const arrow = (x1, y1, x2, y2, c, w = 1.6) => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 5;
  return `${line(x1, y1, x2, y2, c, w)}<polygon points="${x2},${y2} ${x2 - h * Math.cos(a - 0.45)},${y2 - h * Math.sin(a - 0.45)} ${x2 - h * Math.cos(a + 0.45)},${y2 - h * Math.sin(a + 0.45)}" fill="${c}"/>`;
};
const key = (x, y, label) => `<rect x="${x - 26}" y="${y - 9}" width="52" height="18" rx="4" fill="#1a2152" stroke="#7a8cff"/>${t(x, y + 3.5, label, { size: 9.5 })}`;

const SCENES = {
  // 砲弾：まっすぐ貫く。遠いほど強い
  shot(c) {
    return `${you(22, 62)}${boss(210, 62)}
      ${line(34, 62, 192, 62, DIM, 1, { dash: "3 4" })}
      ${dot(96, 62, 3, EN)}${dot(110, 56, 3, EN)}${dot(118, 68, 3, EN)}${ghost(150, 62, 4)}${ghost(160, 58, 4)}${ghost(168, 67, 4)}
      <circle r="9" fill="${c}" opacity=".25"><animateMotion dur="1.7s" repeatCount="indefinite" path="M34,62 L196,62"/></circle>
      <circle r="5" fill="#fff"><animateMotion dur="1.7s" repeatCount="indefinite" path="M34,62 L196,62"/></circle>
      ${arrow(36, 104, 200, 104, c, 2)}${t(36, 120, "近い　弱い", { anchor: "start", size: 9.5, fill: DIM })}${t(200, 120, "遠い　強い", { anchor: "end", size: 9.5, fill: c })}
      ${t(120, 22, "弾を貫いて消しながら進む", { size: 10.5 })}`;
  },
  // 散弾：ばらまき。近いほど当たる
  spread(c) {
    const pel = [];
    for (let i = -3; i <= 3; i++) {
      const y = 62 + i * 11;
      pel.push(line(34, 62, 176, y, c, 1.3, { op: 0.5 }), dot(176, y, 3.2, c));
    }
    return `${you(22, 62)}${boss(200, 62, 15)}${pel.join("")}
      ${dot(176, 62, 3.2, "#fff")}
      ${t(120, 14, "扇形にばらまく　上下にも広がる", { size: 10.5 })}
      ${t(70, 112, "近い　ほとんど当たる", { size: 9.5, fill: c })}${t(180, 112, "遠い　外れが多い", { size: 9.5, fill: DIM })}
      ${line(36, 100, 106, 100, c, 3)}${line(154, 100, 206, 100, DIM, 1.5, { dash: "3 3" })}`;
  },
  // 光線：動けない。照準で向きを変える
  beam(c) {
    return `${you(22, 66)}${boss(206, 66)}
      <rect x="32" y="62" width="160" height="8" rx="4" fill="${c}" opacity=".35"/><rect x="32" y="64.5" width="160" height="3" rx="1.5" fill="#fff">
      <animate attributeName="opacity" values="1;.55;1" dur=".5s" repeatCount="indefinite"/></rect>
      ${dot(80, 66, 3, EN, 0.5)}${dot(120, 66, 3, EN, 0.5)}${t(80, 54, "×", { size: 11, fill: EN })}${t(120, 54, "×", { size: 11, fill: EN })}
      <path d="M170,40 Q198,24 214,38" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 2"/><polygon points="214,38 206,36 211,43" fill="${c}"/>
      <path d="M170,94 Q198,110 214,96" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 2"/><polygon points="214,96 206,98 211,91" fill="${c}"/>
      ${t(120, 18, "撃つ間は 動けない", { size: 10.5 })}${t(120, 118, "照準で 向きを自由に変える", { size: 10.5, fill: c })}`;
  },
  // 音波：バリア。弾を弾き返す
  wave(c) {
    return `${you(70, 66)}${boss(212, 66)}
      <circle cx="70" cy="66" r="34" fill="${c}" opacity=".08" stroke="${c}" stroke-width="1.6"><animate attributeName="r" values="32;37;32" dur="1.4s" repeatCount="indefinite"/></circle>
      ${dot(150, 44, 3, EN)}${dot(156, 66, 3, EN)}${dot(150, 88, 3, EN)}
      ${arrow(146, 44, 112, 58, EN, 1.2)}${arrow(152, 66, 114, 66, EN, 1.2)}${arrow(146, 88, 112, 74, EN, 1.2)}
      <path d="M100,50 Q150,10 196,56" fill="none" stroke="${c}" stroke-width="1.8"/><polygon points="196,56 188,50 187,59" fill="${c}"/>
      <path d="M102,84 Q150,122 198,76" fill="none" stroke="${c}" stroke-width="1.8"/><polygon points="198,76 190,76 191,84" fill="${c}"/>
      ${t(70, 18, "入った弾を消す", { size: 10, fill: INK })}${t(160, 120, "弾き返して ダメージに", { size: 10, fill: c })}`;
  },
  // 誘導弾：勇者を狙う弾を先に撃ち落とす
  homing(c) {
    return `${you(28, 66)}${boss(212, 66)}
      ${dot(96, 40, 3.2, EN)}${dot(104, 62, 3.2, EN)}${dot(98, 90, 3.2, EN)}
      ${arrow(98, 44, 60, 58, EN, 1)}${arrow(106, 64, 64, 66, EN, 1)}${arrow(100, 88, 62, 74, EN, 1)}
      <path d="M36,62 Q60,24 94,38" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M36,66 Q70,58 100,62" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M36,70 Q60,108 94,92" fill="none" stroke="${c}" stroke-width="1.6"/>
      <path d="M36,66 Q110,0 196,60" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 3"/>
      <circle r="3" fill="#fff"><animateMotion dur="1.5s" repeatCount="indefinite" path="M36,62 Q60,24 94,38"/></circle>
      <circle r="3" fill="#fff"><animateMotion dur="1.5s" begin=".3s" repeatCount="indefinite" path="M36,66 Q110,0 196,60"/></circle>
      ${t(100, 118, "勇者を狙う弾を 先に撃ち落とす", { size: 10, fill: INK })}${t(120, 16, "落としても ダメージは入る", { size: 10, fill: c })}`;
  },
  // 集束弾：もう一度押すと起爆
  cluster(c) {
    const fr = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fr.push(line(110, 54, 110 + Math.cos(a) * 24, 54 + Math.sin(a) * 24, c, 1.4, { op: 0.8, cap: true }), dot(110 + Math.cos(a) * 24, 54 + Math.sin(a) * 24, 2.2, c)); }
    return `${you(22, 54)}${boss(210, 54)}
      ${line(34, 54, 90, 54, DIM, 1, { dash: "3 3" })}
      ${fr.join("")}${dot(110, 54, 6, "#fff")}<circle cx="110" cy="54" r="12" fill="none" stroke="${c}"><animate attributeName="r" values="8;30;8" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0;.9" dur="1.6s" repeatCount="indefinite"/></circle>
      ${arrow(140, 54, 188, 54, c, 1.4)}
      ${dot(100, 36, 2.6, EN, 0.4)}${dot(122, 74, 2.6, EN, 0.4)}${dot(96, 74, 2.6, EN, 0.4)}
      ${key(80, 104, "もう一度押す")}${arrow(106, 104, 120, 84, c, 1.4)}
      ${t(120, 18, "その場で起爆　破片がボスを追う", { size: 10.5 })}${t(180, 118, "まわりの弾も消える", { size: 9.5, fill: c })}`;
  },
  // 爆裂弾：打ち上げて、真上から落とす
  blast(c) {
    return `${you(22, 108)}${boss(208, 82)}
      <path d="M32,104 Q108,-18 204,62" fill="none" stroke="${c}" stroke-width="1.8" stroke-dasharray="4 3"/>
      <circle r="6" fill="${c}" opacity=".5"><animateMotion dur="1.8s" repeatCount="indefinite" path="M32,104 Q108,-18 204,62"/></circle>
      <circle r="3" fill="#fff"><animateMotion dur="1.8s" repeatCount="indefinite" path="M32,104 Q108,-18 204,62"/></circle>
      <circle cx="208" cy="64" r="14" fill="none" stroke="${c}" stroke-width="1.4" opacity=".8"><animate attributeName="r" values="4;22;4" dur="1.8s" repeatCount="indefinite"/></circle>
      ${t(112, 16, "高く打ち上げて 真上から落とす", { size: 10.5 })}${t(120, 124, "大爆発で まわりの弾を消す　弱点が上のとき強い", { size: 9.5, fill: c })}`;
  },
  // 隕石：いつも上から
  meteor(c) {
    const st = [];
    for (let i = 0; i < 5; i++) {
      const x0 = 70 + i * 26, y0 = 6 + (i % 2) * 6;
      st.push(line(x0, y0, 196 + (i - 2) * 3, 74, c, 2, { op: 0.55, cap: true }), `<circle r="4" fill="#fff"><animateMotion dur="${1.1 + i * 0.12}s" begin="${i * 0.15}s" repeatCount="indefinite" path="M${x0},${y0} L${196 + (i - 2) * 3},74"/></circle>`);
    }
    return `${you(22, 100)}${boss(200, 92)}${st.join("")}
      ${t(70, 118, "いつも上から当たる", { size: 10.5, fill: c })}${t(150, 124, "高い所の弾も消す", { size: 9.5, fill: DIM })}`;
  },
};

// 種類ごとの絵。color は KINDS の色
export function illust(kind, size = 240) {
  const k = KINDS[kind];
  const body = (SCENES[kind] || SCENES.shot)(k.color);
  return `<svg class="illust" viewBox="0 0 ${W} ${H}" width="${size}" height="${Math.round((size * H) / W)}" role="img" aria-label="${k.name}の撃ち方">${body}</svg>`;
}

// そのほかの図
export function weakIllust() {
  const R = 20, cx = 120, cy = 66;
  return `<svg class="illust" viewBox="0 0 ${W} ${H}" width="240" height="132" role="img" aria-label="弱点">
    ${boss(cx, cy, R)}
    <ellipse cx="${cx}" cy="${cy - 20}" rx="22" ry="5" fill="none" stroke="#ffd84a" stroke-width="2.2"><animate attributeName="opacity" values="1;.35;1" dur=".9s" repeatCount="indefinite"/></ellipse>
    <ellipse cx="${cx}" cy="${cy}" rx="30" ry="6" fill="none" stroke="#6f7cc0" stroke-dasharray="3 3"/>
    <ellipse cx="${cx}" cy="${cy + 20}" rx="22" ry="5" fill="none" stroke="#6f7cc0" stroke-dasharray="3 3"/>
    ${arrow(40, 20, 108, 44, "#ffd84a", 2)}${you(30, 16)}
    ${t(180, 26, "弱点の向きから", { size: 10.5, fill: "#ffd84a" })}${t(180, 42, "当てると 1.8 倍", { size: 10.5, fill: "#ffd84a" })}
    ${t(120, 118, "上・正面・下 のどれかが 数秒おきに移る", { size: 10 })}
    ${t(214, 66, "上", { size: 9, fill: DIM })}
  </svg>`;
}

export function puzzleIllust() {
  const cell = 14, ox = 78, oy = 22;
  const sq = (x, y, c) => `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell - 1}" height="${cell - 1}" rx="2" fill="${c}" opacity=".9"/>`;
  const grid = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) grid.push(`<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell - 1}" height="${cell - 1}" rx="2" fill="none" stroke="#2b3470"/>`);
  return `<svg class="illust" viewBox="0 0 ${W} ${H}" width="240" height="132" role="img" aria-label="容量マップ">
    ${grid.join("")}
    ${[[0, 0], [1, 0], [1, 1], [2, 1]].map(([x, y]) => sq(x, y, "#4df2ff")).join("")}
    ${[[3, 0], [4, 0], [5, 0], [5, 1]].map(([x, y]) => sq(x, y, "#ff73b3")).join("")}
    ${[[0, 2], [0, 3], [1, 3], [1, 4], [0, 4]].map(([x, y]) => sq(x, y, "#ffd84a")).join("")}
    ${[[3, 2], [4, 2], [3, 3]].map(([x, y]) => sq(x, y, "#73ff8c")).join("")}
    ${sq(5, 4, "#bf80ff")}${sq(2, 4, "#ff9940")}
    ${t(40, 40, "重い", { size: 10, fill: DIM })}${t(40, 54, "大きな形", { size: 10, fill: DIM })}
    ${t(206, 100, "軽い", { size: 10, fill: DIM })}${t(206, 114, "小さな形", { size: 10, fill: DIM })}
    ${t(120, 12, "形を 回して はめこむ", { size: 10.5 })}${t(120, 126, "うまく詰めるほど たくさん持てる", { size: 10, fill: "#ffd84a" })}
  </svg>`;
}
