// App Store 截圖：用電腦裡的 Edge（playwright-core，不另外下載瀏覽器）以 6.9 吋 iPhone 的尺寸自動玩，拍下幾個畫面。
// 用法：node build.js && node tools/appstore-shots.js <輸出資料夾>
// 430×932 × 3 倍 = 1290×2796，App Store Connect 的 6.9 吋截圖收這個尺寸。
// App 裡的狀態列是隱藏的，但上方有動態島、下方有橫條要讓開，這裡用固定的留白模擬 iPhone 的安全區域。
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || path.join(__dirname, '..', 'appstore', 'screenshots');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const safeArea = '.app{padding-top:69px!important; padding-bottom:44px!important} .title{padding-bottom:50px!important}';
  const open = async () => { await page.goto('file://' + path.join(__dirname, '..', 'test', 'debug.html')); await page.addStyleTag({ content: safeArea }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900); };
  const shot = n => page.screenshot({ path: path.join(out, n + '.png') });
  const info = () => page.evaluate(() => { const S = window.__otc.S; return { level: S.level, sheet: S.sheet, sol: S.lv.solution }; });
  const tapCell = async i => { const box = await page.locator('#cv').boundingBox(); const [x, y] = await page.evaluate(i => window.__otc.center(i), i); await page.mouse.click(box.x + x, box.y + y); };
  const dismissIntro = async () => { if ((await info()).sheet === 'intro') { await page.click('#okBtn'); await page.waitForTimeout(400); } };
  const waitDone = () => page.waitForFunction(() => window.__otc.S.sheet === 'result', null, { timeout: 60000 });

  // 1. 標題頁（新玩家）
  await open();
  await shot('1-title');

  // 進度設成玩到第 70 關，大部分三星，選關畫面才好看
  await page.evaluate(() => { const sv = { stars: {}, best: {}, hints: 5, tut: true, seen: {}, streak: 4 }; for (let L = 1; L <= 70; L++) sv.stars[L] = L % 7 === 0 ? 2 : 3; localStorage.setItem('otc:save4', JSON.stringify(sv)); });
  await open();

  // 2. 選關畫面
  await page.click('#tMapBtn'); await page.waitForTimeout(600);
  await shot('5-map');

  // 3. 選取起點時的預覽（第 71 關：傳送門），4. 連鎖進行中，5. 全清結算
  const L = +(process.argv[3] || 71);
  await page.evaluate(L => { const b = document.querySelector('[data-lv="' + L + '"]'); b.scrollIntoView({ block: 'center' }); b.click(); }, L);
  await page.waitForTimeout(900); await dismissIntro(); await page.waitForTimeout(700);
  const s = await info();
  await tapCell(s.sol[0]); await page.waitForTimeout(450);
  await shot('2-aim');
  await tapCell(s.sol[0]);
  // 連鎖每次播放的快慢不完全一樣，連拍幾張再挑
  for (let k = 1; k <= 4; k++) { await page.waitForTimeout(k === 1 ? 700 : 500); await shot('3-chain-' + k); }
  await waitDone(); await page.waitForTimeout(1500);
  await shot('4-result');

  console.log('level', L, 'errors', errors);
  await browser.close();
})().catch(e => { console.error('SHOTS FAILED', e); process.exit(1); });
