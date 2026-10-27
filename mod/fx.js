// 粒（火花・煙・欠片）。ゲームの結果には関わらない見た目だけのもの。
export class Particles {
  constructor(max = 2600) {
    this.max = max;
    this.n = 0;
    for (const k of ["x", "y", "z", "vx", "vy", "vz", "life", "span", "size", "r", "g", "b", "drag", "grav"]) this[k] = new Float32Array(max);
    this.kind = new Uint8Array(max);
  }

  // n 個を、中心から球状に飛ばす。opts：{ drag, grav, kind, spread（0〜1：横にだけ）, up }
  burst(x, y, z, n, speed, rgb, size, life, opts = {}) {
    const drag = opts.drag ?? 1.5, grav = opts.grav ?? 0, kind = opts.kind ?? 0, flat = opts.flat ?? 0;
    for (let k = 0; k < n && this.n < this.max; k++) {
      const i = this.n++;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rad = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.x[i] = x; this.y[i] = y; this.z[i] = z;
      this.vx[i] = Math.cos(th) * rad * s;
      this.vy[i] = (flat ? u * (1 - flat) : u) * s + (opts.up || 0);
      this.vz[i] = Math.sin(th) * rad * s;
      this.life[i] = this.span[i] = life * (0.6 + Math.random() * 0.4);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.r[i] = rgb[0]; this.g[i] = rgb[1]; this.b[i] = rgb[2];
      this.drag[i] = drag; this.grav[i] = grav; this.kind[i] = kind;
    }
  }

  // 1つだけ、向きと速さを決めて出す
  one(x, y, z, vx, vy, vz, rgb, size, life, drag = 1, kind = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.span[i] = life; this.size[i] = size;
    this.r[i] = rgb[0]; this.g[i] = rgb[1]; this.b[i] = rgb[2]; this.drag[i] = drag; this.grav[i] = 0; this.kind[i] = kind;
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      if ((this.life[i] -= dt) <= 0) {
        const last = --this.n;
        if (i !== last) for (const k of ["x", "y", "z", "vx", "vy", "vz", "life", "span", "size", "r", "g", "b", "drag", "grav", "kind"]) this[k][i] = this[k][last];
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt; this.vz[i] *= d;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      if (this.y[i] < 0.02 && this.grav[i] > 0) { this.y[i] = 0.02; this.vy[i] *= -0.4; }
    }
  }

  draw(r) {
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.span[i];
      r.sprite(this.x[i], this.y[i], this.z[i], this.size[i] * (0.4 + 0.6 * f), this.r[i], this.g[i], this.b[i], f, this.kind[i] === 3 ? 3 : 0);
    }
  }

  clear() { this.n = 0; }
}
