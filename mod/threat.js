// 危険の合図。画面に入っていない所から、勇者に当たりそうな弾（と、床の警告）を探す。画面にも本体にも触らない。
//   一人称だと、真上や真下、後ろから来る弾は 見えない。そこで「このまま進むと 当たる」弾の向きを、画面のふちのしるしと
//   「▲ 上から」「▼ 下から」で知らせる。
import { TAU, clamp } from "./math.js";

export const THREAT = {
  range: 22,        // これより遠い弾は 見ない
  within: 2.0,      // この秒数のうちに 近づく弾だけ
  margin: 1.6,      // 弾の半径に これを足した所まで近づくなら 危ない
  bins: 20,         // しるしは 20 方向にまとめる
  vert: 0.7,        // 画面の向きが 真上・真下から 45 度以内（sin が これより大きい）なら「上」「下」
  nearMark: 3.0,    // 床の警告が これより近い（警告の半径に足す）と 知らせる
};

const none = () => ({ markers: [], up: 0, down: 0, upText: "", downText: "", count: 0 });

// cam：{ eye, f, r, u }（scene.js の cameraOf）。fov はラジアン（縦）、aspect は 画面の 横 ÷ 縦
export function scanThreats(g, cam, fov, aspect) {
  const out = none();
  if (!g || g.mode === "over" || g.mode === "clear") return out;
  const p = g.p, B = g.bullets, { eye, f, r, u } = cam;
  const th = Math.tan(fov / 2), pvx = p.vx + p.kx, pvy = p.vy + p.ky, pvz = p.vz + p.kz;
  const best = new Float32Array(THREAT.bins);
  const bestVert = new Uint8Array(THREAT.bins);
  let up = 0, down = 0, upText = "", downText = "";
  const R2 = THREAT.range * THREAT.range;

  for (let i = 0; i < B.n; i++) {
    const rx = B.x[i] - p.x, ry = B.y[i] - p.y, rz = B.z[i] - p.z;
    if (rx * rx + ry * ry + rz * rz > R2) continue;
    const vx = B.vx[i] - pvx, vy = B.vy[i] - pvy, vz = B.vz[i] - pvz, v2 = vx * vx + vy * vy + vz * vz;
    if (v2 < 0.25) continue;
    const t = -(rx * vx + ry * vy + rz * vz) / v2;           // いちばん近づくまでの秒数
    if (t <= 0 || t > THREAT.within) continue;
    const cx = rx + vx * t, cy = ry + vy * t, cz = rz + vz * t;
    const reach = B.r[i] + THREAT.margin;
    if (cx * cx + cy * cy + cz * cz > reach * reach) continue;
    // 画面のどこにいるか（目から見た向き）
    const dx = B.x[i] - eye[0], dy = B.y[i] - eye[1], dz = B.z[i] - eye[2];
    const fwd = dx * f.x + dy * f.y + dz * f.z, lx = dx * r.x + dy * r.y + dz * r.z, ly = dx * u.x + dy * u.y + dz * u.z;
    if (fwd > 0.3 && Math.abs(lx / fwd) < th * aspect * 0.96 && Math.abs(ly / fwd) < th * 0.96) continue;     // 見えている
    out.count++;
    const urg = clamp(1 - t / THREAT.within, 0.05, 1);
    // 真うしろ（上下左右に ずれていない）は、向きが決まらない。画面の下の中央を指す しるしにして、「上」「下」には数えない
    const behind = fwd < 0 && Math.hypot(lx, ly) < -0.3 * fwd;
    const ang = behind ? -Math.PI / 2 : Math.atan2(ly, lx);
    const vert = !behind && Math.abs(Math.sin(ang)) > THREAT.vert;
    const bin = ((Math.round(ang / (TAU / THREAT.bins)) % THREAT.bins) + THREAT.bins) % THREAT.bins;
    if (urg > best[bin]) { best[bin] = urg; bestVert[bin] = vert ? 1 : 0; }
    if (vert) {
      if (ly > 0) { if (urg > up) { up = urg; upText = "上から"; } }
      else if (urg > down) { down = urg; downText = "下から"; }
    }
  }

  // 床の警告：雨の落ちる印（真上から）、柱の警告（足もとから）
  for (const m of g.marks) {
    if (m.life <= 0 || Math.hypot(m.x - p.x, m.z - p.z) > m.r + THREAT.nearMark) continue;
    const urg = clamp(1 - m.life / (m.max || 1), 0.35, 1);
    if (urg > up) { up = urg; upText = "真上から落ちてくる"; }
  }
  for (const P of g.pillars) {
    if (P.warn <= 0 || Math.hypot(P.x - p.x, P.z - p.z) > P.r + THREAT.nearMark) continue;
    const urg = clamp(1 - P.warn / 1.1, 0.4, 1);
    if (urg > down) { down = urg; downText = "足もとから柱が立つ"; }
  }

  for (let b = 0; b < THREAT.bins; b++) if (best[b] > 0) out.markers.push({ ang: (b * TAU) / THREAT.bins, urgency: best[b], vert: !!bestVert[b] });
  out.up = up; out.down = down; out.upText = upText; out.downText = downText;
  return out;
}
