import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../litigation-tools/certified-id-copy.html', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('../litigation-tools/index.html', import.meta.url), 'utf8');
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

test('self-contained: no external scripts, styles or fetches, and the script parses', () => {
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('client data never reaches storage: only style settings are saved', () => {
  const save = extract('save');
  assert.match(save, /purpose: S\.purpose, wm: S\.wm, cert: S\.cert, page: S\.page/);
  assert.doesNotMatch(save, /name|date|sides|l1|l2/);
  assert.equal((script.match(/localStorage\.setItem/g) || []).length, 1);
});

test('the PDF carries no /Info dictionary (no name or title in metadata)', () => {
  assert.doesNotMatch(extract('jpegToPdf'), /\/Info|\/Title|\/Author/);
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

test('card is warped to ISO/IEC 7810 ID-1 and the page is A4 at 300 dpi', () => {
  assert.match(script, /CARD_W = 85\.6, CARD_H = 54/);
  assert.match(script, /A4_W = 210, A4_H = 297/);
  assert.match(script, /EXPORT_PXMM = 300 \/ 25\.4/);
  assert.match(html, /@page\{size:A4 portrait;margin:0;\}/);
});

test('controls the script reads are present and IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of script.matchAll(/\$\('([A-Za-z0-9]+)'\)/g)) assert.ok(ids.includes(id[1]), '#' + id[1] + ' exists');
});

test('registered in the litigation hub and the root index', () => {
  assert.match(hub, /href="certified-id-copy\.html"/);
  assert.match(mainHub, /Certified ID Copy/);
  assert.match(mainHub, /รับรองสำเนาถูกต้อง/);
});
