// 2つの script の文法だけを確かめる。実行: node source/syntax.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = { core: /<script id="core">([^]*?)<\/script>/.exec(html)[1], ui: /<script id="ui">([^]*?)<\/script>/.exec(html)[1] };
for (const id in blocks) { try { new Function(blocks[id]); console.log(id, 'ok'); } catch (e) { console.log(id, e.message); } }
