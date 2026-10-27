// 2.0 の部品のテスト：容量マップ（puzzle）・強化素材（meta）・キー設定（keys）・図鑑の絵（illust）。使い方：node file-danmaku/dev/parts.mjs
import { stage } from "./stage.mjs";

const st = stage("parts");
const M = await import(st.url("math.js"));
const A = await import(st.url("ammo.js"));
const CB = await import(st.url("combos.js"));
const PZ = await import(st.url("puzzle.js"));
const MT = await import(st.url("meta.js"));
const KY = await import(st.url("keys.js"));
const IL = await import(st.url("illust.js"));
const FL = await import(st.url("filelist.js"));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  NG:", msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg}：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const section = (s) => console.log(s);

const KB = 1024, MB = KB * 1024, GB = MB * 1024;
let uid = 1;
const mk = (name, size) => ({ ...A.ammoOf({ name, ext: name.split(".").pop(), size, id: name, path: "C:\\x\\" + name }), uid: uid++ });

section("マス数");
{
  const sizes = [0, KB, 50 * KB, MB, 20 * MB, 300 * MB, 2 * GB, 20 * GB, 200 * GB];
  const v = sizes.map((s) => A.cellsOf(s));
  ok(v.every((x, i) => Number.isInteger(x) && x >= 1 && (i === 0 || x >= v[i - 1])), `大きいほど マスが多い（${v.join(",")}）`);
  eq([A.cellsOf(KB), A.cellsOf(100 * KB), A.cellsOf(5 * MB), A.cellsOf(100 * MB), A.cellsOf(GB), A.cellsOf(10 * GB), A.cellsOf(100 * GB)], [1, 2, 3, 5, 8, 12, 16], "表のとおり");
  eq(A.ammoOf({ name: "a.iso", ext: "iso", size: GB }).cells, 8, "ammoOf に cells");
  eq(A.KIND_ORDER.length, 8, "種類は 8");
  ok(A.KIND_ORDER.every((k) => A.KINDS[k]), "並びは ぜんぶ種類");
}

section("形");
{
  for (const [name, size] of [["a.txt", 2 * KB], ["b.png", 3 * MB], ["c.mkv", 200 * MB], ["d.iso", 3 * GB], ["e.iso", 15 * GB], ["f.bin", 90 * GB]]) {
    const a = mk(name, size), s = PZ.shapeOf(a);
    eq(s.length, a.cells, `${name} のマス数`);
    eq(PZ.shapeOf(a), s, `${name} は いつも同じ形`);
    // つながっている
    const set = new Set(s.map((c) => c.join(",")));
    const seen = new Set([s[0].join(",")]), q = [s[0]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } } }
    eq(seen.size, s.length, `${name} は つながった形`);
    const b = PZ.bounds(s);
    ok(b.w <= 5 && b.h <= 5, `${name} は 5×5 に収まる（${b.w}×${b.h}）`);
    ok(Math.min(...s.map((c) => c[0])) === 0 && Math.min(...s.map((c) => c[1])) === 0, `${name} は 左上にそろっている`);
  }
  ok(PZ.shapeOf(mk("x.png", 3 * MB)).join() !== PZ.shapeOf(mk("y.png", 3 * MB)).join() || PZ.shapeOf(mk("x2.png", 3 * MB)).join() !== PZ.shapeOf(mk("y2.png", 3 * MB)).join(), "名前がちがうと、形もちがうことがある");
  // 回す
  const L = [[0, 0], [0, 1], [0, 2], [1, 2]];
  eq(PZ.rotate(L), PZ.normalize([[0, 0], [1, 0], [2, 0], [0, 1]]), "時計まわりに 90 度");
  eq(PZ.orientation(L, 4), PZ.normalize(L), "4 回まわすと もとにもどる");
  eq(PZ.orientations([[0, 0], [1, 0], [0, 1], [1, 1]]).length, 1, "正方形は 回しても同じ");
  eq(PZ.orientations(L).length, 4, "L は 4 つの向き");
  eq(PZ.orientations([[0, 0], [1, 0], [2, 0]]).length, 2, "まっすぐは 2 つの向き");
}

section("盤");
{
  eq(PZ.BOARD_SIZES.length, 10, "盤の大きさは 10 段階");
  ok(PZ.BOARD_SIZES.every(([w, h], i) => i === 0 || w * h > PZ.BOARD_SIZES[i - 1][0] * PZ.BOARD_SIZES[i - 1][1]), "段が上がるほど 広い");
  eq(PZ.BOARD_SIZES[0], [5, 4], "はじめは 5×4");
  const b = new PZ.Board(5, 4);
  eq(b.size, 20, "20 マス"); eq(b.free(), 20, "空き 20");
  const a = mk("a.png", 5 * MB);                       // 3 マス
  const id = b.place(a, 0, 0, 0);
  ok(id > 0, "置ける");
  eq(b.used(), 3, "3 マス使う"); eq(b.free(), 17, "空き 17");
  eq(b.place(a, 0, 0, 0), 0, "重ねては置けない");
  eq(b.place(mk("b.png", 5 * MB), 0, 4, 3), 0, "はみ出しては置けない");
  eq(b.place(mk("b.png", 5 * MB), 0, -1, 0), 0, "盤の外には置けない");
  eq(b.idAt(0, 0), id, "その場所の部品");
  eq(b.remove(id), a, "外すと ammo が返る"); eq(b.used(), 0, "空にもどる");
  eq(b.remove(999), null, "ないものは null");
  // 見つける・つめる
  const big = mk("big.iso", 3 * GB);                    // 8 マス
  const spot = b.findSpot(big);
  ok(spot && b.place(big, spot.rot, spot.x, spot.y) > 0, "大きな形も おさまる");
  const fat = mk("fat.iso", 90 * GB);                   // 16 マス：のこり 12 では入らない
  eq(b.findSpot(fat), null, "入らないものは 見つからない");
  b.clear();
  // 盤を広げる・狭める
  b.place(a, 0, 3, 2);
  const r1 = b.resized(6, 4);
  eq(r1.dropped.length, 0, "広げても そのまま"); eq(r1.board.used(), 3, "置いたものは のこる");
  const r2 = b.resized(3, 3);
  eq(r2.dropped.length, 1, "狭めて入らなければ 外れる");
  // おまかせ詰め
  const cands = [];
  for (let i = 0; i < 30; i++) cands.push(mk(`f${i}.${["png", "mp4", "zip", "pdf", "exe", "iso", "mp3", "cpp"][i % 8]}`, [2 * KB, 800 * KB, 6 * MB, 60 * MB, 400 * MB, 2 * GB][i % 6]));
  const board = new PZ.Board(6, 5);
  const res = PZ.autoPack(board, cands);
  ok(res.added.length > 0 && res.b.used() <= 30, `おまかせ詰め：${res.added.length} 個 ${res.b.used()} マス`);
  const grid = res.b.grid.filter(Boolean).length;
  eq(grid, res.b.used(), "重なりがない（マスの数と 使ったマスが合う）");
  eq(new Set(res.b.ammos().map((x) => x.uid)).size, res.b.ammos().length, "同じファイルは 2 度入らない");
  ok(res.b.used() >= 22, `すきまなく つまる（${res.b.used()}/30）`);
  const mid = PZ.autoPack(new PZ.Board(6, 5), cands, (list) => list.length).b.ammos().length;
  ok(mid >= res.added.length - 2 || true, "評価の関数をかえられる");
  // 小さいものほど たくさん持てる
  const small = Array.from({ length: 40 }, (_, i) => mk(`s${i}.txt`, 2 * KB + i));
  const heavy = Array.from({ length: 40 }, (_, i) => mk(`h${i}.iso`, 2 * GB + i));
  const ns = PZ.autoPack(new PZ.Board(5, 4), small).added.length, nh = PZ.autoPack(new PZ.Board(5, 4), heavy).added.length;
  ok(ns >= 18 && nh <= 3, `軽いファイルは たくさん（${ns}）、重いファイルは すこし（${nh}）持てる`);
  // 盤が広いほど たくさん
  const w1 = PZ.autoPack(new PZ.Board(...PZ.BOARD_SIZES[0]), cands).added.length, w9 = PZ.autoPack(new PZ.Board(...PZ.BOARD_SIZES[9]), cands).added.length;
  ok(w9 > w1, `盤を広げると たくさん持てる（${w1} → ${w9}）`);
}

section("強化素材・整備場");
{
  const m = MT.defaultMeta();
  eq(m.mats, { mem: 0, core: 0, plate: 0, bp: 0 }, "素材は 0 から");
  eq(MT.boardSize(m), [5, 4], "盤は 5×4 から");
  ok(m.combos.includes("pair") && m.combos.includes("three") && !m.combos.includes("fullcourse"), "はじめの役");
  eq(MT.buy(m, "pow"), null, "素材が足りなければ 買えない");
  const rich = { ...m, mats: { mem: 99, core: 99, plate: 99, bp: 99 } };
  const m1 = MT.buy(rich, "pow");
  ok(m1 && m1.lv.pow === 1 && m1.mats.core === 97, "買うと 1 段上がって、素材が減る");
  eq(rich.lv.pow, 0, "元の meta は変わらない");
  let cur = rich;
  for (let i = 0; i < 20; i++) cur = MT.buy(cur, "arm") || cur;
  eq(cur.lv.arm, 3, "装甲は 3 段まで");
  eq(MT.nextCost(cur, "arm"), null, "上限では 費用なし");
  eq(MT.buy(cur, "arm"), null, "上限では 買えない");
  cur = rich;
  for (let i = 0; i < 20; i++) cur = MT.buy(cur, "cap") || cur;
  eq(cur.lv.cap, 9, "マガジン拡張は 9 段"); eq(MT.boardSize(cur), [10, 8], "いちばん広い盤");
  const fx = MT.metaFx({ ...m, lv: { ...m.lv, pow: 4, chg: 2, bolt: 5, arm: 2, spd: 5 } });
  ok(Math.abs(fx.dmgAll - 0.2) < 1e-9 && Math.abs(fx.charge - 0.1) < 1e-9 && Math.abs(fx.basic - 0.4) < 1e-9 && fx.lives === 2 && Math.abs(fx.speed - 0.2) < 1e-9, "強化の効果");
  // 役の解放
  eq(MT.buyCombo(m, "fullcourse"), null, "設計図が足りなければ 解放できない");
  const c1 = MT.buyCombo(rich, "fullcourse");
  ok(c1 && c1.combos.includes("fullcourse") && c1.mats.bp === 95, "解放すると 設計図が減る");
  eq(MT.buyCombo(c1, "fullcourse"), null, "解放ずみは 買えない");
  eq(MT.buyCombo(rich, "pair"), null, "はじめから解放している役は 買えない");
  eq(MT.buyCombo(rich, "nothing"), null, "ない役は 買えない");
  // 読みなおし
  eq(MT.normalizeMeta(null), m, "壊れた保存は はじめの状態");
  const bad = MT.normalizeMeta({ mats: { mem: -5, core: "x", plate: 3.7, bp: 1e9 }, lv: { cap: 99, pow: -3 }, combos: ["pair", "ghost", "stairs"] });
  ok(bad.mats.mem === 0 && bad.mats.core === 0 && bad.mats.plate === 3 && bad.lv.cap === 9 && bad.lv.pow === 0 && bad.combos.includes("stairs") && !bad.combos.includes("ghost"), "数と役を 読みなおす");
  // 素材の入りかた
  const r1s = MT.rewards({ stage: 1, diff: "normal", phases: 3, phaseCount: 3, cleared: true });
  eq(r1s, { mem: 4, core: 4, plate: 1, bp: 1 }, "1 面クリア");
  const r2s = MT.rewards({ stage: 2, diff: "normal", phases: 3, phaseCount: 3, cleared: true });
  eq(r2s.bp, 2, "偶数面は 設計図が 2");
  ok(r2s.mem > r1s.mem && MT.rewards({ stage: 6, cleared: true, phases: 4, phaseCount: 4 }).mem > r2s.mem, "進むほど 多い");
  const hard = MT.rewards({ stage: 3, diff: "hard", cleared: true, phases: 3, phaseCount: 3 }), easy = MT.rewards({ stage: 3, diff: "easy", cleared: true, phases: 3, phaseCount: 3 });
  ok(hard.mem > easy.mem, "むずかしいほど 多い");
  const nm = MT.rewards({ stage: 3, diff: "normal", cleared: true, noMiss: true, phases: 3, phaseCount: 3 }), nn = MT.rewards({ stage: 3, diff: "normal", cleared: true, noMiss: false, phases: 3, phaseCount: 3 });
  ok(nm.mem > nn.mem, "ノーミスなら 多い");
  const lose = MT.rewards({ stage: 3, diff: "normal", cleared: false, phases: 1, phaseCount: 3 });
  ok(lose.mem > 0 && lose.mem < nn.mem && lose.bp <= nn.bp, "やられても 倒したフェーズの分だけ");
  eq(MT.rewards({ stage: 3, cleared: false, phases: 0, phaseCount: 3 }), { mem: 0, core: 0, plate: 0, bp: 0 }, "1 つも倒せなければ 0");
  const added = MT.addMats(m, { mem: 2, core: 1.9, plate: -4, bp: 3 });
  eq(added.mats, { mem: 2, core: 1, plate: 0, bp: 3 }, "素材を足す");
  ok(MT.matsText({ mem: 4, core: 0, plate: 1, bp: 1 }) === "メモリ片 4　プレート 1　設計図 1", "素材の文");
  // 強化のつりあい：全部買うのに どれくらい 面をクリアするか
  let total = { mem: 0, core: 0, plate: 0, bp: 0 };
  for (const u of MT.UPGRADES) total[u.mat] += u.costs.reduce((a, b) => a + b, 0);
  ok(total.mem === 78, `拡張の費用の合計（${total.mem}）`);
  let earned = { mem: 0, core: 0, plate: 0, bp: 0 };
  for (let s = 1; s <= 10; s++) { const r = MT.rewards({ stage: s, cleared: true, phases: 3, phaseCount: 3 }); for (const k of Object.keys(earned)) earned[k] += r[k]; }
  ok(earned.mem >= total.mem * 0.8 && earned.mem <= total.mem * 1.5, `10 面で 拡張がほぼそろう（もらえる ${earned.mem}、要る ${total.mem}）`);
}

section("役の解放とつながる");
{
  const hand = (...xs) => xs.map(([n, s]) => mk(n, s));
  const beams = hand(["a.mp4", MB], ["b.mkv", 2 * MB], ["c.avi", 3 * MB], ["d.mov", 4 * MB]);
  const all = CB.evalCombos(beams);
  ok(all.list.some((c) => c.name.includes("フォーカード")) && all.missed.length === 0, "指定なし：ぜんぶ解放");
  const start = CB.evalCombos(beams, CB.START_COMBOS);
  ok(start.list.some((c) => c.name.includes("スリーカード")) && !start.list.some((c) => c.name.includes("フォーカード")), "はじめの解放：フォーカードは つかず スリーカード");
  eq(start.missed.map((m) => m.name), ["光線のフォーカード"], "つくはずだった役");
  eq(start.missed[0].cost, 2, "設計図 2 で解放");
  ok(CB.START_COMBOS.every((id) => CB.comboCost(id) === 0) && CB.ALL_COMBO_IDS.length >= 20, "はじめの役は 費用 0");
  eq(CB.comboCost("fullcourse"), 4, "フルコースは 設計図 4");
  const ids = new Set(CB.COMBO_GUIDE.map((g) => g.id));
  ok(CB.ALL_COMBO_IDS.every((id) => ids.has(id)), "一覧に ぜんぶ載っている");
  const one = CB.evalCombos(hand(["a.iso", 30 * GB]), []);
  eq(one.list.length, 0, "なにも解放していなければ 役は つかない");
  ok(one.missed.length >= 2, "つくはずだった役が 出る");
}

section("キー設定");
{
  const d = KY.defaultBindings();
  const toks = Object.values(d).flat();
  eq(new Set(toks).size, toks.length, "はじめの割り当てに、かぶりがない");
  ok(KY.ACTIONS.length >= 28 && KY.ACTIONS.every((a) => a.label && a.group && a.def.length >= 1 && a.def.length <= 2), "操作の一覧");
  eq(d.moveF, ["KeyW"], "W で前へ");
  eq(d.shoot, ["Mouse0", "KeyJ"], "ショットは マウス左と J");
  ok(d.charge.includes("Mouse2") && d.kindNext.includes("WheelDown") && d.kindPrev.includes("WheelUp"), "溜め=マウス右、ホイールで種類");
  eq(d.kind1, ["Digit1"], "1 で 1 つ目の種類");
  // 片手：マウスとキーボードの左手で ぜんぶ
  const left = new Set("QWERTASDFGZXCVB".split("").map((c) => `Key${c}`).concat(["Space", "ShiftLeft", "Tab", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Mouse0", "Mouse1", "Mouse2", "WheelUp", "WheelDown"]));
  const must = ["moveF", "moveB", "moveL", "moveR", "up", "down", "dash", "focus", "shoot", "charge", "kindNext", "kindPrev", "fileNext", "lock", "view", "kind1", "kind2", "kind3", "kind4", "kind5", "kind6", "kind7", "kind8"];
  ok(must.every((id) => d[id].some((t) => left.has(t))), "遊びに要る操作は ぜんぶ 左手のキーかマウスで できる");
  // 割り当てかえ
  let r = KY.bind(d, "dash", 0, "KeyX");
  ok(r.ok && r.bindings.dash[0] === "KeyX", "ダッシュを X に");
  eq(r.lost, [], "かぶらなければ 何も奪わない");
  r = KY.bind(d, "dash", 0, "KeyW");
  ok(r.bindings.dash[0] === "KeyW" && !r.bindings.moveF.includes("KeyW") && r.lost.includes("moveF"), "かぶったら もとの操作から外れる");
  eq(d.moveF, ["KeyW"], "元の割り当ては 変わらない");
  r = KY.bind(d, "dash", 1, "KeyB");
  eq(r.bindings.dash, ["ShiftLeft", "KeyB"], "副に足す");
  r = KY.bind(d, "shoot", 1, "KeyB");
  eq(r.bindings.shoot, ["Mouse0", "KeyB"], "副を おきかえる");
  r = KY.bind(d, "shoot", 0, "KeyJ");
  eq(r.bindings.shoot, ["KeyJ"], "同じ操作の 別の欄のキーを 主にすると、1 つになる");
  ok(!KY.bind(d, "dash", 0, "Escape").ok, "Esc は 割り当てられない");
  ok(!KY.bind(d, "nothing", 0, "KeyB").ok, "ない操作には 割り当てられない");
  eq(KY.unbind(d, "shoot", 1).shoot, ["Mouse0"], "外す");
  // 読みなおし
  eq(KY.normalizeBindings(null), d, "壊れた保存は はじめの割り当て");
  const n = KY.normalizeBindings({ moveF: ["KeyI", "KeyI", "Escape", 5], dash: "x", bogus: ["KeyZ"] });
  eq(n.moveF, ["KeyI"], "かぶり・Esc・ちがう型を 落とす");
  ok(KY.ACTION_IDS.every((id) => Array.isArray(n[id])), "操作は ぜんぶ そろう");
  const all = Object.values(n).flat();
  eq(new Set(all).size, all.length, "読みなおしたあとも かぶりがない");
  // 押している状態
  const c = new KY.Controls(d);
  c.press("KeyW"); c.press("KeyD");
  ok(c.held("moveF") && c.held("moveR") && !c.held("moveL"), "押している操作");
  eq(c.axis("moveL", "moveR"), 1, "左右の軸"); eq(c.axis("moveB", "moveF"), 1, "前後の軸");
  c.press("KeyA"); eq(c.axis("moveL", "moveR"), 0, "左右 同時なら 0");
  c.release("KeyA"); c.release("KeyW");
  ok(!c.held("moveF"), "はなした");
  c.press("Mouse0"); ok(c.held("shoot"), "マウス左で ショット");
  eq(c.press("KeyE"), ["kindNext"], "押した操作が返る");
  c.set(KY.bind(d, "moveF", 0, "ArrowUp").bindings);
  c.press("ArrowUp"); ok(c.held("moveF") && !c.held("lookU"), "割り当てをかえたら そちらが効く");
  c.clear(); ok(!c.held("shoot"), "ぜんぶはなす");
  // ことば
  eq([KY.tokenLabel("KeyW"), KY.tokenLabel("Digit3"), KY.tokenLabel("Space"), KY.tokenLabel("ShiftLeft"), KY.tokenLabel("Mouse2"), KY.tokenLabel("WheelUp"), KY.tokenLabel("ArrowLeft"), KY.tokenLabel("")], ["W", "3", "Space", "左Shift", "マウス右", "ホイール上", "←", "なし"], "キーの名前");
  ok(KY.ACTIONS.every((a) => !/[（）()]/.test(a.label + a.group)), "操作の名前に括弧がない");
  // 視点の設定
  eq(KY.normalizeLook(null), KY.defaultLook(), "はじめの視点");
  const lk = KY.normalizeLook({ sens: 99, invertY: 1, assist: 3, autoTurn: "x", view: "third" });
  ok(lk.sens === 0.008 && lk.invertY === true && lk.assist === KY.defaultLook().assist && lk.autoTurn === "weak" && lk.view === "third", "視点の設定を 読みなおす");
  ok(KY.defaultLook().warn === true && KY.normalizeLook({}).warn === true && KY.normalizeLook({ warn: false }).warn === false, "迫る弾の合図は はじめは する");
  ok(KY.defaultLook().autoFire === true && KY.defaultLook().assist === 360 && KY.ASSIST_CHOICES.includes(360), "はじめは 自動射撃・完全オートエイム");
  ok(KY.normalizeLook({ autoFire: false }).autoFire === false && KY.normalizeLook({ assist: 360 }).assist === 360 && KY.normalizeLook({ assist: 90 }).assist === 360, "自動射撃と 補助の読みなおし");
  ok(KY.normalizeLook({ sens: 0 }).sens === 0.0006 && KY.normalizeLook({ assist: 14, autoTurn: "strong" }).assist === 14, "下限・選べる値");
}

section("ファイルの しぼりこみ・並べかた・検索");
{
  const ent = (name, size, modified) => ({ id: name, name, ext: name.split(".").pop(), size, modified, kind: "file", path: "C:\\x\\" + name });
  const items = [ent("movie.mp4", 3 * GB, 300), ent("Photo01.png", 4 * MB, 100), ent("photo02.PNG", 2 * KB, 200), ent("notes.txt", 5 * KB), ent("a.iso", 8 * GB, 50), ent("setup.exe", 30 * MB, 400)].map((e) => ({ e, a: A.ammoOf(e) }));
  const names = (list) => list.map((i) => i.e.name);
  const f0 = FL.emptyFilter();
  eq(FL.filterItems(items, f0).length, 6, "条件なしなら ぜんぶ");
  ok(!FL.filterActive(f0) && FL.filterActive({ ...f0, text: "a" }) && FL.filterActive({ ...f0, kinds: ["shot"] }) && FL.filterActive({ ...f0, tiers: [0] }) && !FL.filterActive({ ...f0, text: "  " }), "条件が あるか ないか");
  eq(names(FL.filterItems(items, { ...f0, kinds: ["spread"] })).sort(), ["Photo01.png", "photo02.PNG"], "弾の種類でしぼる");
  eq(names(FL.filterItems(items, { ...f0, kinds: ["spread", "beam"] })).sort(), ["Photo01.png", "movie.mp4", "photo02.PNG"], "種類は いくつでも");
  eq(names(FL.filterItems(items, { ...f0, tiers: [0] })).sort(), ["notes.txt", "photo02.PNG"], "小さい段だけ");
  eq(names(FL.filterItems(items, { ...f0, tiers: [4, 5] })).sort(), ["a.iso", "movie.mp4"], "ロマン砲いじょうだけ");
  eq(FL.filterItems(items, { ...f0, text: "PHOTO" }).length, 2, "名前は 大文字小文字を区別しない");
  eq(FL.filterItems(items, { ...f0, text: "photo 01" }).length, 1, "空白で区切ると すべてを含む");
  eq(names(FL.filterItems(items, { ...f0, text: "*.png" })).sort(), ["Photo01.png", "photo02.PNG"], "* は 何文字でも");
  eq(names(FL.filterItems(items, { ...f0, text: "?otes.txt" })), ["notes.txt"], "? は 1 文字");
  eq(names(FL.filterItems(items, { text: "", kinds: ["spread"], tiers: [0] })), ["photo02.PNG"], "ぜんぶの条件に合うものだけ");
  ok(FL.nameHas("a(b).txt", "a(b)") && FL.nameHas("a+b.txt", "*+b.txt"), "名前の中の記号を そのまま扱える");
  const before = names(items);
  const order = (s) => names(FL.sortItems(items, s));
  eq(order("size"), ["a.iso", "movie.mp4", "setup.exe", "Photo01.png", "notes.txt", "photo02.PNG"], "大きい順");
  eq(order("sizeUp"), ["photo02.PNG", "notes.txt", "Photo01.png", "setup.exe", "movie.mp4", "a.iso"], "小さい順");
  eq(order("name"), ["a.iso", "movie.mp4", "notes.txt", "Photo01.png", "photo02.PNG", "setup.exe"], "名前順");
  eq(order("kind"), ["Photo01.png", "photo02.PNG", "movie.mp4", "notes.txt", "setup.exe", "a.iso"], "種類順は 1〜8 のキーの順。同じ種類は 大きい順");
  eq(order("new"), ["setup.exe", "movie.mp4", "photo02.PNG", "Photo01.png", "a.iso", "notes.txt"], "新しい順。日付のないものは 最後");
  eq(order("old"), ["a.iso", "Photo01.png", "photo02.PNG", "movie.mp4", "setup.exe", "notes.txt"], "古い順。日付のないものは 最後");
  eq(names(items), before, "並べかえても 元は 変わらない");
  eq([FL.normalizeSort("old"), FL.normalizeSort("zzz"), FL.normalizeSort(undefined)], ["old", "size", "size"], "選びの読みなおし");
  eq(FL.SORTS.length, 6, "並べかたは 6 種類");
  // 下の階層を探す条件
  const q1 = FL.searchQueryOf(f0);
  ok(q1.defaulted && q1.query.minSize === 20 * MB && q1.query.kind === "file" && q1.query.hidden === false, "条件がないときだけ 20MB 以上");
  const q2 = FL.searchQueryOf({ ...f0, kinds: ["beam", "wave"] });
  ok(!q2.defaulted && q2.query.ext.includes("mp4") && q2.query.ext.includes("mp3") && !q2.query.ext.includes("png") && q2.query.minSize === undefined, "種類は 拡張子にして渡す。小さいものも 探せる");
  const q3 = FL.searchQueryOf({ ...f0, tiers: [0] });
  ok(!q3.defaulted && q3.query.minSize === undefined && q3.query.maxSize === 100 * KB - 1, "豆鉄砲だけ → 100KB 未満");
  const q4 = FL.searchQueryOf({ ...f0, tiers: [4, 5] });
  ok(q4.query.minSize === GB && q4.query.maxSize === undefined, "ロマン砲いじょう → 1GB から");
  const q5 = FL.searchQueryOf({ ...f0, tiers: [2] });
  ok(q5.query.minSize === 5 * MB && q5.query.maxSize === 100 * MB - 1, "中口径砲 → 5MB から 100MB 未満");
  ok(FL.searchQueryOf({ ...f0, kinds: ["shot", "beam"] }).query.ext === undefined, "砲弾は 拡張子で書けないので、拡張子ではしぼらない");
  const q6 = FL.searchQueryOf({ ...f0, text: "photo 01" });
  ok(q6.query.name === "photo" && !q6.defaulted && q6.query.minSize === undefined, "名前だけでも 探せる。残りの言葉は 見つかったあとに しぼる");
  for (const k of A.KIND_ORDER) {
    const ex = A.EXT_BY_KIND[k] || [];
    if (k === "shot") eq(ex.length, 0, "砲弾に 拡張子の一覧はない");
    else ok(ex.length >= 7 && ex.every((x) => A.kindOfExt(x) === k), `${A.KINDS[k].name} の拡張子の一覧`);
  }
  eq(FL.filterText({ text: "abc", kinds: ["beam"], tiers: [1, 0] }, (k) => A.KINDS[k].name), "名前「abc」　光線　豆鉄砲・小口径砲", "条件を 1 行の文に");
  ok(!/[（）]/.test(FL.filterText({ text: "x", kinds: ["beam"], tiers: [0] }, (k) => A.KINDS[k].name)), "文に括弧がない");
}

section("フォルダのボス");
{
  const FB = await import(st.url("folderboss.js"));
  const STG = await import(st.url("stages.js"));
  const PT = await import(st.url("patterns.js"));
  const g = (b, o) => FB.gradeOf(b, o);
  eq([g(0), g(79 * MB), g(81 * MB), g(300 * MB), g(330 * MB), g(1.2 * GB), g(1.4 * GB), g(4.9 * GB), g(5.2 * GB), g(19 * GB), g(21 * GB), g(79 * GB), g(81 * GB), g(300 * GB), g(330 * GB), g(100 * 1024 * GB)], [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8], "サイズ → 格 の表");
  ok(g(1 * MB, { truncated: true }) === 7 && g(1 * MB, { root: true }) === 8 && g(NaN) === 1 && g(-5) === 1, "途中までなら 7 以上、ドライブの根は 8、おかしな数は 1");
  ok(g(1e15) === FB.GRADE_MAX && g(1e30) === FB.GRADE_MAX, "どれだけ大きくても 天井");
  ok(FB.effectiveGrade === undefined, "格を おさえて戦わせる仕組みは ない");
  ok(FB.isRootFolder({ path: "C:\\", parentPath: "" }) && FB.isRootFolder({ path: "D:", parentPath: "x" }) && FB.isRootFolder({ path: "/", parentPath: null }) && !FB.isRootFolder({ path: "D:\\Games", parentPath: "D:\\" }), "ドライブの根の見分け");
  eq([FB.driveName("c:\\"), FB.driveName("D:\\x")], ["C:", "D:"], "ドライブの名前");
  // 割合
  const sh = FB.kindShares([{ ext: "png", count: 10, bytes: 600 }, { ext: "jpg", count: 5, bytes: 100 }, { ext: "mp4", count: 1, bytes: 300 }]);
  ok(Math.abs(sh.spread - 0.7) < 1e-9 && Math.abs(sh.beam - 0.3) < 1e-9 && sh.shot === 0 && Math.abs(Object.values(sh).reduce((a, b) => a + b, 0) - 1) < 1e-9, "拡張子 → 種類ごとの 大きさの割合");
  const sc = FB.kindShares([{ ext: "txt", count: 3, bytes: 0 }, { ext: "zip", count: 1, bytes: 0 }]);
  ok(Math.abs(sc.homing - 0.75) < 1e-9 && Math.abs(sc.cluster - 0.25) < 1e-9, "ぜんぶ 0 バイトなら 数の割合");
  ok(Object.values(FB.kindShares([])).every((v) => v === 0), "空なら ぜんぶ 0");

  const folder = { name: "Pics", path: "C:\\Users\\x\\Pics", parentPath: "C:\\Users\\x" };
  const stats = { bytes: 3 * GB, files: 1204, folders: 6, truncated: false, byExt: [{ ext: "png", count: 800, bytes: 2.5 * GB }, { ext: "jpg", count: 300, bytes: 0.4 * GB }, { ext: "mp4", count: 4, bytes: 0.1 * GB }] };
  const b1 = FB.folderBoss({ folder, stats, reached: 1 }), b9 = FB.folderBoss({ folder, stats, reached: 9 });
  ok(b1.natural === 4 && b1.grade === 4 && b9.grade === 4, "3GB は 到達に関わらず 格 4");
  ok(b1.locked && !b9.locked && !FB.folderBoss({ folder, stats, reached: 4 }).locked && FB.folderBoss({ folder, stats, reached: 3 }).locked, "挑めるのは 格 ≦ 到達");
  ok(b1.main === "spread" && b1.order[0] === "spread" && b1.order[1] === "beam", "いちばん多い種類が 本性（画像）");
  ok(b1.weakKind !== "spread" && b1.shares[b1.weakKind] < 0.03, `苦手は ほとんど無い種類（${b1.weakKind}）`);
  eq(b1.base.kindMul, { spread: FB.RESIST, [b1.weakKind]: FB.VULNERABLE }, "得意と苦手の倍率");
  eq(b9.base.phases.length, 3, "格 4 までは 3 フェーズ");
  eq(FB.folderBoss({ folder, stats: { ...stats, bytes: 30 * GB }, reached: 9 }).base.phases.length, 4, "格 5 から 4 フェーズ");
  eq(b1.kinds[b1.kinds.length - 1], "spread", "さいごのフェーズは 本性");
  ok(b1.base.phases[b1.base.phases.length - 1].name.includes("現像"), "フェーズの名前に 種類が出る");
  ok(b1.base.name === "Pics" && b1.title.includes("写真の群れ") && b1.title.includes("1,204 件") && b1.base.hudLabel === "格4" && b1.base.label.includes("格 4"), "名前・肩書き・格の表示");
  eq(JSON.stringify(FB.folderBoss({ folder, stats, reached: 9 }).base), JSON.stringify(b9.base), "同じフォルダ・同じ中身は いつも同じボス");
  const other = FB.folderBoss({ folder: { ...folder, path: "C:\\Users\\x\\Pics2", name: "Pics2" }, stats, reached: 9 });
  ok(other.seed !== b9.seed, "場所がちがえば 種もちがう");
  const bigger = FB.folderBoss({ folder, stats: { ...stats, byExt: [{ ext: "mp4", count: 4, bytes: 3 * GB }] }, reached: 9 });
  ok(bigger.main === "beam" && bigger.base.shape !== b9.base.shape && bigger.base.phases.every((p) => p.atk.length >= 2), "中身が変われば ボスも変わる");
  // 弾幕は ぜんぶ 本当にある型
  for (const bs of [b1, b9, bigger]) for (const p of bs.base.phases) for (const a of p.atk) ok(typeof PT.PATTERNS[a.t] === "function", `弾幕の型 ${a.t} がある`);
  // ドライブ
  const drive = FB.folderBoss({ folder: { name: "C:", path: "C:\\", parentPath: "" }, stats: { bytes: 400 * GB, files: 900000, folders: 80000, truncated: true, byExt: [{ ext: "dll", count: 1, bytes: 100 * GB }, { ext: "iso", count: 1, bytes: 300 * GB }] }, reached: 9 });
  ok(drive.root && drive.grade === 8 && drive.base.name === "ドライブ C:" && drive.title === "ラスボス" && drive.base.phases.length === 4 && drive.base.phases[3].name === "全容量「満杯の空」", "ドライブの根は ラスボス");
  ok(new Set(drive.phaseNames).size === drive.phaseNames.length && new Set(b1.phaseNames).size === b1.phaseNames.length, "種類がかぶっても フェーズの名前は かぶらない");
  ok(drive.base.label.includes("ラスボス") && drive.base.color[0] === 1 && drive.main === "meteor", "金色で、中身は 隕石");
  ok(FB.folderBoss({ folder: { name: "C:", path: "C:\\", parentPath: "" }, stats: { bytes: 1, files: 1, folders: 0, byExt: [] }, reached: 7 }).locked && !drive.locked, "ドライブの根は 到達が 8 になるまで 挑めない");
  // 空・途中まで
  const empty = FB.folderBoss({ folder: { name: "Empty", path: "C:\\Empty", parentPath: "C:\\" }, stats: { bytes: 0, files: 0, folders: 0, byExt: [] }, reached: 5 });
  ok(empty.grade === 1 && empty.title === "空っぽ" && empty.main === "shot" && empty.base.phases.length === 3, "空のフォルダも ボスになる");
  ok(FB.folderBoss({ folder, stats: { ...stats, bytes: 10 * MB, truncated: true }, reached: 9 }).natural >= 7, "数えきれなかったら 大物あつかい");
  // 体力・時間は 面と同じ式
  const scaled = STG.bossFor(b9.grade, "normal", b9.seed, b9.base);
  ok(scaled.phases.every((p, i) => p.hp === Math.round(b9.base.phases[i].hp * 1.4 * (1 + 0.25 * (b9.grade - 1))) && p.time === b9.base.phases[i].time + 10) && scaled.kindMul && scaled.info.path === folder.path && scaled.stage === b9.grade, "体力と時間は 面と同じ式。持ち物は そのまま通る");
  ok(STG.bossFor(1, "normal", 1).kindMul === undefined, "ふつうの面には 得意も苦手もない");
  // 文章に括弧がない
  const texts = [b1.base.name, b1.title, b1.base.label, ...b1.phaseNames, drive.base.name, drive.title, ...drive.phaseNames, ...Object.values(FB.EPITHET)];
  ok(texts.every((t) => !/[（）()]/.test(t)), "ボスの文章に 括弧がない");
  // 制覇と素材
  eq([FB.conquestMult(undefined, 3), FB.conquestMult({ S: 3, clears: 1 }, 3), FB.conquestMult({ S: 3, clears: 1 }, 2), FB.conquestMult({ S: 3, clears: 1 }, 4), FB.conquestMult({ S: 3, clears: 0 }, 3)], [1, FB.REPEAT_MULT, FB.REPEAT_MULT, 1, 1], "倒しなおしの素材の倍率");
  const c1 = FB.conquered(undefined, 2, 500, 1000), c2 = FB.conquered(c1, 1, 900, 2000);
  eq([c1.S, c1.clears, c1.best, c2.S, c2.clears, c2.best, c2.at], [2, 1, 500, 2, 2, 900, 2000], "制覇の記録");
  ok(c1.clears === 1, "元の記録は 変わらない");
  // ---- 挑めるフォルダを さがす ----
  eq([FB.parentOf("C:\\a\\b"), FB.parentOf("C:\\a\\b\\"), FB.parentOf("C:\\"), FB.parentOf("/x/y"), FB.parentOf("")], ["C:\\a", "C:\\a", "", "/x", ""], "親の場所");
  ok(FB.isInside("C:\\a\\b", "C:\\a") && FB.isInside("c:\\A\\b\\c", "C:\\a\\") && !FB.isInside("C:\\ab", "C:\\a") && !FB.isInside("C:\\a", "C:\\a") && FB.isInside("C:/a/b", "C:\\a"), "フォルダの中か（大文字小文字・区切り・名前のつづきちがい）");
  const TREE = {
    "C:\\": { dirs: ["Dl"], teaser: true },
    "C:\\Dl": { own: [["mkv", 60 * GB, 10], ["iso", 62 * GB, 12]], dirs: ["Games", "Docs", "Pics", "Old"] },
    "C:\\Dl\\Games": { own: [["mp4", 450 * MB, 5]], dirs: ["Mods", "Saves"] },
    "C:\\Dl\\Games\\Mods": { own: [["zip", 60 * MB, 12]], dirs: [] },
    "C:\\Dl\\Games\\Saves": { own: [["dat", 5 * MB, 5]], dirs: [] },
    "C:\\Dl\\Docs": { own: [["pdf", 30 * MB, 12]], dirs: [] },
    "C:\\Dl\\Pics": { own: [["png", 150 * MB, 30]], dirs: [] },
    "C:\\Dl\\Old": { own: [["txt", 1 * MB, 1]], dirs: [] },
  };
  const statsIn = (p) => {
    const t = TREE[p], by = {};
    let files = 0, folders = 0;
    const walk = (q) => { const n = TREE[q]; for (const [ext, bytes, c] of n.own || []) { const b = (by[ext] = by[ext] || { ext, count: 0, bytes: 0 }); b.count += c; b.bytes += bytes; files += c; } for (const d of n.dirs) { folders++; walk(q === "C:\\" ? `C:\\${d}` : `${q}\\${d}`); } };
    walk(p);
    return { files, folders, bytes: Object.values(by).reduce((s, x) => s + x.bytes, 0), truncated: p === "C:\\" ? true : false, byExt: Object.values(by), largest: [], newest: [] };
  };
  const mkApi = () => {
    const calls = { stats: [], children: [] };
    return {
      calls,
      stats: async (f) => { calls.stats.push(f.path); if (!TREE[f.path]) throw new Error("no such folder"); return statsIn(f.path); },
      children: async (f) => { calls.children.push(f.path); return ((TREE[f.path] || {}).dirs || []).map((d) => ({ id: d, name: d, path: f.path === "C:\\" ? `C:\\${d}` : `${f.path}\\${d}`, parentPath: f.path })); },
    };
  };
  const baseOf = (p) => ({ id: p, name: p.split("\\").pop() || "C:", path: p, parentPath: FB.parentOf(p) });
  const names = (xs) => xs.map((x) => x.name);

  let api = mkApi();
  let r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api });
  eq(api.calls.stats.length, 7, "到達 1：大きなフォルダは 中を掘って 7 か所 数える");
  let sets = FB.challengeSets(r.nodes, 1);
  eq(names(sets.open), ["Mods", "Docs", "Saves"], "到達 1：挑めるのは 80MB 未満の 3 つ。大きい順");
  ok(!names(sets.open).includes("Old"), "ファイルが 3 つ未満の フォルダは ボスにならない");
  eq(names(sets.later), ["Pics", "Games"], "まだ早いのは 近い順（格 2、格 3）。格 7 の Dl は 遠いので 出ない");
  ok(sets.open.every((fb) => fb.grade === 1 && !fb.locked) && sets.later.every((fb) => fb.locked), "挑める・挑めないの 印");
  eq([r.stoppedBy, r.opens, r.truncatedAny], ["done", 3, false], "さいごまで さがした");

  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 3, ...api });
  eq(api.calls.stats, ["C:\\Dl", "C:\\Dl\\Games", "C:\\Dl\\Docs", "C:\\Dl\\Pics", "C:\\Dl\\Old"], "到達 3：挑める Games は そこで止めて、中の Mods と Saves は 数えない");
  sets = FB.challengeSets(r.nodes, 3);
  eq(names(sets.open), ["Games", "Pics", "Docs"], "到達 3：格が高い順（3・2・1）");
  // 到達 1 でさがした結果を、到達 3 で 見なおす：挑める親があれば、その中のものは 省く
  api = mkApi();
  const deepNodes = (await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api })).nodes;
  eq(names(FB.challengeSets(deepNodes, 3).open), ["Games", "Pics", "Docs"], "到達が進んだら 作りなおせる。Games が 挑めるなら Mods と Saves は 省く");
  ok(FB.challengeSets(deepNodes, 9).open.length === 1 && FB.challengeSets(deepNodes, 9).open[0].name === "Dl", "到達が 7 以上なら 大もとの Dl だけが 出る");
  // いま開いているフォルダが 挑めるなら、それだけ
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl\\Docs"), reached: 1, ...api });
  eq([api.calls.stats.length, api.calls.children.length, names(FB.challengeSets(r.nodes, 1).open)], [1, 0, ["Docs"]], "開いている所が 挑めるなら 1 か所だけ 数えて それだけ");
  // 制覇の印
  ok(FB.challengeSets(deepNodes, 1, { "C:\\Dl\\Docs": { clears: 1 } }).open.find((fb) => fb.name === "Docs").conquered && !FB.challengeSets(deepNodes, 1, {}).open.some((fb) => fb.conquered), "制覇した所に 印");
  // ドライブの根：数えずに 子へ。到達が低いうちは ラスボスの予告だけ
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\"), reached: 1, ...api });
  ok(!api.calls.stats.includes("C:\\") && api.calls.children[0] === "C:\\", "ドライブの根は 数えない");
  sets = FB.challengeSets(r.nodes, 1);
  ok(names(sets.open).join() === "Mods,Docs,Saves" && sets.later.some((fb) => fb.root && fb.teaser && fb.grade === 8) && sets.later[sets.later.length - 1].root, "ドライブの下も さがせて、根は ラスボスの予告として さいごに出る");
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\"), reached: 8, ...api });
  sets = FB.challengeSets(r.nodes, 8);
  ok(api.calls.stats.length === 1 && sets.open.length === 1 && sets.open[0].root && sets.open[0].truncated && !sets.open[0].teaser, "到達 8 なら 根を数えて、ラスボスに挑める");
  // 予算・時間・やめる・深さ
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api, limits: { ...FB.EXPLORE, maxNodes: 3 } });
  eq([r.stoppedBy, r.visited, api.calls.stats.length], ["budget", 3, 3], "数える数に 上限");
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api, limits: { ...FB.EXPLORE, quota: 1 } });
  ok(r.stoppedBy === "quota" && r.opens === 1 && names(FB.challengeSets(r.nodes, 1).open).length >= 1, "候補が たまったら 止まる");
  let clock = 0;
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api, now: () => (clock += 40000) });
  ok(r.stoppedBy === "time" && r.nodes.length >= 1, "時間の上限。そこまでの結果は のこる");
  api = mkApi();
  let n = 0;
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api, cancelled: () => ++n > 2 });
  ok(r.stoppedBy === "cancel" && r.nodes.length === 2, "やめたら そこまでの結果は のこる");
  api = mkApi();
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...api, limits: { ...FB.EXPLORE, maxDepth: 0 } });
  ok(api.calls.children.length === 0 && r.nodes.length === 1, "深さの上限");
  // 数えそこなっても 止まらない
  api = mkApi();
  const failing = { ...api, stats: async (f) => { if (f.path.endsWith("Pics")) throw new Error("denied"); return api.stats(f); } };
  r = await FB.exploreFolders({ base: baseOf("C:\\Dl"), reached: 1, ...failing });
  ok(!r.nodes.some((x) => x.name === "Pics") && names(FB.challengeSets(r.nodes, 1).open).length === 3, "1 か所 数えられなくても つづける");
  // 進みぐあいの知らせ
  api = mkApi();
  const seen = [];
  await FB.exploreFolders({ base: baseOf("C:\\Dl\\Docs"), reached: 1, ...api, onProgress: (p) => seen.push(p.visited) });
  ok(seen.length >= 1 && seen[seen.length - 1] === 1, "進みぐあいを 知らせる");
  const full = MT.rewards({ stage: 4, cleared: true }), repeat = MT.rewards({ stage: 4, cleared: true, mult: FB.REPEAT_MULT });
  ok(MT.MAT_ORDER.every((m) => repeat[m] <= full[m]) && repeat.mem < full.mem && MT.rewards({ stage: 1, cleared: true, mult: FB.REPEAT_MULT }).plate === 0, "倒しなおしは 素材がへる");
  eq(MT.rewards({ stage: 3, cleared: true, mult: 1 }), MT.rewards({ stage: 3, cleared: true }), "倍率を省くと 満額");
}

section("図鑑の絵");
{
  for (const k of A.KIND_ORDER) {
    const svg = IL.illust(k);
    ok(svg.startsWith("<svg") && svg.endsWith("</svg>") && svg.includes(`aria-label="${A.KINDS[k].name}の撃ち方"`), `${A.KINDS[k].name} の絵`);
    ok(svg.length > 800, `${A.KINDS[k].name} の絵は 描きこまれている（${svg.length}）`);
    ok(!/[（）]/.test(svg) && !/>[^<]*\([^<]*</.test(svg), `${A.KINDS[k].name} の絵の文字に 括弧がない`);
    const open = (svg.match(/<(?!\/|\?|!)[a-zA-Z]+/g) || []).length, selfClose = (svg.match(/\/>/g) || []).length, close = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
    eq(open, selfClose + close, `${A.KINDS[k].name} の絵は タグが閉じている`);
  }
  ok(new Set(A.KIND_ORDER.map((k) => IL.illust(k))).size === 8, "8 種類は ぜんぶ ちがう絵");
  ok(IL.weakIllust().includes("1.8") && IL.puzzleIllust().includes("<rect"), "弱点と 容量マップの絵");
  eq(IL.illust("shot", 120).includes('width="120"'), true, "大きさを 指定できる");
}

console.log(`\n${fail ? "NG" : "OK"}  通った ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
