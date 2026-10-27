// 3D の描画器（WebGL2）。やることは2つだけ：向きを変えて光る板（sprite）と、太さのある線（line）を たくさん描く。
//   sprite の kind：0 やわらかい光　1 ふち取りの玉（奥行きの前後が正しく重なる）　2 輪　3 十字のきらめき
//   1コマの流れ：begin(カメラ) → sprite()・line() をためる → end() でまとめて描く
const VS_SPRITE = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPos;
layout(location=2) in vec4 aColor;
layout(location=3) in float aKind;
uniform mat4 uView;
uniform mat4 uProj;
out vec2 vUv;
out vec4 vColor;
out float vKind;
void main() {
  vec4 v = uView * vec4(aPos.xyz, 1.0);
  v.xy += aCorner * aPos.w * 0.5;
  gl_Position = uProj * v;
  vUv = aCorner;
  vColor = aColor;
  vKind = aKind;
}`;

const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in float vKind;
out vec4 o;
void main() {
  float d = length(vUv);
  int k = int(vKind + 0.5);
  if (k == 1) {
    float a = smoothstep(1.0, 0.82, d);
    if (a < 0.4) discard;
    float core = smoothstep(0.72, 0.0, d);
    float rim = smoothstep(0.5, 1.0, d);
    vec3 c = mix(vColor.rgb, vec3(1.0), core * 0.92);
    c *= 1.0 - 0.5 * rim;
    o = vec4(c, 1.0);
  } else if (k == 0) {
    float a = clamp(1.0 - d, 0.0, 1.0);
    a *= a;
    o = vec4(vColor.rgb, vColor.a * a);
  } else if (k == 2) {
    float a = smoothstep(0.14, 0.0, abs(d - 0.86));
    o = vec4(vColor.rgb, vColor.a * a);
  } else {
    float a = exp(-abs(vUv.x) * 12.0) * exp(-abs(vUv.y) * 2.2) + exp(-abs(vUv.y) * 12.0) * exp(-abs(vUv.x) * 2.2);
    a += max(0.0, 1.0 - d) * 0.5;
    o = vec4(vColor.rgb, vColor.a * min(a, 1.0));
  }
}`;

const VS_LINE = `#version 300 es
layout(location=0) in vec2 aQ;
layout(location=1) in vec3 aP0;
layout(location=2) in vec3 aP1;
layout(location=3) in vec4 aColor;
layout(location=4) in float aWidth;
uniform mat4 uVP;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uMul;
out vec4 vColor;
out float vSide;
void main() {
  vec4 c0 = uVP * vec4(aP0, 1.0);
  vec4 c1 = uVP * vec4(aP1, 1.0);
  float n = 0.05;
  if (c0.w < n && c1.w < n) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); vSide = 0.0; return; }
  if (c0.w < n) c0 = mix(c0, c1, (n - c0.w) / (c1.w - c0.w));
  else if (c1.w < n) c1 = mix(c1, c0, (n - c1.w) / (c0.w - c1.w));
  vec2 s0 = c0.xy / c0.w * uRes * 0.5;
  vec2 s1 = c1.xy / c1.w * uRes * 0.5;
  vec2 dir = s1 - s0;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = mix(c0, c1, aQ.x);
  vec2 off = nrm * aQ.y * aWidth * uDpr * 0.5 / (uRes * 0.5);
  gl_Position = vec4(c.xy + off * c.w, c.z, c.w);
  vColor = aColor * uMul * exp(-c.w * 0.012);
  vSide = aQ.y;
}`;

const FS_LINE = `#version 300 es
precision highp float;
in vec4 vColor;
in float vSide;
out vec4 o;
void main() {
  float a = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
  o = vec4(vColor.rgb, vColor.a * a);
}`;

const SPR_STRIDE = 9, LINE_STRIDE = 11;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function perspective(o, fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  o.fill(0);
  o[0] = t / aspect; o[5] = t; o[10] = (f + n) * nf; o[11] = -1; o[14] = 2 * f * n * nf;
}

function lookAt(o, ex, ey, ez, tx, ty, tz) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz, l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = zz, xz = -zx;
  l = Math.hypot(xx, xz) || 1;
  xx /= l; xz /= l;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = 0; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1;
}

function mul(o, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
}

export function createRenderer(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const spr = compile(gl, VS_SPRITE, FS_SPRITE);
  const lin = compile(gl, VS_LINE, FS_LINE);
  const U = {
    sView: gl.getUniformLocation(spr, "uView"), sProj: gl.getUniformLocation(spr, "uProj"),
    lVP: gl.getUniformLocation(lin, "uVP"), lRes: gl.getUniformLocation(lin, "uRes"), lDpr: gl.getUniformLocation(lin, "uDpr"), lMul: gl.getUniformLocation(lin, "uMul"),
  };

  const maxO = 7000, maxA = 16000, maxL = 7000;
  const sO = new Float32Array(maxO * SPR_STRIDE), sA = new Float32Array(maxA * SPR_STRIDE), ln = new Float32Array(maxL * LINE_STRIDE);
  let nO = 0, nA = 0, nL = 0;

  // 板の VAO
  const sprVao = gl.createVertexArray(), sprQuad = gl.createBuffer(), sprInst = gl.createBuffer();
  gl.bindVertexArray(sprVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, sprQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, sprInst);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, SPR_STRIDE * 4, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, SPR_STRIDE * 4, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, SPR_STRIDE * 4, 32); gl.vertexAttribDivisor(3, 1);

  // 線の VAO。動く線の入れもの（lnInst）と、動かない床の入れもの（gridInst）で、同じ形を使う
  const lineQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const lnInst = gl.createBuffer(), gridInst = gl.createBuffer();
  const mkLineVao = (inst) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineQuad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    const S = LINE_STRIDE * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 12); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 24); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, S, 40); gl.vertexAttribDivisor(4, 1);
    return vao;
  };
  const lnVao = mkLineVao(lnInst), gridVao = mkLineVao(gridInst);
  gl.bindVertexArray(null);

  let gridN = 0;
  const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16);
  let cssW = 1, cssH = 1, dpr = 1, W = 1, H = 1, tint = [1, 1, 1, 1];

  const api = {
    ok: true,
    get width() { return cssW; },
    get height() { return cssH; },

    resize(w, h, ratio) {
      cssW = Math.max(1, w); cssH = Math.max(1, h); dpr = ratio;
      W = Math.max(1, Math.round(cssW * dpr)); H = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
    },

    // 動かない線（床の格子）を一度だけ入れる。lines は [x0,y0,z0,x1,y1,z1,r,g,b,a,w] の並び
    setGrid(lines) {
      gridN = lines.length / LINE_STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, gridInst);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
    },
    setGridTint(r, g, b, a = 1) { tint = [r, g, b, a]; },

    // カメラ：eye から target を見る。fov は縦の画角（ラジアン）
    begin(eye, target, fov) {
      nO = 0; nA = 0; nL = 0;
      lookAt(view, eye[0], eye[1], eye[2], target[0], target[1], target[2]);
      perspective(proj, fov, cssW / cssH, 0.3, 700);
      mul(vp, proj, view);
    },

    sprite(x, y, z, size, r, g, b, a, kind) {
      if (kind === 1) {
        if (nO >= maxO) return;
        const o = nO++ * SPR_STRIDE;
        sO[o] = x; sO[o + 1] = y; sO[o + 2] = z; sO[o + 3] = size; sO[o + 4] = r; sO[o + 5] = g; sO[o + 6] = b; sO[o + 7] = a; sO[o + 8] = 1;
      } else {
        if (nA >= maxA) return;
        const o = nA++ * SPR_STRIDE;
        sA[o] = x; sA[o + 1] = y; sA[o + 2] = z; sA[o + 3] = size; sA[o + 4] = r; sA[o + 5] = g; sA[o + 6] = b; sA[o + 7] = a; sA[o + 8] = kind;
      }
    },

    line(x0, y0, z0, x1, y1, z1, r, g, b, a, w) {
      if (nL >= maxL) return;
      const o = nL++ * LINE_STRIDE;
      ln[o] = x0; ln[o + 1] = y0; ln[o + 2] = z0; ln[o + 3] = x1; ln[o + 4] = y1; ln[o + 5] = z1;
      ln[o + 6] = r; ln[o + 7] = g; ln[o + 8] = b; ln[o + 9] = a; ln[o + 10] = w;
    },

    end(clear) {
      gl.viewport(0, 0, W, H);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);

      // 1) ふち取りの玉：前後が正しく重なる
      if (nO) {
        gl.useProgram(spr);
        gl.uniformMatrix4fv(U.sView, false, view);
        gl.uniformMatrix4fv(U.sProj, false, proj);
        gl.bindVertexArray(sprVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, sprInst);
        gl.bufferData(gl.ARRAY_BUFFER, sO.subarray(0, nO * SPR_STRIDE), gl.STREAM_DRAW);
        gl.depthMask(true);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nO);
      }

      // 2) 線：足していく（光る）
      gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(lin);
      gl.uniformMatrix4fv(U.lVP, false, vp);
      gl.uniform2f(U.lRes, W, H);
      gl.uniform1f(U.lDpr, dpr);
      if (gridN) {
        gl.uniform4f(U.lMul, tint[0], tint[1], tint[2], tint[3]);
        gl.bindVertexArray(gridVao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, gridN);
      }
      if (nL) {
        gl.uniform4f(U.lMul, 1, 1, 1, 1);
        gl.bindVertexArray(lnVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, lnInst);
        gl.bufferData(gl.ARRAY_BUFFER, ln.subarray(0, nL * LINE_STRIDE), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nL);
      }

      // 3) 光る板：足していく
      if (nA) {
        gl.useProgram(spr);
        gl.uniformMatrix4fv(U.sView, false, view);
        gl.uniformMatrix4fv(U.sProj, false, proj);
        gl.bindVertexArray(sprVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, sprInst);
        gl.bufferData(gl.ARRAY_BUFFER, sA.subarray(0, nA * SPR_STRIDE), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nA);
      }
      gl.bindVertexArray(null);
      gl.depthMask(true);
    },

    // 世界の点 → 画面（CSS ピクセル）。カメラの後ろなら null
    project(x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.01) return null;
      return { x: (cx / cw * 0.5 + 0.5) * cssW, y: (1 - (cy / cw * 0.5 + 0.5)) * cssH, w: cw };
    },
    counts() { return { opaque: nO, add: nA, lines: nL }; },
  };
  return api;
}
