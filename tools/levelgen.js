/* 關卡設計工具：替 50 關各自找出一個「只有唯一解」的盤面，寫到 src/levels.json。
   做法：
   1. 從一個起點開始，一個接一個把東西「長」出來（所以從起點點下去一定清得光）。
   2. 大量產生候選盤面，只留下「全部炸光的點法只有一個」的。
   3. 替分數最好的幾個盤面補上「假源頭」，再挑出最符合該關難度的那一個。
   用法：node tools/levelgen.js [每關最多看幾個合格候選，預設 300] [從第幾關開始重做，預設 1] */
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const { DIRS } = C;
const BUDGET = +process.argv[2] || 300;

function handmade(L, W) {
  const b = new Array(W * W).fill(null);
  const put = (x, y, o) => { b[y * W + x] = o; };
  if (L === 1) {      // 火箭撞上炸彈，炸彈一個傳一個。直接點炸彈會留下火箭
    put(0, 2, { t: 'arrow', d: 1 }); put(2, 2, { t: 'bomb' }); put(3, 1, { t: 'bomb' });
    put(3, 3, { t: 'bomb' }); put(4, 4, { t: 'gem' });
    return { board: b, root: 2 * W + 0 };
  }
  // 第 2 關：火箭會引爆另一支火箭，要找到最源頭的那一支
  put(4, 0, { t: 'arrow', d: 2 }); put(4, 3, { t: 'arrow', d: 3 }); put(2, 3, { t: 'bomb' });
  put(1, 2, { t: 'bomb' }); put(1, 4, { t: 'bomb' }); put(0, 1, { t: 'gem' });
  return { board: b, root: 0 * W + 4 };
}

function buildBoard(cfg, rng) {
  const W = cfg.w, H = cfg.h, N = W * H;
  const b = new Array(N).fill(null);
  const ri = n => Math.floor(rng() * n);
  const empties = () => { const e = []; for (let i = 0; i < N; i++) if (!b[i]) e.push(i); return e; };
  // 每個目標是 [格子, 射線方向]；方向 -1 代表是被炸到或電到（鏡子只有被射線打到才會轉彎）
  const lineCells = (i, d) => {       // 這個方向一路到底都沒東西才回傳
    const cells = []; let x = i % W, y = (i / W) | 0;
    for (;;) {
      x += DIRS[d][0]; y += DIRS[d][1];
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (b[y * W + x]) return [];
      cells.push([y * W + x, d]);
    }
    return cells;
  };
  const around = (i, r, diag) => {
    const x = i % W, y = (i / W) | 0, cells = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if ((!dx && !dy) || (!diag && dx && dy)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !b[ny * W + nx]) cells.push([ny * W + nx, -1]);
    }
    return cells;
  };
  const mirrorOut = {};      // 鏡子預計往哪個方向把射線轉出去
  const targetsOf = i => {
    const o = b[i];
    if (o.t === 'bomb') return around(i, o.big ? 2 : 1, true);
    if (o.t === 'arrow') return lineCells(i, o.d);
    if (o.t === 'cross') return (o.ax === 'v' ? [0, 2] : [1, 3]).reduce((acc, d) => acc.concat(lineCells(i, d)), []);
    if (o.t === 'mirror') return lineCells(i, mirrorOut[i]);
    if (o.t === 'link') return around(i, 1, false);
    return [];
  };
  const free = (cell, d) => { const x = (cell % W) + DIRS[d][0], y = ((cell / W) | 0) + DIRS[d][1]; return x >= 0 && y >= 0 && x < W && y < H && !b[y * W + x]; };
  const newDevice = (cell, noBomb) => {
    const r = (noBomb ? 5 : 0) + rng() * ((cfg.cross ? 12 : 9) - (noBomb ? 5 : 0));
    const t = r < 5 ? 'bomb' : r < 9 ? 'arrow' : 'cross';
    const o = { t };
    if (t === 'cross') {      // 橫向或直向：挑旁邊還有空位的那個方向
      const hOk = free(cell, 1) || free(cell, 3), vOk = free(cell, 0) || free(cell, 2);
      o.ax = hOk && !vOk ? 'h' : vOk && !hOk ? 'v' : rng() < 0.5 ? 'h' : 'v';
    }
    if (t === 'arrow') { const ds = [0, 1, 2, 3].filter(d => free(cell, d)); o.d = ds.length ? ds[ri(ds.length)] : ri(4); }
    return o;
  };
  const lead = ri(4);      // 開頭幾個常常不是炸彈
  const root = ri(N);
  b[root] = newDevice(root, lead > 0);
  const chain = [root];
  let dev = 1, links = 0, mirrors = 0, bigLeft = cfg.big, guard = 0, placed = 1, keyAt = -1;
  const passives = [];
  for (let g = 0; g < cfg.gems; g++) passives.push('gem');
  for (let g = 0; g < cfg.crates; g++) passives.push('crate');
  for (let g = 0; g < (cfg.key || 0); g++) passives.push('key');
  for (let g = 0; g < (cfg.chests || 0); g++) passives.push('chest');
  const want = cfg.dev + passives.length + cfg.links + (cfg.mirrors || 0);
  while (placed < want && guard++ < 800) {
    const ei = rng() < 0.6 ? chain.length - 1 : ri(chain.length), e = chain[ei];
    const ts = targetsOf(e);
    if (!ts.length) continue;
    const [cell, dir] = ts[ri(ts.length)];
    const devLeft = cfg.dev - dev, pasLeft = passives.length, linkLeft = cfg.links - links;
    // 鏡子只能放在射線打得到的格子，而且轉彎後那一邊要有空位
    const outs = dir >= 0 && mirrors < (cfg.mirrors || 0) ? [0, 1].filter(m => free(cell, C.REFLECT[m][dir])) : [];
    const wDev = devLeft * 1.6, wPas = pasLeft, wLink = linkLeft > 0 && links === 0 ? 1.2 : 0, wMir = outs.length ? 2.4 : 0;
    const roll = rng() * (wDev + wPas + wLink + wMir);
    if (roll < wDev) {
      const o = newDevice(cell, dev < lead);
      if (o.t === 'bomb' && bigLeft > 0 && rng() < 0.4) { o.big = true; bigLeft--; }
      b[cell] = o; chain.push(cell); dev++; placed++;
    } else if (roll < wDev + wPas) {
      // 鑰匙要早一點出現；寶箱只能接在「放鑰匙之後才長出來的機關」後面，這樣才會先拿到鑰匙
      let pick;
      if (passives.includes('key') && placed >= 2) pick = passives.indexOf('key');
      else {
        const ok = passives.map((t, n) => n).filter(n => passives[n] !== 'chest' || (keyAt >= 0 && ei > keyAt));
        if (!ok.length) continue;
        pick = ok[ri(ok.length)];
      }
      const t = passives.splice(pick, 1)[0];
      b[cell] = { t }; placed++;
      if (t === 'key') keyAt = chain.length - 1;
    } else if (roll < wDev + wPas + wLink) {
      // 電球：這一顆被打到，其他幾顆散在別處一起放電，連鎖再從那些電球往外長
      b[cell] = { t: 'link' }; chain.push(cell); links++; placed++;
      while (links < cfg.links) {
        const em = empties(); if (!em.length) break;
        const c2 = em[ri(em.length)]; b[c2] = { t: 'link' }; chain.push(c2); links++; placed++;
      }
    } else if (outs.length) {
      const m = outs[ri(outs.length)];
      b[cell] = { t: 'mirror', m }; mirrorOut[cell] = C.REFLECT[m][dir]; chain.push(cell); mirrors++; placed++;
    }
  }
  return { board: b, root };
}

/* 從起點引爆時，有幾面鏡子真的把射線轉彎、而且轉彎後有打到東西 */
function mirrorWork(board, root) {
  const seen = new Set();
  for (const w of C.simulate(board, root).waves) for (const f of w.fx) if (f.mirror && f.hit) seen.add(f.i);
  return seen.size;
}
/* 寶箱有沒有「太早被打到、還鎖著」的時候（有的話，順序就真的需要想） */
function lockedHits(board) {
  let n = 0;
  for (const i of C.deviceList(board)) if (C.simulate(board, i).waves.some(w => w.items.some(it => it.locked))) n++;
  return n;
}

/* 加一個「假源頭」：一開始沒有任何機關直接打得到它，但連鎖途中擋路的東西先被清掉後，它還是會被打到。
   作法很直接：每個空格、每種機關都試放一次，留下「起點仍然全清、仍然唯一解、而且它看起來像源頭」的那一個。 */
function addFake(board, root, rng, cfg) {
  const N = cfg.w * cfg.h, cells = [];
  for (let i = 0; i < N; i++) if (!board[i]) cells.push(i);
  const kinds = [{ t: 'bomb' }, { t: 'arrow', d: 0 }, { t: 'arrow', d: 1 }, { t: 'arrow', d: 2 }, { t: 'arrow', d: 3 }];
  if (cfg.cross) kinds.push({ t: 'cross', ax: 'h' }, { t: 'cross', ax: 'v' });
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(cells);
  for (const cell of cells) {
    for (const k of shuffle(kinds.slice())) {
      board[cell] = Object.assign({}, k);
      if (C.simulate(board, root).remaining === 0) {
        const an = C.analyze(board);
        if (an.filter(a => a.stars === 3).length === 1 && C.apparentRoots(an).includes(cell)) return true;
      }
      board[cell] = null;
    }
  }
  return false;
}

function measure(board, root, cfg, want) {
  const W = cfg.w, H = cfg.h, N = W * H;
  const an = C.analyze(board), n = an.length;
  const pass = an.filter(a => a.stars >= 1).length;
  const depth = C.simulate(board, root).waves.length;
  const fake = C.apparentRoots(an).filter(i => i !== root).length;
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  board.forEach((o, i) => { if (o) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  const spread = (x1 - x0 + 1) * (y1 - y0 + 1) / N;
  const base = depth * 0.35 - Math.abs(pass / n - want.pass) * 6 + spread * 2 + (pass > 1 ? 1.5 : 0);
  return { n, pass, depth, fake, spread: +spread.toFixed(2), base, score: base - Math.abs(fake - want.fake) * 2.5, unique: an.filter(a => a.stars === 3).length === 1 };
}

function design(L) {
  const cfg0 = C.levelCfg(L), W = cfg0.w, H = cfg0.h, N = W * H;
  C.setGrid(W, H);
  if (L <= 2) { const hm = handmade(L, W); return { board: hm.board, root: hm.root, info: { handmade: true } }; }
  const rng = C.mulberry(L * 7919 + 13);
  const need = C.levelIntro(L);
  // 這一關想要的難度
  const want = {
    pass: Math.max(0.1, 0.42 - L * 0.007),                        // 能過關的點法比例：越後面越少
    fake: L < 6 ? 0 : L < 13 ? 1 : L < 26 ? 2 : L < 40 ? 3 : 4    // 假源頭的數量：越後面越多
  };
  // 先留位置給之後要加的假源頭
  const cfg = Object.assign({}, cfg0, { total: cfg0.total - want.fake, dev: cfg0.dev - want.fake });
  const needWork = cfg0.mirrors ? (need === 'mirror' ? cfg0.mirrors : Math.max(1, cfg0.mirrors - 1)) : 0;
  const pool = [];
  let tries = 0, valid = 0;
  while (tries++ < 400000 && valid < BUDGET) {
    const { board, root } = buildBoard(cfg, rng);
    if (C.countLeft(board) !== cfg.total) continue;
    if (C.countBombs(board) < cfg0.minBombs) continue;
    if (need === 'bigbomb' ? !board.some(o => o && o.big) : (need === 'cross' || need === 'crate' || need === 'link') && !board.some(o => o && o.t === need)) continue;
    if (need === 'cross' && !(board.some(o => o && o.ax === 'h') && board.some(o => o && o.ax === 'v'))) continue;   // 介紹關要橫、直各一個
    if (cfg.mirrors && board.filter(o => o && o.t === 'mirror').length !== cfg.mirrors) continue;
    if (cfg.chests && !(board.some(o => o && o.t === 'key') && board.filter(o => o && o.t === 'chest').length === cfg.chests)) continue;
    if (C.simulate(board, root).remaining !== 0) continue;
    if (cfg.iron) {      // 石塊：把一個木箱或寶石換成要打兩次的石塊，還清得光才換
      let done = 0;
      for (let j = 0; j < N && done < cfg.iron; j++) {
        if (board[j] && (board[j].t === 'crate' || board[j].t === 'gem')) {
          const keep = board[j]; board[j] = { t: 'iron', hp: 2 };
          if (C.simulate(board, root).remaining === 0) done++; else board[j] = keep;
        }
      }
      if (!done) continue;
    }
    if (cfg.mirrors && mirrorWork(board, root) < needWork) continue;      // 鏡子要真的派上用場
    const m = measure(board, root, cfg, want);
    if (!m.unique) continue;        // 唯一解
    if (cfg.mirrors) m.base += mirrorWork(board, root) * 0.8;
    if (cfg.chests) m.base += Math.min(3, lockedHits(board)) * 0.5;
    valid++;
    pool.push({ board, root, m });
  }
  if (!pool.length) throw new Error('level ' + L + ': no unique-solution board found');
  // 分數最好的幾個盤面，各自補上假源頭，再挑最後最好的
  pool.sort((a, b) => b.m.base - a.m.base);
  let pick = null;
  for (const cand of pool.slice(0, 14)) {
    const board = cand.board.map(o => o && Object.assign({}, o));
    let m = cand.m, guard = 0;
    while (m.fake < want.fake && C.countLeft(board) < cfg0.total + 1 && guard++ < 6) {
      if (!addFake(board, cand.root, rng, cfg0)) break;
      m = measure(board, cand.root, cfg0, want);
    }
    m = measure(board, cand.root, cfg0, want);
    if (needWork && mirrorWork(board, cand.root) < needWork) continue;      // 補假源頭時不能把鏡子擋掉
    if (cfg0.mirrors) m.score += mirrorWork(board, cand.root) * 0.8;
    if (m.unique && C.simulate(board, cand.root).remaining === 0 && (!pick || m.score > pick.m.score)) pick = { board, root: cand.root, m };
  }
  if (!pick) throw new Error('level ' + L + ': no candidate survived');
  const m = pick.m, info = { total: C.countLeft(pick.board), depth: m.depth, pass: m.pass + '/' + m.n, fake: m.fake + '/' + want.fake, spread: m.spread, valid, tries: tries - 1 };
  if (cfg0.mirrors) info.mirrors = mirrorWork(pick.board, pick.root) + '/' + cfg0.mirrors;
  if (cfg0.chests) info.locked = lockedHits(pick.board);
  return { board: pick.board, root: pick.root, info };
}

// 第二個參數：從第幾關開始重做（前面的關卡照舊，玩家的星星才不會白拿）
const FROM = +process.argv[3] || 1, file = path.join(__dirname, '..', 'src', 'levels.json');
const old = FROM > 1 ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const out = [];
for (let L = 1; L <= C.LEVELS; L++) {
  if (L < FROM) { out.push(old[L - 1]); continue; }
  const t0 = Date.now(), d = design(L), cfg = C.levelCfg(L);
  out.push({ b: C.encodeBoard(d.board), s: d.root });
  console.log(('L' + L).padEnd(4), cfg.w + 'x' + cfg.h, JSON.stringify(d.info), (Date.now() - t0) + 'ms');
}
fs.writeFileSync(file, '[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n]\n');
console.log('wrote src/levels.json' + (FROM > 1 ? '（第 1–' + (FROM - 1) + ' 關沒動）' : ''));
