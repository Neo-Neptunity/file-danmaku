// 画面の上に重ねる表示。2D の canvas に毎コマ描く。
// 一人称なので、まんなかが照準。体力・時間・弱点・高度計・レーダー・弾の種類の一覧・役・ダメージの数字・見出し。
import { KINDS, KIND_ORDER, fmtSize } from "./ammo.js";
import { Y_MIN, Y_MAX, CEIL_Y, GAUGE_MAX, ARENA_R, WEAK_NAMES } from "./consts.js";
import { weakBand, basisOf, kindList, kindCount, currentAmmo } from "./sim.js";
import { clamp } from "./math.js";

const FONT = '"Segoe UI","Yu Gothic UI","Meiryo",sans-serif';
const rgbCss = (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const comma = (n) => Math.round(n).toLocaleString("en-US");
const GOLD = "#ffd84a";
const SIDE_MARK = { high: "▲", mid: "●", low: "▼" };

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function createHud(canvas) {
  const c = canvas.getContext("2d");
  let W = 1, H = 1, dpr = 1;

  const text = (s, x, y, size, color, align = "left", weight = 600, shadow = true) => {
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = "middle";
    if (shadow) { c.fillStyle = "rgba(0,0,0,.65)"; c.fillText(s, x + 1.5, y + 1.5); }
    c.fillStyle = color;
    c.fillText(s, x, y);
  };
  const fit = (s, maxW, size, weight = 600) => {
    c.font = `${weight} ${size}px ${FONT}`;
    if (c.measureText(s).width <= maxW) return s;
    while (s.length > 1 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  // 高度計：床から天井までの高さ。ボスの体・弱点の高さ・いまの勇者
  function altimeter(g, ui, u) {
    const b = g.boss, p = g.p;
    const h = clamp(H * 0.34, 140, 260 * u), x = 24 * u, top = H * 0.5 - h / 2 + 30 * u, bw = 12 * u;
    const yOf = (alt) => top + h - ((clamp(alt, 0, GAUGE_MAX) / GAUGE_MAX) * h);
    text("高さ", x + bw / 2, top - 12 * u, 11 * u, "#9fb3ff", "center", 700);
    rrect(c, x, top, bw, h, 5 * u);
    c.fillStyle = "rgba(8,10,30,.7)"; c.fill();
    c.strokeStyle = "rgba(159,179,255,.5)"; c.lineWidth = 1; c.stroke();
    c.fillStyle = "rgba(125,243,255,.08)";
    c.fillRect(x + 1, yOf(Y_MAX), bw - 2, yOf(Y_MIN) - yOf(Y_MAX));
    // 弱点の高さ
    if (b.phase && b.phase.weak && b.state === "attack") {
      const band = weakBand(g);
      const area = (side) => (side === "high" ? [yOf(GAUGE_MAX), yOf(band.up)] : side === "low" ? [yOf(band.down), yOf(0)] : [yOf(band.up), yOf(band.down)]);
      if (b.weak) {
        const [y1, y2] = area(b.weak);
        c.fillStyle = `rgba(255,216,74,${0.4 + 0.2 * Math.sin(ui.t * 8)})`;
        c.fillRect(x + 1, y1, bw - 2, Math.max(2, y2 - y1));
      }
      if (b.weakNext && Math.sin(ui.t * 22) > 0) {
        const [y1, y2] = area(b.weakNext);
        c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2;
        c.strokeRect(x + 2, y1 + 1, bw - 4, Math.max(2, y2 - y1 - 2));
      }
    }
    for (const [alt, label] of [[CEIL_Y, "天"], [12, "中"], [0, "床"]]) {
      const yy = yOf(alt);
      c.strokeStyle = "rgba(159,179,255,.55)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, yy); c.lineTo(x + bw + 3, yy); c.stroke();
      text(label, x + bw + 10 * u, yy, 10 * u, "rgba(159,179,255,.7)", "left", 600, false);
    }
    const bc = g.bossDef.color;
    c.fillStyle = rgbCss(bc, 0.9);
    c.beginPath(); c.moveTo(x - 9 * u, yOf(b.y)); c.lineTo(x - 3 * u, yOf(b.y) - 5 * u); c.lineTo(x - 3 * u, yOf(b.y) + 5 * u); c.closePath(); c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath(); c.moveTo(x + bw + 3 * u, yOf(p.y)); c.lineTo(x + bw + 11 * u, yOf(p.y) - 5 * u); c.lineTo(x + bw + 11 * u, yOf(p.y) + 5 * u); c.closePath(); c.fill();
    c.fillRect(x, yOf(p.y) - 1, bw, 2);
  }

  // レーダー：真上から見た図。上が、いま向いている方向。ボス・近い弾・柱
  function radar(g, u) {
    const R = clamp(Math.min(W, H) * 0.11, 58, 96 * u), cx = W - R - 20 * u, cy = H - R - 20 * u - 8 * u;
    const rng = ARENA_R * 1.1, k = R / rng, p = g.p, b = g.boss;
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.closePath();
    c.fillStyle = "rgba(6,8,26,.62)"; c.fill();
    c.strokeStyle = "rgba(159,179,255,.5)"; c.lineWidth = 1.2; c.stroke();
    c.clip();
    // 向きに合わせて回す：前（f）が 画面の上
    const f = basisOf(p.yaw, 0), fx = f.f.x, fz = f.f.z, rx = f.r.x, rz = f.r.z;
    const to = (x, z) => { const dx = x - p.x, dz = z - p.z; return [cx + (dx * rx + dz * rz) * k, cy - (dx * fx + dz * fz) * k]; };
    // 場のふち
    const [ox, oz] = to(0, 0);
    c.strokeStyle = "rgba(125,243,255,.35)"; c.beginPath(); c.arc(ox, oz, ARENA_R * k, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(159,179,255,.18)"; c.beginPath(); c.arc(cx, cy, R * 0.5, 0, Math.PI * 2); c.stroke();
    // 弾（近く・高さが近いものを 濃く）
    const B = g.bullets;
    c.fillStyle = "rgba(255,107,138,.8)";
    for (let i = 0; i < B.n; i += 2) {
      const [sx, sy] = to(B.x[i], B.z[i]);
      if ((sx - cx) ** 2 + (sy - cy) ** 2 > R * R) continue;
      const dy = Math.abs(B.y[i] - p.y);
      c.globalAlpha = dy < 3 ? 0.9 : dy < 7 ? 0.45 : 0.2;
      c.fillRect(sx - 1, sy - 1, 2, 2);
    }
    c.globalAlpha = 1;
    // 雨の落ちる印（輪）と、柱の警告（四角）
    c.lineWidth = 1.4;
    for (const mk of g.marks) {
      if (mk.life <= 0) continue;
      const [mx, mz] = to(mk.x, mk.z);
      c.strokeStyle = "rgba(255,170,60,.95)"; c.beginPath(); c.arc(mx, mz, Math.max(2.5, mk.r * k), 0, Math.PI * 2); c.stroke();
    }
    for (const P of g.pillars) {
      if (P.warn <= 0) continue;
      const [px, pz] = to(P.x, P.z), q = Math.max(2.5, P.r * k);
      c.strokeStyle = "rgba(255,90,110,.95)"; c.strokeRect(px - q, pz - q, q * 2, q * 2);
    }
    // ボス
    const [bx, bz] = to(b.x, b.z), bc = g.bossDef.color;
    c.fillStyle = rgbCss(bc, 0.95);
    c.beginPath(); c.arc(bx, bz, 5 * u, 0, Math.PI * 2); c.fill();
    c.restore();
    // 勇者（まんなか）
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(cx, cy - 6 * u); c.lineTo(cx + 4.5 * u, cy + 4 * u); c.lineTo(cx - 4.5 * u, cy + 4 * u); c.closePath(); c.fill();
    // ボスが円の外なら、ふち（のかわり）に印
    const dxb = b.x - p.x, dzb = b.z - p.z, ex = (dxb * rx + dzb * rz) * k, ez = -(dxb * fx + dzb * fz) * k, el = Math.hypot(ex, ez);
    if (el > R - 6) {
      c.fillStyle = rgbCss(bc, 0.95);
      c.beginPath(); c.arc(cx + (ex / el) * (R - 5), cy + (ez / el) * (R - 5), 4 * u, 0, Math.PI * 2); c.fill();
    }
    text("レーダー", cx, cy - R - 9 * u, 10 * u, "rgba(159,179,255,.7)", "center", 600, false);
    heightGauge(g, u, cx - R - 22 * u, cy, R);
  }

  // 高さの目盛り：勇者から 上に 10m・下に 10m。近くの弾が 上にあるか 下にあるか。近づいてくる弾は 赤
  function heightGauge(g, u, gx, cy, R) {
    const p = g.p, B = g.bullets, w = 12 * u, top = cy - R, SPAN = 10;
    rrect(c, gx - w / 2, top, w, R * 2, 5 * u);
    c.fillStyle = "rgba(6,8,26,.62)"; c.fill();
    c.strokeStyle = "rgba(159,179,255,.5)"; c.lineWidth = 1.2; c.stroke();
    c.strokeStyle = "rgba(159,179,255,.35)"; c.beginPath(); c.moveTo(gx - w / 2 - 3, cy); c.lineTo(gx + w / 2 + 3, cy); c.stroke();
    for (let i = 0; i < B.n; i++) {
      const rx = B.x[i] - p.x, rz = B.z[i] - p.z, dy = B.y[i] - p.y;
      if (Math.abs(dy) > SPAN || rx * rx + rz * rz > 144) continue;
      const closing = rx * (B.vx[i] - p.vx) + dy * (B.vy[i] - p.vy) + rz * (B.vz[i] - p.vz) < 0;
      c.fillStyle = closing ? "rgba(255,90,110,.95)" : "rgba(159,179,255,.4)";
      c.fillRect(gx - w / 2 + 1 + ((i * 7) % 9) * ((w - 4) / 9), cy - (dy / SPAN) * R - 1, 2, closing ? 3 : 2);
    }
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(gx + w / 2 + 2, cy); c.lineTo(gx + w / 2 + 9 * u, cy - 4 * u); c.lineTo(gx + w / 2 + 9 * u, cy + 4 * u); c.closePath(); c.fill();
    text("上", gx, top - 7 * u, 10 * u, "rgba(159,179,255,.8)", "center", 700, false);
    text("下", gx, top + R * 2 + 8 * u, 10 * u, "rgba(159,179,255,.8)", "center", 700, false);
  }

  // ボスが画面の外にいるとき、その向きを 縁の矢印で
  function bossArrow(g, ui, u) {
    const b = g.boss;
    const s = ui.projectEdge(b.x, b.y, b.z);
    if (!s) return;
    if (s.on) return;
    const col = g.bossDef.color, m = 52 * u;
    const ax = clamp(s.x, m, W - m), ay = clamp(s.y, m + 40 * u, H - m - 90 * u);
    c.save();
    c.translate(ax, ay);
    c.rotate(Math.atan2(s.y - H / 2, s.x - W / 2));
    c.fillStyle = rgbCss(col, 0.9);
    c.beginPath(); c.moveTo(16 * u, 0); c.lineTo(-10 * u, 11 * u); c.lineTo(-4 * u, 0); c.lineTo(-10 * u, -11 * u); c.closePath(); c.fill();
    c.restore();
    text(`${Math.round(Math.hypot(b.x - g.p.x, b.y - g.p.y, b.z - g.p.z))}m`, ax, ay + 22 * u, 11 * u, rgbCss(col), "center", 700);
  }

  // 危険の合図：画面に入っていない所から 当たりそうな弾。ふちの三角と、上・下の大きな文字
  function threats(g, ui, u) {
    const T = ui.threat;
    if (!T || !ui.warn) return;
    // しるしを置く長方形。上は ボスの体力の下、下は 弾の種類の上まで
    const cx = W / 2, cy = H / 2, m = 38 * u, mTop = 104 * u, mBot = 112 * u;
    for (const k of T.markers) {
      const dx = Math.cos(k.ang), dy = -Math.sin(k.ang);
      const kx = Math.abs(dx) > 1e-3 ? (cx - m) / Math.abs(dx) : 1e9, ky = Math.abs(dy) > 1e-3 ? (dy < 0 ? cy - mTop : H - mBot - cy) / Math.abs(dy) : 1e9, kk = Math.min(kx, ky);
      const px = cx + dx * kk, py = cy + dy * kk, size = (9 + 12 * k.urgency) * u, pulse = k.urgency > 0.6 ? 0.7 + 0.3 * Math.sin(ui.t * 24) : 1;
      c.save();
      c.translate(px, py);
      c.rotate(Math.atan2(dy, dx));
      c.fillStyle = `rgba(255,${(210 - 160 * k.urgency) | 0},60,${(0.5 + 0.45 * k.urgency) * pulse})`;
      c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(size, 0); c.lineTo(-size * 0.7, size * 0.8); c.lineTo(-size * 0.25, 0); c.lineTo(-size * 0.7, -size * 0.8); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    const banner = (urg, mark, label, y) => {
      if (urg < 0.12) return;
      const pulse = urg > 0.5 ? 0.75 + 0.25 * Math.sin(ui.t * 22) : 0.85, w = 330 * u, h = 36 * u;
      c.globalAlpha = clamp(0.72 + urg * 0.28, 0, 1) * pulse;
      rrect(c, cx - w / 2, y - h / 2, w, h, 10 * u);
      c.fillStyle = `rgba(${(150 + 100 * urg) | 0},30,40,.78)`; c.fill();
      c.strokeStyle = "rgba(255,200,120,.9)"; c.lineWidth = 2; c.stroke();
      text(`${mark} ${label}`, cx, y + 1, 21 * u, "#ffffff", "center", 800);
      c.globalAlpha = 1;
    };
    banner(T.up, "▲", T.upText || "上から", H * 0.27);
    banner(T.down, "▼", T.downText || "下から", H - 150 * u);
  }

  // 照準
  function reticle(g, ui, u) {
    const cx = W / 2, cy = H / 2, cur = currentAmmo(g), col = cur ? KINDS[cur.kind].rgb : [0.8, 0.95, 1];
    const ch = g.p.ch, k = ch ? ch.t / ch.need : 0;
    c.save();
    c.lineWidth = 1.8;
    c.strokeStyle = rgbCss(col, 0.95);
    const gap = 5 * u, len = 9 * u;
    // 十字
    c.beginPath();
    c.moveTo(cx - gap - len, cy); c.lineTo(cx - gap, cy);
    c.moveTo(cx + gap, cy); c.lineTo(cx + gap + len, cy);
    c.moveTo(cx, cy - gap - len); c.lineTo(cx, cy - gap);
    c.moveTo(cx, cy + gap); c.lineTo(cx, cy + gap + len);
    c.stroke();
    c.fillStyle = "rgba(255,255,255,.95)"; c.fillRect(cx - 1, cy - 1, 2, 2);
    // 溜め：まわりの輪
    if (ch) {
      c.lineWidth = 3.2;
      c.strokeStyle = ch.ready ? (Math.floor(ui.t * 14) % 2 ? "#ffffff" : rgbCss(col)) : rgbCss(col, 0.9);
      c.beginPath(); c.arc(cx, cy, 24 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
    }
    c.restore();
    // ロックオン：ボスに枠。補助の角度に入っているあいだ
    if (g.locked) {
      const s = ui.project(g.boss.x, g.boss.y, g.boss.z);
      if (s) {
        const rr = clamp(ui.bossPx || 40 * u, 26 * u, 120 * u), bc = g.bossDef.color, pul = 0.75 + 0.25 * Math.sin(ui.t * 10);
        c.strokeStyle = rgbCss([1, 0.4, 0.45], pul); c.lineWidth = 2.2;
        const a = rr * 0.5;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          c.beginPath(); c.moveTo(s.x + sx * rr, s.y + sy * (rr - a)); c.lineTo(s.x + sx * rr, s.y + sy * rr); c.lineTo(s.x + sx * (rr - a), s.y + sy * rr); c.stroke();
        }
        text(`${Math.round(Math.hypot(g.boss.x - g.p.x, g.boss.y - g.p.y, g.boss.z - g.p.z))}m`, s.x, s.y + rr + 14 * u, 12 * u, rgbCss(bc), "center", 700);
        // 照準と枠のあいだを細くつなぐ
        c.strokeStyle = "rgba(255,110,120,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(cx, cy); c.lineTo(s.x, s.y); c.stroke();
      }
    }
  }

  // 弾の種類の一覧（下）。8 種類の山。選んでいる種類は 持ち上がって、いま撃つファイルを見せる
  function kinds(g, ui, u) {
    const gap = 5 * u, cw = clamp((W - 40 - gap * 7) / 8, 70, 118 * u), ch = 60 * u;
    const total = cw * 8 + gap * 7, x0 = (W - total) / 2 - 40 * u * 0, y0 = H - ch - 14 * u;
    const k0 = ui.keyLabel || (() => "");
    KIND_ORDER.forEach((kind, i) => {
      const n = kindCount(g, kind), sel = g.kindSel === kind, K = KINDS[kind], kc = rgbCss(K.rgb);
      const x = x0 + i * (cw + gap), y = y0 - (sel ? 12 * u : 0);
      rrect(c, x, y, cw, ch, 8 * u);
      c.fillStyle = n ? "rgba(8,10,30,.84)" : "rgba(8,10,30,.4)"; c.fill();
      if (!n) {
        c.setLineDash([4, 4]); c.strokeStyle = "rgba(159,179,255,.22)"; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
        text(k0(i), x + 8 * u, y + 11 * u, 11 * u, "rgba(159,179,255,.35)", "left", 600, false);
        text(K.name, x + cw / 2, y + ch / 2 + 2 * u, 12 * u, "rgba(159,179,255,.3)", "center", 600, false);
        return;
      }
      c.strokeStyle = sel ? kc : "rgba(159,179,255,.35)"; c.lineWidth = sel ? 2.5 : 1; c.stroke();
      c.fillStyle = rgbCss(K.rgb, sel ? 0.28 : 0.14);
      rrect(c, x, y, cw, 19 * u, 8 * u); c.fill();
      text(k0(i), x + 7 * u, y + 10.5 * u, 11 * u, "#fff", "left", 700, false);
      text(K.name, x + 24 * u, y + 10.5 * u, 12 * u, kc, "left", 700, false);
      text(`×${n}`, x + cw - 6 * u, y + 10.5 * u, 12 * u, "#ffe28a", "right", 800, false);
      const list = kindList(g, kind), idx = clamp(g.fileIdx[kind] || 0, 0, list.length - 1), a = list[idx];
      text(fit(a.name, cw - 10 * u, 11.5 * u), x + 6 * u, y + 31 * u, 11.5 * u, "#e8eaf6", "left", 600, false);
      text(fmtSize(a.bytes), x + 6 * u, y + 48 * u, 11.5 * u, "#9fb3ff", "left", 600, false);
      text(comma(a.dmg), x + cw - 6 * u, y + 48 * u, 11.5 * u, "#ffe28a", "right", 700, false);
      if (list.length > 1 && sel) text(`${idx + 1}/${list.length}`, x + cw - 6 * u, y + 31 * u, 10 * u, "#9fb3ff", "right", 600, false);
      const ch2 = g.p.ch;
      if (sel && ch2) {
        const kk = ch2.t / ch2.need;
        c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(x + 4, y + ch - 7 * u, cw - 8, 5 * u);
        c.fillStyle = ch2.ready ? (Math.floor(ui.t * 12) % 2 ? "#ffffff" : kc) : kc;
        c.fillRect(x + 4, y + ch - 7 * u, (cw - 8) * kk, 5 * u);
        if (ch2.ready) text("放せ！", x + cw / 2, y - 12 * u, 17 * u, "#ffffff", "center", 800);
      }
    });
    return y0;
  }

  return {
    resize(w, h, ratio) {
      W = w; H = h; dpr = ratio;
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
    },

    clear() {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
    },

    // ui：{ t, popups, banner, spell, cutin, comboCard, flash, hurt, hint, hints（操作の説明の行）, look（'first' か 'third'）, project, projectEdge, bossPx, keyLabel }
    draw(g, ui) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const u = clamp(Math.min(W / 1100, H / 650), 0.7, 1.4);
      const bd = g.bossDef, b = g.boss, col = bd ? bd.color : [0.5, 0.8, 1];

      if (ui.flash > 0.01) { c.fillStyle = `rgba(255,255,255,${ui.flash})`; c.fillRect(0, 0, W, H); }
      if (ui.hurt > 0.01) {
        const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        gr.addColorStop(0, "rgba(255,40,60,0)");
        gr.addColorStop(1, `rgba(255,40,60,${ui.hurt * 0.6})`);
        c.fillStyle = gr; c.fillRect(0, 0, W, H);
      }

      // ---- ボスの体力 ----
      if (b && b.phase && b.state !== "dead") {
        const bw = Math.min(W - 40, 760 * u), x = (W - bw) / 2, y = 38 * u;
        const ratio = clamp(b.hp / b.hpMax, 0, 1);
        const nm = fit(bd.name, bw * 0.4, 15 * u, 700);
        text(nm, x, y - 14 * u, 15 * u, rgbCss(col), "left", 700);
        // フォルダのボスの 苦手と得意（その種類の砲の ダメージの倍率）
        if (bd.kindMul) {
          let kx = x + c.measureText(nm).width + 16 * u;
          for (const [k, v] of Object.entries(bd.kindMul).sort((a, b) => b[1] - a[1])) {
            const s2 = `${v > 1 ? "苦手" : "得意"} ${KINDS[k].name} ×${v}`;
            text(s2, kx, y - 14 * u, 12 * u, v > 1 ? "#ffd84a" : "#9fb3ff", "left", 700);
            kx += c.measureText(s2).width + 14 * u;
          }
        }
        const left = Math.max(0, Math.ceil(b.left));
        text(String(left), x + bw, y - 14 * u, 20 * u, left <= 10 ? "#ff6b6b" : "#e8eaf6", "right", 700);
        rrect(c, x, y, bw, 12 * u, 6 * u);
        c.fillStyle = "rgba(10,10,30,.8)"; c.fill();
        c.strokeStyle = rgbCss(col, 0.7); c.lineWidth = 1.5; c.stroke();
        if (ratio > 0) {
          rrect(c, x + 1.5, y + 1.5, Math.max(8, (bw - 3) * ratio), 12 * u - 3, 4 * u);
          const gr = c.createLinearGradient(x, 0, x + bw, 0);
          gr.addColorStop(0, rgbCss(col, 0.95)); gr.addColorStop(1, rgbCss([1, 1, 1], 0.95));
          c.fillStyle = gr; c.fill();
        }
        const n = bd.phases.length;
        for (let i = 0; i < n; i++) {
          c.beginPath();
          c.arc(x + 8 * u + i * 16 * u, y + 26 * u, 4.5 * u, 0, Math.PI * 2);
          c.fillStyle = i < g.phaseIdx ? "rgba(255,255,255,.2)" : i === g.phaseIdx ? rgbCss(col) : "rgba(255,255,255,.75)";
          c.fill();
        }
        text(fit(b.phase.name, bw - n * 16 * u - 20, 14 * u), x + bw, y + 26 * u, 14 * u, "#cfd8ff", "right", 600);
        if (b.phase.weak && b.state === "attack") {
          const cx = W / 2, yy = y + 52 * u;
          if (b.weakNext) {
            const on = Math.sin(ui.t * 22) > 0;
            text(`弱点が移る　${SIDE_MARK[b.weakNext]} ${WEAK_NAMES[b.weakNext]}`, cx, yy, 15 * u, on ? "#ffffff" : "#8f98c8", "center", 800);
          } else if (b.weak) {
            text(`弱点　${SIDE_MARK[b.weak]} ${WEAK_NAMES[b.weak]}`, cx, yy, 15 * u, GOLD, "center", 800);
          }
        }
      }

      // ---- 左上：スコアと役 ----
      text(bd && bd.hudLabel ? bd.hudLabel : `第${g.stage}面`, 18, 24 * u, 15 * u, "#9fb3ff", "left", 700);
      text(comma(g.score), 18, 48 * u, 24 * u, "#ffffff", "left", 700);
      text(`かすり ${comma(g.graze)}`, 18, 72 * u, 13 * u, "#ffe28a", "left", 600);
      if (g.combos.length) {
        text(`役 ${g.combos.length}`, 18, 96 * u, 12 * u, "#9fb3ff", "left", 700);
        g.combos.slice(0, 3).forEach((cb, i) => text(fit(cb.name, 190 * u, 12 * u), 18, (114 + i * 17) * u, 12 * u, GOLD, "left", 600));
        if (g.combos.length > 3) text(`ほか ${g.combos.length - 3}`, 18, (114 + 3 * 17) * u, 11 * u, "#9fb3ff", "left", 600);
      }

      // ---- 右上：ライフ ----
      const lives = g.p.hp, hpMax = g.p.hpMax;
      for (let i = 0; i < hpMax; i++) {
        c.fillStyle = i < lives ? "#ff6b8a" : "rgba(255,255,255,.2)";
        c.font = `700 ${22 * u}px ${FONT}`; c.textAlign = "right"; c.textBaseline = "middle";
        c.fillText("♥", W - 18 - (hpMax - 1 - i) * 24 * u, 26 * u);
      }
      let ry = 52;
      if (g.shield > 0) { text(`バリア ${g.shield}`, W - 18, ry * u, 13 * u, "#7df3ff", "right", 700); ry += 20; }
      text(`${g.diff.name}${g.practice ? " 練習" : ""}`, W - 18, ry * u, 13 * u, "#9fb3ff", "right", 600); ry += 20;
      if (g.p.dashCd > 0) text(`ダッシュ ${g.p.dashCd.toFixed(1)}`, W - 18, ry * u, 12 * u, "#6f7aa8", "right", 600);

      if (b && b.state !== "dead") {
        altimeter(g, ui, u);
        if (g.mode === "fight" || g.mode === "intro") radar(g, u);
        bossArrow(g, ui, u);
      }
      if (g.mode !== "over") reticle(g, ui, u);

      // ---- 弾の種類の一覧 ----
      const y0 = kinds(g, ui, u);

      // ---- 砲の最中の ひとこと ----
      const hintY = y0 - 42 * u;
      const bomb = g.shots.find((s) => s.k === "bomb" && s.manual && !s.dead);
      const beam = g.shots.find((s) => s.k === "beam");
      const dome = g.shots.find((s) => s.k === "dome");
      if (bomb) text(`もう一度 ${ui.keyOf("charge")} で 起爆`, W / 2, hintY, 17 * u, "#ffd84a", "center", 800);
      else if (beam) text("照準を動かして 光線を振る", W / 2, hintY, 16 * u, "#7df3ff", "center", 800);
      else if (dome) text(`バリア ${Math.max(0, dome.life).toFixed(1)}　弾き返した ${g.stats.reflected}`, W / 2, hintY, 16 * u, "#73ff8c", "center", 800);

      // ---- ダメージの数字 ----
      for (const p of ui.popups) {
        const s = ui.project(p.x, p.y, p.z);
        if (!s) continue;
        const k = p.t / p.dur, size = (p.big ? 22 + Math.log10(p.dmg + 1) * 9 : 13 + Math.log10(p.dmg + 1) * 2) * (p.weak ? 1.25 : 1) * u;
        c.globalAlpha = 1 - k * k;
        text(`${p.weak ? "★" : ""}${comma(p.dmg)}`, s.x + p.dx, s.y - 30 * u - k * 56 * u, size, p.weak ? GOLD : p.big ? rgbCss(p.rgb || [1, 0.9, 0.4]) : "#ffffff", "center", 800);
        c.globalAlpha = 1;
      }

      // ---- 見出し ----
      const bn = ui.banner;
      if (bn) {
        const k = bn.t / bn.dur, a = k < 0.1 ? k / 0.1 : k > 0.75 ? (1 - k) / 0.25 : 1;
        c.globalAlpha = clamp(a, 0, 1);
        const y = H * 0.3;
        c.fillStyle = "rgba(4,6,20,.55)"; c.fillRect(0, y - 46 * u, W, 100 * u);
        c.fillStyle = rgbCss(bn.color || [0.5, 0.8, 1], 0.9); c.fillRect(0, y - 46 * u, W, 2); c.fillRect(0, y + 54 * u, W, 2);
        text(bn.title, W / 2, y - 12 * u, 38 * u, "#ffffff", "center", 800);
        if (bn.sub) text(bn.sub, W / 2, y + 28 * u, 19 * u, rgbCss(bn.color || [0.5, 0.8, 1]), "center", 700);
        c.globalAlpha = 1;
      }
      const sp = ui.spell;
      if (sp) {
        const k = sp.t / sp.dur, a = k < 0.12 ? k / 0.12 : k > 0.7 ? (1 - k) / 0.3 : 1;
        c.globalAlpha = clamp(a, 0, 1);
        text(sp.text, W / 2, H * 0.2 + (1 - clamp(k * 4, 0, 1)) * 20, 26 * u, "#ffffff", "center", 800);
        c.globalAlpha = 1;
      }

      // ---- 面のはじめの 役の表 ----
      const cc = ui.comboCard;
      if (cc) {
        const k = cc.t / cc.dur, a = k < 0.08 ? k / 0.08 : k > 0.8 ? (1 - k) / 0.2 : 1;
        c.globalAlpha = clamp(a, 0, 1);
        const rows = cc.list.length ? cc.list.slice(0, 6) : [{ name: "役なし", text: "同じ種類をそろえたり、大きさの段をそろえると、役がつく" }];
        const more = cc.list.length > 6 ? cc.list.length - 6 : 0;
        const pw = Math.min(W - 40, 520 * u), rh = 36 * u, ph = 44 * u + rows.length * rh + (more ? 22 * u : 0) + (cc.missed ? 22 * u : 0), px = 18, py = Math.max(60 * u, H * 0.5 - ph / 2 - 10 * u);
        rrect(c, px, py, pw, ph, 10 * u);
        c.fillStyle = "rgba(6,8,26,.82)"; c.fill();
        c.strokeStyle = "rgba(255,216,74,.6)"; c.lineWidth = 1.5; c.stroke();
        text(cc.list.length ? "役が成立している" : "役", px + 16 * u, py + 22 * u, 15 * u, GOLD, "left", 800);
        rows.forEach((r, i) => {
          const yy = py + 44 * u + i * rh;
          text(r.name, px + 16 * u, yy + 6 * u, 14 * u, "#ffffff", "left", 800);
          text(fit(r.text, pw - 32 * u, 12 * u), px + 16 * u, yy + 23 * u, 12 * u, "#cfd8ff", "left", 600);
        });
        let yy = py + 44 * u + rows.length * rh + 8 * u;
        if (more) { text(`ほか ${more}`, px + 16 * u, yy, 12 * u, "#9fb3ff", "left", 700); yy += 22 * u; }
        if (cc.missed) text(`解放していない役が ${cc.missed} つ、つくはずでした`, px + 16 * u, yy, 12 * u, "#ff9f7a", "left", 700);
        c.globalAlpha = 1;
      }

      // ---- 砲のカットイン ----
      const ci = ui.cutin;
      if (ci) {
        const k = ci.t / ci.dur, slide = clamp(k * 6, 0, 1), a = k > 0.8 ? (1 - k) / 0.2 : 1;
        c.globalAlpha = clamp(a, 0, 1);
        const y = H * 0.4 - 60 * u, hh = (62 + ci.tier * 7) * u, off = (1 - slide) * W;
        c.fillStyle = `rgba(0,0,0,.34)`; c.fillRect(-off, y, W, hh);
        const gr = c.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, rgbCss(ci.color, 0)); gr.addColorStop(0.5, rgbCss(ci.color, 0.4)); gr.addColorStop(1, rgbCss(ci.color, 0));
        c.fillStyle = gr; c.fillRect(-off, y, W, hh);
        c.fillStyle = "#fff"; c.fillRect(-off, y, W, 2); c.fillRect(-off, y + hh - 2, W, 2);
        const shake = ci.tier >= 4 ? (Math.random() - 0.5) * 4 : 0;
        text(`${ci.title}`, W / 2 - off + shake, y + hh * 0.36, (30 + ci.tier * 5) * u, "#ffffff", "center", 900);
        text(`${ci.name}　${ci.size}　威力 ${comma(ci.dmg)}`, W / 2 - off, y + hh * 0.76, 17 * u, "#fff3c0", "center", 700);
        c.globalAlpha = 1;
      }

      // ---- 危険の合図：ほかの表示の上に ----
      if (g.mode === "fight") threats(g, ui, u);

      // ---- 操作のヒント：いまの割り当てを、そのまま出す ----
      if (ui.hint > 0.01 && !ui.comboCard && ui.hints) {
        c.globalAlpha = ui.hint;
        ui.hints.forEach((s, i) => text(s, 92 * u, H - 112 * u - (ui.hints.length - 1 - i) * 19 * u, 13 * u, "#cfd8ff", "left", 600));
        c.globalAlpha = 1;
      }
    },
  };
}
