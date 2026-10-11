const C = require('../src/core.js');
C.setLevels(require('../src/levels.json'));
const AR = ['^', '>', 'v', '<'];
const G = { bomb: 'B', link: 'O', gem: 'g', crate: 'c', iron: 'I' };
function show(b, w, h) { let s = ''; for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) { const o = b[y * w + x]; s += o ? (o.t === 'arrow' ? AR[o.d] : o.t === 'cross' ? (o.ax === 'v' ? '|' : '-') : o.big ? 'X' : G[o.t]) : '.'; } s += '\n'; } return s; }
// 規則檢查
(function () {
  C.setGrid(5, 5);
  const b = new Array(25).fill(null); b[0] = { t: 'bomb' }; b[1] = { t: 'bomb' }; b[5] = { t: 'iron', hp: 2 };   // 石塊跟兩顆炸彈都相鄰
  const r = C.simulate(b, 0); console.assert(r.remaining === 0 && r.bombsLeft === 0, 'iron needs two hits', r.remaining);
  const r1 = C.simulate([{ t: 'bomb' }, null, null, null, null, { t: 'iron', hp: 2 }].concat(new Array(19).fill(null)), 0); console.assert(r1.remaining === 1 && r1.bombsLeft === 0, 'iron cracked only');
  console.assert(C.starsFor(1, 3) === 0 && C.starsFor(0, 3) === 1 && C.starsFor(0, 2) === 2 && C.starsFor(0, 0) === 3, 'stars');
  console.assert(C.finalScore(100, 5, 10) === 50 && C.finalScore(100, 10, 10) === 150, 'score');
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
  if (!ok || g.bombs < 2 || perfect.length !== 1 || perfect[0].i !== g.solution[0] || g.total !== g.board.filter(Boolean).length) bad++;
  const fake = C.apparentRoots(an).filter(i => i !== g.solution[0]).length;
  const types = {}; g.board.forEach(o => { if (o) { const k = o.big ? 'big' : o.t; types[k] = (types[k] || 0) + 1; } });
  const st = [0, 1, 2, 3].map(s => an.filter(a => a.stars === s).length);
  console.log(('L' + L).padEnd(4), g.W + 'x' + g.H, 'total', String(g.total).padStart(2), 'bombs', String(g.bombs).padStart(2), 'depth', String(sol.waves.length).padStart(2), 'taps 0/1/2/3★', st.join('/'), 'fake', fake, (ms + 'ms').padStart(6), ok ? '' : 'UNSOLVED', perfect.length !== 1 ? 'NOT-UNIQUE' : '', g.cfg.bonus ? 'bonus' : '', JSON.stringify(types));
  if ([3, 9, 14, 27, 47].includes(L)) console.log(show(g.board, g.W, g.H) + 'solution (' + (g.solution[0] % g.W) + ',' + ((g.solution[0] / g.W) | 0) + ')');
}
console.log('worst ms', worst, 'bad', bad);
