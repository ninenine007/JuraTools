import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../document-automation/certified-id-copy.html', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../document-automation/index.html', import.meta.url), 'utf8');
const mainHub = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

// Pull a top-level `function name(...) {...}` out of the IIFE by brace matching.
function extract(name) {
  const start = script.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' is defined');
  let i = script.indexOf('{', start), depth = 0;
  for (; i < script.length; i++) {
    if (script[i] === '{') depth++;
    else if (script[i] === '}' && --depth === 0) break;
  }
  return script.slice(start, i + 1);
}

test('no network beyond the house JSZip, and the script parses', () => {
  const ext = [...html.matchAll(/<(?:script|link)[^>]+https?:\/\/[^"']+/gi)].map((m) => m[0]);
  assert.deepEqual(ext, ['<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js']);
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('client data never reaches storage: only style settings are saved', () => {
  const save = extract('save');
  assert.match(save, /purpose: S\.purpose, wm: S\.wm, cert: S\.cert, page: S\.page/);
  assert.doesNotMatch(save, /name|date|sides|l1|l2/);
  assert.equal((script.match(/localStorage\.setItem/g) || []).length, 1);
});

test('the .docx anchors everything to the page and writes no core properties', () => {
  const build = extract('buildDocx');
  assert.doesNotMatch(build, /docProps|core\.xml/);
  assert.match(extract('wAnchor'), /positionH relativeFrom="page"[\s\S]*positionV relativeFrom="page"/);
  assert.doesNotMatch(script, /relativeFrom="(?:paragraph|column)"/);
  assert.match(build, /w:w="11906" w:h="16838"/);          // A4 in twips
  assert.match(script, /name: 'TH SarabunPSK', word: 'TH SarabunPSK'/);
});

test('homography maps the output rectangle onto the chosen quad', () => {
  const ctx = vm.createContext({ Math });
  vm.runInContext(extract('solve') + extract('homography') + ';this.homography=homography;', ctx);
  const quad = [[120, 80], [930, 140], [900, 700], [90, 620]];
  const W = 1011, H = 638;
  const h = ctx.homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
  const map = (u, v) => { const w = h[6] * u + h[7] * v + 1; return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w]; };
  [[0, 0], [W, 0], [W, H], [0, H]].forEach((p, i) => {
    const [x, y] = map(...p);
    assert.ok(Math.abs(x - quad[i][0]) < 1e-6 && Math.abs(y - quad[i][1]) < 1e-6, 'corner ' + (i + 1));
  });
});

test('card is warped to ISO/IEC 7810 ID-1 and embedded at 300 dpi, 1 mm = 36000 EMU', () => {
  assert.match(script, /CARD_W = 85\.6, CARD_H = 54/);
  assert.match(script, /A4_W = 210, A4_H = 297/);
  assert.match(script, /EXPORT_PXMM = 300 \/ 25\.4/);
  assert.match(script, /EMU_MM = 36000/);
});

test('controls the script reads are present and IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of script.matchAll(/\$\('([A-Za-z0-9]+)'\)/g)) assert.ok(ids.includes(id[1]), '#' + id[1] + ' exists');
});

test('registered in the document automation hub and the root index', () => {
  assert.match(hub, /href="certified-id-copy\.html"/);
  assert.match(mainHub, /Certified ID Copy/);
  assert.match(mainHub, /รับรองสำเนาถูกต้อง/);
});
