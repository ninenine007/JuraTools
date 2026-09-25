/* หนังสือมอบอำนาจให้ฟ้องคดี · Power of attorney to sue
   The browser tool ../litigation-tools/power-of-attorney.html is the source of
   truth. This module runs its engine (src/pwa-engine.cjs) on its data
   (templates/power-of-attorney.json), both copied verbatim by
   `npm run sync-templates`, so a document produced here and one exported there
   are the same document. The engine also owns the input mapping (fromInput),
   the stamp duty and the report — nothing is re-implemented here. */
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const PWAEngine = require('./pwa-engine.cjs');
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'power-of-attorney.json');

let loaded = null;
export async function loadPwa() {
  if (!loaded) loaded = JSON.parse(await readFile(DATA, 'utf8'));
  return loaded;
}

/* input: the MCP tool's arguments (English keys). */
export async function buildPowerOfAttorney(input) {
  const D = await loadPwa();
  const state = PWAEngine.fromInput(input);
  const r = PWAEngine.build(D, state);
  if (r.leftover.length) throw new Error('template markers left in the document: ' + r.leftover.join(' '));
  const zip = await JSZip.loadAsync(D.tpl, { base64: true });
  zip.file('word/document.xml', r.xml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, xml: r.xml, state: r.state, derived: r.derived, report: r.report, fileName: PWAEngine.fileName(state) };
}

/* The MCP tool's work, shared by every server that runs this module (the
   firm's Python MCP server runs it through Node): the document, its file name,
   the stamp duty and what the lawyer must be told. */
export async function powerOfAttorneyJob(args) {
  const r = await buildPowerOfAttorney(args);
  const d = r.derived.stamp;
  return {
    baseName: (args.fileName && String(args.fileName).trim()) || r.fileName.replace(/\.docx$/, ''),
    buffer: r.buffer,
    fileSizeKB: Math.round(r.buffer.length / 1024),
    stamp: d,
    stampDuty: { scheduleItem: d.item, attorneys: d.attorneys, principals: d.principals, computedBaht: d.auto, printed: d.amount, overridden: d.overridden },
    report: r.report
  };
}
