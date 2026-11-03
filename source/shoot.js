// 投稿カード用の素材を撮る（Chrome headless / CDP・DPR2）。実行: node source/shoot.js <出力フォルダ> [--probe]
// 01-x-primary: 送り直しの前後比較（お店が幹事さんの送り直しを開き「一覧に取り込む」を押したところ）。幅600px（本文は最大520px）。枠の上端〜「新しい内容で上書きする」まで
// 02-list-1000: お店の画面（幅1000px・2列）。上側を切り出す（左はリンクを作るフォームの上部、右は予約の一覧4件と「これからの団体予約 4件・計52人」）
//   左の「リンクを作った直後のURL」と右の一覧は約1,900px離れて1枚に入らないため（タダス実測）、一覧が入る範囲にした
// 見本はすべて架空。2026-11-04 22:00 を今として撮る（仕様カード第6節・第2-6節）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'shots');
const PROBE = process.argv.includes('--probe');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8798, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const rectEv = js => `(()=>{const e=${js};const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`;
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
const pad = (a, p) => ({ x: Math.max(0, a.x - p), y: Math.max(0, a.y - p), width: a.w + p * 2, height: a.h + p * 2 });
const click = t => `[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(t)}&&!x.closest('[hidden]')).click()`;
const report = (name, c) => console.log(name, JSON.stringify({ w: Math.round(c.width), h: Math.round(c.height), ratio: +(c.width / c.height).toFixed(3) }));
const NOW = `PO.now=new Date(2026,10,4,22,0);`;
const Q = { shop: 'いろり屋', name: 'たなか', day: '2026-12-11', time: '19:00', plan: 15, courses: [['おまかせ鍋コース', 4500], ['軽めのおつまみコース', 3500]], drink: [1800, 120], dl: '2026-12-04', made: '2026-11-03T20:00', rid: 'tanaka01' };
const PREV = { adults: '15', kids: '0', counts: ['11', '4'], drinkN: '13', alg: [['パクチー', '2', '1']], pay: '0', rcpt: '1', note: '' };
const NOWF = { adults: '13', kids: '0', counts: ['9', '4'], drinkN: '11', alg: [['えび', '1', '0'], ['パクチー', '2', '1']], pay: '0', rcpt: '1', note: '' };

(async () => {
  const b = await launch(9479);
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  const go = async (url, w) => { await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(100); await b.open(url, w, 1400, 2, w < 768, 'light'); await b.ev(NOW + `POUI.resetDraft();POUI.route()`); await b.sleep(200); };
  await b.open(ORIGIN, 600, 1400, 2, true, 'light'); await b.ev(`localStorage.clear()`);
  await b.ev(NOW);
  const prevUrl = await b.ev(NOW + `location.origin+'/#'+PO.encodeA(PO.toAnswer(${JSON.stringify(Q)},${JSON.stringify(PREV)},'2026-11-03T20:40').cfg)`);
  const nowUrl = await b.ev(NOW + `location.origin+'/#'+PO.encodeA(PO.toAnswer(${JSON.stringify(Q)},${JSON.stringify(NOWF)},'2026-11-04T21:10').cfg)`);

  // 01: 送り直しの前後比較
  await go(prevUrl, 600); await b.ev(click('一覧に取り込む')); await b.sleep(200);
  await go(nowUrl, 600); await b.ev(click('一覧に取り込む')); await b.sleep(200); await b.ev(`scrollTo(0,0)`);
  const top = await b.ev(rectEv(`document.querySelector('.cmp')`));
  const btn = await b.ev(rectEv(`[...document.querySelectorAll('.cmp button')].find(x=>/上書きする/.test(x.textContent))`));
  // 上は枠の外の「一覧に取り込む」、下は「やめる」の枠線が入らないよう、余白は上4px・下8pxにする
  const c1 = { x: top.x - 12, y: top.y - 4, width: top.w + 24, height: btn.y + btn.h + 8 - (top.y - 4) };
  report('01-x-primary', c1);
  if (!PROBE) await b.shot(path.join(OUT, '01-x-primary.png'), c1);

  // 02: お店の画面の一覧（サンプル4件）
  await b.ev(`localStorage.clear()`);
  await go(ORIGIN, 1000); await b.ev(click('サンプルを入れる')); await b.sleep(200); await b.ev(`scrollTo(0,0)`);
  const lay = await b.ev(rectEv(`document.querySelector('.layout')`));
  const right = await b.ev(rectEv(`document.querySelector('.layout').children[1].querySelector('.panel')`));
  const vw = await b.ev(`document.documentElement.clientWidth`);
  const c2 = { x: Math.max(0, lay.x - 12), y: lay.y - 12, width: Math.min(lay.w + 24, vw - Math.max(0, lay.x - 12)), height: right.y + right.h - lay.y + 24 };
  report('02-list-1000', c2);
  if (!PROBE) await b.shot(path.join(OUT, '02-list-1000.png'), c2);

  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
