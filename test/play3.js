const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 720 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.join(__dirname, 'debug.html'));
  await page.waitForTimeout(900);
  const shot = n => page.screenshot({ path: path.join(out, n + '.png') });
  const tapCell = async i => {
    const box = await page.locator('#cv').boundingBox();
    const [x, y] = await page.evaluate(i => window.__otc.center(i), i);
    await page.mouse.click(box.x + x, box.y + y);
  };
  const info = () => page.evaluate(() => { const o = window.__otc, S = o.S; return { level: S.level, phase: S.phase, tut: S.tut, left: S.left, total: S.total, bombsLeft: S.bombsLeft, score: S.score, sheet: S.sheet, sol: S.lv.solution, grid: o.grid(), cs: o.cs(), hints: o.save().hints, stars: S.lastR && S.lastR.st }; });
  const tapWithStars = st => page.evaluate(st => { const o = window.__otc; const a = o.analyze(o.S.board).filter(x => x.stars === st); return a.length ? a[0].i : -1; }, st);
  const overflow = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  const dismissIntro = async (name) => { const s = await info(); if (s.sheet === 'intro') { if (name) await shot(name); await page.click('#okBtn'); await page.waitForTimeout(250); } };
  const waitDone = () => page.waitForFunction(() => window.__otc.S.sheet === 'result', null, { timeout: 60000 });
  const fireAt = async i => { await tapCell(i); await page.waitForTimeout(120); await tapCell(i); };

  await shot('1-title');
  await page.click('#playBtn'); await page.waitForTimeout(900);
  let s = await info(); console.log('L1', JSON.stringify(s), JSON.stringify(await overflow()));
  await shot('2-tutorial');
  await tapCell(s.grid[0] * s.grid[1] - 1); await page.waitForTimeout(100);
  console.assert((await info()).tut === 1, 'tutorial should block other taps');
  await tapCell(s.sol[0]); await page.waitForTimeout(300); await shot('3-tutorial-selected');
  await tapCell(s.sol[0]); await page.waitForTimeout(700); await shot('4-tutorial-chain');
  await waitDone(); await page.waitForTimeout(1300); await shot('5-result-3star');
  console.log('after L1', JSON.stringify(await info()));
  // 第 2 關：先點炸彈（過關但留下火箭）
  await page.click('#nextBtn'); await page.waitForTimeout(900); await shot('6-level2');
  let i2 = await tapWithStars(2); await fireAt(i2); await waitDone(); await page.waitForTimeout(1300); await shot('7-result-2star');
  s = await info(); console.log('L2 two-star', JSON.stringify(s)); if (s.stars !== 2) throw new Error('expected 2 stars');
  await page.click('#againBtn'); await page.waitForTimeout(800);
  s = await info(); await fireAt(s.sol[0]); await waitDone(); s = await info(); if (s.stars !== 3) throw new Error('expected 3 stars on L2');
  // 用正解一路打到第 15 關
  for (let L = 3; L <= 15; L++) {
    await page.click('#nextBtn'); await page.waitForTimeout(500);
    await dismissIntro({ 4: '8-intro-cross', 11: '9-intro-bigbomb', 14: '10-intro-link' }[L]);
    await page.waitForTimeout(600);
    s = await info(); if (s.level !== L) throw new Error('expected level ' + L + ' got ' + s.level);
    if (L === 8) { await tapCell(s.sol[0]); await page.waitForTimeout(250); await shot('11-level8-selected'); }
    if (L === 11) await shot('12-level11-6x6');
    if (L === 14) await shot('13-level14');
    await fireAt(s.sol[0]); await waitDone();
    const a = await info(); if (a.stars !== 3) console.log('WARN not 3 stars', JSON.stringify(a));
  }
  // 沒過關的情況
  await page.click('#againBtn'); await page.waitForTimeout(900);
  const bad = await tapWithStars(0);
  if (bad >= 0) { await fireAt(bad); await waitDone(); await page.waitForTimeout(900); await shot('14-result-fail'); console.log('fail', JSON.stringify(await info())); }
  // 直接把進度設到第 49 關都過了，檢查後面幾種盤面
  await page.evaluate(() => { const sv = { stars: {}, best: {}, hints: 5, tut: true, seen: { cross: 1, bonus: 1, crate: 1, bigbomb: 1, link: 1, iron: 1 }, streak: 0 }; for (let L = 1; L <= 49; L++) sv.stars[L] = L % 3 === 0 ? 2 : 3; localStorage.setItem('otc:save4', JSON.stringify(sv)); });
  await page.reload(); await page.waitForTimeout(900); await shot('15-title-return');
  console.log('play button:', await page.textContent('#playBtn'));
  await page.click('#tMapBtn'); await page.waitForTimeout(500); await shot('16-map');
  for (const L of [21, 31, 41, 50]) {
    await page.click('[data-lv="' + L + '"]'); await page.waitForTimeout(700); await dismissIntro('17-intro-' + L); await page.waitForTimeout(700);
    s = await info(); console.log('L' + L, JSON.stringify({ grid: s.grid, cs: s.cs, total: s.total }), JSON.stringify(await overflow()));
    await shot('17-level' + L);
    if (L === 41) { await page.click('#hintBtn'); await page.waitForTimeout(400); await shot('18-level41-hint'); }
    if (L === 31 || L === 41) { await fireAt(s.sol[0]); await page.waitForTimeout(L === 31 ? 500 : 1500); await shot('17b-level' + L + '-chain'); await waitDone(); await page.waitForTimeout(1200); const a = await info(); console.log('L' + L + ' result', a.stars, a.left); if (a.stars !== 3) throw new Error('L' + L + ' solution should clear'); await shot('17c-level' + L + '-result'); await page.click('#toMapBtn'); await page.waitForTimeout(400); await page.click('#closeBtn'); await page.waitForTimeout(300); await page.click('#againBtn'); await page.waitForTimeout(600); }
    if (L === 50) { await fireAt(s.sol[0]); await page.waitForTimeout(1500); await shot('19-level50-chain'); await waitDone(); await page.waitForTimeout(1400); await shot('20-level50-result'); console.log('L50', JSON.stringify(await info())); await page.click('#toMapBtn'); await page.waitForTimeout(400); }
    else { await page.click('#mapBtn'); await page.waitForTimeout(400); }
  }
  await page.click('#closeBtn'); await page.waitForTimeout(300);
  await page.click('#againBtn'); await page.waitForTimeout(700);
  await page.click('#rulesBtn'); await page.waitForTimeout(400); await shot('21-rules'); await page.click('#closeBtn');
  await page.waitForTimeout(300); await page.click('#helpBtn'); await page.waitForTimeout(400); await shot('21b-help');
  if (await page.locator('.hcard').count() !== 12 || await page.locator('.hcard.lock').count() !== 0) throw new Error('help should list 12 objects, all revealed');
  await page.click('#closeBtn'); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 360, height: 580 }); await page.waitForTimeout(600); await shot('22-small-L50');
  console.log('small', JSON.stringify(await overflow()), JSON.stringify((await info()).cs));
  await page.setViewportSize({ width: 1200, height: 800 }); await page.waitForTimeout(600); await shot('23-desktop-L50');
  const au = await page.evaluate(() => window.__otc.audio());
  console.log('audio', au ? au.state + ' booms ' + (au.booms ? au.booms.length : 0) : 'none');
  console.log('errors', errors);
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
