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
        const dirs = o.t === 'arrow' ? [o.d] : [0, 1, 2, 3];
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
    out.push({ i, left: r.remaining, bombsLeft: r.bombsLeft, depth: r.waves.length, stars: starsFor(r.bombsLeft, r.remaining), score: finalScore(r.score, total - r.remaining, total) });
  }
  return out;
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
  return { 4: 'cross', 5: 'bonus', 7: 'crate', 11: 'bigbomb', 14: 'link', 21: 'iron' }[L] || null;
}
/* 第 1、2 關是手排的教學關（5×5）*/
function handmade(L) {
  const b = new Array(N).fill(null);
  const put = (x, y, o) => { b[y * W + x] = o; };
  if (L === 1) {      // 點任何一顆炸彈都會一路炸到底
    put(0, 1, { t: 'bomb' }); put(1, 1, { t: 'bomb' }); put(2, 1, { t: 'bomb' });
    put(3, 2, { t: 'bomb' }); put(3, 3, { t: 'arrow', d: 2 }); put(3, 4, { t: 'gem' });
    return { board: b, solution: [1 * W + 0] };
  }
  // 第 2 關：點炸彈能過關，但會留下火箭；從火箭開始才清得光
  put(0, 1, { t: 'arrow', d: 1 }); put(3, 1, { t: 'bomb' }); put(3, 2, { t: 'bomb' });
  put(4, 2, { t: 'gem' }); put(2, 3, { t: 'bomb' });
  return { board: b, solution: [1 * W + 0] };
}

/* ---------- 產生盤面：從起點一個接一個「長」出來，所以保證清得光 ---------- */
function buildBoard(cfg, rng) {
  const b = new Array(N).fill(null);
  const ri = n => Math.floor(rng() * n);
  const empties = () => { const e = []; for (let i = 0; i < N; i++) if (!b[i]) e.push(i); return e; };
  const lineCells = (i, d) => {       // 這個方向一路到底都沒東西才回傳
    const out = []; let x = i % W, y = (i / W) | 0;
    for (;;) {
      x += DIRS[d][0]; y += DIRS[d][1];
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (b[y * W + x]) return [];
      out.push(y * W + x);
    }
    return out;
  };
  const around = (i, r, diag) => {
    const x = i % W, y = (i / W) | 0, out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if ((!dx && !dy) || (!diag && dx && dy)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !b[ny * W + nx]) out.push(ny * W + nx);
    }
    return out;
  };
  const targetsOf = i => {
    const o = b[i];
    if (o.t === 'bomb') return around(i, o.big ? 2 : 1, true);
    if (o.t === 'arrow') return lineCells(i, o.d);
    if (o.t === 'cross') { let out = []; for (let d = 0; d < 4; d++) out = out.concat(lineCells(i, d)); return out; }
    if (o.t === 'link') return around(i, 1, false);
    return [];
  };
  const newDevice = (cell, noBomb) => {
    const r = (noBomb ? 5 : 0) + rng() * ((cfg.cross ? 11 : 9) - (noBomb ? 5 : 0));
    const t = r < 5 ? 'bomb' : r < 9 ? 'arrow' : 'cross';
    const o = { t };
    if (t === 'arrow') {
      const ds = [0, 1, 2, 3].filter(d => {
        const x = (cell % W) + DIRS[d][0], y = ((cell / W) | 0) + DIRS[d][1];
        return x >= 0 && y >= 0 && x < W && y < H && !b[y * W + x];
      });
      o.d = ds.length ? ds[ri(ds.length)] : ri(4);
    }
    return o;
  };
  // 開頭幾個常常不是炸彈：這樣「點炸彈能過關，但從源頭點才清得光」
  const lead = cfg.bonus ? ri(2) : ri(4);
  const root = ri(N);
  b[root] = newDevice(root, lead > 0);
  const chain = [root];
  let dev = 1, links = 0, bigLeft = cfg.big, guard = 0, placed = 1;
  const passives = [];
  for (let g = 0; g < cfg.gems; g++) passives.push('gem');
  for (let g = 0; g < cfg.crates; g++) passives.push('crate');
  const want = cfg.dev + passives.length + cfg.links;
  while (placed < want && guard++ < 600) {
    const e = rng() < 0.6 ? chain[chain.length - 1] : chain[ri(chain.length)];
    const ts = targetsOf(e);
    if (!ts.length) continue;
    const cell = ts[ri(ts.length)];
    const devLeft = cfg.dev - dev, pasLeft = passives.length, linkLeft = cfg.links - links;
    const roll = rng() * (devLeft * 1.6 + pasLeft + (linkLeft > 0 && links === 0 ? 1.2 : 0));
    if (roll < devLeft * 1.6) {
      const o = newDevice(cell, dev < lead);
      if (o.t === 'bomb' && bigLeft > 0 && rng() < 0.4) { o.big = true; bigLeft--; }
      b[cell] = o; chain.push(cell); dev++; placed++;
    } else if (roll < devLeft * 1.6 + pasLeft) {
      b[cell] = { t: passives.splice(ri(passives.length), 1)[0] }; placed++;
    } else {
      // 電球：這一顆被打到，其他幾顆散在別處一起放電，連鎖再從那些電球往外長
      b[cell] = { t: 'link' }; chain.push(cell); links++; placed++;
      while (links < cfg.links) {
        const em = empties(); if (!em.length) break;
        const c2 = em[ri(em.length)]; b[c2] = { t: 'link' }; chain.push(c2); links++; placed++;
      }
    }
  }
  return { board: b, root };
}

const levelCache = {};
function genLevel(L) {
  const cfg = levelCfg(L);
  setGrid(cfg.w, cfg.h);
  if (levelCache[L]) return levelCache[L];
  let out;
  const pack = (board, solution, extra) => Object.assign({ board, W: cfg.w, H: cfg.h, total: countLeft(board), bombs: countBombs(board), solution, cfg, fallback: false }, extra || {});
  if (L <= 2) {
    const hm = handmade(L);
    out = pack(hm.board, hm.solution);
  } else {
    const rng = mulberry(L * 7919 + 13);
    const need = levelIntro(L);
    let pick = null, pickScore = -Infinity, tries = 0, valid = 0;
    const t0 = Date.now();
    while (tries++ < 6000 && valid < 40 && (Date.now() - t0 < 250 || !pick)) {
      const { board, root } = buildBoard(cfg, rng);
      const total = countLeft(board);
      if (total < cfg.total - 1) continue;
      if (countBombs(board) < cfg.minBombs) continue;
      // 介紹新機關的那一關，盤面上一定要有它
      if (need === 'bigbomb' ? !board.some(o => o && o.big) : (need === 'cross' || need === 'crate' || need === 'link') && !board.some(o => o && o.t === need)) continue;
      if (simulate(board, root).remaining !== 0) continue;        // 從起點點下去要能全部清光
      // 石塊：把一個木箱或寶石換成要打兩次的石塊，還清得光才換
      if (cfg.iron) {
        let done = 0;
        for (let j = 0; j < N && done < cfg.iron; j++) {
          if (board[j] && (board[j].t === 'crate' || board[j].t === 'gem')) {
            const keep = board[j]; board[j] = { t: 'iron', hp: 2 };
            if (simulate(board, root).remaining === 0) done++; else board[j] = keep;
          }
        }
        if (!done) continue;
      }
      // 評分：連鎖要夠深；能拿三星的點法不要太多；最好有「能過關但清不光」的點法
      const an = analyze(board), n = an.length;
      const perfect = an.filter(a => a.stars === 3).length, pass = an.filter(a => a.stars >= 1).length;
      const depth = simulate(board, root).waves.length;
      const fp = perfect / n, wantFp = cfg.bonus ? 0.35 : Math.max(0.07, 0.4 - L * 0.012);
      const wantPass = cfg.bonus ? 0.7 : Math.max(0.3, 0.75 - L * 0.012);
      const sc = depth * 0.4 - Math.abs(fp - wantFp) * 8 - Math.abs(pass / n - wantPass) * 6 + (pass > perfect ? 3 : 0);
      valid++;
      if (sc > pickScore) { pickScore = sc; pick = pack(board, [root], { depth, fracPerfect: fp, fracPass: pass / n }); }
    }
    if (!pick) {      // 萬一找不到（理論上不會），退回只有炸彈和火箭的簡單盤面
      const c2 = Object.assign({}, cfg, { cross: true, dev: Math.max(6, Math.round(cfg.total * 0.7)), gems: 2, crates: 0, links: 0, big: 0, iron: 0 });
      for (let t = 0; t < 20000 && !pick; t++) {
        const { board, root } = buildBoard(c2, rng);
        if (countLeft(board) >= 6 && countBombs(board) >= 2 && simulate(board, root).remaining === 0) pick = pack(board, [root], { fallback: true });
      }
    }
    out = pick;
  }
  levelCache[L] = out;
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { DIRS, BASE, ACTIVE, LEVELS, SIZES, zoneOf, setGrid, grid: () => ({ W, H, N }), mulberry, simulate, analyze, starsFor, finalScore, levelCfg, levelIntro, buildBoard, genLevel, countLeft, countBombs, deviceList };
}
