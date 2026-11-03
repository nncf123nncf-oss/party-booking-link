// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// お店が確認リンクを作る→幹事さんが選んで返す→お店が受け取って取り込む→送り直しを前回と比べて上書き、の往復。
// 人数の整合の案内、375px/880px/1000pxの矩形、ライト/ダーク、端末の保存（再読み込み・壊れた保存・一部だけ壊れた保存・保存できない端末・別のタブ）、
// 共有ボタンの出し分け、コピーの代わりの経路、XSS、壊れたリンク、最長の値、外部への通信
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8789, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const KEY = 'party-booking-link-v1';
let ng = 0;
const ok = (name, cond, info) => { if (!cond) ng++; console.log((cond ? 'OK ' : 'NG ') + name + (info !== undefined && !cond ? ' ' + JSON.stringify(info) : '')); };
const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],small:[]};
  document.querySelectorAll('main *').forEach(e=>{if(e.closest('[hidden]'))return;const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('main button, main input[type=text], main input[type=date], main select, main label.choice, main summary').forEach(e=>{if(e.closest('[hidden]'))return;const r=e.getBoundingClientRect();if(r.width&&(r.height<43.5||r.width<43.5))out.small.push((e.textContent||e.type||e.tagName).slice(0,14)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  out.over=[...new Set(out.over)].slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const click = t => `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(t)}&&!x.closest('[hidden]'));if(!b)throw new Error('no button '+${JSON.stringify(t)});b.click();return true})()`;
const NOW = `PO.now=new Date(2026,10,4,22,0);`;
const fire = `e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'))`;
const val = (ph, v) => `(()=>{const e=[...document.querySelectorAll('#app input')].find(x=>x.placeholder===${JSON.stringify(ph)}||x.getAttribute('aria-label')===${JSON.stringify(ph)});if(!e)throw new Error('no input '+${JSON.stringify(ph)});e.value=${JSON.stringify(v)};${fire};return true})()`;
const dateIn = (i, v) => `(()=>{const e=document.querySelectorAll('#app input[type=date]')[${i}];e.value=${JSON.stringify(v)};${fire};return true})()`;
const sel = (i, v) => `(()=>{const e=document.querySelectorAll('#app select')[${i}];e.value=${JSON.stringify(v)};${fire};return true})()`;
// ＋−の欄（見出しの文字で探す。同じ見出しが複数あるときは within で囲みを指定）
const step = (label, v, within) => `(()=>{const root=${within || 'document'};const s=[...root.querySelectorAll('.step')].find(x=>x.querySelector('.sl').firstChild.textContent===${JSON.stringify(label)});if(!s)throw new Error('no step '+${JSON.stringify(label)});const e=s.querySelector('input');e.value=${JSON.stringify(String(v))};${fire};return true})()`;
const choose = (name, v) => `(()=>{const e=[...document.querySelectorAll('#app input[type=radio]')].find(x=>(x.name===${JSON.stringify(name)}||x.name.indexOf(${JSON.stringify(name + '-')})===0)&&x.value===${JSON.stringify(v)});e.click();return true})()`;
const items = `[...document.querySelectorAll('.items > li')].map(l=>l.innerText.replace(/\\s+/g,' ').trim())`;
const setStore = s => `localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(s))})`;
const getStore = `JSON.parse(localStorage.getItem('${KEY}'))`;
const body = `document.body.innerText`;
const askText = `(document.querySelector('.ask-box p')||{textContent:''}).textContent`;
const linkHidden = `document.querySelector('textarea.urlbox').closest('.panel').hidden`;
const algRow = i => `document.querySelectorAll('.alg')[${i}]`;

(async () => {
  const b = await launch(9441);
  const reqs = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url); });
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] }); // 本番の計測に検算の閲覧を混ぜない
  const errs = [];
  b.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description)); });
  const reopen = async (url, w, h, dark) => { await b.send('Page.navigate', { url: 'about:blank' }); await b.sleep(100); await b.open(url || ORIGIN, w || 375, h || 900, 2, (w || 375) < 768, dark ? 'dark' : 'light'); await b.ev(NOW + 'window.confirm=()=>true;window.alert=()=>{};POUI.resetDraft();POUI.route()'); await b.sleep(150); };
  // 幹事さんの画面で Card1 の「今回」を入れる
  async function fillNow(f) {
    await b.ev(step('大人', f.adults)); await b.ev(step('子ども', f.kids || 0));
    for (const [n, v] of f.courses) await b.ev(step(n, v));
    if (f.drink != null) await b.ev(step('飲み放題をつける人数', f.drink));
    for (let i = 0; i < f.alg.length; i++) {
      await b.ev(click('＋ 1行足す')); await b.sleep(40);
      await b.ev(val((i + 1) + '行目の食材', f.alg[i][0])); await b.ev(step('人数', f.alg[i][1], algRow(i))); await b.ev(choose('alg' + i, f.alg[i][2]));
    }
    await b.ev(choose('pay', f.pay)); await b.ev(choose('rcpt', f.rcpt));
    if (f.note) await b.ev(val('例 乾杯は19時半からです', f.note));
  }

  // 1) 空のお店の画面 375px
  await b.open(ORIGIN, 375, 900, 2, true, 'light'); await b.ev(`localStorage.clear()`); await reopen();
  let m = await b.ev(measure); ok('shop empty 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('shop empty 375 targets>=44', !m.small.length, m.small);
  ok('default time 19:00', await b.ev(`document.querySelectorAll('#app select')[0].value`) === '19:00');
  ok('drink default none', await b.ev(`document.querySelector('#app input[name=drink][value="0"]').checked`));
  await b.ev(click('リンクを作る')); await b.sleep(100);
  ok('ask needs name/day/course', /幹事さんの呼び名を入れてください/.test(await b.ev(body)) && /予約日を入れてください/.test(await b.ev(body)) && /コース1の名前を入れてください/.test(await b.ev(body)) && await b.ev(linkHidden));
  // 1b) 確認リンクの欄の見本（11/4 を今日として、30日以上先の金曜 12/4・人数を決めてほしい日 11/27）
  await reopen();
  await b.ev(click('見本を入れる')); await b.sleep(120);
  const sd = await b.ev(`(()=>{const v=s=>[...document.querySelectorAll('#app input')].find(x=>x.placeholder===s).value;return {shop:v('例 いろり屋'),name:v('例 たなか'),day:document.querySelectorAll('#app input[type=date]')[0].value,dl:document.querySelectorAll('#app input[type=date]')[1].value,time:document.querySelectorAll('#app select')[0].value,plan:[...document.querySelectorAll('.step')].find(x=>x.querySelector('.sl').firstChild.textContent==='予定人数').querySelector('input').value,courses:[...document.querySelectorAll('.course input')].map(e=>e.value),drink:document.querySelector('#app input[name=drink][value="1"]').checked,dp:v('例 1800'),notice:(document.querySelector('.notice')||{}).textContent}})()`);
  ok('sample form filled', sd.shop === 'いろり屋' && sd.name === 'さとう' && sd.day === '2026-12-04' && sd.dl === '2026-11-27' && sd.time === '19:00' && sd.plan === '12' && JSON.stringify(sd.courses) === '["おまかせ鍋コース","4500","軽めのおつまみコース","3500"]' && sd.drink && sd.dp === '1800' && /見本を入れました/.test(sd.notice), sd);
  ok('sample form list untouched', (await b.ev(`document.querySelectorAll('.items > li').length`)) === 0);
  m = await b.ev(measure); ok('sample form 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('sample form 375 targets', !m.small.length, m.small);
  await b.ev(click('リンクを作る')); await b.sleep(120);
  ok('sample form makes link', /#q1=/.test(await b.ev(`document.querySelector('textarea.urlbox').value`)) && /^【いろり屋】\nさとう さま\n12月4日（金）19:00〜のご予約ありがとうございます\n/.test(await b.ev(`document.querySelector('.msgbox').value`)) && /人数は11月27日（金）までにお知らせください/.test(await b.ev(`document.querySelector('.msgbox').value`)));
  await b.ev(val('例 たなか', 'すずき')); await b.ev(click('見本を入れる')); await b.sleep(80);
  ok('sample asks when typed', /入力中の内容を、見本で置き換えます/.test(await b.ev(askText)));
  await b.ev(click('やめる')); await b.sleep(60);
  ok('sample cancel keeps typed', await b.ev(`document.querySelector('#app input[placeholder="例 たなか"]').value`) === 'すずき');
  await b.ev(click('見本を入れる')); await b.sleep(60); await b.ev(click('見本で置き換える')); await b.sleep(120);
  ok('sample replace', await b.ev(`document.querySelector('#app input[placeholder="例 たなか"]').value`) === 'さとう');
  await b.ev(`localStorage.clear()`); await reopen();
  // 2) Card1 の確認リンクを作る
  await b.ev(val('例 いろり屋', 'いろり屋')); await b.ev(val('例 たなか', 'たなか')); await b.ev(dateIn(0, '2026-12-11'));
  await b.ev(step('予定人数', 15));
  await b.ev(val('コース1の名前', 'おまかせ鍋コース')); await b.ev(val('コース1の1人あたりの料金（円）', '4500'));
  await b.ev(click('＋ コースを足す')); await b.sleep(60);
  await b.ev(val('コース2の名前', '軽めのおつまみコース')); await b.ev(val('コース2の1人あたりの料金（円）', '3500'));
  await b.ev(choose('drink', '1')); await b.sleep(40);
  await b.ev(val('例 1800', '1800'));
  await b.ev(dateIn(1, '2026-12-04')); await b.sleep(100);
  ok('ask message preview', await b.ev(`document.querySelector('.msgbox').value`) === '【いろり屋】\nたなか さま\n12月11日（金）19:00〜のご予約ありがとうございます\n人数とコース\nアレルギーなどを\n選んでいただけますか\n人数は12月4日（金）までにお知らせください', await b.ev(`document.querySelector('.msgbox').value`));
  ok('copy disabled before link', await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='幹事さんに送る文をコピー').disabled`));
  await b.ev(click('リンクを作る')); await b.sleep(150);
  const qg = await b.ev(`({len:document.querySelector('.len').textContent,url:document.querySelector('textarea.urlbox').value,msg:document.querySelector('.msgbox').value})`);
  ok('ask url generated', /#q1=/.test(qg.url) && qg.msg.endsWith('\n人数は12月4日（金）までにお知らせください\n' + qg.url) && /\nこちらから選んでいただけますか\n/.test(qg.msg), qg);
  console.log('   確認リンクの長さ', Array.from(qg.url).length);
  fs.writeFileSync(path.join(OUT, 'ask-url.txt'), qg.url);
  ok('copy enabled after link', !(await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='幹事さんに送る文をコピー').disabled`)));
  m = await b.ev(measure); ok('shop filled 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('shop filled 375 targets', !m.small.length, m.small);
  await b.shot(path.join(OUT, 'shop-form-375.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  await b.ev(val('例 たなか', 'たなか ')); await b.sleep(80);
  ok('link hidden after change', await b.ev(linkHidden));
  // コース名に「円」・料金が空なら止まる
  await b.ev(val('コース2の名前', '鍋4500円')); await b.ev(val('コース2の1人あたりの料金（円）', '')); await b.ev(click('リンクを作る')); await b.sleep(100);
  ok('course yen / empty price stops', /コース2の名前：金額や/.test(await b.ev(body)) && /コース2の1人あたりの料金を/.test(await b.ev(body)) && await b.ev(linkHidden));
  await b.ev(click('外す')); await b.sleep(80);
  ok('remove course', await b.ev(`document.querySelectorAll('.course').length`) === 1);

  // 3) 幹事さんの画面 375px
  const storeBefore = await b.ev(`localStorage.getItem('${KEY}')`);
  await reopen(qg.url);
  ok('ask notice', /いろり屋から、ご予約の内容について聞かれています/.test(await b.ev(`document.querySelector('.notice').textContent`)) && !/自動/.test(await b.ev(body)));
  ok('ask who', await b.ev(`document.querySelector('.who').innerText.replace(/\\s+/g,' ')`) === 'たなかさま 12月11日（金）19:00〜のご予約 人数は12月4日（金）までにお知らせください', await b.ev(`document.querySelector('.who').innerText`));
  ok('ask plan as initial', await b.ev(`[...document.querySelectorAll('.step')].find(x=>x.querySelector('.sl').firstChild.textContent==='大人').querySelector('input').value`) === '15');
  ok('ask sum line ok', /合計15人／人数15人 ✓/.test(await b.ev(`document.querySelector('.sumline').textContent`)), await b.ev(`document.querySelector('.sumline').textContent`));
  ok('ask no pay preselected', await b.ev(`document.querySelectorAll('#app input[type=radio]:checked').length`) === 0);
  m = await b.ev(measure); ok('ask 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('ask 375 targets', !m.small.length, m.small);
  // 合計が合わない・未選択 → 返さない・どこかを示す
  await b.ev(step('大人', 13)); await b.sleep(40);
  ok('sum line bad', /合計15人／人数13人（合わせてください）/.test(await b.ev(`document.querySelector('.sumline').textContent`)) && await b.ev(`document.querySelector('.sumline').classList.contains('bad')`));
  await b.ev(click('お店に返すリンクを作る')); await b.sleep(120);
  ok('S4 missing shown', JSON.stringify(await b.ev(`[...document.querySelectorAll('fieldset.missing legend')].map(l=>l.textContent)`)) === JSON.stringify(['コース', '飲み放題', 'お支払い', '領収書']) && /コースの人数が合計15人です。人数は13人です/.test(await b.ev(body)) && await b.ev(linkHidden), await b.ev(`[...document.querySelectorAll('fieldset.missing legend')].map(l=>l.textContent)`));
  await b.ev(step('飲み放題をつける人数', 14)); await b.ev(click('お店に返すリンクを作る')); await b.sleep(100);
  ok('S4 drink over shown', /飲み放題をつける人数が、人数（13人）より多く/.test(await b.ev(body)));
  await b.ev(`location.reload()`); await b.sleep(600); await b.ev(NOW + 'POUI.route()'); await b.sleep(150);
  await fillNow({ adults: 13, courses: [['おまかせ鍋コース', 9], ['軽めのおつまみコース', 4]], drink: 11, alg: [['えび', 1, '0'], ['パクチー', 2, '1']], pay: '0', rcpt: '1' });
  ok('missing cleared', await b.ev(`document.querySelectorAll('fieldset.missing').length`) === 0);
  await b.ev(click('お店に返すリンクを作る')); await b.sleep(150);
  const ag = await b.ev(`({url:document.querySelector('textarea.urlbox').value,msg:document.querySelector('.msgbox').value})`);
  const want = '【ご予約内容】\nいろり屋 さんへ\nたなか より\n12月11日（金）19:00〜\n人数: 13人（大人13）\n・おまかせ鍋コース 4,500円: 9人\n・軽めのおつまみコース 3,500円: 4人\n飲み放題: 11人\nアレルギー: えび 1人／苦手: パクチー 2人\nお支払い: まとめて・領収書: 要る';
  ok('S1 answer message', /#a1=/.test(ag.url) && ag.msg === want + '\n' + ag.url, ag);
  console.log('   返すリンクの長さ', Array.from(ag.url).length);
  fs.writeFileSync(path.join(OUT, 'answer-url.txt'), ag.url);
  ok('ask page saves nothing', await b.ev(`localStorage.getItem('${KEY}')`) === storeBefore);
  m = await b.ev(measure); ok('ask done 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('ask done targets', !m.small.length, m.small);
  await b.shot(path.join(OUT, 'ask-375.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  await b.ev(choose('pay', '1')); await b.sleep(80);
  ok('answer hidden after change', await b.ev(linkHidden) && await b.ev(`document.querySelector('.msgbox').closest('.panel').hidden`));
  // 前回（11/3 20:40）の返すリンク: 15人・鍋11・飲み放題13・パクチーのみ
  const qcfg = await b.ev(`PO.decodeHash(${JSON.stringify(qg.url.split('#')[1])}).cfg`);
  const prevUrl = await b.ev(`location.origin+'/#'+PO.encodeA(PO.toAnswer(${JSON.stringify(qcfg)},{adults:'15',kids:'0',counts:['11','4'],drinkN:'13',alg:[['パクチー','2','1']],pay:'0',rcpt:'1',note:''},'2026-11-03T20:40').cfg)`);
  const nowCfg = await b.ev(`PO.decodeHash(${JSON.stringify(ag.url.split('#')[1])}).cfg`);
  const nowUrl = await b.ev(`location.origin+'/#'+PO.encodeA(Object.assign(${JSON.stringify(nowCfg)},{ans:'2026-11-04T21:10'}))`);

  // 4) 受け取る画面 → 取り込み
  await reopen(prevUrl);
  ok('receive table', JSON.stringify(await b.ev(`[...document.querySelectorAll('.ans tr')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())`)) === JSON.stringify(['人数 15人（大人15）', 'おまかせ鍋コース 4,500円 11人', '軽めのおつまみコース 3,500円 4人', '飲み放題（1人1,800円・120分） 13人', 'アレルギー・苦手 苦手: パクチー 2人', 'お支払い まとめて', '領収書 要る', '合計の目安 86,900円（目安です。お会計とは違うことがあります）']), await b.ev(`[...document.querySelectorAll('.ans tr')].map(r=>r.innerText)`));
  ok('receive notice/mark', /11\/3 20:40に作成/.test(await b.ev(body)) && /ご予約が決まったという意味ではありません/.test(await b.ev(body)) && /苦手あり/.test(await b.ev(body)));
  m = await b.ev(measure); ok('receive 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('receive targets', !m.small.length, m.small);
  await b.shot(path.join(OUT, 'receive-375.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  await b.ev(click('一覧に取り込む')); await b.sleep(200);
  ok('imported to list', /12\/11（金） たなかさまのご予約を一覧に取り込みました/.test(await b.ev(body)) && JSON.stringify(await b.ev(items)) === JSON.stringify(['12/11（金） 19:00 たなかさま 15人 おまかせ鍋コース 11・軽めのおつまみコース 4・飲み放題 13 苦手あり 苦手: パクチー 2人／お支払い: まとめて・領収書: 要る／返事 11/3 20:40 この件を消す']), await b.ev(items));
  ok('total line', /これからの団体予約 1件・計15人/.test(await b.ev(body)));
  ok('shop name filled', await b.ev(`document.querySelector('#app input[placeholder="例 いろり屋"]').value`) === 'いろり屋');
  // 同じリンク・同じ中身 → 取り込み済み
  await reopen(prevUrl); await b.ev(click('一覧に取り込む')); await b.sleep(100);
  ok('same content -> already imported', /もう一覧に取り込み済みです/.test(await b.ev(body)) && !(await b.ev(`document.querySelector('.cmp')`)));
  // 送り直し（Card1） → 前回と今回を並べる
  await reopen(nowUrl); await b.ev(click('一覧に取り込む')); await b.sleep(150);
  const cmp = await b.ev(`(()=>{const c=document.querySelector('.cmp');return c&&{head:c.querySelector('.ch').textContent,cols:[...c.querySelectorAll('thead th')].map(x=>x.textContent),rows:[...c.querySelectorAll('tbody:not([hidden]) tr')].map(r=>r.innerText.replace(/\\s+/g,' ').trim()),chg:c.querySelectorAll('tr.chg').length,more:c.querySelector('.linkbtn')&&c.querySelector('.linkbtn').textContent,old:!!c.querySelector('.old')}})()`);
  ok('S5 compare head', cmp && cmp.head === 'たなかさま　12/11（金） 19:00〜' && JSON.stringify(cmp.cols) === JSON.stringify(['項目', '前回 11/3 20:40', '今回 11/4 21:10']), cmp);
  ok('S5 compare rows', cmp && JSON.stringify(cmp.rows) === JSON.stringify(['人数 15人（大人15） 13人（大人13） ▼2', 'おまかせ鍋コース 4,500円 11人 9人 ▼2', '飲み放題（1人1,800円・120分） 13人 11人 ▼2', 'アレルギー・苦手 苦手: パクチー 2人 アレルギー: えび 1人 苦手: パクチー 2人', '合計の目安 86,900円 74,300円']) && cmp.chg === 5 && cmp.more === '変わっていない項目 3つを見る' && !cmp.old, cmp);
  m = await b.ev(measure); ok('compare 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('compare 375 targets', !m.small.length, m.small);
  await b.ev(click('変わっていない項目 3つを見る')); await b.sleep(60);
  ok('S5 more rows', (await b.ev(`document.querySelectorAll('.cmp tbody:not([hidden]) tr').length`)) === 8);
  await b.shot(path.join(OUT, 'compare-375.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  await b.ev(click('やめる')); await b.sleep(80);
  ok('cancel keeps old', (await b.ev(getStore)).items[0].adults === 15 && !(await b.ev(`document.querySelector('.cmp')`)));
  await b.ev(click('一覧に取り込む')); await b.sleep(100); await b.ev(click('新しい内容で上書きする')); await b.sleep(150);
  ok('S5 overwritten + changed mark', /上書きしました（変わった項目: 人数・コース・飲み放題・アレルギー・苦手）/.test(await b.ev(body)) && /^12\/11（金） 19:00 たなかさま 13人 おまかせ鍋コース 9・軽めのおつまみコース 4・飲み放題 11 変更あり: 人数・コース・飲み放題・アレルギー・苦手 アレルギー・苦手あり アレルギー: えび 1人／苦手: パクチー 2人/.test((await b.ev(items))[0]) && (await b.ev(getStore)).items.length === 1, await b.ev(items));
  // 古いリンクを後から開いたとき
  await reopen(prevUrl); await b.ev(click('一覧に取り込む')); await b.sleep(100);
  ok('older link warned', await b.ev(`!!document.querySelector('.cmp .old')`) && /前に届いた内容より古いリンクです/.test(await b.ev(body)));
  // 別の確認リンクへの返事は別の件
  const other = await b.ev(`location.origin+'/#'+PO.encodeA(Object.assign(${JSON.stringify(nowCfg)},{rid:'zzzz9999',name:'さとう',day:'2026-12-19',time:'18:00'}))`);
  await reopen(other); await b.ev(click('一覧に取り込む')); await b.sleep(150);
  ok('other link added', (await b.ev(items)).length === 2 && /計26人/.test(await b.ev(body)));
  // 消すのも画面の中で確かめる
  await b.ev(click('この件を消す')); await b.sleep(80);
  ok('delete asks in page', /一覧から消します/.test(await b.ev(askText)));
  await b.ev(click('やめる')); await b.sleep(80);
  ok('delete cancel keeps', (await b.ev(items)).length === 2);
  await b.ev(click('この件を消す')); await b.sleep(80); await b.ev(click('消す')); await b.sleep(100);
  ok('delete confirmed', (await b.ev(items)).length === 1);
  // 確かめる枠を出しているあいだに別のタブで一覧が変わっても、押した瞬間の一覧に対して保存する
  const keep = (await b.ev(getStore)).items[0];
  const again = await b.ev(`location.origin+'/#'+PO.encodeA(Object.assign(${JSON.stringify(nowCfg)},{rid:${JSON.stringify(keep.rid)},name:${JSON.stringify(keep.name)},day:${JSON.stringify(keep.day)},time:${JSON.stringify(keep.time)},pay:2,ans:'2026-11-04T22:00'}))`);
  await reopen(again); await b.ev(click('一覧に取り込む')); await b.sleep(100);
  ok('stale: compare shown', !!(await b.ev(`document.querySelector('.cmp')`)));
  await b.ev(`(()=>{const v=JSON.parse(localStorage.getItem('${KEY}'));const x=JSON.parse(JSON.stringify(v.items[0]));x.id='other1';x.rid='other111';x.name='みお';v.items.push(x);localStorage.setItem('${KEY}',JSON.stringify(v))})()`);
  await b.ev(click('新しい内容で上書きする')); await b.sleep(150);
  const after2 = (await b.ev(getStore)).items;
  ok('stale: other tab item kept + overwritten', after2.length === 2 && after2.some(x => x.rid === 'other111') && after2.find(x => x.rid === keep.rid).pay === 2 && JSON.stringify(after2.find(x => x.rid === keep.rid).changed) === '["お支払い"]', after2);
  // 5) 過ぎた予約は下に折りたたむ・再読み込みで戻る
  await b.ev(`(()=>{const v=JSON.parse(localStorage.getItem('${KEY}'));v.items[1].day='2026-11-04';v.items[0].day='2026-11-03';localStorage.setItem('${KEY}',JSON.stringify(v))})()`);
  await reopen();
  ok('past folded', /過ぎた予約 1件/.test(await b.ev(body)) && await b.ev(`document.querySelectorAll('.items')[0].children.length`) === 1 && await b.ev(`!document.querySelector('details.past').open`) && /これからの団体予約 1件/.test(await b.ev(body)));
  for (let k = 0; k < 2; k++) { await b.ev(`document.querySelector('details.past').open=true`); await b.ev(click('この件を消す')); await b.sleep(80); await b.ev(click('消す')); await b.sleep(100); }
  ok('delete all', (await b.ev(items)).length === 0 && (await b.ev(getStore)).items.length === 0);
  // 6) サンプル（Card2）375・880・1000
  await b.ev(click('サンプルを入れる')); await b.sleep(150);
  const it = await b.ev(items);
  ok('S2 sample list', it.length === 4 && /^12\/4（金） 18:30 すずきさま 8人 おまかせ鍋コース 8・飲み放題 8 お支払い/.test(it[0]) && /^12\/11（金） 19:00 たなかさま 13人 おまかせ鍋コース 9・軽めのおつまみコース 4・飲み放題 11 変更あり: 人数・コース・飲み放題・アレルギー・苦手 アレルギー・苦手あり/.test(it[1]) && /^12\/18（金） 19:30 やまだ.* 22人 おまかせ鍋コース 22・飲み放題 20 苦手あり/.test(it[2]) && /^12\/25（金） 18:00 こばやしさま 9人 軽めのおつまみコース 9 /.test(it[3]), it);
  ok('S2 total 52', /これからの団体予約 4件・計52人/.test(await b.ev(body)));
  ok('sample hidden when list exists', await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').hidden`));
  m = await b.ev(measure); ok('sample 375 no overflow', m.sw <= 375 && !m.over.length, m); ok('sample 375 targets', !m.small.length, m.small);
  for (const w of [880, 1000]) {
    await reopen(null, w, 1400);
    m = await b.ev(measure);
    const cols = await b.ev(`(()=>{const l=document.querySelector('.layout').children;return [l[0].getBoundingClientRect().left,l[1].getBoundingClientRect().left,l[0].getBoundingClientRect().top===l[1].getBoundingClientRect().top]})()`);
    ok(w + ' two columns', m.sw <= w && !m.over.length && cols[1] > cols[0] && cols[2], [m, cols]);
    await b.shot(path.join(OUT, 'shop-' + w + '.png'), { x: 0, y: 0, width: w, height: await b.ev(`document.documentElement.scrollHeight`) });
  }
  await reopen(nowUrl, 1000, 1200);
  // レビュー①: アレルギー欄が空なら「記入なし」・過ぎた予約日の確認リンクには注意
  await reopen(ORIGIN + '#' + await b.ev(`PO.encodeA(PO.toAnswer(${JSON.stringify(qcfg)},{adults:'15',kids:'0',counts:['11','4'],drinkN:'13',alg:[],pay:'0',rcpt:'1',note:''}).cfg)`));
  ok('R1-1 empty alg shown as 記入なし', /アレルギー・苦手記入なし/.test(await b.ev(`[...document.querySelectorAll('.ans tr')].map(r=>r.textContent).join('|')`)) && !/苦手: なし/.test(await b.ev(body)));
  await reopen(ORIGIN + '#' + await b.ev(`PO.encodeQ(Object.assign(${JSON.stringify(qcfg)},{day:'2026-11-04',dl:'',made:'2026-11-03T10:00'}))`)); await b.ev(`PO.now=new Date(2026,10,6,9,0);POUI.route()`); await b.sleep(100);
  ok('R1-14 past day warned', /このご予約の日は過ぎています/.test(await b.ev(body)));
  ok('receive 1000 max width', await b.ev(`document.querySelector('.onepage').getBoundingClientRect().width`) <= 520);
  // 7) 壊れた保存データは消さない・一部だけ壊れたとき
  await b.ev(`localStorage.clear();localStorage.setItem('${KEY}','{bad')`); await reopen();
  ok('broken store message', await b.ev(`[...document.querySelectorAll('.errors')].some(e=>!e.hidden&&/読み取れませんでした/.test(e.textContent))`));
  const bk = `Object.keys(localStorage).filter(k=>k.indexOf('${KEY}-backup-')===0).sort().map(k=>localStorage.getItem(k))`;
  ok('broken store kept', JSON.stringify(await b.ev(bk)) === '["{bad"]' && await b.ev(`localStorage.getItem('${KEY}')`) === '{bad');
  ok('broken: sample hidden', await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').hidden`));
  await reopen();
  ok('broken: same backup not duplicated', (await b.ev(bk)).length === 1);
  // レビュー①: 読み取れないあいだは、お店の名前を入れても本体を空の一覧で上書きしない
  await b.ev(val('例 いろり屋', 'いろり屋')); await b.sleep(60);
  ok('R1-3 broken: shop name not saved', await b.ev(`localStorage.getItem('${KEY}')`) === '{bad' && /一覧が読み取れないあいだは保存しません/.test(await b.ev(body)));
  for (const bad of ['{bad2', '{bad3', '{bad4']) { await b.ev(`localStorage.setItem('${KEY}',${JSON.stringify(bad)})`); await b.sleep(5); await reopen(); }
  ok('backups keep newest 3', JSON.stringify(await b.ev(bk)) === '["{bad2","{bad3","{bad4"]', await b.ev(bk));
  await reopen(nowUrl); await b.ev(click('一覧に取り込む')); await b.sleep(100);
  ok('broken import asks in page', /一覧が読み取れませんでした/.test(await b.ev(askText)));
  await b.ev(click('新しい一覧に取り込む')); await b.sleep(150);
  ok('broken import ok + backups kept', (await b.ev(items)).length === 1 && (await b.ev(bk)).length === 3);
  const good = (await b.ev(getStore)).items[0];
  const part = JSON.stringify({ shop: 'いろり屋', items: [good, { id: 'b', name: 'x', counts: 5 }] });
  await b.ev(`localStorage.clear();localStorage.setItem('${KEY}',${JSON.stringify(part)})`); await reopen();
  ok('partial store message + backup', /一部が読み取れなかった/.test(await b.ev(body)) && JSON.stringify(await b.ev(bk)) === JSON.stringify([part]) && (await b.ev(items)).length === 1);
  // 8) 100件で止まる
  const many = { shop: '', items: Array.from({ length: 100 }, (_, i) => Object.assign({}, good, { id: 'm' + i, rid: 'many' + String(i).padStart(4, '0') })) };
  await b.ev(`localStorage.clear();` + setStore(many)); await reopen(nowUrl);
  await b.ev(click('一覧に取り込む')); await b.sleep(100);
  ok('import at 100 stops', /100件までです/.test(await b.ev(body)) && (await b.ev(getStore)).items.length === 100);
  // 9) 別のタブで一覧が変わったら読み直す
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(click('サンプルを入れる')); await b.sleep(100);
  await b.ev(`(()=>{const v=JSON.parse(localStorage.getItem('${KEY}'));v.items.pop();const s=JSON.stringify(v);localStorage.setItem('${KEY}',s);window.dispatchEvent(new StorageEvent('storage',{key:'${KEY}',newValue:s}))})()`); await b.sleep(100);
  ok('storage event reload', (await b.ev(items)).length === 3 && /別の画面で一覧が変わった/.test(await b.ev(body)));
  // 10) 壊れたリンク
  const B = s => Buffer.from(s).toString('base64url');
  for (const hsh of ['#q1=', '#a1=abc', '#q2=WzFd', '#a1=' + B('[1,"","たなか","2026-12-11","19:00",[["鍋",4500]],0,13,0,[12],0,[],0,1,"","2026-11-04T21:10","abc12345"]'), '#q1=' + B('[1,"","たなか","2026-12-11","19:10",0,[["鍋",4500]],0,"","2026-11-03T20:00","abc12345"]'), '#a1=' + B('[1,"","たなか","2026-12-11","19:00",[["鍋",4500]],0,13,0,[13],0,[],0,1,"","2099-12-31T00:00","abc12345"]'), '#x']) {
    await reopen(ORIGIN + hsh);
    ok('broken link ' + hsh.slice(0, 20), /内容が読み取れませんでした/.test(await b.ev(body)) && !(await b.ev(`document.querySelector('fieldset, .ans')`)));
  }
  // 11) XSS（お店の入力 → 幹事さんの画面 → 受け取る画面 → 一覧）
  await b.ev(`localStorage.clear()`); await reopen();
  await b.ev(val('例 いろり屋', '<b onclick=alert(1)>')); await b.ev(val('例 たなか', '"><b>x')); await b.ev(dateIn(0, '2026-12-11'));
  await b.ev(val('コース1の名前', '<img src=x>')); await b.ev(val('コース1の1人あたりの料金（円）', '3000'));
  await b.ev(click('リンクを作る')); await b.sleep(120);
  const xq = await b.ev(`document.querySelector('textarea.urlbox').value`);
  await reopen(xq);
  ok('xss ask', !!xq && !(await b.ev(`document.querySelector('#app img, #app script, #app [onclick], #app [onerror]')`)) && /^"><b>xさま/.test(await b.ev(`document.querySelector('.who .wn').textContent`)));
  await b.ev(step('大人', 3)); await b.ev(click('＋ 1行足す')); await b.ev(val('1行目の食材', '<svg/x>')); await b.ev(choose('alg0', '0'));
  await b.ev(choose('pay', '0')); await b.ev(choose('rcpt', '0')); await b.ev(val('例 乾杯は19時半からです', '<script>x</script>'));
  await b.ev(click('お店に返すリンクを作る')); await b.sleep(120);
  const xa = await b.ev(`document.querySelector('textarea.urlbox').value`);
  await reopen(xa);
  ok('xss receive', !!xa && !(await b.ev(`document.querySelector('#app img, #app svg, #app script, #app [onclick], #app [onerror], #app [onload]')`)));
  await b.ev(click('一覧に取り込む')); await b.sleep(150);
  ok('xss list', !(await b.ev(`document.querySelector('#app img, #app svg, #app script, #app [onclick], #app [onerror], #app [onload]')`)) && /<img src=x> 3/.test((await b.ev(items))[0]) && /<script>x<\/script>/.test((await b.ev(items))[0]) && /<svg\/x>/.test((await b.ev(items))[0]), await b.ev(items));
  // 12) 保存できない端末（setItem が例外）でもリンク作成と受け取りの表示はできる
  const sid = (await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.setItem=function(){throw new Error('quota')};` })).result.identifier;
  await reopen();
  ok('no storage message', /この端末では一覧を保存できません/.test(await b.ev(body)));
  await b.ev(val('例 たなか', 'たなか')); await b.ev(dateIn(0, '2026-12-11')); await b.ev(val('コース1の名前', '鍋')); await b.ev(val('コース1の1人あたりの料金（円）', '4000')); await b.ev(click('リンクを作る')); await b.sleep(100);
  ok('no storage link works', /#q1=/.test(await b.ev(`document.querySelector('textarea.urlbox').value`)));
  await reopen(nowUrl); await b.ev(click('一覧に取り込む')); await b.sleep(150);
  ok('no storage import into memory', (await b.ev(items)).length >= 1 && /この端末では一覧を保存できません/.test(await b.ev(body)));
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sid });
  // 13) 共有ボタン（navigator.share がある端末だけ出す・キャンセルは失敗扱いにしない）
  const sid0 = (await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{delete Navigator.prototype.share}catch(e){}` })).result.identifier;
  await b.ev(`localStorage.clear()`); await reopen(); await b.ev(val('例 たなか', 'たなか')); await b.ev(dateIn(0, '2026-12-11')); await b.ev(val('コース1の名前', '鍋')); await b.ev(val('コース1の1人あたりの料金（円）', '4000')); await b.ev(click('リンクを作る')); await b.sleep(100);
  ok('share hidden w/o navigator.share', await b.ev(`typeof navigator.share`) === 'undefined' && await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='共有').hidden`));
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sid0 });
  const sid2 = (await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `navigator.share=function(){window.__shared=(window.__shared||0)+1;return Promise.reject(Object.assign(new Error('x'),{name:'AbortError'}))};` })).result.identifier;
  await reopen(qg.url); await fillNow({ adults: 15, courses: [['おまかせ鍋コース', 11], ['軽めのおつまみコース', 4]], drink: 13, alg: [], pay: '0', rcpt: '1' }); await b.ev(click('お店に返すリンクを作る')); await b.sleep(100);
  ok('share shown (kanji)', !(await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='共有').hidden`)));
  await b.ev(click('共有')); await b.sleep(150);
  ok('share abort not error', await b.ev(`window.__shared`) === 1 && !/共有できませんでした/.test(await b.ev(body)));
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sid2 });
  // 14) コピーの代わりの経路（clipboard が無いとき）
  await b.ev(`Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});document.execCommand=()=>false`);
  await b.ev(click('お店に返す文をコピー')); await b.sleep(100);
  ok('copy fallback selects text', /長押しして、コピーしてください/.test(await b.ev(body)) && await b.ev(`document.activeElement===document.querySelector('.msgbox')`));
  // 15) 最長の値（お店の名前20字・コース名20字×4・アレルギー5行）375px・ダーク
  await b.ev(`localStorage.clear()`); await reopen(null, 375, 900, true);
  await b.ev(val('例 いろり屋', 'いろり屋いろり屋いろり屋いろり屋いろ')); await b.ev(val('例 たなか', 'ＷＷＷＷＷＷＷＷＷＷ')); await b.ev(dateIn(0, '2026-12-11'));
  for (let i = 1; i <= 4; i++) { if (i > 1) { await b.ev(click('＋ コースを足す')); await b.sleep(40); } await b.ev(val('コース' + i + 'の名前', 'あいうえおかきくけこさしすせそたちつて' + i)); await b.ev(val('コース' + i + 'の1人あたりの料金（円）', '99999')); }
  await b.ev(choose('drink', '1')); await b.ev(val('例 1800', '9999'));
  await b.ev(click('リンクを作る')); await b.sleep(120);
  m = await b.ev(measure); ok('longest shop 375 dark', m.sw <= 375 && !m.over.length, m); ok('longest shop targets', !m.small.length, m.small);
  ok('add course hidden at 4', await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='＋ コースを足す').hidden`));
  const lq = await b.ev(`document.querySelector('textarea.urlbox').value`);
  await reopen(lq, 375, 900, true);
  await b.ev(step('大人', 60));
  const cs = await b.ev(`[...document.querySelectorAll('fieldset.box')][1].querySelectorAll('.step').length`);
  await b.ev(`(()=>{const s=[...document.querySelectorAll('fieldset.box')][1].querySelectorAll('.step input');const v=[15,15,15,15];s.forEach((e,i)=>{e.value=String(v[i]);e.dispatchEvent(new Event('input'))});return true})()`);
  await b.ev(step('飲み放題をつける人数', 60));
  for (let i = 0; i < 5; i++) { await b.ev(click('＋ 1行足す')); await b.sleep(30); await b.ev(val((i + 1) + '行目の食材', 'あいうえおかきくけこ')); await b.ev(step('人数', 60, algRow(i))); await b.ev(choose('alg' + i, i % 2 ? '1' : '0')); }
  ok('add alg hidden at 5', await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='＋ 1行足す').hidden`));
  await b.ev(choose('pay', '2')); await b.ev(choose('rcpt', '1')); await b.ev(val('例 乾杯は19時半からです', 'あ'.repeat(40))); await b.ev(click('お店に返すリンクを作る')); await b.sleep(120);
  m = await b.ev(measure); ok('longest ask 375 dark', cs === 4 && m.sw <= 375 && !m.over.length, [cs, m]); ok('longest ask targets', !m.small.length, m.small);
  await b.shot(path.join(OUT, 'ask-longest-375-dark.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  const la = await b.ev(`document.querySelector('textarea.urlbox').value`);
  ok('longest answer link made', /#a1=/.test(la));
  console.log('   最長の値の確認リンク', Array.from(lq).length, '／返すリンク', Array.from(la).length);
  await reopen(la, 375, 900, true);
  m = await b.ev(measure); ok('longest receive 375 dark', m.sw <= 375 && !m.over.length, m);
  await b.ev(click('一覧に取り込む')); await b.sleep(150);
  m = await b.ev(measure); ok('longest list 375 dark', m.sw <= 375 && !m.over.length, m);
  await b.shot(path.join(OUT, 'shop-longest-375-dark.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  // ダークの前後比較
  await b.ev(`localStorage.clear()`); await reopen(prevUrl, 375, 900, true); await b.ev(click('一覧に取り込む')); await b.sleep(120);
  await reopen(nowUrl, 375, 900, true); await b.ev(click('一覧に取り込む')); await b.sleep(120);
  m = await b.ev(measure); ok('compare dark 375 no overflow', m.sw <= 375 && !m.over.length, m);
  await b.shot(path.join(OUT, 'compare-375-dark.png'), { x: 0, y: 0, width: 375, height: await b.ev(`document.documentElement.scrollHeight`) });
  // 16) 外部への通信・例外
  const ext = reqs.filter(u => !u.startsWith(ORIGIN) && !u.startsWith('data:') && !/cloudflareinsights/.test(u));
  ok('no external requests (except blocked beacon)', !ext.length, ext);
  ok('no exceptions', !errs.length, errs);
  console.log(ng ? 'NG ' + ng : 'ALL OK');
  b.close(); srv.close(); process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
