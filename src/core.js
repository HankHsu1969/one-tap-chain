/* ===== 核心規則（純函式，不碰畫面）=====
   每一關只能點一次。所有炸彈都爆炸才算過關；剩下的東西越少分數越高，全部清光最高。 */
let W = 5, H = 5, N = 25;                       // 盤面大小會跟著關卡變
function setGrid(w, h) { W = w; H = h; N = w * h; }
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 上 右 下 左
const BASE = { bomb: 10, arrow: 10, cross: 10, link: 10, gem: 30, crate: 5, iron: 15 };
const ACTIVE = { bomb: true, arrow: true, cross: true, link: true };
const LEVELS = 50;
const SIZES = [[5, 5], [6, 6], [6, 7], [7, 8], [8, 9]];   // 每 10 關換一種盤面
const zoneOf = L => Math.min(SIZES.length - 1, Math.floor((L - 1) / 10));

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function countLeft(board) { let n = 0; for (let j = 0; j < N; j++) if (board[j]) n++; return n; }
function countBombs(board) { let n = 0; for (let j = 0; j < N; j++) if (board[j] && board[j].t === 'bomb') n++; return n; }
function deviceList(board) { const d = []; for (let j = 0; j < N; j++) if (board[j] && ACTIVE[board[j].t]) d.push(j); return d; }

/* 從 start 引爆。回傳每一波發生的事、連鎖得分、引爆後的盤面 after。不會改動傳入的 board。 */
function simulate(board, start) {
  const present = board.slice();
  const waves = [];
  let wave = [start], k = 0, score = 0, count = 0;
  while (wave.length) {
    k++;
    const items = [];
    for (const i of wave) {
      const o = present[i];
      if (o.t === 'iron' && (o.hp || 2) > 1) {          // 石塊第一下只會裂開
        const pts = 5 * k; score += pts;
        present[i] = { t: 'iron', hp: 1 };
        items.push({ i, o, pts, crack: true });
        continue;
      }
      const pts = BASE[o.t] * k; score += pts; count++;
      items.push({ i, o, pts });
    }
    for (const it of items) if (!it.crack) present[it.i] = null;
    const next = new Set();
    const fx = [];
    for (const it of items) {
      if (it.crack) continue;
      const i = it.i, o = it.o, x = i % W, y = (i / W) | 0;
      if (o.t === 'bomb') {
        const r = o.big ? 2 : 1;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (present[j]) next.add(j);
        }
        fx.push({ k: 'blast', i, r });
      } else if (o.t === 'arrow' || o.t === 'cross') {
        const dirs = o.t === 'arrow' ? [o.d] : o.ax === 'v' ? [0, 2] : [1, 3];      // 雙向盤只打橫向或直向
        for (const d of dirs) {
          let cx = x, cy = y, end = -1, hit = false;
          for (;;) {
            cx += DIRS[d][0]; cy += DIRS[d][1];
            if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
            const j = cy * W + cx; end = j;
            if (present[j]) { next.add(j); hit = true; break; }
          }
          fx.push({ k: 'beam', i, d, to: end, hit });
        }
      } else if (o.t === 'link') {
        for (let j = 0; j < N; j++) if (present[j] && present[j].t === 'link') { next.add(j); fx.push({ k: 'link', i, to: j }); }
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && present[ny * W + nx]) next.add(ny * W + nx);
        }
        fx.push({ k: 'ring', i });
      }
    }
    waves.push({ k, items, fx });
    wave = Array.from(next).sort((a, b) => a - b);
  }
  return { waves, score, count, after: present, k, remaining: countLeft(present), bombsLeft: countBombs(present) };
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
    const r = simulate(board, i);
    out.push({ i, left: r.remaining, bombsLeft: r.bombsLeft, depth: r.waves.length, stars: starsFor(r.bombsLeft, r.remaining), score: finalScore(r.score, total - r.remaining, total),
      hits: r.waves[1] ? r.waves[1].items.map(it => it.i) : [] });
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
  const z = zoneOf(L), p = (L - 1) % 10, size = SIZES[z];
  const bonus = L % 5 === 0;
  const lo = [6, 11, 15, 20, 26][z], hi = [12, 17, 22, 29, 38][z];
  let total = Math.round(lo + (hi - lo) * p / 9);
  if (bonus) total = Math.min(Math.round(size[0] * size[1] * 0.62), total + 3 + z);
  const c = { level: L, zone: z, w: size[0], h: size[1], bonus, total, cross: L >= 4 };
  c.gems = Math.max(1, Math.round(total * 0.16));
  c.crates = L >= 7 ? Math.max(1, Math.round(total * 0.07)) : 0;
  c.links = L >= 14 && (L % 3 === 2 || (bonus && L >= 20)) ? 3 : 0;
  c.dev = total - c.gems - c.crates - c.links;
  c.big = L >= 11 && (L % 2 === 1 || bonus) ? (z >= 3 ? 2 : 1) : 0;
  c.iron = L >= 21 && (L % 2 === 1 || z >= 4) ? 1 : 0;
  c.minBombs = Math.max(2, Math.ceil(c.dev * 0.3));
  return c;
}
/* 這一關第一次出現的新東西（給介紹卡用）*/
function levelIntro(L) {
  return { 4: 'cross', 7: 'crate', 11: 'bigbomb', 14: 'link', 21: 'iron' }[L] || null;
}
/* ---------- 關卡資料：50 關都是事先設計好的（tools/levelgen.js 產生並逐關驗證）----------
   每一關是一串字，一格一個字：
   . 空格　B 炸彈　X 大炸彈　^ > v < 火箭　- 橫向盤　| 直向盤　O 電球　g 寶石　c 木箱　I 石塊 */
let LEVEL_DATA = [];
function setLevels(d) { LEVEL_DATA = d; for (const k in levelCache) delete levelCache[k]; }
const CODE = { B: { t: 'bomb' }, X: { t: 'bomb', big: true }, '^': { t: 'arrow', d: 0 }, '>': { t: 'arrow', d: 1 }, v: { t: 'arrow', d: 2 }, '<': { t: 'arrow', d: 3 },
  '-': { t: 'cross', ax: 'h' }, '|': { t: 'cross', ax: 'v' }, O: { t: 'link' }, g: { t: 'gem' }, c: { t: 'crate' }, I: { t: 'iron', hp: 2 } };
function decodeBoard(str) { return Array.from(str, ch => (CODE[ch] ? Object.assign({}, CODE[ch]) : null)); }
function encodeBoard(board) {
  return board.map(o => !o ? '.' : o.t === 'bomb' ? (o.big ? 'X' : 'B') : o.t === 'arrow' ? '^>v<'[o.d] : o.t === 'cross' ? (o.ax === 'v' ? '|' : '-') : { link: 'O', gem: 'g', crate: 'c', iron: 'I' }[o.t]).join('');
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
  module.exports = { apparentRoots, DIRS, BASE, ACTIVE, LEVELS, SIZES, zoneOf, setGrid, grid: () => ({ W, H, N }), mulberry, simulate, analyze, starsFor, finalScore, levelCfg, levelIntro, genLevel, setLevels, decodeBoard, encodeBoard, countLeft, countBombs, deviceList };
}
