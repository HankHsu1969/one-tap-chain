/* ===== 畫面與操作 ===== */
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();
const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const store = {
  get(k, d) { try { const v = localStorage.getItem('otc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('otc:' + k, JSON.stringify(v)); } catch (e) { /* 沒有儲存空間也照玩 */ } }
};
const root = document.documentElement;
for (const k of ['bg_p', 'bg_w', 'cover_p', 'cover_w', 'atlas', 'pals']) root.style.setProperty('--' + k.replace('_', '-'), 'url("' + ASSETS[k] + '")');
const atlas = new Image(); let atlasOk = false;
atlas.onload = () => { atlasOk = true; };
atlas.src = ASSETS.atlas;

const C = { ink: '#26332c', white: '#ffffff', sun: '#ffd24a', orange: '#ff9f1c', coral: '#ff6f61', pink: '#ff4f8b', leaf: '#4db869', leafDeep: '#1f7a44' };
const NAMES = {
  bomb: ['炸彈', '炸周圍 8 格'],
  bigbomb: ['大炸彈', '一次炸周圍兩圈'],
  arrow: ['火箭', '往前飛，撞到第一個東西就引爆它'],
  cross: ['橫向盤', '往左、右各射中第一個'],
  crossv: ['直向盤', '往上、下各射中第一個'],
  link: ['電球', '一顆放電，全部電球一起放電，還會電到上下左右'],
  gem: ['寶石', '不會引爆別人，被打到分數最高'],
  crate: ['木箱', '不會引爆別人，還會擋住火箭'],
  iron: ['石塊', '要被打到兩次才會碎'],
  mirror: ['鏡子', '火箭和盤的射線打到它會轉彎，再打中轉彎後的第一個東西'],
  key: ['鑰匙', '被打到就解開所有寶箱的鎖'],
  chest: ['寶箱', '要先打到鑰匙才打得開，分數最高'],
  diag: ['斜射盤', '往四個斜角各射中第一個'],
  steel: ['鋼箱', '炸彈、電球炸不壞，只有射線打得壞'],
  portal: ['傳送門', '射線走進一個門，會從另一個門出來繼續飛'],
  timer: ['定時炸彈', '被打到後等 2 波才爆炸，倒數時會擋住射線'],
  hole: ['黑洞', '把周圍 8 格吞掉，被吞的東西不會發動']
};
// 每 10 關登場的新物件（選關畫面的預告、說明卡的「還沒登場」都看這張表）
const ZONE_NEW = [['bomb', 'arrow', 'cross', 'crate'], ['bigbomb', 'link'], ['iron'], ['mirror'], ['key', 'chest'], ['diag'], ['steel'], ['portal'], ['timer'], ['hole']];
const INTRO_LV = { bigbomb: 11, link: 14, iron: 21, mirror: 31, key: 41, chest: 41, diag: 51, steel: 61, portal: 71, timer: 81, hole: 91 };
const met = k => !INTRO_LV[k] || unlocked() >= INTRO_LV[k];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7-6.3-3.4-6.3 3.4 1.3-7L1.8 9.2l7.1-.9z"/></svg>';
const keyOf = o => (o.t === 'bomb' ? (o.timer ? 'timer' : o.big ? 'bigbomb' : 'bomb') : o.t === 'cross' && o.ax === 'v' ? 'crossv' : o.t);
//            欄 列 大小  往右 往下（讓主體落在格子正中央）
const SPR = { bomb: [0, 0, 1.1, 0.05, -0.08], bigbomb: [1, 0, 1.1, 0.03, -0.08], arrow: [2, 0, 0.94, 0, 0], cross: [3, 0, 0.86, 0, 0], crossv: [4, 0, 0.86, 0, 0],
  link: [0, 1, 0.94, 0, 0], gem: [1, 1, 0.84, 0, 0.01], crate: [2, 1, 0.8, 0, 0], iron: [3, 1, 0.84, 0, 0], diag: [4, 1, 0.86, 0, 0],
  mirror: [0, 2, 0.92, 0, 0], key: [1, 2, 0.84, 0, 0], chest: [2, 2, 0.88, 0, 0.02], chestopen: [3, 2, 0.96, 0, -0.02], steel: [4, 2, 0.8, 0, 0],
  portal: [0, 3, 0.94, 0, 0], timer: [1, 3, 1.02, 0.02, -0.05], hole: [2, 3, 0.92, 0, 0] };
const SPR_POS = k => (SPR[k][0] / 4 * 100) + '% ' + (SPR[k][1] / 3 * 100) + '%';
const sprHtml = (k, cls) => '<span class="spr' + (k === 'mirror' ? ' mir' : '') + (cls ? ' ' + cls : '') + '" style="background-position:' + SPR_POS(k) + '"></span>';

const cv = $('cv'), ctx = cv.getContext('2d');
let cs = 56, dpr = 1, tileCache = null;

let save = store.get('save4', null);
if (!save || typeof save !== 'object') save = {};
save = Object.assign({ stars: {}, best: {}, hints: 3, tut: false, seen: {}, streak: 0 }, save);
const persist = () => store.set('save4', save);
const unlocked = () => { let m = 1; for (const k in save.stars) if (save.stars[k] >= 1) m = Math.max(m, +k + 1); return Math.min(LEVELS, m); };
const totalStars = () => { let s = 0; for (const k in save.stars) s += save.stars[k]; return s; };

const S = {
  level: 1, lv: null, board: [], display: [], scorch: {}, score: 0, total: 0, left: 0, bombs: 0, bombsLeft: 0,
  phase: 'idle', sel: -1, reach: null, hint: -1, tut: 0, attempt: 1, token: 0, born: 0, wig: {}, cursor: -1, kb: false,
  sheet: null, starsShown: 0, onTitle: true, lastR: null, wave: 0
};

/* =====================================================================
   聲音：全部用 Web Audio 即時合成，沒有任何錄音檔。
   配樂是木琴主旋律＋撥弦伴奏＋貝斯＋輕打擊；連鎖的音跟配樂同一個調。
   爆炸聲是先離線算好的多層合成：衝擊波＋失真的棕色雜訊＋低頻下墜＋隆隆尾音＋碎片聲＋殘響。
   ===================================================================== */
let ac = null, master = null, musicBus = null, sfxBus = null, toneBus = null, revSend = null, analyser = null, booms = null, whiteBuf = null;
let musicOn = store.get('music', true) !== false, sfxOn = store.get('sfx', true) !== false;
const MUSIC_VOL = 1.25, TONE_VOL = 1.9;
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
function makeImpulse(c, dur, decay) {
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function makeNoise(c, dur, brown) {
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function audio() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.22;
    master = ac.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination);
    analyser = ac.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    toneBus = ac.createGain(); toneBus.gain.value = TONE_VOL; toneBus.connect(sfxBus);      // 爆炸以外的音效走這裡
    const conv = ac.createConvolver(); conv.buffer = makeImpulse(ac, 1.5, 2.8);
    revSend = ac.createGain(); revSend.gain.value = 0.2; revSend.connect(conv); conv.connect(master);
    whiteBuf = makeNoise(ac, 1, false);
    renderBooms();
  }
  if (ac.state === 'suspended') { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 忽略 */ } }
  return ac;
}
function envGain(t, a, peak, d) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return g;
}
/* 木琴：基音＋很快消失的 4 倍泛音 */
function mallet(f, t, dur, vol, bus, wet) {
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g1 = envGain(t, 0.004, vol, dur), g2 = envGain(t, 0.002, vol * 0.4, dur * 0.22);
  o1.type = 'sine'; o1.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 4;
  o1.connect(g1); o2.connect(g2); g1.connect(bus); g2.connect(bus);
  if (wet) { g1.connect(revSend); }
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur * 0.3 + 0.05);
}
/* 撥弦：兩個略微走音的鋸齒波，低通濾波很快關起來 */
function pluck(f, t, dur, vol, bus) {
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = envGain(t, 0.005, vol, dur);
  o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f * 1.004;
  lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(Math.min(9000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.4), t + dur * 0.6);
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus);
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function bassNote(f, t, dur, vol, bus) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = envGain(t, 0.012, vol, dur);
  o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
  lp.type = 'lowpass'; lp.frequency.value = 700;
  const g2 = ac.createGain(); g2.gain.value = 0.35;
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function bell(f, t, dur, vol, bus) {
  [[1, 1], [2.76, 0.45], [5.4, 0.22]].forEach(p => {
    const o = ac.createOscillator(), g = envGain(t, 0.003, vol * p[1], dur / Math.sqrt(p[0]));
    o.type = 'sine'; o.frequency.value = f * p[0]; o.connect(g); g.connect(bus); g.connect(revSend);
    o.start(t); o.stop(t + dur + 0.05);
  });
}
function noiseHit(t, dur, vol, type, f0, f1, q, bus) {
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = envGain(t, 0.002, vol, dur);
  s.buffer = whiteBuf; s.loop = true; fl.type = type; fl.Q.value = q || 0.8;
  fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus || toneBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function thump(t, f0, f1, dur, vol, bus) {
  const o = ac.createOscillator(), g = envGain(t, 0.003, vol, dur);
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  o.connect(g); g.connect(bus || toneBus); o.start(t); o.stop(t + dur + 0.05);
}
/* 離線把爆炸聲算好：一般的、大顆的各一個 */
function renderBooms() {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return;
  const make = (dur, big) => {
    const sr = 44100, oc = new OAC(1, Math.floor(sr * dur), sr), k = big ? 1.4 : 1;
    const brown = makeNoise(oc, dur, true), white = makeNoise(oc, dur, false);
    const out = oc.createGain(); out.gain.value = 0.8; out.connect(oc.destination);
    const conv = oc.createConvolver(); conv.buffer = makeImpulse(oc, big ? 2.0 : 1.5, 2.2);
    const wet = oc.createGain(); wet.gain.value = 0.42; out.connect(conv); conv.connect(wet); wet.connect(oc.destination);
    const src = (buf, off) => { const s = oc.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off || 0); return s; };
    // 音量包絡：t 秒開始是 peak，d 秒後降到 floor，再慢慢收到沒有聲音
    const eg = (t, peak, d, floor) => {
      const g = oc.createGain(); if (t > 0) g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(floor || 0.0001, t + d);
      if (floor && t + d < dur - 0.05) g.gain.exponentialRampToValueAtTime(0.0001, dur - 0.02);
      return g;
    };
    // 1 衝擊波：非常短的寬頻爆裂
    const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g1 = eg(0, 0.7, 0.03); src(white).connect(hp); hp.connect(g1); g1.connect(out);
    // 2 主體：棕色雜訊先失真，低通從高頻掃下來，停在手機喇叭還放得出來的頻率
    const ws = oc.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(3.2 * x); }
    ws.curve = curve;
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(5200, 0); lp.frequency.exponentialRampToValueAtTime(260, 0.8 * k);
    const pre = oc.createGain(); pre.gain.value = 3;
    const g2 = eg(0, 1.0, 0.9 * k, 0.035); src(brown).connect(pre); pre.connect(ws); ws.connect(lp); lp.connect(g2); g2.connect(out);
    // 3 中頻的轟鳴：帶通雜訊加上忽大忽小的抖動，聽起來像火焰翻滾
    const bp0 = oc.createBiquadFilter(); bp0.type = 'bandpass'; bp0.Q.value = 0.6;
    bp0.frequency.setValueAtTime(1300, 0); bp0.frequency.exponentialRampToValueAtTime(380, 0.7 * k);
    const fl = oc.createGain(); for (let t = 0; t < dur; t += 0.022) fl.gain.setValueAtTime(0.55 + Math.random() * 0.45, t);
    const g3m = eg(0.005, 0.5, 0.8 * k, 0.012); src(white, 0.2).connect(bp0); bp0.connect(fl); fl.connect(g3m); g3m.connect(out);
    // 4 低頻下墜：打在胸口的那一下（耳機和大喇叭才聽得到）
    const sub = oc.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(big ? 110 : 130, 0); sub.frequency.exponentialRampToValueAtTime(big ? 28 : 36, 0.34 * k);
    const g3 = eg(0, 0.9, 0.55 * k); sub.connect(g3); g3.connect(out); sub.start(0);
    // 5 隆隆的尾音
    const lp2 = oc.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 170;
    const pre2 = oc.createGain(); pre2.gain.value = 3;
    const g4 = eg(0.03, 0.6, dur - 0.15); src(brown, 0.3).connect(pre2); pre2.connect(lp2); lp2.connect(g4); g4.connect(out);
    // 6 碎片劈啪聲
    for (let n = 0; n < (big ? 22 : 12); n++) {
      const t = 0.07 + Math.random() * 0.6 * k, bp = oc.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 3600; bp.Q.value = 2.5;
      const g5 = oc.createGain(); g5.gain.setValueAtTime(0.0001, 0); g5.gain.setValueAtTime(0.06 + Math.random() * 0.14, t); g5.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.03);
      src(white, Math.random() * 0.5).connect(bp); bp.connect(g5); g5.connect(out);
    }
    const p = oc.startRendering();
    if (p && p.then) return p;
    return new Promise(res => { oc.oncomplete = e => res(e.renderedBuffer); });
  };
  const norm = b => { const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); if (pk > 0) { const k2 = 0.92 / pk; for (let i = 0; i < d.length; i++) d[i] *= k2; } return b; };
  try { Promise.all([make(1.9, false), make(2.8, true)]).then(b => { booms = b.map(norm); }).catch(() => {}); } catch (e) { /* 算不出來就用備用的即時版本 */ }
}
function playBoom(big, vol) {
  const a = audio(); if (!a || !sfxOn) return;
  const t = a.currentTime;
  if (booms) {
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = booms[big ? 1 : 0]; s.playbackRate.value = 0.9 + Math.random() * 0.2; g.gain.value = vol;
    s.connect(g); g.connect(sfxBus); s.start(t);
  } else { noiseHit(t, 0.5, vol * 0.7, 'lowpass', 2400, 90, 0.7); thump(t, 120, 38, 0.4, vol * 0.8); }
  if (musicOn) { musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(MUSIC_VOL * 0.55, t); musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, t + 0.45); }
}
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91];
const sfx = {
  on() { const a = audio(); return a && sfxOn ? a.currentTime : -1; },
  select() { const t = this.on(); if (t < 0) return; mallet(m2f(84), t, 0.12, 0.14, toneBus); noiseHit(t, 0.03, 0.05, 'bandpass', 2400, 0, 3); },
  deny() { const t = this.on(); if (t < 0) return; thump(t, 190, 120, 0.12, 0.2); thump(t + 0.09, 150, 100, 0.14, 0.18); },
  button() { const t = this.on(); if (t < 0) return; mallet(m2f(79), t, 0.1, 0.14, toneBus); mallet(m2f(84), t + 0.07, 0.16, 0.14, toneBus, true); },
  hint() { const t = this.on(); if (t < 0) return; bell(m2f(88), t, 0.5, 0.1, toneBus); bell(m2f(93), t + 0.1, 0.6, 0.1, toneBus); },
  tick(t) { noiseHit(t, 0.025, 0.22, 'bandpass', 3200, 0, 6); noiseHit(t + 0.12, 0.025, 0.16, 'bandpass', 2300, 0, 6); },      // 定時炸彈：滴答
  wave(w) {
    const t = this.on(); if (t < 0) return;
    if (S.display.some(o => o && o.at)) this.tick(t);
    if (!w.items.length) return;      // 只有定時炸彈在倒數的那一波
    const k = Math.min(w.k - 1, SCALE.length - 1), f = m2f(SCALE[k]);
    mallet(f, t, 0.3, 0.2, toneBus, true); pluck(f / 2, t, 0.25, 0.07, toneBus);
    const acts = w.items.filter(it => !it.stay && !it.eaten);      // 真的動作的（不算裂開、鎖著、擋住、點燃、被吞掉）
    const has = type => acts.some(it => it.o.t === type);
    const bombs = acts.filter(it => it.o.t === 'bomb');
    if (bombs.length) playBoom(bombs.some(it => it.o.big), Math.min(1, 0.6 + 0.12 * bombs.length));
    if (has('arrow') || has('cross') || has('diag')) noiseHit(t, 0.2, 0.16, 'bandpass', 700, 3800, 1.4);            // 咻
    if (w.fx.some(f2 => f2.out)) { bell(m2f(86), t + 0.04, 0.5, 0.06, toneBus); bell(m2f(93), t + 0.1, 0.6, 0.05, toneBus); noiseHit(t, 0.3, 0.08, 'bandpass', 900, 5000, 3); }      // 穿過傳送門：嗡——叮
    if (w.items.some(it => it.shield)) { bell(m2f(74), t, 0.3, 0.07, toneBus); noiseHit(t, 0.06, 0.26, 'bandpass', 2600, 0, 4); thump(t, 320, 210, 0.08, 0.2); }      // 鋼箱：鏘
    if (w.items.some(it => it.lit)) { noiseHit(t, 0.05, 0.12, 'highpass', 5000, 0, 0.8); bell(m2f(88), t, 0.25, 0.05, toneBus); }      // 點燃引信
    if (has('hole')) { thump(t, 170, 38, 0.6, 0.38); noiseHit(t, 0.55, 0.2, 'lowpass', 1400, 110, 0.8); }      // 黑洞：低沉的吸氣聲
    if (w.items.some(it => it.eaten)) {      // 被吞掉：往下掉的咻嗚
      const o = ac.createOscillator(), g = envGain(t, 0.01, 0.07, 0.32); o.type = 'triangle'; o.frequency.setValueAtTime(820, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.32);
      o.connect(g); g.connect(toneBus); o.start(t); o.stop(t + 0.4);
    }
    if (has('link')) {      // 滋——放電
      const o = ac.createOscillator(), g = envGain(t, 0.004, 0.09, 0.22); o.type = 'sawtooth'; o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.2);
      o.connect(g); g.connect(toneBus); o.start(t); o.stop(t + 0.3); noiseHit(t, 0.18, 0.14, 'highpass', 3500, 0, 0.8); bell(m2f(91), t + 0.02, 0.4, 0.06, toneBus);
    }
    if (has('gem')) [0, 1, 2].forEach(n => mallet(m2f(SCALE[Math.min(k + 5 + n * 2, 13)] + 12), t + 0.03 + n * 0.05, 0.25, 0.09, toneBus, true));
    if (has('crate')) { noiseHit(t, 0.07, 0.3, 'bandpass', 520, 0, 1.2); thump(t, 200, 90, 0.1, 0.25); }  // 木頭裂開
    if (has('mirror')) {      // 叮——玻璃的聲音；沒轉彎就碎掉的再加一聲碎裂
      bell(m2f(96), t, 0.4, 0.07, toneBus); noiseHit(t, 0.05, 0.1, 'highpass', 6500, 0, 0.8);
      if (w.items.some(it => it.dud)) noiseHit(t + 0.02, 0.22, 0.2, 'highpass', 3800, 0, 0.7);
    }
    if (has('key')) [84, 88, 91, 96].forEach((m, n) => bell(m2f(m), t + n * 0.055, 0.5, 0.075, toneBus));      // 鑰匙：一串往上的鈴聲
    if (has('chest')) {      // 寶箱：喀一聲打開，金幣嘩啦啦
      thump(t, 220, 90, 0.12, 0.3); noiseHit(t, 0.06, 0.25, 'bandpass', 700, 0, 1.2);
      for (let n = 0; n < 9; n++) mallet(m2f(88 + [0, 3, 5, 8, 10][Math.floor(Math.random() * 5)]), t + 0.06 + n * 0.045, 0.16, 0.07, toneBus, n % 3 === 0);
      noiseHit(t + 0.05, 0.45, 0.07, 'highpass', 7000, 0, 0.7);
    }
    if (w.items.some(it => it.locked)) { thump(t, 170, 120, 0.07, 0.22); noiseHit(t + 0.03, 0.04, 0.16, 'bandpass', 1300, 0, 2); noiseHit(t + 0.1, 0.04, 0.12, 'bandpass', 1500, 0, 2); }  // 鎖著：喀啦喀啦
    if (has('iron') || w.items.some(it => it.crack)) { noiseHit(t, 0.16, 0.3, 'lowpass', 900, 160, 0.8); thump(t, 110, 55, 0.2, 0.4); }
  },
  star(n) { const t = this.on(); if (t < 0) return; bell(m2f(79 + n * 4), t, 0.7, 0.13, toneBus); mallet(m2f(67 + n * 4), t, 0.3, 0.12, toneBus, true); },
  clear() {
    const t = this.on(); if (t < 0) return;
    [72, 76, 79, 84, 88, 91].forEach((m, i) => { mallet(m2f(m), t + i * 0.075, 0.5, 0.17, toneBus, true); if (i > 2) bell(m2f(m), t + i * 0.075, 0.9, 0.07, toneBus); });
    noiseHit(t + 0.4, 0.9, 0.08, 'highpass', 6000, 0, 0.7);
  },
  pop() { const t = this.on(); if (t < 0) return; noiseHit(t, 0.12, 0.2, 'bandpass', 1800, 600, 1); thump(t, 300, 120, 0.1, 0.2); bell(m2f(84 + Math.floor(Math.random() * 5) * 2), t + 0.02, 0.6, 0.06, toneBus); },
  fail() { const t = this.on(); if (t < 0) return; [67, 64, 60].forEach((m, i) => mallet(m2f(m), t + i * 0.17, 0.4, 0.16, toneBus, true)); }
};

/* ---- 配樂：16 小節循環，C 大調五聲音階，104 BPM ---- */
const BPM = 104, STEP = 60 / BPM / 2;
const MEL = [
  [76, 0, 79, 76, 74, 0, 72, 0], [69, 0, 72, 74, 76, 0, 0, 0], [74, 0, 76, 74, 72, 0, 69, 0], [67, 0, 69, 72, 74, 0, 0, 0],
  [76, 0, 79, 76, 74, 0, 72, 0], [69, 0, 72, 74, 76, 0, 79, 0], [81, 0, 79, 76, 74, 0, 76, 0], [74, 0, 72, 0, 72, 0, 0, 0],
  [72, 76, 81, 0, 79, 0, 76, 0], [72, 74, 81, 0, 79, 0, 74, 0], [76, 0, 76, 79, 76, 74, 72, 0], [74, 0, 0, 74, 76, 0, 74, 0],
  [76, 0, 79, 76, 74, 0, 72, 0], [69, 0, 72, 74, 76, 0, 79, 0], [81, 0, 79, 76, 74, 0, 76, 0], [74, 0, 72, 0, 72, 0, 0, 0]
];
const CH = { C: [48, [60, 64, 67]], A: [45, [57, 60, 64]], F: [53, [57, 60, 65]], G: [43, [55, 59, 62]] };
const PROG = ['C', 'A', 'F', 'G', 'C', 'A', 'F', 'G', 'A', 'F', 'C', 'G', 'C', 'A', 'F', 'G'];
let mStep = 0, mTime = 0, mTimer = 0;
function schedStep(n, t) {
  const bar = (n >> 3) % 16, s = n & 7, lastHalf = (bar === 7 || bar === 15) && s >= 4;
  const ch = CH[lastHalf ? 'C' : PROG[bar]], isB = bar >= 8 && bar < 12;
  const m = MEL[bar][s];
  if (m) { mallet(m2f(m), t, 0.42, 0.2, musicBus, true); if (isB) bell(m2f(m + 12), t, 0.5, 0.03, musicBus); }
  if (s === 0 || s === 4) bassNote(m2f(ch[0] + (s === 4 ? 7 : 0)), t, 0.36, 0.2, musicBus);
  if (s === 3 || s === 6) bassNote(m2f(ch[0] + 12), t, 0.2, 0.12, musicBus);
  if (s & 1) pluck(m2f(ch[1][(s >> 1) % 3] + 12), t, 0.3, 0.035, musicBus);
  if (s === 0 || s === 4) thump(t, 130, 52, 0.14, 0.22, musicBus);
  if (s === 2 || s === 6) { const o = ac.createOscillator(), g = envGain(t, 0.001, 0.09, 0.06); o.type = 'sine'; o.frequency.value = s === 2 ? 880 : 1100; o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.1); }
  noiseHit(t, 0.035, s & 1 ? 0.035 : 0.018, 'highpass', 7500, 0, 0.7, musicBus);
}
function musicTick() {
  if (!ac || !musicOn || ac.state !== 'running') return;
  if (mTime < ac.currentTime) mTime = ac.currentTime + 0.08;
  while (mTime < ac.currentTime + 0.3) { schedStep(mStep, mTime); mStep = (mStep + 1) % 128; mTime += STEP; }
}
function startMusic() { if (!audio() || mTimer) return; mTimer = setInterval(musicTick, 70); musicTick(); }
function setBus() {
  if (!ac) return; const t = ac.currentTime;
  musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(sfxOn ? 1 : 0, t, 0.02);
}
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  try { if (document.hidden) ac.suspend(); else ac.resume(); } catch (e) { /* 忽略 */ }
});

/* ---------- 版面尺寸 ---------- */
function layout() {
  const stage = $('stage'), app = $('app');
  const availW = stage.clientWidth - 14 - 10;
  let c = Math.floor(availW / W);
  if (app.clientHeight > 420) c = Math.min(c, Math.floor((stage.clientHeight - 68 - 4 - 14 - 16) / H));
  c = Math.max(30, Math.min(74, c));
  // 盤面上下還有空位時，把熊貓的對話盒往上提，貼近計分板（上面最多留 16px）；盤面放在剩下空間的中間
  const spare = Math.max(0, app.clientHeight > 420 ? stage.clientHeight - 68 - 4 - (H * c + 14) : 0);
  const topGap = Math.min(16, spare * 0.2), lift = (spare - topGap) / 2;
  stage.style.setProperty('--lift', Math.round(lift) + 'px');
  stage.style.setProperty('--up', Math.round(spare - lift - 2 * topGap) + 'px');
  dpr = Math.min(3, window.devicePixelRatio || 1);
  const pw = Math.round(W * c * dpr), ph = Math.round(H * c * dpr);
  if (c === cs && cv.width === pw && cv.height === ph) return;
  if (c !== cs) tileCache = null;
  cs = c;
  cv.style.width = W * c + 'px'; cv.style.height = H * c + 'px';
  cv.width = pw; cv.height = ph;
}
const center = i => [(i % W + 0.5) * cs, (((i / W) | 0) + 0.5) * cs];

/* ---------- 畫機關 ---------- */
function rr(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function getTiles() {      // 兩種格子（一般、炸過的）先畫好存起來
  if (tileCache) return tileCache;
  const mk = burnt => {
    const o = document.createElement('canvas'); o.width = o.height = Math.round(cs * dpr);
    const c = o.getContext('2d'); c.scale(dpr, dpr);
    const g = Math.max(2, cs * 0.04), rad = cs * 0.18;
    const gr = c.createLinearGradient(0, g, 0, cs - g);
    if (burnt) { gr.addColorStop(0, '#b7cdb9'); gr.addColorStop(1, '#a3bda7'); } else { gr.addColorStop(0, '#fbfff6'); gr.addColorStop(1, '#dff2dc'); }
    rr(c, g, g + 2, cs - 2 * g, cs - 2 * g, rad); c.fillStyle = 'rgba(20,92,49,.38)'; c.fill();
    rr(c, g, g, cs - 2 * g, cs - 2 * g - 1.5, rad); c.fillStyle = gr; c.fill();
    if (burnt) {      // 一點焦痕
      const sg = c.createRadialGradient(cs / 2, cs / 2, 0, cs / 2, cs / 2, cs * 0.4);
      sg.addColorStop(0, 'rgba(60,70,62,.28)'); sg.addColorStop(1, 'rgba(60,70,62,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(cs / 2, cs / 2, cs * 0.4, 0, Math.PI * 2); c.fill();
    }
    return o;
  };
  tileCache = [mk(false), mk(true)];
  return tileCache;
}
function drawObj(c, o, cx, cy, s, t, seed) {
  const key = keyOf(o), sp = SPR[key];
  if (atlasOk) {
    c.fillStyle = 'rgba(20,60,35,.2)'; c.beginPath(); c.ellipse(cx, cy + s * 0.37, s * 0.27, s * 0.065, 0, 0, Math.PI * 2); c.fill();
    const size = s * sp[2];
    c.save(); c.translate(cx + sp[3] * s, cy + sp[4] * s);
    if (o.t === 'arrow') c.rotate(o.d * Math.PI / 2);
    if (o.t === 'mirror' && o.m) c.scale(-1, 1);      // 「＼」是「／」左右翻過來
    if (o.t === 'mirror') c.rotate(0.13);                // 圖畫得比 45 度陡一點，轉正
    if (o.t === 'gem' || o.t === 'link' || o.t === 'key') { const p = 1 + 0.035 * Math.sin(t * 3 + seed); c.scale(p, p); }
    if (o.t === 'portal') c.rotate(t * 1.6);      // 傳送門慢慢轉
    if (o.t === 'hole') c.rotate(-t * 2.2);       // 黑洞反方向轉得快一點
    c.drawImage(atlas, sp[0] * 192, sp[1] * 192, 192, 192, -size / 2, -size / 2, size, size);
    c.restore();
    if (o.t === 'bomb') {      // 引信的火花一閃一閃；定時炸彈的引信在比較裡面，點燃後閃得更快
      const tm = o.timer, fx = cx + s * (tm ? 0.28 : 0.33), fy = cy - s * (tm ? 0.42 : 0.4), r = s * (0.1 + 0.07 * Math.abs(Math.sin(t * (o.at ? 20 : 8) + seed)));
      const gr = c.createRadialGradient(fx, fy, 0, fx, fy, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.4, 'rgba(255,214,74,.75)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); c.fill();
    }
  } else {      // 圖片還沒載好時的簡單樣子
    const col = { bomb: '#1c2540', bigbomb: '#d9362b', arrow: '#ffffff', cross: C.orange, crossv: C.orange, link: '#3f8cff', gem: '#3ddb5a', crate: '#c98d4b', iron: '#9aa39c', mirror: '#8fd3ff', key: '#ffd24a', chest: '#b9772e',
      diag: C.orange, steel: '#6f8496', portal: '#8a5cff', timer: '#26332c', hole: '#2a1450' }[key];
    c.fillStyle = col; c.strokeStyle = C.ink; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, s * 0.28, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  if (o.t === 'iron') {
    if ((o.hp || 2) < 2) {      // 裂痕
      c.strokeStyle = C.ink; c.lineWidth = Math.max(2.5, s * 0.05); c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx - s * 0.2, cy - s * 0.26); c.lineTo(cx - s * 0.02, cy - s * 0.06); c.lineTo(cx - s * 0.12, cy + s * 0.04); c.lineTo(cx + s * 0.1, cy + s * 0.26);
      c.moveTo(cx - s * 0.02, cy - s * 0.06); c.lineTo(cx + s * 0.2, cy - s * 0.14); c.stroke();
    }
    const bx = cx + s * 0.3, by = cy - s * 0.3;      // 還要打幾下
    c.fillStyle = C.coral; c.beginPath(); c.arc(bx, by, s * 0.17, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '400 ' + Math.round(s * 0.22) + 'px Bungee, sans-serif';
    c.fillText(String(o.hp || 2), bx, by + 1);
  }
  if (o.at) {      // 點燃的定時炸彈：右上角倒數還有幾波爆炸
    const bx = cx + s * 0.3, by = cy - s * 0.3, n = Math.max(1, o.at - S.wave);
    c.fillStyle = C.coral; c.beginPath(); c.arc(bx, by, s * 0.17, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '400 ' + Math.round(s * 0.22) + 'px Bungee, sans-serif';
    c.fillText(String(n), bx, by + 1);
  }
  if (o.t === 'chest' && lockOn) {      // 鑰匙還在：右上角掛一個鎖
    const bx = cx + s * 0.3, by = cy - s * 0.3, r = s * 0.17;
    c.fillStyle = C.coral; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    c.lineWidth = Math.max(1.6, r * 0.24); c.lineCap = 'round';
    c.beginPath(); c.arc(bx, by - r * 0.18, r * 0.3, Math.PI, 0); c.stroke();      // 鎖頭
    c.fillStyle = '#fff'; rr(c, bx - r * 0.48, by - r * 0.18, r * 0.96, r * 0.7, r * 0.16); c.fill();
  }
}
let lockOn = false;

/* ---------- 特效 ---------- */
const P = [], R = [], B = [], F = [], G = [], SM = [], SP = [];
let shake = 0, flashA = 0;
const PAL = {
  bomb: ['#1c2540', '#ff9f1c', '#ffd24a', '#ffffff', '#ff6f61'], arrow: ['#ffffff', '#e23b2e', '#ffb347'], cross: ['#ff9f1c', '#ffffff', '#ffd24a'],
  link: ['#4aa8ff', '#ffe36b', '#ffffff'], gem: ['#3ddb5a', '#b6ffc4', '#ffffff'], crate: ['#c98d4b', '#8a5a2b', '#f1d3a0'], iron: ['#9aa39c', '#6f7a72', '#cfd6d0'],
  mirror: ['#8fd3ff', '#ffffff', '#ffd24a', '#cdeeff'], key: ['#ffd24a', '#fff0a8', '#ffffff'], chest: ['#ffd24a', '#ffb300', '#fff0a8', '#c98d4b'],
  diag: ['#ff9f1c', '#ffffff', '#ffd24a'], steel: ['#8fa3b5', '#5d6f80', '#dfe7ee', '#ffffff'], hole: ['#7a4dff', '#2a1450', '#c9a8ff'], portal: ['#8a5cff', '#5ad1ff', '#ffffff']
};
function burst(i, o, small) {
  const [x, y] = center(i), cols = PAL[o.t];
  const n = reduce ? 3 : small ? 6 : (o.t === 'bomb' ? 22 : 13);
  for (let p = 0; p < n; p++) {
    const a = Math.random() * Math.PI * 2, sp = cs * (1.6 + Math.random() * 4.8);
    P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cs * 1.2, g: cs * 9, life: 0, max: 0.5 + Math.random() * 0.6,
      c: cols[p % cols.length], s: cs * (0.07 + Math.random() * 0.09), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, spark: o.t === 'bomb' && p % 3 === 0, leaf: o.t !== 'bomb' && p % 2 === 0 });
  }
  R.push({ x, y, r0: cs * 0.15, r1: cs * 0.78, life: 0, max: 0.28, c: '#ffffff', w: cs * 0.09 });
  if (!small) G.push({ x, y, r: cs * (o.t === 'bomb' ? 1.15 : 0.75), life: 0, max: 0.3, c: o.t === 'bomb' ? '255,170,40' : '255,235,140' });
  if (o.t === 'bomb' && !reduce) for (let p = 0; p < 4; p++) SM.push({ x: x + (Math.random() - 0.5) * cs * 0.6, y: y + (Math.random() - 0.5) * cs * 0.5, vx: (Math.random() - 0.5) * cs * 0.6, vy: -cs * (0.5 + Math.random() * 0.8), r: cs * (0.28 + Math.random() * 0.22), life: 0, max: 0.7 + Math.random() * 0.5 });
  if (P.length > 900) P.splice(0, P.length - 900);
}
function addFx(f) {
  const [x, y] = center(f.i);
  if (f.k === 'blast') {
    R.push({ x, y, r0: cs * 0.3, r1: cs * (f.r + 0.5), life: 0, max: 0.38, c: C.orange, w: cs * 0.18 });
    G.push({ x, y, r: cs * (f.r + 0.7), life: 0, max: 0.36, c: '255,150,40' });
  } else if (f.k === 'beam') {
    let x1, y1;
    if (f.to < 0) { x1 = x + DIRS[f.d][0] * cs * 0.5; y1 = y + DIRS[f.d][1] * cs * 0.5; }
    else { [x1, y1] = center(f.to); if (!f.hit && !f.gate) { x1 += DIRS[f.d][0] * cs * 0.5; y1 += DIRS[f.d][1] * cs * 0.5; } }
    // 鏡子轉出來的是藍色；走進、走出傳送門的是紫色
    B.push({ x0: x, y0: y, x1, y1, life: 0, max: f.mirror || f.out ? 0.4 : 0.32, c: f.mirror ? '70,180,255' : f.gate || f.out ? '160,100,255' : '255,120,50' });
  } else if (f.k === 'link') {
    const [x1, y1] = center(f.to);
    B.push({ x0: x, y0: y, x1, y1, life: 0, max: 0.36, c: '80,160,255' });
  } else if (f.k === 'ring') {
    R.push({ x, y, r0: cs * 0.3, r1: cs * 1.25, life: 0, max: 0.34, c: C.sun, w: cs * 0.12 });
  } else if (f.k === 'hole') {      // 黑洞：一圈往內縮的紫光
    R.push({ x, y, r0: cs * 1.6, r1: cs * 0.1, life: 0, max: 0.45, c: '#7a4dff', w: cs * 0.16 });
    G.push({ x, y, r: cs * 1.3, life: 0, max: 0.45, c: '110,60,240' });
  }
}
/* 寶箱打開：開箱的圖跳出來放大淡出，金幣噴一地 */
function openChest(i) {
  const [x, y] = center(i);
  SP.push({ k: 'chestopen', x, y, life: 0, max: 0.75 });
  G.push({ x, y, r: cs * 1.5, life: 0, max: 0.5, c: '255,215,90' });
  if (reduce) return;
  for (let p = 0; p < 26; p++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = cs * (4 + Math.random() * 5);
    P.push({ x, y: y - cs * 0.1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: cs * 14, life: 0, max: 0.7 + Math.random() * 0.5, c: p % 3 ? '#ffd24a' : '#fff0a8', s: cs * (0.11 + Math.random() * 0.05), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, leaf: true });
  }
}
function floatText(i, text, strong) {
  const [x, y] = center(i);
  F.push({ x, y: y - cs * 0.1, text, life: 0, max: 0.9, c: strong ? '#ffe36b' : '#ffffff', s: cs * (strong ? 0.38 : 0.3) });
}
function fireworks() {
  if (reduce) return;
  const cols = ['#ff6f61', '#ffd24a', '#4db869', '#6ec8f0', '#ff9ad5', '#ffffff'];
  for (let b = 0; b < 6; b++) {
    setTimeout(() => {
      const x = (0.12 + Math.random() * 0.76) * W * cs, y = (0.1 + Math.random() * 0.6) * H * cs;
      G.push({ x, y, r: cs * 1.8, life: 0, max: 0.4, c: '255,225,120' });
      for (let p = 0; p < 34; p++) {
        const a = p / 34 * Math.PI * 2 + Math.random() * 0.2, sp = cs * (3 + Math.random() * 3.5);
        P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cs, g: cs * 5, life: 0, max: 0.9 + Math.random() * 0.6, c: cols[(p + b) % cols.length], s: cs * (0.1 + Math.random() * 0.06), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, leaf: p % 3 === 0 });
      }
      sfx.pop();
    }, b * 170);
  }
}

/* ---------- 每一格的畫面 ---------- */
let last = now();
function frame() {
  const tN = now(), dt = Math.min(0.05, (tN - last) / 1000); last = tN;
  const t = tN / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W * cs, H * cs);
  ctx.save();
  if (shake > 0.2 && !reduce) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.0015, dt); } else shake = 0;
  const g = Math.max(2, cs * 0.04), rad = cs * 0.18, tiles = getTiles();
  for (let i = 0; i < N; i++) ctx.drawImage(S.scorch[i] ? tiles[1] : tiles[0], (i % W) * cs, ((i / W) | 0) * cs, cs, cs);

  // 選取時：這個機關直接打得到的範圍
  if (S.reach) {
    ctx.fillStyle = 'rgba(255,200,40,' + (0.42 + 0.12 * Math.sin(t * 6)).toFixed(3) + ')';
    for (const i of S.reach.area) { const x = (i % W) * cs, y = ((i / W) | 0) * cs; rr(ctx, x + g, y + g, cs - 2 * g, cs - 2 * g - 1.5, rad); ctx.fill(); }
    ctx.strokeStyle = C.coral; ctx.lineWidth = 3; ctx.setLineDash([cs * 0.12, cs * 0.1]); ctx.lineDashOffset = -t * cs * 0.8;
    for (const b of S.reach.beams) { ctx.beginPath(); ctx.moveTo(b.x0 * cs, b.y0 * cs); ctx.lineTo(b.x1 * cs, b.y1 * cs); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const guideCell = S.tut === 1 ? S.lv.solution[0] : -1;
  lockOn = S.display.some(o => o && o.t === 'key');
  // 機關
  for (let i = 0; i < N; i++) {
    const o = S.display[i]; if (!o) continue;
    let [cx, cy] = center(i);
    let sc = 1;
    if (!reduce) {
      const age = (tN - S.born - ((i % W) + ((i / W) | 0)) * 34) / 300;
      if (age < 1) { if (age <= 0) continue; const q = age - 1; sc = 1 + 2.2 * q * q * q + 1.2 * q * q; }
      const wg = S.wig[i]; if (wg) { const a = (tN - wg) / 350; if (a < 1) cx += Math.sin(a * Math.PI * 6) * cs * 0.07 * (1 - a); else delete S.wig[i]; }
      if (S.sel === i || S.hint === i || guideCell === i) sc *= 1 + 0.06 * Math.sin(t * 7);
    }
    if (guideCell >= 0 && guideCell !== i) ctx.globalAlpha = 0.45;
    drawObj(ctx, o, cx, cy, cs * sc, t, i);
    ctx.globalAlpha = 1;
  }
  // 會被打到的目標外框
  if (S.reach) {
    ctx.strokeStyle = C.coral; ctx.lineWidth = Math.max(2.5, cs * 0.055);
    for (const i of S.reach.hits) { const x = (i % W) * cs, y = ((i / W) | 0) * cs; rr(ctx, x + g, y + g, cs - 2 * g, cs - 2 * g - 1.5, rad); ctx.stroke(); }
  }
  const ring = (i, col) => {
    const x = (i % W) * cs, y = ((i / W) | 0) * cs;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(5, cs * 0.11); rr(ctx, x + g, y + g, cs - 2 * g, cs - 2 * g - 1.5, rad); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, cs * 0.065); rr(ctx, x + g, y + g, cs - 2 * g, cs - 2 * g - 1.5, rad); ctx.stroke();
  };
  if (S.sel >= 0) ring(S.sel, C.orange);
  const pointAt = S.hint >= 0 && S.hint !== S.sel ? S.hint : guideCell;
  if (pointAt >= 0 && S.display[pointAt]) {      // 指引：外框加上一個會跳的箭頭
    ring(pointAt, C.pink);
    const [px, py] = center(pointAt), bob = Math.abs(Math.sin(t * 4)) * cs * 0.16;
    const up = py < cs;      // 在最上面一列時改從下面指
    const ty = up ? py + cs * 0.52 + bob : py - cs * 0.52 - bob, dir = up ? -1 : 1;
    ctx.fillStyle = C.pink; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(px, ty + dir * cs * 0.17); ctx.lineTo(px - cs * 0.21, ty - dir * cs * 0.15); ctx.lineTo(px + cs * 0.21, ty - dir * cs * 0.15); ctx.closePath();
    ctx.stroke(); ctx.fill();
  }
  if (S.kb && S.cursor >= 0 && document.activeElement === cv) {
    const x = (S.cursor % W) * cs, y = ((S.cursor / W) | 0) * cs;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    rr(ctx, x + 1, y + 1, cs - 2, cs - 2, rad); ctx.stroke(); ctx.setLineDash([]);
  }
  // 特效：煙、火光、震波、光束、碎片、分數
  for (let p = SM.length - 1; p >= 0; p--) {
    const a = SM[p]; a.life += dt; const q = a.life / a.max; if (q >= 1) { SM.splice(p, 1); continue; }
    a.x += a.vx * dt; a.y += a.vy * dt;
    ctx.globalAlpha = 0.34 * (1 - q); ctx.fillStyle = '#6f7d74';
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r * (0.6 + q * 1.1), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let p = G.length - 1; p >= 0; p--) {
    const a = G[p]; a.life += dt; const q = a.life / a.max; if (q >= 1) { G.splice(p, 1); continue; }
    const r = a.r * (0.35 + 0.65 * (1 - Math.pow(1 - q, 3)));
    const gr = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r), al = 1 - q;
    gr.addColorStop(0, 'rgba(255,255,255,' + (0.95 * al).toFixed(3) + ')'); gr.addColorStop(0.35, 'rgba(' + a.c + ',' + (0.85 * al).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + a.c + ',0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let p = SP.length - 1; p >= 0; p--) {
    const a = SP[p]; a.life += dt; const q = a.life / a.max; if (q >= 1) { SP.splice(p, 1); continue; }
    if (!atlasOk) continue;
    const sp = SPR[a.k], e = 1 - Math.pow(1 - Math.min(1, q * 2.2), 3), size = cs * sp[2] * (0.9 + 0.55 * e);
    ctx.globalAlpha = q > 0.6 ? (1 - q) / 0.4 : 1;
    ctx.drawImage(atlas, sp[0] * 192, sp[1] * 192, 192, 192, a.x - size / 2, a.y - size / 2 - cs * 0.18 * e, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  for (let p = B.length - 1; p >= 0; p--) {
    const b = B[p]; b.life += dt; const q = b.life / b.max; if (q >= 1) { B.splice(p, 1); continue; }
    ctx.strokeStyle = 'rgba(' + b.c + ',' + (0.9 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = cs * 0.26 * (1 - q) + 2; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (1 - q).toFixed(3) + ')'; ctx.lineWidth = cs * 0.09 * (1 - q) + 1; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
  }
  for (let p = R.length - 1; p >= 0; p--) {
    const r = R[p]; r.life += dt; const q = r.life / r.max; if (q >= 1) { R.splice(p, 1); continue; }
    const e = 1 - Math.pow(1 - q, 3), rad2 = r.r0 + (r.r1 - r.r0) * e;
    ctx.globalAlpha = 1 - q; ctx.strokeStyle = r.c; ctx.lineWidth = r.w * (1 - q * 0.7); ctx.beginPath(); ctx.arc(r.x, r.y, rad2, 0, Math.PI * 2); ctx.stroke();
  }
  for (let p = P.length - 1; p >= 0; p--) {
    const a = P[p]; a.life += dt; const q = a.life / a.max; if (q >= 1) { P.splice(p, 1); continue; }
    a.vy += a.g * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt; a.vx *= Math.pow(0.2, dt);
    ctx.globalAlpha = q > 0.7 ? (1 - q) / 0.3 : 1;
    if (a.spark) {
      ctx.strokeStyle = a.c === '#26332c' ? '#ff9f1c' : a.c; ctx.lineWidth = a.s * 0.55;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - a.vx * 0.04, a.y - a.vy * 0.04); ctx.stroke();
    } else {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); ctx.fillStyle = a.c;
      if (a.leaf) { ctx.beginPath(); ctx.ellipse(0, 0, a.s * 0.75, a.s * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-a.s / 2, -a.s / 3, a.s, a.s * 0.66);
      ctx.restore();
    }
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (let p = F.length - 1; p >= 0; p--) {
    const f = F[p]; f.life += dt; const q = f.life / f.max; if (q >= 1) { F.splice(p, 1); continue; }
    const y = f.y - cs * 0.8 * (1 - Math.pow(1 - q, 2));
    ctx.globalAlpha = q > 0.6 ? (1 - q) / 0.4 : 1;
    ctx.font = '400 ' + Math.round(f.s) + 'px Bungee, sans-serif';
    ctx.lineWidth = Math.max(4, f.s * 0.3); ctx.strokeStyle = C.ink; ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.c; ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
  if (flashA > 0.01 && !reduce) { ctx.fillStyle = 'rgba(255,255,255,' + flashA.toFixed(3) + ')'; ctx.fillRect(-20, -20, W * cs + 40, H * cs + 40); flashA *= Math.pow(0.001, dt); } else flashA = 0;
  ctx.restore();
  requestAnimationFrame(frame);
}

/* ---------- 計分板與熊貓 ---------- */
['g1', 'g2', 'g3'].forEach((id, n) => { $(id).querySelector('.gstar').innerHTML = STAR.repeat(n + 1); });
function hud() {
  $('lvNum').textContent = S.level;
  $('lvTag').hidden = !(S.lv && S.lv.cfg.bonus);
  const st = S.phase === 'idle' ? 0 : starsFor(S.bombsLeft, S.left);
  $('bombTxt').textContent = (S.bombs - S.bombsLeft) + '/' + S.bombs;
  ['g1', 'g2', 'g3'].forEach((id, n) => $(id).classList.toggle('on', st > n));
  if (st > S.starsShown && S.phase === 'chain') sfx.star(st);
  S.starsShown = st;
  $('leftN').textContent = S.left;
  $('score').textContent = fmt(S.score);
  $('goals').setAttribute('aria-label', '目標：炸彈 ' + (S.bombs - S.bombsLeft) + ' / ' + S.bombs + ' 顆已爆，還剩 ' + S.left + ' 個，' + st + ' 顆星');
  $('hintN').textContent = save.hints;
  $('hintBtn').disabled = !(S.phase === 'aim' && !S.tut);
  $('retryBtn').disabled = S.phase === 'chain' || !!S.tut;
}
let buddyPose = 0;
function setBuddy(p) {      // 0 揮手 1 歡呼 2 思考 3 往下指
  if (p === buddyPose) return; buddyPose = p;
  const el = $('buddy'); el.className = 'pal buddy p' + p; void el.offsetWidth; el.classList.add('hop');
}
function setTip(s, guide) { const el = $('tip'); el.textContent = s; el.classList.toggle('guide', !!guide && !!s); }
function defaultTip() {
  const L = S.level;
  if (L === 2) return '火箭也會引爆另一支火箭。找出最源頭、沒有人打得到的那一個';
  if (L === 3) return '每一關只有一個起點能全部炸光。找不到可以按「提示」';
  if (L === 6) return '小心假源頭：有些東西要等擋路的先被炸掉，才會被打到';
  if (L === 31) return '新盤面 7×8。鏡子會讓火箭和盤的射線轉彎，跟著路線想一想';
  if (L === 41) return '新盤面 8×9。要先打到鑰匙，寶箱才打得開，順序很重要';
  if (L === 51) return '盤面不再變大，但每 10 關多一種新物件。斜射盤往四個斜角射，想一想斜線經過哪裡';
  if (L === 61) return '鋼箱炸不壞，只有火箭、盤和鏡子的射線打得壞';
  if (L === 71) return '射線走進傳送門，會從另一個門出來，往同一個方向繼續飛';
  if (L === 81) return '定時炸彈要等 2 波才爆，倒數的時候會擋住射線，時間很重要';
  if (L === 91) return '黑洞會吞掉周圍的東西，被吞的炸彈不算爆炸。要讓旁邊的東西先動起來';
  if (L > 1 && L <= 41 && (L - 1) % 10 === 0) return '新的盤面：' + S.lv.W + '×' + S.lv.H + '，格子變多了！';
  if (S.lv.cfg.bonus) return '大關：東西特別多，但能全部炸光的起點還是只有一個';
  return '只能點一次，而且只有一個起點能全部炸光';
}
function showCombo(k) {
  const el = $('combo'); el.textContent = '×' + k;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
let flashTimer = 0;
function flash(text) {
  const el = $('flash'); el.textContent = text;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.remove('on'), 1200);
}

/* ---------- 流程 ---------- */
function startLevel(L, keepAttempt) {
  S.token++; closeSheet();
  L = Math.max(1, Math.min(LEVELS, L));
  S.level = L; S.lv = genLevel(L);      // 同時把盤面大小換成這一關的
  layout();
  S.board = S.lv.board.slice(); S.display = S.board.slice(); S.scorch = {}; S.wig = {};
  S.total = S.lv.total; S.left = S.total; S.bombs = S.lv.bombs; S.bombsLeft = S.bombs; S.score = 0; S.starsShown = 0;
  S.sel = -1; S.reach = null; S.hint = -1; S.born = now(); S.phase = 'aim'; S.lastR = null; S.cursor = -1; S.wave = 0;
  S.attempt = keepAttempt ? S.attempt + 1 : 1;
  S.tut = (L === 1 && !save.tut) ? 1 : 0;
  $('combo').classList.remove('on');
  save.last = L; persist();
  if (S.tut) { setBuddy(3); setTip('歡迎！每一關只能點一次，目標是讓所有炸彈都爆炸。先點粉紅箭頭指的火箭。', true); }
  else { setBuddy(0); setTip(defaultTip()); }
  hud();
  const intro = levelIntro(L);
  if (intro && !save.seen[intro] && !keepAttempt) { save.seen[intro] = 1; persist(); renderIntro(intro); }
}
function computeReach(i) {
  const r = simulate(S.board, i), a = actWave(r, i);      // 定時炸彈要看它真正爆炸的那一波
  const w = r.waves[a], area = new Set(), beams = [];
  const x = i % W, y = (i / W) | 0;
  for (const f of w.fx) {
    if (f.k === 'blast') {
      for (let dy = -f.r; dy <= f.r; dy++) for (let dx = -f.r; dx <= f.r; dx++) {
        const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H) area.add(ny * W + nx);
      }
    } else if (f.k === 'beam') {
      const sx = f.i % W, sy = (f.i / W) | 0;      // 射線從哪一格出發（穿過傳送門的那一段從另一個門開始）
      let ex = sx + 0.5, ey = sy + 0.5;
      if (f.to >= 0) {
        let cx = sx, cy = sy;
        for (;;) { cx += DIRS[f.d][0]; cy += DIRS[f.d][1]; area.add(cy * W + cx); if (cy * W + cx === f.to) break; }
        const half = f.hit || f.gate ? 0 : 0.5;
        ex = cx + 0.5 + DIRS[f.d][0] * half; ey = cy + 0.5 + DIRS[f.d][1] * half;
      } else { ex += DIRS[f.d][0] * 0.5; ey += DIRS[f.d][1] * 0.5; }
      beams.push({ x0: sx + 0.5, y0: sy + 0.5, x1: ex, y1: ey });
    } else if (f.k === 'link') { area.add(f.to); beams.push({ x0: x + 0.5, y0: y + 0.5, x1: f.to % W + 0.5, y1: ((f.to / W) | 0) + 0.5 }); }
    else if (f.k === 'ring') {
      for (let d = 0; d < 4; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx >= 0 && ny >= 0 && nx < W && ny < H) area.add(ny * W + nx); }
    }
  }
  const hits = r.waves[a + 1] ? r.waves[a + 1].items.map(it => it.i) : [];
  return { area: Array.from(area), beams, hits };
}
function clearSel() { S.sel = -1; S.reach = null; }
function onCell(i) {
  if (S.phase !== 'aim' || S.sheet || S.onTitle) return;
  if (S.tut && i !== S.lv.solution[0]) { S.wig[S.lv.solution[0]] = now(); sfx.deny(); return; }
  const o = S.display[i];
  if (!o) { clearSel(); setTip(defaultTip()); return; }
  const nm = NAMES[keyOf(o)];
  if (!ACTIVE[o.t]) { clearSel(); S.wig[i] = now(); setTip(nm[0] + '：' + nm[1] + '。它不能直接點'); sfx.deny(); return; }
  if (S.sel === i) { fire(i); return; }
  S.sel = i; S.reach = computeReach(i);
  if (S.tut) { S.tut = 2; setTip('亮黃色的格子是火箭會飛的路線，它會撞上那顆炸彈。再點一次，發射！', true); }
  else setTip(nm[0] + '：' + nm[1] + '。再點一次引爆');
  sfx.select(); hud();
}
function useHint() {
  if (S.phase !== 'aim' || S.tut) return;
  if (S.hint >= 0) { setTip('粉紅箭頭指的就是提示'); return; }
  if (save.hints <= 0) { setBuddy(2); setTip('提示用完了。每拿到一個新的三顆星，就送 1 次提示'); sfx.deny(); return; }
  save.hints--; persist(); S.hint = S.lv.solution[0]; clearSel();
  setBuddy(3); setTip('從粉紅箭頭指的這一個開始，可以全部清光');
  sfx.hint(); hud();
}
async function playChain(res, token) {
  let step = 0;
  for (const w of res.waves) {
    if (token !== S.token) return;
    S.wave = w.k;
    for (const it of w.items) {
      if (it.locked) { S.wig[it.i] = now(); floatText(it.i, '鎖住了', false); continue; }      // 鑰匙還在，寶箱打不開
      if (it.shield) { S.wig[it.i] = now(); floatText(it.i, '炸不壞', false); continue; }      // 鋼箱只怕射線
      if (it.lit) { S.display[it.i] = Object.assign({}, it.o, { at: it.lit }); S.wig[it.i] = now(); floatText(it.i, '點燃', false); continue; }      // 定時炸彈開始倒數
      if (it.ticking) { S.wig[it.i] = now(); continue; }
      if (it.eaten) {      // 被黑洞吞掉：直接消失、不會發動；炸彈被吞掉不算爆炸
        S.display[it.i] = null; S.left--; burst(it.i, { t: 'hole' }, true);
        floatText(it.i, it.o.t === 'bomb' ? '被吞了' : '+' + fmt(it.pts), false);
        S.score += it.pts;
        continue;
      }
      if (it.crack) { S.display[it.i] = { t: 'iron', hp: 1 }; S.wig[it.i] = now(); burst(it.i, it.o, true); }
      else { S.display[it.i] = null; S.scorch[it.i] = 1; burst(it.i, it.o, it.o.t === 'chest'); S.left--; if (it.o.t === 'bomb') S.bombsLeft--; }
      if (it.o.t === 'chest') openChest(it.i);
      if (it.o.t === 'key') {      // 拿到鑰匙：每個寶箱都亮一下，鎖掉下來
        for (let j = 0; j < N; j++) if (S.display[j] && S.display[j].t === 'chest') { const [x, y] = center(j); S.wig[j] = now(); R.push({ x, y, r0: cs * 0.2, r1: cs * 0.8, life: 0, max: 0.45, c: C.sun, w: cs * 0.12 }); }
      }
      floatText(it.i, '+' + fmt(it.pts), it.o.t === 'gem' || it.o.t === 'chest');
      S.score += it.pts;
    }
    for (const f of w.fx) addFx(f);
    showCombo(w.k); sfx.wave(w);
    const nb = w.items.filter(it => it.o.t === 'bomb' && !it.stay && !it.eaten).length;
    shake = Math.min(14, 2 + w.items.length * 1.2 + nb * 2.5 + w.k * 0.3);
    if (nb || w.items.length >= 3) flashA = Math.min(0.5, 0.12 * nb + 0.06 * w.items.length);
    hud();
    await sleep(Math.max(130, 310 - (step++) * 14));
  }
}
async function fire(i) {
  const token = ++S.token;
  S.phase = 'chain'; clearSel(); S.hint = -1;
  setBuddy(1);
  if (S.tut) { S.tut = 3; setTip('炸彈會炸到旁邊的東西，一個傳一個，這就是連鎖！', true); } else setTip('轟！');
  hud();
  const res = simulate(S.board, i);
  await playChain(res, token);
  if (token !== S.token) return;
  S.board = res.after;
  let eaten = 0;      // 被黑洞吞掉的炸彈
  for (const w of res.waves) for (const it of w.items) if (it.eaten && it.o.t === 'bomb') eaten++;
  if (res.remaining === 0 && res.bombsLeft === 0) {
    flash('全清'); sfx.clear(); fireworks(); shake = 10; setTip('全部清光，太厲害了！');
    await sleep(1300);
  } else if (res.bombsLeft === 0) { setBuddy(0); setTip('炸彈全爆，過關！還剩 ' + res.remaining + ' 個沒清掉'); await sleep(800); }
  else { setBuddy(2); setTip(eaten ? '有 ' + eaten + ' 顆炸彈被黑洞吞掉，不算爆炸…' : '還有 ' + res.bombsLeft + ' 顆炸彈沒爆…'); await sleep(800); }
  if (token !== S.token) return;
  finishLevel(eaten);
}
function finishLevel(eaten) {
  const st = starsFor(S.bombsLeft, S.left), L = S.level;
  const chain = S.score, score = st > 0 ? finalScore(chain, S.total - S.left, S.total) : 0;
  S.score = score;
  const prev = save.stars[L] || 0, prevBest = save.best[L] || 0;
  const firstThree = st === 3 && prev < 3;
  if (st > prev) save.stars[L] = st;
  if (score > prevBest) save.best[L] = score;
  if (firstThree) save.hints = Math.min(5, save.hints + 1);
  if (st === 3 && S.attempt === 1) save.streak = (save.streak || 0) + 1; else if (st < 3) save.streak = 0;
  const wasTut = !!S.tut;
  if (wasTut) { save.tut = true; S.tut = 0; }
  persist();
  S.phase = 'done'; $('combo').classList.remove('on');
  S.lastR = { st, firstThree, newBest: score > prevBest && prevBest > 0, wasTut, chain, score, left: S.left, bombsLeft: S.bombsLeft, eaten };
  hud(); renderResult(S.lastR);
}

/* ---------- 卡片 ---------- */
function openSheet(kind, html, pose) {
  const el = $('sheet'), withPal = pose !== undefined;
  el.innerHTML = (withPal ? '<span class="pal peek p' + pose + '"></span>' : '') + '<div class="sheet-in">' + html + '</div>';
  el.classList.toggle('haspal', withPal);
  el.querySelector('.sheet-in').style.maxHeight = Math.max(240, $('app').clientHeight - (withPal ? 190 : 60)) + 'px';
  el.hidden = false; $('scrim').hidden = false; S.sheet = kind;
}
function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; S.sheet = null; }
function renderResult(r, quiet) {
  let h = '<div class="rstars" aria-label="' + r.st + ' 顆星">';
  for (let n = 0; n < 3; n++) h += '<span class="rstar' + (r.st > n ? ' on' : '') + '" style="animation-delay:' + (quiet ? 0 : 0.15 + n * 0.28) + 's">' + STAR + '</span>';
  h += '</div>';
  h += '<h2>' + (r.st === 3 ? '全部清光' : r.st === 2 ? '差一點點' : r.st === 1 ? '過關' : '沒過關') + '</h2>';
  const notes = [];
  if (r.st === 0) {
    h += '<p>還有 <b>' + r.bombsLeft + '</b> 顆炸彈沒爆</p>';
    notes.push(r.eaten ? '被黑洞吞掉的炸彈不算爆炸，要讓它在黑洞動之前先爆' : '所有炸彈都爆炸才算過關，換個起點試試');
  } else {
    h += '<p>' + (r.left ? '還剩 <b>' + r.left + '</b> 個沒清掉　' : '') + '得分 <b>' + fmt(r.score) + '</b></p>';
    if (r.wasTut) notes.push('炸彈全爆就過關。每一關只有一個起點能全部清光');
    else if (r.st === 3 && r.firstThree) notes.push('新的三顆星，送你 1 次提示');
    if (r.st === 3 && save.streak >= 2) notes.push('一次就三星，連續 ' + save.streak + ' 關');
    if (r.st === 3) notes.push('全部清光，分數加 50%');
    else notes.push('連鎖 ' + fmt(r.chain) + ' 分，剩 ' + r.left + ' 個所以打折。能全部清光的起點只有一個');
    if (r.newBest) notes.push('這一關的最高分');
    if (S.level % 10 === 0 && S.level < LEVELS && !save.seen[levelIntro(S.level + 1)]) notes.push(S.level < 50 ? '下一關換大盤面，還有新物件登場！' : '下一關有新物件登場！');
    if (S.level >= LEVELS) notes.push(totalStars() >= LEVELS * 3 ? LEVELS + ' 關全部三顆星，太強了！' : LEVELS + ' 關全部過關！回頭把星星補滿吧');
  }
  h += notes.map(n => '<div class="note">' + n + '</div>').join(' ');
  if (r.st >= 1) {
    if (S.level < LEVELS) h += '<button class="cta" id="nextBtn" type="button">下一關</button>';
    h += '<div class="row2"><button id="againBtn" type="button">' + (r.st < 3 ? '再挑戰三星' : '再玩一次') + '</button><button id="toMapBtn" type="button">選關</button></div>';
  } else {
    h += '<button class="cta" id="againBtn" type="button">再試一次</button>';
    h += '<div class="row2"><button id="toMapBtn" type="button">選關</button></div>';
  }
  openSheet('result', h, r.st === 3 ? 1 : r.st >= 1 ? 0 : 2);
  if (quiet) return;
  if (r.st === 0) sfx.fail();
  else for (let n = 0; n < r.st; n++) setTimeout(() => { if (S.sheet === 'result') sfx.star(n + 1); }, 250 + n * 280);
}
const LATE_DESC = {
  diag: '往右上、右下、左下、左上四個斜角各射一發，各打中第一個東西。斜的射線碰到鏡子不會轉彎，只會把鏡子打碎。',
  steel: '炸彈、大炸彈、電球、黑洞都弄不壞它，只有火箭、盤、鏡子的射線打得壞，而且一下就碎。平常也會擋住射線。',
  timer: '被打到或點它之後，要等 2 波才爆炸，炸周圍 8 格。倒數的時候它還留在原地，會擋住射線。它也是炸彈，一定要爆。',
  hole: '被打到時把周圍 8 格的東西吞掉。被吞的東西直接消失、不會發動；被吞掉的炸彈不算爆炸。鋼箱吞不掉。'
};
function renderIntro(kind) {
  let art = sprHtml(kind), name = NAMES[kind][0], desc = NAMES[kind][1] + '。', wide = false;
  if (kind === 'cross') {      // 橫向、直向一起介紹
    art += sprHtml('crossv'); wide = true;
    name = '雙向盤'; desc = '看箭頭：橫的往左、右，直的往上、下，各射中第一個東西。';
  } else if (kind === 'mirror') {      // 兩種斜向一起介紹
    art += sprHtml('mirror', 'flip'); wide = true;
    desc = '火箭、橫向盤、直向盤的射線打到鏡子會轉 90 度彎，再打中轉彎後的第一個東西。被炸彈炸到只會碎掉，不會轉彎。';
  } else if (kind === 'chest') {
    art = sprHtml('key') + sprHtml('chest'); wide = true;
    name = '鑰匙與寶箱'; desc = '寶箱鎖著的時候怎麼打都沒反應。要先打到鑰匙，寶箱才打得開，分數是炸彈的 5 倍。';
  } else if (kind === 'portal') {      // 一對一起介紹
    art += sprHtml('portal'); wide = true;
    desc = '一次出現一對。射線走進一個門，會從另一個門出來，往同一個方向繼續飛。門打不壞，也不算在要清掉的東西裡。';
  } else if (LATE_DESC[kind]) desc = LATE_DESC[kind];
  openSheet('intro', '<span class="kicker">新物件登場</span><div class="intro-art' + (wide ? ' wide' : '') + '">' + art + '</div><h2>' + name + '</h2><p>' + desc + '</p><button class="cta" id="okBtn" type="button">知道了</button>', 0);
}
function renderMap() {
  const un = unlocked();
  let h = '<span class="kicker">選關</span><p>星星 <b>' + totalStars() + '</b> / ' + (LEVELS * 3) + '　提示 <b>' + save.hints + '</b> 次</p>';
  for (let z = 0; z < LEVELS / 10; z++) {
    h += '<h3 class="zone">第 ' + (z * 10 + 1) + '–' + (z * 10 + 10) + ' 關<span>' + sizeOf(z)[0] + '×' + sizeOf(z)[1] + ' 盤面</span></h3>';
    const open = un >= z * 10 + 1, names = ZONE_NEW[z].map(k => (k === 'cross' ? '雙向盤' : NAMES[k][0])).join('、');
    // 這一區的新物件：還沒玩到的只給看影子
    h += '<div class="znew' + (open ? '' : ' lock') + '"><span class="zlab">' + (z ? '新物件' : '基本') + '</span>' + ZONE_NEW[z].map(k => sprHtml(k, open ? '' : 'sil')).join('') +
      '<span class="zname">' + (open ? names : '？？？　過第 ' + (z * 10) + ' 關就會登場') + '</span></div><div class="map">';
    for (let L = z * 10 + 1; L <= z * 10 + 10; L++) {
      const st = save.stars[L] || 0, open = L <= un;
      h += '<button class="lvbtn' + (L % 5 === 0 ? ' bonus' : '') + (L === S.level && !S.onTitle ? ' cur' : '') + '" type="button" data-lv="' + L + '"' + (open ? '' : ' disabled') +
        ' aria-label="第 ' + L + ' 關' + (open ? '，' + st + ' 顆星' : '，還沒解鎖') + '"><span class="n">' + L + '</span><span class="mstars">';
      for (let n = 0; n < 3; n++) h += STAR.replace('<svg', '<svg' + (st > n ? ' class="on"' : ''));
      h += '</span></button>';
    }
    h += '</div>';
  }
  h += '<p style="font-size:13px;margin-top:10px">過關就能開下一關。黃色的是東西特別多的大關。</p><div class="row2"><button id="closeBtn" type="button">關閉</button></div>';
  openSheet('map', h);
  const box = $('sheet').querySelector('.sheet-in'), cur = box.querySelector('.lvbtn.cur') || box.querySelector('[data-lv="' + un + '"]');
  if (cur) box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2);
}
function renderRules() {
  const h = '<span class="kicker">規則</span><ol class="rules"><li>每一關只能引爆一次。點一個機關會看到它打得到誰，再點同一個就引爆。</li><li>被打到的機關會接著引爆，一個傳一個。</li>' +
    '<li>所有炸彈都爆炸才算過關，拿一顆星。</li><li>剩下的東西在 2 個以內兩顆星，全部清光三顆星。</li><li>每一關只有一個起點能全部清光。</li>' +
    '<li>剩下越多，分數打越多折；全部清光再加 50%。</li><li>前 50 關每 10 關盤面變大一次；第 51 關起盤面不再變大，每 10 關多一種新物件。一共 ' + LEVELS + ' 關。</li><li>卡住就按「提示」。每拿到一個新的三顆星，送 1 次提示，最多存 5 次。</li></ol>' +
    '<div class="row2"><button id="toHelpBtn" type="button">物件說明</button><button id="closeBtn" type="button">知道了</button></div>';
  openSheet('rules', h);
}

/* ---------- 說明：每個物件的作用和效果 ---------- */
// 小圖是 5×5 的格子。me＝它自己，hit＝會被打到的格子，miss＝打不到的東西，pal＝別的電球，ray＝射出去的線
const HELP = [
  { sec: '會引爆別人的機關', note: '被打到就會動作，再去打別人。' },
  { k: 'bomb', does: '炸開自己周圍一圈，一共 8 格。', fx: '圈內的東西全部被打到，斜角也算。',
    g: { me: [2, 2], hit: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]] } },
  { k: 'bigbomb', does: '炸開自己周圍兩圈，一共 24 格。', fx: '範圍內的東西全部被打到，是範圍最大的機關。',
    g: { me: [2, 2], hit: 'all' } },
  { k: 'arrow', does: '往箭頭指的方向直直飛出去。', fx: '只打到撞上的第一個東西，後面的打不到；一路都是空格就落空。',
    g: { me: [2, 4], hit: [[2, 1]], miss: [[2, 0]], ray: [[2, 4, 2, 1]] } },
  { k: 'cross', does: '同時往左、往右各射一發。', fx: '兩邊各打到第一個東西；上面和下面打不到。',
    g: { me: [2, 2], hit: [[0, 2], [4, 2]], miss: [[2, 0], [2, 4]], ray: [[2, 2, 0, 2], [2, 2, 4, 2]] } },
  { k: 'crossv', does: '同時往上、往下各射一發。', fx: '上下各打到第一個東西；左邊和右邊打不到。',
    g: { me: [2, 2], hit: [[2, 0], [2, 4]], miss: [[0, 2], [4, 2]], ray: [[2, 2, 2, 0], [2, 2, 2, 4]] } },
  { k: 'link', does: '一顆放電，全場的電球不管多遠都一起放電。', fx: '每顆電球還會電到自己上、下、左、右的東西。小圖裡藍色的是別顆電球。',
    g: { me: [1, 3], hit: [[1, 2], [0, 3], [2, 3], [1, 4], [4, 0], [3, 1], [4, 2]], pal: [[4, 1]], zap: [[1, 3, 4, 1]] } },
  { sec: '不會引爆別人的東西', note: '自己不會動，要靠機關打到才會消失。' },
  { k: 'gem', does: '放著不會動，被打到就消失。', fx: '分數是炸彈的 3 倍，越晚被炸到加越多。', big: ['×3', '分數'] },
  { k: 'crate', does: '放著不會動，被打到就消失。', fx: '會擋路：火箭和橫向盤、直向盤打到木箱就停，木箱後面的打不到。',
    g: { me: [2, 2], miss: [[2, 0]], ray: [[2, 4, 2, 2]], src: [2, 4] } },
  { k: 'iron', does: '很硬，要被打到兩次才會碎。', fx: '第一次只會裂開，第二次才消失。同一瞬間被好幾個打到只算一次。', big: ['2', '次才碎'] },
  { sec: '後面才登場的特殊物件', note: '每 10 關會多一種新玩法。' },
  { k: 'mirror', tag: ['會轉彎', true], does: '火箭、橫向盤、直向盤的射線打到它，會轉 90 度彎。有「／」和「＼」兩種斜向。', fx: '轉彎後一樣打中第一個東西。被炸彈炸到或被電球電到只會碎掉，不會轉彎。',
    g: { me: [2, 2], hit: [[4, 2]], ray: [[2, 4, 2, 2], [2, 2, 4, 2]], src: [2, 4] } },
  { k: 'key', tag: ['開鎖用'], does: '放著不會動，被打到就消失。', fx: '鑰匙一被打到，場上所有寶箱的鎖都會解開。', big: ['開鎖', '寶箱用'], cjk: true },
  { k: 'chest', tag: ['要先開鎖'], does: '鎖著的時候怎麼打都沒反應，要等鑰匙先被打到。', fx: '打開後分數是炸彈的 5 倍。順序錯了就會留在場上。', big: ['×5', '分數'] },
  { sec: '第 51 關起的新物件', note: '盤面不再變大，每 10 關多一種新玩法。' },
  { k: 'diag', does: '同時往四個斜角各射一發。', fx: '四個斜角各打到第一個東西；上下左右打不到。斜的射線碰到鏡子不會轉彎，只會把鏡子打碎。',
    g: { me: [2, 2], hit: [[0, 0], [4, 0], [0, 4], [3, 3]], miss: [[4, 4], [2, 0]], ray: [[2, 2, 0, 0], [2, 2, 4, 0], [2, 2, 0, 4], [2, 2, 3, 3]] } },
  { k: 'steel', tag: ['防爆'], does: '放著不會動。炸彈、大炸彈、電球、黑洞都弄不壞它。', fx: '只有火箭、盤、鏡子的射線打得壞，一下就碎。平常也會擋住射線。', big: ['防爆', '只怕射線'], cjk: true },
  { k: 'portal', tag: ['打不壞'], does: '一對門。射線走進一個門，會從另一個門出來。', fx: '出來後往同一個方向繼續飛，打中第一個東西。門不算在要清掉的東西裡。小圖裡藍色的是另一個門。',
    g: { me: [1, 3], pal: [[3, 1]], hit: [[3, 0]], ray: [[1, 4, 1, 3], [3, 1, 3, 0]], src: [1, 4] } },
  { k: 'timer', tag: ['會延遲', true], does: '被打到或點它之後，要等 2 波才爆炸，炸周圍 8 格。', fx: '倒數的時候留在原地，會擋住射線。它也是炸彈，一定要爆。', big: ['2', '波後才爆'] },
  { k: 'hole', tag: ['小心', true], does: '被打到時，把周圍 8 格的東西吞掉。', fx: '被吞的東西直接消失、不會發動；被吞掉的炸彈不算爆炸。鋼箱吞不掉。',
    g: { me: [2, 2], hit: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]] } }
];
function miniGrid(g) {
  const cell = 12, gap = 2, at = n => 1 + n * (cell + gap), mid = n => at(n) + cell / 2, size = 2 + 5 * cell + 4 * gap;
  const has = (list, x, y) => list === 'all' || (list || []).some(q => q[0] === x && q[1] === y);
  let base = '', top = '', lines = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const me = g.me[0] === x && g.me[1] === y, r = '<rect x="' + at(x) + '" y="' + at(y) + '" width="' + cell + '" height="' + cell + '" rx="3" fill="';
    if (me) top += r + '#2f9a55"/>';
    else if (has(g.pal, x, y)) top += r + '#3d9bf0"/>';
    else if (has(g.hit, x, y)) top += r + '#ff9f1c"/>';
    else base += r + '#e2eee1"/>';
    if (has(g.miss, x, y)) top += '<circle cx="' + mid(x) + '" cy="' + mid(y) + '" r="3.2" fill="#93a79a"/>';
  }
  for (const l of g.ray || []) lines += '<line x1="' + mid(l[0]) + '" y1="' + mid(l[1]) + '" x2="' + mid(l[2]) + '" y2="' + mid(l[3]) + '" stroke="#ff9f1c" stroke-width="4" stroke-linecap="round"/>';
  for (const l of g.zap || []) lines += '<line x1="' + mid(l[0]) + '" y1="' + mid(l[1]) + '" x2="' + mid(l[2]) + '" y2="' + mid(l[3]) + '" stroke="#3d9bf0" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 4"/>';
  if (g.src) top += '<path d="M' + (mid(g.src[0]) - 4.5) + ' ' + (mid(g.src[1]) + 4) + 'h9l-4.5 -8.5z" fill="#ff9f1c"/>';   // 飛過來的火箭
  return '<svg class="mini" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' + base + lines + top + '</svg>';
}
function renderHelp() {
  let h = '<span class="kicker">說明</span><p class="hlead">每個東西的作用和效果。</p>' +
    '<div class="hkey" aria-hidden="true"><span><i style="background:#2f9a55"></i>它自己</span><span><i style="background:#ff9f1c"></i>會被打到</span><span><i class="dot"></i>打不到</span></div>';
  for (const it of HELP) {
    if (it.sec) { h += '<h3 class="hsec">' + it.sec + '<span>' + it.note + '</span></h3>'; continue; }
    if (!met(it.k)) {      // 還沒玩到的：只給看影子，留一點驚喜
      h += '<section class="hcard lock"><span class="ic">' + sprHtml(it.k, 'sil') + '</span><div class="hname"><h4>？？？</h4><span class="htag">第 ' + INTRO_LV[it.k] + ' 關登場</span></div><div class="mini txt q"><b>?</b></div></section>';
      continue;
    }
    const pic = it.g ? miniGrid(it.g) : '<div class="mini txt' + (it.cjk ? ' cjk' : '') + '"><b>' + it.big[0] + '</b><span>' + it.big[1] + '</span></div>';
    const act = ACTIVE[it.k === 'bigbomb' || it.k === 'timer' ? 'bomb' : it.k === 'crossv' ? 'cross' : it.k], tag = it.tag || (act ? ['會引爆別人', true] : ['不會引爆']);
    h += '<section class="hcard"><span class="ic">' + sprHtml(it.k) + '</span>' +
      '<div class="hname"><h4>' + NAMES[it.k][0] + '</h4><span class="htag' + (tag[1] ? ' on' : '') + '">' + tag[0] + '</span></div>' + pic +
      '<div class="hline"><span class="lab">作用</span><span>' + it.does + '</span></div><div class="hline"><span class="lab fx">效果</span><span>' + it.fx + '</span></div></section>';
  }
  h += '<p class="hfoot">被打到的機關會接著引爆，一個傳一個。越後面才被炸到，分數越高。</p>' +
    '<div class="row2 stick"><button id="toRulesBtn" type="button">遊戲規則</button><button id="closeBtn" type="button">知道了</button></div>';
  openSheet('help', h);
  $('sheet').querySelector('.sheet-in').scrollTop = 0;
}

/* ---------- 標題頁 ---------- */
function showTitle() {
  S.onTitle = true; $('title').hidden = false;
  const un = unlocked();
  $('tStars').textContent = totalStars(); $('tLv').textContent = un;
  $('playBtn').textContent = totalStars() > 0 ? '繼續　第 ' + un + ' 關' : '開始';
}
function leaveTitle(L) { S.onTitle = false; $('title').hidden = true; layout(); startLevel(L); }

/* ---------- 操作 ---------- */
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  S.kb = false; S.cursor = y * W + x; onCell(y * W + x);
});
cv.addEventListener('keydown', e => {
  const mv = { ArrowUp: -W, ArrowDown: W, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (mv !== undefined) {
    e.preventDefault(); S.kb = true;
    if (S.cursor < 0) { S.cursor = 0; return; }
    const x = S.cursor % W, n = S.cursor + mv;
    if (n < 0 || n >= N || (mv === -1 && x === 0) || (mv === 1 && x === W - 1)) return;
    S.cursor = n;
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (S.cursor >= 0) onCell(S.cursor); }
});
// 瀏覽器規定要先有一次點擊才能出聲：第一次碰到畫面時把聲音和配樂打開
const wake = () => { if (audio()) startMusic(); };
document.addEventListener('pointerdown', wake, true);
document.addEventListener('keydown', wake, true);
$('hintBtn').addEventListener('click', useHint);
$('retryBtn').addEventListener('click', () => { if (S.phase !== 'chain' && !S.tut) { sfx.button(); startLevel(S.level, true); } });
$('mapBtn').addEventListener('click', () => { if (!S.sheet && S.phase !== 'chain' && !S.tut) { sfx.button(); renderMap(); } });
$('rulesBtn').addEventListener('click', () => { if (!S.sheet && S.phase !== 'chain') { sfx.button(); renderRules(); } });
$('helpBtn').addEventListener('click', () => { if (!S.sheet && S.phase !== 'chain') { sfx.button(); renderHelp(); } });
$('playBtn').addEventListener('click', () => { sfx.button(); leaveTitle(unlocked()); });
$('tMapBtn').addEventListener('click', () => { sfx.button(); renderMap(); });
$('sheet').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  sfx.button();
  if (b.dataset.lv) { const L = +b.dataset.lv; if (S.onTitle) leaveTitle(L); else startLevel(L); }
  else if (b.id === 'nextBtn') startLevel(S.level + 1);
  else if (b.id === 'againBtn') startLevel(S.level, true);
  else if (b.id === 'toMapBtn') renderMap();
  else if (b.id === 'okBtn') closeSheet();
  else if (b.id === 'toHelpBtn') renderHelp();
  else if (b.id === 'toRulesBtn') renderRules();
  else if (b.id === 'closeBtn') { closeSheet(); if (S.phase === 'done' && !S.onTitle && S.lastR) renderResult(S.lastR, true); }
});
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
const ICON_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M14.5 8.2v7.6c1.4-.7 2.4-2.1 2.4-3.8s-1-3.1-2.4-3.8z"/></svg>';
function paintAudio() {
  const m = $('musicBtn'), s = $('sfxBtn');
  m.innerHTML = ICON_NOTE; m.classList.toggle('off', !musicOn); m.setAttribute('aria-pressed', String(musicOn)); m.setAttribute('aria-label', musicOn ? '音樂：開' : '音樂：關');
  s.innerHTML = ICON_SPK; s.classList.toggle('off', !sfxOn); s.setAttribute('aria-pressed', String(sfxOn)); s.setAttribute('aria-label', sfxOn ? '音效：開' : '音效：關');
}
$('musicBtn').addEventListener('click', () => { musicOn = !musicOn; store.set('music', musicOn); paintAudio(); setBus(); if (musicOn) startMusic(); });
$('sfxBtn').addEventListener('click', () => { sfxOn = !sfxOn; store.set('sfx', sfxOn); paintAudio(); setBus(); if (sfxOn) sfx.select(); });
window.addEventListener('resize', layout);
if (window.ResizeObserver) new ResizeObserver(layout).observe($('stage'));

/* ---------- 啟動（頁面更新時回到同一關）---------- */
function start(data) {
  paintAudio();
  // 背景先放一關當底，標題頁蓋在上面
  S.level = unlocked(); S.lv = genLevel(S.level); layout();
  S.board = S.lv.board.slice(); S.display = S.board.slice(); S.total = S.lv.total; S.left = S.total; S.bombs = S.lv.bombs; S.bombsLeft = S.bombs; S.born = now();
  hud(); setTip('');
  const d = data && data.run;
  if (d && d.v === 4 && !d.onTitle && d.level >= 1 && d.level <= unlocked()) leaveTitle(d.level); else showTitle();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) { try { document.fonts.load('20px Bungee'); } catch (e) { /* 字型載不到就用備用字 */ } }
}
const hot = window.claude && window.claude.hot;
try { if (hot && hot.snapshot) hot.snapshot(() => ({ run: { v: 4, level: S.level, onTitle: S.onTitle } })); } catch (e) { /* 沒有也沒關係 */ }
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
