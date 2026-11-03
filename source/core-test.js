// 文・リンク・保存データの検算（node）。実行: node source/core-test.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = /<script id="core">([^]*?)<\/script>/.exec(html)[1];
const m = { exports: {} }; new Function('module', core)(m); const PO = m.exports;
let ng = 0; const ok = (n, c, i) => { if (!c) ng++; console.log((c ? 'OK ' : 'NG ') + n + (i !== undefined && !c ? ' ' + JSON.stringify(i) : '')); };
PO.now = new Date(2026, 10, 4, 22, 0); // 2026-11-04 22:00
const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const HQ = a => '#q1=' + b64(JSON.stringify(a)), HA = a => '#a1=' + b64(JSON.stringify(a));
const BASE = 'https://nncf123nncf-oss.github.io/party-booking-link/';
const NABE = ['おまかせ鍋コース', '4500'], TSU = ['軽めのおつまみコース', '3,500'];
const QF = { shop: 'いろり屋', name: 'たなか', day: '2026-12-11', time: '19:00', plan: '15', courses: [NABE, TSU], drink: { on: true, price: '1800', min: '120' }, dl: '2026-12-04' };

// S1: Card1 の文
let q = PO.toQuestion(QF, '2026-11-03T20:00', 'tanaka01');
ok('S1 question', q.cfg && q.cfg.plan === 15 && JSON.stringify(q.cfg.courses) === '[["おまかせ鍋コース",4500],["軽めのおつまみコース",3500]]' && JSON.stringify(q.cfg.drink) === '[1800,120]', q.errors);
ok('S1 ask message', PO.askMessage(q.cfg, 'https://x/#q') === '【いろり屋】\nたなか さま\n12月11日（金）19:00〜のご予約ありがとうございます\n人数とコース\nアレルギーなどを\nこちらから選んでいただけますか\n人数は12月4日（金）までにお知らせください\nhttps://x/#q', PO.askMessage(q.cfg, 'https://x/#q'));
ok('S1 ask preview (no url)', /\n選んでいただけますか\n人数は/.test(PO.askMessage(q.cfg, '')) && !/こちらから/.test(PO.askMessage(q.cfg, '')));
const prevF = { adults: '15', kids: '0', counts: ['11', '4'], drinkN: '13', alg: [['パクチー', '2', '1']], pay: '0', rcpt: '1', note: '' };
const nowF = { adults: '13', kids: '0', counts: ['9', '4'], drinkN: '11', alg: [['えび', '1', '0'], ['パクチー', '2', '1']], pay: '0', rcpt: '1', note: '' };
let a0 = PO.toAnswer(q.cfg, prevF, '2026-11-03T20:40');
let a = PO.toAnswer(q.cfg, nowF, '2026-11-04T21:10');
ok('S1 answer', a.cfg && a0.cfg && a.cfg.rid === 'tanaka01' && a.cfg.ans === '2026-11-04T21:10', [a.errors, a0.errors]);
const want = '【ご予約内容】\nいろり屋 さんへ\nたなか より\n12月11日（金）19:00〜\n人数: 13人（大人13）\n・おまかせ鍋コース 4,500円: 9人\n・軽めのおつまみコース 3,500円: 4人\n飲み放題: 11人\nアレルギー: えび 1人／苦手: パクチー 2人\nお支払い: まとめて・領収書: 要る\nhttps://x/#a';
ok('S1 answer message', PO.answerMessage(a.cfg, 'https://x/#a') === want, PO.answerMessage(a.cfg, 'https://x/#a'));
// S10: 合計の目安
ok('S10 estimate now', PO.estimate(a.cfg) === 74300, PO.estimate(a.cfg));
ok('S10 estimate prev', PO.estimate(a0.cfg) === 4500 * 11 + 3500 * 4 + 1800 * 13, PO.estimate(a0.cfg));
// S5: 前後比較
ok('S5 changes', JSON.stringify(PO.changes(a0.cfg, a.cfg)) === '["人数","コース","飲み放題","アレルギー・苦手"]', PO.changes(a0.cfg, a.cfg));
const rows = PO.compareRows(a0.cfg, a.cfg);
const rmap = Object.fromEntries(rows.map(r => [r.label, r]));
ok('S5 rows people', rmap['人数'].prev === '15人（大人15）' && rmap['人数'].now === '13人（大人13）' && rmap['人数'].delta === '▼2' && rmap['人数'].changed);
ok('S5 rows course', rmap['おまかせ鍋コース 4,500円'].delta === '▼2' && !rmap['軽めのおつまみコース 3,500円'].changed);
ok('S5 rows drink', rmap['飲み放題（1人1,800円・120分）'].prev === '13人' && rmap['飲み放題（1人1,800円・120分）'].delta === '▼2', rows);
ok('S5 rows alg', rmap['アレルギー・苦手'].now === 'アレルギー: えび 1人\n苦手: パクチー 2人' && rmap['アレルギー・苦手'].changed);
ok('S5 rows pay same', !rmap['お支払い・領収書'].changed && rmap['合計の目安'].now === '74,300円');
ok('S5 increase arrow', PO.compareRows(a.cfg, a0.cfg)[0].delta === '▲2');
const u1 = BASE + '#' + PO.encodeQ(q.cfg), u2 = BASE + '#' + PO.encodeA(a.cfg);
console.log('   確認リンクの長さ', u1.length, '／返すリンクの長さ', u2.length);
ok('S3 roundtrip q (Card1)', JSON.stringify(PO.decodeHash(PO.encodeQ(q.cfg)).cfg) === JSON.stringify(q.cfg));
ok('S3 roundtrip a (Card1)', JSON.stringify(PO.decodeHash('#' + PO.encodeA(a.cfg)).cfg) === JSON.stringify(a.cfg));

// 文の言い回し: お店の名前なし・締切なし・子ども・飲み放題なし・ひと言
let q2 = PO.toQuestion({ shop: '', name: 'こばやし様', day: '2026-12-25', time: '18:00', plan: '', courses: [['おつまみ', '3500']], drink: { on: false }, dl: '' });
ok('ask msg no shop / honorific', q2.cfg && PO.askMessage(q2.cfg, '') === '【ご予約の確認】\nこばやし様\n12月25日（金）18:00〜のご予約ありがとうございます\n人数とコース\nアレルギーなどを\n選んでいただけますか', q2.errors || PO.askMessage(q2.cfg, ''));
let a2 = PO.toAnswer(q2.cfg, { adults: '7', kids: '2', counts: [], drinkN: '', alg: [], pay: '2', rcpt: '0', note: '子ども2人は取り分けで' });
ok('single course auto count', a2.cfg && JSON.stringify(a2.cfg.counts) === '[9]' && a2.cfg.drinkN === 0, a2.errors);
ok('answer msg kids/no drink', a2.cfg && PO.answerMessage(a2.cfg, '') === '【ご予約内容】\nこばやし様 より\n12月25日（金）18:00〜\n人数: 9人（大人7・子ども2）\n・おつまみ 3,500円: 9人\nアレルギー・苦手: なし\nお支払い: 当日決める・領収書: 要らない\nひと言: 子ども2人は取り分けで', a2.cfg && PO.answerMessage(a2.cfg, ''));

// S4: 人数の整合
const bad = (f, re, n) => { const r = PO.toAnswer(q.cfg, Object.assign({}, nowF, f)); ok('S4 ' + n, !r.cfg && r.errors.some(e => re.test(e)), r.errors); return r; };
let r4 = bad({ counts: ['8', '4'] }, /コースの人数が合計12人です。人数は13人です/, 'course sum'); ok('S4 course missing key', r4.missing.indexOf('course') >= 0);
bad({ drinkN: '14' }, /飲み放題をつける人数が、人数（13人）より多く/, 'drink > total');
bad({ alg: [['えび', '14', '0']] }, /1行目：人数を1〜13人/, 'alg > total');
bad({ alg: [['えび', '1', '']] }, /アレルギーか苦手か/, 'alg type');
bad({ alg: [['', '1', '0']] }, /1行目の食材を入れてください/, 'alg food empty');
bad({ adults: '0', kids: '0', counts: ['0', '0'] }, /1人以上/, 'zero people');
bad({ adults: '55', kids: '6', counts: ['57', '4'] }, /60人まで/, 'over 60');
bad({ pay: '' }, /お支払いのしかた/, 'pay');
bad({ rcpt: '' }, /領収書が要るか/, 'rcpt');
bad({ adults: 'あ' }, /大人の人数/, 'adults NaN');
bad({ alg: [['a', '1', '0'], ['b', '1', '0'], ['c', '1', '0'], ['d', '1', '0'], ['e', '1', '0'], ['f', '1', '0']] }, /5行まで/, 'alg 6 rows');
ok('S4 fullwidth digits ok', !!PO.toAnswer(q.cfg, Object.assign({}, nowF, { adults: '１３' })).cfg);

// お店の入力
const qbad = (f, re, n) => { const r = PO.toQuestion(Object.assign({}, QF, f)); ok('Q ' + n, !r.cfg && r.errors.some(e => re.test(e)), r.errors); };
qbad({ name: '' }, /幹事さんの呼び名を入れてください/, 'name');
qbad({ day: '' }, /予約日を入れてください/, 'day');
qbad({ day: '2026-11-03' }, /予約日は今日以降/, 'day past');
qbad({ time: '19:10' }, /開始時刻/, 'time not 15min');
qbad({ courses: [] }, /コースを1つ以上/, 'no course');
qbad({ courses: [NABE, NABE, NABE, NABE, NABE] }, /4つまで/, '5 courses');
qbad({ courses: [['鍋', '']] }, /料金を0〜99,999円/, 'course price empty');
qbad({ courses: [['鍋', '100000']] }, /料金を0〜99,999円/, 'course price over');
qbad({ courses: [['鍋4500円', '4500']] }, /金額や、支払い/, 'yen in course name');
qbad({ drink: { on: true, price: '', min: '120' } }, /飲み放題の1人あたり/, 'drink price');
qbad({ dl: '2026-12-12' }, /予約日までに/, 'dl after day');
qbad({ dl: '2026-11-01' }, /今日以降/, 'dl past');
qbad({ plan: '61' }, /予定人数/, 'plan over');
ok('Q plan empty = 0', PO.toQuestion(Object.assign({}, QF, { plan: '' })).cfg.plan === 0);
ok('Q drink off = 0', PO.toQuestion(Object.assign({}, QF, { drink: { on: false, price: 'x' } })).cfg.drink === 0);
ok('Q today ok', !!PO.toQuestion(Object.assign({}, QF, { day: '2026-11-04', dl: '' })).cfg);

// S6: 壊れたハッシュ
const qa = [1, 'いろり屋', 'たなか', '2026-12-11', '19:00', 15, [['鍋', 4500]], [1800, 120], '', '2026-11-03T20:00', 'tanaka01'];
const aa = [1, 'いろり屋', 'たなか', '2026-12-11', '19:00', [['鍋', 4500]], [1800, 120], 13, 0, [13], 11, [['えび', 1, 0]], 0, 1, '', '2026-11-04T21:10', 'tanaka01'];
ok('S6 base q ok', !!PO.decodeHash(HQ(qa))); ok('S6 base a ok', !!PO.decodeHash(HA(aa)));
const mut = (arr, i, v) => { const c = JSON.parse(JSON.stringify(arr)); c[i] = v; return c; };
const broken = {
  empty: '', hashOnly: '#', cut: HA(aa).slice(0, 40), q2: '#q2=' + HQ(qa).slice(4), a2: '#a2=' + HA(aa).slice(4), junk: '#a1=@@@', notjson: '#a1=' + b64('{'),
  qLen: HQ(qa.slice(0, 10)), aLen: HA(aa.slice(0, 16)), ver: HA(mut(aa, 0, 2)),
  negAdults: HA(mut(aa, 7, -1)), floatAdults: HA(mut(mut(aa, 7, 12.5), 9, [12.5])), strAdults: HA(mut(aa, 7, '13')),
  sumMismatch: HA(mut(aa, 9, [12])), countsLen: HA(mut(aa, 9, [13, 0])), drinkOver: HA(mut(aa, 10, 14)), drinkNoOffer: HA(mut(aa, 6, 0)),
  algOver: HA(mut(aa, 11, [['えび', 14, 0]])), algType: HA(mut(aa, 11, [['えび', 1, 2]])), algMany: HA(mut(aa, 11, Array(6).fill(['えび', 1, 0]))),
  payBad: HA(mut(aa, 12, 3)), rcptBad: HA(mut(aa, 13, 2)), noDate: HA(mut(aa, 3, '2026-02-30')), badTime: HA(mut(aa, 4, '19:10')),
  future: HA(mut(aa, 15, '2026-11-07T10:00')), badStamp: HA(mut(aa, 15, '2026-11-04 21:10')), badRid: HA(mut(aa, 16, 'X')),
  coursePrice: HA(mut(aa, 5, [['鍋', -1]])), courseMany: HA(mut(mut(aa, 5, Array(5).fill(['鍋', 1])), 9, [13, 0, 0, 0, 0])), courseName: HA(mut(aa, 5, [['https://a.jp', 1]])),
  qDayBeforeMade: HQ(mut(qa, 3, '2026-11-02')), qDlAfterDay: HQ(mut(qa, 8, '2026-12-12')), qFuture: HQ(mut(qa, 9, '2026-11-08T00:00')), qPlan: HQ(mut(qa, 5, 61)),
  qDrinkMin: HQ(mut(qa, 7, [1800, 10])), long: '#a1=' + 'A'.repeat(2100), nameHtmlLink: HA(mut(aa, 2, 'www.x.jp'))
};
Object.keys(broken).forEach(k => ok('S6 ' + k, PO.decodeHash(broken[k]) === null));
ok('S6 drink none & 0', !!PO.decodeHash(HA(mut(mut(aa, 6, 0), 10, 0))));
ok('S6 tomorrow ok (timezone margin)', !!PO.decodeHash(HA(mut(aa, 15, '2026-11-05T09:00'))));

// S7: 文字の制限
const okText = ['いろり屋 2F', 'おまかせ鍋コース', 'えび', '乾杯は19時半からです', '子ども2人は取り分けで', '生もの', '👨‍👩‍👧 家族'];
okText.forEach(t => ok('S7 pass ' + t, !PO.blockedReason(t)));
const ngText = ['https://x.jp', 'abc.com', 'a@b', '090-1234-5678', '1234567', '振込は', '口座', '4500円', '¥4500', 'LINE ID', '料金は'];
ngText.forEach(t => ok('S7 block ' + t, !!PO.blockedReason(t)));
ok('S7 name 10 ok / 11 ng', !!PO.toQuestion(Object.assign({}, QF, { name: 'あ'.repeat(10) })).cfg && !PO.toQuestion(Object.assign({}, QF, { name: 'あ'.repeat(11) })).cfg);
ok('S7 course 20 ok / 21 ng', !!PO.toQuestion(Object.assign({}, QF, { courses: [['あ'.repeat(20), '1']] })).cfg && !PO.toQuestion(Object.assign({}, QF, { courses: [['あ'.repeat(21), '1']] })).cfg);
ok('S7 food 10 ok / 11 ng', !!PO.toAnswer(q.cfg, Object.assign({}, nowF, { alg: [['あ'.repeat(10), '1', '0']] })).cfg && !PO.toAnswer(q.cfg, Object.assign({}, nowF, { alg: [['あ'.repeat(11), '1', '0']] })).cfg);
ok('S7 note 40 ok / 41 ng', !!PO.toAnswer(q.cfg, Object.assign({}, nowF, { note: 'あ'.repeat(40) })).cfg && !PO.toAnswer(q.cfg, Object.assign({}, nowF, { note: 'あ'.repeat(41) })).cfg);
ok('S7 ZWJ kept', PO.clean('👨‍👩‍👧') === '👨‍👩‍👧');

// S3: 乱数の往復
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const words = ['鍋', '🍲コース', '𠮷野', '全角！？', 'おまかせ', 'Ａコース', 'ﾊﾟｸﾁｰ', 'えび', 'そば', '👨‍👩‍👧'];
let rt = 0, rtNg = 0;
for (let i = 0; i < 2000; i++) {
  const nc = 1 + Math.floor(Math.random() * 4);
  const courses = Array.from({ length: nc }, (_, k) => [pick(words) + k, String(Math.floor(Math.random() * 100000))]);
  const drink = Math.random() < 0.5 ? { on: false } : { on: true, price: String(Math.floor(Math.random() * 10000)), min: pick(['60', '90', '120', '150', '180']) };
  const day = PO.addDays('2026-11-04', Math.floor(Math.random() * 60));
  const qq = PO.toQuestion({ shop: pick(['', 'いろり屋', '🍶酒場']), name: pick(words), day, time: pick(['11:00', '18:15', '23:45']), plan: String(Math.floor(Math.random() * 61)), courses, drink, dl: Math.random() < 0.5 ? '' : day });
  if (!qq.cfg) { rtNg++; continue; }
  const dq = PO.decodeHash(PO.encodeQ(qq.cfg));
  const ad = Math.floor(Math.random() * 40), kd = Math.floor(Math.random() * 5) + (ad ? 0 : 1), t = ad + kd;
  const counts = Array(nc).fill(0); for (let k = 0; k < t; k++) counts[Math.floor(Math.random() * nc)]++;
  const alg = Array.from({ length: Math.floor(Math.random() * 6) }, () => [pick(words), String(1 + Math.floor(Math.random() * t)), pick(['0', '1'])]);
  const aa2 = PO.toAnswer(dq.cfg, { adults: String(ad), kids: String(kd), counts: counts.map(String), drinkN: String(Math.floor(Math.random() * (t + 1))), alg, pay: pick(['0', '1', '2']), rcpt: pick(['0', '1']), note: Math.random() < 0.5 ? '' : pick(words) });
  if (!aa2.cfg) { rtNg++; continue; }
  const da = PO.decodeHash(PO.encodeA(aa2.cfg));
  if (da && JSON.stringify(da.cfg) === JSON.stringify(aa2.cfg) && JSON.stringify(dq.cfg) === JSON.stringify(qq.cfg)) rt++; else rtNg++;
}
ok('S3 random roundtrip 2000', rt === 2000, { rt, rtNg });

// S9（保存データ）: サンプルの形・壊れた件だけ落とす・変わった項目の名前
const st = { shop: 'いろり屋', items: [PO.itemFrom(a.cfg), Object.assign(PO.itemFrom(a2.cfg), { changed: ['人数', 'ふしぎ'] }), { name: 'x', day: 'bad' }, null] };
const san = PO.sanitizeStore(JSON.parse(JSON.stringify(st)));
ok('S9 sanitize keeps 2 drops 2', san.store.items.length === 2 && san.dropped === 2, san && san.dropped);
ok('S9 changed filtered', JSON.stringify(san.store.items[1].changed) === '["人数"]');
ok('S9 not object', PO.sanitizeStore('x') === null && PO.sanitizeStore({}) === null);
ok('S9 sameContent', PO.sameContent(PO.itemFrom(a.cfg), PO.itemFrom(a.cfg)) && !PO.sameContent(PO.itemFrom(a0.cfg), PO.itemFrom(a.cfg)));
ok('S9 sorted by day/time', JSON.stringify(PO.sorted([{ day: '2026-12-11', time: '19:00' }, { day: '2026-12-04', time: '18:30' }, { day: '2026-12-04', time: '12:00' }]).map(x => x.time)) === '["12:00","18:30","19:00"]');
ok('S2 breakdown', PO.breakdown(PO.itemFrom(a.cfg)) === 'おまかせ鍋コース 9・軽めのおつまみコース 4・飲み放題 11', PO.breakdown(PO.itemFrom(a.cfg)));
ok('S2 algMark', PO.algMark(a.cfg) === 'アレルギー・苦手あり' && PO.algMark(a0.cfg) === '苦手あり' && PO.algMark(a2.cfg) === '');
ok('weekday', PO.dateJa('2026-12-19') === '12月19日（土）' && PO.md('2026-12-04') === '12/4（金）');

console.log(ng ? 'NG ' + ng : 'ALL OK');
process.exit(ng ? 1 : 0);
