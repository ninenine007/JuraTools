#!/usr/bin/env node
/* Fill อ.ส.4 from a JSON input with the same engine and assets the page uses.

     node fill.js input.json [out-dir] [--flatten]   → out-dir/<fileName>.pdf per form, report on stdout

   --flatten writes the print-ready file (values drawn on the page, no form fields).

   The input is the engine's (and the MCP tool's) — see os4-engine.js plan(). Used by the
   regression check (refilling the firm's own forms, kept outside the repo) and to make the
   skill's examples. */
'use strict';
const fs = require('fs');
const path = require('path');
const OS4 = require('./os4-engine.js');

const A = path.join(__dirname, 'assets');

async function engine() {
  const createHarfBuzz = require(path.join(A, 'hb.js'));
  const hbjs = require(path.join(A, 'hbjs.js'));
  const hb = hbjs(await createHarfBuzz({ wasmBinary: fs.readFileSync(path.join(A, 'hb.wasm')) }));
  return OS4.create({
    pdf: new Uint8Array(fs.readFileSync(path.join(A, 'OS4_150861.pdf'))),
    font: new Uint8Array(fs.readFileSync(path.join(A, 'NotoSansThaiLooped-Regular.ttf'))),
    fieldmap: JSON.parse(fs.readFileSync(path.join(__dirname, 'fieldmap.json'), 'utf8')),
    fontinfo: JSON.parse(fs.readFileSync(path.join(__dirname, 'fontinfo.json'), 'utf8')),
    hb
  });
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--flatten');
  const flatten = process.argv.includes('--flatten');
  const [inputPath, outDir = '.'] = args;
  if (!inputPath) { console.error('usage: node fill.js input.json [out-dir]'); process.exit(2); }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const r = await engine();
  let result;
  try { result = OS4.plan(input); } catch (e) {
    if (e.input) { console.error('Input problem — ' + e.message); process.exit(2); }
    throw e;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const files = result.forms.map(form => {
    const layout = r.layoutForm(form);
    const bytes = r.pdf(form, layout, { flatten });
    const file = path.join(outDir, form.fileName);
    fs.writeFileSync(file, bytes);
    return { file, bytes: bytes.length, condensed: layout.condensed, overflow: layout.overflow, missing: layout.missing };
  });
  console.log(JSON.stringify({ files, stampDuty: result.stampDuty, notes: result.notes, warnings: result.warnings, blank: result.blank }, null, 1));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { engine };
