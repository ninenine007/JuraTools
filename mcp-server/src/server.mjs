#!/usr/bin/env node
/* Local use: one lawyer, on their own machine, documents saved to a folder. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer } from './tools.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.JURATOOLS_OUT_DIR || join(root, 'out');

/* A document already written may have been sent out, so a second call with the
   same parties and date lands beside it rather than on top of it. */
async function freePath(dir, base) {
  for (let i = 0; ; i++) {
    const path = join(dir, i ? `${base} (${i + 1}).docx` : `${base}.docx`);
    try { await access(path); } catch { return path; }
  }
}

const deliver = async (base, buf) => {
  await mkdir(OUT_DIR, { recursive: true });
  const path = await freePath(OUT_DIR, base);
  await writeFile(path, buf);
  return `Saved to ${path}`;
};

const server = createMcpServer({ deliver });
await server.connect(new StdioServerTransport());
