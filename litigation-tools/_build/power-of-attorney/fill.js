// node fill.js <workdir> <state.json> <out.docx>
// Builds one document from a page state (or an MCP-shaped input with "grantor.type"
// and English keys, if the file says {"input": …}). Used for the refill regression
// (the precedents' own values, kept outside the repo) and for measure.py.
const fs = require('fs');
const path = require('path');
const JSZip = require('../../../mcp-server/node_modules/jszip');
const E = require('./pwa-engine.js');

const [work, statePath, outPath] = process.argv.slice(2);
const out = path.join(work, 'out');
const { frags, alt } = JSON.parse(fs.readFileSync(path.join(out, 'frags.json'), 'utf8'));
const geomPath = path.join(out, 'geom.json');
const geom = fs.existsSync(geomPath) ? JSON.parse(fs.readFileSync(geomPath, 'utf8')) : {};
const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const state = raw.input ? E.fromInput(raw.input) : raw;

(async () => {
  const r = E.build({ frags, alt, geom }, state);
  if (r.leftover.length) { console.error('LEFTOVER MARKERS', r.leftover); process.exit(1); }
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(out, 'tpl.docx')));
  zip.file('word/document.xml', r.xml);
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', outPath, '| stamp', r.derived.stamp.amount, '| blank', r.report.blank.join(', ') || '-',
    '| bad ids', r.report.invalidIds.join(', ') || '-');
})();
