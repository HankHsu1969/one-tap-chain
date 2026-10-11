/* ===== 核心規則（純函式，不碰畫面）=====
   每一關只能點一次。所有炸彈都爆炸才算過關；剩下的東西越少分數越高，全部清光最高。 */
let W = 5, H = 5, N = 25;                       // 盤面大小會跟著關卡變
function setGrid(w, h) { W = w; H = h; N = w * h; }
// 0–3 上 右 下 左；4–7 是斜射盤的斜角：右上 右下 左下 左上
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const BASE = { bomb: 10, arrow: 10, cross: 10, link: 10, gem: 30, crate: 5, iron: 15, mirror: 10, key: 20, chest: 50, diag: 10, steel: 25, hole: 20 };
// 鏡子把射線轉 90 度。m=0 是「／」，m=1 是「＼」；索引是射線前進的方向（上右下左），值是轉彎後的方向。斜的射線不會轉彎
const REFLECT = [[1, 0, 3, 2], [3, 2, 1, 0]];
const ACTIVE = { bomb: true, arrow: true, cross: true, link: true, diag: true };
const LEVELS = 100;
const SIZES = [[5, 5], [6, 6], [6, 7], [7, 8], [8, 9]];   // 前 50 關每 10 關換一種盤面，之後固定 8×9
const zoneOf = L => Math.floor((L - 1) / 10);              // 第幾區（每 10 關一區，0 起算）
const sizeOf = z => SIZES[Math.min(SIZES.length - 1, z)];
// 傳送門是盤面上的「地形」：打不壞、不能點，也不算在要清掉的東西裡
const isPiece = o => !!o && o.t !== 'portal';

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function countLeft(board) { let n = 0; for (let j = 0; j < N; j++) if (isPiece(board[j])) n++; return n; }
function countBombs(board) { let n = 0; for (let j = 0; j < N; j++) if (board[j] && board[j].t === 'bomb') n++; return n; }
function deviceList(board) { const d = []; for (let j = 0; j < N; j++) if (board[j] && ACTIVE[board[j].t]) d.push(j); return d; }

/* 從 start 引爆。回傳每一波發生的事、連鎖得分、引爆後的盤面 after。不會改動傳入的 board。
   每一波記下「誰被打到、射線是從哪個方向來的」：鏡子要靠方向決定往哪裡轉彎，鋼箱要靠它分辨是不是射線。
   item 的標記：crack 石塊裂開、locked 寶箱鎖著、shield 鋼箱擋住、lit 定時炸彈點燃（值是第幾波爆）、ticking 已經在倒數，
   這五種會留在原地（stay）；eaten 是被黑洞吞掉，直接消失、不會發動。 */
function simulate(board, start) {
  const present = board.slice();
  const waves = [];
  const gates = [];      // 傳送門，依位置兩兩一對
  for (let j = 0; j < N; j++) if (present[j] && present[j].t === 'portal') gates.push(j);
  const timers = new Map();      // 點燃的定時炸彈：格子 → 第幾波爆炸
  let wave = new Map([[start, []]]), eat = new Set(), k = 0, score = 0, count = 0, eatenBombs = 0;
  while (wave.size || timers.size) {
    k++;
    const due = new Set();      // 這一波輪到爆炸的定時炸彈
    for (const [j, at] of timers) if (at === k) { timers.delete(j); if (present[j]) { due.add(j); if (!wave.has(j)) wave.set(j, []); } }
    const items = [], order = Array.from(wave.keys()).sort((a, b) => a - b);
    // 鑰匙先算：這一波打到鑰匙，同一波的寶箱也打得開
    let keysLeft = 0;
    for (let j = 0; j < N; j++) if (present[j] && present[j].t === 'key' && !wave.has(j)) keysLeft++;
    for (const i of order) {
      const o = present[i], from = wave.get(i);
      if (!o) continue;
      if (eat.has(i) && o.t !== 'steel' && !(o.t === 'chest' && keysLeft > 0)) {      // 黑洞：直接吞掉，不會發動
        const pts = BASE[o.t] * k; score += pts; count++;
        if (o.t === 'bomb') eatenBombs++;
        timers.delete(i);
        items.push({ i, o, pts, eaten: true });
        continue;
      }
      if (o.t === 'bomb' && o.timer && !due.has(i)) {      // 定時炸彈：先點燃，兩波後才爆
        if (timers.has(i)) items.push({ i, o, pts: 0, ticking: true, stay: true });
        else { timers.set(i, k + 2); items.push({ i, o, pts: 0, lit: k + 2, stay: true }); }
        continue;
      }
      if (o.t === 'iron' && (o.hp || 2) > 1) {          // 石塊第一下只會裂開
        const pts = 5 * k; score += pts;
        present[i] = { t: 'iron', hp: 1 };
        items.push({ i, o, pts, crack: true, stay: true });
        continue;
      }
      if (o.t === 'chest' && keysLeft > 0) {            // 鑰匙還在：寶箱鎖著，打了沒反應
        items.push({ i, o, pts: 0, locked: true, stay: true });
        continue;
      }
      if (o.t === 'steel' && !from.length) {            // 鋼箱：炸彈、電球、黑洞都弄不壞，只有射線打得壞
        items.push({ i, o, pts: 0, shield: true, stay: true });
        continue;
      }
      const pts = BASE[o.t] * k; score += pts; count++;
      items.push({ i, o, pts, from });
    }
    for (const it of items) if (!it.stay) present[it.i] = null;
    const next = new Map(), eatNext = new Set();
    const hit = (j, d) => { let a = next.get(j); if (!a) next.set(j, (a = [])); if (d >= 0 && !a.includes(d)) a.push(d); };
    const fx = [];
    const shoot = (i, d, mirror) => {                   // 射線：往 d 方向飛，打中第一個東西；走進傳送門就從另一個門出來，每道射線最多穿一次
      let at = i, cx = i % W, cy = (i / W) | 0, end = -1, got = false, jumped = false;
      for (;;) {
        cx += DIRS[d][0]; cy += DIRS[d][1];
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        const j = cy * W + cx; end = j;
        if (present[j] && present[j].t === 'portal') {
          fx.push({ k: 'beam', i: at, d, to: j, hit: false, gate: true, mirror: !!mirror });
          const p = gates[gates.indexOf(j) ^ 1];
          if (jumped || p === undefined) return;
          jumped = true; at = p; cx = p % W; cy = (p / W) | 0; end = -1;
          continue;
        }
        if (present[j]) { hit(j, d); got = true; break; }
      }
      fx.push({ k: 'beam', i: at, d, to: end, hit: got, mirror: !!mirror, out: jumped });
    };
    for (const it of items) {
      if (it.stay || it.eaten) continue;
      const i = it.i, o = it.o, x = i % W, y = (i / W) | 0;
      if (o.t === 'bomb') {
        const r = o.big ? 2 : 1;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (isPiece(present[j])) hit(j, -1);
        }
        fx.push({ k: 'blast', i, r });
      } else if (o.t === 'arrow' || o.t === 'cross' || o.t === 'diag') {
        const dirs = o.t === 'arrow' ? [o.d] : o.t === 'diag' ? [4, 5, 6, 7] : o.ax === 'v' ? [0, 2] : [1, 3];      // 雙向盤只打橫向或直向
        for (const d of dirs) shoot(i, d);
      } else if (o.t === 'mirror') {                    // 鏡子：直的射線從哪來，就往轉 90 度的方向射出去；被炸到、電到或斜的射線打到只會碎掉
        const ins = (it.from || []).filter(d => d < 4);
        for (const d of ins) shoot(i, REFLECT[o.m][d], true);
        if (!ins.length) it.dud = true;
      } else if (o.t === 'link') {
        for (let j = 0; j < N; j++) if (present[j] && present[j].t === 'link') { hit(j, -1); fx.push({ k: 'link', i, to: j }); }
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && isPiece(present[ny * W + nx])) hit(ny * W + nx, -1);
        }
        fx.push({ k: 'ring', i });
      } else if (o.t === 'hole') {                      // 黑洞：周圍 8 格下一波被吞掉
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && isPiece(present[ny * W + nx])) { eatNext.add(ny * W + nx); hit(ny * W + nx, -1); }
        }
        fx.push({ k: 'hole', i });
      }
    }
    waves.push({ k, items, fx });
    wave = next; eat = eatNext;
  }
  return { waves, score, count, after: present, k, remaining: countLeft(present), bombsLeft: countBombs(present) + eatenBombs };
}
/* 起點真正動作的是第幾波（索引從 0 起）。一般機關是第 0 波；定時炸彈點下去要等兩波才爆 */
function actWave(res, start) {
  for (let w = 0; w < res.waves.length; w++) if (res.waves[w].items.some(it => it.i === start && !it.stay)) return w;
  return 0;
}

/* 星星：炸彈沒全爆 = 0（沒過關）；全爆 = 1；剩 2 個以內 = 2；全部清光 = 3 */
function starsFor(bombsLeft, left) {
  if (bombsLeft > 0) return 0;
  return left === 0 ? 3 : left <= 2 ? 2 : 1;
}
/* 分數：連鎖得分依清掉的比例打折，全部清光再加 50% */
function finalScore(chain, cleared, total) {
  if (!total) return 0;
  return Math.round(chain * (cleared / total) * (cleared >= total ? 1.5 : 1));
}
/* 把每一個能點的機關都試一次 */
function analyze(board) {
  const total = countLeft(board), out = [];
  for (const i of deviceList(board)) {
    const r = simulate(board, i), a = actWave(r, i);
    out.push({ i, left: r.remaining, bombsLeft: r.bombsLeft, depth: r.waves.length, stars: starsFor(r.bombsLeft, r.remaining), score: finalScore(r.score, total - r.remaining, total),
      hits: r.waves[a + 1] ? r.waves[a + 1].items.map(it => it.i) : [] });
  }
  return out;
}

/* 「看起來像源頭」的機關：一開始沒有任何機關直接打得到它。真正的源頭只有一個，其他都是假的 */
function apparentRoots(an) {
  const hit = new Set();
  for (const a of an) for (const j of a.hits) hit.add(j);
  return an.filter(a => !hit.has(a.i)).map(a => a.i);
}

/* ---------- 關卡設定 ---------- */
function levelCfg(L) {
  if (L > 50) return lateCfg(L);
  const z = zoneOf(L), p = (L - 1) % 10, size = SIZES[z];
  const bonus = L % 5 === 0;
  const lo = [6, 11, 15, 20, 26][z], hi = [12, 17, 22, 29, 38][z];
  let total = Math.round(lo + (hi - lo) * p / 9);
  if (bonus) total = Math.min(Math.round(size[0] * size[1] * 0.62), total + 3 + z);
  const c = { level: L, zone: z, w: size[0], h: size[1], bonus, total, cross: L >= 4 };
  c.gems = Math.max(1, Math.round(total * 0.16));
  c.crates = L >= 7 ? Math.max(1, Math.round(total * 0.07)) : 0;
  c.links = L >= 14 && (L % 3 === 2 || (bonus && L >= 20)) ? 3 : 0;
  c.mirrors = z === 3 ? (p < 2 ? 2 : 2 + (L % 2)) : z === 4 ? 1 + (L % 2) : 0;      // 第 31 關起有鏡子
  c.key = z === 4 ? 1 : 0; c.chests = z === 4 ? (bonus ? 2 : 1) : 0;              // 第 41 關起有鑰匙和寶箱
  c.dev = total - c.gems - c.crates - c.links - c.mirrors - c.key - c.chests;
  c.big = L >= 11 && (L % 2 === 1 || bonus) ? (z >= 3 ? 2 : 1) : 0;
  c.iron = L >= 21 && (L % 2 === 1 || z >= 4) ? 1 : 0;
  c.minBombs = Math.max(2, Math.ceil(c.dev * 0.3));
  return c;
}
/* 第 51 關起：盤面固定 8×9，東西更多、舊物件混著出現，每 10 關多一種新物件。
   斜射盤、定時炸彈是機關（數量是最少幾個）；鋼箱、黑洞不能點；傳送門一對，不算在東西的數量裡 */
function lateCfg(L) {
  const z = zoneOf(L), p = (L - 1) % 10, size = sizeOf(z), bonus = L % 5 === 0;
  const lo = 28 + (z - 5) * 2, hi = 38 + (z - 5);
  let total = Math.round(lo + (hi - lo) * p / 9);
  if (bonus) total = Math.min(45, total + 4);
  const c = { level: L, zone: z, w: size[0], h: size[1], bonus, total, cross: true };
  c.gems = Math.max(2, Math.round(total * 0.12));
  c.crates = Math.max(1, Math.round(total * 0.05));
  c.links = L % 3 === 2 || bonus ? 3 : 0;
  c.mirrors = L % 2 ? 2 : 1;
  c.key = L % 2 ? 0 : 1; c.chests = c.key ? (bonus ? 2 : 1) : 0;
  c.diag = L === 51 ? 3 : 2;
  c.steel = L >= 61 ? (L >= 81 ? 3 : 2) : 0;
  c.portals = L >= 71 ? 1 : 0;
  c.timers = L >= 81 ? 2 : 0;
  c.holes = L >= 91 ? (bonus ? 2 : 1) : 0;
  c.dev = total - c.gems - c.crates - c.links - c.mirrors - c.key - c.chests - c.steel - c.holes;
  c.big = L % 2 || bonus ? 2 : 1;
  c.iron = z >= 7 ? 2 : 1;
  c.minBombs = Math.max(2, Math.ceil(c.dev * 0.3));
  return c;
}
/* 這一關第一次出現的新東西（給介紹卡用）*/
function levelIntro(L) {
  return { 4: 'cross', 7: 'crate', 11: 'bigbomb', 14: 'link', 21: 'iron', 31: 'mirror', 41: 'chest', 51: 'diag', 61: 'steel', 71: 'portal', 81: 'timer', 91: 'hole' }[L] || null;
}
/* ---------- 關卡資料：100 關都是事先設計好的（tools/levelgen.js 產生並逐關驗證）----------
   每一關是一串字，一格一個字：
   . 空格　B 炸彈　X 大炸彈　^ > v < 火箭　- 橫向盤　| 直向盤　O 電球　g 寶石　c 木箱　I 石塊
   / \\ 鏡子（兩種斜向）　k 鑰匙　T 寶箱　* 斜射盤　S 鋼箱　P 傳送門（兩個一對）　D 定時炸彈　H 黑洞 */
let LEVEL_DATA = [];
function setLevels(d) { LEVEL_DATA = d; for (const k in levelCache) delete levelCache[k]; }
const CODE = { B: { t: 'bomb' }, X: { t: 'bomb', big: true }, '^': { t: 'arrow', d: 0 }, '>': { t: 'arrow', d: 1 }, v: { t: 'arrow', d: 2 }, '<': { t: 'arrow', d: 3 },
  '-': { t: 'cross', ax: 'h' }, '|': { t: 'cross', ax: 'v' }, O: { t: 'link' }, g: { t: 'gem' }, c: { t: 'crate' }, I: { t: 'iron', hp: 2 },
  '/': { t: 'mirror', m: 0 }, '\\': { t: 'mirror', m: 1 }, k: { t: 'key' }, T: { t: 'chest' },
  '*': { t: 'diag' }, S: { t: 'steel' }, P: { t: 'portal' }, D: { t: 'bomb', timer: true }, H: { t: 'hole' } };
function decodeBoard(str) { return Array.from(str, ch => (CODE[ch] ? Object.assign({}, CODE[ch]) : null)); }
function encodeBoard(board) {
  return board.map(o => !o ? '.' : o.t === 'bomb' ? (o.timer ? 'D' : o.big ? 'X' : 'B') : o.t === 'arrow' ? '^>v<'[o.d] : o.t === 'cross' ? (o.ax === 'v' ? '|' : '-') : o.t === 'mirror' ? (o.m ? '\\' : '/') : { link: 'O', gem: 'g', crate: 'c', iron: 'I', key: 'k', chest: 'T', diag: '*', steel: 'S', portal: 'P', hole: 'H' }[o.t]).join('');
}
const levelCache = {};
function genLevel(L) {
  const cfg = levelCfg(L);
  setGrid(cfg.w, cfg.h);
  if (levelCache[L]) return levelCache[L];
  const d = LEVEL_DATA[L - 1], board = decodeBoard(d.b);
  return (levelCache[L] = { board, W: cfg.w, H: cfg.h, total: countLeft(board), bombs: countBombs(board), solution: [d.s], cfg });
}

if (typeof module !== 'undefined') {
  module.exports = { apparentRoots, actWave, isPiece, DIRS, REFLECT, BASE, ACTIVE, LEVELS, SIZES, zoneOf, sizeOf, setGrid, grid: () => ({ W, H, N }), mulberry, simulate, analyze, starsFor, finalScore, levelCfg, levelIntro, genLevel, setLevels, decodeBoard, encodeBoard, countLeft, countBombs, deviceList };
}
