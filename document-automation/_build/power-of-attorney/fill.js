// node fill.js <workdir> <state.json> <out.docx>
// Builds one document from a page state (or an MCP-shaped input with "grantor.type"
// and English keys, if the file says {"input": …}). Used for the refill regressions
// (the precedents' own values, kept outside the repo) and by measure.py /
// measure_new.py. The 2024 form comes from out/ (build_pwa.py), the current forms
// from out/th and out/thEn (build_new.py), each with its geom.json once measured.
const fs = require('fs');
const path = require('path');
const JSZip = require('../../../mcp-server/node_modules/jszip');
const E = require('./pwa-engine.js');

const [work, statePath, outPath] = process.argv.slice(2);
const out = path.join(work, 'out');
const json = (p, d) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d;
const D = { forms: {} };
if (fs.existsSync(path.join(out, 'frags.json'))) {
  Object.assign(D, json(path.join(out, 'frags.json')), { geom: json(path.join(out, 'geom.json'), {}), tplPath: path.join(out, 'tpl.docx') });
}
for (const f of ['th', 'thEn']) {
  const d = path.join(out, f);
  if (fs.existsSync(path.join(d, 'frags.json')))
    D.forms[f] = Object.assign(json(path.join(d, 'frags.json')), { geom: json(path.join(d, 'geom.json'), {}), tplPath: path.join(d, 'tpl.docx') });
}
const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const state = raw.input ? E.fromInput(raw.input) : raw;

(async () => {
  const r = E.build(D, state);
  if (r.leftover.length) { console.error('LEFTOVER MARKERS', r.leftover); process.exit(1); }
  const S = E.adoptState(state);
  const tpl = S.form === 'legacy' ? D.tplPath : D.forms[S.form].tplPath;
  const zip = await JSZip.loadAsync(fs.readFileSync(tpl));
  zip.file('word/document.xml', r.xml);
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', outPath, '| form', S.form, '| stamp', r.derived.stamp.amount, '| blank', r.report.blank.join(', ') || '-',
    '| bad ids', r.report.invalidIds.join(', ') || '-');
})();
