// 敵の弾の置き場。数千発を速く扱うため、項目ごとの配列（Float32Array）に持つ。消すときは最後の1発と入れかえる。
export const F_GRAZED = 1;   // かすり済み
export const F_AIM = 2;      // 動きだす瞬間に、勇者へ向けなおす
export const F_SPLASH = 4;   // 床に落ちたら 輪になって散る
export const FORM = { orb: 0, big: 1, small: 2 };

export class Bullets {
  constructor(max) {
    this.max = max;
    this.n = 0;
    for (const k of ["x", "y", "z", "vx", "vy", "vz", "r", "acc", "turn", "home", "life", "hold", "spd"]) this[k] = new Float32Array(max);
    for (const k of ["col", "form", "flags", "bn", "sc"]) this[k] = new Uint8Array(max);
  }

  // s: { x, y, z, ang, pitch, speed, r, col, form, acc, turn, home, life, hold, aim, bounce, splash }
  // ang は水平の向き（0 が +z、π/2 が +x）。pitch は上向きが正
  add(s) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    const sp = s.speed || 0, pc = Math.cos(s.pitch || 0), a = s.ang || 0;
    this.x[i] = s.x; this.y[i] = s.y; this.z[i] = s.z;
    this.vx[i] = Math.sin(a) * pc * sp;
    this.vy[i] = Math.sin(s.pitch || 0) * sp;
    this.vz[i] = Math.cos(a) * pc * sp;
    this.r[i] = s.r ?? 0.3;
    this.acc[i] = s.acc || 0;
    this.turn[i] = s.turn || 0;
    this.home[i] = s.home || 0;
    this.life[i] = s.life ?? 14;
    this.hold[i] = s.hold || 0;
    this.spd[i] = sp;
    this.col[i] = s.col || 0;
    this.form[i] = s.form || 0;
    this.flags[i] = (s.aim ? F_AIM : 0) | (s.splash ? F_SPLASH : 0);
    this.bn[i] = s.bounce || 0;
    this.sc[i] = s.splash || 0;
    return i;
  }

  remove(i) {
    const last = --this.n;
    if (i === last) return;
    for (const k of ["x", "y", "z", "vx", "vy", "vz", "r", "acc", "turn", "home", "life", "hold", "spd", "col", "form", "flags", "bn", "sc"]) this[k][i] = this[k][last];
  }

  clear() { this.n = 0; }
}
