// ワイヤーフレームの形（ボスの体）。半径 1 に収めた頂点と、辺の組。辺は「いちばん短い距離の頂点どうし」を結んで作る
const PHI = (1 + Math.sqrt(5)) / 2;

function norm(vs) {
  let m = 0;
  for (const v of vs) m = Math.max(m, Math.hypot(v[0], v[1], v[2]));
  return vs.map((v) => [v[0] / m, v[1] / m, v[2] / m]);
}

function byMinDist(vs) {
  let min = Infinity;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) min = Math.min(min, Math.hypot(vs[i][0] - vs[j][0], vs[i][1] - vs[j][1], vs[i][2] - vs[j][2]));
  const edges = [];
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      if (Math.abs(Math.hypot(vs[i][0] - vs[j][0], vs[i][1] - vs[j][1], vs[i][2] - vs[j][2]) - min) < min * 0.02) edges.push([i, j]);
    }
  }
  return edges;
}

function solid(vs) {
  const v = norm(vs);
  return { v, e: byMinDist(v) };
}

function knot() {
  const n = 96, v = [], e = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, r = 2 + Math.cos(3 * t);
    v.push([r * Math.cos(2 * t), r * Math.sin(2 * t), -Math.sin(3 * t)]);
    e.push([i, (i + 1) % n]);
  }
  return { v: norm(v), e };
}

const signs = [-1, 1];
const cube = [];
for (const x of signs) for (const y of signs) for (const z of signs) cube.push([x, y, z]);
const dodeca = [...cube];
for (const a of signs) for (const b of signs) {
  dodeca.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
}
const icosa = [];
for (const a of signs) for (const b of signs) icosa.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);

export const SHAPES = {
  octa: solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]),
  cube: solid(cube),
  icosa: solid(icosa),
  dodeca: solid(dodeca),
  tetra: solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]),
  knot: knot(),
};
