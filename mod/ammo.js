// ファイル → 弾。名前・拡張子・大きさだけで決まる（ファイルの中身は読まない）。同じファイルは、いつでも同じ砲。
import { logCurve, hashStr, fmtSize } from "./math.js";

export { fmtSize };
export const KB = 1024, MB = KB * 1024, GB = MB * 1024;

// 大きさの段。段が上がるほど、ロマン砲
export const TIERS = [
  { name: "豆鉄砲", min: 0 },
  { name: "小口径砲", min: 100 * KB },
  { name: "中口径砲", min: 5 * MB },
  { name: "大口径砲", min: 100 * MB },
  { name: "ロマン砲", min: 1 * GB },
  { name: "超ロマン砲", min: 10 * GB },
];
export const TIER_COLORS = ["#8b949e", "#57ab5a", "#4c9be8", "#a371f7", "#f0883e", "#f85149"];
export const tierOf = (bytes) => {
  let t = 0;
  for (let i = 1; i < TIERS.length; i++) if (bytes >= TIERS[i].min) t = i;
  return t;
};

// 大きさ → 威力・溜めの秒数・見た目と爆発の大きさ（対数でなめらかにつなぐ）
export const dmgOf = logCurve([[KB, 18], [100 * KB, 40], [5 * MB, 110], [100 * MB, 300], [GB, 800], [10 * GB, 2200], [100 * GB, 4500]]);
export const chargeOf = logCurve([[KB, 0.18], [100 * KB, 0.32], [5 * MB, 0.75], [100 * MB, 1.4], [GB, 2.4], [10 * GB, 3.8], [100 * GB, 5.0]]);
export const scaleOf = logCurve([[KB, 0.5], [100 * KB, 0.7], [5 * MB, 1.0], [100 * MB, 1.6], [GB, 2.4], [10 * GB, 3.6], [100 * GB, 4.6]]);
// マガジンの盤で 占めるマス数
export const cellsOf = (bytes) => Math.max(1, Math.round(logCurve([[KB, 1], [100 * KB, 2], [5 * MB, 3], [100 * MB, 5], [GB, 8], [10 * GB, 12], [100 * GB, 16]])(bytes)));

// 種類。拡張子から決まる。rgb は 0〜1、color は画面用
export const KINDS = {
  shot: { name: "砲弾", glyph: "砲", rgb: [1.0, 0.82, 0.3], color: "#f2c94c", dmgMul: 1.0, desc: "遠くから撃つほど強い狙撃。弾を貫いて消しながら進む" },
  spread: { name: "散弾", glyph: "散", rgb: [1.0, 0.45, 0.7], color: "#ff73b3", dmgMul: 1.0, desc: "近づくほど強い散弾。上下にも広がる" },
  beam: { name: "光線", glyph: "光", rgb: [0.3, 0.95, 1.0], color: "#4df2ff", dmgMul: 1.1, desc: "撃つ間は動けないが、照準で向きを自由に変えられる。通り道の弾を焼き払う" },
  wave: { name: "音波", glyph: "波", rgb: [0.45, 1.0, 0.55], color: "#73ff8c", dmgMul: 0.7, desc: "自分を包むバリア。入った弾を消して、弾き返してダメージにする" },
  homing: { name: "誘導弾", glyph: "追", rgb: [0.7, 0.8, 1.0], color: "#b3ccff", dmgMul: 1.15, desc: "勇者を狙う弾を先に撃ち落とす。撃ち落としてもダメージは入る" },
  cluster: { name: "集束弾", glyph: "束", rgb: [1.0, 0.6, 0.25], color: "#ff9940", dmgMul: 1.0, desc: "ゆっくり飛ぶ爆弾。もう一度 溜めるキーで、その場で起爆。破片がボスを追う" },
  blast: { name: "爆裂弾", glyph: "爆", rgb: [1.0, 0.3, 0.3], color: "#ff4d4d", dmgMul: 1.15, desc: "高く打ち上げて、ボスの真上から落とす。大爆発で弾を消す" },
  meteor: { name: "隕石", glyph: "星", rgb: [0.75, 0.5, 1.0], color: "#bf80ff", dmgMul: 1.05, desc: "空から降らせる。いつも上から当たる。高い層の弾も消す" },
};

// キー 1〜8 の順番
export const KIND_ORDER = ["shot", "spread", "beam", "wave", "homing", "cluster", "blast", "meteor"];

const EXT = {};
// 図鑑に出す、その種類になる拡張子の例
export const EXT_LIST = { shot: "上のどれでもないもの" };
// 検索に渡す、その種類の拡張子ぜんぶ（砲弾は 上のどれでもないものなので、ない）
export const EXT_BY_KIND = {};
const reg = (kind, list) => { EXT_LIST[kind] = list.split(" ").slice(0, 8).join("　"); EXT_BY_KIND[kind] = list.split(" "); list.split(" ").forEach((x) => (EXT[x] = kind)); };
reg("spread", "jpg jpeg png gif webp bmp svg heic heif ico tif tiff avif raw psd ai");
reg("beam", "mp4 mkv mov avi webm wmv flv m4v mpg mpeg m2ts");
reg("wave", "mp3 wav flac m4a ogg aac wma opus mid midi");
reg("homing", "doc docx pdf txt md rtf ppt pptx xls xlsx csv odt epub log");
reg("cluster", "zip rar 7z tar gz bz2 xz cab tgz");
reg("blast", "exe msi apk app bat cmd ps1 jar com scr dmg");
reg("meteor", "iso img vhd vhdx vmdk wim bin dat db sql bak ova mdf pak");
export const kindOfExt = (ext) => EXT[(ext || "").toLowerCase()] || "shot";

// 武器庫の1行（Entry）から、撃てる弾を作る
export function ammoOf(e) {
  const bytes = Math.max(0, Number(e.size) || 0);
  const kind = kindOfExt(e.ext);
  const k = KINDS[kind];
  return {
    key: e.id || String(e.path || e.name).toLowerCase(),
    name: e.name,
    ext: e.ext || "",
    bytes,
    kind,
    tier: tierOf(bytes),
    dmg: Math.round(dmgOf(bytes) * k.dmgMul),
    charge: Math.round(chargeOf(bytes) * 100) / 100,
    scale: Math.round(scaleOf(bytes) * 100) / 100,
    cells: cellsOf(bytes),
    seed: hashStr(e.name),
  };
}
