// 小さな計算の道具。画面にも本体にも触らない。
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// 2つの角度のあいだの、短いほうの差（-π〜π）
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

// 種から決まる乱数（mulberry32）。同じ種なら同じ並び
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列から数を決める（FNV-1a）
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// [[大きさ, 値], …] を、大きさの対数でなめらかにつなぐ。両端の外は端の値
export function logCurve(points) {
  const xs = points.map((p) => Math.log(p[0]));
  return (bytes) => {
    const x = Math.log(Math.max(bytes, 1));
    if (x <= xs[0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= xs[i]) return lerp(points[i - 1][1], points[i][1], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
    }
    return points[points.length - 1][1];
  };
}

export const fmtSize = (n) => {
  if (!(n >= 0)) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${i === 0 ? n : n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
};
