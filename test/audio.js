const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 720 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, 'debug.html'));
  await page.waitForTimeout(500);
  await page.click('#playBtn'); await page.waitForTimeout(1500);
  const measure = async (ms) => page.evaluate(async (ms) => { const o = window.__otc; let q = 0, n = 0, pk = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const [r, p] = o.an(); q += r * r; n++; pk = Math.max(pk, p); await new Promise(r => setTimeout(r, 40)); } return { rms: +Math.sqrt(q / n).toFixed(4), peak: +pk.toFixed(3) }; }, ms);
  console.log('music only 8s', await measure(8000));
  console.log('boom windows (rms): 0-30ms, 30-120, 120-300, 300-600, 600-1000, 1000+');
  console.log(JSON.stringify(await page.evaluate(() => window.__otc.getBooms().map(b => { const c = b.getChannelData(0), sr = b.sampleRate; const w = (a, z) => { let e = 0, n = 0; for (let i = Math.floor(a * sr); i < Math.min(c.length, Math.floor(z * sr)); i++) { e += c[i] * c[i]; n++; } return +Math.sqrt(e / Math.max(1, n)).toFixed(3); }; return [w(0, .03), w(.03, .12), w(.12, .3), w(.3, .6), w(.6, 1), w(1, 9)]; }))));
  // 音效各自的音量
  for (const [name, fn] of [['select', 'o.sfx.select()'], ['button', 'o.sfx.button()'], ['wave k=1 (arrow)', "o.sfx.wave({k:1,items:[{o:{t:'arrow'}}]})"], ['wave k=6 (gem)', "o.sfx.wave({k:6,items:[{o:{t:'gem'}}]})"], ['wave bomb', "o.sfx.wave({k:3,items:[{o:{t:'bomb'}}]})"], ['wave 3 bombs', "o.sfx.wave({k:5,items:[{o:{t:'bomb'}},{o:{t:'bomb'}},{o:{t:'bomb',big:true}}]})"], ['star', 'o.sfx.star(3)'], ['clear', 'o.sfx.clear()']]) {
    await page.evaluate(() => { document.getElementById('musicBtn').click(); });   // 關音樂量音效
    await page.waitForTimeout(700);
    const r = await page.evaluate(async (fn) => { const o = window.__otc; eval(fn); let pk = 0, q = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < 600) { const [r, p] = o.an(); pk = Math.max(pk, p); q += r * r; n++; await new Promise(r => setTimeout(r, 15)); } return { peak: +pk.toFixed(3), rms: +Math.sqrt(q / n).toFixed(4) }; }, fn);
    console.log(name.padEnd(18), JSON.stringify(r));
    await page.evaluate(() => { document.getElementById('musicBtn').click(); });
  }
  await browser.close();
})();
