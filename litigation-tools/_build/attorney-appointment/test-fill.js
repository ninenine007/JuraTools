// node test-fill.js <JDA|PY> <values.json|orig> <out.docx>
// 'orig' refills the source values recorded in out/spec.json (local only) — render in Word and pixel-diff against the source.
const fs = require('fs');
const JSZip = require('../../../mcp-server/node_modules/jszip');
const { makeEngine } = require('./poa-engine.js');
const widths = JSON.parse(fs.readFileSync('widths.json', 'utf8'));
const spec = JSON.parse(fs.readFileSync('out/spec.json', 'utf8'));
const [tpl, valsArg, outPath] = process.argv.slice(2);
const eng = makeEngine(widths);
(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(`out/tpl${tpl}.docx`));
  const xml = await zip.file('word/document.xml').async('string');
  let values;
  if (valsArg === 'orig') {
    values = {};
    for (const f of spec[tpl]) values[f.id] = f.kind === 'digits' ? (process.env.POA_ORIG_ID || '') : (f.orig || '');   // the source ID stays out of the repo
  } else values = JSON.parse(fs.readFileSync(valsArg, 'utf8'));
  const r = eng.fill(xml, spec[tpl], values, { thaiDigits: true });
  if (r.missing.length) console.log('MISSING', r.missing);
  for (const [id, x] of Object.entries(r.report)) if (!x.fits || x.condense) console.log('OVERFLOW', id, JSON.stringify(x));
  zip.file('word/document.xml', r.xml);
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', outPath, Object.keys(r.report).length, 'fields');
})();
