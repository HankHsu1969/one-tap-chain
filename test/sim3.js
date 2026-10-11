const C = require('../src/core.js');
C.setLevels(require('../src/levels.json'));
const AR = ['^', '>', 'v', '<'];
const G = { bomb: 'B', link: 'O', gem: 'g', crate: 'c', iron: 'I' };
function show(b, w, h) { const e = C.encodeBoard(b); let s = ''; for (let y = 0; y < h; y++) s += e.slice(y * w, y * w + w) + '\n'; return s; }
// 規則檢查
(function () {
  C.setGrid(5, 5);
  const b = new Array(25).fill(null); b[0] = { t: 'bomb' }; b[1] = { t: 'bomb' }; b[5] = { t: 'iron', hp: 2 };   // 石塊跟兩顆炸彈都相鄰
  const r = C.simulate(b, 0); console.assert(r.remaining === 0 && r.bombsLeft === 0, 'iron needs two hits', r.remaining);
  const r1 = C.simulate([{ t: 'bomb' }, null, null, null, null, { t: 'iron', hp: 2 }].concat(new Array(19).fill(null)), 0); console.assert(r1.remaining === 1 && r1.bombsLeft === 0, 'iron cracked only');
  console.assert(C.starsFor(1, 3) === 0 && C.starsFor(0, 3) === 1 && C.starsFor(0, 2) === 2 && C.starsFor(0, 0) === 3, 'stars');
  console.assert(C.finalScore(100, 5, 10) === 50 && C.finalScore(100, 10, 10) === 150, 'score');
  // 鏡子：火箭往右打到「／」會往上轉；被炸彈炸到只會碎掉
  C.setGrid(5, 5);
  const m1 = C.simulate(C.decodeBoard('..g..' + '.....' + '>./..' + '.....' + '.....'), 10); console.assert(m1.remaining === 0, 'mirror / turns right-going beam up');
  const m2 = C.simulate(C.decodeBoard('.....' + '.....' + '>.\\..' + '.....' + '..g..'), 10); console.assert(m2.remaining === 0, 'mirror \\ turns right-going beam down');
  const m3 = C.simulate(C.decodeBoard('B/..g' + '.....' + '.....' + '.....' + '.....'), 0); console.assert(m3.remaining === 1, 'bombed mirror just breaks');
  // 寶箱：鑰匙還在時打不開；先打到鑰匙（或同一波）就打得開
  const c1 = C.simulate(C.decodeBoard('>T...' + '.....' + '.....' + '.....' + 'k....'), 0); console.assert(c1.remaining === 2 && c1.waves[1].items[0].locked, 'chest locked while key remains');
  const c2 = C.simulate(C.decodeBoard('>k...' + '.....' + '.....' + '.....' + '.....'), 0); console.assert(c2.remaining === 0, 'key cleared');
  const c3 = C.simulate(C.decodeBoard('B....' + 'kT...' + '.....' + '.....' + '.....'), 0); console.assert(c3.remaining === 0, 'key then chest', c3.remaining);
  console.assert(C.encodeBoard(C.decodeBoard('/\\kT*SPDH')) === '/\\kT*SPDH', 'codes round-trip');
  // 第 51 關起的新物件
  const sim = (rows, start) => C.simulate(C.decodeBoard(rows.join('')), start);
  console.assert(sim(['g...g', '.....', '..*..', '.....', 'g...g'], 12).remaining === 0, 'diag hits four corners');
  console.assert(sim(['..g..', '.....', 'g.*.g', '.....', '..g..'], 12).remaining === 4, 'diag does not shoot straight');
  console.assert(sim(['....g', '...\\.', '..*..', '.....', '.....'], 12).remaining === 1, 'diagonal beam breaks mirror without turning');
  console.assert(sim(['BS...', '.....', '.....', '.....', '.....'], 0).remaining === 1, 'steel survives a bomb');
  console.assert(sim(['>.S.g', '.....', '.....', '.....', '.....'], 0).remaining === 1, 'beam breaks steel and stops there');
  console.assert(sim(['>.P..', '.....', '.....', '.P..g', '.....'], 0).remaining === 0, 'portal carries the beam out of the other gate');
  console.assert(sim(['.P>.P', '.....', '.....', '.....', '.....'], 2).remaining === 0, 'beam passes a portal only once');
  const tb = sim(['DB...', '.....', '.....', '.....', '.....'], 0);
  console.assert(tb.remaining === 0 && tb.waves.length === 4 && tb.waves[0].items[0].lit === 3, 'time bomb explodes two waves later');
  console.assert(sim(['>D..g', '.....', '.....', '.....', '.....'], 0).remaining === 1, 'lit time bomb blocks beams');
  const hb = sim(['>H...', '.B...', '.....', '.....', '.....'], 0);
  console.assert(hb.remaining === 0 && hb.bombsLeft === 1 && C.starsFor(hb.bombsLeft, hb.remaining) === 0, 'swallowed bomb does not count as exploded');
  console.assert(sim(['>H...', '.v...', '.....', '.....', '.g...'], 0).remaining === 1, 'swallowed device does not fire');
  console.assert(sim(['>H...', '.S...', '.....', '.....', '.....'], 0).remaining === 1, 'hole cannot swallow steel');
  const ta = C.analyze(C.decodeBoard('DB.......................'));
  console.assert(ta[0].hits.join() === '1', 'time bomb preview shows what its blast hits');
  const l1 = C.genLevel(1), a1 = C.analyze(l1.board);
  console.log('L1 taps:', a1.map(a => a.stars).join(','));
  const l2 = C.genLevel(2), a2 = C.analyze(l2.board);
  console.log('L2 taps:', a2.map(a => a.i + ':' + a.stars + '★').join(' '), '| solution', l2.solution);
  console.assert(a2.some(a => a.stars === 2) && a2.some(a => a.stars === 3), 'L2 should have a 2-star and a 3-star tap');
})();
let worst = 0, bad = 0;
for (let L = 1; L <= C.LEVELS; L++) {
  const t0 = Date.now(); const g = C.genLevel(L); const ms = Date.now() - t0; worst = Math.max(worst, ms);
  const an = C.analyze(g.board);
  const sol = C.simulate(g.board, g.solution[0]);
  const ok = sol.remaining === 0 && g.W === g.cfg.w && g.board.length === g.W * g.H;
  const perfect = an.filter(a => a.stars === 3);
  // 新物件：第 31 關起每關有鏡子、而且至少一面真的派上用場；第 41 關起有鑰匙和寶箱；第 51 關起每 10 關多一種，數量要對
  const cnt = t => g.board.filter(o => o && o.t === t).length;
  const work = new Set(); for (const w of sol.waves) for (const f of w.fx) if (f.mirror && f.hit) work.add(f.i);
  const late = L <= 50 || (cnt('diag') >= g.cfg.diag && g.board.filter(o => o && o.timer).length >= g.cfg.timers && cnt('steel') === g.cfg.steel && cnt('hole') === g.cfg.holes && cnt('portal') === g.cfg.portals * 2);
  const okNew = late && cnt('mirror') === (g.cfg.mirrors || 0) && (!g.cfg.mirrors || work.size >= 1) && cnt('key') === (g.cfg.key || 0) && cnt('chest') === (g.cfg.chests || 0);
  if (!ok || !okNew || g.bombs < 2 || perfect.length !== 1 || perfect[0].i !== g.solution[0] || g.total !== g.board.filter(C.isPiece).length) bad++;
  const fake = C.apparentRoots(an).filter(i => i !== g.solution[0]).length;
  const types = {}; g.board.forEach(o => { if (o) { const k = o.big ? 'big' : o.t; types[k] = (types[k] || 0) + 1; } });
  const st = [0, 1, 2, 3].map(s => an.filter(a => a.stars === s).length);
  console.log(('L' + L).padEnd(4), g.W + 'x' + g.H, 'total', String(g.total).padStart(2), 'bombs', String(g.bombs).padStart(2), 'depth', String(sol.waves.length).padStart(2), 'taps 0/1/2/3★', st.join('/'), 'fake', fake, (ms + 'ms').padStart(6), ok ? '' : 'UNSOLVED', okNew ? '' : 'NEW-OBJ?', perfect.length !== 1 ? 'NOT-UNIQUE' : '', g.cfg.bonus ? 'bonus' : '', JSON.stringify(types));
  if ([3, 9, 14, 27, 31, 41, 47, 51, 61, 71, 81, 91].includes(L)) console.log(show(g.board, g.W, g.H) + 'solution (' + (g.solution[0] % g.W) + ',' + ((g.solution[0] / g.W) | 0) + ')');
}
console.log('worst ms', worst, 'bad', bad);
