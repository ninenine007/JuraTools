// node gen-assets.js  -> bg_<T>.docx (blank, no parens) and sent_<T>.docx (unique token per field)
const fs = require('fs');
const JSZip = require('../../../mcp-server/node_modules/jszip');
const { makeEngine } = require('./poa-engine.js');
const widths = JSON.parse(fs.readFileSync('widths.json', 'utf8'));
const spec = JSON.parse(fs.readFileSync('out/spec.json', 'utf8'));
const eng = makeEngine(widths);
const tok = i => 'Q' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
(async () => {
  const sentinels = {};
  for (const T of ['JDA', 'PY']) {
    const buf = fs.readFileSync(`out/tpl${T}.docx`);
    // background
    let zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    let r = eng.fill(xml, spec[T], {}, { bg: true });
    zip.file('word/document.xml', r.xml);
    fs.writeFileSync(`bg_${T}.docx`, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    // sentinels
    const vals = {}; const starts = {};
    const pool = []; for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) pool.push(String.fromCharCode(97 + a) + String.fromCharCode(97 + b));
    let pi = 0;
    spec[T].forEach((f, i) => { vals[f.id] = f.kind === 'digits' ? '1234567890123' : tok(i); });
    zip = await JSZip.loadAsync(buf);
    r = eng.fill(xml, spec[T], vals, { condense: false });
    for (const [id, x] of Object.entries(r.report)) if (!x.fits && x.width) { vals[id] = 'i' + pool[pi++].replace(/[^a-z]/g, ''); }
    r = eng.fill(xml, spec[T], vals, { condense: false });
    for (const [id, x] of Object.entries(r.report)) if (!x.fits && x.width) throw new Error('sentinel does not fit ' + T + ' ' + id + ' ' + vals[id]);
    for (const [id, x] of Object.entries(r.report)) starts[id] = { tok: vals[id], start: x.start };
    console.log(T, Object.entries(vals).filter(([k,v]) => /^i/.test(v)).map(([k,v]) => k + '=' + v).join(' '));
    sentinels[T] = starts;
    zip.file('word/document.xml', r.xml);
    fs.writeFileSync(`sent_${T}.docx`, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
  fs.writeFileSync('sentinels.json', JSON.stringify(sentinels, null, 1));
  console.log('ok');
})();
