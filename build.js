const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const assets = fs.readFileSync(path.join(__dirname, 'art4', 'assets.json'), 'utf8');
const core = src('core.js').replace(/\nif \(typeof module[\s\S]*$/, '\n');
const levels = src('levels.json').trim();
const html = src('page.html').replace('/*ASSETS*/', () => 'const ASSETS = ' + assets + ';').replace('/*CORE*/', () => core + '\nsetLevels(' + levels + ');\n').replace('/*UI*/', () => src('ui.js'));
// 單獨放上網站時要有完整的文件開頭：沒有 doctype 會進相容模式，沒有 viewport 手機會用 980px 寬排版。index.html 是 GitHub Pages 的首頁
const page = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + html;
for (const f of ['one-tap-chain.html', 'index.html']) fs.writeFileSync(path.join(__dirname, f), page);
// iOS App 版（app/www，Capacitor 從這裡打包）：要能離線，所以字型改用 app/fonts 裡裁過的檔案、不連 Google Fonts；
// 另外關掉雙指縮放和長按選單，免得點太快時畫面被放大
const fontLinks = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\r?\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">\r?\n/;
if (!fontLinks.test(page)) throw new Error('page.html 的 Google Fonts 連結改過了，build.js 的 App 版要跟著改');
const face = (family, file, weight) => '@font-face{font-family:\'' + family + '\';src:url(fonts/' + file + ') format(\'woff2\');font-weight:' + weight + ';font-display:block}\n';
const appPage = page
  .replace('initial-scale=1,', 'initial-scale=1,maximum-scale=1,user-scalable=no,')
  .replace(fontLinks, () => '<style>\n' + face('Bungee', 'Bungee-Regular.woff2', 400) + face('M PLUS Rounded 1c', 'MPLUSRounded1c-Black.woff2', 900) +
    face('Noto Sans TC', 'NotoSansTC-500-900.woff2', '500 900') + '*{-webkit-touch-callout:none}\n</style>\n');
const www = path.join(__dirname, 'app', 'www');
fs.mkdirSync(path.join(www, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(www, 'index.html'), appPage);
for (const f of fs.readdirSync(path.join(__dirname, 'app', 'fonts'))) fs.copyFileSync(path.join(__dirname, 'app', 'fonts', f), path.join(www, 'fonts', f));
fs.writeFileSync(path.join(__dirname, 'test', 'debug.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html.replace('/* ---------- 啟動', 'window.__otc = { S, save: () => save, simulate, analyze, genLevel, deviceList, grid: () => [W, H], center: i => center(i), cs: () => cs, sfx, playBoom, getBooms: () => booms, an: () => { const d = new Float32Array(2048); analyser.getFloatTimeDomainData(d); let q = 0, pk = 0; for (const v of d) { q += v * v; pk = Math.max(pk, Math.abs(v)); } return [Math.sqrt(q / d.length), pk]; }, audio: () => { if (!ac) return null; const d = new Float32Array(2048); analyser.getFloatTimeDomainData(d); let q = 0; for (const v of d) q += v * v; return { state: ac.state, rms: Math.sqrt(q / d.length), step: mStep, booms: booms && booms.map(x => { const c = x.getChannelData(0); let pk = 0, e = 0, bad = 0; for (let i = 0; i < c.length; i++) { const v = c[i]; if (v !== v) bad++; pk = Math.max(pk, Math.abs(v)); e += v * v; } return { dur: +x.duration.toFixed(2), peak: +pk.toFixed(3), rms: +Math.sqrt(e / c.length).toFixed(4), bad, head: +Math.max.apply(null, Array.from(c.slice(0, 2205)).map(Math.abs)).toFixed(3), tail: +Math.max.apply(null, Array.from(c.slice(c.length - 4410)).map(Math.abs)).toFixed(4) }; }) }; } };\n/* ---------- 啟動') + '</body></html>');
console.log('built', page.length, 'bytes');
