// 音。ぜんぶ その場で合成する（音のファイルは持たない）。鳴らせない環境でも、何も起きずに すり抜ける。
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let sfx = true, bgmOn = true, vol = 0.6;
  const last = {};
  let charge = null;
  let bgm = null;

  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = vol;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  // 同じ音が重なりすぎないように
  const gate = (name, ms) => {
    const now = performance.now();
    if (now - (last[name] || 0) < ms) return false;
    last[name] = now;
    return true;
  };

  function tone(freq, dur, type = "sine", v = 0.1, slideTo = null, delay = 0) {
    if (!sfx || !ensure()) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, v = 0.2, from = 2000, to = 200, type = "lowpass", delay = 0) {
    if (!sfx || !ensure()) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ---- 音楽：低音と 軽いアルペジオ。戦いが進むと 層が増える ----
  const ROOTS = [45, 43, 41, 48, 40];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function bgmNote(m, t, len, type, v, cutoff) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = mtof(m);
    f.type = "lowpass";
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.02);
  }
  function bgmTick() {
    if (!bgm || !ctx) return;
    const spb = 60 / bgm.tempo / 2;      // 八分音符
    while (bgm.next < ctx.currentTime + 0.25) {
      const i = bgm.step % 32, t = bgm.next, root = ROOTS[(bgm.stage - 1) % ROOTS.length] + (bgm.stage > 5 ? ((bgm.stage * 3) % 5) : 0);
      const bar = Math.floor(i / 8), chord = [0, -4, -2, -5][bar] || 0;
      const bass = [0, 0, 12, 0, 7, 0, 10, 0][i % 8];
      if (bgmOn) {
        bgmNote(root + chord + bass, t, spb * 0.9, "sawtooth", 0.05, 600 + bgm.level * 900);
        if (bgm.level > 0.25) bgmNote(root + 24 + chord + [0, 3, 7, 12, 7, 3, 10, 7][i % 8], t, spb * 0.7, "triangle", 0.035, 3000);
        if (bgm.level > 0.55 && i % 2 === 0) noise(0.05, 0.03, 8000, 6000, "highpass", t - ctx.currentTime);
        if (i % 8 === 0) noise(0.12, 0.09, 400, 60, "lowpass", t - ctx.currentTime);
      }
      bgm.next += spb;
      bgm.step++;
    }
  }

  return {
    get ok() { return !!ctx; },
    unlock() { ensure(); },
    configure(o) {
      if (o.sfx !== undefined) sfx = !!o.sfx;
      if (o.bgm !== undefined) bgmOn = !!o.bgm;
      if (o.volume !== undefined) { vol = o.volume; if (master) master.gain.value = vol; }
    },

    bolt() { if (gate("bolt", 90)) tone(1100, 0.04, "square", 0.012, 700); },
    hit() { if (gate("hit", 70)) tone(180, 0.04, "triangle", 0.03, 120); },
    graze() { if (gate("graze", 45)) tone(2200 + Math.random() * 400, 0.03, "sine", 0.022); },
    pop() { if (gate("pop", 40)) tone(900, 0.03, "sine", 0.015, 1400); },
    guard() { if (gate("guard", 120)) tone(400, 0.05, "square", 0.02, 300); },
    dash() { noise(0.12, 0.08, 6000, 1500, "highpass"); },
    select() { tone(660, 0.05, "square", 0.03); },
    // 上や下から 当たりそうな弾。上は高い 2 音、下は低い 1 音
    alert(dir) {
      if (!gate("alert" + dir, 500)) return;
      if (dir === "up") { tone(1500, 0.06, "triangle", 0.05, 1900); tone(1900, 0.08, "triangle", 0.05, null, 0.08); }
      else tone(240, 0.13, "sawtooth", 0.05, 150);
    },
    deny() { if (gate("deny", 120)) tone(150, 0.09, "square", 0.04, 110); },
    launch() { if (gate("launch", 50)) tone(500, 0.12, "sawtooth", 0.03, 1200); },
    hurt() { tone(320, 0.6, "sawtooth", 0.18, 40); noise(0.5, 0.25, 3000, 100); },
    chargeReady() { tone(1320, 0.12, "triangle", 0.07); tone(1760, 0.16, "triangle", 0.05, null, 0.06); },
    chargeCancel() { stopCharge(); },
    weakWarn() { if (gate("weakWarn", 150)) tone(1500, 0.05, "square", 0.03); },
    weak() { tone(880, 0.1, "triangle", 0.06); tone(1320, 0.14, "triangle", 0.05, null, 0.07); },
    shield() { tone(1800, 0.2, "triangle", 0.1, 700); noise(0.25, 0.12, 6000, 1500, "highpass"); },
    dome() { tone(180, 0.6, "sine", 0.12, 720); noise(0.5, 0.08, 400, 4000, "bandpass"); },
    phase() { tone(110, 0.8, "sawtooth", 0.1, 440); noise(0.5, 0.08, 300, 3000, "bandpass"); },
    phaseClear() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.08, null, i * 0.08)); },
    stageClear() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.4, "triangle", 0.08, null, i * 0.11)); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, "sawtooth", 0.09, f * 0.8, i * 0.2)); },

    // 溜め：音が だんだん高くなる
    chargeStart(tier) {
      if (!sfx || !ensure() || charge) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = 70 - tier * 6;
      f.type = "lowpass"; f.frequency.value = 700;
      g.gain.value = 0.0001;
      o.connect(f); f.connect(g); g.connect(master);
      o.start();
      charge = { o, g, f, tier };
    },
    chargeSet(k) {
      if (!charge) return;
      const t = ctx.currentTime;
      charge.o.frequency.setTargetAtTime((70 - charge.tier * 6) * (1 + k * (4 + charge.tier)), t, 0.05);
      charge.f.frequency.setTargetAtTime(600 + k * 3000, t, 0.05);
      charge.g.gain.setTargetAtTime(0.03 + 0.05 * k + charge.tier * 0.01, t, 0.05);
    },
    chargeStop() { stopCharge(); },

    // 発射：段が上がるほど 長く 重い
    fire(tier) {
      stopCharge();
      tone(700, 0.35 + 0.18 * tier, "sawtooth", 0.14 + 0.02 * tier, 50);
      noise(0.3 + 0.2 * tier, 0.2 + 0.05 * tier, 5000, 120);
      if (tier >= 4) { tone(55, 1.2, "sine", 0.3, 28); noise(1.0, 0.25, 800, 40, "lowpass", 0.1); }
    },
    boom(rad) {
      if (!gate("boom", 60)) return;
      const k = Math.min(1, rad / 12);
      noise(0.25 + 0.7 * k, 0.12 + 0.2 * k, 1800, 60);
      tone(120 - 60 * k, 0.3 + 0.5 * k, "sine", 0.1 + 0.15 * k, 30);
    },

    bgmStart(stage, tempo = 132) {
      if (!ensure()) return;
      bgmStop();
      bgm = { stage, tempo: tempo + stage * 2, step: 0, next: ctx.currentTime + 0.1, level: 0, timer: setInterval(bgmTick, 60) };
    },
    bgmLevel(l) { if (bgm) bgm.level = l; },
    bgmStop,
  };

  function stopCharge() {
    if (!charge) return;
    const { o, g } = charge;
    try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); o.stop(ctx.currentTime + 0.15); } catch { /* 止まっていた */ }
    charge = null;
  }
  function bgmStop() {
    if (bgm) { clearInterval(bgm.timer); bgm = null; }
  }
}
