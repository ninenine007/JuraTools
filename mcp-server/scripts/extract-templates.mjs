#!/usr/bin/env node
/* The .docx templates live as one base64 line inside the browser tools, which
   stay single-file by design. Pulling them out on demand keeps those tools the
   single source of truth — a hand-copied template would silently go stale the
   next time the firm's precedent changes. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(root, '..', 'corporate-tools');

const SOURCES = [
  ['share-transfer-instrument.html', 'share-transfer-instrument.b64'],
  ['share-certificate.html', 'share-certificate.b64']
];

for (const [src, out] of SOURCES) {
  const html = await readFile(join(tools, src), 'utf8');
  const m = html.match(/const TEMPLATE_B64 = "([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error(`TEMPLATE_B64 not found in ${src}`);
  await writeFile(join(root, 'templates', out), m[1]);
  console.log(`${out.padEnd(34)} ${(m[1].length / 1024).toFixed(0)} KB  ← ${src}`);
}
