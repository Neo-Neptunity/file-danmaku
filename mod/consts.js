// 世界の大きさと、決まった数字。単位は「メートルのようなもの」。床は y = 0、天井は y = CEIL_Y。場は半径 ARENA_R の円柱
export const ARENA_R = 30;
export const CEIL_Y = 24;
export const Y_MIN = 1.0, Y_MAX = 21;          // 勇者が飛べる高さ
export const START_POS = { x: 0, y: 11, z: 21 };
export const PLAYER_SPEED = 9.5;
export const CLIMB_SPEED = 6.5;
export const FOCUS_MUL = 0.45;
export const PLAYER_R = 0.2;       // 勇者のあたり判定
export const GRAZE_PAD = 0.85;     // かすりの余白
export const BOSS_R = 3.0;
export const BOSS_HOME = { x: 0, y: 11, z: 0 };
export const BOSS_RANGE = { r: 16, y0: 6, y1: 17 };   // ボスが動ける範囲
export const MIN_DIST = 6;         // ボスに近づける限界（3D の距離）
export const MAX_BULLETS = 6000;
export const CULL_R2 = 56 * 56;    // これより遠い弾は消す

// 弾幕の高さの印：low・mid・high はボスの高さからのずれ。floor と ceil は、ほんとうの床と天井のそば
export const LAYER_OFF = { low: -2.6, mid: 0, high: 2.6 };
export const LAYER_ABS = { floor: 0.7, ceil: 21.8 };

// 弱点：当たった点が、ボスの中心から見て 水平から 7 度より上なら『上』、下なら『下』、それ以外は『正面』
export const WEAK_SIN = 0.12;
export const WEAK_MUL = 1.8;
export const WEAK_NAMES = { high: "上", mid: "正面", low: "下" };

// 高度計の目盛り（高さ）
export const GAUGE_MAX = 24;
